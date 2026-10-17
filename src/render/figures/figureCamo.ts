import type * as THREE from 'three';
import { FIGURE } from '../../config/characters';
import { carryNodePatch, nodePatchOf } from '../nodePatch';

/**
 * The team camo (G11): blotches printed per pixel on the detailed figure's clothes and on your first-person sleeves,
 * from the drawn part's own position (FIGURE.camo). The figure's material reads which vertices wear it from a `camo`
 * attribute (render/figures/figureFinish.ts); the sleeves wear it all over (`useSleeveCamo`). Both node patches build the sums
 * below in render/webgpu/figureNodes.ts. Low draws neither: its figures and sleeves stay plain, at Low's cost.
 */

/** The vertex attribute (float) that says which pattern a vertex of the detailed figure wears: 0 none, else its seed. */
export const CAMO_ATTRIBUTE = 'camo';

/** The pattern's seed on the first-person sleeves (any value at least 1 prints; this one reads well along a forearm). */
export const SLEEVE_CAMO_SEED = 4;

/** The pattern's three crossed waves: per wave, its weights on (x, y, z) and on the seed (the phase). */
export const CAMO_WAVES: readonly (readonly [x: number, y: number, z: number, seed: number])[] = [
  [1.3, 0.7, 0, 1],
  [0, 1.1, -0.9, 1.7],
  [0.8, 0, 1.2, -1],
];
/** The warp: the position bends by `warp` × sin(its own components swizzled (y, z, x) × this + seed × CAMO_WARP_SEED). */
export const CAMO_WARP_RATE = 1.7;
export const CAMO_WARP_SEED = 2.3;
/** The smallest blend width (in `n`) of a blotch's edge, so a flat stretch never divides by nothing. */
export const CAMO_EDGE_MIN = 1e-4;

/**
 * The pattern's tone at (x, y, z) for `seed`, with hard edges (the node patch's sums less its edge blend, which spans
 * one pixel's change of the waves): for tests and for reading how much of a part each tone covers.
 */
export function camoTone(x: number, y: number, z: number, seed: number): number {
  const C = FIGURE.camo;
  const k = 1 / C.scale;
  let qx = x * k;
  let qy = y * k;
  let qz = z * k;
  const wx = C.warp * Math.sin(qy * CAMO_WARP_RATE + seed * CAMO_WARP_SEED);
  const wy = C.warp * Math.sin(qz * CAMO_WARP_RATE + seed * CAMO_WARP_SEED);
  const wz = C.warp * Math.sin(qx * CAMO_WARP_RATE + seed * CAMO_WARP_SEED);
  qx += wx;
  qy += wy;
  qz += wz;
  let n = 0;
  for (const [a, b, c, s] of CAMO_WAVES) n += Math.sin(qx * a + qy * b + qz * c + seed * s);
  return n > C.darkAt ? C.dark : n < C.lightAt ? C.light : 1;
}

/**
 * Prints the camo over every pixel of `material` (the first-person sleeves on Hand detail High), from the sleeve's own
 * position at FIGURE.camo.sleeve of the figures' size, after its colour and vertex colours. Every sleeve given it shares one program. Returns it.
 */
export function useSleeveCamo<M extends THREE.MeshStandardMaterial>(material: M): M {
  return carryNodePatch(material, { kind: 'sleeve-camo' });
}

/** True if `material` prints the camo all over (useSleeveCamo). */
export function hasSleeveCamo(material: THREE.Material): boolean {
  return nodePatchOf(material)?.patch.kind === 'sleeve-camo';
}
