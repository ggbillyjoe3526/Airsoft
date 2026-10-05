import { describe, expect, it } from 'vitest';
import { EXTRACTION } from '../config/extraction';
import { HITS } from '../config/hits';
import { FLAG } from '../config/modes';
import { LOADOUT } from '../config/replicas';
import type { SpawnPoint } from '../map/mapTypes';
import { createBBPool } from './ballistics';
import { type Character, createCharacter } from './character';
import { stepElimination } from './elimination';
import type { GameEvent } from './events';
import { type CaseSetup, caseInReach, DROPPED_CASE, type ExtractionContext, haulTotals, pickOpponentStarts, runFinds, runHaul } from './extraction';
import { createRoundState, type RoundContext, type RoundRules, type RoundState, startRun, stepRound } from './round';
import { vec3 } from './vec';

const DT = 1 / 60;
const RUN_TIME = 240;
const RULES: RoundRules = { roundTime: RUN_TIME, resetDelay: 2, winsNeeded: 1, halfTimeAfter: 1, eliminationFirstEnd: 0, flag: FLAG, winBy: 1, timeOutToMorePlayers: false };
const INSERTION: SpawnPoint[] = [0, 1, 2].map((z) => ({ position: vec3(-20, 0, z), yaw: -Math.PI / 2 }));
const STARTS: SpawnPoint[] = [5, 10, 15, -5, 18].map((x) => ({ position: vec3(x, 0, 6), yaw: 0 }));

/** Three cases: a field case with a part (4 s, heard 14 m), an ammo can with a resupply, a locker on a floor above. */
const CASES: CaseSetup[] = [
  { kind: 'field-case', name: 'Field case', position: vec3(-10, 0, 0), yaw: 0, openTime: 4, heard: 14, find: { fc: 60, resupply: false, item: { asset: '000004', tier: 'rare' } } },
  { kind: 'ammo-can', name: 'Ammo can', position: vec3(-5, 0, 0), yaw: 0, openTime: 2, heard: 8, find: { fc: 0, resupply: true, item: null } },
  { kind: 'locker', name: "Marshal's locker", position: vec3(-10, 3, 0), yaw: 0, openTime: 7, heard: 30, find: { fc: 120, resupply: false, item: { asset: '000005', tier: 'epic' } } },
];
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
  cases: CASES,
};
const CTX: RoundContext = { rules: RULES, spawns: [], spawnLift: 0.05, extraction: X };

function squadAndHome(): Character[] {
  return [0, 1, 2, 3, 4].map((id) => createCharacter(id, vec3(), 0, LOADOUT, id < 2 ? 0 : 1));
}

function newRun(cs: Character[]): RoundState {
  const round = createRoundState(RULES, 'extraction');
  startRun(round, cs, CTX);
  return round;
}

function play(seconds: number, round: RoundState, cs: Character[], events: GameEvent[]): void {
  const bbs = createBBPool(4);
  for (let i = 0; i < Math.round(seconds / DT) && round.phase === 'live'; i++) {
    for (const c of cs) stepElimination(c, HITS, DT);
    stepRound(round, cs, bbs, CTX, events, DT);
  }
}

function standAt(c: Character, x: number, z: number, y = 0): void {
  c.position.x = x;
  c.position.y = y;
  c.position.z = z;
}

/** A hit on `c` (the sim's elimination, without the walk-off's world). */
function hit(c: Character): void {
  c.status = 'calling';
  c.statusTime = 0;
}

