import { RANGE, RANGE_CHALLENGE } from '../config/range';
import type { GameEvent } from './events';
import { knockDown, type RangeTarget, setPopupsAuto } from './rangeTargets';
import { type RngState, rngNext } from './rng';

/**
 * The practice range's timed challenge (M93, the owner's playtest note 10): off by default. On, the START plate stands
 * near the line; shoot it, wait out the countdown, then hit as many lit targets as you can before time runs out
 * (config/range.ts RANGE_CHALLENGE). Plain data, stepped once per simulation tick after the simulation (RangeSession),
 * from the tick's events; it lights and puts out the targets in GameState.targets and nothing else.
 */
export type ChallengePhase = 'off' | 'ready' | 'countdown' | 'running';

/** What the presentation hears for a tick: a second of the countdown, the start, the end of the run. */
export type ChallengeCue = 'count' | 'go' | 'time';

/** A finished run. */
export interface ChallengeRun {
  /** Lit targets hit, BBs fired, lit targets that went out unhit. */
  hits: number;
  shots: number;
  missed: number;
  /** It beat the best kept before it. */
  best: boolean;
}

export interface RangeChallenge {
  phase: ChallengePhase;
  /** Seconds left of the countdown or of the run. */
  clock: number;
  /** The run under way: lit targets hit, BBs fired, lit targets that went out unhit. */
  hits: number;
  shots: number;
  missed: number;
  /** The best score kept (stats/records.ts), raised as a run beats it. */
  best: number;
  /** The last finished run, shown until the next one starts (null before one). */
  last: ChallengeRun | null;
  /** This tick's cue, for sound and the HUD (null: none). */
  cue: ChallengeCue | null;
}

/** The challenge, off, with the best score kept so far. */
export function createChallenge(best: number): RangeChallenge {
  return { phase: 'off', clock: 0, hits: 0, shots: 0, missed: 0, best, last: null, cue: null };
}

/** The target's lit time when it lights: longer for a far one (the BB's flight), and a lying pop-up's rise on top. */
function litTime(t: RangeTarget): number {
  const rise = t.motion === 'popup' && t.down > 0 ? RANGE.riseTime : 0;
  return RANGE_CHALLENGE.litTime + RANGE_CHALLENGE.litPerMetre * t.distance + rise;
}

/** Whether `t` can light now: in play, not lit or just put out, and standing (or a pop-up lying ready to rise). */
function canLight(t: RangeTarget): boolean {
  if (t.start || t.hidden || t.lit !== 0) return false;
  if (t.kind === 'steel') return true;
  return t.down <= 0 || (t.motion === 'popup' && !t.auto && t.down <= RANGE.riseTime);
}

/** The target with `id`, if any (a plain loop: nothing allocated per event). */
function targetById(targets: readonly RangeTarget[], id: number): RangeTarget | undefined {
  for (const t of targets) if (t.id === id) return t;
  return undefined;
}

/** Reused by lightOne (it never allocates). */
const candidates: number[] = [];

/**
 * Which targets may light (M94): those you can see from where you stand, in Practice on a map, where most stand out of
 * sight; null on the range, where any may.
 */
export type ChallengeSight = ((t: RangeTarget) => boolean) | null;

/** Lights one target chosen at random (from `rng`) among those that can light (and `sees` allows); false when none can. */
function lightOne(targets: readonly RangeTarget[], rng: RngState, sees: ChallengeSight): boolean {
  candidates.length = 0;
  for (let i = 0; i < targets.length; i++) if (canLight(targets[i]!) && (sees === null || sees(targets[i]!))) candidates.push(i);
  if (candidates.length === 0) return false;
  const t = targets[candidates[Math.min(candidates.length - 1, Math.floor(rngNext(rng) * candidates.length))]!]!;
  t.lit = litTime(t);
  return true;
}

/** Puts `t` out: it rests a moment before it can light again (negative lit), and a standing pop-up drops. */
function putOut(t: RangeTarget): void {
  t.lit = -RANGE_CHALLENGE.rest;
  if (t.motion === 'popup' && t.down <= 0) knockDown(t, RANGE.figureDownTime);
}

