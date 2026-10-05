import { describe, expect, it } from 'vitest';
import { BALLISTICS } from '../config/ballistics';
import { EXTRACTION, homeTeamCap } from '../config/extraction';
import { HITS } from '../config/hits';
import { FLAG } from '../config/modes';
import { LOADOUT } from '../config/replicas';
import type { ExtractionData, SpawnPoint } from '../map/mapTypes';
import { createBBPool, spawnBB } from './ballistics';
import { type BBTargets, stepBBs } from './bbs';
import { type Character, createCharacter } from './character';
import { eliminate, stepElimination } from './elimination';
import type { GameEvent } from './events';
import { createRunContext, type ExtractionContext, pickOpponentStarts } from './extraction';
import { createRoundState, type RoundContext, type RoundRules, type RoundState, startRun, stepRound } from './round';
import { openFieldElimination } from './testSupport';
import { vec3 } from './vec';

/**
 * Audit 2 (M72): a squad member just in, or just back after a hit, has EXTRACTION.insertionGrace seconds in which BBs
 * neither hit it nor are hit by it (SIM-03, owner decision 8); and the home team's size follows its level
 * (EXTRACTION.opponentsByLevel, BAL-03, owner decision 1a).
 */
const DT = 1 / 60;
const RULES: RoundRules = { roundTime: 240, resetDelay: 2, winsNeeded: 1, halfTimeAfter: 1, eliminationFirstEnd: 0, flag: FLAG, winBy: 1, timeOutToMorePlayers: false };
const INSERTION: SpawnPoint[] = [0, 1, 2].map((z) => ({ position: vec3(-20, 0, z), yaw: -Math.PI / 2 }));
const STARTS: SpawnPoint[] = [5, 10, 15, -5, 18, 12, 8].map((x) => ({ position: vec3(x, 0, 6), yaw: 0 }));
const X: ExtractionContext = {
  rules: EXTRACTION,
  runner: 0,
  squadTeam: 0,
  insertion: INSERTION,
  insertionEnd: 0,
  opponentStarts: pickOpponentStarts(STARTS, INSERTION, 3),
  exits: [{ name: 'East gate', position: vec3(20, 0, 0), radius: 2 }],
  respawnAfter: HITS.callTime,
  spawnLift: 0.05,
  cases: [],
};
const CTX: RoundContext = { rules: RULES, spawns: [], spawnLift: 0.05, extraction: X };
const ELIM = openFieldElimination([[{ position: vec3(-30, 0, 0), yaw: 0 }], [{ position: vec3(30, 0, 0), yaw: 0 }]]);

function squadAndHome(): Character[] {
  return [0, 1, 2, 3, 4].map((id) => createCharacter(id, vec3(), 0, LOADOUT, id < 2 ? 0 : 1));
}

function play(seconds: number, round: RoundState, cs: Character[], events: GameEvent[]): void {
  const bbs = createBBPool(4);
  for (let i = 0; i < Math.round(seconds / DT) && round.phase === 'live'; i++) {
    for (const c of cs) stepElimination(c, HITS, DT);
    stepRound(round, cs, bbs, CTX, events, DT);
  }
}

/** One BB from `from` straight at `to`'s chest, stepped until it stops. */
function shoot(from: Character, to: Character, cs: Character[]): GameEvent[] {
  const events: GameEvent[] = [];
  const pool = createBBPool(4);
  const dz = to.position.z - from.position.z;
  const dx = to.position.x - from.position.x;
  const len = Math.hypot(dx, dz);
  spawnBB(pool, from.id, vec3(from.position.x, 1.2, from.position.z), vec3(dx / len, 0, dz / len), 88, 0, 0.25e-3);
  const targets: BBTargets = { characters: cs, hits: HITS, elimination: ELIM };
  for (let i = 0; i < 60; i++) stepBBs(pool, BALLISTICS, { raycastStatic: () => -1 }, -10, events, DT, targets);
  return events;
}

