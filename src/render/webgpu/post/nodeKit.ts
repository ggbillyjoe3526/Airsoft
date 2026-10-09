import * as THREE from 'three';
import { NodeMaterial, QuadMesh, type WebGPURenderer } from 'three/webgpu';
import { tsl } from './tsl';
import { scaled } from '../../post/postPass';

/**
 * What the node renderer's post passes share (WebGPU overhaul W4, render/webgpu/post/): each pass is a port of its GLSL
 * pass in render/post/ to TSL, drawn the same way (a full-screen triangle per draw, the same targets, the same blends),
 * so the two paths draw the same picture with the same draws.
 *
 * The GLSL passes work in GL's texture coordinates (v up) and in GL's clip space (depth -1..1). The node renderer works
 * in its own (v down, on both of its back ends: Three flips render-target reads on WebGL2) and draws WebGPU's clip
 * space (depth 0..1) on a WebGPU device. Each port keeps its GLSL's maths in GL's coordinates: `vUv` is GL's, `at`
 * reads a render target there, and `clipAt` builds the clip position for the back end in use.
 */

/* eslint-disable @typescript-eslint/no-explicit-any -- TSL's node types don't follow its own swizzles and helpers. */
export type AnyNode = any;

const { clamp, floor, Fn, ivec2, screenCoordinate, screenSize, texture, textureSize, toneMapping, toneMappingExposure, vec2, vec3, vec4, workingToColorSpace } = tsl;

/** The node renderer's render target and the renderer itself, in the stack's terms. */
export type NodeTarget = THREE.RenderTarget;
export type NodeRenderer = WebGPURenderer;

/** GL's texture coordinates for the node renderer's (and back: the flip is its own inverse). */
export const flipV = (u: AnyNode): AnyNode => vec2(u.x, u.y.oneMinus());

/**
 * The full-screen pass's own coordinates as GL's `vUv`, from the fragment's place (GL's `gl_FragCoord`, rows from the
 * bottom, over the target's size) rather than by turning the node renderer's interpolated `uv` over: `1 - v` rounds
 * differently, and a pass at half size reads its full-size inputs exactly between two texels, where that picks the
 * other one.
 */
export const vUv: AnyNode = vec2(screenCoordinate.x, screenSize.y.sub(screenCoordinate.y)).div(screenSize);

/** `tex` (a render target's texture node) at GL coordinates `u`, mip 0 (loops and branches read it too). */
export const at = (tex: AnyNode, u: AnyNode): AnyNode => tex.sample(flipV(u)).level(0);

/**
 * Depth texture `tex` at GL coordinates `u`, as GL's nearest read takes it: the texel at `floor(u * size)`, rows from the
 * bottom, clamped to the edge. Not `at`: flipping the coordinates moves a read that falls exactly between two rows
 * (every pixel of a half-size pass) onto the other row; and Three 0.186's WebGL2 back end writes a depth read at a
 * level as the whole vec4 while typing it a float. A load is exact on both back ends (no derivatives, so it may sit in
 * loops and branches; the WebGL2 back end turns its rows over itself).
 */
export const depthAt = (tex: AnyNode, u: AnyNode): AnyNode => {
  const size = ivec2(textureSize(tex, 0));
  const p = clamp(ivec2(floor(u.mul(vec2(size)))), ivec2(0, 0), size.sub(1));
  return tex.load(ivec2(p.x, size.y.sub(1).sub(p.y))).x;
};

/** A texture node to be pointed at a target's texture each frame (`node.value = …`). */
export const slot = (): AnyNode => texture(new THREE.Texture());

/**
 * The clip-space position of GL coordinates `u` at depth-buffer value `d`: GL's `vec3(u, d) * 2 - 1` on WebGL2, and
 * `vec3(u * 2 - 1, d)` on a WebGPU device, whose depth runs 0..1. Either way the camera's own matrices undo it.
 */
export const clipAt: (u: AnyNode, d: AnyNode) => AnyNode = Fn(([u, d]: AnyNode[], builder: AnyNode) =>
  builder.renderer.coordinateSystem === THREE.WebGPUCoordinateSystem ? vec4(u.mul(2).sub(1), d, 1) : vec4(vec3(u, d).mul(2).sub(1), 1),
) as AnyNode;

/** The view-space point at GL coordinates `u` and depth `d` (the GLSL passes' `getViewPosition` and `viewAt`). */
export function viewAt(inverseProjection: AnyNode, u: AnyNode, d: AnyNode): AnyNode {
  const p = inverseProjection.mul(clipAt(u, d)).toVar();
  return p.xyz.div(p.w);
}

/** GL coordinates of view-space point `p` (the GLSL passes' `screenOf`). */
export function screenOf(projection: AnyNode, p: AnyNode): AnyNode {
  const c = projection.mul(vec4(p, 1)).toVar();
  return c.xy.div(c.w).mul(0.5).add(0.5);
}

/**
 * What WebGL's output step does to a linear colour on the way to the screen (Three's OutputPass, and every material
 * drawn straight to the canvas): tone mapping with the renderer's exposure, then sRGB encoding.
 */
export function displayOf(rgb: AnyNode, mapping: THREE.ToneMapping): AnyNode {
  return workingToColorSpace(vec4(toneMapping(mapping, toneMappingExposure, rgb).rgb, 1), THREE.SRGBColorSpace).rgb;
}

/** A full-screen node material: no depth, no blending unless `extra` asks (postPass.ts ADDITIVE, MULTIPLY). */
export function fullScreen(fragment: AnyNode, extra: object = {}): NodeMaterial {
  const m = new NodeMaterial();
  m.fragmentNode = fragment;
  m.depthTest = false;
  m.depthWrite = false;
  m.blending = THREE.NoBlending;
  Object.assign(m, extra);
  return m;
}

/** A full-screen triangle drawing whichever material it is given. */
export function quad(): QuadMesh {
  return new QuadMesh(null as unknown as NodeMaterial);
}

/** A colour target for a pass, at `scale` of the drawing buffer. */
export function colourTarget(width: number, height: number, type: THREE.TextureDataType, scale = 1): NodeTarget {
  return new THREE.RenderTarget(scaled(width, scale), scaled(height, scale), { type, depthBuffer: false });
}
