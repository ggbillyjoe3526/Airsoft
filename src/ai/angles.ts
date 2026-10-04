import type { BotBehaviour } from '../config/bots';
import type { WorldQuery } from '../sim/armament';
import { type Vec3, vec3, wrapAngle } from '../sim/vec';
import { lookAngles } from './aim';

const DEG = Math.PI / 180;

/**
 * Held angles (M37): where someone would step into view. A bot holding still fans rays out at eye height across the
 * enemy side and looks for an edge: a ray that stops at a wall next to one that runs on. Someone coming round that
 * corner, or through that doorway, appears just past the edge, so that is where a Pro bot aims, at head height.
 * Built from the level's geometry alone: where the enemies are never enters it.
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
type AngleConfig = Pick<BotBehaviour, 'angleFanDeg' | 'angleRays' | 'angleMinDist' | 'angleMaxDist' | 'angleJump' | 'anglePast' | 'angleBestDist' | 'angleSeparationDeg'>;

// Scratch for findHeldAngles (used only within one call); sized for the largest fan a config may ask for.
const MAX_RAYS = 64;
const dists = new Float64Array(MAX_RAYS);
const dir = vec3();
const look = { yaw: 0, pitch: 0 };
const candidate = createHeldAngle();

/**
 * Fills `out` (best first) with up to out.length angles held from `eye`, facing about `facingYaw` (the enemy side),
 * someone's head at `headY`. Two picks are at least angleSeparationDeg apart. Returns how many were found.
 */
export function findHeldAngles(query: WorldQuery, eye: Readonly<Vec3>, headY: number, facingYaw: number, cfg: AngleConfig, out: HeldAngle[]): number {
  const n = Math.min(cfg.angleRays, MAX_RAYS);
  const step = n > 1 ? (cfg.angleFanDeg * DEG) / (n - 1) : 0;
  const first = facingYaw - (cfg.angleFanDeg * DEG) / 2;
  for (let i = 0; i < n; i++) {
    rayDir(first + i * step);
    const d = query.raycastStatic(eye as Vec3, dir, cfg.angleMaxDist);
    dists[i] = d < 0 ? cfg.angleMaxDist : d;
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
