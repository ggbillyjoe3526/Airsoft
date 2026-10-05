import { describe, expect, it } from 'vitest';
import poolText from '../../pool.md?raw';
import { COLLECTION_KEY, COLLECTION_VERSION, loadCollection, newCollection, saveCollection, saveOrReload } from './collection';
import { loadPool } from './pool';
import { MemoryStorage } from './testStorage';

/** QA for M70 (audit POOL-05): the cases around the rev race that the worker's three tests leave open. */
const pool = loadPool(poolText);

/** A storage that records every write and removal, and can be told to throw on write (full or blocked). */
class SpyStorage extends MemoryStorage {
  writes: [string, string][] = [];
  removals: string[] = [];
  failWrites = false;
  override setItem(k: string, v: string): void {
    if (this.failWrites) throw new DOMException('full', 'QuotaExceededError');
    this.writes.push([k, v]);
    super.setItem(k, v);
  }
  override removeItem(k: string): void {
    this.removals.push(k);
    super.removeItem(k);
  }
}

/** Two tabs: both loaded at the same rev, `other` saves first. Returns this tab's stale copy. */
function staleTab(s: Storage) {
  const mine = newCollection(pool, 1);
  saveCollection(mine, s);
  const other = loadCollection(pool, 1, s);
  other.fc = 9000;
  other.pity = { epic: 3 };
  saveCollection(other, s);
  return { mine, other };
}

describe('saveOrReload around the rev race', () => {
  it('saves and says false when the stored rev equals this tab\'s (the other tab has not saved since)', () => {
    const s = new SpyStorage();
    const c = newCollection(pool, 1);
    saveCollection(c, s);
    const rev = c.rev!;
    c.fc = 321;
    expect(saveOrReload(c, pool, s)).toBe(false);
    expect(c.rev).toBe(rev + 1);
    expect(loadCollection(pool, 1, s).fc).toBe(321);
  });

  it('saves and says false when the stored rev is older than this tab\'s', () => {
    const s = new SpyStorage();
    const c = newCollection(pool, 1);
    saveCollection(c, s);
    c.rev = 10;
    c.fc = 55;
    expect(saveOrReload(c, pool, s)).toBe(false);
    expect(c.fc).toBe(55);
    expect(loadCollection(pool, 1, s).rev).toBe(11);
  });

  it('saves and says false when nothing is stored (a first save)', () => {
    const s = new SpyStorage();
    const c = newCollection(pool, 1);
    c.fc = 12;
    expect(saveOrReload(c, pool, s)).toBe(false);
    expect(s.writes).toHaveLength(1);
    expect(loadCollection(pool, 1, s).fc).toBe(12);
  });

  it('saves over a corrupt store and says false: nothing to reload from', () => {
    for (const junk of ['{not json', '[]', '"x"', '0', 'null', '{"version":1,"owned":5,"rev":"7"}']) {
      const s = new SpyStorage();
      s.setItem(COLLECTION_KEY, junk);
      s.writes.length = 0;
      const c = newCollection(pool, 1);
      c.fc = 66;
      expect(saveOrReload(c, pool, s), junk).toBe(false);
      expect(c.fc, junk).toBe(66);
      expect(loadCollection(pool, 1, s).fc, junk).toBe(66);
    }
  });

  it('reloads in place (same object), including pity, and the reloaded rev lets the next save through', () => {
    const s = new SpyStorage();
    const { mine, other } = staleTab(s);
    const same = mine;
    mine.fc = 7;
    expect(saveOrReload(mine, pool, s)).toBe(true);
    expect(mine).toBe(same);
    expect(mine.fc).toBe(9000);
    expect(mine.pity).toEqual({ epic: 3 });
    expect(mine.rev).toBe(other.rev);
    mine.fc = 8000;
    expect(saveOrReload(mine, pool, s)).toBe(false);
    expect(loadCollection(pool, 1, s).fc).toBe(8000);
  });

  it('writes nothing on a refusal: the other tab\'s bytes stay exactly as stored', () => {
    const s = new SpyStorage();
    const { mine } = staleTab(s);
    const before = s.getItem(COLLECTION_KEY);
    s.writes.length = 0;
    mine.fc = 1;
    expect(saveOrReload(mine, pool, s)).toBe(true);
    expect(s.writes).toEqual([]);
    expect(s.removals).toEqual([]);
    expect(s.getItem(COLLECTION_KEY)).toBe(before);
  });

  it('says false and keeps the change for the visit when the store is full, with the stored rev older or equal', () => {
    const s = new SpyStorage();
    const c = newCollection(pool, 1);
    saveCollection(c, s);
    const stored = s.getItem(COLLECTION_KEY);
    s.failWrites = true;
    c.fc = 444;
    expect(saveOrReload(c, pool, s)).toBe(false);
    expect(c.fc).toBe(444);
    expect(s.getItem(COLLECTION_KEY)).toBe(stored);
  });

  it('still reloads when the other tab saved first and this tab\'s own write would also have failed (refused before the write)', () => {
    const s = new SpyStorage();
    const { mine } = staleTab(s);
    s.failWrites = true;
    expect(saveOrReload(mine, pool, s)).toBe(true);
    expect(mine.fc).toBe(9000);
  });
});

