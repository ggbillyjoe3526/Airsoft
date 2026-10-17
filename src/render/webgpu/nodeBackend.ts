import * as THREE from 'three';
import { WebGPURenderer } from 'three/webgpu';
import { FRAME_TIMING, type RetroLook } from '../../config/render';
import { RENDER_BACKEND, type RenderBackend } from '../../config/renderBackend';
import type { QualitySettings } from '../../config/render';
import type { PostSetup } from '../post/postStack';
import type { EnvironmentLook } from '../replicaSheen';
import type { DrawStats } from '../rendererParts';
import { followSwappedBuffers } from './compute/computeKit';
import { deferUniformFrees } from './deferredFrees';
import { GpuDressing } from './compute/gpuDressing';
import { ParticleTwins } from './compute/particleTwins';
import { NightLighting } from './nightLights';
import { CompileGate } from './post/nodeKit';
import { DirectOutput } from './post/nodeOutput';
import { type NodeFrameDrawer, NodePostStack, type Overlay } from './post/nodePostStack';
import { NodeRetroFilter } from './post/nodeRetro';
import { fitBrowser } from './webgpuCompat';
import { WorldTwins } from './worldTwins';

/**
 * The game's renderer (WebGPU overhaul W1, the only one since W6): Three's `WebGPURenderer`, on a WebGPU device or on
 * its own WebGL2 back end. This module and `three/webgpu` are loaded by the dynamic import in render/rendererStart.ts,
 * alongside the physics at boot, in chunks of their own beside the main chunk.
 *
 * What the Renderer (render/renderer.ts) needs of it beyond the drawing calls: the device made and initialised before
 * the first frame, a lost device reported (never logged as an error) and a new one made on request (WebGL2 when no
 * WebGPU device can be had), shaders compiled ahead at a map's load, GPU time from timestamp queries, the debug
 * overlay's counts, and everything let go on dispose. All of it is here, in this chunk, rather than in the Renderer: the
 * main chunk carries only the calls.
 *
 * The world's materials that carry a node patch (render/nodePatch.ts) draw as its node material (W2, W6b,
 * render/webgpu/worldTwins.ts: the surfaces, dressing, sky, the shader-moved effects and the figures' finish, the sized
 * points as sprites; it makes the scene's environment map too); every other material is drawn as Three's node library
 * makes it from the built-in one. The frame itself draws as
 * WebGL's does (W4, render/webgpu/post/): through the post stack's or the retro filter's TSL ports, or on Low straight
 * onto the canvas with each material tone-mapped as it draws (nodeOutput.ts), with the same draws as WebGL.
 */

const ignore = (): void => undefined;

export interface NodeBackendOptions {
  /** Multisampled (4×) canvas: fixed for the renderer's life, as a WebGL context's is. */
  antialias: boolean;
  /** The WebGL2 back end without asking for WebGPU: the WebGL pick, no adapter, or `?forceWebGL` (dev and e2e builds). */
  forceWebGL: boolean;
}

/** The one back-end flag the timer flips: whether each render pass writes timestamps (not in Three's type for Backend). */
interface TimestampSwitch {
  trackTimestamp: boolean;
}

export class NodeBackend {
  /** GPU milliseconds a frame, smoothed (FRAME_TIMING): NaN until a first result, while not timing, or without the feature. */
  gpuMs = Number.NaN;
  /** The device (or the WebGL2 context) is gone: nothing draws until a new renderer takes over (Renderer.nodeLost). */
  lost = false;
  /** The back end the renderer settled on: WebGPU, or its WebGL2 back end. */
  readonly kind: RenderBackend;
  /** The adapter offers timestamp queries ('timestamp-query'; EXT_disjoint_timer_query_webgl2 on the WebGL2 back end). */
  readonly timestamps: boolean;
  private timing = false;
  /** Frames since the last timestamp read was asked for, and whether one is still on its way back. */
  private sinceRead = 0;
  private reading = false;
  private lostListener: () => void = () => undefined;
  /** Filled by `stats`: one object, nothing allocated per read. */
  private readonly drawStats: DrawStats = { calls: 0, triangles: 0, dressingTriangles: 0, programs: 0, geometries: 0, textures: 0 };
  /** The world materials' node twins (W2), installed in the renderer's node library. */
  private readonly world: WorldTwins;
  /** The particles, moved by compute passes (W5). */
  private readonly particles: ParticleTwins;
  /** The map's grass and tree stand-ins (W5), culled each frame. */
  private readonly dressing: GpuDressing;
  /** The Renderer's quality in force (the dressing's preset). */
  private quality: QualitySettings | null = null;
  /** Whether the world may move (the Renderer's, from the match's MotionScale): the grass sways only then. */
  private motion = true;
  /** The night's clustered lights (W3) on a WebGPU device; null on the WebGL2 back end (no storage buffers to shade from). */
  private readonly lighting: NightLighting | null;
  /** Low's frame straight onto the canvas, and the held replica's on the post stack's presets (W4). */
  private readonly output = new DirectOutput();
  /** The warm-up compiles under way, which the stacks' and retro filters' frees wait for (W4). */
  private readonly compiles = new CompileGate();
  /** Uniform buffers Three freed during the frame, destroyed once it is submitted (W6a, deferredFrees.ts). */
  private readonly frees: { flush(): void };

