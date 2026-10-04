import type { FlagRules, MatchMode } from '../config/modes';
import type { SpawnPoint } from '../map/mapTypes';
import type { BBPool } from './ballistics';
import { type Character, respawnCharacter } from './character';
import { isInPlay } from './elimination';
import type { GameEvent, RoundEndReason } from './events';
import { createFlagState, type FlagState, resetFlag, stepFlag } from './flag';
import type { Vec3 } from './vec';

/** How a match is played (config/hits.ts ROUNDS). */
export interface RoundRules {
  /** Round length (s). Elimination: a round that runs out of time is a draw, played again. Flag: the defenders win. */
  roundTime: number;
  /** Seconds between a round ending and the next one starting. */
  resetDelay: number;
  /** Round wins needed to win the match. */
  winsNeeded: number;
  /**
   * Half-time: the teams swap ends of the map after this many rounds, in both modes (in Attack / Defend that
   * swaps attack and defence too).
   */
  halfTimeAfter: number;
  /** Elimination: the end of the map (0 west, 1 east) Blue, the player's team, starts the match at. */
  eliminationFirstEnd: number;
  flag: FlagRules;
}

/**
 * What round flow needs besides its own state: the rules and the map's spawns and pole. Everyone respawns with the
 * replicas they carry (Armament.replicas).
 */
export interface RoundContext {
  rules: RoundRules;
  /** Flag mode: the foot of the pole, at end 1 where the defenders start (map data; absent: no flag mode). */
  pole?: Vec3;
  /**
   * Per end of the map, its spawn points (floor points, map data). Each round every character is given the
   * spawn of its slot at its team's end (see placeTeams). Without them characters keep their spawns.
   */
  spawns: readonly (readonly SpawnPoint[])[];
  /** Characters stand this far above a spawn's floor point (the physics rest gap). */
  spawnLift: number;
}

/**
 * Match flow: rounds against the clock. In both modes a team with nobody left in play loses the round.
 * Elimination: if time runs out first the round is a draw. A draw (both teams out at once, in either mode) is played
 * again under the same number. Attack / Defend: the attackers win by raising
 * their flag on the defenders' pole, the defenders by holding out until time runs out (with overtime
 * while the attackers are still working the rope). The teams swap ends at half-time in both modes (in
 * Attack / Defend that swaps attack and defence too). After a short pause everyone respawns for the next
 * round, until one team reaches `winsNeeded` wins and the match is over (until restartMatch).
 */
