import { describe, expect, it } from 'vitest';
import { EXTRACTION } from '../config/extraction';
import { HITS } from '../config/hits';
import { FLAG } from '../config/modes';
import { BODY } from '../config/movement';
import { LOADOUT } from '../config/replicas';
import type { SpawnPoint } from '../map/mapTypes';
import type { WorldQuery } from './armament';
import { createBBPool } from './ballistics';
import { type Character, createCharacter } from './character';
import { isInPlay, stepElimination } from './elimination';
import type { GameEvent } from './events';
import { type ExtractionContext, pickOpponentStarts, regenClear, reserveSize, type WaveSetup, waveCap } from './extraction';
import { createRoundState, type RoundContext, type RoundRules, type RoundState, startRun, stepRound } from './round';
import { type Vec3, vec3 } from './vec';

const DT = 1 / 60;
const RUN_TIME = 240;
const EVERY = 30;
const LATE_FROM = 60;
const RULES: RoundRules = { roundTime: RUN_TIME, resetDelay: 2, winsNeeded: 1, halfTimeAfter: 1, eliminationFirstEnd: 0, flag: FLAG, winBy: 1, timeOutToMorePlayers: false };
const INSERTION: SpawnPoint[] = [0, 1, 2].map((z) => ({ position: vec3(-20, 0, z), yaw: -Math.PI / 2 }));
const STARTS: SpawnPoint[] = [5, 10, 15, -5, 18].map((x) => ({ position: vec3(x, 0, 6), yaw: 0 }));
const spot = (x: number, z: number): SpawnPoint => ({ position: vec3(x, 0, z), yaw: 0 });
/**
 * Regen points: R0 too near the insertion (10 m), R1 and R3 behind the wall from it, R2 in plain view of it (the wall
 * at x = 0 stops at z = -5).
 */
const REGENS = [spot(-10, 0), spot(10, 10), spot(15, -10), spot(20, 10)];
const RESERVE: SpawnPoint[] = [spot(30, 30)];

/** A wall in the plane x = 0 from z = -5 to z = 20, as high as anyone: the only static surface. */
const WALL: WorldQuery = {
  raycastStatic(o: Vec3, d: Vec3, max: number): number {
    if (Math.abs(d.x) < 1e-9) return -1;
    const t = -o.x / d.x;
    if (t <= 0 || t > max) return -1;
    const z = o.z + d.z * t;
    return z >= -5 && z <= 20 ? t : -1;
  },
};

const WAVES: WaveSetup = { regens: REGENS, regenDistance: 15, every: EVERY, cap: 3, lateExtra: 1, lateFrom: LATE_FROM, sight: { query: WALL, body: BODY } };
const X: ExtractionContext = {
  rules: EXTRACTION,
  runner: 0,
  squadTeam: 0,
  insertion: INSERTION,
  insertionEnd: 0,
  opponentStarts: pickOpponentStarts(STARTS, INSERTION, 3),
  exits: [{ name: 'Far gate', position: vec3(40, 0, -40), radius: 2 }],
  respawnAfter: HITS.callTime,
  spawnLift: 0.05,
  cases: [],
  waves: WAVES,
  reserveAt: RESERVE,
};
const CTX: RoundContext = { rules: RULES, spawns: [], spawnLift: 0.05, extraction: X };

/** You and a teammate against three in play and one in reserve. */
function squadAndHome(): Character[] {
  return [0, 1, 2, 3, 4, 5].map((id) => createCharacter(id, vec3(), 0, LOADOUT, id < 2 ? 0 : 1));
}
const home = (cs: readonly Character[]) => cs.filter((c) => c.team === 1);
const inPlayAt = (cs: readonly Character[]) => home(cs).filter(isInPlay).length;

function newRun(cs: Character[], ctx: RoundContext = CTX): RoundState {
  const round = createRoundState(RULES, 'extraction');
  startRun(round, cs, ctx);
  return round;
}

