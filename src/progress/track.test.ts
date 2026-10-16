import { describe, expect, it } from 'vitest';
import { contentPool } from '../pool/contentPool';
import { GAME_POOL } from '../pool/gamePool';
import { GAME_LEVELS } from './gameLevels';
import { DEFAULT_XP, type LevelTable } from './levels';
import { addXp, newProgress, type Progress } from './progress';
import { levelTrack } from './track';

/** pool.md's id for `name`, and the names of ids. */
const id = (name: string): string => GAME_POOL.assets.find((a) => a.name === name)!.id;
const names = (ids: readonly string[]): string[] => ids.map((i) => GAME_POOL.byId.get(i)!.name);

/** The pool as offered: dev items (the Weapon Torch) only with Dev content on (M35). */
const offeredBy = (devContent: boolean) => {
  const pool = contentPool(GAME_POOL, devContent);
  return (asset: string): boolean => pool.byId.has(asset);
};
const offered = offeredBy(false);

/** A player who has earned `xp` from a new save, with what the levels reached unlocked. */
function playerAt(xp: number, t: LevelTable = GAME_LEVELS): Progress {
  const p = newProgress(t);
  addXp(p, t, xp);
  return p;
}

/** Every offered item the shipped levels unlock with dev items hidden: 19 (levels.md less the Weapon Torch). */
const OFFERED_TOTAL = GAME_LEVELS.levels.flatMap((l) => l.unlocks).filter(offered).length;

describe('the level track (LV1)', () => {
  it('lists every level from the starting kit to the cap with its running XP and its items, from levels.md', () => {
    const t = levelTrack(GAME_LEVELS, playerAt(0), offered, false);
    expect(t.cap).toBe(10);
    expect(t.levels.map((l) => l.level)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(t.levels.map((l) => l.total)).toEqual([0, 100, 400, 800, 1300, 1900, 2600, 3400, 4300, 5300, 6500]);
    expect(names(t.levels[1]!.items)).toEqual(['Red Dot']);
    expect(names(t.levels[2]!.items)).toEqual(['Vertical Grip', 'Red Laser']);
    expect(names(t.levels[10]!.items)).toEqual(['Cyber Pistol']);
  });

  it('starts a new player at level 0 with the starting kit unlocked, level 1 next and the rest locked', () => {
    const t = levelTrack(GAME_LEVELS, playerAt(0), offered, false);
    expect(t.standing).toEqual({ level: 0, into: 0, next: 100, xp: 0 });
    expect(t.levels.map((l) => l.state)).toEqual(['unlocked', 'next', ...Array(9).fill('locked')]);
    expect(t.next!.level).toBe(1);
    expect(names(t.next!.items)).toEqual(['Red Dot']);
    expect(t.off).toBe(false);
  });

  it('counts with dev items hidden: the Weapon Torch is in neither the starting kit nor the counts', () => {
    const t = levelTrack(GAME_LEVELS, playerAt(0), offered, false);
    expect(names(t.levels[0]!.items)).toEqual(['GBB Pistol', 'AEG Rifle', 'Standard Battery', 'Green Gas']);
    expect(OFFERED_TOTAL).toBe(19);
    expect([t.unlocked, t.total]).toEqual([4, 19]);
    // Dev content on: the torch is offered, in the kit and in both counts (a new player already has it).
    const dev = levelTrack(GAME_LEVELS, playerAt(0), offeredBy(true), false);
    expect(names(dev.levels[0]!.items)).toContain('Weapon Torch');
    expect([dev.unlocked, dev.total]).toEqual([5, 20]);
  });

  it('marks the levels reached unlocked, the one after them next and the rest locked, part way up', () => {
    const t = levelTrack(GAME_LEVELS, playerAt(900), offered, false);
    expect(t.standing).toEqual({ level: 3, into: 100, next: 500, xp: 900 });
    expect(t.levels.map((l) => l.state)).toEqual(['unlocked', 'unlocked', 'unlocked', 'unlocked', 'next', ...Array(6).fill('locked')]);
    expect(names(t.next!.items)).toEqual(['Silencer']);
    // The kit's 4, Red Dot, Vertical Grip and Red Laser, the two magazines.
    expect([t.unlocked, t.total]).toEqual([9, 19]);
  });

  it('counts what the player has, not what their level covers (an item moved to a lower level arrives on the next visit)', () => {
    const p = playerAt(0);
    p.unlocked.push(id('Silencer'));
    expect(levelTrack(GAME_LEVELS, p, offered, false).unlocked).toBe(5);
    // An asset no longer offered is never counted, even though the save holds it.
    p.unlocked.push('999999');
    expect(levelTrack(GAME_LEVELS, p, offered, false).unlocked).toBe(5);
  });

  it('marks an item the player already has as theirs on a level still ahead (levels.md moved it up, KI1)', () => {
    const p = playerAt(0);
    p.unlocked.push(id('Silencer'));
    const t = levelTrack(GAME_LEVELS, p, offered, false);
    const row = t.levels.find((l) => names(l.items).includes('Silencer'))!;
    expect(row.state).toBe('locked');
    expect(row.owned).toEqual(row.items.map((i) => i === id('Silencer')));
    // Every item of a reached level is theirs; none of a level ahead they don't hold.
    expect(t.levels[0]!.owned.every(Boolean)).toBe(true);
    expect(t.levels[1]!.owned).toEqual([false]);
  });

  it('has everything unlocked and nothing next at the cap, and XP past the cap counts no further', () => {
    const t = levelTrack(GAME_LEVELS, playerAt(9000), offered, false);
    expect(t.standing).toEqual({ level: 10, into: 0, next: null, xp: 6500 });
    expect(t.levels.every((l) => l.state === 'unlocked')).toBe(true);
    expect(t.next).toBeNull();
    expect([t.unlocked, t.total]).toEqual([19, 19]);
  });

  it('with levelling off (Dev settings) reads every level unlocked, with nothing next, and keeps the player\'s own standing', () => {
    const t = levelTrack(GAME_LEVELS, playerAt(150), offered, true);
    expect(t.off).toBe(true);
    expect(t.levels.every((l) => l.state === 'unlocked')).toBe(true);
    expect(t.next).toBeNull();
    expect([t.unlocked, t.total]).toEqual([19, 19]);
    expect(t.standing.level).toBe(1);
  });

  it('makes the next unlock the lowest level ahead that offers something, past one whose items are all still being built', () => {
    const torch = id('Weapon Torch');
    const t: LevelTable = {
      levels: [
        { level: 0, xp: 0, total: 0, unlocks: [id('GBB Pistol')] },
        { level: 1, xp: 100, total: 100, unlocks: [torch] },
        { level: 2, xp: 100, total: 200, unlocks: [id('Red Dot')] },
      ],
      cap: 2,
      xp: DEFAULT_XP,
      unlockLevel: new Map(),
      errors: [],
    };
    const track = levelTrack(t, playerAt(0, t), offered, false);
    expect(track.levels[1]!.items).toEqual([]);
    expect(track.next!.level).toBe(2);
    // The row marked next is the same level the next-unlock card shows.
    expect(track.levels.map((l) => l.state)).toEqual(['unlocked', 'locked', 'next']);
    expect(levelTrack(t, playerAt(0, t), offeredBy(true), false).next!.level).toBe(1);
  });
});
