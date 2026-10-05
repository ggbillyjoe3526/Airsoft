import { describe, expect, it } from 'vitest';
import { BALLISTICS } from '../config/ballistics';
import { EXTRACTION, type ExtractionRules, homeTeamCap } from '../config/extraction';
import { HITS } from '../config/hits';
import { FLAG } from '../config/modes';
import { LOADOUT } from '../config/replicas';
import type { ExtractionData, SpawnPoint } from '../map/mapTypes';
import { createBBPool, spawnBB } from './ballistics';
import { type BBTargets, stepBBs } from './bbs';
import { type Character, createCharacter, respawnCharacter } from './character';
import { eliminate, isInPlay, stepElimination } from './elimination';
import type { GameEvent } from './events';
import { createRunContext, type ExtractionContext, pickOpponentStarts, stepRun } from './extraction';
import { createRoundState, type RoundContext, type RoundRules, type RoundState, startRun, stepRound } from './round';
import { openFieldElimination } from './testSupport';
import { vec3 } from './vec';

/**
 * M72 QA: the edges of the insertion grace (SIM-03) and of the home team's size by level (BAL-03) that
 * extractionGrace.test.ts leaves: exactly at expiry, a ricochet, the home team never graced, grace cleared between
 * runs, homeTeamCap's floor, the cap in the waves and in what the run starts.
 */
const DT = 1 / 60;
const RULES: RoundRules = { roundTime: 240, resetDelay: 2, winsNeeded: 1, halfTimeAfter: 1, eliminationFirstEnd: 0, flag: FLAG, winBy: 1, timeOutToMorePlayers: false };
const INSERTION: SpawnPoint[] = [0, 1, 2].map((z) => ({ position: vec3(-20, 0, z), yaw: -Math.PI / 2 }));
const STARTS: SpawnPoint[] = [5, 10, 15, -5, 18, 12, 8].map((x) => ({ position: vec3(x, 0, 6), yaw: 0 }));
const spot = (x: number, z: number): SpawnPoint => ({ position: vec3(x, 0, z), yaw: 0 });
const REGENS = [spot(10, 10), spot(20, 10), spot(15, -10)];
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

/** Two of the squad (ids 0, 1) and `home` of the home team. */
function team(home: number): Character[] {
  return Array.from({ length: 2 + home }, (_, id) => createCharacter(id, vec3(), 0, LOADOUT, id < 2 ? 0 : 1));
}

function play(seconds: number, round: RoundState, cs: Character[], events: GameEvent[], ctx: RoundContext = CTX): void {
  const bbs = createBBPool(4);
  for (let i = 0; i < Math.round(seconds / DT) && round.phase === 'live'; i++) {
    for (const c of cs) stepElimination(c, HITS, DT);
    stepRound(round, cs, bbs, ctx, events, DT);
  }
}

/** One BB from a metre in front of `from` (a bounced one would hit its own shooter at the muzzle) straight at `to`, stepped until it stops; `ricochet` makes it a bounced one. */
function shoot(from: Character, to: Character, cs: Character[], opts: { ricochet?: boolean; ricochetsCount?: boolean } = {}): GameEvent[] {
  const events: GameEvent[] = [];
  const pool = createBBPool(4);
  const dx = to.position.x - from.position.x;
  const dz = to.position.z - from.position.z;
  const len = Math.hypot(dx, dz);
  const bb = spawnBB(pool, from.id, vec3(from.position.x + dx / len, 1.2, from.position.z + dz / len), vec3(dx / len, 0, dz / len), 88, 0, 0.25e-3);
  if (opts.ricochet) bb.bounces = 1;
  const targets: BBTargets = { characters: cs, hits: { ...HITS, ricochetsCount: opts.ricochetsCount ?? true }, elimination: ELIM };
  for (let i = 0; i < 60; i++) stepBBs(pool, BALLISTICS, { raycastStatic: () => -1 }, -10, events, DT, targets);
  return events;
}

const pair = () => {
  const you = createCharacter(0, vec3(0, 0, 0), 0, LOADOUT, 0);
  const them = createCharacter(3, vec3(0, 0, -10), 0, LOADOUT, 1);
  return { you, them, cs: [you, them] };
};
const hits = (events: GameEvent[]) => events.filter((e) => e.type === 'characterHit');

