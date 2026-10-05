import { describe, expect, it } from 'vitest';
import type { Difficulty } from '../config/bots';
import { EXTRACTION } from '../config/extraction';
import { HITS } from '../config/hits';
import { FLAG } from '../config/modes';
import { BODY } from '../config/movement';
import { LOADOUT } from '../config/replicas';
import type { ExtractionData, SpawnPoint } from '../map/mapTypes';
import type { WorldQuery } from './armament';
import { createBBPool } from './ballistics';
import { type Character, createCharacter } from './character';
import { isInPlay, stepElimination } from './elimination';
import type { GameEvent } from './events';
import { createRunContext, type ExtractionContext, placeRun, regenClear, type WaveSetup, waveCap } from './extraction';
import { createRoundState, type RoundContext, type RoundRules, type RoundState, startRun, stepRound } from './round';
import { type Vec3, vec3 } from './vec';

/**
 * Extraction waves (M45), the parts the worker's own tests (extractionWaves.test.ts) leave out: the interval per
 * difficulty reaching the run, what createRunContext builds (and doesn't), the reserve, regen points taking turns, a
 * wave waiting while its points are in view, and the squad's eye (crouched, up on the dock) in the sight check.
 */

const DT = 1 / 60;
const RUN_TIME = 480;
const RULES: RoundRules = { roundTime: RUN_TIME, resetDelay: 2, winsNeeded: 1, halfTimeAfter: 1, eliminationFirstEnd: 0, flag: FLAG, winBy: 1, timeOutToMorePlayers: false };
const spot = (x: number, z: number, y = 0): SpawnPoint => ({ position: vec3(x, y, z), yaw: 0 });
const INSERTION: SpawnPoint[] = [0, 1, 2].map((z) => spot(-20, z));
/** Home dead zone spots (end 1), and the other end's. */
const DEAD_ZONES: SpawnPoint[][] = [[spot(-40, 0), spot(-40, 2)], [spot(40, 0), spot(40, 2), spot(40, 4)]];
const REGENS = [spot(20, 10), spot(22, 12), spot(24, 14), spot(26, 16)];
const DATA: ExtractionData = {
  insertions: [{ name: 'West', spawns: INSERTION, end: 0 }],
  exits: [{ name: 'Far gate', position: vec3(40, 0, -40), radius: 2 }],
  opponentStarts: [5, 10, 15, -5, 18, 25].map((x) => spot(x, 6)),
  runTime: RUN_TIME,
  baseOpponents: 2,
  cases: [],
  regens: REGENS,
  regenDistance: 15,
};
const NEVER_SEEN: WorldQuery = { raycastStatic: () => 1 };

function setup(squad: number, waveEvery: number | undefined, extra: Partial<Parameters<typeof createRunContext>[1]> = {}) {
  return createRunContext(DATA, { squad, seed: 3, runner: 0, squadTeam: 0, respawnAfter: HITS.callTime, spawnLift: 0.05, ...(waveEvery !== undefined ? { waveEvery } : {}), ...extra });
}

/** `squad` Blue characters (ids 0..) and `home` Orange. */
function roster(squad: number, home: number): Character[] {
  return Array.from({ length: squad + home }, (_, id) => createCharacter(id, vec3(), 0, LOADOUT, id < squad ? 0 : 1));
}
const homeOf = (cs: readonly Character[]) => cs.filter((c) => c.team === 1);
const at = (c: Character) => [c.position.x, c.position.z];

function newRun(cs: Character[], x: ExtractionContext): { round: RoundState; ctx: RoundContext } {
  const ctx: RoundContext = { rules: RULES, spawns: [], spawnLift: 0.05, extraction: x };
  const round = createRoundState(RULES, 'extraction');
  startRun(round, cs, ctx);
  return { round, ctx };
}

function play(seconds: number, round: RoundState, cs: Character[], ctx: RoundContext, events: GameEvent[] = [], each: () => void = () => {}): void {
  const bbs = createBBPool(4);
  for (let i = 0; i < Math.round(seconds / DT) && round.phase === 'live'; i++) {
    for (const c of cs) stepElimination(c, HITS, DT);
    stepRound(round, cs, bbs, ctx, events, DT);
    each();
  }
}

function hit(c: Character): void {
  c.status = 'calling';
  c.statusTime = 0;
}