  private constructor(
    readonly renderer: WebGPURenderer,
    private readonly options: NodeBackendOptions,
  ) {
    this.kind = (renderer.backend as { isWebGLBackend?: boolean }).isWebGLBackend ? 'webgl' : 'webgpu';
    this.timestamps = renderer.hasFeature('timestamp-query');
    followSwappedBuffers(renderer);
    this.frees = deferUniformFrees(renderer);
    this.particles = new ParticleTwins(renderer);
    this.world = new WorldTwins(renderer, this.particles.claims);
    this.dressing = new GpuDressing(renderer, this.kind === 'webgpu');
    this.lighting = this.kind === 'webgpu' ? new NightLighting(renderer) : null;
    if (this.lighting) renderer.lighting = this.lighting;
    // Three's own handler logs the loss as an error and stops the renderer for good; the game recovers instead.
    renderer.onDeviceLost = () => {
      if (this.lost) return;
      this.lost = true;
      this.lostListener();
    };
    this.track(false);
  }

  /**
   * A node renderer on a canvas of its own, initialised (the device asked for), with the game's output settings set by
   * the caller: on its WebGL2 back end when `forceWebGL`, else on WebGPU (or WebGL2, where Three falls back to it by
   * itself). Rejects when neither can be made.
   */
  static async make(options: NodeBackendOptions): Promise<NodeBackend> {
    const renderer = new WebGPURenderer({ antialias: options.antialias, powerPreference: 'high-performance', forceWebGL: options.forceWebGL });
    // A renderer whose init failed is left to the collector, not disposed: its dispose() asks for init again and leaves
    // that rejection unhandled inside Three (which the game would take for a crash), and it holds no device to free.
    await renderer.init();
    // Browsers whose WebGPU differs from what Three expects are fitted before the first frame (webgpuCompat.ts).
    await fitBrowser((renderer.backend as { device?: Parameters<typeof fitBrowser>[0] }).device);
    return new NodeBackend(renderer, options);
  }

  /** The canvas is really multisampled. */
  get antialiased(): boolean {
    return this.renderer.samples > 0;
  }

  /** The canvas's samples per pixel. */
  get samples(): number {
    return this.renderer.samples;
  }

  get maxAnisotropy(): number {
    return this.renderer.getMaxAnisotropy();
  }

  /**
   * This frame's draws and triangles (both passes) and what the renderer holds. Unlike WebGL's, the node renderer's
   * `render.calls` counts render() calls (never reset); its draws are `render.drawCalls`. The object is reused.
   */
  get stats(): DrawStats {
    const out = this.drawStats;
    const { render, memory } = this.renderer.info;
    out.calls = render.drawCalls;
    out.triangles = render.triangles;
    out.dressingTriangles = this.dressing.triangles;
    out.programs = memory.programs;
    out.geometries = memory.geometries;
    out.textures = memory.textures;
    return out;
  }

  /**
   * The pipelines the renderer has built so far, read from Three's own cache (`?perf` only, PF1: Three counts programs,
   * which a see-through variant of a material shares, but not pipelines); the program count where the cache isn't there.
   */
  get pipelinesBuilt(): number {
    const pipelines = (this.renderer as unknown as { _pipelines?: { caches?: Map<unknown, unknown> } })._pipelines;
    return pipelines?.caches?.size ?? this.renderer.info.memory.programs;
  }

