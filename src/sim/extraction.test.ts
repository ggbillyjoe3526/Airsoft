import { describe, expect, it } from 'vitest';
import { EXTRACTION } from '../config/extraction';
import { HITS } from '../config/hits';
import { FLAG } from '../config/modes';
import { LOADOUT } from '../config/replicas';
import type { ExitZone, ExtractionData, SpawnPoint } from '../map/mapTypes';
import { createBBPool } from './ballistics';
import { type Character, createCharacter } from './character';
import { eliminate, isInPlay, stepElimination } from './elimination';
import type { GameEvent } from './events';
import { createRunContext, type ExtractionContext, exitClosedFor, pickOpponentStarts, respawnsLeft } from './extraction';
import { createRoundState, type RoundContext, type RoundRules, type RoundState, startRun, stepRound } from './round';
import { openFieldElimination } from './testSupport';
import { vec3 } from './vec';

const DT = 1 / 60;
const RUN_TIME = 240;
const RULES: RoundRules = { roundTime: RUN_TIME, resetDelay: 2, winsNeeded: 1, halfTimeAfter: 1, eliminationFirstEnd: 0, flag: FLAG, winBy: 1, timeOutToMorePlayers: false };
/** The insertion in the west; exits west (too close: closed), east (open), north-east (late). */
const INSERTION: SpawnPoint[] = [0, 1, 2].map((z) => ({ position: vec3(-20, 0, z), yaw: -Math.PI / 2 }));
const EXITS: ExitZone[] = [
  { name: 'West gate', position: vec3(-24, 0, 8), radius: 2 },
  { name: 'East gate', position: vec3(20, 0, 0), radius: 2 },
  { name: 'North-east gate', position: vec3(20, 0, -15), radius: 2, late: true },
];
const STARTS: SpawnPoint[] = [5, 10, 15, -5, 18].map((x) => ({ position: vec3(x, 0, 6), yaw: 0 }));
const X: ExtractionContext = {
  rules: EXTRACTION,
  runner: 0,
  squadTeam: 0,
  insertion: INSERTION,
  insertionEnd: 0,
  opponentStarts: pickOpponentStarts(STARTS, INSERTION, 3),
  exits: EXITS,
  respawnAfter: HITS.callTime,
  spawnLift: 0.05,
};
const CTX: RoundContext = { rules: RULES, spawns: [], spawnLift: 0.05, extraction: X };
const ELIM = openFieldElimination([[{ position: vec3(-30, 0, 0), yaw: 0 }], [{ position: vec3(30, 0, 0), yaw: 0 }]]);

/** A squad of two (you and one teammate) against three. */
function squadAndHome(): Character[] {
  return [0, 1, 2, 3, 4].map((id) => createCharacter(id, vec3(), 0, LOADOUT, id < 2 ? 0 : 1));
}

function newRun(cs: Character[]): RoundState {
  const round = createRoundState(RULES, 'extraction');
  startRun(round, cs, CTX);
  return round;
}

/** Steps hit calls and the run (nobody moves on its own here). */
function play(seconds: number, round: RoundState, cs: Character[], events: GameEvent[]): void {
  const bbs = createBBPool(4);
  for (let i = 0; i < seconds / DT && round.phase === 'live'; i++) {
    for (const c of cs) stepElimination(c, HITS, DT);
    stepRound(round, cs, bbs, CTX, events, DT);
  }
}

function standAt(c: Character, x: number, z: number): void {
  c.position.x = x;
  c.position.z = z;
}

