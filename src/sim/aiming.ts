import type { Armament } from './armament';
import type { Character } from './character';
import type { PlayerCommand } from './commands';

/** The replica in hand has a sight to aim through (an optic fitted to a replica with a mount). The aim toggle reads it too. */
export function canAimDownSights(a: Armament): boolean {
  return a.optics[a.active] != null;
}

/**
 * Aiming down sights (owner, 2026-10-03): only with an optic fitted to the replica in hand, and not while
 * reloading or bringing a replica up (the sight comes back up afterwards if the button is still held). Aiming
 * slows you to walking pace, quietly, and rules out sprinting, as the walk key does (sim/movement.ts). It gives
 * no accuracy bonus of its own: standing still stays the accuracy rule. Call before the movement step, for characters in play.
 */
export function stepAiming(c: Character, cmd: PlayerCommand): void {
  const a = c.armament;
  // Reload and draw are as the last tick left them: a reload started this tick drops the sight on the next one.
  c.aiming = cmd.aim && canAimDownSights(a) && a.reload <= 0 && a.draw <= 0;
}