/** Every target out and rested, the START plate shown or hidden. */
function clearTargets(targets: readonly RangeTarget[], startShown: boolean): void {
  for (const t of targets) {
    t.lit = 0;
    if (t.start) t.hidden = !startShown;
  }
}

/**
 * Turns the challenge on (waiting for the START plate) or off (free practice: a run under way is dropped, with no score).
 * Pop-ups go back to standing by themselves (random times from `rng`).
 */
export function setChallengeOn(c: RangeChallenge, targets: readonly RangeTarget[], on: boolean, rng: RngState): void {
  if ((c.phase !== 'off') === on) return;
  c.phase = on ? 'ready' : 'off';
  c.cue = null;
  clearTargets(targets, on);
  setPopupsAuto(targets, true, rng);
}

/**
 * One tick of the challenge, after the simulation's (its events in `events`): the START plate hit by `playerId` starts
 * the countdown; in a run, their BBs are counted, a lit target they hit scores, a lit target whose time is up goes out
 * (a miss), another lights in each one's place (from `rng`, among those `sees` allows), and the run ends when its time
 * is up, raising the best.
 */
export function stepChallenge(c: RangeChallenge, targets: readonly RangeTarget[], events: readonly GameEvent[], playerId: number, dt: number, rng: RngState, sees: ChallengeSight = null): void {
  c.cue = null;
  switch (c.phase) {
    case 'off':
      return;
    case 'ready':
      for (const e of events) {
        if (e.type !== 'targetHit' || e.shooterId !== playerId || !targetById(targets, e.targetId)?.start) continue;
        c.phase = 'countdown';
        c.clock = RANGE_CHALLENGE.countdown;
        c.cue = 'count';
        clearTargets(targets, false);
        setPopupsAuto(targets, false);
        return;
      }
      return;
    case 'countdown': {
      const before = Math.ceil(c.clock);
      c.clock -= dt;
      if (c.clock > 0) {
        if (Math.ceil(c.clock) < before) c.cue = 'count';
        return;
      }
      c.phase = 'running';
      c.clock = RANGE_CHALLENGE.runTime;
      c.hits = c.shots = c.missed = 0;
      c.last = null;
      c.cue = 'go';
      for (let i = 0; i < RANGE_CHALLENGE.litAtOnce; i++) lightOne(targets, rng, sees);
      return;
    }
    case 'running':
      stepRun(c, targets, events, playerId, dt, rng, sees);
  }
}

/** A tick of the run itself (stepChallenge). */
function stepRun(c: RangeChallenge, targets: readonly RangeTarget[], events: readonly GameEvent[], playerId: number, dt: number, rng: RngState, sees: ChallengeSight): void {
  for (const e of events) {
    if (e.type === 'shot' && e.characterId === playerId) c.shots++;
    else if (e.type === 'targetHit' && e.shooterId === playerId) {
      const t = targetById(targets, e.targetId);
      if (!t || t.lit <= 0) continue;
      c.hits++;
      putOut(t);
    }
  }
  let lit = 0;
  for (const t of targets) {
    if (t.lit < 0) t.lit = Math.min(0, t.lit + dt);
    else if (t.lit > 0) {
      t.lit -= dt;
      if (t.lit > 0) lit++;
      else {
        c.missed++;
        putOut(t);
      }
    }
  }
  for (; lit < RANGE_CHALLENGE.litAtOnce; lit++) if (!lightOne(targets, rng, sees)) break;
  c.clock -= dt;
  if (c.clock > 0) return;
  // Time: the run's score is kept if it's the best, and the START plate stands for another go.
  const best = c.hits > c.best;
  if (best) c.best = c.hits;
  c.last = { hits: c.hits, shots: c.shots, missed: c.missed, best };
  c.phase = 'ready';
  c.clock = 0;
  c.cue = 'time';
  clearTargets(targets, true);
  for (const t of targets) if (t.motion === 'popup' && t.down <= 0) knockDown(t, RANGE.figureDownTime);
  setPopupsAuto(targets, true, rng);
}