describe('Extraction run (M43)', () => {
  it('puts the squad at the insertion and the home team at the starts farthest from it, each with its end', () => {
    const cs = squadAndHome();
    newRun(cs);
    expect(cs[0]!.position.x).toBe(-20);
    expect(cs[1]!.position.x).toBe(-20);
    expect(cs.slice(0, 2).every((c) => c.end === 0)).toBe(true);
    expect(cs.slice(2).every((c) => c.end === 1)).toBe(true);
    // The three farthest of the five starts from (-20, 0): x 18, 15, 10.
    expect(cs.slice(2).map((c) => c.position.x)).toEqual([18, 15, 10]);
  });

  it('closes the exits near the insertion, keeps late ones shut and opens them with lateExitAt left', () => {
    const cs = squadAndHome();
    const round = newRun(cs);
    const [west, east, late] = round.run.exits;
    expect(exitClosedFor(EXITS[0]!, INSERTION, EXTRACTION.minExitDistance)).toBe(true);
    expect([west!.closed, west!.open]).toEqual([true, false]);
    expect([east!.closed, east!.open]).toEqual([false, true]);
    expect([late!.closed, late!.open]).toEqual([false, false]);
    const events: GameEvent[] = [];
    play(RUN_TIME - EXTRACTION.lateExitAt - 1, round, cs, events);
    expect(late!.open).toBe(false);
    play(1.1, round, cs, events);
    expect(late!.open).toBe(true);
    expect(events).toContainEqual({ type: 'exitOpened', exit: 2 });
    expect(west!.open).toBe(false);
  });

  it('ends "extracted" after extractTime in an open exit, beeping each second, and the squad wins the match', () => {
    const cs = squadAndHome();
    const round = newRun(cs);
    standAt(cs[0]!, 20.5, 0.5);
    const events: GameEvent[] = [];
    play(EXTRACTION.extractTime - 0.5, round, cs, events);
    expect(round.phase).toBe('live');
    expect(round.run.countStatus).toBe('counting');
    play(1, round, cs, events);
    expect(round.phase).toBe('matchOver');
    expect(round.reason).toBe('extracted');
    expect(round.matchWinner).toBe(0);
    expect(events.filter((e) => e.type === 'exitCount')).toHaveLength(EXTRACTION.extractTime);
    expect(events).toContainEqual({ type: 'matchOver', winner: 0 });
  });

  it('pauses the count while someone from the home team is in the exit, and resets it when you step out', () => {
    const cs = squadAndHome();
    const round = newRun(cs);
    standAt(cs[0]!, 20, 0);
    const events: GameEvent[] = [];
    play(4, round, cs, events);
    const counted = round.run.count;
    expect(counted).toBeGreaterThan(3.9);
    standAt(cs[2]!, 21, 0);
    play(3, round, cs, events);
    expect(round.run.countStatus).toBe('paused');
    expect(round.run.count).toBe(counted);
    // A home-team player who is out doesn't pause it.
    eliminate(cs[2]!, 1, cs, ELIM);
    play(0.5, round, cs, events);
    expect(round.run.countStatus).toBe('counting');
    standAt(cs[0]!, 0, 0);
    play(0.1, round, cs, events);
    expect([round.run.count, round.run.countExit, round.run.countStatus]).toEqual([0, -1, 'idle']);
  });

  it("doesn't count a closed exit, nor a late one before it opens", () => {
    const cs = squadAndHome();
    const round = newRun(cs);
    standAt(cs[0]!, -24, 8);
    play(EXTRACTION.extractTime + 1, round, cs, []);
    expect(round.phase).toBe('live');
    standAt(cs[0]!, 20, -15);
    play(EXTRACTION.extractTime + 1, round, cs, []);
    expect(round.phase).toBe('live');
  });

  it('respawns a hit squad member at the insertion once, the moment the hit call ends; the second hit puts you out', () => {
    const cs = squadAndHome();
    const round = newRun(cs);
    const you = cs[0]!;
    standAt(you, 0, 0);
    eliminate(you, 3, cs, ELIM);
    const events: GameEvent[] = [];
    play(HITS.callTime - 0.1, round, cs, events);
    expect(you.status).toBe('calling');
    play(0.2, round, cs, events);
    expect(isInPlay(you)).toBe(true);
    expect([you.position.x, you.position.z]).toEqual([INSERTION[0]!.position.x, INSERTION[0]!.position.z]);
    expect(events).toContainEqual({ type: 'respawned', characterId: 0, respawnsLeft: 0 });
    expect(respawnsLeft(round.run, you, X)).toBe(0);
    eliminate(you, 3, cs, ELIM);
    play(HITS.callTime + 0.2, round, cs, events);
    expect(round.phase).toBe('matchOver');
    expect(round.reason).toBe('out');
    expect(round.matchWinner).toBe(1);
  });

  it('a bot teammate out of respawns walks off, and the run goes on', () => {
    const cs = squadAndHome();
    const round = newRun(cs);
    const mate = cs[1]!;
    for (let hit = 0; hit < 2; hit++) {
      eliminate(mate, 3, cs, ELIM);
      play(HITS.callTime + 0.2, round, cs, []);
    }
    expect(mate.status).toBe('walkingOff');
    expect(round.phase).toBe('live');
    // The home team never respawns in M43 (its waves come in M45).
    eliminate(cs[2]!, 0, cs, ELIM);
    play(HITS.callTime + 0.2, round, cs, []);
    expect(cs[2]!.status).toBe('walkingOff');
  });

  it("ends 'time' (caught out) when the clock runs out, with a whistle a minute before", () => {
    const cs = squadAndHome();
    const round = newRun(cs);
    const events: GameEvent[] = [];
    play(RUN_TIME - EXTRACTION.warnAt + 0.1, round, cs, events);
    expect(events).toContainEqual({ type: 'runWarning', secondsLeft: EXTRACTION.warnAt });
    play(EXTRACTION.warnAt, round, cs, events);
    expect(round.phase).toBe('matchOver');
    expect(round.reason).toBe('time');
    expect(round.matchWinner).toBe(1);
  });

  it('picks the insertion from the run seed, the same every time for one seed', () => {
    const data: ExtractionData = {
      runTime: RUN_TIME,
      baseOpponents: 2,
      insertions: [
        { name: 'West', spawns: INSERTION, end: 0 },
        { name: 'East', spawns: [{ position: vec3(20, 0, 10), yaw: 0 }], end: 1 },
      ],
      exits: EXITS,
      opponentStarts: STARTS,
    };
    const setup = { squad: 3, runner: 0, squadTeam: 0, respawnAfter: 1, spawnLift: 0 };
    const picked = new Set<number>();
    for (let seed = 1; seed <= 20; seed++) {
      const a = createRunContext(data, { ...setup, seed });
      expect(createRunContext(data, { ...setup, seed }).insertionEnd).toBe(a.insertionEnd);
      expect(a.opponentStarts).toHaveLength(5);
      picked.add(a.insertionEnd);
    }
    expect([...picked].sort()).toEqual([0, 1]);
  });
});
