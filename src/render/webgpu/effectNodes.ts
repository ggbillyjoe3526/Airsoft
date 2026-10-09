import * as THREE from 'three';
import { MeshBasicNodeMaterial, type NodeFrame, PointsNodeMaterial } from 'three/webgpu';
import {
  attribute,
  bufferAttribute,
  dynamicBufferAttribute,
  float,
  fract,
  length,
  materialColor,
  materialOpacity,
  materialPointSize,
  min,
  modelViewMatrix,
  positionLocal,
  screenDPR,
  sin,
  cos,
  smoothstep,
  uniform,
  uv,
  varying,
  vec2,
  vec3,
  vec4,
} from 'three/tsl';
import { FIXTURES } from '../../config/render';
import { PHASE } from '../lightFixtures';
import { objectFloat, patchUniforms } from './twinUniforms';

/**
 * The node twins of the world's shader-moved effects (WebGPU overhaul W2): the fires' flames (render/lightFixtures.ts),
 * the chimney smoke and the vents' steam (render/smokePlumes.ts), and the materials of the point sprites that stand in
 * for the stars, embers, fireflies and dust motes on the node path (render/webgpu/pointSprites.ts: WebGPU draws a point
 * one pixel wide, so a sized point is a quad per point there). Each does what its GLSL does, with the same config
 * numbers (rounded as the GLSL writes them) and the patch's own uniforms: the fixtures' clock, the motes' size cap.
 */

/* eslint-disable @typescript-eslint/no-explicit-any -- TSL's node types don't follow its own swizzles and helpers. */
type AnyNode = any;

const F = FIXTURES;
const r = (x: number, digits: number): number => Number(x.toFixed(digits));

/** Copies a plain material's settings onto its node twin, as Three's node library does for a material it converts. */
export function copyOnto<T extends THREE.Material>(from: THREE.Material, to: T): T {
  const source = from as unknown as Record<string, unknown>;
  const target = to as unknown as Record<string, unknown>;
  for (const key in source) target[key] = source[key];
  return to;
}

/** The flicker curve (lightFixtures.ts flicker and its GLSL fxFlicker) at seed `seed` and clock `t`. */
function fxFlicker(seed: AnyNode, t: AnyNode): AnyNode {
  const { rates, weights } = F.flicker;
  let sum: AnyNode = float(0);
  for (let i = 0; i < rates.length; i++) sum = sum.add(sin(t.mul(r(rates[i]!, 4)).add(seed.mul(r(PHASE[i]!, 4)))).mul(r(weights[i]!, 4)));
  return sum;
}

/**
 * The flames and lantern panes: each card's top sways and its colour flickers by its vertex's `flicker` (seed, amount,
 * sway), on the fixtures' clock (`fxTime`). Additive, unfogged, one pass, as the plain material says.
 */
export function flamesTwin(plain: THREE.Material): MeshBasicNodeMaterial {
  const twin = copyOnto(plain, new MeshBasicNodeMaterial());
  const t = objectFloat('fxTime');
  const fx = attribute('flicker', 'vec3');
  const [sway0, sway1] = F.fire.flames.swayRates;
  twin.positionNode = positionLocal.add(vec3(fx.z.mul(sin(t.mul(r(sway0, 3)).add(fx.x.mul(r(PHASE[1], 3))))), 0, fx.z.mul(cos(t.mul(r(sway1, 3)).add(fx.x)))));
  const k = varying(float(1).add(fx.y.mul(fxFlicker(fx.x, t))));
  twin.colorNode = materialColor.mul(vec4(vec3(k), 1));
  return twin;
}

/** The smoke and steam puffs: each instance's `puffAlpha` (the CPU's fade over its life) on the sprite's alpha. */
export function smokeTwin(plain: THREE.Material): MeshBasicNodeMaterial {
  const twin = copyOnto(plain, new MeshBasicNodeMaterial());
  twin.opacityNode = materialOpacity.mul(attribute('puffAlpha', 'float'));
  return twin;
}

/** The point clouds that become sprites on the node path, by their patch (program key, or the motes' size cap). */
export type PointKind = 'stars' | 'embers' | 'fireflies' | 'motes';

/** What a Points' material is, or null for one with no twin (drawn by Three's node library, a pixel a point). */
export function pointKind(material: THREE.Material): PointKind | null {
  const key = material.customProgramCacheKey();
  if (key === 'night-sky-stars') return 'stars';
  if (key === 'light-fixtures-embers') return 'embers';
  if (key === 'fireflies') return 'fireflies';
  if ('moteMaxSize' in patchUniforms(material)) return 'motes';
  return null;
}

/** One of a sprite twin's per-point buffers: the Points' own array, read per instance, sent again when the CPU changes it. */
export interface SharedBuffer {
  readonly from: THREE.BufferAttribute;
  readonly buffer: THREE.InstancedInterleavedBuffer;
  seen: number;
}

