import type { ReplicaConfig } from '../config/replicas';
import type { BBPool } from './ballistics';
import { type Character, respawnCharacter } from './character';
import { isInPlay } from './elimination';
import type { GameEvent } from './events';

/** How a match is played (config/hits.ts ROUNDS). */
export interface RoundRules {
  /** Round length (s); a round that runs out of time is a draw. */
  roundTime: number;
  /** Seconds between a round ending and the next one starting. */
  resetDelay: number;
  /** Round wins needed to win the match. */
  winsNeeded: number;
}

/**
 * Match flow: elimination rounds against the clock. A team with nobody left in play loses the round;
 * if time runs out first the round is a draw. After a short pause everyone respawns for the next round,
 * until one team reaches `winsNeeded` wins and the match is over (until restartMatch).
 */
export interface RoundState {
  number: number;
  /** 'live': playing; 'over': between rounds; 'matchOver': a team has won the match. */
  phase: 'live' | 'over' | 'matchOver';
  /** Seconds left in the live round. */
  clock: number;
  /** Seconds left before the next round starts (while 'over'). */
  timer: number;
  /** Winning team of the last finished round, or -1 for a draw / none yet. */
  winner: number;
  /** Rounds won per team. */
  score: [number, number];
  /** Team that won the match, or -1. */
  matchWinner: number;
}

export function createRoundState(rules: RoundRules): RoundState {
  return { number: 1, phase: 'live', clock: rules.roundTime, timer: 0, winner: -1, score: [0, 0], matchWinner: -1 };
}

export function stepRound(
  round: RoundState,
  characters: Character[],
  bbs: BBPool,
  loadout: readonly ReplicaConfig[],
  rules: RoundRules,
  events: GameEvent[],
  dt: number,
): void {
  if (round.phase === 'matchOver') return;
  if (round.phase === 'over') {
    round.timer -= dt;
    if (round.timer <= 0) startRound(round, characters, bbs, loadout, rules, events, round.number + 1);
    return;
  }

  // Live. A team with members but nobody left in play is wiped out (an empty team never is).
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
  round.clock = Math.max(0, round.clock - dt);
  if (blueOut || orangeOut) endRound(round, blueOut && orangeOut ? -1 : blueOut ? 1 : 0, 'eliminated', rules, events);
  else if (round.clock <= 0) endRound(round, -1, 'time', rules, events);
}

/** Starts a new match from round 1: scores cleared, everyone respawned. */
export function restartMatch(
  round: RoundState,
  characters: Character[],
  bbs: BBPool,
  loadout: readonly ReplicaConfig[],
  rules: RoundRules,
  events: GameEvent[],
): void {
  round.score[0] = 0;
  round.score[1] = 0;
  round.matchWinner = -1;
  round.winner = -1;
  startRound(round, characters, bbs, loadout, rules, events, 1);
}

function endRound(round: RoundState, winner: number, reason: 'eliminated' | 'time', rules: RoundRules, events: GameEvent[]): void {
  round.winner = winner;
  events.push({ type: 'roundOver', winner, reason });
  if (winner === 0 || winner === 1) {
    round.score[winner]++;
    if (round.score[winner] >= rules.winsNeeded) {
      round.phase = 'matchOver';
      round.matchWinner = winner;
      events.push({ type: 'matchOver', winner });
      return;
    }
  }
  round.phase = 'over';
  round.timer = rules.resetDelay;
}

function startRound(
  round: RoundState,
  characters: Character[],
  bbs: BBPool,
  loadout: readonly ReplicaConfig[],
  rules: RoundRules,
  events: GameEvent[],
  number: number,
): void {
  for (const c of characters) respawnCharacter(c, loadout);
  for (const bb of bbs.bbs) bb.active = false;
  round.number = number;
  round.phase = 'live';
  round.clock = rules.roundTime;
  round.timer = 0;
  events.push({ type: 'roundStart', round: number });
}
