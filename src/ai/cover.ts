import type { BotBehaviour } from '../config/bots';
import type { HitConfig } from '../config/hits';
import type { BodyConfig } from '../config/movement';
import type { MapBlock } from '../map/mapTypes';
import { floorAt, isWalkableAt, type NavGrid } from '../nav/navGrid';
import type { WorldQuery } from '../sim/armament';
import { leanOffset } from '../sim/lean';
import { type RngState, rngNext } from '../sim/rng';
import { copy, type Vec3, vec3 } from '../sim/vec';
import { lineClear } from './perception';

const standingEye = vec3();
const crouchedEye = vec3();
const uprightEye = vec3();
const leanEye = vec3();
const leanReach = vec3();
const offset = vec3();
/** Distances (metres) below this count as zero. */
const EPSILON = 1e-6;

/** A block's footprint on the floor: centre and half extents. */
export interface CoverBlock {
  x: number;
  z: number;
  halfX: number;
  halfZ: number;
}

/**
 * The nav floor a block stands on: of the floor heights under its footprint and one cell around it (every floor of
 * each cell), the one nearest its bottom (NaN if there are none). Reading the whole footprint, not just the centre, finds
 * the floor of a block on a platform's edge, or one whose centre is past the grid (a perimeter wall).
 */
function floorUnder(nav: NavGrid, b: MapBlock): number {
  const bottom = b.center.y - b.size.y / 2;
  const i0 = Math.max(0, Math.floor((b.center.x - b.size.x / 2 - nav.minX) / nav.cell) - 1);
  const i1 = Math.min(nav.cols - 1, Math.floor((b.center.x + b.size.x / 2 - nav.minX) / nav.cell) + 1);
  const j0 = Math.max(0, Math.floor((b.center.z - b.size.z / 2 - nav.minZ) / nav.cell) - 1);
  const j1 = Math.min(nav.rows - 1, Math.floor((b.center.z + b.size.z / 2 - nav.minZ) / nav.cell) + 1);
  let best = Number.NaN;
  for (let j = j0; j <= j1; j++) {
    for (let i = i0; i <= i1; i++) {
      const c = j * nav.cols + i;
      for (let k = nav.cellStart[c]!; k < nav.cellStart[c + 1]!; k++) {
        const f = nav.floorY[k]!;
        if (Number.isNaN(best) || Math.abs(bottom - f) < Math.abs(bottom - best)) best = f;
      }
    }
  }
  return best;
}

/**
 * Blocks standing on the floor (bottom within `floorGap` of the nav floor under them, see floorUnder) whose
 * top is between minTop and maxTop above that floor.
 */
function floorBlocks(blocks: readonly MapBlock[], nav: NavGrid, floorGap: number, minTop: number, maxTop: number): CoverBlock[] {
  const out: CoverBlock[] = [];
  for (const b of blocks) {
    if (b.kind === 'floor' || b.kind === 'ramp') continue;
    const floor = floorUnder(nav, b);
    if (Number.isNaN(floor)) continue;
    const bottom = b.center.y - b.size.y / 2 - floor;
    const top = b.center.y + b.size.y / 2 - floor;
    if (Math.abs(bottom) > floorGap || top <= minTop || top >= maxTop) continue;
    out.push({ x: b.center.x, z: b.center.z, halfX: b.size.x / 2, halfZ: b.size.z / 2 });
  }
  return out;
}

/**
 * The map's low cover: blocks standing on the floor whose top is above a crouched player's eyes but
 * below a standing player's (crates, barriers, window sills).
 */
export function lowCoverBlocks(blocks: readonly MapBlock[], nav: NavGrid, body: BodyConfig, floorGap: number): CoverBlock[] {
  return floorBlocks(blocks, nav, floorGap, body.crouchEyeHeight, body.standEyeHeight);
}

/** The map's full-height cover: blocks standing on the floor at least as tall as a player (walls, containers). */
export function tallCoverBlocks(blocks: readonly MapBlock[], nav: NavGrid, body: BodyConfig, floorGap: number): CoverBlock[] {
  return floorBlocks(blocks, nav, floorGap, body.height - EPSILON, Number.POSITIVE_INFINITY);
}

