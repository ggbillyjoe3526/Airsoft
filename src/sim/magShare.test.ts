import { describe, expect, it } from 'vitest';
import { HITS } from '../config/hits';
import { MAG_SHARE } from '../config/magShare';
import { BODY } from '../config/movement';
import { AEG, GAS_PISTOL, LOADOUT } from '../config/replicas';
import { spareBBs, type WorldQuery } from './armament';
import { type Character, createCharacter } from './character';
import type { GameEvent } from './events';
import { canTossTo, chooseSpare, createMagTosses, createSparePick, fillSpares, leavesLow, lowOnMags, pouchRoom, stepMagTosses, tossMag } from './magShare';
import { vec3 } from './vec';

/**
 * MG1: the magazine hand-off's rules. Who may toss to whom, which spare goes, the flight, what lands, and that no BB is
 * ever made: the thrower's and the catcher's BBs add up to what they were before, whatever happens.
 */

const DT = 1 / 60;
/** A level with nothing in it, or a wall in every ray (`blocked`). */
const open = (blocked = false): WorldQuery => ({ raycastStatic: () => (blocked ? 1 : -1) }) as unknown as WorldQuery;
const world = (blocked = false) => ({ query: open(blocked), body: BODY, hits: HITS });

/** Two teammates with the default rifle and pistol, `d` m apart along x; `team` for the second. */
function pair(d = 3, team = 0): [Character, Character] {
  return [createCharacter(0, vec3(0, 0, 0), 0, LOADOUT, 0), createCharacter(1, vec3(d, 0, 0), 0, LOADOUT, team)];
}

/** Everything the two hold for `slot`: magazine in hand and pouch. */
const held = (cs: readonly Character[], slot = 0) => cs.reduce((n, c) => n + c.armament.ammo[slot]!.mag + spareBBs(c.armament.ammo[slot]!), 0);

/** `c` hit: calling it, out of play. */
function hit(c: Character): void {
  c.status = 'calling';
}

/** Empties `c`'s pouch for `slot`: on its last magazine. */
function lastMag(c: Character, slot = 0): void {
  c.armament.ammo[slot]!.pouch.fill(0);
}

describe('low on BBs (MG1)', () => {
  it('is less than one full magazine left in the pouch for the replica in hand', () => {
    const [a] = pair();
    const ammo = a.armament.ammo[0]!;
    expect(lowOnMags(a.armament)).toBe(false);
    ammo.pouch.fill(0);
    ammo.pouch[0] = AEG.magSize;
    expect(lowOnMags(a.armament)).toBe(false);
    ammo.pouch[0] = AEG.magSize - 1;
    expect(lowOnMags(a.armament)).toBe(true);
  });

  it('gives the room of the emptiest spare, none with every spare full', () => {
    const [a] = pair();
    expect(pouchRoom(a.armament, 0)).toBe(0);
    a.armament.ammo[0]!.pouch[1] = 20;
    expect(pouchRoom(a.armament, 0)).toBe(AEG.magSize - 20);
  });
});

describe('the spare a toss takes (MG1)', () => {
  it('fits by class: a rifle gets a rifle magazine and a pistol a pistol one, never the other', () => {
    const [giver] = pair();
    const out = createSparePick();
    expect(chooseSpare(giver.armament, AEG, AEG.magSize, out)).toBe(true);
    expect(out.slot).toBe(0);
    expect(chooseSpare(giver.armament, GAS_PISTOL, GAS_PISTOL.magSize, out)).toBe(true);
    expect(out.slot).toBe(1);
    lastMag(giver, 0);
    expect(chooseSpare(giver.armament, AEG, AEG.magSize, out)).toBe(false);
  });

  it('takes a spare of a replica not in hand first, then the fullest, and only what there is room for', () => {
    const giver = createCharacter(0, vec3(), 0, [AEG, AEG], 0);
    giver.armament.ammo[0]!.pouch[0] = 10;
    giver.armament.ammo[1]!.pouch[2] = 30;
    const out = createSparePick();
    expect(chooseSpare(giver.armament, AEG, 40, out)).toBe(true);
    // Slot 1 is not in hand: its fullest spare goes, though slot 0 has fuller ones.
    expect([out.slot, out.index, out.bbs]).toEqual([1, 0, 40]);
    giver.armament.ammo[1]!.pouch.fill(0);
    expect(chooseSpare(giver.armament, AEG, 40, out)).toBe(true);
    expect([out.slot, out.bbs]).toEqual([0, 40]);
    expect(out.index).not.toBe(0);
  });

  it('counts only the replica in hand against a full spare kept (keepMags)', () => {
    const [giver] = pair();
    const out = createSparePick();
    chooseSpare(giver.armament, AEG, AEG.magSize, out);
    expect(leavesLow(giver.armament, out)).toBe(false);
    giver.armament.ammo[0]!.pouch.fill(0);
    giver.armament.ammo[0]!.pouch[0] = AEG.magSize;
    chooseSpare(giver.armament, AEG, AEG.magSize, out);
    expect(leavesLow(giver.armament, out)).toBe(true);
    chooseSpare(giver.armament, GAS_PISTOL, GAS_PISTOL.magSize, out);
    expect(leavesLow(giver.armament, out)).toBe(false);
  });
});

