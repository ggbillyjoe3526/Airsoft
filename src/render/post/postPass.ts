import * as THREE from 'three';
import type { PostPassId } from './postPlan';

/** What every pass may read about the frame being drawn (filled in place by PostStack each frame: nothing allocated). */
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
}

/**
 * One pass of the post stack (G5). It draws from `read` either into `read` itself (an in-place blend: shade, shafts,
 * bloom; `inPlace`, and it returns false) or into `write`, or onto the screen when `write` is null (it returns true).
 * Only `output` and `lens` are ever last, and they always draw out.
 */
export interface PostPass {
  readonly id: PostPassId;
  /** Blends onto `read` rather than drawing out: the stack gives it no `write` and never the multisampled scene (BP2). */
  readonly inPlace: boolean;
  render(gl: THREE.WebGLRenderer, frame: PostFrame, read: THREE.WebGLRenderTarget, write: THREE.WebGLRenderTarget | null): boolean;
  /** The drawing buffer's size in pixels. */
  setSize(width: number, height: number): void;
  /** Forgets anything carried from earlier frames (the temporal history): a resize, a restored context, a cut. */
  reset?(): void;
  dispose(): void;
}

/** The vertex shader every full-screen pass shares. */
export const FULL_SCREEN_VERTEX = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

/** A full-screen shader material: no depth, no blending unless asked. */
export function fullScreenMaterial(fragmentShader: string, uniforms: Record<string, THREE.IUniform>, extra: Partial<THREE.ShaderMaterialParameters> = {}): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({ vertexShader: FULL_SCREEN_VERTEX, fragmentShader, uniforms, depthTest: false, depthWrite: false, blending: THREE.NoBlending, ...extra });
}

/** Adds onto what is there (light shafts). */
export const ADDITIVE: Partial<THREE.ShaderMaterialParameters> = { blending: THREE.AdditiveBlending, transparent: true };

/** Multiplies what is there (ambient occlusion). */
export const MULTIPLY: Partial<THREE.ShaderMaterialParameters> = {
  blending: THREE.CustomBlending,
  blendSrc: THREE.DstColorFactor,
  blendDst: THREE.ZeroFactor,
  blendEquation: THREE.AddEquation,
  blendSrcAlpha: THREE.DstAlphaFactor,
  blendDstAlpha: THREE.ZeroFactor,
  blendEquationAlpha: THREE.AddEquation,
  transparent: true,
};

/** A colour target for a pass, at `scale` of the drawing buffer. */
export function colourTarget(width: number, height: number, type: THREE.TextureDataType, scale = 1): THREE.WebGLRenderTarget {
  return new THREE.WebGLRenderTarget(scaled(width, scale), scaled(height, scale), { type, depthBuffer: false });
}

/** A size at `scale`, never below one pixel. */
export function scaled(size: number, scale: number): number {
  return Math.max(1, Math.round(size * scale));
}

/** Draws `quad` into `target` after clearing it to `colour`, keeping the renderer's own clear colour. */
export function drawCleared(gl: THREE.WebGLRenderer, quad: { render(gl: THREE.WebGLRenderer): void }, target: THREE.WebGLRenderTarget, colour: THREE.ColorRepresentation, keep: THREE.Color): void {
  gl.getClearColor(keep);
  const alpha = gl.getClearAlpha();
  gl.setRenderTarget(target);
  gl.setClearColor(colour, 1);
  gl.clear(true, false, false);
  quad.render(gl);
  gl.setClearColor(keep, alpha);
}
