import type { OvertimeRules } from '../config/modes';
import type { Character } from './character';
import { isInPlay } from './elimination';
import { type Vec3, vec3 } from './vec';

/**
 * Elimination's overtime flag (Dev 6 item 45): when a round's clock runs out level, a flag goes up near the middle of
 * the map and the first team to touch it wins the round (sim/round.ts decides when). A touch is a hand on it, no hold:
 * a player in play within OvertimeRules.reach of its foot, on its floor. Both teams at it at once hold each other off.
 * Pure; nothing allocated per tick.
 */
export interface OvertimeFlagState {
  /** The flag is up: this round is in overtime. Stays up through the pause after the round, until the next starts. */
  up: boolean;
  /** Its foot (the map's `overtimeFlag`, put there when it goes up). */
  position: Vec3;
  /** Seconds of overtime left: OvertimeRules.time at each round's start, run down while the flag is up. */
  left: number;
  /** 'contested': players of both teams at it (nobody takes it); 'idle' otherwise. */
  status: 'idle' | 'contested';
}

export function createOvertimeFlag(): OvertimeFlagState {
  return { up: false, position: vec3(), left: 0, status: 'idle' };
}

/** Down again with the whole of its time, for a new round. */
export function resetOvertimeFlag(flag: OvertimeFlagState, rules: OvertimeRules): void {
  flag.up = false;
  flag.left = rules.time;
  flag.status = 'idle';
}

/** Up at `position`, with the time it has left. */
export function raiseOvertimeFlag(flag: OvertimeFlagState, position: Readonly<Vec3>): void {
  flag.up = true;
  flag.position.x = position.x;
  flag.position.y = position.y;
  flag.position.z = position.z;
  flag.status = 'idle';
}

/** Whether `c` is in play with a hand on the flag: within reach of its foot, on its floor. */
export function touchesOvertimeFlag(c: Character, flag: OvertimeFlagState, rules: OvertimeRules): boolean {
  const p = c.position;
  return isInPlay(c) && Math.abs(p.y - flag.position.y) <= rules.reachHeight && Math.hypot(p.x - flag.position.x, p.z - flag.position.z) <= rules.reach;
}

/**
 * One tick of the flag while it is up: the team (0 or 1) that took it, or -1 (nobody at it, or both teams: contested).
 * Runs its time down only when nobody took it; the caller ends the round when it is out (`left` at 0).
 */
export function stepOvertimeFlag(flag: OvertimeFlagState, characters: readonly Character[], rules: OvertimeRules, dt: number): number {
  let blue = false;
  let orange = false;
  for (const c of characters) {
    if (!touchesOvertimeFlag(c, flag, rules)) continue;
    if (c.team === 0) blue = true;
    else orange = true;
  }
  flag.status = blue && orange ? 'contested' : 'idle';
  if (blue !== orange) return blue ? 0 : 1;
  flag.left = Math.max(0, flag.left - dt);
  return -1;
}