describe('a newer build\'s file (M56) is never read into the collection nor overwritten by saveOrReload', () => {
  const variants: Record<string, string> = {
    'higher version, higher rev, fields': JSON.stringify({ version: COLLECTION_VERSION + 1, rev: 500, fc: 1234, tokens: 9, owned: { '000001@common': 4 }, extra: { x: 1 } }),
    'higher version, no rev': JSON.stringify({ version: COLLECTION_VERSION + 1, fc: 1234 }),
    'much higher version, rev lower than this tab': JSON.stringify({ version: 99, rev: 0, fc: 1234 }),
  };
  for (const [name, text] of Object.entries(variants)) {
    it(`leaves the file byte for byte and the collection untouched: ${name}`, () => {
      const s = new SpyStorage();
      s.setItem(COLLECTION_KEY, text);
      s.writes.length = 0;
      const c = newCollection(pool, 1);
      c.fc = 77;
      c.rev = 3;
      c.owned['000001@common'] = 2;
      const snapshot = structuredClone(c);
      expect(saveOrReload(c, pool, s)).toBe(false);
      expect(c).toEqual(snapshot);
      expect(s.getItem(COLLECTION_KEY)).toBe(text);
      expect(s.writes).toEqual([]);
      expect(s.removals).toEqual([]);
      // Repeating it (the player keeps clicking) changes nothing either.
      expect(saveOrReload(c, pool, s)).toBe(false);
      expect(c).toEqual(snapshot);
      expect(s.getItem(COLLECTION_KEY)).toBe(text);
    });
  }

  it('a version-less or older-version file with a huge rev is not "newer": the version check, not the rev, guards it', () => {
    const s = new SpyStorage();
    s.setItem(COLLECTION_KEY, JSON.stringify({ version: COLLECTION_VERSION - 1, rev: 900, fc: 5 }));
    const c = newCollection(pool, 1);
    c.fc = 31;
    // An old-version file is unreadable to readStored, so it is neither reloaded from nor an obstacle to saving.
    expect(saveOrReload(c, pool, s)).toBe(false);
    expect(c.fc).toBe(31);
  });
});

describe('the saved bytes are those saveCollection writes (the collection format is unchanged)', () => {
  const fill = (c: ReturnType<typeof newCollection>) => {
    c.fc = 1500;
    c.tokens = 3;
    c.pity = { epic: 4, legendary: 17 };
    c.owned['000002@rare'] = 2;
    return c;
  };

  it('writes the same bytes as saveCollection for the same collection', () => {
    const a = new MemoryStorage();
    const b = new MemoryStorage();
    expect(saveOrReload(fill(newCollection(pool, 5)), pool, a)).toBe(false);
    expect(saveCollection(fill(newCollection(pool, 5)), b)).toBe(true);
    expect(a.getItem(COLLECTION_KEY)).toBe(b.getItem(COLLECTION_KEY));
  });

  it('keeps the field order and set of the stored object (a golden check on the format)', () => {
    const s = new MemoryStorage();
    saveOrReload(fill(newCollection(pool, 5)), pool, s);
    const parsed = JSON.parse(s.getItem(COLLECTION_KEY)!) as Record<string, unknown>;
    expect(Object.keys(parsed)).toEqual(['version', 'owned', 'fc', 'tokens', 'seed', 'pity', 'rev']);
    expect(parsed.version).toBe(COLLECTION_VERSION);
    expect(parsed.rev).toBe(1);
  });

  it('carries a field a same-version tab added across a save (M31) just as before', () => {
    const s = new MemoryStorage();
    s.setItem(COLLECTION_KEY, JSON.stringify({ version: COLLECTION_VERSION, rev: 0, future: { k: 1 } }));
    const c = newCollection(pool, 1);
    c.rev = 0;
    expect(saveOrReload(c, pool, s)).toBe(false);
    expect((JSON.parse(s.getItem(COLLECTION_KEY)!) as { future?: unknown }).future).toEqual({ k: 1 });
  });
});