  /** The WebGL2 back end's context (the diagnostics read its GPU's name from it); null on WebGPU. */
  get webglContext(): WebGL2RenderingContext | null {
    return (this.renderer.backend as { gl?: WebGL2RenderingContext }).gl ?? null;
  }

  /** The night is lit by clustered lights (W3): on a WebGPU device, not on the WebGL2 back end. */
  get clustered(): boolean {
    return this.lighting !== null;
  }

  /** The scene changed (a session's build, a quality change): the next frame looks for new sized points (W2) and pools (W5). */
  rescan(): void {
    this.world.sprites.rescan();
    this.particles.rescan();
    this.dressing.rescan();
  }

  /**
   * Before a frame's draws: after a rescan, the new particle pools get their compute drivers (W5) and the new sized
   * points their sprite twins (W2); the frame's particle passes are dispatched (W5); `scene` is the one the clustered
   * lights shade (W3). `quality` is the Renderer's, in force (the grass and stand-ins' preset, W5), and `motion` whether
   * the world may move (the grass's sway).
   */
  prepare(scene: THREE.Scene, quality: QualitySettings | null = null, motion = true): void {
    this.quality = quality;
    this.motion = motion;
    if (this.lighting) this.lighting.world = scene;
    this.particles.scan(scene);
    this.particles.frame();
    this.world.sprites.prepare(scene);
  }

  /** The post stack for `setup` on this renderer (W4): the PostHost makes and frees it as on WebGL. */
  postStack(setup: PostSetup, width: number, height: number): NodePostStack {
    return new NodePostStack(setup, width, height, this.output, this.compiles);
  }

  /** The retro filter on this renderer (W4). */
  retro(look: RetroLook): NodeRetroFilter {
    return new NodeRetroFilter(look, this.compiles);
  }

  /**
   * Draws a frame: `scene` through `drawer` (the post stack or the retro filter the Renderer holds, made here) or, with
   * neither (Low), straight onto the canvas; then the held replica over it. The Renderer prepares the scene first; the
   * map's grass and stand-ins are culled here for `camera` (W5).
   */
  draw(scene: THREE.Scene, camera: THREE.PerspectiveCamera, overlay: Overlay | undefined, drawer: object | null): void {
    this.dressing.frame(scene, camera, this.quality, this.motion);
    if (drawer) {
      this.output.standDown(this.renderer);
      (drawer as NodeFrameDrawer).draw(this.renderer, scene, camera, overlay);
    } else this.output.drawScreen(this.renderer, scene, camera, overlay);
  }

  /**
   * The sky prefiltered on this renderer for `look`, null while `on` is false or the device is lost: the scene's
   * environment map (Environment lighting, F1) and the held replica's sheen (Replica sheen, W3) share it.
   */
  environment(on: boolean, look: EnvironmentLook): THREE.Texture | null {
    return this.lost ? null : this.world.environment(on, look);
  }

  /** The settings changed: with neither the environment map nor the sheen wanted, the prefiltered sky is freed. */
  trimSky(on: boolean): void {
    this.world.trim(on);
  }

  /** `listener` is told once when the device (or the WebGL2 context) is lost. */
  onLost(listener: () => void): void {
    this.lostListener = listener;
  }

  /**
   * A new renderer on a new canvas and device with the same options, after a loss: asked `RENDER_BACKEND.recoverTries`
   * times, `recoverDelayMs` apart, until one is made or `cancelled()`; then, for a lost WebGPU device, once on the WebGL2
   * back end (Renderer.lostToWebGL). Null when none is.
   */
  async replacement(cancelled: () => boolean, make: (options: NodeBackendOptions) => Promise<NodeBackend> = NodeBackend.make): Promise<NodeBackend | null> {
    const tries: NodeBackendOptions[] = Array.from({ length: RENDER_BACKEND.recoverTries }, () => this.options);
    if (!this.options.forceWebGL) tries.push({ ...this.options, forceWebGL: true });
    for (const options of tries) {
      await new Promise((done) => setTimeout(done, RENDER_BACKEND.recoverDelayMs));
      if (cancelled()) return null;
      const next = await make(options).catch(() => null);
      if (next && cancelled()) next.dispose();
      else if (next) return next;
    }
    return null;
  }

