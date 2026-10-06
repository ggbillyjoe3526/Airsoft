import { DRESSING, type JunkKind } from '../config/dressing';
import { SURFACES } from '../config/render';
import type { GlowStrip, MapBlock, MapData } from '../map/mapTypes';
import { createRng, rngNext, type RngState } from '../sim/rng';
import { atlasRects, coveredAbove, type DecalQuad, decalBlocked, decalQuads } from './mapDecals';

/**
 * Where a map's set dressing goes (G8, MapData.dressing): pure, seeded and read by the tests. Everything here is look
 * only: physics, nav, cover, sight and sound read `map.blocks`, which this never changes. The rules (DRESSING):
 * - dirt banked at the feet of blocks standing on a floor, in slots along each face clear of its corners;
 * - loose junk in some of those slots, against the face (its footprint within `reach`), never taller than `maxHeight`,
 *   on a floor and under nothing, clear of every lane, spawn, dead zone, the flag and the Extraction spots, with
 *   `openFront` of floor clear in front of it so it never narrows a passage or doorway below that;
 * - litter on open floor, logos on some containers' long sides, sprays and warning signs on some bays of wall;
 * - puddles where the map puts them (dropped when not on a floor or under a block) and its glow strips as given.
 */

const D = SURFACES.decals;
const C = SURFACES.container;
const COPING = SURFACES.wallCoping;
const J = DRESSING.junk;
const K = DRESSING.clutter;
const X = DRESSING.decals;

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

/** A puddle placed on its floor: the middle at the floor's top plus DRESSING.puddles.lift. */
export interface PlacedPuddle {
  x: number;
  y: number;
  z: number;
  width: number;
  depth: number;
  /** Its outline's seed. */
  seed: number;
}

/** Everything a map's dressing draws on the field (the skyline and the effects are placed by their own modules). */
export interface DressingLayout {
  /** Extra quads for the decal mesh (render/mapDecals.ts buildMapDecals). */
  decals: DecalQuad[];
  junk: JunkPiece[];
  puddles: PlacedPuddle[];
  strips: readonly GlowStrip[];
}

const EMPTY: DressingLayout = { decals: [], junk: [], puddles: [], strips: [] };

/** A ground rectangle (x0, x1, z0, z1). */
type Rect = readonly [number, number, number, number];

const top = (b: MapBlock): number => b.center.y + b.size.y / 2;
const bottom = (b: MapBlock): number => b.center.y - b.size.y / 2;
const half = (b: MapBlock, a: 0 | 1 | 2): number => (a === 0 ? b.size.x : a === 1 ? b.size.y : b.size.z) / 2;
const at = (b: MapBlock, a: 0 | 1 | 2): number => (a === 0 ? b.center.x : a === 1 ? b.center.y : b.center.z);

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
    for (let i = 0; i + 1 < lane.length; i++) {
      const a = lane[i]!;
      const b = lane[i + 1]!;
      if (toSegment(cx, cz, a.x, a.z, b.x, b.z) - reach < J.laneClear) return false;
    }
  }
  return spots.every((s) => toRect(s.x, s.z, r) >= J.pointClear + s.radius);
}

/** A kind of junk drawn by DRESSING.junk.weights from `u` in [0, 1). */
function pickKind(u: number): JunkKind {
  const kinds = Object.keys(J.weights) as JunkKind[];
  let pick = u * kinds.reduce((n, k) => n + J.weights[k], 0);
  for (const k of kinds) {
    pick -= J.weights[k];
    if (pick < 0) return k;
  }
  return kinds[kinds.length - 1]!;
}

/** The floor quarter turn whose picture's up is the outward normal (render/mapDecals.ts DecalQuad.turn). */
function turnFacing(axis: 0 | 2, sign: 1 | -1): 0 | 1 | 2 | 3 {
  if (axis === 2) return sign < 0 ? 0 : 2;
  return sign < 0 ? 1 : 3;
}

/** A floor quad: `along` the face and `out` from it, its middle at (x, z); the picture's up pointing out. */
function floorQuad(x: number, y: number, z: number, axis: 0 | 2, sign: 1 | -1, along: number, out: number, rect: DecalQuad['rect']): DecalQuad {
  return { centre: [x, y + D.offset, z], axis: 1, sign: 1, width: along, height: out, rect, turn: turnFacing(axis, sign) };
}