export interface CoverSpot {
  position: Vec3;
  /** True if only crouching hides you here (you can stand up to shoot over it). */
  crouchOnly: boolean;
  /** Full cover you can lean out of to see the threat: -1 lean left, 1 lean right, 0 not a lean spot. */
  lean: number;
}

export function createCoverSpot(): CoverSpot {
  return { position: vec3(), crouchOnly: false, lean: 0 };
}

/** Narrows a cover search: within `radius` metres, `randomCandidates` random tries, and optionally only spots you can peek from (crouch or lean cover). */
export interface CoverSearch {
  radius: number;
  randomCandidates: number;
  peekable: boolean;
}

/**
 * Spots a cover search must keep away from (audit AI-01): where teammates stand or are heading for cover. The first
 * `count` of `points` count; a candidate closer than `minGap` (metres) to any of them is skipped, so two bots never
 * pick the same crate corner. Filled by the caller per search, reusing its points.
 */
export interface TakenSpots {
  points: Vec3[];
  count: number;
  minGap: number;
}

/** What a cover search needs to know about the world (a BotWorld has all of it). */
export interface CoverWorld {
  nav: NavGrid;
  query: WorldQuery;
  cfg: BotBehaviour;
  body: BodyConfig;
  hits: HitConfig;
  /** The map's low blocks (lowCoverBlocks) and full-height blocks (tallCoverBlocks). */
  lowCover: readonly CoverBlock[];
  tallCover: readonly CoverBlock[];
}

/**
 * Which way (1 right, -1 left, 0 neither) a player standing at `spot`, facing `threatEye`, can lean to see
 * it: the leaned eyes (the same geometry as sim/lean.ts) must have a clear line to the threat, and room
 * to lean (no wall within cfg.leanRoomMargin past them).
 */
export function leanSideToSee(spot: Vec3, threatEye: Vec3, w: CoverWorld): number {
  const yaw = Math.atan2(-(threatEye.x - spot.x), -(threatEye.z - spot.z));
  uprightEye.x = spot.x;
  uprightEye.y = spot.y + w.body.standEyeHeight;
  uprightEye.z = spot.z;
  for (let side = 1; side >= -1; side -= 2) {
    // Right first, then left.
    leanOffset(w.body.standEyeHeight, side, 0, yaw, w.hits, offset);
    leanEye.x = uprightEye.x + offset.x;
    leanEye.y = uprightEye.y + offset.y;
    leanEye.z = uprightEye.z + offset.z;
    const sideways = Math.hypot(offset.x, offset.z);
    const k = 1 + w.cfg.leanRoomMargin / sideways;
    leanReach.x = uprightEye.x + offset.x * k;
    leanReach.y = leanEye.y;
    leanReach.z = uprightEye.z + offset.z * k;
    if (lineClear(w.query, uprightEye, leanReach) && lineClear(w.query, threatEye, leanEye)) return side;
  }
  return 0;
}

/**
 * One cover search's inputs (copied, so nothing of the caller's is kept afterwards) and best score so far:
 * a single object reused for every search, so a search allocates nothing.
 */
interface SearchState {
  from: Vec3;
  /** How far `from` is above its nav floor (a standing character's rest gap); candidate spots keep it. */
  fromAboveFloor: number;
  threatEye: Vec3;
  radius: number;
  threatDist: number;
  peekable: boolean;
  /** Spots to keep away from (undefined: none). */
  taken: TakenSpots | undefined;
  bestScore: number;
}

const searchState: SearchState = {
  from: vec3(),
  fromAboveFloor: 0,
  threatEye: vec3(),
  radius: 0,
  threatDist: 0,
  peekable: false,
  taken: undefined,
  bestScore: 0,
};
const candidateSpot = vec3();

/**
 * Looks for a nearby spot hidden from `threatEye`: random walkable points within cfg.coverRadius of
 * `from`, plus the spot right behind each low block in reach and just behind each corner of each tall
 * block in reach (as seen from the threat; random points rarely land in a crate's small shadow or a
 * hand's width from a corner). Keeps the closest that hides a crouched player, preferring spots you can
 * fight from (stand up over crouch cover, or lean out of full cover), and that doesn't mean running
 * towards the threat. `search` narrows it (default: the config's radius and candidates, any cover); no spot is
 * picked near a `taken` one. Returns false if nothing works.
 */
