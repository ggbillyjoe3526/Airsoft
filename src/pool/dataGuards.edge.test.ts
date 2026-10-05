import { describe, expect, it } from 'vitest';
import poolText from '../../pool.md?raw';
import { RECORDS_KEY } from '../config/matchInfo';
import { storedIsNewer } from '../save/overStored';
import { addMatch, emptyRecords, loadRecords, saveRecords } from '../stats/records';
import { COLLECTION_KEY, loadCollection, newCollection, saveCollection } from './collection';
import { DEFAULT_ECONOMY, loadPool } from './pool';
import { MemoryStorage } from './testStorage';

/** QA edge cases for M56 (the worker's own tests are in pool.test.ts, supplyEvents.test.ts and records.test.ts). */
const shipped = loadPool(poolText);

/** The table's own errors: loadPool on a pool.md of one table also reports every other table as missing. */
const own = (errors: readonly string[]): string[] => errors.filter((e) => !/^no "/.test(e));
const events = (...rows: string[]) => loadPool(['### Supply events', '| Supply event | Key | When | FC % | Part % |', '|---|---|---|---|---|', ...rows].join('\n'));
const tiers = (...rows: string[]) => loadPool(['### Rarity', '| Tier | Odds % | Bonus % | Scrap FC |', '|---|---|---|---|', ...rows].join('\n'));

/** A store that records every write, to prove a refusal writes nothing at all. */
class SpyStorage extends MemoryStorage {
  writes = 0;
  override setItem(k: string, v: string): void {
    this.writes++;
    super.setItem(k, v);
  }
}

describe('M56 acceptance 1: the shipped file and the guards\' edges', () => {
  it('the shipped pool.md reads with no errors, and its Supply events and Rarity odds pass the new checks', () => {
    expect(shipped.errors).toEqual([]);
    expect(shipped.supplyEvents.length).toBeGreaterThan(0);
    const odds = shipped.tiers.map((t) => t.odds);
    expect(odds.every((o, i) => i === 0 || o <= odds[i - 1]!)).toBe(true);
  });

  it('Supply event percentages: 0, 10 and 1000 read; 9.99, 1001 and a negative do not; a trailing % is allowed', () => {
    const ok = events('| A | a | Monday | 0 | 10 |', '| B | b | Tuesday | 1000 | 10% |');
    expect(own(ok.errors)).toEqual([]);
    expect(ok.supplyEvents.map((e) => [e.key, e.fc, e.parts])).toEqual([
      ['a', 0, 0.1],
      ['b', 10, 0.1],
    ]);
    const bad = events('| C | c | Monday | 9.99 | 100 |', '| D | d | Tuesday | 100 | 1001 |', '| E | e | Wednesday | -5 | 100 |', '| F | f | Thursday | 0.5 | 100 |');
    expect(bad.supplyEvents).toEqual([]);
    expect(own(bad.errors)).toEqual([
      expect.stringMatching(/^line 4: FC % is a percentage .*"9\.99" is under the least, 10/),
      'line 5: Part % must be a percentage from 0 to 1000, not "1001"',
      'line 6: FC % must be a percentage from 0 to 1000, not "-5"',
      expect.stringMatching(/^line 7: FC % is a percentage .*"0\.5" is under the least, 10/),
    ]);
  });

  it('a row with both percentages wrong reports each at its own line, and its good neighbours still read', () => {
    const p = events('| A | a | Monday | 1.25 | 1.5 |', '| B | b | Tuesday | 100 | 100 |');
    expect(own(p.errors).filter((e) => e.startsWith('line 4:')).map((e) => e.slice(8, 14))).toEqual(['FC % i', 'Part %']);
    expect(p.supplyEvents.map((e) => e.key)).toEqual(['b']);
  });

  it('a row with a floor error is left out even when its other cells are fine, and a name or key slip is still reported with it', () => {
    const p = events('| | Bad Key | Funday | 1.25 | 100 |');
    expect(p.supplyEvents).toEqual([]);
    expect(own(p.errors).length).toBe(4);
  });

  it('Difficulty: each of the four rows has the floor, 0.1 reads, a negative and a word do not; only the bad row falls back', () => {
    for (const name of ['Easy', 'Normal', 'Hard', 'Pro']) {
      const row = new RegExp(`^\\| ${name} \\| [0-9.]+ \\|$`, 'm');
      expect(row.test(poolText), name).toBe(true);
      const zero = loadPool(poolText.replace(row, `| ${name} | 0 |`));
      // The row's own error, then the table's "no row: using the built-in number" for it.
      expect(zero.errors, name).toEqual([expect.stringMatching(/^line \d+: Multiplier must be a number of 0\.1 or more, not "0"$/), `"Difficulty" has no ${name.toLowerCase()} row (Multiplier): using the built-in number`]);
      expect(loadPool(poolText.replace(row, `| ${name} | 0.1 |`)).errors, name).toEqual([]);
    }
    const p = loadPool(poolText.replace('| Hard | 1.5 |', '| Hard | -1 |').replace('| Pro | 2 |', '| Pro | fast |'));
    expect(p.errors.filter((e) => e.startsWith('line '))).toHaveLength(2);
    expect(p.economy.difficulty).toEqual({ ...DEFAULT_ECONOMY.difficulty, easy: 0.5, normal: 1 });
    // A value above the floor is read as written, not clamped.
    expect(loadPool(poolText.replace('| Pro | 2 |', '| Pro | 0.11 |')).economy.difficulty.pro).toBe(0.11);
  });

  it('Rarity odds: equal neighbours are fine, one rise anywhere is reported once at the table header', () => {
    expect(own(tiers('| Common | 50 | 0 | 5 |', '| Rare | 50 | 5 | 20 |').errors)).toEqual([]);
    expect(own(tiers('| Common | 60 | 0 | 5 |', '| Rare | 10 | 5 | 20 |', '| Epic | 30 | 9 | 40 |').errors)).toEqual([
      'line 2: Odds % may not rise down the table: a rarer tier is drawn less often',
    ]);
    // Falling by any amount is fine.
    expect(own(tiers('| Common | 90 | 0 | 5 |', '| Rare | 7 | 5 | 20 |', '| Epic | 3 | 9 | 40 |').errors)).toEqual([]);
  });
});

describe('M56 acceptance 2: the Supply events header', () => {
  it('a table with every column, in another order and with an extra one, still reads', () => {
    const p = loadPool(['### Supply events', '| Supply event | Key | Part % | FC % | When | Note |', '|---|---|---|---|---|---|', '| A | a | 150 | 125 | Friday to Sunday | x |'].join('\n'));
    expect(own(p.errors)).toEqual([]);
    expect(p.supplyEvents.map((e) => [e.key, e.fc, e.parts])).toEqual([['a', 1.25, 1.5]]);
  });

  it('a header with no rows is no error and no events', () => {
    const p = events();
    expect(own(p.errors)).toEqual([]);
    expect(p.supplyEvents).toEqual([]);
  });

  it('each single missing column gives exactly one error, at the header line, naming that column', () => {
    const all = ['Supply event', 'Key', 'When', 'FC %', 'Part %'];
    for (const gone of ['Key', 'FC %', 'Part %']) {
      const heads = all.filter((h) => h !== gone);
      const p = loadPool(['### Supply events', `| ${heads.join(' | ')} |`, `|${heads.map(() => '---').join('|')}|`, `| ${heads.map(() => 'x').join(' | ')} |`, `| ${heads.map(() => 'y').join(' | ')} |`].join('\n'));
      expect(own(p.errors), gone).toEqual([expect.stringMatching(new RegExp(`^line 2: the Supply events table needs the columns .*; missing: ${gone}$`))]);
      expect(p.supplyEvents, gone).toEqual([]);
    }
  });

  it('a table under the Supply events heading whose first column is something else is reported once, not read as no events', () => {
    const p = loadPool(['### Supply events', '| Name | Key | When | FC % | Part % |', '|---|---|---|---|---|', '| A | a | Friday | 125 | 150 |'].join('\n'));
    expect(p.supplyEvents).toEqual([]);
    expect(own(p.errors)).toEqual(['line 2: the Supply events table needs the columns Supply event, Key, When, FC %, Part %; missing: Supply event']);
  });
});

describe('M56 acceptance 4: storedIsNewer', () => {
  const store = (raw: string | null) => {
    const s = new MemoryStorage();
    if (raw !== null) s.setItem('k', raw);
    return s;
  };

  it('is true only for a stored object with a numeric version above this build\'s', () => {
    expect(storedIsNewer(store('{"version":2}'), 'k', 1)).toBe(true);
    expect(storedIsNewer(store('{"version":1.5}'), 'k', 1)).toBe(true);
    expect(storedIsNewer(store('{"version":1}'), 'k', 1)).toBe(false);
    expect(storedIsNewer(store('{"version":0}'), 'k', 1)).toBe(false);
    expect(storedIsNewer(store('{"version":-3}'), 'k', 1)).toBe(false);
  });

  it('is false for nothing, junk, a non-object, an array, or a version that is not a number, and never throws', () => {
    for (const raw of [null, '', 'not json', 'null', '5', '"2"', 'true', '[2]', '{}', '{"version":"2"}', '{"version":null}', '{"version":[2]}', '{"version":true}']) {
      expect(storedIsNewer(store(raw), 'k', 1), String(raw)).toBe(false);
    }
    expect(storedIsNewer({ getItem: () => { throw new Error('blocked'); } }, 'k', 1)).toBe(false);
    expect(storedIsNewer(store('{"version":2}'), 'other', 1)).toBe(false);
  });
});

describe('M56 acceptance 4: a newer store is left alone, whatever its other fields hold', () => {
  const newerCollection = JSON.stringify({ version: 3, owned: { '000007@legendary': 3 }, fc: 5000, tokens: 9, seed: 7, rev: 99, extra: { a: [1] } });

  it('saveCollection writes nothing at all (not one setItem) and leaves c.rev alone, even when the stored rev is lower than c.rev', () => {
    const s = new SpyStorage();
    s.setItem(COLLECTION_KEY, JSON.stringify({ version: 2, rev: 0 }));
    s.writes = 0;
    const c = newCollection(shipped, 1);
    c.rev = 5;
    c.fc = 123;
    expect(saveCollection(c, s)).toBe(false);
    expect(s.writes).toBe(0);
    expect(c.rev).toBe(5);
    expect(s.getItem(COLLECTION_KEY)).toBe(JSON.stringify({ version: 2, rev: 0 }));
  });

  it('saveCollection refuses repeatedly, and a newer store does not leak into loadCollection\'s result', () => {
    const s = new SpyStorage();
    s.setItem(COLLECTION_KEY, newerCollection);
    s.writes = 0;
    const c = loadCollection(shipped, 4, s);
    expect(c.seed).toBe(4);
    expect(c.rev ?? 0).toBe(0);
    for (let i = 0; i < 3; i++) expect(saveCollection(c, s)).toBe(false);
    expect(s.writes).toBe(0);
    expect(s.getItem(COLLECTION_KEY)).toBe(newerCollection);
  });

  it('a stored collection that is older, or of this version, is still saved over (the guard is not a blanket refusal)', () => {
    const s = new SpyStorage();
    const c = newCollection(shipped, 1);
    s.setItem(COLLECTION_KEY, JSON.stringify({ version: 1, rev: 0, fc: 3, extra: 'kept' }));
    expect(saveCollection(c, s)).toBe(true);
    expect(JSON.parse(s.getItem(COLLECTION_KEY)!)).toMatchObject({ version: 1, extra: 'kept' });
    s.setItem(COLLECTION_KEY, JSON.stringify({ version: 0, fc: 3 }));
    expect(saveCollection(c, s)).toBe(true);
  });

  it('saveRecords writes nothing at all to a newer store, and the next load still plays on empty records', () => {
    const raw = JSON.stringify({ version: 7, results: { 'normal.elimination': { wins: 4, losses: 0 } }, extra: [1, 2] });
    const s = new SpyStorage();
    s.setItem(RECORDS_KEY, raw);
    s.writes = 0;
    const r = loadRecords(s);
    expect(r).toEqual(emptyRecords());
    addMatch(r, { difficulty: 'normal', mode: 'elimination', won: true, hits: 0, bbsFired: 0 });
    saveRecords(r, s);
    saveRecords(r, s);
    expect(s.writes).toBe(0);
    expect(s.getItem(RECORDS_KEY)).toBe(raw);
  });

  it('records with no version, junk, or an older version are saved over as before', () => {
    for (const stored of [null, 'junk', '{"streak":3}', '{"version":0,"streak":3}']) {
      const s = new SpyStorage();
      if (stored !== null) s.setItem(RECORDS_KEY, stored);
      const r = emptyRecords();
      r.streak = 2;
      saveRecords(r, s);
      expect(JSON.parse(s.getItem(RECORDS_KEY)!), String(stored)).toMatchObject({ version: 1, streak: 2 });
    }
  });
});
