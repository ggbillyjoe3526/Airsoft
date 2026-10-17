import { describe, expect, it } from 'vitest';
import levelsText from '../../data/levels.md?raw';
import poolText from '../../data/pool.md?raw';
import statsText from '../../data/stats.md?raw';
import { GAME_POOL } from '../pool/gamePool';
import { MemoryStorage } from '../pool/testStorage';
import { STORES_BY_FORMAT, SAVE_FORMAT } from '../save/saveFile';
import { emptyRecords } from '../stats/records';
import { MatchTakes, settleMatch } from '../stats/settleMatch';
import { GAME_LEVELS as L } from './gameLevels';
import { levelOf } from './levels';
import { loadProgress, PROGRESS_KEY, saveProgress, syncProgress } from './progress';
import type { MatchOutcome } from './xp';

/**
 * LV1 across modules, on the shipped levels.md: a player's journey through settle, save, reload and a second tab,
 * and the acceptance criterion 1 sweep of the data files and the save's stores. Each piece has its own unit tests;
 * these pin that they work together.
 */
const OUTCOME: MatchOutcome = { won: true, roundsWon: 5, hits: 7, winsNeeded: 5, difficulty: 'normal' };

describe('a player\'s journey on the shipped levels (LV1 criterion 2)', () => {
  it('starts at level 0, levels up match by match, and keeps level and unlocks across a reload', () => {
    const s = new MemoryStorage();
    const p = loadProgress(L, s);
    expect(levelOf(L, p.xp)).toBe(0);
    const startKit = [...p.unlocked];
    expect(startKit.length).toBeGreaterThan(0);
    let last = 0;
    for (let i = 0; i < 40 && levelOf(L, p.xp) < L.cap; i++) {
      const settled = settleMatch(emptyRecords(), p, L, null, OUTCOME);
      expect(settled.levelUp!.from).toBe(last);
      expect(settled.levelUp!.to).toBeGreaterThanOrEqual(last);
      last = settled.levelUp!.to;
      expect(saveProgress(p, s)).toBe(true);
      expect(loadProgress(L, s)).toEqual(p); // what is shown after a reload is what was earned
    }
    expect(levelOf(L, p.xp)).toBe(L.cap);
    // At the cap every item the pool has is unlocked, for good, and the starting kit is still there.
    expect([...p.unlocked].sort()).toEqual(GAME_POOL.assets.map((a) => a.id).sort());
    expect(p.unlocked).toEqual(expect.arrayContaining(startKit));
    // More matches add nothing and take nothing.
    const xpAtCap = p.xp;
    expect(settleMatch(emptyRecords(), p, L, null, OUTCOME).levelUp).toMatchObject({ from: L.cap, to: L.cap, unlocked: [] });
    expect(p.xp).toBe(xpAtCap);
  });

  it('leaves the saved progress byte for byte as it was after a cheat match (Disable levelling, Dev help)', () => {
    const s = new MemoryStorage();
    const p = loadProgress(L, s);
    settleMatch(emptyRecords(), p, L, null, OUTCOME);
    saveProgress(p, s);
    const before = s.getItem(PROGRESS_KEY);
    const takes = new MatchTakes();
    const cheat = settleMatch(emptyRecords(), p, L, null, takes.outcome(true, false, () => OUTCOME));
    expect(cheat).toEqual({ news: null, xp: null, levelUp: null });
    expect(s.getItem(PROGRESS_KEY)).toBe(before);
    // The same match played clean gives XP, so the cheat case above is the rule and not an empty outcome.
    const clean = settleMatch(emptyRecords(), p, L, null, new MatchTakes().outcome(true, true, () => OUTCOME));
    expect(clean.xp!.total).toBeGreaterThan(0);
  });

  it('merges two tabs: the tab that fell behind takes the other\'s level and unlocks before it earns on top', () => {
    const s = new MemoryStorage();
    const a = loadProgress(L, s);
    const b = loadProgress(L, s);
    settleMatch(emptyRecords(), a, L, null, OUTCOME);
    settleMatch(emptyRecords(), a, L, null, OUTCOME);
    expect(saveProgress(a, s)).toBe(true);
    settleMatch(emptyRecords(), b, L, null, OUTCOME);
    expect(saveProgress(b, s)).toBe(false); // would wipe a's two matches
    expect(syncProgress(b, L, s)).toBe(true);
    expect(b.xp).toBe(a.xp);
    expect(b.unlocked).toEqual(a.unlocked);
    settleMatch(emptyRecords(), b, L, null, OUTCOME);
    expect(saveProgress(b, s)).toBe(true);
    expect(loadProgress(L, s).xp).toBe(a.xp + (b.xp - a.xp));
    // a is now behind b and refuses in turn.
    expect(saveProgress(a, s)).toBe(false);
  });
});

describe('no gacha left in the data files or the save (LV1 criterion 1)', () => {
  const GACHA = /field credit|\btokens?\b|\bshots\b|rarity|\bpity\b|\bscrap/i;
  for (const [file, text] of [['levels.md', levelsText], ['pool.md', poolText]] as const) {
    it(`${file} has no wallet, tier, pity or scrap vocabulary`, () => {
      const hits = text.split('\n').map((line, i) => `${i + 1}: ${line}`).filter((line) => GACHA.test(line));
      expect(hits).toEqual([]);
    });
  }

  it('the save has a progress store and no collection store', () => {
    const stores = Object.keys(STORES_BY_FORMAT[SAVE_FORMAT]!);
    expect(stores).toContain('progress');
    expect(stores).not.toContain('collection');
  });

  it('pool.md and stats.md carry no rarity or tier tables', () => {
    for (const [file, text] of [['pool.md', poolText], ['stats.md', statsText]] as const) {
      expect(text, file).not.toMatch(/^#+.*(rarity|tier|economy)/im);
      expect(text, file).not.toMatch(/\|\s*(Rarity|Tier|Field Credits|Tokens)\s*\|/i);
    }
  });
});
