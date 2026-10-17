import { describe, expect, it } from 'vitest';
import poolText from '../../data/pool.md?raw';
import { createRng } from '../sim/rng';
import { vec3 } from '../sim/vec';
import { type CaseSpotLike, placeCases, rollFind, rollRunCases } from './caches';
import { type CaseKind, DEFAULT_CASE_KINDS } from './tables';
import { loadPool } from './pool';
import { sha256 } from '../save/sha256';

const pool = loadPool(poolText);
const kind = (key: string): CaseKind => pool.caseKinds.find((k) => k.key === key)!;

/** Eleven spots, as Depot has: two for the locker, field cases on five, ammo cans on nine. */
const SPOTS: CaseSpotLike[] = [
  ['locker', 'field-case'],
  ['locker', 'field-case'],
  ['field-case', 'ammo-can'],
  ['field-case', 'ammo-can'],
  ['ammo-can'],
  ['ammo-can', 'field-case'],
  ['ammo-can', 'field-case'],
  ['ammo-can'],
  ['ammo-can'],
  ['ammo-can'],
  ['ammo-can'],
].map((kinds, i) => ({ position: vec3(i * 3, 0, 0), yaw: 0, kinds }));

describe("pool.md's Caches table (M44)", () => {
  it('reads the three kinds as the plan has them, without a problem', () => {
    expect(pool.errors).toEqual([]);
    expect(pool.caseKinds.map((k) => [k.key, k.count.min, k.count.max, k.openTime])).toEqual([
      ['ammo-can', 4, 6, 2],
      ['field-case', 2, 3, 4],
      ['locker', 1, 1, 7],
    ]);
    expect(kind('locker')).toMatchObject({ name: "Marshal's locker", xp: { min: 100, max: 150 }, resupplyChance: 0 });
    expect(kind('ammo-can').resupplyChance).toBeCloseTo(0.4);
    // The file and the shipped defaults agree, so a pool.md that loses the table plays the same.
    expect(pool.caseKinds).toEqual(DEFAULT_CASE_KINDS);
  });

  it('leaves out a row it cannot read, naming its line, and falls back to the defaults with no readable row', () => {
    const head = ['### Caches', '| Case | Key | Per run | Open s | Heard m | XP | BB resupply % |', '|---|---|---|---|---|---|---|'];
    const one = loadPool([...head, '| Tin | tin | 2 to 3 | 1 | 5 | 10-20 | 0 |', '| Bad | bad | 3 to 1 | 1 | 5 | lots | 0 |'].join('\n'));
    expect(one.caseKinds.map((k) => [k.key, k.count, k.xp])).toEqual([['tin', { min: 2, max: 3 }, { min: 10, max: 20 }]]);
    expect(one.errors.some((e) => e.includes('Per run') && e.startsWith('line 5'))).toBe(true);
    expect(one.errors.some((e) => e.startsWith('line 5: XP must be a number or a range') && e.includes('"lots"'))).toBe(true);
    const none = loadPool([...head, '| | | | | | | |'].join('\n'));
    expect(none.caseKinds).toEqual(DEFAULT_CASE_KINDS);
    expect(none.errors.some((e) => e.includes('no readable cases'))).toBe(true);
    expect(loadPool('').caseKinds).toEqual(DEFAULT_CASE_KINDS);
  });
});

describe('placing a run’s cases', () => {
  it('places each kind’s rolled number on spots that suit it, never two on one spot, whatever the seed', () => {
    for (let seed = 0; seed < 200; seed++) {
      const placed = placeCases(pool.caseKinds, SPOTS, createRng(seed));
      expect(new Set(placed.map((p) => p.spot)).size).toBe(placed.length);
      for (const p of placed) expect(SPOTS[p.spot]!.kinds).toContain(p.kind.key);
      for (const k of pool.caseKinds) {
        const n = placed.filter((p) => p.kind === k).length;
        expect(n).toBeGreaterThanOrEqual(k.count.min);
        expect(n).toBeLessThanOrEqual(k.count.max);
      }
    }
  });

  it('is seeded: the same seed places and fills the same run, another seed another', () => {
    expect(rollRunCases(pool, SPOTS, 42)).toEqual(rollRunCases(pool, SPOTS, 42));
    expect(rollRunCases(pool, SPOTS, 42)).not.toEqual(rollRunCases(pool, SPOTS, 43));
  });

  it('fills a case from its row: XP in range, or a resupply instead', () => {
    let resupplies = 0;
    for (let seed = 0; seed < 300; seed++) {
      for (const c of rollRunCases(pool, SPOTS, seed)) {
        const k = kind(c.kind);
        expect(c.openTime).toBe(k.openTime);
        expect(c.heard).toBe(k.heard);
        if (c.find.resupply) {
          resupplies++;
          expect(c.find.xp).toBe(0);
        } else {
          expect(Number.isInteger(c.find.xp)).toBe(true);
          expect(c.find.xp).toBeGreaterThanOrEqual(k.xp.min);
          expect(c.find.xp).toBeLessThanOrEqual(k.xp.max);
        }
      }
    }
    expect(resupplies).toBeGreaterThan(0);
  });
});

describe('what a run’s cases hold, from the real pool (M44; LV1: XP, never gear)', () => {
  const everyCase = (seeds: number, fn: (c: ReturnType<typeof rollRunCases>[number]) => void): void => {
    for (let seed = 0; seed < seeds; seed++) for (const c of rollRunCases(pool, SPOTS, seed)) fn(c);
  };

  it('holds XP or a BB resupply and nothing else: levels unlock gear, cases never hand it out', () => {
    everyCase(100, (c) => expect(Object.keys(c.find).sort()).toEqual(['resupply', 'xp']));
  });

  it('gives a resupply from ammo cans about 4 in 10, and never from a field case or the locker', () => {
    const resupplies: Record<string, number> = { 'ammo-can': 0, 'field-case': 0, locker: 0 };
    const total: Record<string, number> = { 'ammo-can': 0, 'field-case': 0, locker: 0 };
    everyCase(400, (c) => {
      total[c.kind]!++;
      if (c.find.resupply) resupplies[c.kind]!++;
    });
    expect(resupplies['field-case']).toBe(0);
    expect(resupplies.locker).toBe(0);
    expect(resupplies['ammo-can']! / total['ammo-can']!).toBeGreaterThan(0.3);
    expect(resupplies['ammo-can']! / total['ammo-can']!).toBeLessThan(0.5);
  });

  it('rolls one find from a kind with the same rng the same way, a whole number of XP in its range', () => {
    const locker = kind('locker');
    const a = createRng(5);
    const b = createRng(5);
    for (let i = 0; i < 200; i++) {
      const f = rollFind(locker, a);
      expect(rollFind(locker, b)).toEqual(f);
      expect(f.resupply).toBe(false);
      expect(f.xp).toBeGreaterThanOrEqual(100);
      expect(f.xp).toBeLessThanOrEqual(150);
    }
  });
});

describe('a run’s cases are what they were before RV1 took the supply events out', () => {
  it('rolls the same cases for a seed as the build before it did (sha256 hashes taken from 406b0db with no event on)', () => {
    const gamePool = loadPool(poolText);
    const gold: [number, string][] = [[1, '3781fba843d9'], [7, '44eaed8fddc1'], [42, 'cc81c5f94b99'], [1234, 'e021e397c6ad']];
    for (const [seed, hash] of gold) {
      expect(sha256(JSON.stringify(rollRunCases(gamePool, SPOTS, seed))).slice(0, 12), `seed ${seed}`).toBe(hash);
    }
  });
});