describe('the wave interval of the opponents’ difficulty reaches the run (acceptance 1)', () => {
  const INTERVALS: [Difficulty, number][] = [
    ['easy', 100],
    ['normal', 75],
    ['hard', 60],
  ];

  it('is 100 s on Easy, 75 s on Normal and 60 s on Hard in the rules, and Pro is no slower than Hard', () => {
    for (const [d, s] of INTERVALS) expect(EXTRACTION.waveEvery[d], d).toBe(s);
    expect(EXTRACTION.waveEvery.pro).toBeLessThanOrEqual(EXTRACTION.waveEvery.hard);
  });

  for (const [d, s] of INTERVALS) {
    it(`builds a run whose hit opponent is still out just before ${s} s and back just after (${d})`, () => {
      const x = setup(1, EXTRACTION.waveEvery[d], { sight: undefined });
      expect(x.waves!.every).toBe(s);
      const cs = roster(1, 4); // cap 3 in play, one in reserve
      const { round, ctx } = newRun(cs, x);
      const victim = homeOf(cs).find(isInPlay)!;
      play(1, round, cs, ctx);
      hit(victim);
      const events: GameEvent[] = [];
      play(s - 1 - 0.5, round, cs, ctx, events);
      expect(isInPlay(victim), `${d} before`).toBe(false);
      expect(events.some((e) => e.type === 'returned')).toBe(false);
      play(1, round, cs, ctx, events);
      expect(isInPlay(victim), `${d} after`).toBe(true);
      expect(events.filter((e) => e.type === 'returned')).toEqual([{ type: 'returned', characterId: victim.id }]);
    });
  }
});

describe('createRunContext and the waves', () => {
  it('caps the home team at the base opponents plus the squad, and opens the late part for the last third of the run', () => {
    for (const squad of [1, 2, 3]) {
      const w = setup(squad, 75).waves!;
      expect(w.cap, `squad ${squad}`).toBe(DATA.baseOpponents + squad);
      expect(w.lateFrom).toBeCloseTo(RUN_TIME / 3, 9);
      expect(w.lateExtra).toBe(1);
      expect(w.regens).toBe(DATA.regens);
      expect(w.regenDistance).toBe(15);
    }
    const w = setup(2, 75).waves!;
    expect(waveCap(w, RUN_TIME)).toBe(4);
    expect(waveCap(w, RUN_TIME / 3 + 1)).toBe(4);
    expect(waveCap(w, RUN_TIME / 3 - 1)).toBe(5);
    expect(waveCap(w, 0)).toBe(5);
  });

  it('builds no waves without waveEvery, nor on a map with no regen points', () => {
    expect(setup(2, undefined).waves).toBeUndefined();
    expect(createRunContext({ ...DATA, regens: [] }, { squad: 2, seed: 3, runner: 0, squadTeam: 0, respawnAfter: 1, spawnLift: 0.05, waveEvery: 75 }).waves).toBeUndefined();
  });

  it('keeps a hit opponent out for the whole run when no waves were built', () => {
    const x = setup(1, undefined);
    const cs = roster(1, 3);
    const { round, ctx } = newRun(cs, x);
    const victim = homeOf(cs)[0]!;
    hit(victim);
    play(200, round, cs, ctx);
    expect(isInPlay(victim)).toBe(false);
  });

  it('gives the sight query the caller passed, and the reserve spots in the home dead zone from its far end', () => {
    const sight = { query: NEVER_SEEN, body: BODY };
    const x = setup(2, 75, { sight, deadZones: DEAD_ZONES });
    expect(x.waves!.sight).toBe(sight);
    // The insertion is at end 0, so the home team's zone is DEAD_ZONES[1], reserve spots from its last spot.
    expect(x.reserveAt!.map((s) => s.position.x)).toEqual([40, 40, 40]);
    expect(x.reserveAt!.map((s) => s.position.z)).toEqual([4, 2, 0]);
  });
});

describe('the reserve for the last part of the run', () => {
  it('waits out of play at the home dead zone: as many as the late extra, past the cap, and nobody otherwise', () => {
    const squad = 2;
    const x = setup(squad, 75, { deadZones: DEAD_ZONES });
    const cap = DATA.baseOpponents + squad;
    const cs = roster(squad, cap + EXTRACTION.lateExtra);
    placeRun(cs, x);
    const home = homeOf(cs);
    expect(home.filter(isInPlay).length).toBe(cap);
    const reserve = home.filter((c) => !isInPlay(c));
    expect(reserve.length).toBe(EXTRACTION.lateExtra);
    expect(reserve.map(at)).toEqual([[40, 4]]);
    expect(reserve.every((c) => c.status === 'out')).toBe(true);
  });

  it('is not a thing without waves: a home team of the cap starts entirely in play', () => {
    const x = setup(2, undefined, { deadZones: DEAD_ZONES });
    const cs = roster(2, DATA.baseOpponents + 2);
    placeRun(cs, x);
    expect(homeOf(cs).every(isInPlay)).toBe(true);
  });

  it('joins a wave only once the last third begins, and never before', () => {
    const x = setup(1, 20, { deadZones: DEAD_ZONES, sight: undefined });
    const cs = roster(1, 3 + EXTRACTION.lateExtra);
    const { round, ctx } = newRun(cs, x);
    const reserve = homeOf(cs).find((c) => !isInPlay(c))!;
    let early = false;
    const lateFrom = x.waves!.lateFrom;
    play(RUN_TIME - lateFrom - 1, round, cs, ctx, [], () => {
      if (isInPlay(reserve)) early = true;
    });
    expect(early).toBe(false);
    play(25, round, cs, ctx);
    expect(isInPlay(reserve)).toBe(true);
    expect(homeOf(cs).filter(isInPlay).length).toBe(4);
  });
});