/** Steps hit calls and the run (nobody moves on its own here); `each` runs after every tick. */
function play(seconds: number, round: RoundState, cs: Character[], events: GameEvent[], ctx: RoundContext = CTX, each: () => void = () => {}): void {
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

const at = (c: Character) => [c.position.x, c.position.z];

describe('Extraction waves (M45)', () => {
  it('starts the home team at its cap, the reserve waiting out of play at its spot', () => {
    const cs = squadAndHome();
    newRun(cs);
    expect(home(cs).map(isInPlay)).toEqual([true, true, true, false]);
    expect(at(cs[5]!)).toEqual([30, 30]);
    expect(cs[5]!.status).toBe('out');
  });

  it('brings a hit opponent back with the next wave, not before, at a regen point far from and out of sight of the squad', () => {
    const cs = squadAndHome();
    const round = newRun(cs);
    const events: GameEvent[] = [];
    play(5, round, cs, events);
    hit(cs[2]!);
    play(EVERY - 5 - 0.1, round, cs, events);
    expect(isInPlay(cs[2]!)).toBe(false);
    play(0.2, round, cs, events);
    expect(isInPlay(cs[2]!)).toBe(true);
    // R0 is too near, R1 is the first behind the wall.
    expect(at(cs[2]!)).toEqual([10, 10]);
    expect(events.filter((e) => e.type === 'returned')).toEqual([{ type: 'returned', characterId: 2 }]);
    expect(round.run.waves).toBe(1);
  });

  it('sends a wave as soon as the whole home team is out (once their hit calls end), without waiting for the clock', () => {
    const cs = squadAndHome();
    const round = newRun(cs);
    const events: GameEvent[] = [];
    play(2, round, cs, events);
    for (const c of home(cs).filter(isInPlay)) hit(c);
    play(HITS.callTime - 0.1, round, cs, events);
    expect(inPlayAt(cs)).toBe(0);
    play(0.3, round, cs, events);
    expect(inPlayAt(cs)).toBeGreaterThan(0);
    expect(round.run.waves).toBe(1);
  });

  it('never puts two returners on one regen point, nor one in view: the rest come in as the points clear', () => {
    const cs = squadAndHome();
    const round = newRun(cs);
    const events: GameEvent[] = [];
    for (const c of home(cs).filter(isInPlay)) hit(c);
    play(HITS.callTime + 0.1, round, cs, events);
    // Two points are behind the wall and far enough: two come back, the third waits.
    expect(home(cs).filter(isInPlay).map(at)).toEqual([
      [10, 10],
      [20, 10],
    ]);
    // The first walks off its point: the third comes in there, in the same wave.
    const first = home(cs).find((c) => isInPlay(c) && c.position.z === 10 && c.position.x === 10)!;
    first.position.x = 5;
    play(DT, round, cs, events);
    expect(inPlayAt(cs)).toBe(3);
    expect(round.run.waves).toBe(1);
    for (const e of events) if (e.type === 'returned') expect(at(cs[e.characterId]!)).not.toEqual([15, -10]);
  });

  it('counts an empty wave: someone hit just after it waits for the next one', () => {
    const cs = squadAndHome();
    const round = newRun(cs);
    const events: GameEvent[] = [];
    play(EVERY + 1, round, cs, events);
    hit(cs[3]!);
    play(EVERY - 2, round, cs, events);
    expect(isInPlay(cs[3]!)).toBe(false);
    play(1.1, round, cs, events);
    expect(isInPlay(cs[3]!)).toBe(true);
  });

  it('keeps the home team at its cap until the last part of the run, then lets the reserve in with the next wave', () => {
    const cs = squadAndHome();
    const round = newRun(cs);
    const events: GameEvent[] = [];
    let most = 0;
    play(RUN_TIME - LATE_FROM - 1, round, cs, events, CTX, () => {
      most = Math.max(most, inPlayAt(cs));
    });
    expect(most).toBe(3);
    expect(isInPlay(cs[5]!)).toBe(false);
    expect(waveCap(WAVES, round.clock)).toBe(3);
    play(EVERY + 2, round, cs, events);
    expect(waveCap(WAVES, round.clock)).toBe(4);
    expect(isInPlay(cs[5]!)).toBe(true);
    expect(inPlayAt(cs)).toBe(4);
  });

  it('sizes the reserve the session makes for the run: the late extra with waves, none without', () => {
    expect(reserveSize(X)).toBe(EXTRACTION.lateExtra);
    expect(reserveSize({ ...X, waves: undefined })).toBe(0);
  });

  it('leaves a hit opponent out for the run without waves (a map without regen points)', () => {
    const ctx: RoundContext = { ...CTX, extraction: { ...X, waves: undefined } };
    const cs = squadAndHome().slice(0, 5);
    const round = newRun(cs, ctx);
    expect(home(cs).every(isInPlay)).toBe(true);
    hit(cs[2]!);
    play(EVERY * 3, round, cs, [], ctx);
    expect(isInPlay(cs[2]!)).toBe(false);
  });
});

describe('regenClear', () => {
  const squad = (x: number, z: number) => {
    const c = createCharacter(0, vec3(x, 0, z), 0, LOADOUT, 0);
    return [c];
  };

  it('wants every squad member at least the distance away and unable to see the point', () => {
    expect(regenClear(REGENS[0]!, squad(-20, 0), X, WAVES)).toBe(false); // 10 m
    expect(regenClear(REGENS[1]!, squad(-20, 0), X, WAVES)).toBe(true); // behind the wall
    expect(regenClear(REGENS[2]!, squad(-20, 0), X, WAVES)).toBe(false); // in view
    // From beside R1, on its side of the wall: R3 is 10 m off, R2 in view.
    expect(regenClear(REGENS[3]!, squad(10, 0), X, WAVES)).toBe(false);
  });

  it('ignores a squad member out of the run, and without a sight check uses the distance alone', () => {
    const out = squad(16, -10);
    expect(regenClear(REGENS[2]!, out, X, WAVES)).toBe(false);
    out[0]!.status = 'out';
    expect(regenClear(REGENS[2]!, out, X, WAVES)).toBe(true);
    expect(regenClear(REGENS[2]!, squad(-20, 0), X, { ...WAVES, sight: undefined })).toBe(true);
  });
});