describe('Extraction cases (M44)', () => {
  it('places the run’s cases shut, with their finds, and nothing carried', () => {
    const round = newRun(squadAndHome());
    expect(round.run.cases.map((k) => [k.kind, k.open, k.dropped, k.finds.length])).toEqual([
      ['field-case', false, false, 1],
      ['ammo-can', false, false, 1],
      ['locker', false, false, 1],
    ]);
    expect(round.run.carried).toEqual([]);
  });

  it('opens a case only while Use is held beside it, over its opening time, then carries its find', () => {
    const cs = squadAndHome();
    const round = newRun(cs);
    const you = cs[0]!;
    standAt(you, -11, 0);
    const events: GameEvent[] = [];
    play(0.5, round, cs, events);
    expect(round.run.inReach).toBe(0);
    expect(round.run.opening).toBe(-1);
    you.using = true;
    play(3.9, round, cs, events);
    expect(round.run.cases[0]!.open).toBe(false);
    expect(round.run.opening).toBe(0);
    play(0.2, round, cs, events);
    expect(round.run.cases[0]!.open).toBe(true);
    expect(round.run.carried).toEqual([CASES[0]!.find]);
    expect(events).toContainEqual({ type: 'caseOpened', characterId: 0, case: 0, kind: 'field-case', position: CASES[0]!.position });
    // Opened is opened: holding on does nothing more, and it's no longer offered.
    play(1, round, cs, events);
    expect(round.run.inReach).toBe(-1);
    expect(round.run.carried).toHaveLength(1);
  });

  it('starts again when you let go or step away, and never opens a case out of reach or on another floor', () => {
    const cs = squadAndHome();
    const round = newRun(cs);
    const you = cs[0]!;
    standAt(you, -11, 0);
    you.using = true;
    const events: GameEvent[] = [];
    play(3, round, cs, events);
    you.using = false;
    play(DT, round, cs, events);
    expect(round.run.openProgress).toBe(0);
    you.using = true;
    play(3, round, cs, events);
    expect(round.run.cases[0]!.open).toBe(false);
    standAt(you, -10 + EXTRACTION.caseReach + 0.2, 0);
    play(5, round, cs, events);
    expect(round.run.opening).toBe(-1);
    expect(round.run.cases[0]!.open).toBe(false);
    // Right under the locker, a floor below: out of its reach (and the field case's beside it is the one offered).
    standAt(you, -10, 0.3);
    expect(caseInReach(round.run, you, EXTRACTION)).toBe(0);
    standAt(you, -10, 0, 3);
    expect(caseInReach(round.run, you, EXTRACTION)).toBe(2);
  });

  it('makes its noise as you start and every second after, as far as its kind carries', () => {
    const cs = squadAndHome();
    const round = newRun(cs);
    standAt(cs[0]!, -11, 0);
    cs[0]!.using = true;
    const events: GameEvent[] = [];
    play(4.1, round, cs, events);
    const noise = events.filter((e) => e.type === 'caseNoise');
    expect(noise).toHaveLength(4);
    for (const e of noise) expect(e).toMatchObject({ characterId: 0, case: 0, kind: 'field-case', range: 14 });
  });

  it('uses a BB resupply there and then (your spare magazines topped up), and carries nothing for it', () => {
    const cs = squadAndHome();
    const round = newRun(cs);
    const you = cs[0]!;
    for (const a of you.armament.ammo) a.pouch.fill(0);
    standAt(you, -6, 0);
    you.using = true;
    play(2.1, round, cs, []);
    expect(round.run.cases[1]!.open).toBe(true);
    for (let i = 0; i < you.armament.ammo.length; i++) for (const m of you.armament.ammo[i]!.pouch) expect(m).toBe(you.armament.handling[i]!.magSize);
    expect(round.run.carried).toEqual([]);
  });

  it('leaves the cases to the runner: a teammate holding Use beside one opens nothing', () => {
    const cs = squadAndHome();
    const round = newRun(cs);
    standAt(cs[1]!, -11, 0);
    cs[1]!.using = true;
    play(5, round, cs, []);
    expect(round.run.cases[0]!.open).toBe(false);
  });

  it('drops what you carry where you were hit; you pick it up again with Use at once and extract with it', () => {
    const cs = squadAndHome();
    const round = newRun(cs);
    const you = cs[0]!;
    standAt(you, -11, 0);
    you.using = true;
    const events: GameEvent[] = [];
    play(4.1, round, cs, events);
    you.using = false;
    standAt(you, -12, 3);
    hit(you);
    play(DT, round, cs, events);
    const dropped = round.run.cases[3]!;
    expect(dropped).toMatchObject({ kind: DROPPED_CASE, dropped: true, open: false, openTime: EXTRACTION.dropOpenTime });
    expect([dropped.position.x, dropped.position.z]).toEqual([-12, 3]);
    expect(dropped.finds).toEqual([CASES[0]!.find]);
    expect(round.run.carried).toEqual([]);
    expect(events).toContainEqual({ type: 'caseDropped', characterId: 0, case: 3 });
    // Back at the insertion; then back to the case, and one tick of Use picks it up.
    play(HITS.callTime + 0.1, round, cs, events);
    expect(you.position.x).toBe(-20);
    standAt(you, -12, 2.5);
    you.using = true;
    play(DT, round, cs, events);
    expect(dropped.open).toBe(true);
    expect(round.run.carried).toEqual([CASES[0]!.find]);
    you.using = false;
    standAt(you, 20, 0);
    play(EXTRACTION.extractTime + 0.5, round, cs, events);
    expect(round.reason).toBe('extracted');
    expect(haulTotals(runHaul(round.run))).toEqual({ fc: 60, items: [CASES[0]!.find.item] });
    expect(runFinds(round.run)).toEqual([CASES[0]!.find]);
  });

  it('keeps nothing from a run that ends any other way: caught out, or out on the second hit', () => {
    for (const end of ['time', 'out'] as const) {
      const cs = squadAndHome();
      const round = newRun(cs);
      const you = cs[0]!;
      standAt(you, -11, 0);
      you.using = true;
      play(4.1, round, cs, []);
      you.using = false;
      if (end === 'time') play(RUN_TIME, round, cs, []);
      else {
        round.run.respawnsUsed[0] = EXTRACTION.respawns;
        hit(you);
        play(HITS.callTime + 0.1, round, cs, []);
      }
      expect(round.reason, end).toBe(end);
      expect(runHaul(round.run), end).toEqual([]);
      // What was found is still known, for the summary's "lost" line.
      expect(runFinds(round.run), end).toEqual([CASES[0]!.find]);
    }
  });

  it('puts every case back shut and empties your hands when the run starts again', () => {
    const cs = squadAndHome();
    const round = newRun(cs);
    standAt(cs[0]!, -11, 0);
    cs[0]!.using = true;
    play(4.1, round, cs, []);
    hit(cs[0]!);
    play(DT, round, cs, []);
    startRun(round, cs, CTX);
    expect(round.run.cases).toHaveLength(CASES.length);
    expect(round.run.cases.every((k) => !k.open)).toBe(true);
    expect(round.run.carried).toEqual([]);
  });

  it('makes no noise for a silent case (heard 0), but still opens it over its time', () => {
    const quiet = { ...X, cases: [{ ...CASES[0]!, heard: 0 }] };
    const ctx: RoundContext = { ...CTX, extraction: quiet };
    const cs = squadAndHome();
    const round = createRoundState(RULES, 'extraction');
    startRun(round, cs, ctx);
    standAt(cs[0]!, -11, 0);
    cs[0]!.using = true;
    const events: GameEvent[] = [];
    const bbs = createBBPool(4);
    for (let i = 0; i < Math.round(4.1 / DT); i++) stepRound(round, cs, bbs, ctx, events, DT);
    expect(events.filter((e) => e.type === 'caseNoise')).toEqual([]);
    expect(round.run.cases[0]!.open).toBe(true);
  });

  it('starts a different case from nothing when you step from one to another while holding Use', () => {
    const cs = squadAndHome();
    const round = newRun(cs);
    const you = cs[0]!;
    standAt(you, -11, 0);
    you.using = true;
    play(3, round, cs, []);
    expect(round.run.opening).toBe(0);
    expect(round.run.openProgress).toBeGreaterThan(2.9);
    // The ammo can (2 s) is 5 m on: the progress on the field case isn't carried over to it.
    standAt(you, -5.5, 0);
    play(DT, round, cs, []);
    expect(round.run.opening).toBe(1);
    expect(round.run.openProgress).toBeLessThan(0.1);
    expect(round.run.cases[1]!.open).toBe(false);
    play(2, round, cs, []);
    expect(round.run.cases[1]!.open).toBe(true);
    expect(round.run.cases[0]!.open).toBe(false);
  });

  it('opens the nearer of two cases in reach, one at a time', () => {
    const cs = squadAndHome();
    const round = newRun(cs);
    const you = cs[0]!;
    // Between the field case (x = -10) and the ammo can (x = -5) the cases are 5 m apart: only one is within 1.5 m.
    standAt(you, -6, 0);
    expect(caseInReach(round.run, you, EXTRACTION)).toBe(1);
    standAt(you, -9, 0);
    expect(caseInReach(round.run, you, EXTRACTION)).toBe(0);
    standAt(you, -7.5, 0);
    expect(caseInReach(round.run, you, EXTRACTION)).toBe(-1);
  });

  it('stops opening the moment you are hit, and what a half-opened case holds is still in it', () => {
    const cs = squadAndHome();
    const round = newRun(cs);
    const you = cs[0]!;
    standAt(you, -11, 0);
    you.using = true;
    const events: GameEvent[] = [];
    play(3, round, cs, events);
    hit(you);
    you.using = false; // the sim clears it for a character who is not in play
    play(DT, round, cs, events);
    expect(round.run.opening).toBe(-1);
    expect(round.run.openProgress).toBe(0);
    expect(round.run.cases[0]!.open).toBe(false);
    expect(round.run.cases).toHaveLength(CASES.length);
    expect(events.some((e) => e.type === 'caseDropped')).toBe(false);
  });

  it('drops nothing when you are hit with empty hands, and everything in one dropped case when carrying several finds', () => {
    const cs = squadAndHome();
    const round = newRun(cs);
    const you = cs[0]!;
    standAt(you, -11, 0);
    hit(you);
    const events: GameEvent[] = [];
    play(HITS.callTime + 0.1, round, cs, events);
    expect(round.run.cases).toHaveLength(CASES.length);
    expect(events.some((e) => e.type === 'caseDropped')).toBe(false);

    // Now two finds (the field case, then the ammo can's resupply and the locker's) and a hit: one case holds the lot.
    const again = squadAndHome();
    const second = newRun(again);
    const me = again[0]!;
    me.using = true;
    standAt(me, -11, 0);
    play(4.1, second, again, []);
    standAt(me, -10, 0, 3);
    play(7.1, second, again, []);
    expect(second.run.carried.map((f) => f.fc)).toEqual([60, 120]);
    me.using = false;
    standAt(me, 0, 0);
    hit(me);
    play(DT, second, again, []);
    const dropped = second.run.cases.filter((k) => k.dropped);
    expect(dropped).toHaveLength(1);
    expect(haulTotals(dropped[0]!.finds)).toEqual({ fc: 180, items: [CASES[0]!.find.item, CASES[2]!.find.item] });
    expect(second.run.carried).toEqual([]);
  });

  it('shows the dropped case to nobody else: an opponent standing at it opens nothing', () => {
    const cs = squadAndHome();
    const round = newRun(cs);
    const you = cs[0]!;
    standAt(you, -11, 0);
    you.using = true;
    play(4.1, round, cs, []);
    you.using = false;
    standAt(you, -12, 3);
    hit(you);
    play(DT, round, cs, []);
    standAt(cs[3]!, -12, 3);
    cs[3]!.using = true;
    play(2, round, cs, []);
    expect(round.run.cases[3]!.open).toBe(false);
  });
});
