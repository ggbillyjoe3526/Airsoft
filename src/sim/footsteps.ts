import type { FootstepConfig } from '../config/footsteps';
import { rattles } from './armament';
import type { Character } from './character';
import type { GameEvent } from './events';

/** How loud a footstep is: bots and sound treat each differently. `rattle`: a quiet move with a hi-cap magazine. */
export type FootstepKind = 'run' | 'sprint' | 'land' | 'rattle';

/**
 * After a character has moved this tick: counts the ground it covered and emits a footstep event
 * every stride while running or sprinting, and a landing event when it comes down hard. Walking and
 * moving crouched make no footsteps, but a magazine that rattles (a hi-cap, config/attachments.ts) is heard every
 * stride even then. Pure; uses the character's own step state.
 */
export function stepFootsteps(c: Character, cfg: FootstepConfig, events: GameEvent[]): void {
  if (!c.grounded) {
    c.fallSpeed = Math.max(c.fallSpeed, -c.velocity.y);
    c.airborne = true;
    return;
  }
  if (c.airborne) {
    c.airborne = false;
    const landed = c.fallSpeed >= cfg.landMinSpeed;
    c.fallSpeed = 0;
    if (landed) {
      events.push({ type: 'footstep', characterId: c.id, kind: 'land' });
      c.stepDistance = 0;
      return;
    }
  }
  const quiet = c.walking || c.crouchAmount > cfg.silentCrouch;
  if (quiet && !rattles(c.armament)) return;
  c.stepDistance += Math.hypot(c.position.x - c.prevPosition.x, c.position.z - c.prevPosition.z);
  const stride = c.sprinting ? cfg.strideSprint : cfg.strideRun;
  if (c.stepDistance >= stride) {
    c.stepDistance %= stride;
    events.push({ type: 'footstep', characterId: c.id, kind: quiet ? 'rattle' : c.sprinting ? 'sprint' : 'run' });
  }
}