/** The dressing a map's data asks for, placed (none without `dressing`). */
export function placeDressing(map: MapData, size: number = D.atlasSize): DressingLayout {
  const d = map.dressing;
  if (!d) return EMPTY;
  const rng = createRng(d.seed);
  const out: DressingLayout = { decals: [], junk: [], puddles: [], strips: d.strips ?? [] };
  const cells = atlasRects(size).dressing;
  if (d.clutter) placeClutter(map, d.clutter, rng, cells, out);
  if (d.marks) placeMarks(map, d.marks, rng, cells, out, size);
  for (const [i, p] of (d.puddles ?? []).entries()) {
    const r: Rect = [p.x - p.width / 2, p.x + p.width / 2, p.z - p.depth / 2, p.z + p.depth / 2];
    // The highest floor holding it, under nothing at all.
    const floors = map.blocks.filter((b) => b.kind === 'floor' && floorUnder([b], r, top(b)));
    const floor = floors.sort((a, b) => top(b) - top(a))[0];
    if (!floor || coveredAbove(map.blocks, floor, [r[0], r[2]], [r[1], r[3]], top(floor), Infinity)) continue;
    out.puddles.push({ x: p.x, y: top(floor) + DRESSING.puddles.lift, z: p.z, width: p.width, depth: p.depth, seed: d.seed * 31 + i });
  }
  return out;
}

type Cells = ReturnType<typeof atlasRects>['dressing'];

/** Dirt and junk along the feet of blocks, litter on open floor. */
function placeClutter(map: MapData, chance: { dirt: number; junk: number; litter: number }, rng: RngState, cells: Cells, out: DressingLayout): void {
  const blocks = map.blocks;
  const spots = clearSpots(map);
  for (const b of blocks) {
    if (b.kind === 'floor' || b.kind === 'ramp' || b.size.y < K.minHeight) continue;
    const y = bottom(b);
    for (const axis of [0, 2] as const) {
      const alongAxis: 0 | 2 = axis === 0 ? 2 : 0;
      const length = 2 * half(b, alongAxis) - 2 * K.cornerClear;
      const slots = Math.floor(length / K.step);
      if (slots < 1) continue;
      const slot = length / slots;
      for (const sign of [1, -1] as const) {
        const face = at(b, axis) + sign * half(b, axis);
        for (let i = 0; i < slots; i++) {
          // Six draws a slot, whatever happens, so one slot's outcome never shifts the next one's.
          const [uDirt, uJunk, uKind, uVariant, uShift, uBank] = [rngNext(rng), rngNext(rng), rngNext(rng), rngNext(rng), rngNext(rng), rngNext(rng)];
          const mid = at(b, alongAxis) - half(b, alongAxis) + K.cornerClear + (i + 0.5) * slot;
          if (uDirt < chance.dirt) addBank(blocks, axis, sign, face, mid, Math.min(K.bank.length, slot), y, cells.banks[Math.floor(uBank * cells.banks.length)]!, out);
          if (uJunk < chance.junk && out.junk.length < J.max) {
            const kind = pickKind(uKind);
            const [along, depth, height] = J.size[kind];
            if (along > slot) continue;
            const centreAlong = mid + (uShift - 0.5) * (slot - along);
            const centreOut = face + sign * (J.standoff + depth / 2);
            const p: JunkPiece = {
              kind,
              x: axis === 0 ? centreOut : centreAlong,
              y,
              z: axis === 0 ? centreAlong : centreOut,
              axis,
              sign,
              along,
              out: depth,
              height,
              variant: uVariant,
            };
            if (junkFits(map, blocks, p, spots, out.junk)) addJunk(p, cells, out);
          }
        }
      }
    }
  }
  // Litter: open floor in squares, each maybe a scrap, wholly inside its square and the floor, under nothing near.
  const L = K.litter;
  for (const floor of blocks) {
    if (floor.kind !== 'floor') continue;
    const y = top(floor);
    const x0 = floor.center.x - floor.size.x / 2 + L.inset;
    const x1 = floor.center.x + floor.size.x / 2 - L.inset;
    const z0 = floor.center.z - floor.size.z / 2 + L.inset;
    const z1 = floor.center.z + floor.size.z / 2 - L.inset;
    for (let ix = Math.floor(x0 / L.cell); ix * L.cell < x1; ix++) {
      for (let iz = Math.floor(z0 / L.cell); iz * L.cell < z1; iz++) {
        const [u, ux, uz, uTurn, uPic] = [rngNext(rng), rngNext(rng), rngNext(rng), rngNext(rng), rngNext(rng)];
        if (u >= chance.litter) continue;
        const lo = [Math.max(ix * L.cell, x0), Math.max(iz * L.cell, z0)] as const;
        const hi = [Math.min((ix + 1) * L.cell, x1), Math.min((iz + 1) * L.cell, z1)] as const;
        if (hi[0] - lo[0] < L.size || hi[1] - lo[1] < L.size) continue;
        const cx = lo[0] + L.size / 2 + ux * (hi[0] - lo[0] - L.size);
        const cz = lo[1] + L.size / 2 + uz * (hi[1] - lo[1] - L.size);
        if (coveredAbove(blocks, floor, [cx - L.size / 2, cz - L.size / 2], [cx + L.size / 2, cz + L.size / 2], y, K.clearance)) continue;
        const rect = cells.litter[Math.floor(uPic * cells.litter.length)]!;
        out.decals.push({ centre: [cx, y + D.offset, cz], axis: 1, sign: 1, width: L.size, height: L.size, rect, turn: Math.floor(uTurn * 4) as 0 | 1 | 2 | 3 });
      }
    }
  }
}

