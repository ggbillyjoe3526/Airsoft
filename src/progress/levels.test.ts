import { describe, expect, it } from 'vitest';
import levelsText from '../../data/levels.md?raw';
import { GAME_POOL } from '../pool/gamePool';
import { GAME_LEVELS } from './gameLevels';
import { DEFAULT_XP, levelOf, loadLevels, standing, unlocksUpTo } from './levels';

/** pool.md's id for `name`. */
const id = (name: string): string => GAME_POOL.assets.find((a) => a.name === name)!.id;
const names = (ids: readonly string[]): string[] => ids.map((i) => GAME_POOL.byId.get(i)!.name);

/** levels.md as shipped with the Levels table's rows swapped for `rows` (each `| level | xp | unlocks |`). */
function withLevels(rows: readonly string[]): string {
  const start = levelsText.indexOf('| Level | XP | Unlocks |');
  const end = levelsText.indexOf('\n\n', start);
  return `${levelsText.slice(0, start)}| Level | XP | Unlocks |\n|---|---|---|\n${rows.join('\n')}${levelsText.slice(end)}`;
}

/** Every item in a row of its own after the given rows, so the test's rows are the only thing it changes. */
function rest(from: number, taken: readonly string[]): string[] {
  const left = GAME_POOL.assets.filter((a) => !taken.includes(a.name));
  return left.map((a, i) => `| ${from + i} | 100 | ${a.name} |`);
}

