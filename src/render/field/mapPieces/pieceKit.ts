import * as THREE from 'three';
import type { SurfaceTextureId } from '../../../config/render';
import type { MapBlock } from '../../../map/mapTypes';
import type { Cuboid, UvMode } from '../cuboidMesh';
import { castsShadow, styleOf } from './blockStyles';

/** The piece builders' shared bricks (A8): a piece, a block's bounds, and the boxes and shades props are built from. */

/** The block's bounds as a cuboid (a fresh one: details shrink and slice it). */
export function boundsOf(block: MapBlock): Cuboid {
  const { center: c, size: s } = block;
  return { min: [c.x - s.x / 2, c.y - s.y / 2, c.z - s.z / 2], max: [c.x + s.x / 2, c.y + s.y / 2, c.z + s.z / 2] };
}

/** One piece of a block to draw: a cuboid with its texture and paint, cast into the shadow map or not. */
export interface Piece {
  box: Cuboid;
  texture: SurfaceTextureId;
  uv: UvMode;
  color: THREE.Color;
  grime: boolean;
  castShadow: boolean;
}

/** A block drawn as itself: one box in its kind's style (most kinds, and a finished block, M34f). */
export function plainPieces(block: MapBlock, color: THREE.Color, out: Piece[]): void {
  const style = styleOf(block);
  out.push({ box: boundsOf(block), texture: style.texture, uv: style.uv, color, grime: style.grime, castShadow: castsShadow(block) });
}

/** Pushes a box (min and max corners) painted `texture` in `color` with world UVs: the site props' building brick. */
export function add(out: Piece[], min: Cuboid['min'], max: Cuboid['max'], texture: SurfaceTextureId, color: THREE.Color, grime = true): void {
  out.push({ box: { min, max }, texture, uv: 'world', color, grime, castShadow: true });
}

/** A shade of `color` (a new colour). */
export const shade = (color: THREE.Color, k: number): THREE.Color => color.clone().multiplyScalar(k);

/** The block's long horizontal axis (0 = x, 2 = z) and the one across it. */
export function axes(block: MapBlock): [0 | 2, 0 | 2] {
  return block.size.x >= block.size.z ? [0, 2] : [2, 0];
}

/** A box spanning `a0..a1` along `along`, `c0..c1` across it and `y0..y1` up. */
export function span(along: 0 | 2, a0: number, a1: number, c0: number, c1: number, y0: number, y1: number): [Cuboid['min'], Cuboid['max']] {
  return along === 0 ? [[a0, y0, c0], [a1, y1, c1]] : [[c0, y0, a0], [c1, y1, a1]];
}