/** A bank of dirt against the face, if it lies on a floor under nothing near. */
function addBank(blocks: readonly MapBlock[], axis: 0 | 2, sign: 1 | -1, face: number, mid: number, length: number, y: number, rect: DecalQuad['rect'], out: DressingLayout): void {
  const depth = K.bank.depth;
  const o0 = Math.min(face, face + sign * depth);
  const r: Rect = axis === 0 ? [o0, o0 + depth, mid - length / 2, mid + length / 2] : [mid - length / 2, mid + length / 2, o0, o0 + depth];
  const floor = floorUnder(blocks, r, y);
  if (!floor || coveredAbove(blocks, floor, [r[0], r[2]], [r[1], r[3]], y, K.clearance)) return;
  const cOut = face + (sign * depth) / 2;
  out.decals.push(floorQuad(axis === 0 ? cOut : mid, y, axis === 0 ? mid : cOut, axis, sign, length, depth, rect));
}

/** Whether a piece of junk may stand where it is (the rules in this module's header). */
export function junkFits(map: MapData, blocks: readonly MapBlock[], p: JunkPiece, spots: readonly ClearSpot[], placed: readonly JunkPiece[]): boolean {
  const r = junkRect(p);
  const floor = floorUnder(blocks, r, p.y);
  if (!floor) return false;
  // Under nothing at all, and nothing standing in it.
  if (coveredAbove(blocks, floor, [r[0], r[2]], [r[1], r[3]], p.y, Infinity)) return false;
  // The floor stays open `openFront` in front of it (people pass there), up to head height.
  if (boxHitsBlock(blocks, frontRect(p), p.y + 0.02, p.y + 2)) return false;
  if (!clearOfPlay(map, r, spots)) return false;
  return placed.every((q) => {
    const s = junkRect(q);
    return Math.max(s[0] - r[1], r[0] - s[1], s[2] - r[3], r[2] - s[3]) >= J.gap;
  });
}

/** Junk joins the layout with its contact shadow (and grit round rubble) in the decal mesh. */
function addJunk(p: JunkPiece, cells: Cells, out: DressingLayout): void {
  out.junk.push(p);
  const c = X.contact;
  // The shadow starts at the face (none of it inside the block) and runs `contact / 2` past the piece's front.
  const length = J.standoff + p.out + c / 2;
  const face = (p.axis === 0 ? p.x : p.z) - p.sign * (J.standoff + p.out / 2);
  const mid = face + (p.sign * length) / 2;
  const along = p.axis === 0 ? p.z : p.x;
  out.decals.push(floorQuad(p.axis === 0 ? mid : along, p.y, p.axis === 0 ? along : mid, p.axis, p.sign, p.along + c, length, cells.contact));
  if (p.kind === 'rubble') {
    const g = X.grit;
    const gMid = face + (p.sign * g) / 2;
    out.decals.push(floorQuad(p.axis === 0 ? gMid : along, p.y, p.axis === 0 ? along : gMid, p.axis, p.sign, p.along + g / 2, g, cells.grit));
  }
}