describe('levels.md as shipped (LV1)', () => {
  it('reads with no problems', () => {
    expect(GAME_LEVELS.errors).toEqual([]);
  });

  it('runs from level 0 to a cap of 10', () => {
    expect(GAME_LEVELS.cap).toBe(10);
    expect(GAME_LEVELS.levels.map((l) => l.level)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  });

  it('starts everyone on the GBB Pistol and the AEG Rifle with their power sources, and gives the Cyber Pistol at the cap', () => {
    expect(names(GAME_LEVELS.levels[0]!.unlocks)).toEqual(['GBB Pistol', 'AEG Rifle', 'Standard Battery', 'Green Gas', 'Weapon Torch']);
    expect(names(GAME_LEVELS.levels[10]!.unlocks)).toEqual(['Cyber Pistol']);
    expect(GAME_LEVELS.levels[0]!.xp).toBe(0);
  });

  it('unlocks every item in the pool at exactly one level', () => {
    const all = GAME_LEVELS.levels.flatMap((l) => l.unlocks);
    expect(new Set(all).size).toBe(all.length);
    expect([...all].sort()).toEqual(GAME_POOL.assets.map((a) => a.id).sort());
    for (const a of GAME_POOL.assets) expect(GAME_LEVELS.unlockLevel.has(a.id), a.name).toBe(true);
  });

  it('gives something at every level past the starting kit', () => {
    for (const l of GAME_LEVELS.levels.slice(1)) expect(l.unlocks.length, `level ${l.level}`).toBeGreaterThan(0);
  });

  it('keeps each level a running total, each taking at least as much as the one before', () => {
    let total = 0;
    let last = 0;
    for (const l of GAME_LEVELS.levels) {
      total += l.xp;
      expect(l.total).toBe(total);
      expect(l.xp).toBeGreaterThanOrEqual(last);
      last = l.xp;
    }
    expect(GAME_LEVELS.levels[10]!.total).toBe(6500);
  });

  it('gives the XP numbers the built-in ones repeat', () => {
    expect(GAME_LEVELS.xp).toEqual(DEFAULT_XP);
  });
});

describe('reading levels.md (LV1)', () => {
  it('reads names in any case, and a thousands comma in an XP cell', () => {
    const t = loadLevels(withLevels(['| 0 | - | gbb pistol, AEG RIFLE |', '| 1 | 1,200 | Red Dot |', ...rest(2, ['GBB Pistol', 'AEG Rifle', 'Red Dot'])]), GAME_POOL);
    expect(t.errors).toEqual([]);
    expect(names(t.levels[0]!.unlocks)).toEqual(['GBB Pistol', 'AEG Rifle']);
    expect(t.levels[1]!.xp).toBe(1200);
  });

  it('leaves out a name pool.md does not have, with its line, and keeps the rest of the row', () => {
    const t = loadLevels(withLevels(['| 0 | 0 | GBB Pistol, Laser Sword |', ...rest(1, ['GBB Pistol'])]), GAME_POOL);
    expect(t.errors).toEqual([expect.stringMatching(/^line \d+: "Laser Sword" isn't a Name in pool\.md$/)]);
    expect(names(t.levels[0]!.unlocks)).toEqual(['GBB Pistol']);
  });

  it('keeps an item at its first level when a later row names it again', () => {
    const t = loadLevels(withLevels(['| 0 | 0 | GBB Pistol |', '| 1 | 100 | GBB Pistol |', ...rest(2, ['GBB Pistol'])]), GAME_POOL);
    expect(t.errors).toEqual([expect.stringContaining('the GBB Pistol is already unlocked at level 0')]);
    expect(t.unlockLevel.get(id('GBB Pistol'))).toBe(0);
    expect(t.levels[1]!.unlocks).toEqual([]);
  });

  it('stops at a level that skips a number, so the levels never jump', () => {
    const t = loadLevels(withLevels(['| 0 | 0 | GBB Pistol |', '| 2 | 100 | Red Dot |', ...rest(3, ['GBB Pistol', 'Red Dot'])]), GAME_POOL);
    expect(t.cap).toBe(0);
    expect(t.errors[0]).toMatch(/Level must be 1 here/);
    // An item named in a row left out says so once, not as a missing item too.
    expect(t.errors.some((e) => e.includes('no level unlocks the Red Dot'))).toBe(false);
  });

  it('refuses XP on level 0 and a level whose XP is not a whole number from 1', () => {
    expect(loadLevels(withLevels(['| 0 | 50 | GBB Pistol |', ...rest(1, ['GBB Pistol'])]), GAME_POOL).errors[0]).toMatch(/level 0 is the starting kit and takes no XP/);
    for (const bad of ['0', '1.5', 'lots', '']) {
      const t = loadLevels(withLevels(['| 0 | 0 | GBB Pistol |', `| 1 | ${bad} | Red Dot |`, ...rest(2, ['GBB Pistol', 'Red Dot'])]), GAME_POOL);
      expect(t.cap, bad).toBe(0);
      expect(t.errors[0], bad).toMatch(/XP must be a whole number/);
    }
  });

  it('says which pool item no level unlocks', () => {
    const t = loadLevels(withLevels(['| 0 | 0 | GBB Pistol |']), GAME_POOL);
    expect(t.errors).toContain(`no level unlocks the AEG Rifle (pool.md ID ${id('AEG Rifle')}): add its Name to a level's Unlocks`);
    expect(t.unlockLevel.has(id('AEG Rifle'))).toBe(false);
  });

  it('unlocks everything from the start when there is no readable level 0, and says so', () => {
    const t = loadLevels('# nothing here\n', GAME_POOL);
    expect(t.cap).toBe(0);
    expect(t.levels[0]!.unlocks).toHaveLength(GAME_POOL.assets.length);
    expect(t.errors).toContain('no readable level 0: every item is unlocked from the start');
    expect(t.xp).toEqual(DEFAULT_XP);
  });

  it('uses the built-in number for an XP row it can not read, and says which', () => {
    const text = levelsText.replace('| Match won | 100 |', '| Match won | lots |').replace('| Pro | 2 |', '| Pro | 0 |');
    const t = loadLevels(text, GAME_POOL);
    expect(t.xp.earn.matchWon).toBe(DEFAULT_XP.earn.matchWon);
    expect(t.xp.difficulty.pro).toBe(DEFAULT_XP.difficulty.pro);
    expect(t.errors.filter((e) => /XP must be a number|Multiplier must be a number/.test(e))).toHaveLength(2);
  });

  it('reads changed XP numbers', () => {
    const t = loadLevels(levelsText.replace('| Hit on an opponent | 10 |', '| Hit on an opponent | 25 |').replace('| Easy | 0.5 |', '| Easy | 0.75 |'), GAME_POOL);
    expect(t.errors).toEqual([]);
    expect(t.xp.earn.hit).toBe(25);
    expect(t.xp.difficulty.easy).toBe(0.75);
  });

  it('raises the cap with a row added under the last', () => {
    const t = loadLevels(levelsText.replace('| 10 | 1200 | Cyber Pistol |', '| 10 | 1200 | Cyber Pistol |\n| 11 | 1400 | |'), GAME_POOL);
    expect(t.errors).toEqual([]);
    expect(t.cap).toBe(11);
    expect(t.levels[11]).toEqual({ level: 11, xp: 1400, total: 7900, unlocks: [] });
  });
});

describe('where XP stands (LV1)', () => {
  const t = GAME_LEVELS;

  it('reaches a level on its total, not before', () => {
    expect(levelOf(t, 0)).toBe(0);
    expect(levelOf(t, 99)).toBe(0);
    expect(levelOf(t, 100)).toBe(1);
    expect(levelOf(t, 399)).toBe(1);
    expect(levelOf(t, 400)).toBe(2);
    expect(levelOf(t, 6500)).toBe(10);
    expect(levelOf(t, 1e9)).toBe(10);
  });

  it('gives the XP into the level and what the next takes', () => {
    expect(standing(t, 0)).toEqual({ level: 0, into: 0, next: 100, xp: 0 });
    expect(standing(t, 250)).toEqual({ level: 1, into: 150, next: 300, xp: 250 });
  });

  it('stops counting at the cap', () => {
    expect(standing(t, 9000)).toEqual({ level: 10, into: 0, next: null, xp: 6500 });
    expect(standing(t, -5)).toEqual({ level: 0, into: 0, next: 100, xp: 0 });
  });

  it('lists what levels 0 to n unlock, lowest first', () => {
    expect(names(unlocksUpTo(t, 1))).toEqual(['GBB Pistol', 'AEG Rifle', 'Standard Battery', 'Green Gas', 'Weapon Torch', 'Red Dot']);
  });
});
