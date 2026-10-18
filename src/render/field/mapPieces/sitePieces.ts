import * as THREE from 'three';
import { SURFACES, type SurfaceTextureId } from '../../../config/render';
import type { MapBlock } from '../../../map/mapTypes';
import type { Cuboid, UvMode } from '../cuboidMesh';
import { blockHash } from './blockStyles';
import { add, boundsOf, type Piece, shade } from './pieceKit';

/** The site's structures as pieces (A8): containers, walls, pallets, barriers and raised floors. */

const C = SURFACES.container;
const COPING = SURFACES.wallCoping;
const PALLET = SURFACES.pallet;
const DETAIL = SURFACES.propDetail;
/** Two blocks touch top to bottom within this (metres). */
const TOUCH = 0.01;

/**
 * A shipping container (or a row or stack of them, one block): the ribbed box set `inset` in from a darker steel
 * frame of corner posts and rails at the top, bottom and between stacked containers, posts between containers in a
 * row, and locking bars on one end. Every piece stays inside the block.
 */
export function containerPieces(block: MapBlock, color: THREE.Color, out: Piece[], detail: boolean): void {
  const b = boundsOf(block);
  const frame = color.clone().multiplyScalar(C.frameShade);
  const bars = color.clone().multiplyScalar(C.barShade);
  const piece = (min: Cuboid['min'], max: Cuboid['max'], c: THREE.Color, grime = true): void => {
    out.push({ box: { min, max }, texture: 'corrugated', uv: 'world', color: c, grime, castShadow: true });
  };
  piece([b.min[0] + C.inset, b.min[1], b.min[2] + C.inset], [b.max[0] - C.inset, b.max[1], b.max[2] - C.inset], color);
  // The long axis (0 = x, 2 = z) and the across one.
  const long = block.size.x >= block.size.z ? 0 : 2;
  const across = long === 0 ? 2 : 0;
  const levels = Math.max(1, Math.round(block.size.y / C.height));
  const levelH = block.size.y / levels;
  const span = (axis: number, from: number, to: number, a0: number, a1: number, y0: number, y1: number): [Cuboid['min'], Cuboid['max']] => {
    const min: [number, number, number] = [0, y0, 0];
    const max: [number, number, number] = [0, y1, 0];
    min[axis] = from;
    max[axis] = to;
    const other = axis === 0 ? 2 : 0;
    min[other] = a0;
    max[other] = a1;
    return [min, max];
  };
  // Rails round the top and bottom of every container in the stack, along both long sides and both ends.
  for (let level = 0; level <= levels; level++) {
    const y = b.min[1] + level * levelH;
    const y0 = Math.max(b.min[1], y - (level === 0 ? 0 : C.rail));
    const y1 = Math.min(b.max[1], y + (level === levels ? 0 : C.rail));
    for (const [axis, otherAxis] of [
      [long, across],
      [across, long],
    ] as const) {
      for (const sideAt of [b.min[otherAxis], b.max[otherAxis] - C.post]) {
        const [min, max] = span(axis, b.min[axis], b.max[axis], sideAt, sideAt + C.post, y0, y1);
        piece(min, max, frame, level === 0);
      }
    }
  }
  // Corner posts, and posts where one container in a row meets the next.
  const count = Math.max(1, Math.round(block.size[long === 0 ? 'x' : 'z'] / C.length));
  for (let i = 0; i <= count; i++) {
    const at = b.min[long] + (i / count) * (b.max[long] - b.min[long]);
    const from = Math.min(Math.max(at - C.post / 2, b.min[long]), b.max[long] - C.post);
    for (const sideAt of [b.min[across], b.max[across] - C.post]) {
      const [min, max] = span(long, from, from + C.post, sideAt, sideAt + C.post, b.min[1], b.max[1]);
      piece(min, max, frame);
    }
  }
  // Locking bars on the doors at one end (which end, from the block's hash): four per container in the stack.
  const doorAt = blockHash(block) % 2 === 0 ? b.min[long] : b.max[long] - C.inset;
  const width = b.max[across] - b.min[across];
  for (let level = 0; level < levels; level++) {
    const y0 = b.min[1] + level * levelH + C.rail;
    const y1 = b.min[1] + (level + 1) * levelH - C.rail;
    for (let k = 1; k <= 4; k++) {
      const at = b.min[across] + (k / 5) * width;
      const [min, max] = span(long, doorAt, doorAt + C.inset, at - C.bar / 2, at + C.bar / 2, y0, y1);
      piece(min, max, bars, false);
    }
    // Map detail: a lock box between the middle two bars, at handle height.
    if (detail) {
      const mid = b.min[across] + width / 2;
      const yLock = y0 + (y1 - y0) * 0.45;
      const L = DETAIL.lockBox;
      const [min, max] = span(long, doorAt, doorAt + Math.min(C.inset, L.depth + C.inset / 2), mid - L.width / 2, mid + L.width / 2, yLock, yLock + L.height);
      piece(min, max, bars, false);
    }
  }
}

/**
 * A wall: painted blocks (or its finish, M34f) under a concrete coping that stands `overhang` proud of them on both
 * faces.
 */
export function wallPieces(block: MapBlock, color: THREE.Color, out: Piece[]): void {
  const body: SurfaceTextureId = block.finish ?? 'blockWall';
  const b = boundsOf(block);
  const thin = block.size.x <= block.size.z ? 0 : 2;
  const inner = boundsOf(block);
  inner.max[1] -= COPING.height;
  inner.min[thin] += COPING.overhang;
  inner.max[thin] -= COPING.overhang;
  out.push({ box: inner, texture: body, uv: 'world', color, grime: true, castShadow: true });
  out.push({ box: { min: [b.min[0], b.max[1] - COPING.height, b.min[2]], max: b.max }, texture: 'concrete', uv: 'world', color, grime: false, castShadow: true });
}