export function findCover(from: Vec3, threatEye: Vec3, w: CoverWorld, rng: RngState, out: CoverSpot, search?: CoverSearch, taken?: TakenSpots): boolean {
  const cfg = w.cfg;
  const s = searchState;
  s.taken = taken;
  copy(s.from, from);
  const fromFloor = floorAt(w.nav, from.x, from.y, from.z);
  s.fromAboveFloor = Number.isNaN(fromFloor) ? 0 : from.y - fromFloor;
  copy(s.threatEye, threatEye);
  s.radius = search ? search.radius : cfg.coverRadius;
  s.peekable = search ? search.peekable : false;
  s.threatDist = Math.hypot(threatEye.x - from.x, threatEye.z - from.z);
  s.bestScore = Number.POSITIVE_INFINITY;
  const radius = s.radius;
  const candidates = search ? search.randomCandidates : cfg.coverCandidates;
  for (let i = 0; i < candidates; i++) {
    const angle = rngNext(rng) * Math.PI * 2;
    const r = cfg.coverMinRadius + rngNext(rng) * (radius - cfg.coverMinRadius);
    consider(s, w, out, from.x + Math.cos(angle) * r, from.z + Math.sin(angle) * r);
  }
  for (const b of w.lowCover) {
    // Behind the block from the threat: past its far edge (along the threat→block line) by the gap.
    const dx = b.x - threatEye.x;
    const dz = b.z - threatEye.z;
    const d = Math.hypot(dx, dz);
    if (d < EPSILON || Math.hypot(b.x - from.x, b.z - from.z) > radius + cfg.lowCoverGapFar + Math.max(b.halfX, b.halfZ)) continue;
    const ux = dx / d;
    const uz = dz / d;
    const edge = Math.abs(ux) * b.halfX + Math.abs(uz) * b.halfZ;
    // Hug the block; if that's too tight to stand (another block close behind), try a step further back.
    for (let tryFar = 0; tryFar < 2; tryFar++) {
      const gap = tryFar === 0 ? cfg.lowCoverGap : cfg.lowCoverGapFar;
      const x = b.x + ux * (edge + gap);
      const z = b.z + uz * (edge + gap);
      if (!isWalkableAt(w.nav, x, s.from.y, z)) continue;
      consider(s, w, out, x, z);
      break;
    }
  }
  for (const b of w.tallCover) {
    if (Math.hypot(b.x - from.x, b.z - from.z) > radius + Math.hypot(b.halfX, b.halfZ)) continue;
    cornerSpots(s, w, out, b);
  }
  return Number.isFinite(s.bestScore);
}

/**
 * Tests the spot (x, z) for the search `s` and keeps it in `out` if it beats the best so far: it must be
 * walkable, in reach, clear of taken spots, not towards the threat, and hide a crouched player. The spot stands on its cell's
 * floor, as high above it as the searcher is above its own (so eye heights are a standing player's).
 */
function consider(s: SearchState, w: CoverWorld, out: CoverSpot, x: number, z: number): void {
  const cfg = w.cfg;
  const body = w.body;
  const from = s.from;
  const threatEye = s.threatEye;
  if (!isWalkableAt(w.nav, x, s.from.y, z)) return;
  const r = Math.hypot(x - from.x, z - from.z);
  if (r > s.radius) return;
  const taken = s.taken;
  if (taken) {
    for (let i = 0; i < taken.count; i++) {
      const p = taken.points[i]!;
      if (Math.hypot(p.x - x, p.z - z) < taken.minGap) return;
    }
  }
  // Don't pick cover that means running at the threat.
  const toThreat = Math.hypot(threatEye.x - x, threatEye.z - z);
  if (toThreat < Math.min(s.threatDist * cfg.coverTowardThreatFraction, s.threatDist - cfg.coverTowardThreatMetres)) return;

  const y = floorAt(w.nav, x, s.from.y, z) + s.fromAboveFloor;
  crouchedEye.x = x;
  crouchedEye.z = z;
  crouchedEye.y = y + body.crouchEyeHeight;
  if (lineClear(w.query, threatEye, crouchedEye)) return; // not cover at all
  standingEye.x = x;
  standingEye.z = z;
  standingEye.y = y + body.standEyeHeight;
  const crouchOnly = lineClear(w.query, threatEye, standingEye);
  candidateSpot.x = x;
  candidateSpot.y = y;
  candidateSpot.z = z;
  const lean = crouchOnly ? 0 : leanSideToSee(candidateSpot, threatEye, w);
  if (s.peekable && !crouchOnly && lean === 0) return;
  // Closest wins; cover you can fight from (stand up over it, or lean out) gets a bonus.
  const score = r - (crouchOnly ? cfg.crouchCoverBonus : lean !== 0 ? cfg.leanCoverBonus : 0);
  if (score < s.bestScore) {
    s.bestScore = score;
    out.position.x = x;
    out.position.y = y;
    out.position.z = z;
    out.crouchOnly = crouchOnly;
    out.lean = lean;
  }
}

