import { describe, expect, it } from 'vitest';
import { GAME_POOL } from '../pool/gamePool';
import { MemoryStorage } from '../pool/testStorage';
import { loadLevels } from './levels';
import { addXp, grantReached, loadProgress, newProgress, PROGRESS_KEY, PROGRESS_VERSION, resetProgress, saveProgress, syncProgress, xpToNext } from './progress';

/** pool.md's id for `name`. */
const id = (name: string): string => GAME_POOL.assets.find((a) => a.name === name)!.id;

/** A small levels.md: the given Levels rows and the shipped XP numbers. */
function table(rows: readonly string[]) {
  const text = [
    '| Level | XP | Unlocks |',
    '|---|---|---|',
    ...rows,
    '',
    '| Event | XP |',
    '|---|---|',
    '| Match played | 100 |',
    '| Match won | 100 |',
    '| Round won | 20 |',
    '| Hit on an opponent | 10 |',
    '',
    '| Difficulty | Multiplier |',
    '|---|---|',
    '| Easy | 0.5 |',
    '| Normal | 1 |',
    '| Hard | 1.5 |',
    '| Pro | 2 |',
  ].join('\n');
  return loadLevels(text, GAME_POOL);
}

/** Levels 0 to 3 (totals 0, 100, 300, 600); the rest of the pool is in no row, which these tests don't need. */
const T = table(['| 0 | 0 | GBB Pistol, AEG Rifle |', '| 1 | 100 | Red Dot |', '| 2 | 200 | Silencer, Vertical Grip |', '| 3 | 300 | Cyber Pistol |']);
const KIT = [id('GBB Pistol'), id('AEG Rifle')];
const CAP_TOTAL = 600;

/** A storage whose every read and write throws, as a browser with storage blocked can. */
const throwing = {
  getItem: () => {
    throw new Error('blocked');
  },
  setItem: () => {
    throw new Error('blocked');
  },
} as unknown as Storage;

describe('the test table (premise)', () => {
  it('reads levels 0 to 3 with their totals', () => {
    expect(T.cap).toBe(3);
    expect(T.levels.map((l) => l.total)).toEqual([0, 100, 300, CAP_TOTAL]);
  });
});

describe('a new player (LV1)', () => {
  it('is at level 0 with no XP and level 0\'s items alone', () => {
    expect(newProgress(T)).toEqual({ xp: 0, unlocked: KIT, rev: 0 });
  });

  it('gets a fresh copy each time, so one player\'s unlocks never reach another', () => {
    const a = newProgress(T);
    a.unlocked.push('999999');
    expect(newProgress(T).unlocked).toEqual(KIT);
  });
});

describe('adding XP (LV1)', () => {
  it('adds XP within a level without unlocking anything', () => {
    const p = newProgress(T);
    expect(addXp(p, T, 60)).toEqual({ from: 0, to: 0, unlocked: [] });
    expect(p.xp).toBe(60);
    expect(xpToNext(p, T)).toBe(40);
  });

  it('raises the level and unlocks its items once it reaches the level\'s total exactly', () => {
    const p = newProgress(T);
    expect(addXp(p, T, 100)).toEqual({ from: 0, to: 1, unlocked: [id('Red Dot')] });
    expect(p.unlocked).toEqual([...KIT, id('Red Dot')]);
    expect(xpToNext(p, T)).toBe(200);
  });

  it('unlocks every level crossed in one go, lowest level first, and each item only once', () => {
    const p = newProgress(T);
    expect(addXp(p, T, 350)).toEqual({ from: 0, to: 2, unlocked: [id('Red Dot'), id('Silencer'), id('Vertical Grip')] });
    expect(addXp(p, T, 10)).toEqual({ from: 2, to: 2, unlocked: [] });
    expect(p.unlocked).toEqual([...KIT, id('Red Dot'), id('Silencer'), id('Vertical Grip')]);
    expect(new Set(p.unlocked).size).toBe(p.unlocked.length);
  });

  it('rounds the XP and never takes any away', () => {
    const p = newProgress(T);
    addXp(p, T, 10.6);
    expect(p.xp).toBe(11);
    expect(addXp(p, T, -50)).toEqual({ from: 0, to: 0, unlocked: [] });
    expect(p.xp).toBe(11);
  });

  it('stops counting at the cap\'s total: XP past it is not kept, and the cap says 0 to next', () => {
    const p = newProgress(T);
    expect(addXp(p, T, 10_000)).toEqual({ from: 0, to: 3, unlocked: [id('Red Dot'), id('Silencer'), id('Vertical Grip'), id('Cyber Pistol')] });
    expect(p.xp).toBe(CAP_TOTAL);
    expect(addXp(p, T, 500)).toEqual({ from: 3, to: 3, unlocked: [] });
    expect(p.xp).toBe(CAP_TOTAL);
    expect(xpToNext(p, T)).toBe(0);
  });

  it('keeps the XP of a save over a cap levels.md has since brought down', () => {
    const p = { xp: 5000, unlocked: [...KIT], rev: 0 };
    addXp(p, T, 100);
    expect(p.xp).toBe(5000);
    expect(p.unlocked).toContain(id('Cyber Pistol'));
  });
});