describe('regen points and the wave in the run', () => {
  /** A run with an open sight check or none, `home` Orange against the runner alone; the cap is 3. */
  const WAVE_EVERY = 20;
  function run(home: number, regens: SpawnPoint[], sight: WaveSetup['sight']) {
    const x = createRunContext({ ...DATA, regens }, { squad: 1, seed: 3, runner: 0, squadTeam: 0, respawnAfter: HITS.callTime, spawnLift: 0.05, waveEvery: WAVE_EVERY, sight });
    const cs = roster(1, home);
    return { cs, x, ...newRun(cs, x) };
  }

  it('take turns: each returner uses the next point on, wrapping round to the first', () => {
    const { cs, round, ctx } = run(3, REGENS.slice(0, 3), undefined);
    const victim = homeOf(cs)[0]!;
    const seen: number[][] = [];
    for (let wave = 0; wave < 4; wave++) {
      hit(victim);
      const events: GameEvent[] = [];
      play(WAVE_EVERY + 0.5, round, cs, ctx, events);
      expect(events.filter((e) => e.type === 'returned').length, `wave ${wave}`).toBe(1);
      seen.push(at(victim));
      victim.position.x = 0; // it walks off its point
      victim.position.z = 0;
    }
    const xz = (r: SpawnPoint) => [r.position.x, r.position.z];
    expect(seen).toEqual([xz(REGENS[0]!), xz(REGENS[1]!), xz(REGENS[2]!), xz(REGENS[0]!)]);
  });

  it('wait while every regen point is in view of the squad, and place nobody in view; the wave comes in once one is not', () => {
    let visible = true;
    const query: WorldQuery = { raycastStatic: () => (visible ? -1 : 1) };
    const { cs, round, ctx, x } = run(3, REGENS, { query, body: BODY });
    const victim = homeOf(cs)[0]!;
    hit(victim);
    const events: GameEvent[] = [];
    play(WAVE_EVERY * 3 + 5, round, cs, ctx, events);
    expect(events.some((e) => e.type === 'returned')).toBe(false);
    expect(isInPlay(victim)).toBe(false);
    expect(round.run.waveDue).toBe(true);
    expect(round.run.waves).toBe(1);
    visible = false;
    // It looks again every regenRetry (M55), so within that.
    play(EXTRACTION.regenRetry + 2 * DT, round, cs, ctx, events);
    expect(events.filter((e) => e.type === 'returned')).toEqual([{ type: 'returned', characterId: victim.id }]);
    expect(round.run.waveDue).toBe(false);
    expect(x.waves!.regens.some((r) => r.position.x === victim.position.x && r.position.z === victim.position.z)).toBe(true);
  });

  it('looks for a free point every regenRetry while none is, not every tick (M55, KNOWN_ISSUES row 197)', () => {
    let rays = 0;
    let ticksWithRays = 0;
    const query: WorldQuery = {
      raycastStatic: () => {
        rays++;
        return -1; // every point in view
      },
    };
    const { cs, round, ctx } = run(3, REGENS, { query, body: BODY });
    hit(homeOf(cs)[0]!);
    // The hit call, then the first wave comes due at WAVE_EVERY.
    play(WAVE_EVERY + 1, round, cs, ctx);
    expect(round.run.waveDue).toBe(true);
    const waited = 30;
    play(waited, round, cs, ctx, [], () => {
      if (rays > 0) ticksWithRays++;
      rays = 0;
    });
    // One look a quarter of a second (give or take a tick), where it was every tick.
    expect(ticksWithRays).toBeGreaterThanOrEqual(Math.floor(waited / EXTRACTION.regenRetry) - 1);
    expect(ticksWithRays).toBeLessThanOrEqual(Math.ceil(waited / EXTRACTION.regenRetry) + 1);
  });

  it('does not count a second wave while the first is still waiting to come in', () => {
    const query: WorldQuery = { raycastStatic: () => -1 };
    const { cs, round, ctx } = run(3, REGENS, { query, body: BODY });
    hit(homeOf(cs)[0]!);
    play(WAVE_EVERY * 5, round, cs, ctx);
    expect(round.run.waves).toBe(1);
    expect(round.run.waveDue).toBe(true);
  });

  it('keeps two returners off one point: an opponent standing within the clearance blocks it, one a floor away or beyond does not', () => {
    const lone = [REGENS[0]!];
    const onPoint = (offset: Vec3) => {
      const { cs, round, ctx } = run(3, lone, undefined);
      const [victim, other] = homeOf(cs).filter(isInPlay) as [Character, Character];
      other.position.x = lone[0]!.position.x + offset.x;
      other.position.y = offset.y;
      other.position.z = lone[0]!.position.z + offset.z;
      hit(victim);
      const events: GameEvent[] = [];
      play(WAVE_EVERY + 1, round, cs, ctx, events);
      return events.some((e) => e.type === 'returned');
    };
    expect(onPoint(vec3(0.9, 0, 0)), 'beside it, inside the clearance').toBe(false);
    expect(onPoint(vec3(0, 0, 0)), 'on it').toBe(false);
    expect(onPoint(vec3(EXTRACTION.regenClearance + 0.2, 0, 0)), 'just outside the clearance').toBe(true);
    expect(onPoint(vec3(0, 3, 0)), 'directly over it, on another floor').toBe(true);
  });
});

