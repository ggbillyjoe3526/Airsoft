import type { HitConfig } from '../config/hits';
import type { SpawnPoint } from '../map/mapTypes';
import type { Character } from './character';
import type { PlayerCommand } from './commands';
import type { GameEvent } from './events';
import { copy } from './vec';

/**
 * Hit calling, enforced by the game: a hit character stops, raises a hand and calls the hit, then walks
 * off to its team's dead zone. From the moment of the hit it can't shoot and BBs pass through it.
 */

/** Only characters still in play can be hit or shoot. */
export function isInPlay(c: Character): boolean {
  return c.status === 'alive';
}

/**
 * Eliminates `victim` (no-op if already out of play) and picks its dead-zone spot: the next free one
 * for its team, in the order teammates were hit.
 */
export function eliminate(victim: Character, shooterId: number, characters: readonly Character[], deadZones: readonly (readonly SpawnPoint[])[]): void {
  if (!isInPlay(victim)) return;
  let alreadyOut = 0;
  for (const c of characters) if (c !== victim && c.team === victim.team && !isInPlay(c)) alreadyOut++;
  victim.status = 'calling';
  victim.statusTime = 0;
  victim.hitBy = shooterId;
  victim.sprinting = false;
  const spots = deadZones[victim.team];
  const spot = spots && spots.length > 0 ? spots[alreadyOut % spots.length]! : undefined;
  copy(victim.deadZoneTarget, spot ? spot.position : victim.spawnPosition);
}

/**
 * The command an eliminated character follows instead of its controller's: stand still while calling,
 * walk straight to the dead zone, then stand there. Never fires, reloads or switches.
 */
export function fillEliminatedCommand(c: Character, cfg: HitConfig, out: PlayerCommand): PlayerCommand {
  out.right = 0;
  out.pitch = 0;
  out.sprint = false;
  out.crouch = false;
  out.jump = false;
  out.fire = false;
  out.reload = false;
  out.switchTo = -1;
  out.yaw = c.yaw;
  out.forward = 0;
  if (c.status === 'walkingOff') {
    const dx = c.deadZoneTarget.x - c.position.x;
    const dz = c.deadZoneTarget.z - c.position.z;
    if (Math.hypot(dx, dz) > cfg.deadZoneArrive) {
      out.yaw = Math.atan2(-dx, -dz); // yaw 0 faces -Z, positive yaw turns left
      out.forward = cfg.walkOffSpeed;
    }
  }
  return out;
}

/** Advances an eliminated character's hit call / walk-off by one tick. */
export function stepElimination(c: Character, cfg: HitConfig, events: GameEvent[], dt: number): void {
  if (isInPlay(c)) return;
  c.statusTime += dt;
  if (c.status === 'calling' && c.statusTime >= cfg.callTime) {
    c.status = 'walkingOff';
    c.statusTime = 0;
    events.push({ type: 'walkOff', characterId: c.id });
  } else if (c.status === 'walkingOff') {
    const arrived = Math.hypot(c.deadZoneTarget.x - c.position.x, c.deadZoneTarget.z - c.position.z) <= cfg.deadZoneArrive;
    if (arrived || c.statusTime >= cfg.walkOffTime) {
      c.status = 'out';
      c.statusTime = 0;
      if (!arrived) {
        // No navigation yet: anyone who couldn't walk there directly steps into the dead zone now.
        copy(c.position, c.deadZoneTarget);
        copy(c.prevPosition, c.deadZoneTarget);
        c.velocity.x = 0;
        c.velocity.z = 0;
      }
    }
  }
}