describe('M72 QA: the grace at its edges', () => {
  it('stops a BB on a character with any grace left, and hits it the moment the grace is exactly 0', () => {
    for (const [grace, hit] of [[1e-9, false], [0, true]] as const) {
      const s = pair();
      s.you.grace = grace;
      const events = shoot(s.them, s.you, s.cs);
      expect(hits(events).length > 0, `victim grace ${grace}`).toBe(hit);
      expect(s.you.status, `victim grace ${grace}`).toBe(hit ? 'calling' : 'alive');
      // And the same for a shooter.
      const o = pair();
      o.you.grace = grace;
      expect(hits(shoot(o.you, o.them, o.cs)).length > 0, `shooter grace ${grace}`).toBe(hit);
    }
  });

  it('runs out in whole steps of stepRun: a 1 s tick takes 3 s to 0 in three ticks, and never below 0', () => {
    const cs = team(2);
    const round = createRoundState(RULES, 'extraction');
    startRun(round, cs, CTX);
    const events: GameEvent[] = [];
    const seen: number[] = [];
    for (let i = 0; i < 4; i++) {
      stepRun(round.run, cs, X, 100, events, 1);
      seen.push(cs[0]!.grace);
    }
    expect(seen).toEqual([EXTRACTION.insertionGrace - 1, EXTRACTION.insertionGrace - 2, 0, 0]);
    // After it, the same shot hits.
    const s = pair();
    s.you.grace = seen[3]!;
    expect(hits(shoot(s.them, s.you, s.cs))).toHaveLength(1);
  });

  it('stops a ricochet from or onto a graced character too (ricochets counted), and a counted-out ricochet from nobody in grace still hits', () => {
    let s = pair();
    s.them.grace = 1;
    expect(hits(shoot(s.them, s.you, s.cs, { ricochet: true }))).toHaveLength(0);
    expect(s.you.status).toBe('alive');
    s = pair();
    s.you.grace = 1;
    expect(hits(shoot(s.them, s.you, s.cs, { ricochet: true }))).toHaveLength(0);
    expect(s.you.status).toBe('alive');
    // The control: a ricochet from and onto nobody in grace is a hit when ricochets count.
    s = pair();
    const events = shoot(s.them, s.you, s.cs, { ricochet: true });
    expect(hits(events)).toHaveLength(1);
    expect(s.you.status).toBe('calling');
  });

  it('does not tick a graced character when ricochets do not count: the BB is a tick, never a hit', () => {
    const s = pair();
    s.you.grace = 1;
    const events = shoot(s.them, s.you, s.cs, { ricochet: true, ricochetsCount: false });
    expect(hits(events)).toHaveLength(0);
    expect(s.you.status).toBe('alive');
  });

  it('stops a graced squad member’s BB on their own teammate (friendly fire) just as on a home bot', () => {
    const you = createCharacter(0, vec3(0, 0, 0), 0, LOADOUT, 0);
    const mate = createCharacter(1, vec3(0, 0, -10), 0, LOADOUT, 0);
    you.grace = 1;
    expect(hits(shoot(you, mate, [you, mate]))).toHaveLength(0);
    expect(mate.status).toBe('alive');
  });

  it('only stops the BB of a shooter that is in the grace, not those of the others passing by', () => {
    // Graced squad member 0, a home shooter 3 at a squad member 1 who is not graced: hit.
    const a = createCharacter(0, vec3(5, 0, 0), 0, LOADOUT, 0);
    const b = createCharacter(1, vec3(0, 0, 0), 0, LOADOUT, 0);
    const h = createCharacter(3, vec3(0, 0, -10), 0, LOADOUT, 1);
    a.grace = 2;
    expect(hits(shoot(h, b, [a, b, h]))).toHaveLength(1);
    expect(b.status).toBe('calling');
    expect(a.status).toBe('alive');
  });
});