describe('items a level below the player newly holds (LV1 grantReached)', () => {
  it('adds an item levels.md moved down to a level the player is past, and takes away none moved up', () => {
    const p = newProgress(T);
    addXp(p, T, 150); // level 1: the Red Dot
    // levels.md now: the Silencer down to level 1, the Red Dot up to level 3.
    const moved = table(['| 0 | 0 | GBB Pistol, AEG Rifle |', '| 1 | 100 | Silencer |', '| 2 | 200 | Vertical Grip |', '| 3 | 300 | Red Dot, Cyber Pistol |']);
    expect(grantReached(p, moved)).toEqual([id('Silencer')]);
    expect(p.unlocked).toEqual([...KIT, id('Red Dot'), id('Silencer')]);
    expect(grantReached(p, moved)).toEqual([]);
  });

  it('gives a save missing the starting kit its level 0 items', () => {
    const p = { xp: 0, unlocked: [], rev: 0 };
    expect(grantReached(p, T)).toEqual(KIT);
  });

  it('never takes away an item no level holds any more', () => {
    const p = { xp: 0, unlocked: [...KIT, id('Cyber Pistol')], rev: 0 };
    expect(grantReached(p, T)).toEqual([]);
    expect(p.unlocked).toContain(id('Cyber Pistol'));
  });
});

describe('Reset level (LV1, Dev settings)', () => {
  it('goes back to level 0 with the starting kit alone', () => {
    const p = newProgress(T);
    addXp(p, T, 400);
    resetProgress(p, T);
    expect(p.xp).toBe(0);
    expect(p.unlocked).toEqual(KIT);
  });
});