describe('regenClear and the squad member’s eye', () => {
  const CTX = { squadTeam: 0, spawnLift: 0.05, rules: EXTRACTION };
  /** A wall across x = 0, 1.3 m high: a standing eye sees over it, a crouched one doesn't. */
  const LOW_WALL: WorldQuery = {
    raycastStatic(o: Vec3, d: Vec3, max: number): number {
      if (Math.abs(d.x) < 1e-9) return -1;
      const t = -o.x / d.x;
      if (t <= 0 || t > max) return -1;
      return o.y + d.y * t <= 1.3 ? t : -1;
    },
  };
  const WAVES: WaveSetup = { regens: [], regenDistance: 15, every: 75, cap: 3, lateExtra: 1, lateFrom: 0, sight: { query: LOW_WALL, body: BODY } };
  const REGEN = spot(15, 0);
  const squad = (y: number, crouch: number): Character[] => {
    const c = createCharacter(0, vec3(-5, y, 0), 0, LOADOUT, 0);
    c.crouchAmount = crouch;
    return [c];
  };

  it('is seen by a standing member over a low wall, not by one crouched behind it', () => {
    expect(regenClear(REGEN, squad(0, 0), CTX, WAVES), 'standing').toBe(false);
    expect(regenClear(REGEN, squad(0, 1), CTX, WAVES), 'crouched').toBe(true);
  });

  it('is seen from the dock over the same wall even crouched: the eye is a floor higher', () => {
    expect(regenClear(REGEN, squad(1.2, 1), CTX, WAVES)).toBe(false);
  });

  it('is judged for each squad member: one with a line to it spoils the point for all', () => {
    const both = [...squad(0, 1), ...squad(0, 0)];
    both[1]!.id = 1;
    expect(regenClear(REGEN, both, CTX, WAVES)).toBe(false);
  });

  it('is seen if either the chest or the head can be seen', () => {
    /** Blocks every line that ends above (or below) `y`, wherever it runs: that is, only one of the two points. */
    const blocksEndingAbove = (y: number): WorldQuery => ({ raycastStatic: (o, d, max) => (o.y + d.y * max > y ? 1 : -1) });
    const blocksEndingBelow = (y: number): WorldQuery => ({ raycastStatic: (o, d, max) => (o.y + d.y * max < y ? 1 : -1) });
    const withSight = (query: WorldQuery): WaveSetup => ({ ...WAVES, sight: { query, body: BODY } });
    const standing = squad(0, 0);
    expect(regenClear(REGEN, standing, CTX, withSight(blocksEndingAbove(1.2))), 'head hidden, chest in view').toBe(false);
    expect(regenClear(REGEN, standing, CTX, withSight(blocksEndingBelow(1.2))), 'chest hidden, head in view').toBe(false);
    expect(regenClear(REGEN, standing, CTX, withSight(blocksEndingBelow(0))), 'neither hidden').toBe(false);
    expect(regenClear(REGEN, standing, CTX, withSight(NEVER_SEEN)), 'both hidden').toBe(true);
  });
});
