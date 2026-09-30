import type { ReplicaConfig } from '../config/replicas';
import type { BBPool } from './ballistics';
import { type Character, respawnCharacter } from './character';
import { isInPlay } from './elimination';
import type { GameEvent } from './events';

/**
 * Round flow, Phase 1 minimum: the round ends when a team has nobody left in play; after a short
 * pause everyone respawns. (Score, round timer and first-to-N arrive with the rounds feature.)
 */
export interface RoundState {
  number: number;
  phase: 'live' | 'over';
  /** Seconds left before the next round starts (while 'over'). */
  timer: number;
  /** Winning team of the last finished round, or -1 for a draw / none yet. */
  winner: number;
}

export function createRoundState(): RoundState {
  return { number: 1, phase: 'live', timer: 0, winner: -1 };
}

export function stepRound(
  round: RoundState,
  characters: Character[],
  bbs: BBPool,
  loadout: readonly ReplicaConfig[],
  resetDelay: number,
  events: GameEvent[],
  dt: number,
): void {
  if (round.phase === 'live') {
    // A team with members but nobody left in play is wiped out (an empty team never is).
    let blue = 0;
    let orange = 0;
    let blueInPlay = 0;
    let orangeInPlay = 0;
    for (const c of characters) {
      const playing = isInPlay(c) ? 1 : 0;
      if (c.team === 0) {
        blue++;
        blueInPlay += playing;
      } else {
        orange++;
        orangeInPlay += playing;
      }
    }
    const blueOut = blue > 0 && blueInPlay === 0;
    const orangeOut = orange > 0 && orangeInPlay === 0;
    if (!blueOut && !orangeOut) return;
    round.phase = 'over';
    round.timer = resetDelay;
    round.winner = blueOut && orangeOut ? -1 : blueOut ? 1 : 0;
    events.push({ type: 'roundOver', winner: round.winner });
    return;
  }
  round.timer -= dt;
  if (round.timer > 0) return;
  for (const c of characters) respawnCharacter(c, loadout);
  for (const bb of bbs.bbs) bb.active = false;
  round.number++;
  round.phase = 'live';
  round.timer = 0;
  events.push({ type: 'roundStart', round: round.number });
}
