import type { BotConfig } from '../config/bots';
import type { HitConfig } from '../config/hits';
import type { BodyConfig } from '../config/movement';
import type { WorldQuery } from '../sim/armament';
import { type Character, eyeHeight } from '../sim/character';
import { hitTop } from '../sim/hitbox';
import { type Vec3, vec3 } from '../sim/vec';

const eye = vec3();
const point = vec3();
const dir = vec3();

/** Where a character's eyes are. */
export function eyeOf(c: Character, body: BodyConfig, out: Vec3): Vec3 {
  out.x = c.position.x;
  out.y = c.position.y + eyeHeight(c.crouchAmount, body);
  out.z = c.position.z;
  return out;
}

/** A point `fraction` of the way up a character's hit volume (0.7 ≈ chest), following its crouch. */
export function bodyPoint(c: Character, hits: HitConfig, fraction: number, out: Vec3): Vec3 {
  out.x = c.position.x;
  out.y = c.position.y + hitTop(c.crouchAmount, hits) * fraction;
  out.z = c.position.z;
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
 * Whether `viewer` can see `target` right now: within view distance, inside the field of view (unless
 * very close), and with a clear line from the viewer's eyes to the target's head or chest.
 */
export function canSee(viewer: Character, target: Character, query: WorldQuery, bots: BotConfig, body: BodyConfig, hits: HitConfig): boolean {
  const dx = target.position.x - viewer.position.x;
  const dz = target.position.z - viewer.position.z;
  const dist = Math.hypot(dx, dz);
  if (dist > bots.viewDistance) return false;
  if (dist > bots.closeAwareness) {
    // Facing (-sin yaw, -cos yaw); compare with the direction to the target.
    const cos = (-Math.sin(viewer.yaw) * dx - Math.cos(viewer.yaw) * dz) / dist;
    if (cos < Math.cos(((bots.fovDeg / 2) * Math.PI) / 180)) return false;
  }
  eyeOf(viewer, body, eye);
  if (lineClear(query, eye, bodyPoint(target, hits, bots.headHeightFraction, point))) return true;
  return lineClear(query, eye, bodyPoint(target, hits, bots.aimHeightFraction, point)); // chest
}
