import type { FlagRules } from '../config/modes';
import type { Character } from './character';
import { isInPlay } from './elimination';
import type { GameEvent } from './events';
import { type Vec3, vec3 } from './vec';

/**
 * Who is working the rope: 'idle' (nobody at the pole), 'raising' (attackers only), 'lowering'
 * (defenders only) or 'contested' (both teams at the pole: the flag doesn't move).
 */
export type FlagStatus = 'idle' | 'raising' | 'lowering' | 'contested';

/** The flagpole of the round in flag mode. */
export interface FlagState {
  /** Foot of the pole (map data: the defending team's flag spot). */
  position: Vec3;
  /** How far up the pole the attackers' flag is: 0 = bottom, 1 = raised (the attackers win). */
  progress: number;
  status: FlagStatus;
}

export function createFlagState(): FlagState {
  return { position: vec3(), progress: 0, status: 'idle' };
}

/** Puts the flag at the bottom of the pole at `position` for a new round. */
export function resetFlag(flag: FlagState, position: Vec3): void {
  flag.position.x = position.x;
  flag.position.y = position.y;
  flag.position.z = position.z;
  flag.progress = 0;
  flag.status = 'idle';
}

/** True if `c` is in play and close enough to the pole to work the rope. */
export function atFlag(c: Character, flag: FlagState, rules: FlagRules): boolean {
  return isInPlay(c) && Math.hypot(c.position.x - flag.position.x, c.position.z - flag.position.z) <= rules.radius;
}

/**
 * One tick of the flag: attackers in play at the pole raise it, defenders pull it down, both at once
 * hold it still, nobody leaves it where it is. Pushes a 'flagRope' event each time the flag passes a
 * rope step. Returns true once the flag is fully raised.
 */
export function stepFlag(
  flag: FlagState,
  characters: readonly Character[],
  attackers: number,
  rules: FlagRules,
  events: GameEvent[],
  dt: number,
): boolean {
  let raising = false;
  let lowering = false;
  for (const c of characters) {
    if (!atFlag(c, flag, rules)) continue;
    if (c.team === attackers) raising = true;
    else lowering = true;
  }
  const before = flag.progress;
  if (raising && lowering) flag.status = 'contested';
  else if (raising) {
    flag.status = 'raising';
    flag.progress = Math.min(1, flag.progress + dt / rules.raiseTime);
  } else if (lowering) {
    // Defenders at the bottom of an empty pole aren't pulling anything.
    flag.status = flag.progress > 0 ? 'lowering' : 'idle';
    flag.progress = Math.max(0, flag.progress - dt / rules.lowerTime);
  } else flag.status = 'idle';

  if (Math.floor(flag.progress / rules.ropeStep) !== Math.floor(before / rules.ropeStep)) {
    events.push({ type: 'flagRope', position: vec3(flag.position.x, flag.position.y, flag.position.z), raising: flag.progress > before });
  }
  return flag.progress >= 1;
}
