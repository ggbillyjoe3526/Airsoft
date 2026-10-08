import * as THREE from 'three';
import type { WebGPURenderer } from 'three/webgpu';
import { FRAME_TIMING } from '../config/render';
import type { RenderBackend } from '../config/renderBackend';
import { GpuTimer } from './gpuTimer';
import type { NodeBackend } from './webgpu/nodeBackend';

/** The renderer drawing the game: Three's WebGLRenderer, or the node renderer (WebGPU overhaul W1). */
export type DrawingRenderer = THREE.WebGLRenderer | WebGPURenderer;

/** This frame's draw calls and triangles, and the programs, geometries and textures held (the debug overlay). */
export interface DrawStats {
  calls: number;
  triangles: number;
  programs: number;
  geometries: number;
  textures: number;
}

/**
 * The renderer the Renderer (render/renderer.ts) draws with, and what it reports, read the same whichever it is (W1):
 * Three's WebGLRenderer, or the node renderer (render/webgpu/nodeBackend.ts) on WebGPU or its WebGL2 back end. Holds
 * the GPU timer and the item pictures' own WebGL renderer on the node path. The Renderer swaps in a new one (`use`)
 * when antialiasing changes or a device is lost; nothing here keeps a renderer the device has let go of.
 */
export class DrawingDevice {
  /** GPU time per frame on the WebGL path (REN-17), made while timing is on; null without it. */
  private gpuTimer: GpuTimer | null = null;
  /** The menus' item pictures' own WebGL renderer on the node path (pictureRenderer), made when one is first drawn. */
  private pictureGl: THREE.WebGLRenderer | null = null;
  /** Filled by `stats`: one object, nothing allocated per read. */
  private readonly drawStats: DrawStats = { calls: 0, triangles: 0, programs: 0, geometries: 0, textures: 0 };

  constructor(
    /** The renderer drawing (a new one after a swap: don't keep it). */
    public gl: DrawingRenderer,
    /** The node renderer's back end, null on the WebGL path. */
    public node: NodeBackend | null,
  ) {}

  /** A new renderer takes over (the old one is already handed over and freed). The GPU timer belongs to the old one. */
  use(gl: DrawingRenderer, node: NodeBackend | null): void {
    this.dropTimer();
    this.gl = gl;
    this.node = node;
  }

  /** Which renderer draws: WebGL, or the node renderer on WebGPU or on its WebGL2 back end. */
  get backend(): RenderBackend {
    return this.node?.kind ?? 'webgl';
  }

  /** The WebGL renderer, null on the node path. */
  get webgl(): THREE.WebGLRenderer | null {
    return this.node ? null : (this.gl as THREE.WebGLRenderer);
  }

  /**
   * The WebGL renderer the menus' item pictures are drawn with (render/itemPictures.ts): the game's own, or on the node
   * path a small one of their own (no canvas on the page), until W6 draws them with the node renderer.
   */
  get pictureRenderer(): THREE.WebGLRenderer {
    return this.webgl ?? (this.pictureGl ??= new THREE.WebGLRenderer());
  }

  /**
   * This frame's draw calls and triangles (both passes) and what the renderer holds. The WebGL renderer counts draws in
   * `render.calls`; the node renderer counts render calls there and draws in `render.drawCalls`. The object is reused.
   */
  get stats(): DrawStats {
    const out = this.drawStats;
    const info = this.gl.info;
    const gl = this.webgl;
    if (gl) {
      out.calls = gl.info.render.calls;
      out.programs = gl.info.programs?.length ?? 0;
    } else {
      const nodeInfo = (this.gl as WebGPURenderer).info;
      out.calls = nodeInfo.render.drawCalls;
      out.programs = nodeInfo.memory.programs;
    }
    out.triangles = info.render.triangles;
    out.geometries = info.memory.geometries;
    out.textures = info.memory.textures;
    return out;
  }

  /**
   * Whether the screen is really multisampled (REN-21): the context reports what it was given, and Firefox on Linux and
   * some drivers give no multisampling whatever was asked.
   */
  get antialiased(): boolean {
    if (this.node) return this.node.antialiased;
    return (this.gl as THREE.WebGLRenderer).getContext().getContextAttributes()?.antialias ?? false;
  }

  /** The canvas's samples per pixel (the debug overlay's antialiasing line). */
  get samples(): number {
    const gl = this.webgl;
    if (!gl) return (this.gl as WebGPURenderer).samples;
    const context = gl.getContext();
    return Number(context.getParameter(context.SAMPLES));
  }

  /** The most anisotropic filtering the graphics card offers (Texture filtering is clamped to it). */
  get maxAnisotropy(): number {
    return this.node ? this.node.maxAnisotropy : (this.gl as THREE.WebGLRenderer).capabilities.getMaxAnisotropy();
  }

  /**
   * The GPU's milliseconds a frame, smoothed (REN-17): NaN without the timer extension (Firefox) or while not timing. On
   * the node path, from timestamp queries where the adapter offers them (W1).
   */
  get gpuMs(): number {
    if (this.node) return this.node.gpuMs;
    return this.gpuTimer?.ms ?? Number.NaN;
  }

  /**
   * The WebGL GPU timer for this frame while `on` (made on first use, for the context in use); null otherwise. The node
   * renderer times its own passes (timestamp queries switched on and off here), so it has none.
   */
  timer(on: boolean): GpuTimer | null {
    if (this.node) {
      this.node.setTiming(on);
      return null;
    }
    if (!on) {
      if (this.gpuTimer) this.dropTimer();
      return null;
    }
    return (this.gpuTimer ??= new GpuTimer((this.gl as THREE.WebGLRenderer).getContext() as WebGL2RenderingContext, FRAME_TIMING.smoothing));
  }

  dropTimer(): void {
    this.gpuTimer?.dispose();
    this.gpuTimer = null;
  }

  /**
   * The timer's query went with a lost context: forgotten rather than deleted (an object of a lost context can't be),
   * and the next frame timed makes one on the context in use.
   */
  forgetTimer(): void {
    this.gpuTimer = null;
  }

  /** Frees the renderer and its context (or device) at once (REN-24: browsers cap live contexts), and the pictures' one. */
  dispose(): void {
    this.dropTimer();
    this.pictureGl?.dispose();
    this.pictureGl?.forceContextLoss();
    this.pictureGl = null;
    const gl = this.webgl;
    if (gl) {
      gl.dispose();
      gl.forceContextLoss();
    } else {
      this.node?.dispose();
    }
    this.gl.domElement.remove();
  }
}
