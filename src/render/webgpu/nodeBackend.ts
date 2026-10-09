import * as THREE from 'three';
import { WebGPURenderer } from 'three/webgpu';
import { FRAME_TIMING } from '../../config/render';
import { RENDER_BACKEND } from '../../config/renderBackend';
import type { EnvironmentLook } from '../replicaSheen';
import type { DrawStats } from '../rendererParts';
import { NightLighting } from './nightLights';
import { fitBrowser } from './webgpuCompat';
import { WorldTwins } from './worldTwins';

/**
 * The node renderer (WebGPU overhaul W1): Three's `WebGPURenderer`, on a WebGPU device or on its own WebGL2 back end.
 * This module and `three/webgpu` are loaded only by the dynamic import in render/rendererStart.ts, once the adapter probe
 * has found an adapter (Renderer on Auto or WebGPU) or `?forceWebGL` asks for the WebGL2 back end: neither is in the
 * main chunk, and a browser without WebGPU never downloads them.
 *
 * What the Renderer (render/renderer.ts) needs of it beyond the drawing calls both renderers share: the device made and
 * initialised before the first frame, a lost device reported (never logged as an error) and a new one made on request,
 * shaders compiled ahead at a map's load, GPU time from timestamp queries, the debug overlay's counts, the menus'
 * item pictures' own WebGL renderer, and everything let go on dispose. All of it is here, in this chunk, rather than in
 * the Renderer: the main chunk carries only the calls.
 *
 * The world's patched materials draw as their node twins (W2, render/webgpu/worldTwins.ts: the surfaces, dressing, sky
 * and the shader-moved effects, the sized points as sprites, the scene's environment map); every other material is drawn
 * as Three's node library makes it from the built-in one (the figures' finish is W3's), and the GLSL `ShaderMaterial`
 * passes (the post stack, the retro filter) are not drawn at all (W4).
 */

const ignore = (): void => undefined;

export interface NodeBackendOptions {
  /** Multisampled (4×) canvas: fixed for the renderer's life, as a WebGL context's is. */
  antialias: boolean;
  /** The WebGL2 back end without asking for WebGPU (`?forceWebGL` on the dev server and the e2e build). */
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
  readonly kind: 'webgpu' | 'webgpu-webgl2';
  /** The adapter offers timestamp queries ('timestamp-query'; EXT_disjoint_timer_query_webgl2 on the WebGL2 back end). */
  readonly timestamps: boolean;
  private timing = false;
  /** Frames since the last timestamp read was asked for, and whether one is still on its way back. */
  private sinceRead = 0;
  private reading = false;
  private lostListener: () => void = () => undefined;
  /** Filled by `stats`: one object, nothing allocated per read. */
  private readonly drawStats: DrawStats = { calls: 0, triangles: 0, programs: 0, geometries: 0, textures: 0 };
  /** The menus' item pictures' own WebGL renderer (pictureRenderer), made when one is first drawn. */
  private pictureGl: THREE.WebGLRenderer | null = null;
  /** The world materials' node twins (W2), installed in the renderer's node library. */
  private readonly world: WorldTwins;
  /** The night's clustered lights (W3) on a WebGPU device; null on the WebGL2 back end (no storage buffers to shade from). */
  private readonly lighting: NightLighting | null;

