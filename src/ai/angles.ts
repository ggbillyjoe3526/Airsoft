import type { BotBehaviour } from '../config/bots';
import { foliageDepth } from '../map/foliage';
import { floorAt, isWalkableAt } from '../nav/navGrid';
import type { WorldQuery } from '../sim/armament';
import { type Vec3, vec3, wrapAngle } from '../sim/vec';
import { lookAngles } from './aim';
import type { AngleFeatures } from './angleFeatures';

const DEG = Math.PI / 180;

/**
 * Held angles (M37): where someone would step into view. A bot holding still fans rays out at eye height across the
 * enemy side and looks for an edge: a ray that stops at a wall next to one that runs on. Someone coming round that
 * corner, or through that doorway, appears just past the edge, so that is where a Pro bot aims, at head height.
 * Built from the level's geometry alone: where the enemies are never enters it. Since M40 the map's other features count
 * too (AngleFeatures): a bush's edge (a tall bush stops a ray as a wall does), a gap between two trunks or posts, and a
 * stair or ramp top on a layered floor.
 */
export interface HeldAngle {
  yaw: number;
  pitch: number;
  /** The aim point: just past the edge, at head height. */
  point: Vec3;
  /** The open side of the edge (-1 left, 1 right, as a lean): leaning that way shows a little more past it (M38). */
  side: number;
  score: number;
}

export function createHeldAngle(): HeldAngle {
  return { yaw: 0, pitch: 0, point: vec3(), side: 0, score: Number.NEGATIVE_INFINITY };
}

/** The ray fan's tuning, from BOT_BEHAVIOUR. */
type AngleConfig = Pick<
  BotBehaviour,
  'angleFanDeg' | 'angleRays' | 'angleMinDist' | 'angleMaxDist' | 'angleJump' | 'anglePast' | 'angleBestDist' | 'angleSeparationDeg' | 'angleGapMin' | 'angleGapMax' | 'angleGapFacing' | 'foliageSeeThrough'
>;

// Scratch for findHeldAngles (used only within one call); sized for the largest fan a config may ask for.
const MAX_RAYS = 64;
const dists = new Float64Array(MAX_RAYS);
const dir = vec3();
const look = { yaw: 0, pitch: 0 };
const candidate = createHeldAngle();
/** The bushes and posts near enough to matter for one fan (indices into AngleFeatures), at most this many each. */
const MAX_NEAR = 128;
const nearBushes = new Int32Array(MAX_NEAR);
const nearPosts = new Int32Array(MAX_NEAR);

/**
 * Fills `out` (best first) with up to out.length angles held from `eye`, facing about `facingYaw` (the enemy side),
 * someone's head at `headY`. Two picks are at least angleSeparationDeg apart. Returns how many were found.
 */
export function findHeldAngles(
  query: WorldQuery,
  eye: Readonly<Vec3>,
  headY: number,
  facingYaw: number,
  cfg: AngleConfig,
  out: HeldAngle[],
  /** The map's bushes, posts and stair tops (M40); without them, walls alone. */
  features?: AngleFeatures,
  /** The holder's floor height (with `features`: where the stair tops and gaps are judged from). */
  footY = headY,
): number {
  const n = Math.min(cfg.angleRays, MAX_RAYS);
  const step = n > 1 ? (cfg.angleFanDeg * DEG) / (n - 1) : 0;
  const first = facingYaw - (cfg.angleFanDeg * DEG) / 2;
  const bushCount = features ? nearBushesOf(features, eye, cfg.angleMaxDist) : 0;
  for (let i = 0; i < n; i++) {
    rayDir(first + i * step);
    const d = query.raycastStatic(eye as Vec3, dir, cfg.angleMaxDist);
    dists[i] = d < 0 ? cfg.angleMaxDist : d;
    // A tall bush hides whoever is behind it as a wall does: the ray stops where it enters the leaves (M40).
    if (bushCount > 0) dists[i] = Math.min(dists[i]!, bushHit(features!, eye, bushCount, dists[i]!));
  }
  for (const a of out) a.score = Number.NEGATIVE_INFINITY;
  let found = 0;
  for (let i = 0; i + 1 < n; i++) {
    // An edge: one ray stops at a wall, its neighbour runs on. A wall seen at a slant also lengthens from ray to ray,
    // so the open ray must run angleJump beyond where the wall would carry on (extrapolated from the ray on the
    // wall's other side), not merely beyond the near ray. Aim along the open one, just past the wall's distance.
    const nearAt = dists[i]! < dists[i + 1]! ? i : i + 1;
    const openAt = nearAt === i ? i + 1 : i;
    const near = dists[nearAt]!;
    const before = 2 * nearAt - openAt;
    const wallGoesOn = before >= 0 && before < n ? 2 * near - dists[before]! : near;
    if (dists[openAt]! - Math.max(near, wallGoesOn) < cfg.angleJump) continue;
    if (near < cfg.angleMinDist) continue;
    const yaw = first + openAt * step;
    const dist = near + cfg.anglePast;
    rayDir(yaw);
    candidate.point.x = eye.x + dir.x * dist;
    candidate.point.y = headY;
    candidate.point.z = eye.z + dir.z * dist;
    lookAngles(eye.x, eye.y, eye.z, candidate.point.x, candidate.point.y, candidate.point.z, look);
    candidate.yaw = look.yaw;
    candidate.pitch = look.pitch;
    // Rays turn left as the index grows: an open ray after the near one lies to its left.
    candidate.side = openAt > nearAt ? -1 : 1;
    // Towards the enemy side first, then at a middle distance (a corner at arm's length or across the map is less use).
    candidate.score = Math.cos(wrapAngle(yaw - facingYaw)) - Math.abs(dist - cfg.angleBestDist) / cfg.angleMaxDist;
    found = keepBest(candidate, out, cfg.angleSeparationDeg * DEG, found);
  }
  if (features) {
    found = holdGaps(query, eye, headY - footY, facingYaw, cfg, out, features, found);
    found = holdTops(query, eye, headY - footY, facingYaw, cfg, out, features, found);
  }
  return found;
}