describe('Extraction: the insertion grace (M72, audit SIM-03)', () => {
  it('starts every squad member in the grace and nobody of the home team, and runs it out with the clock', () => {
    const cs = squadAndHome();
    const round = createRoundState(RULES, 'extraction');
    startRun(round, cs, CTX);
    for (const c of cs) expect(c.grace, `id ${c.id}`).toBe(c.team === 0 ? EXTRACTION.insertionGrace : 0);
    const events: GameEvent[] = [];
    play(EXTRACTION.insertionGrace - 0.5, round, cs, events);
    expect(cs[0]!.grace).toBeGreaterThan(0);
    play(1, round, cs, events);
    for (const c of cs) expect(c.grace).toBe(0);
  });

  it('gives a squad member it again when the hit call ends and they are back at the insertion', () => {
    const cs = squadAndHome();
    const round = createRoundState(RULES, 'extraction');
    startRun(round, cs, CTX);
    const events: GameEvent[] = [];
    play(EXTRACTION.insertionGrace + 0.5, round, cs, events);
    eliminate(cs[1]!, 3, cs, ELIM);
    play(HITS.callTime + 2 * DT, round, cs, events);
    expect(events.some((e) => e.type === 'respawned' && e.characterId === 1)).toBe(true);
    expect(cs[1]!.grace).toBeGreaterThan(EXTRACTION.insertionGrace - 0.1);
  });

  it('stops a BB on a squad member in it, and theirs on anyone, with no hit; once it is over, BBs hit as ever', () => {
    const make = () => {
      const you = createCharacter(0, vec3(0, 0, 0), 0, LOADOUT, 0);
      const them = createCharacter(3, vec3(0, 0, -10), 0, LOADOUT, 1);
      return { you, them, cs: [you, them] };
    };
    // Shot at while in the grace: the BB stops on you (an impact, no hit), and you stay in play.
    let s = make();
    s.you.grace = 1;
    let events = shoot(s.them, s.you, s.cs);
    expect(s.you.status).toBe('alive');
    expect(events.some((e) => e.type === 'characterHit')).toBe(false);
    expect(events.some((e) => e.type === 'bbImpact')).toBe(true);
    // Shooting while in the grace: your BB hits nobody either.
    s = make();
    s.you.grace = 1;
    events = shoot(s.you, s.them, s.cs);
    expect(s.them.status).toBe('alive');
    expect(events.some((e) => e.type === 'characterHit')).toBe(false);
    // Out of it, the same shots hit.
    s = make();
    events = shoot(s.them, s.you, s.cs);
    expect(s.you.status).toBe('calling');
    expect(events.some((e) => e.type === 'characterHit')).toBe(true);
  });
});

describe('Extraction: the home team by its level (M72, audit BAL-03)', () => {
  const data: ExtractionData = {
    runTime: 240,
    baseOpponents: 2,
    insertions: [{ name: 'West', spawns: INSERTION, end: 0 }],
    exits: [...X.exits],
    opponentStarts: STARTS,
    cases: [],
    regens: [],
    regenDistance: 15,
  };
  const setup = { squad: 3, seed: 1, runner: 0, squadTeam: 0, respawnAfter: HITS.callTime, spawnLift: 0.05 };

  it('is the base plus the squad, one fewer at Normal and one more at Pro, never under 1', () => {
    expect(EXTRACTION.opponentsByLevel).toEqual({ easy: 0, normal: -1, hard: 0, pro: 1 });
    expect(homeTeamCap(2, 3, 'easy')).toBe(5);
    expect(homeTeamCap(2, 3, 'normal')).toBe(4);
    expect(homeTeamCap(2, 3, 'hard')).toBe(5);
    expect(homeTeamCap(2, 3, 'pro')).toBe(6);
    expect(homeTeamCap(0, 1, 'normal')).toBe(1);
  });

  it('sizes the run by it: as many starts as the cap, and without a level the base plus the squad as before', () => {
    expect(createRunContext(data, { ...setup, opponents: 'normal' }).opponentStarts).toHaveLength(4);
    expect(createRunContext(data, { ...setup, opponents: 'pro' }).opponentStarts).toHaveLength(6);
    expect(createRunContext(data, setup).opponentStarts).toHaveLength(5);
  });
});
