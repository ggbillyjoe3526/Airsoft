import { DRESSING, type JunkKind } from '../config/dressing';
import { SURFACES } from '../config/render';
import type { GlowStrip, JunkMix, MapBlock, MapData, NeonSign } from '../map/mapTypes';
import { terrainHeightAt } from '../map/terrain';
import { createRng, rngNext, type RngState } from '../sim/rng';
import { at, bottom, boxHitsBlock, type ClearSpot, clearOfPlay, clearSpots, floorUnder, frontRect, half, type JunkPiece, junkRect, type Rect, top } from './dressingSpots';
import { atlasRects, coveredAbove, type DecalQuad, decalBlocked, decalQuads } from './mapDecals';
import { type Poster, placePosters } from './streetDressing';
import { type FallenPiece, type LeafDrift, placeWoods } from './woodsDressing';

/**
 * Where a map's set dressing goes (G8, MapData.dressing): pure, seeded and read by the tests. Everything here is look
 * only: physics, nav, cover, sight and sound read `map.blocks`, which this never changes. The rules (DRESSING):
 * - dirt banked at the feet of blocks standing on a floor, in slots along each face clear of its corners;
 * - loose junk in some of those slots, against the face (its footprint within `reach`), never taller than `maxHeight`,
 *   on a floor and under nothing, clear of every lane, spawn, dead zone, the flag and the Extraction spots, with
 *   `openFront` of floor clear in front of it so it never narrows a passage or doorway below that;
 * - litter on open floor, logos on some containers' long sides, sprays and warning signs on some bays of wall;
 * - puddles where the map puts them (dropped when not on a floor or under a block) and its glow strips as given.
 * G9 adds, each only where a map's data asks: a street's mix of junk, a wood's floor on terrain (render/woodsDressing.ts:
 * leaf drifts, fallen branches and logs), puddles and mud on terrain, posters (render/streetDressing.ts) and neon signs.
 */

const D = SURFACES.decals;
const C = SURFACES.container;
const COPING = SURFACES.wallCoping;
const J = DRESSING.junk;
const K = DRESSING.clutter;
const X = DRESSING.decals;

export { boxHitsBlock, clearOfPlay, clearSpots, floorUnder, frontRect, junkRect } from './dressingSpots';
export type { ClearSpot, JunkPiece } from './dressingSpots';

/** A puddle placed on its floor: the middle at the floor's top plus DRESSING.puddles.lift. */
export interface PlacedPuddle {
  x: number;
  y: number;
  z: number;
  width: number;
  depth: number;
  /** Its outline's seed. */
  seed: number;
  /** G9: wet mud, not water. */
  mud?: boolean;
  /** G9: on terrain: the mesh lays each vertex on the ground. */
  draped?: boolean;
}

/** Everything a map's dressing draws on the field (the skyline and the effects are placed by their own modules). */
export interface DressingLayout {
  /** Extra quads for the decal mesh (render/mapDecals.ts buildMapDecals). */
  decals: DecalQuad[];
  junk: JunkPiece[];
  puddles: PlacedPuddle[];
  strips: readonly GlowStrip[];
  /** G9: a wood's fallen branches, twigs and logs, and its leaf drifts. */
  fallen: FallenPiece[];
  leaves: LeafDrift[];
  /** G9: posters on street walls, and the map's neon signs as given. */
  posters: Poster[];
  neon: readonly NeonSign[];
}


/** A kind of junk drawn by the mix's weights (DRESSING.junk: `weights` a yard's, `street` a city's) from `u` in [0, 1). */
function pickKind(u: number, mix: JunkMix = 'yard'): JunkKind {
  const weights = mix === 'street' ? J.street : J.weights;
  const kinds = (Object.keys(weights) as JunkKind[]).filter((k) => weights[k] > 0);
  let pick = u * kinds.reduce((n, k) => n + weights[k], 0);
  for (const k of kinds) {
    pick -= weights[k];
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
  if (!d) return { decals: [], junk: [], puddles: [], strips: [], fallen: [], leaves: [], posters: [], neon: [] };
  const rng = createRng(d.seed);
  const out: DressingLayout = { decals: [], junk: [], puddles: [], strips: d.strips ?? [], fallen: [], leaves: [], posters: [], neon: d.neon ?? [] };
  const cells = atlasRects(size).dressing;
  if (d.clutter) placeClutter(map, d.clutter, rng, cells, out);
  if (d.marks) placeMarks(map, d.marks, rng, cells, out, size);
  for (const [i, p] of (d.puddles ?? []).entries()) {
    const r: Rect = [p.x - p.width / 2, p.x + p.width / 2, p.z - p.depth / 2, p.z + p.depth / 2];
    const look = p.mud ? { mud: true } : {};
    // G9: on terrain (no floor under it), on the ground everywhere under it, with no block over or in it.
    const ground = map.terrain ? terrainUnder(map, r) : undefined;
    if (ground !== undefined) {
      if (!boxHitsBlock(map.blocks, r, ground - 1, Infinity)) out.puddles.push({ x: p.x, y: ground, z: p.z, width: p.width, depth: p.depth, seed: d.seed * 31 + i, ...look, draped: true });
      continue;
    }
    // The highest floor holding it, under nothing at all.
    const floors = map.blocks.filter((b) => b.kind === 'floor' && floorUnder([b], r, top(b)));
    const floor = floors.sort((a, b) => top(b) - top(a))[0];
    if (!floor || coveredAbove(map.blocks, floor, [r[0], r[2]], [r[1], r[3]], top(floor), Infinity)) continue;
    out.puddles.push({ x: p.x, y: top(floor) + DRESSING.puddles.lift, z: p.z, width: p.width, depth: p.depth, seed: d.seed * 31 + i, ...look });
  }
  if (d.woods) Object.assign(out, placeWoods(map, d.woods, d.seed));
  if (d.posters) out.posters = placePosters(map, d.posters, d.seed, [...decalQuads(map, size), ...out.decals], out.neon);
  return out;
}

/** The terrain's height under a rectangle's middle, if the terrain holds all of it and no floor does; else undefined. */
function terrainUnder(map: MapData, r: Rect): number | undefined {
  const t = map.terrain!;
  const corners = [terrainHeightAt(t, r[0], r[2]), terrainHeightAt(t, r[1], r[2]), terrainHeightAt(t, r[0], r[3]), terrainHeightAt(t, r[1], r[3])];
  if (corners.some((h) => h === undefined)) return undefined;
  return terrainHeightAt(t, (r[0] + r[1]) / 2, (r[2] + r[3]) / 2);
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
            const kind = pickKind(uKind, map.dressing?.clutter?.mix);
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
  // Apart from every placed piece, and neither in the other's open front (two pieces never face each other across a
  // passage narrower than `openFront`).
  const front = frontRect(p);
  return placed.every((q) => {
    const s = junkRect(q);
    return Math.max(s[0] - r[1], r[0] - s[1], s[2] - r[3], r[2] - s[3]) >= J.gap && !overlaps(front, s) && !overlaps(frontRect(q), r);
  });
}

/** Whether two plan rectangles overlap (touching edges do not). */
function overlaps(a: Rect, b: Rect): boolean {
  return a[0] < b[1] && b[0] < a[1] && a[2] < b[3] && b[2] < a[3];
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