describe('who can toss to whom (MG1)', () => {
  it('a teammate in play, in reach, in sight, with room in a spare for the replica in hand', () => {
    const out = createSparePick();
    const [a, b] = pair(3);
    expect(canTossTo(a, b, world(), out)).toBe(false); // b's pouch is full
    lastMag(b);
    expect(canTossTo(a, b, world(), out)).toBe(true);
    expect(canTossTo(a, b, world(true), out)).toBe(false); // a wall between
    expect(canTossTo(a, a, world(), out)).toBe(false);
    const [c, enemy] = pair(3, 1);
    lastMag(enemy);
    expect(canTossTo(c, enemy, world(), out)).toBe(false);
  });

  it('not past MAG_SHARE.tossRange, hand to chest', () => {
    const out = createSparePick();
    const [a, b] = pair(MAG_SHARE.tossRange - 0.2);
    lastMag(b);
    expect(canTossTo(a, b, world(), out)).toBe(true);
    b.position.x = MAG_SHARE.tossRange + 0.2;
    expect(canTossTo(a, b, world(), out)).toBe(false);
  });

  it('neither from nor to someone out of play', () => {
    const out = createSparePick();
    const [a, b] = pair();
    lastMag(b);
    hit(b);
    expect(canTossTo(a, b, world(), out)).toBe(false);
    const [c, d] = pair();
    lastMag(d);
    hit(c);
    expect(canTossTo(c, d, world(), out)).toBe(false);
  });
});

describe('a toss and its landing (MG1)', () => {
  it('moves the BBs, never makes them: out of the thrower at the toss, into the catcher at the landing', () => {
    const cs = pair(4);
    const [a, b] = cs;
    lastMag(b);
    const before = held(cs);
    const tosses = createMagTosses();
    const events: GameEvent[] = [];
    tossMag(a, b.id, cs, tosses, world(), events);
    expect(events).toEqual([{ type: 'magToss', fromId: 0, toId: 1, bbs: AEG.magSize, replicaId: AEG.id }]);
    const t = tosses.find((x) => x.active)!;
    expect(t.flight).toBeCloseTo(MAG_SHARE.flightBase + MAG_SHARE.flightPerMetre * 4, 1);
    // In the air: out of the thrower's pouch, not yet in the catcher's.
    expect(held(cs)).toBe(before - AEG.magSize);
    let ticks = 0;
    while (t.active && ticks++ < 600) stepMagTosses(tosses, cs, true, events, DT);
    expect(ticks).toBe(Math.ceil(t.flight / DT));
    expect(events.at(-1)).toEqual({ type: 'magCaught', fromId: 0, toId: 1, bbs: AEG.magSize, replicaId: AEG.id });
    expect(held(cs)).toBe(before);
    expect(lowOnMags(b.armament)).toBe(false);
  });

  it('one in the air a thrower at a time, and as many as there are slots', () => {
    const cs = [createCharacter(0, vec3(), 0, LOADOUT, 0), createCharacter(1, vec3(2, 0, 0), 0, LOADOUT, 0), createCharacter(2, vec3(0, 0, 2), 0, LOADOUT, 0)];
    lastMag(cs[1]!);
    lastMag(cs[2]!);
    const tosses = createMagTosses(1);
    const events: GameEvent[] = [];
    tossMag(cs[0]!, 1, cs, tosses, world(), events);
    tossMag(cs[0]!, 2, cs, tosses, world(), events);
    tossMag(cs[1]!, 2, cs, tosses, world(), events); // no slot left
    expect(events).toHaveLength(1);
  });

  it('is lost with the catcher out of play when it lands, or the round decided while it flies', () => {
    for (const how of ['hit', 'whistle'] as const) {
      const cs = pair(3);
      const [a, b] = cs;
      lastMag(b);
      const before = held(cs);
      const tosses = createMagTosses();
      const events: GameEvent[] = [];
      tossMag(a, b.id, cs, tosses, world(), events);
      if (how === 'hit') hit(b);
      for (let i = 0; i < 120; i++) stepMagTosses(tosses, cs, how === 'hit', events, DT);
      expect(events.at(-1), how).toEqual({ type: 'magLost', fromId: 0, toId: 1 });
      expect(tosses.every((t) => !t.active), how).toBe(true);
      expect(held(cs), how).toBe(before - AEG.magSize);
    }
  });

  it('fills the emptiest spares first, each up to a full magazine, and says how many went in', () => {
    const [a] = pair();
    const pouch = a.armament.ammo[0]!.pouch;
    pouch.fill(0);
    pouch[0] = 50;
    expect(fillSpares(a.armament, 0, 70)).toBe(70);
    expect(pouch).toEqual([50, AEG.magSize, 70 - AEG.magSize]);
    expect(fillSpares(a.armament, 0, 500)).toBe(AEG.magSize * pouch.length - 120);
  });
});
