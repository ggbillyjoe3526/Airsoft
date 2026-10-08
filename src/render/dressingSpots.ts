import { DRESSING, type JunkKind } from '../config/dressing';
import type { MapBlock, MapData } from '../map/mapTypes';

/**
 * Where a map's set dressing may stand (G8, split out in G9 so every dressing module shares it without a cycle): the
 * floor under a piece, what stands in a box, a piece's footprint and the ground it leaves clear in front of it, and the
 * spots and lanes of play everything loose keeps away from. Pure geometry over `map.blocks`: it changes nothing.
 */

const J = DRESSING.junk;

/** A piece of loose junk on the floor against a face: its middle at the floor (`y`), its face's outward normal. */
export interface JunkPiece {
  kind: JunkKind;
  x: number;
  y: number;
  z: number;
  /** The face's outward normal: along x (0) or z (2), and which way. */
  axis: 0 | 2;
  sign: 1 | -1;
  /** Footprint along the face and out from it, and height (DRESSING.junk.size). */
  along: number;
  out: number;
  height: number;
  /** A number in [0, 1) for its looks (colours, turns). */
  variant: number;
}

/** A ground rectangle (x0, x1, z0, z1). */
export type Rect = readonly [number, number, number, number];

/** A block's top, its foot, half its size along an axis and its middle along one. */
export const top = (b: MapBlock): number => b.center.y + b.size.y / 2;
export const bottom = (b: MapBlock): number => b.center.y - b.size.y / 2;
export const half = (b: MapBlock, a: 0 | 1 | 2): number => (a === 0 ? b.size.x : a === 1 ? b.size.y : b.size.z) / 2;
export const at = (b: MapBlock, a: 0 | 1 | 2): number => (a === 0 ? b.center.x : a === 1 ? b.center.y : b.center.z);

/** The floor whose top is at `y` (within a centimetre) and which holds the whole rectangle, or null. */
export function floorUnder(blocks: readonly MapBlock[], r: Rect, y: number): MapBlock | null {
  for (const b of blocks) {
    if (b.kind !== 'floor' || Math.abs(top(b) - y) > 0.01) continue;
    if (r[0] >= b.center.x - b.size.x / 2 && r[1] <= b.center.x + b.size.x / 2 && r[2] >= b.center.z - b.size.z / 2 && r[3] <= b.center.z + b.size.z / 2) return b;
  }
  return null;
}

/** True if any block but the floors stands in the box (x0, x1, y0, y1, z0, z1). */
export function boxHitsBlock(blocks: readonly MapBlock[], r: Rect, y0: number, y1: number): boolean {
  return blocks.some((b) => {
    if (b.kind === 'floor') return false;
    if (b.center.x + b.size.x / 2 <= r[0] || b.center.x - b.size.x / 2 >= r[1]) return false;
    if (b.center.z + b.size.z / 2 <= r[2] || b.center.z - b.size.z / 2 >= r[3]) return false;
    return top(b) > y0 && bottom(b) < y1;
  });
}

/** The ground rectangle of a piece of junk. */
export function junkRect(p: Pick<JunkPiece, 'x' | 'z' | 'axis' | 'along' | 'out'>): Rect {
  const hx = (p.axis === 0 ? p.out : p.along) / 2;
  const hz = (p.axis === 0 ? p.along : p.out) / 2;
  return [p.x - hx, p.x + hx, p.z - hz, p.z + hz];
}

/** The ground a piece leaves clear in front of it (DRESSING.junk.openFront out from its front edge). */
export function frontRect(p: Pick<JunkPiece, 'x' | 'z' | 'axis' | 'sign' | 'along' | 'out'>): Rect {
  const r = junkRect(p);
  const reach = J.openFront;
  if (p.axis === 0) return p.sign > 0 ? [r[1], r[1] + reach, r[2], r[3]] : [r[0] - reach, r[0], r[2], r[3]];
  return p.sign > 0 ? [r[0], r[1], r[3], r[3] + reach] : [r[0], r[1], r[2] - reach, r[2]];
}

/** Distance in plan from (x, z) to the segment a–b. */
function toSegment(x: number, z: number, ax: number, az: number, bx: number, bz: number): number {
  const dx = bx - ax;
  const dz = bz - az;
  const len = dx * dx + dz * dz;
  const t = len > 0 ? Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / len)) : 0;
  return Math.hypot(x - ax - t * dx, z - az - t * dz);
}

/** Distance in plan from (x, z) to the rectangle (0 inside it). */
const toRect = (x: number, z: number, r: Rect): number => Math.hypot(Math.max(r[0] - x, 0, x - r[1]), Math.max(r[2] - z, 0, z - r[3]));

/** A spot loose junk keeps clear of: (x, z) and how far beyond `pointClear` (an Extraction exit's radius). */
export interface ClearSpot {
  x: number;
  z: number;
  radius: number;
}

/** Every spot junk keeps `pointClear` from: spawns, dead zones, the flag and the Extraction spots. */
export function clearSpots(map: MapData): ClearSpot[] {
  const out: ClearSpot[] = [];
  const add = (p: { x: number; z: number }, radius = 0): void => void out.push({ x: p.x, z: p.z, radius });
  for (const team of [...map.spawns, ...map.deadZones]) for (const s of team) add(s.position);
  if (map.flag) add(map.flag);
  const e = map.extraction;
  if (e) {
    for (const i of e.insertions) for (const s of i.spawns) add(s.position);
    for (const x of e.exits) add(x.position, x.radius);
    for (const s of [...e.opponentStarts, ...e.cases, ...e.regens]) add(s.position);
  }
  return out;
}

/** True if the rectangle keeps `laneClear` from every lane's route and `pointClear` from every spot. */
export function clearOfPlay(map: MapData, r: Rect, spots: readonly ClearSpot[] = clearSpots(map)): boolean {
  const cx = (r[0] + r[1]) / 2;
  const cz = (r[2] + r[3]) / 2;
  const reach = Math.hypot(r[1] - r[0], r[3] - r[2]) / 2;
  for (const lane of map.lanes) {
    // A one-point lane is a spot: its one "segment" runs from the point to itself.
    for (let i = 0; i === 0 || i + 1 < lane.length; i++) {
      const a = lane[i];
      if (!a) break;
      const b = lane[i + 1] ?? a;
      if (toSegment(cx, cz, a.x, a.z, b.x, b.z) - reach < J.laneClear) return false;
    }
  }
  return spots.every((s) => toRect(s.x, s.z, r) >= J.pointClear + s.radius);
}