/** Fills nearBushes with the bushes within `range` of `eye` (2D); returns how many. */
function nearBushesOf(f: AngleFeatures, eye: Readonly<Vec3>, range: number): number {
  let count = 0;
  for (let i = 0; i < f.bushes.length && count < MAX_NEAR; i++) {
    const b = f.bushes[i]!;
    const d = Math.hypot(b.x - eye.x, b.z - eye.z);
    // Standing in a bush, its leaves don't block the holder's own view.
    if (d - b.radius <= range && d > b.radius) nearBushes[count++] = i;
  }
  return count;
}

/** Where the ray from `eye` along `dir` (horizontal, unit) first enters one of the near bushes (2D), or `max`. */
function bushHit(f: AngleFeatures, eye: Readonly<Vec3>, count: number, max: number): number {
  let best = max;
  for (let k = 0; k < count; k++) {
    const b = f.bushes[nearBushes[k]!]!;
    const ox = b.x - eye.x;
    const oz = b.z - eye.z;
    const along = ox * dir.x + oz * dir.z;
    if (along <= 0) continue;
    const off2 = ox * ox + oz * oz - along * along;
    const r2 = b.radius * b.radius;
    if (off2 >= r2) continue;
    best = Math.min(best, along - Math.sqrt(r2 - off2));
  }
  return best;
}

/** True if `yaw` lies inside the fan about `facingYaw`. */
function inFan(yaw: number, facingYaw: number, cfg: AngleConfig): boolean {
  return Math.abs(wrapAngle(yaw - facingYaw)) <= (cfg.angleFanDeg * DEG) / 2;
}

/**
 * Scores the candidate at `candidate.point` (x, z set; y set here to `eyeAbove` over its floor: `floorY`, or with NaN the
 * walkable floor there under the holder's eyes) and keeps it if it is in plain view: no wall and no more than
 * foliageSeeThrough of bush between. Returns the new count.
 */
function tryPoint(
  query: WorldQuery,
  eye: Readonly<Vec3>,
  eyeAbove: number,
  facingYaw: number,
  cfg: AngleConfig,
  out: HeldAngle[],
  f: AngleFeatures,
  found: number,
  floorY: number,
): number {
  const p = candidate.point;
  const dx = p.x - eye.x;
  const dz = p.z - eye.z;
  const flat = Math.hypot(dx, dz);
  if (flat < cfg.angleMinDist || flat > cfg.angleMaxDist) return found;
  const yaw = Math.atan2(-dx, -dz);
  if (!inFan(yaw, facingYaw, cfg)) return found;
  const score = Math.cos(wrapAngle(yaw - facingYaw)) - Math.abs(flat - cfg.angleBestDist) / cfg.angleMaxDist;
  // Not worth a ray if it can't make the list.
  if (found === out.length && out[found - 1]!.score >= score) return found;
  if (Number.isNaN(floorY)) {
    if (!isWalkableAt(f.nav, p.x, eye.y, p.z)) return found;
    floorY = floorAt(f.nav, p.x, eye.y, p.z);
  }
  p.y = floorY + eyeAbove;
  const len = Math.hypot(dx, p.y - eye.y, dz);
  dir.x = dx / len;
  dir.y = (p.y - eye.y) / len;
  dir.z = dz / len;
  const wall = query.raycastStatic(eye as Vec3, dir, len);
  if (wall >= 0) return found;
  if (f.bushes.length > 0 && foliageDepth(f.bushes, eye as Vec3, p, cfg.foliageSeeThrough) > cfg.foliageSeeThrough) return found;
  lookAngles(eye.x, eye.y, eye.z, p.x, p.y, p.z, look);
  candidate.yaw = look.yaw;
  candidate.pitch = look.pitch;
  candidate.side = 0;
  candidate.score = score;
  return keepBest(candidate, out, cfg.angleSeparationDeg * DEG, found);
}

