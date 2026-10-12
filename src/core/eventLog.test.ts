import { describe, expect, it } from 'vitest';
import { REPORT_LOG } from '../config/crash';
import type { GameEvent } from '../sim/events';
import { vec3 } from '../sim/vec';
import { characterName, EventLog } from './eventLog';

const PLAYER = 0;
const CHARACTERS = [
  { id: 0, team: 0 },
  { id: 1, team: 0 },
  { id: 3, team: 1 },
];
const at = vec3();

/** The log's lines without their "tick N (x s ago): " head. */
function said(log: EventLog, now = 1000): string[] {
  return log.lines(now, CHARACTERS, PLAYER).map((l) => l.slice(l.indexOf('): ') + 3));
}

describe('the event log (IM7)', () => {
  it('names the player "you" and everyone else by team and id', () => {
    expect(characterName(0, CHARACTERS, PLAYER)).toBe('you');
    expect(characterName(3, CHARACTERS, PLAYER)).toBe('Beta 3');
    expect(characterName(9, CHARACTERS, PLAYER)).toBe('#9');
  });

  it('says what happened, with its tick and how long before the report', () => {
    const log = new EventLog();
    log.record(940, [{ type: 'roundStart', round: 2 }], PLAYER);
    log.record(970, [{ type: 'characterHit', victimId: 0, shooterId: 3, position: at, direction: at, ricochet: true }], PLAYER);
    log.record(1000, [{ type: 'roundOver', winner: 1, reason: 'eliminated' }], PLAYER);
    expect(log.lines(1060, CHARACTERS, PLAYER)).toEqual([
      'tick 940 (2.0 s ago): round 2 started',
      'tick 970 (1.5 s ago): Beta 3 hit you (ricochet)',
      'tick 1000 (1.0 s ago): round over: Beta won (eliminated)',
    ]);
  });

  it('counts a burst of one character\'s shots up as one line, and starts another after a pause or a switch', () => {
    const log = new EventLog();
    const shot = (id: number, replicaId: string): GameEvent => ({ type: 'shot', characterId: id, replicaId, position: at });
    for (let t = 0; t < 10; t++) log.record(100 + t * 6, [shot(3, 'aeg')], PLAYER);
    log.record(300, [shot(3, 'aeg')], PLAYER);
    log.record(301, [shot(3, 'gbb')], PLAYER);
    log.record(302, [shot(1, 'gbb')], PLAYER);
    expect(said(log)).toEqual(['Beta 3 fired 10 BBs over 0.9 s (aeg)', 'Beta 3 fired (aeg)', 'Beta 3 fired (gbb)', 'Alpha 1 fired (gbb)']);
  });

  it("keeps the player's own reloads, draws, fire modes, dry fires and torch, not the bots'", () => {
    const log = new EventLog();
    for (const id of [3, PLAYER]) {
      log.record(1, [
        { type: 'reloadStart', characterId: id, replicaId: 'aeg' },
        { type: 'reloadEnd', characterId: id, replicaId: 'aeg' },
        { type: 'reloadRefused', characterId: id, replicaId: 'aeg' },
        { type: 'draw', characterId: id, replicaId: 'gbb' },
        { type: 'fireMode', characterId: id, replicaId: 'gbb', mode: 'semi' },
        { type: 'dryFire', characterId: id, replicaId: 'gbb' },
        { type: 'torch', characterId: id, on: true },
      ], PLAYER);
    }
    expect(said(log)).toEqual([
      'you started a reload (aeg)',
      'you finished the reload (aeg)',
      'you pressed reload: no fuller magazine (aeg)',
      'you drew gbb',
      'you switched to semi',
      'you dry-fired (gbb)',
      'you turned the torch on',
    ]);
  });

  it('leaves out what would bury the rest: footsteps, impacts, lost BBs, the flag rope, the exit count, case noise', () => {
    const log = new EventLog();
    log.record(1, [
      { type: 'footstep', characterId: 3, kind: 'run' } as GameEvent,
      { type: 'bbImpact', position: at, ownerId: 3 },
      { type: 'bbLost', position: at, ownerId: 3 },
      { type: 'flagRope', position: at, raising: true },
      { type: 'exitCount', exit: 0, secondsLeft: 3 },
      { type: 'caseNoise', characterId: 3, case: 0, kind: 'ammo', position: at, range: 10 },
    ], PLAYER);
    expect(log.lines(1, CHARACTERS, PLAYER)).toEqual([]);
  });

  it("notes a bot's mode changes after its first look, and counts a flapping bot up as one line", () => {
    const log = new EventLog();
    const bot = { character: { id: 3 }, mode: 'advance' };
    log.watchBots(1, [bot]);
    expect(said(log)).toEqual([]);
    bot.mode = 'fight';
    log.watchBots(100, [bot]);
    for (let t = 0; t < 4; t++) {
      bot.mode = t % 2 ? 'fight' : 'cover';
      log.watchBots(110 + t * 10, [bot]);
    }
    bot.mode = 'search';
    log.watchBots(100 + 10 * REPORT_LOG.flapTicks, [bot]);
    expect(said(log)).toEqual(['Beta 3: advance → fight (5 changes in 0.7 s)', 'Beta 3: fight → search']);
  });

  it('keeps the newest lines once the ring is full, reusing its slots', () => {
    const log = new EventLog(3);
    for (let r = 1; r <= 5; r++) log.record(r, [{ type: 'roundStart', round: r }], PLAYER);
    expect(said(log, 5)).toEqual(['round 3 started', 'round 4 started', 'round 5 started']);
  });
});

describe('the event log when several characters fire at once (IM7)', () => {
  it("counts each character's shots up on its own line while they trade fire, until a hit ends the count", () => {
    const log = new EventLog();
    const shot = (id: number): GameEvent => ({ type: 'shot', characterId: id, replicaId: 'aeg', position: at });
    for (let t = 0; t < 6; t++) log.record(100 + t * 4, [shot(t % 2 ? 1 : 3)], PLAYER);
    log.record(130, [{ type: 'characterHit', victimId: 1, shooterId: 3, position: at, direction: at, ricochet: false }], PLAYER);
    log.record(131, [shot(3)], PLAYER);
    expect(said(log)).toEqual(['Beta 3 fired 3 BBs over 0.3 s (aeg)', 'Alpha 1 fired 3 BBs over 0.3 s (aeg)', 'Beta 3 hit Alpha 1', 'Beta 3 fired (aeg)']);
  });
});

describe('the event log allocates nothing as it records (IM7)', () => {
  it('reuses the same slot objects after the ring wraps, for events and for bot mode changes', () => {
    const log = new EventLog(4);
    const slots = [...(log as unknown as { slots: object[] }).slots];
    const bot = { character: { id: 3 }, mode: 'patrol' };
    log.watchBots(1, [bot] as never);
    for (let t = 1; t <= 20; t++) {
      log.record(t * 100, [{ type: 'roundStart', round: t }], PLAYER);
      bot.mode = t % 2 ? 'attack' : 'patrol';
      log.watchBots(t * 100 + 50, [bot] as never);
    }
    const after = (log as unknown as { slots: object[] }).slots;
    expect(after).toHaveLength(4);
    after.forEach((s, i) => expect(s).toBe(slots[i]));
  });
});