  private constructor(
    readonly renderer: WebGPURenderer,
    private readonly options: NodeBackendOptions,
  ) {
    this.kind = (renderer.backend as { isWebGLBackend?: boolean }).isWebGLBackend ? 'webgpu-webgl2' : 'webgpu';
    this.timestamps = renderer.hasFeature('timestamp-query');
    this.world = new WorldTwins(renderer);
    this.lighting = this.kind === 'webgpu' ? new NightLighting() : null;
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
   * the caller. Rejects when no device can be made; and when WebGPU was asked for but Three fell back to its WebGL2 back
   * end, which W1 doesn't draw with unasked (the game's own WebGL renderer does, unchanged).
   */
  static async make(options: NodeBackendOptions): Promise<NodeBackend> {
    const renderer = new WebGPURenderer({ antialias: options.antialias, powerPreference: 'high-performance', forceWebGL: options.forceWebGL });
    // A renderer whose init failed is left to the collector, not disposed: its dispose() asks for init again and leaves
    // that rejection unhandled inside Three (which the game would take for a crash), and it holds no device to free.
    await renderer.init();
    // Browsers whose WebGPU differs from what Three expects are fitted before the first frame (webgpuCompat.ts).
    fitBrowser((renderer.backend as { device?: Parameters<typeof fitBrowser>[0] }).device);
    const backend = new NodeBackend(renderer, options);
    if (backend.kind === 'webgpu-webgl2' && !options.forceWebGL) {
      backend.dispose();
      throw new Error('WebGPU device unavailable');
    }
    return backend;
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
    out.programs = memory.programs;
    out.geometries = memory.geometries;
    out.textures = memory.textures;
    return out;
  }

  /**
   * The WebGL renderer the menus' item pictures are drawn with (render/itemPictures.ts reads WebGL render targets): a
   * small one of their own, no canvas on the page, until W6 draws them with the node renderer.
   */
  get pictureRenderer(): THREE.WebGLRenderer {
    return (this.pictureGl ??= new THREE.WebGLRenderer());
  }

  /** The night is lit by clustered lights (W3): on a WebGPU device, not on the WebGL2 back end. */
  get clustered(): boolean {
    return this.lighting !== null;
  }

  /** The scene changed (a session's build, a quality change): the next frame looks for new sized points (W2). */
  rescan(): void {
    this.world.sprites.rescan();
  }

  /**
   * Before a frame's draws: after a rescan, the new sized points get their sprite twins (W2); `scene` is the one the
   * clustered lights shade (W3). Nothing else.
   */
  prepare(scene: THREE.Scene): void {
    if (this.lighting) this.lighting.world = scene;
    this.world.sprites.prepare(scene);
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
   * times, `recoverDelayMs` apart, until one is made or `cancelled()`; null when none is.
   */
  async replacement(cancelled: () => boolean, make: (options: NodeBackendOptions) => Promise<NodeBackend> = NodeBackend.make): Promise<NodeBackend | null> {
    for (let i = 0; i < RENDER_BACKEND.recoverTries; i++) {
      await new Promise((done) => setTimeout(done, RENDER_BACKEND.recoverDelayMs));
      if (cancelled()) return null;
      const next = await make(this.options).catch(() => null);
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
   * After each frame's draws: every `RENDER_BACKEND.timestampEvery` frames, while timing, reads the GPU time of the last
   * frame whose timestamps are in (one read on its way at a time, never waited for).
   */
  frameDone(): void {
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
  compile(scene: THREE.Scene, camera: THREE.Camera, overlay?: { scene: THREE.Scene; camera: THREE.Camera }): void {
    if (this.lost) return;
    if (this.lighting) this.lighting.world = scene;
    this.world.sprites.rescan();
    this.world.sprites.prepare(scene);
    const r = this.renderer;
    void r
      .compileAsync(scene, camera)
      .then(() => (overlay && !this.lost ? r.compileAsync(overlay.scene, overlay.camera) : undefined))
      .catch(ignore);
  }

  /** Frees the renderer, its canvas's context and (on WebGPU) its device, and the pictures' renderer. */
  dispose(): void {
    this.lostListener = () => undefined;
    this.timing = false;
    this.world.dispose();
    this.lighting?.dispose();
    this.renderer.dispose().catch(ignore);
    this.pictureGl?.dispose();
    this.pictureGl?.forceContextLoss();
    this.pictureGl = null;
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
 * The node renderer for a visit whose probe found an adapter, or that forces the WebGL2 back end
 * (render/rendererStart.ts). Throws when no device can be made: the start falls back to WebGL.
 */
export const startNode: NodeStart = (options) => NodeBackend.make(options);