/** How a pallet's load is painted: a crate by default. `topGap` lowers its top (room for straps over it). */
export interface PalletLoad {
  texture: SurfaceTextureId;
  uv: UvMode;
  color: THREE.Color;
  topGap: number;
}

/**
 * A crate standing on the ground: the crate on a pallet (top and bottom decks on three runners), inside its bounds.
 * `load` paints the load as something else (a wrapped pallet).
 */
export function palletPieces(block: MapBlock, color: THREE.Color, out: Piece[], detail: boolean, load?: PalletLoad): void {
  const b = boundsOf(block);
  const deck = PALLET.height;
  out.push({
    box: {
      min: [b.min[0] + PALLET.inset, b.min[1] + deck, b.min[2] + PALLET.inset],
      max: [b.max[0] - PALLET.inset, b.max[1] - (load?.topGap ?? 0), b.max[2] - PALLET.inset],
    },
    texture: load?.texture ?? 'crate',
    uv: load?.uv ?? 'perFace',
    color: load?.color ?? color,
    grime: false,
    castShadow: true,
  });
  const wood = color.clone().multiplyScalar(PALLET.shade);
  const board = PALLET.deck;
  const add = (min: Cuboid['min'], max: Cuboid['max']): void => {
    out.push({ box: { min, max }, texture: 'crate', uv: 'perFace', color: wood, grime: true, castShadow: true });
  };
  if (detail) {
    // Map detail: the top deck as separate boards with gaps between them, the runners showing through.
    const n = DETAIL.pallet.boards;
    const w = (b.max[2] - b.min[2] - (n - 1) * DETAIL.pallet.gap) / n;
    for (let k = 0; k < n; k++) {
      const z0 = b.min[2] + k * (w + DETAIL.pallet.gap);
      add([b.min[0], b.min[1] + deck - board, z0], [b.max[0], b.min[1] + deck, z0 + w]);
    }
  } else add([b.min[0], b.min[1] + deck - board, b.min[2]], [b.max[0], b.min[1] + deck, b.max[2]]);
  add([b.min[0], b.min[1], b.min[2]], [b.max[0], b.min[1] + board, b.max[2]]);
  const depth = b.max[2] - b.min[2];
  for (const at of [0, 0.5, 1]) {
    const z0 = b.min[2] + at * (depth - PALLET.runner);
    add([b.min[0], b.min[1] + board, z0], [b.max[0], b.min[1] + deck - board, z0 + PALLET.runner]);
  }
}

/** True if `block` stands on a crate (stacked crates share one pallet, under the bottom one). */
export function onCrate(block: MapBlock, blocks: readonly MapBlock[]): boolean {
  const bottom = block.center.y - block.size.y / 2;
  return blocks.some(
    (o) =>
      o !== block &&
      o.kind === 'crate' &&
      Math.abs(o.center.y + o.size.y / 2 - bottom) < TOUCH &&
      Math.abs(o.center.x - block.center.x) < (o.size.x + block.size.x) / 2 &&
      Math.abs(o.center.z - block.center.z) < (o.size.z + block.size.z) / 2,
  );
}

/**
 * A barrier with map detail: its top recessed `recess` deep inside a rim `rim` wide (moulded plastic barriers are
 * hollow), the recess shaded by the baked occlusion.
 */
export function barrierPieces(block: MapBlock, color: THREE.Color, out: Piece[]): void {
  const b = boundsOf(block);
  const R = DETAIL.barrier;
  const floor = b.max[1] - R.recess;
  add(out, b.min, [b.max[0], floor, b.max[2]], 'barrier', color);
  const rim = shade(color, R.shade);
  for (const [min, max] of [
    [[b.min[0], floor, b.min[2]], [b.max[0], b.max[1], b.min[2] + R.rim]],
    [[b.min[0], floor, b.max[2] - R.rim], [b.max[0], b.max[1], b.max[2]]],
    [[b.min[0], floor, b.min[2] + R.rim], [b.min[0] + R.rim, b.max[1], b.max[2] - R.rim]],
    [[b.max[0] - R.rim, floor, b.min[2] + R.rim], [b.max[0], b.max[1], b.max[2] - R.rim]],
  ] as [Cuboid['min'], Cuboid['max']][]) {
    add(out, min, max, 'barrier', rim, false);
  }
}

/** Whether a block is a finished floor above the ground (M34f): its finish on top, a ceiling under it. */
export function hasCeiling(block: MapBlock): boolean {
  return block.kind === 'floor' && block.finish !== undefined && block.center.y + block.size.y / 2 > SURFACES.raisedFrom;
}

/** A raised finished floor (M34f): its finish SURFACES.ceiling.depth deep on top, plastered underneath. */
export function ceilingPieces(block: MapBlock, color: THREE.Color, out: Piece[]): void {
  const b = boundsOf(block);
  const cut = b.max[1] - Math.min(SURFACES.ceiling.depth, block.size.y);
  out.push({ box: { min: b.min, max: [b.max[0], cut, b.max[2]] }, texture: 'plaster', uv: 'world', color: new THREE.Color().setHex(SURFACES.ceiling.colour, THREE.SRGBColorSpace), grime: false, castShadow: true });
  out.push({ box: { min: [b.min[0], cut, b.min[2]], max: b.max }, texture: block.finish!, uv: 'world', color, grime: false, castShadow: true });
}