describe('M72 QA: who has a grace, and when it is cleared', () => {
  it('never gives the home team one: not at the start, not in the reserve, not when a wave returns them', () => {
    const waves = { regens: REGENS, regenDistance: 15, every: 30, cap: 3, lateExtra: 1, lateFrom: 60, sight: undefined };
    const ctx: RoundContext = { ...CTX, extraction: { ...X, waves, reserveAt: [spot(30, 30)] } };
    const cs = team(4);
    const round = createRoundState(RULES, 'extraction');
    startRun(round, cs, ctx);
    for (const c of cs) if (c.team === 1) expect(c.grace, `home ${c.id} at the start`).toBe(0);
    // Every home bot in play is hit; the wave brings them back.
    for (const c of cs) if (c.team === 1 && isInPlay(c)) eliminate(c, 0, cs, ELIM);
    const events: GameEvent[] = [];
    play(HITS.callTime + 40, round, cs, events, ctx);
    const returned = events.filter((e) => e.type === 'returned');
    expect(returned.length, 'a wave came').toBeGreaterThan(0);
    for (const c of cs) if (c.team === 1) expect(c.grace, `home ${c.id} after the wave`).toBe(0);
    // And their BBs hit the squad's graced members' ungraced mates as ever.
    const home = cs.find((c) => c.team === 1)!;
    const squad = cs[0]!;
    squad.position.z = home.position.z + 10;
    squad.position.x = home.position.x;
    expect(hits(shoot(home, squad, cs))).toHaveLength(1);
  });

  it('is cleared by any respawn of a character (the round reset, a wave) and by a new run, so it never carries over', () => {
    const c = createCharacter(0, vec3(), 0, LOADOUT, 0);
    c.grace = 2;
    respawnCharacter(c);
    expect(c.grace).toBe(0);
    // A second run on the same characters starts everyone fresh: the squad with a full grace, the home team with none,
    // whatever was left over from the run before.
    const cs = team(2);
    const round = createRoundState(RULES, 'extraction');
    startRun(round, cs, CTX);
    play(1, round, cs, []);
    cs[3]!.grace = 2;
    startRun(round, cs, CTX);
    expect(cs.map((x) => x.grace)).toEqual([EXTRACTION.insertionGrace, EXTRACTION.insertionGrace, 0, 0]);
  });

  it('gives a respawn the whole grace again however much of the first was left, and none to the one the second hit puts out', () => {
    const cs = team(2);
    const round = createRoundState(RULES, 'extraction');
    startRun(round, cs, CTX);
    const events: GameEvent[] = [];
    // Hit with the first grace half spent.
    play(EXTRACTION.insertionGrace / 2, round, cs, events);
    expect(cs[1]!.grace).toBeGreaterThan(0);
    eliminate(cs[1]!, 3, cs, ELIM);
    play(HITS.callTime + 3 * DT, round, cs, events);
    expect(events.some((e) => e.type === 'respawned' && e.characterId === 1)).toBe(true);
    expect(cs[1]!.grace).toBeGreaterThan(EXTRACTION.insertionGrace - 0.2);
    // The one respawn is spent: hit again once the new grace is over (BBs can't hit within it), they are out of the run.
    play(EXTRACTION.insertionGrace, round, cs, events);
    expect(cs[1]!.grace).toBe(0);
    eliminate(cs[1]!, 3, cs, ELIM);
    play(HITS.callTime + 3 * DT, round, cs, events);
    expect(events.filter((e) => e.type === 'respawned' && e.characterId === 1), 'one respawn only').toHaveLength(1);
    expect(isInPlay(cs[1]!)).toBe(false);
    expect(cs[1]!.grace).toBe(0);
    // Their mate's grace, meanwhile, was just the one clock.
    expect(cs[0]!.grace).toBeLessThan(EXTRACTION.insertionGrace);
  });

  it('counts each squad member’s own clock down, whatever the others have left', () => {
    const cs = team(1);
    const round = createRoundState(RULES, 'extraction');
    startRun(round, cs, CTX);
    cs[1]!.grace = 0.5;
    stepRun(round.run, cs, X, 100, [], 0.25);
    expect(cs[0]!.grace).toBeCloseTo(EXTRACTION.insertionGrace - 0.25);
    expect(cs[1]!.grace).toBeCloseTo(0.25);
    stepRun(round.run, cs, X, 100, [], 0.5);
    expect(cs[1]!.grace).toBe(0);
  });
});

