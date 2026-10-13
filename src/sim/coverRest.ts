import type { BodyConfig, RestConfig } from '../config/movement';
import { aimDirection, type SurfaceHit, type WorldQuery } from './armament';
import { type Character, eyeHeight } from './character';
import { vec3 } from './vec';

/**
 * Resting the replica on cover (M104): aiming down sights, still, upright and on the ground, with a ledge straight ahead
 * between RestConfig.minDrop and maxDrop below the eye, the replica settles on it (Character.coverRest) and the aim is
 * steadier: less spread (sim/accuracy.ts) and less kick (sim/armament.ts). Bots and the player follow the same rule;
 * bots fire from the hip, so only the player rests for now.
 */

// Scratch for the probe (used only within one call).
const origin = vec3();
const dir = vec3();
const top: SurfaceHit = { normal: vec3(), material: 'concrete' };

/**
 * The height (world y) of the cover top a character standing at (`x`, `z`) with its eye at height `eyeY`, facing `yaw`
 * with its aim at `pitch`, can rest its replica on; NaN if there is none. Three static rays, nothing allocated:
 * 1. Straight ahead at the lowest top allowed (eyeY - maxDrop): the cover's face, within `reach` of the body's centre.
 * 2. Down onto it, `inset` past that face, from the eye: its top, which must lie between maxDrop and minDrop below the
 *    eye (a ray starting inside taller cover meets its far side, out of reach, so a wall is never a ledge) and be flat
 *    (`minFlat`, with a query that reports surfaces: a ramp or a stair's slope ahead is no ledge).
 * 3. Along the aim from the eye, `clearAhead` past the face: nothing in the way (no resting with the BBs' way blocked).
 */
export function restTop(x: number, z: number, eyeY: number, yaw: number, pitch: number, cfg: RestConfig, query: WorldQuery): number {
  const fx = -Math.sin(yaw);
  const fz = -Math.cos(yaw);
  dir.x = fx;
  dir.y = 0;
  dir.z = fz;
  origin.x = x;
  origin.y = eyeY - cfg.maxDrop;
  origin.z = z;
  const face = query.raycastStatic(origin, dir, cfg.reach);
  if (face < 0) return Number.NaN;
  origin.x = x + fx * (face + cfg.inset);
  origin.y = eyeY;
  origin.z = z + fz * (face + cfg.inset);
  dir.x = 0;
  dir.y = -1;
  dir.z = 0;
  const down = query.raycastSurface ? query.raycastSurface(origin, dir, cfg.maxDrop, top) : query.raycastStatic(origin, dir, cfg.maxDrop);
  if (down < cfg.minDrop) return Number.NaN; // none (-1), or too high to see over
  if (query.raycastSurface && top.normal.y < cfg.minFlat) return Number.NaN;
  origin.x = x;
  origin.y = eyeY;
  origin.z = z;
  aimDirection(dir, yaw, pitch);
  if (query.raycastStatic(origin, dir, face + cfg.clearAhead) >= 0) return Number.NaN;
  return eyeY - down;
}

/**
 * Whether a character can rest its replica this tick, before looking for cover: aiming (the sight raised or rising;
 * sim/aiming.ts), on the ground, still (MovementConfig.accuracy.stillBelow) and no further leaned than maxLean.
 */
export function restReady(c: Character, cfg: RestConfig, stillBelow: number): boolean {
  return c.aiming && c.grounded && Math.abs(c.lean) <= cfg.maxLean && Math.hypot(c.velocity.x, c.velocity.z) <= stillBelow;
}

/**
 * One tick of resting on cover, for a character in play, after the lean step (the eye is where this tick left it) and
 * before the accuracy step (the spread reads it): Character.coverRest eases to 1 over settleTime while restReady and
 * restTop finds a ledge, and back to 0 over releaseTime otherwise (moving, letting go of the aim, a reload, a lean, or
 * turning away from the cover). Looks for cover only while ready, so only aiming characters cast its rays.
 */
export function stepCoverRest(c: Character, body: BodyConfig, cfg: RestConfig, stillBelow: number, query: WorldQuery, dt: number): void {
  const p = c.position;
  const resting = restReady(c, cfg, stillBelow) && !Number.isNaN(restTop(p.x, p.z, p.y + eyeHeight(c.crouchAmount, body), c.yaw, c.pitch, cfg, query));
  c.coverRest = resting ? Math.min(1, c.coverRest + dt / cfg.settleTime) : Math.max(0, c.coverRest - dt / cfg.releaseTime);
}
