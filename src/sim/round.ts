import type { FlagRules, MatchMode } from '../config/modes';
import type { ReplicaConfig } from '../config/replicas';
import type { BBPool } from './ballistics';
import { type Character, respawnCharacter } from './character';
import { isInPlay } from './elimination';
import type { GameEvent, RoundEndReason } from './events';
import { createFlagState, type FlagState, resetFlag, stepFlag } from './flag';
import type { Vec3 } from './vec';

/** How a match is played (config/hits.ts ROUNDS). */
export interface RoundRules {
  /** Round length (s). Elimination: a round that runs out of time is a draw. Flag: the defenders win. */
  roundTime: number;
  /** Seconds between a round ending and the next one starting. */
  resetDelay: number;
  /** Round wins needed to win the match. */
  winsNeeded: number;
  flag: FlagRules;
}

/** What round flow needs besides its own state: the rules, the loadout everyone respawns with, and the map's flag spots. */
export interface RoundContext {
  rules: RoundRules;
  loadout: readonly ReplicaConfig[];
  /** Per team, where the pole stands when that team defends (map data). */
  flagSpots: readonly Vec3[];
}

/**
 * Match flow: rounds against the clock. In both modes a team with nobody left in play loses the round.
 * Elimination: if time runs out first the round is a draw. Attack / Defend: the attackers win by raising
 * their flag on the defenders' pole, the defenders by holding out until time runs out (with overtime
 * while the attackers are still working the rope); attack and defence swap at half-time. After a short pause everyone respawns for the next round, until one team reaches
 * `winsNeeded` wins and the match is over (until restartMatch).
 */
export interface RoundState {
  mode: MatchMode;
  number: number;
  /** 'live': playing; 'over': between rounds; 'matchOver': a team has won the match. */
  phase: 'live' | 'over' | 'matchOver';
  /** Seconds left in the live round. */
  clock: number;
  /** Attack / Defend: seconds of overtime played so far (time ran out while the attackers worked the rope). */
  overtime: number;
  /** Seconds left before the next round starts (while 'over'). */
  timer: number;
  /** Winning team of the last finished round, or -1 for a draw / none yet. */
  winner: number;
  /** Why the last finished round ended. */
  reason: RoundEndReason;
  /** Rounds won per team. */
  score: [number, number];
  /** Team that won the match, or -1. */
  matchWinner: number;
  /** Flag mode: the team attacking the flag this round (-1 in elimination). */
  attackers: number;
  /** Flag mode: this round's pole (unused in elimination). */
  flag: FlagState;
}

/** A match ready to play round 1 in `mode` (characters are assumed to be at their spawns already). */
export function createRoundState(rules: RoundRules, mode: MatchMode = 'elimination', flagSpots: readonly Vec3[] = []): RoundState {
  const round: RoundState = {
    mode,
    number: 1,
    phase: 'live',
    clock: rules.roundTime,
    overtime: 0,
    timer: 0,
    winner: -1,
    reason: 'eliminated',
    score: [0, 0],
    matchWinner: -1,
    attackers: -1,
    flag: createFlagState(),
  };
  setUpObjective(round, rules, flagSpots);
  return round;
}

/** Flag mode: the team attacking in round `number` (they swap after rules.flag.halfTimeAfter rounds). */
export function attackersInRound(number: number, rules: RoundRules): number {
  const first = rules.flag.firstAttackers;
  return number <= rules.flag.halfTimeAfter ? first : 1 - first;
}

/** Flag mode: true if the round after round `number` starts with the sides swapped. */
export function halfTimeAfterRound(number: number, flag: FlagRules): boolean {
  return number === flag.halfTimeAfter;
}

export function stepRound(round: RoundState, characters: Character[], bbs: BBPool, ctx: RoundContext, events: GameEvent[], dt: number): void {
  if (round.phase === 'matchOver') return;
  if (round.phase === 'over') {
    round.timer -= dt;
    if (round.timer <= 0) startRound(round, characters, bbs, ctx, events, round.number + 1);
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
  const flagMode = round.mode === 'attackDefend';
  if (blueOut || orangeOut) endRound(round, blueOut && orangeOut ? -1 : blueOut ? 1 : 0, 'eliminated', ctx.rules, events);
  else if (flagMode && stepFlag(round.flag, characters, round.attackers, ctx.rules.flag, events, dt)) endRound(round, round.attackers, 'captured', ctx.rules, events);
  else if (round.clock <= 0) {
    // Overtime: attackers still working the rope (alone or contested) when time runs out get to finish.
    const ropeWorked = flagMode && (round.flag.status === 'raising' || round.flag.status === 'contested');
    if (ropeWorked && round.overtime < ctx.rules.flag.maxOvertime) round.overtime += dt;
    else endRound(round, flagMode ? 1 - round.attackers : -1, 'time', ctx.rules, events);
  }
}

/** Starts a new match in `mode` from round 1: scores cleared, everyone respawned. */
export function restartMatch(round: RoundState, characters: Character[], bbs: BBPool, ctx: RoundContext, events: GameEvent[], mode: MatchMode): void {
  round.mode = mode;
  round.score[0] = 0;
  round.score[1] = 0;
  round.matchWinner = -1;
  round.winner = -1;
  round.reason = 'eliminated';
  startRound(round, characters, bbs, ctx, events, 1);
}

function endRound(round: RoundState, winner: number, reason: RoundEndReason, rules: RoundRules, events: GameEvent[]): void {
  round.winner = winner;
  round.reason = reason;
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

function startRound(round: RoundState, characters: Character[], bbs: BBPool, ctx: RoundContext, events: GameEvent[], number: number): void {
  for (const c of characters) respawnCharacter(c, ctx.loadout);
  for (const bb of bbs.bbs) bb.active = false;
  round.number = number;
  round.phase = 'live';
  round.clock = ctx.rules.roundTime;
  round.timer = 0;
  round.overtime = 0;
  setUpObjective(round, ctx.rules, ctx.flagSpots);
  events.push({ type: 'roundStart', round: number });
}

/** Flag mode: who attacks this round, and the pole on the defenders' side with the flag at the bottom. */
function setUpObjective(round: RoundState, rules: RoundRules, flagSpots: readonly Vec3[]): void {
  if (round.mode !== 'attackDefend') {
    round.attackers = -1;
    return;
  }
  round.attackers = attackersInRound(round.number, rules);
  const spot = flagSpots[1 - round.attackers];
  if (!spot) throw new Error('Flag mode needs a flag spot for each team');
  resetFlag(round.flag, spot);
}