describe('saving and loading the progress (LV1)', () => {
  it('reads back what it saved, raising the revision with every save', () => {
    const s = new MemoryStorage();
    const p = newProgress(T);
    addXp(p, T, 150);
    expect(saveProgress(p, s)).toBe(true);
    expect(p.rev).toBe(1);
    expect(JSON.parse(s.getItem(PROGRESS_KEY)!)).toEqual({ version: PROGRESS_VERSION, xp: 150, unlocked: [...KIT, id('Red Dot')], rev: 1 });
    expect(loadProgress(T, s)).toEqual(p);
    expect(saveProgress(p, s)).toBe(true);
    expect(p.rev).toBe(2);
  });

  it('gives a new player\'s progress with storage blocked, and saves nothing', () => {
    for (const blocked of [null, throwing]) {
      expect(loadProgress(T, blocked)).toEqual(newProgress(T));
      const p = newProgress(T);
      addXp(p, T, 50);
      expect(saveProgress(p, blocked)).toBe(false);
      expect(syncProgress(p, T, blocked)).toBe(false);
      // The XP lasts for the visit.
      expect(p.xp).toBe(50);
    }
  });

  it('gives a new player\'s progress for garbage, and a save of the wrong shape', () => {
    for (const raw of ['not json', '[1,2]', '5', 'null', JSON.stringify({ xp: 300, unlocked: [] }), JSON.stringify({ version: 'one', xp: 300 })]) {
      const s = new MemoryStorage();
      s.setItem(PROGRESS_KEY, raw);
      expect(loadProgress(T, s), raw).toEqual(newProgress(T));
    }
  });

  it('reads a bad field as nothing without dropping the good ones, and adds what the level reaches', () => {
    const s = new MemoryStorage();
    s.setItem(PROGRESS_KEY, JSON.stringify({ version: PROGRESS_VERSION, xp: 150, unlocked: [id('Cyber Pistol'), 7, 'junk', '000001@rare', id('Cyber Pistol')], rev: -1 }));
    // The Cyber Pistol stays (unlocks are never taken away); level 1's kit and the Red Dot are added.
    expect(loadProgress(T, s)).toEqual({ xp: 150, unlocked: [id('Cyber Pistol'), ...KIT, id('Red Dot')], rev: 0 });
    s.setItem(PROGRESS_KEY, JSON.stringify({ version: PROGRESS_VERSION, xp: -5, unlocked: 'all', rev: 2.5 }));
    expect(loadProgress(T, s)).toEqual({ xp: 0, unlocked: KIT, rev: 0 });
  });

  it('neither reads nor writes over progress a newer build saved', () => {
    const s = new MemoryStorage();
    const newer = JSON.stringify({ version: PROGRESS_VERSION + 1, xp: 99999, unlocked: [], rev: 9 });
    s.setItem(PROGRESS_KEY, newer);
    const p = loadProgress(T, s);
    expect(p).toEqual(newProgress(T));
    addXp(p, T, 100);
    expect(saveProgress(p, s)).toBe(false);
    expect(s.getItem(PROGRESS_KEY)).toBe(newer);
  });

  it('keeps a field a newer build added when it saves', () => {
    const s = new MemoryStorage();
    s.setItem(PROGRESS_KEY, JSON.stringify({ version: PROGRESS_VERSION, xp: 0, unlocked: KIT, rev: 0, skins: ['camo'] }));
    const p = loadProgress(T, s);
    addXp(p, T, 20);
    saveProgress(p, s);
    expect(JSON.parse(s.getItem(PROGRESS_KEY)!)).toMatchObject({ xp: 20, skins: ['camo'] });
  });
});

describe('two tabs and the save\'s revision (LV1)', () => {
  it('never writes an older copy over XP another tab saved since, and takes that tab\'s XP on sync', () => {
    const s = new MemoryStorage();
    const a = loadProgress(T, s);
    const b = loadProgress(T, s);
    addXp(a, T, 120);
    expect(saveProgress(a, s)).toBe(true);
    // Tab b read before a saved: its save would wipe a's XP, so it is refused.
    addXp(b, T, 30);
    expect(saveProgress(b, s)).toBe(false);
    expect(JSON.parse(s.getItem(PROGRESS_KEY)!).xp).toBe(120);
    // Synced, b takes a's progress in place (the same object) and can save on top of it.
    const same = b;
    expect(syncProgress(b, T, s)).toBe(true);
    expect(b).toBe(same);
    expect(b).toEqual({ xp: 120, unlocked: [...KIT, id('Red Dot')], rev: 1 });
    addXp(b, T, 30);
    expect(saveProgress(b, s)).toBe(true);
    expect(loadProgress(T, s)).toEqual({ xp: 150, unlocked: [...KIT, id('Red Dot')], rev: 2 });
  });

  it('changes nothing on sync when no newer save is stored', () => {
    const s = new MemoryStorage();
    const p = loadProgress(T, s);
    expect(syncProgress(p, T, s)).toBe(false);
    addXp(p, T, 10);
    saveProgress(p, s);
    expect(syncProgress(p, T, s)).toBe(false);
    expect(p.xp).toBe(10);
  });

  it('adds what the synced level reaches under this build\'s levels', () => {
    const s = new MemoryStorage();
    const p = loadProgress(T, s);
    s.setItem(PROGRESS_KEY, JSON.stringify({ version: PROGRESS_VERSION, xp: 300, unlocked: [], rev: 5 }));
    expect(syncProgress(p, T, s)).toBe(true);
    expect(p.unlocked).toEqual([...KIT, id('Red Dot'), id('Silencer'), id('Vertical Grip')]);
  });
});
