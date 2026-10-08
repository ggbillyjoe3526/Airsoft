import { describe, expect, it } from 'vitest';
import poolText from '../../pool.md?raw';
import { createRng } from '../sim/rng';
import { vec3 } from '../sim/vec';
import { dispensable, drawPart, grantHaul } from './armory';
import { type CaseSpotLike, placeCases, rollFind, rollRunCases } from './caches';
import { type CaseKind, DEFAULT_CASE_KINDS } from './tables';
import { itemKey, newCollection } from './collection';
import { loadPool } from './pool';
import { withTags } from './testSupport';

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
    expect(kind('locker')).toMatchObject({ name: "Marshal's locker", fc: { min: 100, max: 150 }, partChance: 1, partsFrom: 'rare' });
    expect(kind('ammo-can').resupplyChance).toBeCloseTo(0.4);
    // The file and the shipped defaults agree, so a pool.md that loses the table plays the same.
    expect(pool.caseKinds).toEqual(DEFAULT_CASE_KINDS);
  });

  it('leaves out a row it cannot read, naming its line, and falls back to the defaults with no readable row', () => {
    const rarity = ['### Rarity', '| Tier | Odds % | Bonus % | Scrap FC |', '|---|---|---|---|', '| Common | 100 | 0 | 5 |'];
    const head = ['### Caches', '| Case | Key | Per run | Open s | Heard m | FC | BB resupply % | Part % | Parts from |', '|---|---|---|---|---|---|---|---|---|'];
    const one = loadPool([...rarity, ...head, '| Tin | tin | 2 to 3 | 1 | 5 | 10-20 | 0 | 0 | Common |', '| Bad | bad | 3 to 1 | 1 | 5 | 10 | 0 | 0 | Mythic |'].join('\n'));
    expect(one.caseKinds.map((k) => [k.key, k.count, k.fc])).toEqual([['tin', { min: 2, max: 3 }, { min: 10, max: 20 }]]);
    expect(one.errors.some((e) => e.includes('Per run') && e.startsWith('line 9'))).toBe(true);
    expect(one.errors.some((e) => e.includes('Mythic'))).toBe(true);
    const none = loadPool([...rarity, ...head, '| | | | | | | | | |'].join('\n'));
    expect(none.caseKinds).toEqual(DEFAULT_CASE_KINDS);
    expect(none.errors.some((e) => e.includes('no readable cases'))).toBe(true);
    expect(loadPool(rarity.join('\n')).caseKinds).toEqual(DEFAULT_CASE_KINDS);
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

  it('is seeded: the same seed and collection place and fill the same run, another seed another', () => {
    const owned = newCollection(pool, 1).owned;
    expect(rollRunCases(pool, SPOTS, owned, 42)).toEqual(rollRunCases(pool, SPOTS, owned, 42));
    expect(rollRunCases(pool, SPOTS, owned, 42)).not.toEqual(rollRunCases(pool, SPOTS, owned, 43));
  });

  it('fills a case from its row: FC in range or a resupply instead, a part on its chance', () => {
    const owned = newCollection(pool, 1).owned;
    let resupplies = 0;
    let lockerParts = 0;
    for (let seed = 0; seed < 300; seed++) {
      for (const c of rollRunCases(pool, SPOTS, owned, seed)) {
        const k = kind(c.kind);
        expect(c.openTime).toBe(k.openTime);
        expect(c.heard).toBe(k.heard);
        if (c.find.resupply) {
          resupplies++;
          expect(c.find.fc).toBe(0);
        } else {
          expect(c.find.fc).toBeGreaterThanOrEqual(k.fc.min);
          expect(c.find.fc).toBeLessThanOrEqual(k.fc.max);
        }
        if (k.partChance === 0) expect(c.find.item).toBeNull();
        if (c.kind === 'locker') {
          expect(c.find.item).not.toBeNull();
          lockerParts++;
          // The locker's parts come Rare or rarer.
          expect(['rare', 'veryRare', 'epic', 'legendary']).toContain(c.find.item!.tier);
        }
      }
    }
    expect(lockerParts).toBe(300);
    expect(resupplies).toBeGreaterThan(0);
  });
});

describe('parts found in cases', () => {
  it('are parts Shots could give: never a replica, a chase item or dev gear, even with dev gear in the pool', () => {
    const optic = pool.assets.find((a) => a.category === 'optic')!;
    const devPool = withTags(pool, { [optic.name]: 'dev' });
    const rng = createRng(7);
    for (let i = 0; i < 2000; i++) {
      const item = drawPart(devPool, {}, 'common', new Set(), rng)!;
      const asset = devPool.byId.get(item.asset)!;
      expect(asset.category).not.toBe('replica');
      expect(dispensable(asset)).toBe(true);
      expect(asset.id).not.toBe(optic.id);
    }
  });

  it('lean towards what the collection lacks (the unowned weight), with the tier odds as they are', () => {
    const c = newCollection(pool, 1);
    const field = kind('field-case');
    const always = { ...field, partChance: 1 };
    const rng = createRng(3);
    let unowned = 0;
    const n = 3000;
    for (let i = 0; i < n; i++) {
      const f = rollFind(pool, always, c.owned, new Set(), rng);
      if ((c.owned[itemKey(f.item!.asset, f.item!.tier)] ?? 0) === 0) unowned++;
    }
    // A new collection owns its starters at Common: most finds are new to it.
    expect(unowned / n).toBeGreaterThan(0.8);
  });

  it('go into the collection only through grantHaul, parts only (the FC is paid with the run, M47), and leave pity alone', () => {
    const c = newCollection(pool, 1);
    const pity = { ...c.pity };
    const fc = c.fc;
    const part = pool.assets.find((a) => a.category === 'grip')!;
    const haul = { fc: 85, items: [{ asset: part.id, tier: 'rare' }, { asset: part.id, tier: 'rare' }] };
    const got = grantHaul(c, haul);
    expect(c.fc).toBe(fc);
    expect(c.owned[itemKey(part.id, 'rare')]).toBe(2);
    expect(got.map((d) => d.isNew)).toEqual([true, false]);
    expect(c.pity).toEqual(pity);
  });
});