describe('M72 QA: homeTeamCap and what a run starts with, by level', () => {
  const data: ExtractionData = {
    runTime: 240,
    baseOpponents: 2,
    insertions: [{ name: 'West', spawns: INSERTION, end: 0 }],
    exits: [...X.exits],
    opponentStarts: STARTS,
    cases: [],
    regens: REGENS,
    regenDistance: 15,
  };
  const setup = { squad: 3, seed: 1, runner: 0, squadTeam: 0, respawnAfter: HITS.callTime, spawnLift: 0.05 };
  const LEVELS = ['easy', 'normal', 'hard', 'pro'] as const;

  it('is never under 1, for any level, base and squad, even for a bigger negative offset', () => {
    for (const level of LEVELS) for (let base = 0; base <= 4; base++) for (let squad = 1; squad <= EXTRACTION.maxSquad; squad++) expect(homeTeamCap(base, squad, level), `${level} ${base} ${squad}`).toBeGreaterThanOrEqual(1);
    expect(homeTeamCap(0, 1, 'normal')).toBe(1);
    expect(homeTeamCap(0, 1, 'easy')).toBe(1);
    expect(homeTeamCap(0, 1, 'pro')).toBe(2);
    const harsh: ExtractionRules = { ...EXTRACTION, opponentsByLevel: { easy: -9, normal: -9, hard: -9, pro: -9 } };
    for (const level of LEVELS) expect(homeTeamCap(3, 3, level, harsh)).toBe(1);
  });

  it('takes the offset from the rules it is given, not only from EXTRACTION', () => {
    const rules: ExtractionRules = { ...EXTRACTION, opponentsByLevel: { easy: 2, normal: 3, hard: -1, pro: 0 } };
    expect(LEVELS.map((l) => homeTeamCap(2, 2, l, rules))).toEqual([6, 7, 3, 4]);
  });

  it('is monotone from Normal to Pro for every squad and base, with Easy and Hard equal', () => {
    for (let base = 0; base <= 4; base++) {
      for (let squad = 1; squad <= EXTRACTION.maxSquad; squad++) {
        const [e, n, h, p] = LEVELS.map((l) => homeTeamCap(base, squad, l));
        expect(h, `${base}+${squad}`).toBe(e);
        expect(n, `${base}+${squad}`).toBeLessThanOrEqual(e!);
        expect(p, `${base}+${squad}`).toBeGreaterThanOrEqual(h!);
      }
    }
  });

  it('starts as many home bots as the cap says at each level, and gives the waves the same cap', () => {
    for (const level of LEVELS) {
      const ctx = createRunContext(data, { ...setup, opponents: level, waveEvery: 60 });
      const cap = homeTeamCap(data.baseOpponents, setup.squad, level);
      expect(ctx.opponentStarts, level).toHaveLength(cap);
      expect(ctx.waves?.cap, level).toBe(cap);
    }
  });

  it('honours the rules passed to the run for the offset, and a squad of one', () => {
    const rules: ExtractionRules = { ...EXTRACTION, opponentsByLevel: { easy: 0, normal: -4, hard: 0, pro: 1 } };
    expect(createRunContext(data, { ...setup, squad: 1, opponents: 'normal', rules }).opponentStarts).toHaveLength(1);
    expect(createRunContext(data, { ...setup, squad: 1, opponents: 'pro', rules }).opponentStarts).toHaveLength(4);
  });
});

describe('M72 QA: the grace gates BBs only', () => {
  it('still counts an elimination that is not a BB (a rule, a dead zone) on a graced character', () => {
    const s = pair();
    s.you.grace = 2;
    eliminate(s.you, 3, s.cs, ELIM);
    expect(s.you.status).toBe('calling');
  });

  it('stops the BB on a graced body in its path: a home bot cannot shoot through them at a mate behind', () => {
    const s = pair();
    s.you.grace = 1;
    const far = createCharacter(5, vec3(0, 0, 5), 0, LOADOUT, 0);
    const events = shoot(s.them, far, [s.you, s.them, far]);
    expect(hits(events)).toHaveLength(0);
    expect(far.status).toBe('alive');
  });
});