/**
 * Tree gaps (M40): between two trunks or posts angleGapMin to angleGapMax apart, someone walking through appears at the
 * gap's middle. Held where the line of sight crosses the gap squarely enough (angleGapFacing).
 */
function holdGaps(query: WorldQuery, eye: Readonly<Vec3>, eyeAbove: number, facingYaw: number, cfg: AngleConfig, out: HeldAngle[], f: AngleFeatures, found: number): number {
  const reach = cfg.angleMaxDist + cfg.angleGapMax;
  let count = 0;
  for (let i = 0; i < f.postCount && count < MAX_NEAR; i++) {
    const dx = f.posts[3 * i]! - eye.x;
    const dz = f.posts[3 * i + 1]! - eye.z;
    const d = Math.hypot(dx, dz);
    // In reach, and in the fan or close enough beside it to make a gap with a post inside it.
    if (d > reach || d < 1e-6) continue;
    if (Math.abs(wrapAngle(Math.atan2(-dx, -dz) - facingYaw)) > (cfg.angleFanDeg * DEG) / 2 + Math.atan2(cfg.angleGapMax, d)) continue;
    nearPosts[count++] = i;
  }
  for (let a = 0; a < count; a++) {
    const i = nearPosts[a]!;
    const ax = f.posts[3 * i]!;
    const az = f.posts[3 * i + 1]!;
    const ar = f.posts[3 * i + 2]!;
    for (let b = a + 1; b < count; b++) {
      const j = nearPosts[b]!;
      const gx = f.posts[3 * j]! - ax;
      const gz = f.posts[3 * j + 1]! - az;
      const centres = Math.hypot(gx, gz);
      const gap = centres - ar - f.posts[3 * j + 2]!;
      if (gap < cfg.angleGapMin || gap > cfg.angleGapMax) continue;
      // The gap's middle, between the two posts' faces.
      const t = (ar + gap / 2) / centres;
      const mx = ax + gx * t;
      const mz = az + gz * t;
      const sx = mx - eye.x;
      const sz = mz - eye.z;
      const sight = Math.hypot(sx, sz);
      if (sight < 1e-6 || Math.abs(gx * sz - gz * sx) / (centres * sight) < cfg.angleGapFacing) continue;
      candidate.point.x = mx;
      candidate.point.z = mz;
      found = tryPoint(query, eye, eyeAbove, facingYaw, cfg, out, f, found, Number.NaN);
    }
  }
  return found;
}

/** Stair and ramp tops (M40): someone coming up or down appears there, head first. */
function holdTops(query: WorldQuery, eye: Readonly<Vec3>, eyeAbove: number, facingYaw: number, cfg: AngleConfig, out: HeldAngle[], f: AngleFeatures, found: number): number {
  for (let i = 0; i < f.topCount; i++) {
    candidate.point.x = f.tops[3 * i]!;
    candidate.point.z = f.tops[3 * i + 2]!;
    // Judged on the top's own floor, not whichever floor lies under the holder's eyes there.
    found = tryPoint(query, eye, eyeAbove, facingYaw, cfg, out, f, found, f.tops[3 * i + 1]!);
  }
  return found;
}

/** Inserts `c` into `out` (sorted, best first) unless a better pick lies within `separation` of it. */
function keepBest(c: HeldAngle, out: HeldAngle[], separation: number, found: number): number {
  for (let k = 0; k < found; k++) {
    if (Math.abs(wrapAngle(out[k]!.yaw - c.yaw)) >= separation) continue;
    if (out[k]!.score >= c.score) return found;
    // Replaces a worse pick close to it: drop that one, then insert as usual.
    for (let m = k; m + 1 < found; m++) copyAngle(out[m + 1]!, out[m]!);
    found--;
    break;
  }
  let at = found;
  while (at > 0 && out[at - 1]!.score < c.score) at--;
  if (at >= out.length) return found;
  const last = Math.min(found, out.length - 1);
  for (let m = last; m > at; m--) copyAngle(out[m - 1]!, out[m]!);
  copyAngle(c, out[at]!);
  return Math.min(found + 1, out.length);
}

function copyAngle(from: HeldAngle, to: HeldAngle): void {
  to.yaw = from.yaw;
  to.pitch = from.pitch;
  to.point.x = from.point.x;
  to.point.y = from.point.y;
  to.point.z = from.point.z;
  to.side = from.side;
  to.score = from.score;
}

/** Unit horizontal direction for `yaw` (yaw 0 looks down -z; positive turns left), into `dir`. */
function rayDir(yaw: number): void {
  dir.x = -Math.sin(yaw);
  dir.y = 0;
  dir.z = -Math.cos(yaw);
}
