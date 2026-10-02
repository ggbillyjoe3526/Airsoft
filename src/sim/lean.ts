import type { HitConfig } from '../config/hits';
import type { BodyConfig, MovementConfig } from '../config/movement';
import type { WorldQuery } from './armament';
import { type Character, eyeHeight } from './character';
import type { PlayerCommand } from './commands';
import { type Vec3, vec3 } from './vec';

/**
 * Leaning: holding Q / E tilts the upper body sideways about a pivot at the hips (hits.lean), so the
 * eyes, head and shoulders move out past cover while the legs stay put. This module owns that one
 * geometry; the eye and BB origin, the hit volume, the drawn figure and what bots see all use it.
 */

/**
 * World offset of a point `height` metres above a character's feet when it leans by `lean` (-1 left ..
 * 1 right) at crouch amount `crouchAmount`, facing `yaw`: sideways along its right and a little down, as
 * if rotated about the hip pivot. Points at or below the pivot don't move. Writes into `out`.
 */
export function leanOffset(height: number, lean: number, crouchAmount: number, yaw: number, hits: HitConfig, out: Vec3): Vec3 {
  const pivot = hits.lean.pivotHeight - hits.crouchDrop * crouchAmount;
  const above = height - pivot;
  if (above <= 0 || lean === 0) {
    out.x = out.y = out.z = 0;
    return out;
  }
  const angle = lean * hits.lean.maxAngle;
  const side = above * Math.sin(angle);
  // The character's right is (cos yaw, 0, -sin yaw) (forward is (-sin yaw, 0, -cos yaw)).
  out.x = Math.cos(yaw) * side;
  out.y = -above * (1 - Math.cos(angle));
  out.z = -Math.sin(yaw) * side;
  return out;
}

const offset = vec3();

/** Where a character's eyes are, lean included (BBs leave from here; bots see from here). */
export function leanedEye(c: Character, body: BodyConfig, hits: HitConfig, out: Vec3): Vec3 {
  const h = eyeHeight(c.crouchAmount, body);
  leanOffset(h, c.lean, c.crouchAmount, c.yaw, hits, offset);
  out.x = c.position.x + offset.x;
  out.y = c.position.y + h + offset.y;
  out.z = c.position.z + offset.z;
  return out;
}

// Scratch for stepLean's wall checks (used only within one call).
const origin = vec3();
const side = vec3();

/**
 * How far (0..1) a character can lean towards `dir` (+1 right, -1 left) before its head or shoulder would
 * come within `clearance` of a wall: rays from the upright eye and shoulder, sideways.
 */
function leanRoom(c: Character, dir: number, body: BodyConfig, hits: HitConfig, cfg: MovementConfig, query: WorldQuery): number {
  side.x = Math.cos(c.yaw) * dir;
  side.y = 0;
  side.z = -Math.sin(c.yaw) * dir;
  // The eye, and the top of the body (shoulders), each swing out by (height - pivot) · sin(angle).
  const eye = roomAt(c, eyeHeight(c.crouchAmount, body), hits, cfg, query);
  const shoulder = roomAt(c, hits.bodyTop - hits.crouchDrop * c.crouchAmount, hits, cfg, query);
  return Math.min(eye, shoulder);
}

/** leanRoom for one height above the feet (the sideways direction is already in `side`). */
function roomAt(c: Character, height: number, hits: HitConfig, cfg: MovementConfig, query: WorldQuery): number {
  const above = height - (hits.lean.pivotHeight - hits.crouchDrop * c.crouchAmount);
  if (above <= 0) return 1;
  origin.x = c.position.x;
  origin.y = c.position.y + height;
  origin.z = c.position.z;
  const hit = query.raycastStatic(origin, side, above * Math.sin(hits.lean.maxAngle) + cfg.leanWallClearance);
  if (hit < 0) return 1;
  const free = Math.max(0, hit - cfg.leanWallClearance);
  return Math.asin(Math.min(1, free / above)) / hits.lean.maxAngle;
}

/**
 * One tick of leaning: towards the held direction over cfg.leanTime, back upright when released. No
 * leaning in the air. Never further than the walls allow (a wall that appears cuts the lean at once,
 * so you can't see or shoot through it).
 */
export function stepLean(c: Character, cmd: PlayerCommand, body: BodyConfig, hits: HitConfig, cfg: MovementConfig, query: WorldQuery, dt: number): void {
  const target = c.grounded ? Math.max(-1, Math.min(1, cmd.lean)) : 0;
  const rate = dt / cfg.leanTime;
  if (c.lean < target) c.lean = Math.min(target, c.lean + rate);
  else if (c.lean > target) c.lean = Math.max(target, c.lean - rate);
  if (c.lean !== 0) {
    const dir = c.lean > 0 ? 1 : -1;
    const room = leanRoom(c, dir, body, hits, cfg, query);
    if (Math.abs(c.lean) > room) c.lean = dir * room;
  }
}