/**
 * Lean spots at a tall block's two outline corners as seen from the threat (see cornerSpot). Each goes
 * to `consider`, which checks it properly.
 */
function cornerSpots(s: SearchState, w: CoverWorld, out: CoverSpot, b: CoverBlock): void {
  const threatEye = s.threatEye;
  const cx = b.x - threatEye.x;
  const cz = b.z - threatEye.z;
  if (Math.hypot(cx, cz) < EPSILON) return;
  // The outline corners are the ones furthest round either side of the line to the centre.
  let minA = Number.POSITIVE_INFINITY;
  let maxA = Number.NEGATIVE_INFINITY;
  let minX = 0;
  let minZ = 0;
  let maxX = 0;
  let maxZ = 0;
  for (let corner = 0; corner < 4; corner++) {
    const x = b.x + (corner & 1 ? b.halfX : -b.halfX);
    const z = b.z + (corner & 2 ? b.halfZ : -b.halfZ);
    const a = Math.atan2(cx * (z - threatEye.z) - cz * (x - threatEye.x), cx * (x - threatEye.x) + cz * (z - threatEye.z));
    if (a < minA) {
      minA = a;
      minX = x;
      minZ = z;
    }
    if (a > maxA) {
      maxA = a;
      maxX = x;
      maxZ = z;
    }
  }
  cornerSpot(s, w, out, b, minX, minZ);
  cornerSpot(s, w, out, b, maxX, maxZ);
}

/**
 * The lean spot at the corner (x, z) of tall block `b`: on the sight line from the threat past the
 * corner, moved cfg.leanSpotInset into the block's shadow, and far enough along it to stand clear of the
 * block (cfg.lowCoverGap from its sides).
 */
function cornerSpot(s: SearchState, w: CoverWorld, out: CoverSpot, b: CoverBlock, x: number, z: number): void {
  const cfg = w.cfg;
  const clear = cfg.lowCoverGap;
  const dx = x - s.threatEye.x;
  const dz = z - s.threatEye.z;
  const d = Math.hypot(dx, dz);
  if (d < EPSILON) return;
  const ux = dx / d;
  const uz = dz / d;
  // Into the shadow: perpendicular to the sight line, towards the block's centre.
  let nx = -uz;
  let nz = ux;
  if (nx * (b.x - x) + nz * (b.z - z) < 0) {
    nx = -nx;
    nz = -nz;
  }
  const px = x + nx * cfg.leanSpotInset;
  const pz = z + nz * cfg.leanSpotInset;
  // Step along the sight line until standing there clears the block: past the block's whole diagonal at most.
  const diagonal = Math.hypot(2 * b.halfX, 2 * b.halfZ);
  const maxAlong = diagonal + clear + cfg.lowCoverGapFar;
  for (let along = clear; along <= maxAlong; along += cfg.leanSpotStep) {
    const sx = px + ux * along;
    const sz = pz + uz * along;
    if (Math.abs(sx - b.x) < b.halfX + clear && Math.abs(sz - b.z) < b.halfZ + clear) continue;
    consider(s, w, out, sx, sz);
    return;
  }
}

/** True if a player crouched at `spot` (standing on its floor) is hidden from `threatEye`. */
export function hidesFrom(spot: Vec3, threatEye: Vec3, query: WorldQuery, body: BodyConfig): boolean {
  crouchedEye.x = spot.x;
  crouchedEye.y = spot.y + body.crouchEyeHeight;
  crouchedEye.z = spot.z;
  return !lineClear(query, threatEye, crouchedEye);
}