describe('what a run’s cases hold, from the real pool (M44)', () => {
  const owned = newCollection(pool, 1).owned;
  const everyCase = (seeds: number, fn: (c: ReturnType<typeof rollRunCases>[number]) => void): void => {
    for (let seed = 0; seed < seeds; seed++) for (const c of rollRunCases(pool, SPOTS, owned, seed)) fn(c);
  };

  it('never holds dev gear or anything Shots cannot give, with Dev content’s gear in the pool, over many runs', () => {
    const tagged = withTags(pool, Object.fromEntries(pool.assets.filter((a) => a.category === 'grip' || a.category === 'magazine').map((a) => [a.name, 'dev' as const])));
    expect(tagged.assets.filter((a) => a.tag === 'dev').length).toBeGreaterThan(2);
    for (const p of [pool, tagged]) {
      let parts = 0;
      for (let seed = 0; seed < 300; seed++) {
        for (const c of rollRunCases(p, SPOTS, owned, seed)) {
          if (!c.find.item) continue;
          parts++;
          const asset = p.byId.get(c.find.item.asset)!;
          expect(dispensable(asset), asset.name).toBe(true);
          expect(asset.tag, asset.name).toBe('public');
          expect(asset.category, asset.name).not.toBe('replica');
        }
      }
      expect(parts).toBeGreaterThan(300);
    }
  });

  it('draws a part’s tier by the Rarity odds from the case’s own floor up, never below it', () => {
    const rare = pool.tiers.findIndex((t) => t.id === 'rare');
    const above = pool.tiers.slice(rare);
    const total = above.reduce((s, t) => s + t.odds, 0);
    const counts = new Map<string, number>();
    const rng = createRng(11);
    const n = 6000;
    for (let i = 0; i < n; i++) {
      const f = rollFind(pool, kind('locker'), owned, new Set(), rng);
      counts.set(f.item!.tier, (counts.get(f.item!.tier) ?? 0) + 1);
    }
    for (const t of pool.tiers.slice(0, rare)) expect(counts.get(t.id) ?? 0, t.id).toBe(0);
    for (const t of above) {
      const p = t.odds / total;
      expect(Math.abs((counts.get(t.id) ?? 0) / n - p), t.id).toBeLessThan(4 * Math.sqrt((p * (1 - p)) / n) + 0.002);
    }
    // And a field case's parts start at the bottom of the table: Common is its commonest tier.
    const field = { ...kind('field-case'), partChance: 1 };
    const low = new Map<string, number>();
    for (let i = 0; i < n; i++) {
      const f = rollFind(pool, field, owned, new Set(), rng);
      low.set(f.item!.tier, (low.get(f.item!.tier) ?? 0) + 1);
    }
    expect(low.get(pool.tiers[0]!.id) ?? 0).toBeGreaterThan(n * 0.4);
  });

  it('puts a run’s cases in the same places whatever the collection holds, and leaves the collection’s table alone', () => {
    const frozen = Object.freeze({ ...owned });
    const rich = Object.freeze(Object.fromEntries(pool.assets.flatMap((a) => pool.tiers.map((t) => [itemKey(a.id, t.id), 3] as const))));
    for (let seed = 0; seed < 50; seed++) {
      const a = rollRunCases(pool, SPOTS, frozen, seed);
      const b = rollRunCases(pool, SPOTS, rich, seed);
      expect(b.map((c) => [c.kind, c.position])).toEqual(a.map((c) => [c.kind, c.position]));
    }
    expect(frozen).toEqual(owned);
  });

  it('rolls an ammo can’s contents without a part, a field case’s part about 3 in 10 and the locker’s every time', () => {
    const parts: Record<string, number> = { 'ammo-can': 0, 'field-case': 0, locker: 0 };
    const total: Record<string, number> = { 'ammo-can': 0, 'field-case': 0, locker: 0 };
    everyCase(400, (c) => {
      total[c.kind]!++;
      if (c.find.item) parts[c.kind]!++;
    });
    expect(parts['ammo-can']).toBe(0);
    expect(parts.locker).toBe(total.locker);
    expect(parts['field-case']! / total['field-case']!).toBeGreaterThan(0.2);
    expect(parts['field-case']! / total['field-case']!).toBeLessThan(0.4);
  });
});
