import { AIMING, IRON_SIGHTS, OPTICS } from '../config/optics';
import type { Armament } from './armament';
import type { Character } from './character';
import type { PlayerCommand } from './commands';

/**
 * The replica in hand has a sight to aim through: a fitted optic, or its own iron sights (M84: every replica has them,
 * config/replicas.ts look.ironSight). The aim toggle reads it too.
 */
export function canAimDownSights(a: Armament): boolean {
  return a.optics[a.active] != null || a.replicas[a.active]?.look.ironSight != null;
}

/** Seconds to raise the sight in hand to your eye: AIMING.raiseTime scaled by the optic (or iron sights) and the grip. */
export function aimRaiseTime(a: Armament): number {
  const optic = a.optics[a.active];
  return AIMING.raiseTime * (optic ? OPTICS[optic] : IRON_SIGHTS).raiseScale * (a.handling[a.active]?.raiseScale ?? 1);
}

/**
 * Aiming down sights (owner, 2026-10-06: every replica, through iron sights when no optic is fitted; M84), not while
 * reloading, bringing a replica up or with it holstered (the sight comes back up afterwards if the button is still held;
 * an aim press draws a holstered replica, M92, sim/armament.ts). Aiming slows you
 * to walking pace, quietly, and rules out sprinting, as the walk key does; holding walk as well slows you further
 * (sim/movement.ts). The sight comes up over aimRaiseTime (Character.aimRaise), and as it does the aim tightens
 * (MovementConfig.accuracy.aimed, sim/accuracy.ts). Call before the movement step, for characters in play.
 */
export function stepAiming(c: Character, cmd: PlayerCommand, dt: number): void {
  const a = c.armament;
  // Reload, draw and holster are as the last tick left them: a reload started this tick drops the sight on the next one.
  // Not mid-vault (M102): the aim held through one comes up again only after it (BP5).
  c.aiming = cmd.aim && !c.vault.active && !a.holstered && canAimDownSights(a) && a.reload <= 0 && a.draw <= 0;
  const step = dt / aimRaiseTime(a);
  c.aimRaise = c.aiming ? Math.min(1, c.aimRaise + step) : Math.max(0, c.aimRaise - step);
}
