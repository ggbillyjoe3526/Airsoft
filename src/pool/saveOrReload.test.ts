import { describe, expect, it } from 'vitest';
import poolText from '../../pool.md?raw';
import { COLLECTION_KEY, loadCollection, newCollection, saveCollection, saveOrReload } from './collection';
import { loadPool } from './pool';
import { MemoryStorage } from './testStorage';

/** M70, audit POOL-05: a refused save because another tab saved first reloads that save, and says so. */
const pool = loadPool(poolText);

describe('saveOrReload', () => {
  it('saves and says false when nothing newer is stored', () => {
    const s = new MemoryStorage();
    const c = newCollection(pool, 1);
    c.fc = 500;
    expect(saveOrReload(c, pool, s)).toBe(false);
    expect(loadCollection(pool, 1, s).fc).toBe(500);
  });

  it('takes the other tab\'s save and says true when it saved first; this tab\'s change is dropped', () => {
    const s = new MemoryStorage();
    const mine = newCollection(pool, 1);
    saveCollection(mine, s);
    const other = loadCollection(pool, 1, s);
    other.fc = 9000;
    saveCollection(other, s);
    mine.fc = 7;
    mine.tokens = 99;
    expect(saveOrReload(mine, pool, s)).toBe(true);
    expect(mine.fc).toBe(9000);
    expect(mine.tokens).toBe(0);
    expect(saveOrReload(mine, pool, s)).toBe(false);
  });

  it('says false, and takes nothing, when the stored one is from a newer build or storage is blocked', () => {
    const s = new MemoryStorage();
    const newer = JSON.stringify({ version: 99, rev: 50, fc: 1234 });
    s.setItem(COLLECTION_KEY, newer);
    const c = newCollection(pool, 1);
    c.fc = 77;
    expect(saveOrReload(c, pool, s)).toBe(false);
    expect(c.fc).toBe(77);
    expect(s.getItem(COLLECTION_KEY)).toBe(newer);
    expect(saveOrReload(c, pool, null)).toBe(false);
    expect(c.fc).toBe(77);
  });
});
