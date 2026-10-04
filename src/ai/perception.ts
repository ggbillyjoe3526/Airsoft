import type { BotBehaviour } from '../config/bots';
import type { HitConfig } from '../config/hits';
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

/**
 * Which part of `target` `viewer` can see right now, as a fraction of the target's height: the chest
 * (bots.aimHeightFraction) if it's in view, else the head (bots.headHeightFraction), else 0 (not seen).
 * Seeing needs the target within view distance, inside the field of view (unless very close), and a
 * clear line from the viewer's eyes.
 */
export function visiblePart(viewer: Character, target: Character, query: WorldQuery, bots: BotBehaviour, body: BodyConfig, hits: HitConfig): number {
  const dx = target.position.x - viewer.position.x;
  const dz = target.position.z - viewer.position.z;
  const dist = Math.hypot(dx, dz);
  if (dist > bots.viewDistance) return 0;
  if (dist > bots.closeAwareness) {
    // Facing (-sin yaw, -cos yaw); compare with the direction to the target.
    const cos = (-Math.sin(viewer.yaw) * dx - Math.cos(viewer.yaw) * dz) / dist;
    if (cos < Math.cos(((bots.fovDeg / 2) * Math.PI) / 180)) return 0;
  }
  eyeOf(viewer, body, hits, eye);
  if (lineClear(query, eye, bodyPoint(target, hits, bots.aimHeightFraction, point))) return bots.aimHeightFraction;
  if (lineClear(query, eye, bodyPoint(target, hits, bots.headHeightFraction, point))) return bots.headHeightFraction;
  return 0;
}

/** Whether `viewer` can see any of `target` right now (see visiblePart). */
export function canSee(viewer: Character, target: Character, query: WorldQuery, bots: BotBehaviour, body: BodyConfig, hits: HitConfig): boolean {
  return visiblePart(viewer, target, query, bots, body, hits) > 0;
}
