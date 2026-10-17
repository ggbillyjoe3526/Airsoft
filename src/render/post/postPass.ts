import * as THREE from 'three';
import type { PostPassId } from './postPlan';

/** What every pass may read about the frame being drawn (filled in place by PostChain each frame: nothing allocated). */
export interface PostFrame {
  /** The main camera, jittered while the temporal blend is on (its projection is put back after the chain). */
  camera: THREE.PerspectiveCamera;
  /** The scene's depth (null when no pass in the plan reads it). */
  depth: THREE.DepthTexture | null;
  /** The view-projection without the jitter, and its inverse: the temporal blend reprojects with these. */
  readonly viewProjection: THREE.Matrix4;
  readonly inverseViewProjection: THREE.Matrix4;
  /** This frame's jitter as a shift of the picture in UV (0, 0 without the temporal blend): it reprojects without it. */
  readonly jitter: THREE.Vector2;
  /** Towards the key light (the sun or the moon), world space, unit length. */
  readonly sun: THREE.Vector3;
  /** A night look (the moon's shafts). */
  night: boolean;
  /** Frames drawn since the stack was made: the grain's seed. */
  index: number;
  /**
   * The warm-up's compile or draws (PF1), never shown: a pass that draws only sometimes (the shafts, while the sun or
   * moon is on screen) draws anyway, so its pipelines are built before the round.
   */
  warming: boolean;
}

/** What a pass and the stack draw with: the node renderer (WebGPU overhaul W4). */
export interface PostRenderer<T> {
  autoClear: boolean;
  setRenderTarget(target: T | null): void;
  render(scene: THREE.Object3D, camera: THREE.Camera): void;
}

/**
 * One pass of the post stack (G5). It draws from `read` either into `read` itself (an in-place blend: shade, shafts,
 * bloom; `inPlace`, and it returns false) or into `write`, or onto the screen when `write` is null (it returns true).
 * Only `output` and `lens` are ever last, and they always draw out.
 */
export interface PostPass<G, T> {
  readonly id: PostPassId;
  /** Blends onto `read` rather than drawing out: the stack gives it no `write` and never the multisampled scene (BP2). */
  readonly inPlace: boolean;
  render(gl: G, frame: PostFrame, read: T, write: T | null): boolean;
  /** The drawing buffer's size in pixels. */
  setSize(width: number, height: number): void;
  /** Forgets anything carried from earlier frames (the temporal history): a resize, a new device, a cut. */
  reset?(): void;
  dispose(): void;
}

/** Adds onto what is there (light shafts). */
export const ADDITIVE: Partial<THREE.MaterialParameters> = { blending: THREE.AdditiveBlending, transparent: true };

/** Multiplies what is there (ambient occlusion). */
export const MULTIPLY: Partial<THREE.MaterialParameters> = {
  blending: THREE.CustomBlending,
  blendSrc: THREE.DstColorFactor,
  blendDst: THREE.ZeroFactor,
  blendEquation: THREE.AddEquation,
  blendSrcAlpha: THREE.DstAlphaFactor,
  blendDstAlpha: THREE.ZeroFactor,
  blendEquationAlpha: THREE.AddEquation,
  transparent: true,
};

/** A size at `scale`, never below one pixel. */
export function scaled(size: number, scale: number): number {
  return Math.max(1, Math.round(size * scale));
}

/** What drawCleared needs of a renderer. */
export interface ClearingRenderer<T> {
  getClearColor(target: THREE.Color): THREE.Color;
  getClearAlpha(): number;
  setRenderTarget(target: T | null): void;
  setClearColor(colour: THREE.ColorRepresentation, alpha?: number): void;
  clear(colour?: boolean, depth?: boolean, stencil?: boolean): void;
}

/** Draws `quad` into `target` after clearing it to `colour`, keeping the renderer's own clear colour. */
export function drawCleared<G extends ClearingRenderer<T>, T>(gl: G, quad: { render(gl: G): void }, target: T, colour: THREE.ColorRepresentation, keep: THREE.Color): void {
  gl.getClearColor(keep);
  const alpha = gl.getClearAlpha();
  gl.setRenderTarget(target);
  gl.setClearColor(colour, 1);
  gl.clear(true, false, false);
  quad.render(gl);
  gl.setClearColor(keep, alpha);
}