  /** GPU timing on or off (the debug overlay): render passes write timestamps only while it is on. */
  setTiming(on: boolean): void {
    if (on === this.timing) return;
    this.timing = on;
    this.track(on);
    this.sinceRead = 0;
    if (!on) this.gpuMs = Number.NaN;
  }

  /**
   * After each frame's draws: the uniform buffers Three freed during the frame are destroyed (W6a), and every
   * `RENDER_BACKEND.timestampEvery` frames, while timing, the GPU time of the last frame whose timestamps are in is
   * read (one read on its way at a time, never waited for).
   */
  frameDone(): void {
    this.frees.flush();
    this.lighting?.flush(this.renderer);
    if (!this.timing || this.reading || !this.timestamps || this.lost) return;
    if (++this.sinceRead < RENDER_BACKEND.timestampEvery) return;
    this.sinceRead = 0;
    this.reading = true;
    this.renderer.resolveTimestampsAsync('render').then(this.timestampRead, this.timestampFailed);
  }

  /**
   * Compiles the pipelines `scene` (and the overlay) need ahead of the first frame (scope Risks: no compile stall
   * mid-round). Not waited for: what isn't ready by the first frame compiles as it draws, as before. A failure here also
   * fails that frame's draw, which reports it.
   */
  compile(scene: THREE.Scene, camera: THREE.PerspectiveCamera, overlay: Overlay | undefined, drawer: object | null, quality: QualitySettings | null = null): void {
    if (this.lost) return;
    if (this.lighting) this.lighting.world = scene;
    this.rescan();
    this.particles.scan(scene);
    this.particles.warm();
    this.world.sprites.prepare(scene);
    // The map's grass and stand-ins (W5) are made now, so their pipelines compile with the rest.
    this.quality = quality;
    this.dressing.frame(scene, camera, quality, this.motion);
    const r = this.renderer;
    // Each for the target and output step the frame draws it with (W4), so the pipelines match the frame's.
    // The direct draw's output hook stays on between Low's frames, and is taken off for a stack or the retro filter
    // (nodeOutput.ts), so a compile's draws, built after an await, are built for the context the frames draw with.
    if (drawer) this.output.standDown(r);
    const done = drawer ? (drawer as NodeFrameDrawer).compile(r, scene, camera, overlay) : this.output.compile(r, scene, camera, overlay);
    void this.compiles.track(done).catch(ignore);
  }

  /** Settles once no warm-up compile is under way (the item pictures wait for it, W6a). */
  afterCompiles(): Promise<void> {
    return this.compiles.settled();
  }

  /** Frees the renderer, its canvas's context and (on WebGPU) its device. */
  dispose(): void {
    // First: the post passes' frees held for a compile a lost device may never settle run now (BP3).
    this.compiles.release();
    this.lostListener = () => undefined;
    this.timing = false;
    this.particles.dispose();
    this.dressing.dispose();
    this.world.dispose();
    this.lighting?.dispose(this.renderer);
    this.output.dispose();
    this.frees.flush();
    this.renderer.dispose().catch(ignore);
  }

  private track(on: boolean): void {
    (this.renderer.backend as unknown as TimestampSwitch).trackTimestamp = on && this.timestamps;
  }

  private readonly timestampRead = (ms: number | undefined): void => {
    this.reading = false;
    if (!this.timing || typeof ms !== 'number' || !(ms > 0)) return;
    this.gpuMs = Number.isNaN(this.gpuMs) ? ms : this.gpuMs + (ms - this.gpuMs) * FRAME_TIMING.smoothing;
  };

  private readonly timestampFailed = (): void => {
    this.reading = false;
  };
}

/** startNode's signature, for render/rendererStart.ts (which imports this module only dynamically). */
export type NodeStart = (options: NodeBackendOptions) => Promise<NodeBackend>;

/**
 * The node renderer for a visit (render/rendererStart.ts): on WebGPU, or on WebGL2 when `forceWebGL`. Rejects when no
 * device can be made: the start then asks for WebGL2.
 */
export const startNode: NodeStart = (options) => NodeBackend.make(options);