export interface RoundState {
  mode: MatchMode;
  /** The round being played (from 1). A drawn round is played again under the same number (owner, audit SIM-19). */
  number: number;
  /** Rounds drawn so far this match (each replayed, so not counted in `number`). */
  draws: number;
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

/** A match ready to play round 1 in `mode` (characters are put at their spawns with placeTeams and respawnCharacter). */
export function createRoundState(rules: RoundRules, mode: MatchMode = 'elimination', pole?: Vec3): RoundState {
  const round: RoundState = {
    mode,
    number: 1,
    draws: 0,
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
  setUpObjective(round, rules, pole);
  return round;
}

/** The last finished round was a draw (time out in elimination, or both teams out at once): it is played again. */
export function roundDrawn(round: RoundState): boolean {
  return round.winner !== 0 && round.winner !== 1;
}

/** Flag mode: the team attacking in round `number` (they swap after rules.halfTimeAfter rounds). */
export function attackersInRound(number: number, rules: RoundRules): number {
  const first = rules.flag.firstAttackers;
  return number <= rules.halfTimeAfter ? first : 1 - first;
}

/** True if the round after round `number` starts with the teams at swapped ends (both modes). */
export function halfTimeAfterRound(number: number, rules: RoundRules): boolean {
  return number === rules.halfTimeAfter;
}

/**
 * The end of the map (0 or 1) `team` starts from in round `number`. Attack / Defend: the attackers start at
 * end 0 and the defenders at end 1, by the pole. Elimination: Blue starts at rules.eliminationFirstEnd. Either
 * way the teams swap ends after rules.halfTimeAfter rounds, so an uneven map is fair over a match.
 */
export function teamEnd(team: number, mode: MatchMode, number: number, rules: RoundRules): number {
  if (mode === 'attackDefend') return team === attackersInRound(number, rules) ? 0 : 1;
  const blueEnd = number <= rules.halfTimeAfter ? rules.eliminationFirstEnd : 1 - rules.eliminationFirstEnd;
  return team === 0 ? blueEnd : 1 - blueEnd;
}

/**
 * Gives every character this round's end (its team's, see teamEnd) and, when the map's spawns are known, the
 * spawn of its slot there (its place among its teammates, in roster order). Call respawnCharacter after it.
 */
export function placeTeams(round: RoundState, characters: readonly Character[], ctx: RoundContext): void {
  const sizes = [0, 0];
  for (const c of characters) sizes[c.team] = sizes[c.team]! + 1;
  const slots = [0, 0];
  for (const c of characters) {
    c.end = teamEnd(c.team, round.mode, round.number, ctx.rules);
    // A team smaller than its end's spawn line takes the middle of it (M20: a 1v1 starts from the middle spawn at
    // both ends, not from the first one, which sits off to one side differently at each end).
    const spawns = ctx.spawns[c.end] ?? [];
    const first = Math.max(0, Math.floor((spawns.length - sizes[c.team]!) / 2));
    const slot = first + slots[c.team]!;
    slots[c.team] = slots[c.team]! + 1;
    const s = spawns[slot];
    if (!s) continue;
    c.spawnPosition.x = s.position.x;
    c.spawnPosition.y = s.position.y + ctx.spawnLift;
    c.spawnPosition.z = s.position.z;
    c.spawnYaw = s.yaw;
  }
}

export function stepRound(round: RoundState, characters: Character[], bbs: BBPool, ctx: RoundContext, events: GameEvent[], dt: number): void {
  if (round.phase === 'matchOver') return;
  if (round.phase === 'over') {
    round.timer -= dt;
    // A drawn round is played again (owner, 2026-10-04, audit SIM-19): same number, same ends, so draws never use up
    // the match's rounds or move half-time, and the decider stays in the second half.
    if (round.timer <= 0) startRound(round, characters, bbs, ctx, events, roundDrawn(round) ? round.number : round.number + 1);
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

/**
 * Starts a new match in `mode` from round 1: scores cleared, every fire selector back on its replica's
 * defaultFireMode (rounds within a match keep it), everyone respawned.
 */
export function restartMatch(round: RoundState, characters: Character[], bbs: BBPool, ctx: RoundContext, events: GameEvent[], mode: MatchMode): void {
  for (const c of characters) {
    const modes = c.armament.modes;
    for (let i = 0; i < modes.length; i++) {
      const replica = c.armament.replicas[i];
      if (replica) modes[i] = replica.defaultFireMode;
    }
  }
  round.mode = mode;
  round.score[0] = 0;
  round.score[1] = 0;
  round.draws = 0;
  round.matchWinner = -1;
  round.winner = -1;
  round.reason = 'eliminated';
  startRound(round, characters, bbs, ctx, events, 1);
}

function endRound(round: RoundState, winner: number, reason: RoundEndReason, rules: RoundRules, events: GameEvent[]): void {
  round.winner = winner;
  round.reason = reason;
  events.push({ type: 'roundOver', winner, reason });
  if (winner !== 0 && winner !== 1) round.draws++;
  else {
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
  round.number = number;
  round.phase = 'live';
  round.clock = ctx.rules.roundTime;
  round.timer = 0;
  round.overtime = 0;
  setUpObjective(round, ctx.rules, ctx.pole);
  placeTeams(round, characters, ctx);
  for (const c of characters) respawnCharacter(c);
  for (const bb of bbs.bbs) bb.active = false;
  events.push({ type: 'roundStart', round: number });
}

/** Flag mode: who attacks this round, and the pole at the defenders' end with the flag at the bottom. */
function setUpObjective(round: RoundState, rules: RoundRules, pole: Vec3 | undefined): void {
  if (round.mode !== 'attackDefend') {
    round.attackers = -1;
    return;
  }
  round.attackers = attackersInRound(round.number, rules);
  if (!pole) throw new Error('Flag mode needs a flagpole');
  resetFlag(round.flag, pole);
}