/** A per-instance read of the Points' attribute `name` (its own array, no copy); null when the geometry has none. */
function perPoint(geometry: THREE.BufferGeometry, name: string, buffers: SharedBuffer[]): AnyNode {
  const from = geometry.getAttribute(name) as THREE.BufferAttribute | undefined;
  if (!from) return null;
  const buffer = new THREE.InstancedInterleavedBuffer(from.array, from.itemSize);
  buffers.push({ from, buffer, seen: from.version });
  const type = ['float', 'vec2', 'vec3', 'vec4'][from.itemSize - 1]!;
  return from.usage === THREE.DynamicDrawUsage ? dynamicBufferAttribute(buffer, type) : bufferAttribute(buffer, type);
}

/** The view's half height in CSS pixels: what WebGL's point `scale` is (the sizes a point is attenuated by). */
const halfHeight = new THREE.Vector2();

/**
 * The sprite material standing in for a Points' material of kind `kind`: the same colour, map, size, opacity and
 * blending, its per-point attributes read per instance (`buffers` collects them for the per-frame resend), and the
 * patch's extra: the stars' own sizes and round edge, the embers' rise and fade on the fixtures' clock, the fireflies'
 * pulse, the motes' size cap in device pixels. `uv` is the quad's (gl_PointCoord's, mirrored in y: every mask is round).
 */
export function spriteTwin(points: THREE.Points, kind: PointKind, buffers: SharedBuffer[]): PointsNodeMaterial {
  const plain = points.material as THREE.PointsMaterial;
  const twin = new PointsNodeMaterial();
  twin.color = plain.color;
  twin.map = plain.map;
  twin.size = plain.size;
  twin.sizeAttenuation = plain.sizeAttenuation;
  twin.opacity = plain.opacity;
  twin.transparent = plain.transparent;
  twin.blending = plain.blending;
  twin.depthWrite = plain.depthWrite;
  twin.depthTest = plain.depthTest;
  twin.fog = plain.fog;
  twin.alphaTest = plain.alphaTest;
  twin.name = `${plain.name || kind}-sprites`;
  const geometry = points.geometry;
  const uniforms = patchUniforms(plain);
  let centre: AnyNode = perPoint(geometry, 'position', buffers);
  const colour = plain.vertexColors ? perPoint(geometry, 'color', buffers) : null;
  if (colour) twin.colorNode = materialColor.mul(geometry.getAttribute('color').itemSize === 4 ? colour : vec4(colour, 1));
  const round = (inner: number): AnyNode => smoothstep(0.5, inner, length(uv().sub(vec2(0.5))));
  let alpha: AnyNode = null;
  if (kind === 'stars') {
    twin.sizeNode = materialPointSize.mul(perPoint(geometry, 'starSize', buffers));
    alpha = round(0.2);
  } else if (kind === 'embers') {
    const clock = uniforms.fxTime as THREE.IUniform<number>;
    const t = uniform(clock.value).onRenderUpdate(() => clock.value);
    const ember = perPoint(geometry, 'ember', buffers);
    const E = F.embers;
    const life: AnyNode = fract(t.div(r(E.life, 3)).mul(ember.w).add(ember.x)).toVar();
    const spread = r(E.spread, 3);
    centre = centre.add(vec3(ember.y.mul(life).mul(spread).add(sin(t.mul(r(E.wobbleRate, 3)).add(ember.x.mul(6.2832))).mul(r(E.wobble, 3))), life.mul(r(E.rise, 3)), ember.z.mul(life).mul(spread)));
    alpha = varying(float(1).sub(life).mul(smoothstep(0.0, 0.08, life))).mul(round(0.15));
  } else if (kind === 'fireflies') {
    alpha = varying(perPoint(geometry, 'flyAlpha', buffers));
  } else {
    // Dust motes: the attenuated size worked out here, as WebGL does, then capped at the patch's `moteMaxSize`.
    const cap = uniforms.moteMaxSize as THREE.IUniform<number>;
    const maxSize = uniform(cap.value).onRenderUpdate(() => cap.value);
    const scale = uniform(1).onRenderUpdate((frame: NodeFrame) => frame.renderer!.getSize(halfHeight).y * 0.5);
    const depth = modelViewMatrix.mul(vec4(centre, 1)).z.negate();
    twin.sizeAttenuation = false;
    twin.sizeNode = min(materialPointSize.mul(screenDPR).mul(scale.div(depth)), maxSize).div(screenDPR);
  }
  twin.positionNode = centre;
  if (alpha) twin.opacityNode = materialOpacity.mul(alpha);
  return twin;
}
/* eslint-enable @typescript-eslint/no-explicit-any */

