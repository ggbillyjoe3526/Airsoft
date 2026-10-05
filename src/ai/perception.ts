import { type BotBehaviour, NIGHT_SIGHT } from '../config/bots';
import type { HitConfig } from '../config/hits';
import { type Bush, foliageDepth } from '../map/foliage';
import type { MapData } from '../map/mapTypes';
import { buildNightField, type NightField, nightSightRange } from '../map/nightSight';
import { createTorchLight, type TorchLight, torchSightRange } from '../map/torchLight';
import type { BodyConfig } from '../config/movement';
import type { WorldQuery } from '../sim/armament';
import type { Character } from '../sim/character';
import { hitTop } from '../sim/hitbox';
import { leanedEye, leanOffset } from '../sim/lean';
import { type Vec3, vec3 } from '../sim/vec';

const eye = vec3();
const point = vec3();
const dir = vec3();

/** Where a character's eyes are, lean included. */
export function eyeOf(c: Character, body: BodyConfig, hits: HitConfig, out: Vec3): Vec3 {
  return leanedEye(c, body, hits, out);
}

/**
 * A point `fraction` of the way up a character's hit volume (0.7 ≈ chest), following its crouch and lean
 * (a leaning player's head and shoulders are out past cover).
 */
export function bodyPoint(c: Character, hits: HitConfig, fraction: number, out: Vec3): Vec3 {
  const h = hitTop(c.crouchAmount, hits) * fraction;
  leanOffset(h, c.lean, c.crouchAmount, c.yaw, hits, out);
  out.x += c.position.x;
  out.y += c.position.y + h;
  out.z += c.position.z;
  return out;
}

/** True if nothing static blocks the straight line from `a` to `b`. */
export function lineClear(query: WorldQuery, a: Vec3, b: Vec3): boolean {
  dir.x = b.x - a.x;
  dir.y = b.y - a.y;
  dir.z = b.z - a.z;
  const d = Math.hypot(dir.x, dir.y, dir.z);
  if (d < 1e-6) return true;
  dir.x /= d;
  dir.y /= d;
  dir.z /= d;
  return query.raycastStatic(a, dir, d) < 0;
}

/** True if the line from `a` to `b` is clear of static surfaces and runs through no more than `seeThrough` m of bush. */
function sightClear(query: WorldQuery, a: Vec3, b: Vec3, foliage: readonly Bush[], seeThrough: number): boolean {
  return lineClear(query, a, b) && (foliage.length === 0 || foliageDepth(foliage, a, b, seeThrough) <= seeThrough);
}

const NO_FOLIAGE: readonly Bush[] = [];

/** What on the map hides people from bots besides walls: bushes (M33e) and the dark of a night field (M33g). */
export interface SightConditions {
  foliage: readonly Bush[];
  night: NightField | null;
  /**
   * Who the weapon torches light this tick (M33h, map/torchLight.ts; refreshed by ai/botTorch.ts): only on a night
   * field. Absent or null: no torch changes anyone's sight.
   */
  torches?: TorchLight | null;
}

/** Daylight with no bushes: walls are all that hide anyone. */
export const OPEN_SIGHT: SightConditions = { foliage: NO_FOLIAGE, night: null };

/**
 * The sight conditions of `map`, worked out once as a match loads; `atNight`: the match's resolved lighting preset's
 * `night` (M33h; the map's own flag when not given).
 */
export function sightConditionsOf(map: MapData, atNight?: boolean): SightConditions {
  const night = buildNightField(map, NIGHT_SIGHT, atNight);
  return { foliage: map.foliage ?? NO_FOLIAGE, night, torches: night ? createTorchLight() : null };
}

/**
 * Which part of `target` `viewer` can see right now, as a fraction of the target's height: the chest
 * (bots.aimHeightFraction) if it's in view, else the head (bots.headHeightFraction), else 0 (not seen).
 * Seeing needs the target within view distance, inside the field of view (unless very close), and a
 * clear line from the viewer's eyes: nothing static in the way, and no more than `bots.foliageSeeThrough` of bush
 * (M33e; within `closeAwareness` a bush hides no one). On a night field (M33g) the view distance is how far the
 * target's light lets them be made out: lit, in the moonlit open, or under the trees (map/nightSight.ts), or in a
 * torch's beam or by their own lit torch facing the viewer (M33h, map/torchLight.ts).
 */
export function visiblePart(
  viewer: Character,
  target: Character,
  query: WorldQuery,
  bots: BotBehaviour,
  body: BodyConfig,
  hits: HitConfig,
  sight: SightConditions = OPEN_SIGHT,
): number {
  const dx = target.position.x - viewer.position.x;
  const dz = target.position.z - viewer.position.z;
  const dist = Math.hypot(dx, dz);
  const range = sight.night ? Math.min(bots.viewDistance, nightRange(sight.night, sight.torches, viewer, target)) : bots.viewDistance;
  if (dist > range) return 0;
  if (dist > bots.closeAwareness) {
    // Facing (-sin yaw, -cos yaw); compare with the direction to the target.
    const cos = (-Math.sin(viewer.yaw) * dx - Math.cos(viewer.yaw) * dz) / dist;
    if (cos < Math.cos(((bots.fovDeg / 2) * Math.PI) / 180)) return 0;
  }
  const leaves = dist > bots.closeAwareness ? sight.foliage : NO_FOLIAGE;
  eyeOf(viewer, body, hits, eye);
  if (sightClear(query, eye, bodyPoint(target, hits, bots.aimHeightFraction, point), leaves, bots.foliageSeeThrough)) return bots.aimHeightFraction;
  if (sightClear(query, eye, bodyPoint(target, hits, bots.headHeightFraction, point), leaves, bots.foliageSeeThrough)) return bots.headHeightFraction;
  return 0;
}

/** How far `viewer` makes `target` out at night: by the light round the target, or by torchlight if that is further. */
function nightRange(night: NightField, torches: TorchLight | null | undefined, viewer: Character, target: Character): number {
  const range = nightSightRange(night, target.position);
  return torches ? Math.max(range, torchSightRange(torches, night, viewer, target)) : range;
}

/** Whether `viewer` can see any of `target` right now (see visiblePart). */
export function canSee(viewer: Character, target: Character, query: WorldQuery, bots: BotBehaviour, body: BodyConfig, hits: HitConfig): boolean {
  return visiblePart(viewer, target, query, bots, body, hits) > 0;
}