/** Logos on containers, sprays and warning signs on walls. */
function placeMarks(map: MapData, chance: { logos: number; walls: number }, rng: RngState, cells: Cells, out: DressingLayout, size: number): void {
  const blocks = map.blocks;
  const taken = decalQuads(map, size).filter((q) => q.axis !== 1);
  const overlaps = (q: DecalQuad): boolean =>
    [...taken, ...out.decals].some((t) => {
      if (t.axis !== q.axis || t.sign !== q.sign || Math.abs(t.centre[q.axis] - q.centre[q.axis]) > 0.1) return false;
      const a: 0 | 2 = q.axis === 0 ? 2 : 0;
      return Math.abs(t.centre[a] - q.centre[a]) < (t.width + q.width) / 2 && Math.abs(t.centre[1] - q.centre[1]) < (t.height + q.height) / 2;
    });
  const add = (q: DecalQuad, self: MapBlock): void => {
    if (!decalBlocked(q, blocks, self, 0.3) && !overlaps(q)) out.decals.push(q);
  };
  for (const b of blocks) {
    if (b.kind === 'container') {
      const [u, uSide, uName, uShift] = [rngNext(rng), rngNext(rng), rngNext(rng), rngNext(rng)];
      if (u >= chance.logos) continue;
      const long: 0 | 2 = b.size.x >= b.size.z ? 0 : 2;
      const across: 0 | 2 = long === 0 ? 2 : 0;
      const length = 2 * half(b, long);
      const width = Math.min(X.logo.width, X.logo.share * length);
      const sign = uSide < 0.5 ? 1 : -1;
      const centre: [number, number, number] = [b.center.x, b.center.y, b.center.z];
      centre[long] = at(b, long) + (uShift - 0.5) * 2 * Math.min(X.logo.along, (length - width) / 2);
      centre[1] = bottom(b) + X.logo.y * Math.min(C.height, b.size.y);
      centre[across] = at(b, across) + sign * (half(b, across) - C.inset + D.offset);
      add({ centre, axis: across, sign, width, height: width / 4, rect: cells.logos[Math.floor(uName * cells.logos.length)]! }, b);
    } else if (b.kind === 'wall' && b.size.y >= X.wallHeight) {
      const thin: 0 | 2 = b.size.x <= b.size.z ? 0 : 2;
      const along: 0 | 2 = thin === 0 ? 2 : 0;
      const length = 2 * half(b, along);
      if (length < X.wallLength) continue;
      const bays = Math.max(1, Math.floor(length / X.bay));
      for (const sign of [1, -1] as const) {
        const face = at(b, thin) + sign * (half(b, thin) - COPING.overhang + D.offset);
        // Only a face with the field's floor in front of it (not a perimeter wall's outside).
        const front = at(b, thin) + sign * (half(b, thin) + 0.5);
        const probe: Rect = thin === 0 ? [front, front, b.center.z, b.center.z] : [b.center.x, b.center.x, front, front];
        for (let i = 0; i < bays; i++) {
          const [u, uKind, uPick, uShift] = [rngNext(rng), rngNext(rng), rngNext(rng), rngNext(rng)];
          if (u >= chance.walls || !floorUnder(blocks, probe, bottom(b))) continue;
          const bayLength = length / bays;
          const spray = uKind < X.spray.share;
          const arrow = uPick < 0.5;
          const [w, h, y, rect] = !spray
            ? [X.warning.size, X.warning.size, X.warning.y, cells.warning]
            : arrow
              ? [X.spray.arrow[0], X.spray.arrow[1], X.spray.y, cells.arrow]
              : [X.spray.tag, X.spray.tag, X.spray.y, cells.tag];
          if (y + h / 2 > b.size.y - COPING.height - 0.05 || w > bayLength - 0.4) continue;
          const centre: [number, number, number] = [b.center.x, bottom(b) + y, b.center.z];
          centre[along] = at(b, along) - length / 2 + (i + 0.5) * bayLength + (uShift - 0.5) * (bayLength - w - 0.4);
          centre[thin] = face;
          const tint = spray ? parseInt(X.spray.colours[Math.floor(uPick * 2 * X.spray.colours.length) % X.spray.colours.length]!.slice(1), 16) : undefined;
          add({ centre, axis: thin, sign, width: w, height: h, rect, ...(tint !== undefined ? { tint } : {}) }, b);
        }
      }
    }
  }
}
