import { describe, expect, it } from 'vitest';
import {
  buyTokens,
  canTakeShots,
  drawTier,
  earn,
  matchEarnings,
  matchPay,
  scrapAllSpares,
  scrapSpares,
  shotAssets,
  shotPrice,
  spares,
  takeShots,
  tierChances,
  tokensAffordable,
} from './armory';
import { addItem, type ItemRef, newCollection, ownedCount } from './collection';
import { GAME_POOL } from './gamePool';
import poolText from '../../pool.md?raw';
import { createRng, rngNext } from '../sim/rng';
import { isChase, loadPool, type Pool, tiersOf } from './pool';

const pool = GAME_POOL;
const e = pool.economy;
const id = (name: string) => pool.assets.find((a) => a.name === name)!.id;
const item = (name: string, tier = 'common'): ItemRef => ({ asset: id(name), tier });

describe('Field Credits (M26c)', () => {
  it('pay a standard Normal win about one Shot, a loss about half, more on Hard', () => {
    const win = matchEarnings(e, { won: true, roundsWon: 5, hits: 6, winsNeeded: 5, difficulty: 'normal' });
    expect(win.total).toBe(40 + 60 + 50 + 30);
    expect(win.lines.map((l) => l.label)).toEqual(['Match played', 'Match won', '5 rounds won', '6 hits on an opponent']);
    const loss = matchEarnings(e, { won: false, roundsWon: 2, hits: 4, winsNeeded: 5, difficulty: 'normal' });
    expect(loss.total).toBe(40 + 20 + 20);
    expect(loss.total).toBeLessThan(win.total);
    expect(matchEarnings(e, { won: true, roundsWon: 5, hits: 6, winsNeeded: 5, difficulty: 'hard' }).total).toBe(270);
    expect(matchEarnings(e, { won: false, roundsWon: 0, hits: 0, winsNeeded: 5, difficulty: 'easy' }).total).toBe(20);
  });

  it('scale Match played and Match won down for a short custom match, never up for a long one', () => {
    const short = matchEarnings(e, { won: true, roundsWon: 1, hits: 1, winsNeeded: 1, difficulty: 'normal' });
    expect(short.lines).toEqual([
      { label: 'Match played', fc: 8 },
      { label: 'Match won', fc: 12 },
      { label: '1 round won', fc: 10 },
      { label: '1 hit on an opponent', fc: 5 },
    ]);
    expect(matchEarnings(e, { won: false, roundsWon: 0, hits: 0, winsNeeded: 9, difficulty: 'normal' }).total).toBe(40);
  });

  it('pay nothing while Dev settings → Disable Armory is on (M26d)', () => {
    const o = { won: true, roundsWon: 5, hits: 6, winsNeeded: 5, difficulty: 'normal' } as const;
    expect(matchPay(e, o, true)).toBeNull();
    expect(matchPay(e, o, false)).toEqual(matchEarnings(e, o));
  });
});

describe('Tokens and Shots (M26c)', () => {
  it('exchange FC at 160 a Token, only what the FC cover', () => {
    const c = newCollection(pool, 1);
    earn(c, 500);
    expect(tokensAffordable(e, c)).toBe(3);
    expect(buyTokens(e, c, 4)).toBe(false);
    expect(buyTokens(e, c, 3)).toBe(true);
    expect([c.fc, c.tokens]).toEqual([20, 3]);
    expect(buyTokens(e, c, 0)).toBe(false);
  });

  it('take Tokens first and FC for any Token short, and refuse what neither covers', () => {
    const c = newCollection(pool, 1);
    expect(canTakeShots(e, c, 1)).toBe(false);
    expect(takeShots(pool, c, 1)).toBeNull();
    c.tokens = 4;
    c.fc = 1000;
    expect(shotPrice(e, c, 10)).toEqual({ tokens: 4, fc: 6 * 160 });
    expect(canTakeShots(e, c, 10)).toBe(true);
    const got = takeShots(pool, c, 10)!;
    expect(got).toHaveLength(30);
    expect([c.tokens, c.fc]).toEqual([0, 40]);
  });

  it('dispense three assets a Shot into the collection, marking the first copy of each as new', () => {
    const c = newCollection(pool, 7);
    c.tokens = 1;
    const before = JSON.stringify(c.owned);
    const got = takeShots(pool, c, 1)!;
    expect(got).toHaveLength(3);
    const inShots = new Set(shotAssets(pool).map((a) => a.id));
    for (const d of got) expect(inShots.has(d.item.asset)).toBe(true);
    expect(JSON.stringify(c.owned)).not.toBe(before);
    // Starters are owned at Common: a Common starter can never come out new.
    for (const d of got) if (d.item.tier === 'common' && pool.byId.get(d.item.asset)!.starter) expect(d.isNew).toBe(false);
    expect(got.reduce((n, d) => n + ownedCount(c, d.item), 0)).toBeGreaterThanOrEqual(3);
  });

  it('carry on from the saved random state: the same save gives the same Shots, the next Shot different ones', () => {
    const a = newCollection(pool, 42);
    const b = newCollection(pool, 42);
    a.tokens = b.tokens = 2;
    const first = takeShots(pool, a, 1);
    expect(takeShots(pool, b, 1)).toEqual(first);
    expect(a.seed).toBe(b.seed);
    expect(takeShots(pool, a, 1)).not.toEqual(first);
  });

  it('give tiers by the odds over many Shots, and always a Rare or better in ten', () => {
    const c = newCollection(pool, 3);
    const counts = new Map<string, number>();
    for (let i = 0; i < 400; i++) {
      c.tokens = 10;
      const got = takeShots(pool, c, 10)!;
      expect(got.some((d) => ['rare', 'veryRare', 'epic', 'legendary'].includes(d.item.tier))).toBe(true);
      for (const d of got) counts.set(d.item.tier, (counts.get(d.item.tier) ?? 0) + 1);
    }
    const total = [...counts.values()].reduce((a, b) => a + b, 0);
    // 12,000 draws: Common near 46% (a little less, as the guarantee lifts some), Legendary near 1%.
    expect(counts.get('common')! / total).toBeGreaterThan(0.42);
    expect(counts.get('common')! / total).toBeLessThan(0.48);
    expect(counts.get('legendary')! / total).toBeGreaterThan(0.005);
    expect(counts.get('legendary')! / total).toBeLessThan(0.02);
  });

  it('lift only the last item of a ten-Shot that drew nothing at the guaranteed tier', () => {
    // Rare can never come up by the odds, so every ten-Shot falls back on the guarantee.
    const text = ['### Rarity', '| Tier | Odds % | Bonus % | Scrap FC |', '|---|---|---|---|', '| Common | 100 | 0 | 5 |', '| Rare | 0 | 6 | 20 |', '### Replicas', '| ID | Name | Key | Tags | Starter | In Shots |', '|---|---|---|---|---|---|', '| 000001 | Gas Pistol | pistol | pistol, gas | yes | yes |'].join('\n');
    const rigged: Pool = loadPool(text);
    expect(rigged.economy.tenShotGuarantee).toBe('rare');
    const c = newCollection(rigged, 5);
    c.tokens = 11;
    const ten = takeShots(rigged, c, 10)!.map((d) => d.item.tier);
    expect(ten).toHaveLength(10 * rigged.economy.assetsPerShot);
    expect(ten.slice(0, -1).every((t) => t === 'common')).toBe(true);
    expect(ten.at(-1)).toBe('rare');
    // A single Shot carries no guarantee.
    expect(takeShots(rigged, c, 1)!.every((d) => d.item.tier === 'common')).toBe(true);
  });

  it('normalise odds that do not add up to 100, as the warning in pool.md promises', () => {
    const text = (odds: [number, number]) =>
      ['### Rarity', '| Tier | Odds % | Bonus % | Scrap FC |', '|---|---|---|---|', `| Common | ${odds[0]} | 0 | 5 |`, `| Rare | ${odds[1]} | 6 | 20 |`, '### Replicas', '| ID | Name | Key | Tags | Starter | In Shots |', '|---|---|---|---|---|---|', '| 000001 | Gas Pistol | pistol | pistol, gas | yes | yes |'].join('\n');
    const odd: Pool = loadPool(text([30, 30]));
    expect(tierChances(odd).map((t) => t.percent)).toEqual([50, 50]);
  });
});

describe('Scrapping spares (M26c)', () => {
  it('keeps one copy and pays each spare its tier’s Scrap FC', () => {
    const c = newCollection(pool, 1);
    addItem(c, item('Red Dot', 'epic'), 3);
    addItem(c, item('Green Gas'), 2); // a starter: 1 + 2
    expect(spares(c, item('Red Dot', 'epic'))).toBe(2);
    expect(scrapSpares(pool, c, item('Red Dot', 'epic'))).toBe(160);
    expect(ownedCount(c, item('Red Dot', 'epic'))).toBe(1);
    expect(scrapSpares(pool, c, item('Red Dot', 'epic'))).toBe(0);
    expect(scrapAllSpares(pool, c)).toBe(10);
    expect(ownedCount(c, item('Green Gas'))).toBe(1);
    expect(c.fc).toBe(170);
  });
});

describe('M32 acceptance 3: Shots and the chase item', () => {
  const CYBER = '000019';
  const CYBER_ROW = '| 000019 | Cyber Pistol | cyber | pistol, built-in-power | no | yes | Legendary | 0.25 |';
  expect(poolText).toContain(CYBER_ROW);
  /** pool.md with the Cyber Pistol's Drop % set to `percent` (a bigger one keeps the statistics fast and tight). */
  const withDrop = (percent: number): Pool => loadPool(poolText.replace(CYBER_ROW, CYBER_ROW.replace('| 0.25 |', `| ${percent} |`)));
  /** pool.md without any chase row: the Cyber Pistol's row is simply not there. */
  const noChase: Pool = loadPool(poolText.replace(`${CYBER_ROW}\n`, ''));

  /** Every item of `n` ten-Shots (a fresh Token supply each time), from a collection seeded `seed`. */
  function draws(p: Pool, seed: number, n: number, count: 1 | 10 = 10) {
    const c = newCollection(p, seed);
    const out: { asset: string; tier: string }[] = [];
    for (let i = 0; i < n; i++) {
      c.tokens = 10;
      for (const d of takeShots(p, c, count)!) out.push(d.item);
    }
    return out;
  }

  it('has the Cyber Pistol as the only chase item, in Shots, and a pool without its row has none', () => {
    expect(pool.assets.filter(isChase).map((a) => a.id)).toEqual([CYBER]);
    expect(shotAssets(pool).map((a) => a.id)).toContain(CYBER);
    expect(noChase.errors).toEqual(pool.errors);
    expect(noChase.byId.has(CYBER)).toBe(false);
    expect(noChase.assets.filter(isChase)).toEqual([]);
  });

  it('draws a pool with no chase rows exactly as before: one asset roll then one tier roll per item, the same guarantee', () => {
    /** The pre-M32 algorithm, from the old takeShots: an even asset draw and a tier draw, no chase, no per-asset tiers. */
    function oldDraws(p: Pool, seed: number, count: 1 | 10): { items: { asset: string; tier: string }[]; seed: number } {
      const assets = shotAssets(p);
      const rng = createRng(seed);
      const items: { asset: string; tier: string }[] = [];
      for (let i = 0; i < count * Math.max(1, p.economy.assetsPerShot); i++) {
        const asset = assets[Math.min(assets.length - 1, Math.floor(rngNext(rng) * assets.length))]!;
        items.push({ asset: asset.id, tier: drawTier(p.tiers, rng).id });
      }
      const floor = count === 10 && p.economy.tenShotGuarantee ? p.tiers.findIndex((t) => t.id === p.economy.tenShotGuarantee) : -1;
      if (floor >= 0 && !items.some((d) => p.tiers.findIndex((t) => t.id === d.tier) >= floor)) items[items.length - 1]!.tier = drawTier(p.tiers, rng, floor).id;
      return { items, seed: rng.s };
    }
    for (let seed = 1; seed <= 60; seed++) {
      for (const count of [1, 10] as const) {
        const c = newCollection(noChase, seed);
        c.tokens = 10;
        const start = c.seed;
        const got = takeShots(noChase, c, count)!.map((d) => d.item);
        const old = oldDraws(noChase, start, count);
        expect(got, `seed ${seed} x${count}`).toEqual(old.items);
        // The same number of random numbers were used: the next Shot carries on from the same state.
        expect(c.seed, `seed ${seed} x${count} state`).toBe(old.seed);
      }
    }
  });

  it('gives the Cyber Pistol at about 0.25 % of the items, always at Legendary', () => {
    const items = draws(pool, 11, 2000); // 60,000 items: about 150 of them
    const cyber = items.filter((d) => d.asset === CYBER);
    expect(items).toHaveLength(60000);
    expect(cyber.length).toBeGreaterThan(100);
    expect(cyber.length).toBeLessThan(205);
    for (const d of cyber) expect(d.tier).toBe('legendary');
  });

  it('gives a chase item its Drop % of the items (tight at 20 %), always Legendary, and the rest equally likely', () => {
    const p = withDrop(20);
    expect(p.byId.get(CYBER)!.dropChance).toBeCloseTo(0.2, 10);
    const items = draws(p, 5, 300); // 9,000 items
    const total = items.length;
    const cyber = items.filter((d) => d.asset === CYBER);
    expect(cyber.length / total).toBeGreaterThan(0.18);
    expect(cyber.length / total).toBeLessThan(0.22);
    for (const d of cyber) expect(d.tier).toBe('legendary');
    // The other assets share the other 80 % equally, in every tier.
    const others = shotAssets(p).filter((a) => !isChase(a));
    const expected = (total * 0.8) / others.length;
    for (const a of others) {
      const n = items.filter((d) => d.asset === a.id).length;
      expect(n, a.name).toBeGreaterThan(expected * 0.75);
      expect(n, a.name).toBeLessThan(expected * 1.25);
    }
    expect(items.some((d) => d.asset !== CYBER && d.tier === 'common')).toBe(true);
    // Tiers of the Cyber Pistol come only from those it comes in.
    expect(tiersOf(p, p.byId.get(CYBER)!).map((t) => t.id)).toEqual(['legendary']);
  });

  it('adds Cyber Pistols to the collection only at Legendary, and keeps the ten-Shot guarantee', () => {
    const p = withDrop(20);
    const c = newCollection(p, 21);
    for (let i = 0; i < 300; i++) {
      c.tokens = 10;
      const got = takeShots(p, c, 10)!;
      expect(got.some((d) => ['rare', 'veryRare', 'epic', 'legendary'].includes(d.item.tier)), `ten-Shot ${i}`).toBe(true);
    }
    for (const key of Object.keys(c.owned)) if (key.startsWith(`${CYBER}@`)) expect(key).toBe(`${CYBER}@legendary`);
    expect(c.owned[`${CYBER}@legendary`]).toBeGreaterThan(100);
  });

  it('lifts the last item of a ten-Shot to the guaranteed tier even when chase items are in the draw', () => {
    // Only Common can come up by the odds, so every ten-Shot that has no Legendary falls back on the guarantee.
    const text = [
      '### Rarity', '| Tier | Odds % | Bonus % | Scrap FC |', '|---|---|---|---|', '| Common | 100 | 0 | 5 |', '| Rare | 0 | 6 | 20 |', '| Legendary | 0 | 15 | 160 |',
      '### Replicas', '| ID | Name | Key | Tags | Starter | In Shots | Tiers | Drop % |', '|---|---|---|---|---|---|---|---|',
      '| 000001 | Gas Pistol | pistol | pistol, gas | yes | yes | | |',
      '| 000019 | Cyber Pistol | cyber | pistol, built-in-power | no | yes | Legendary | 30 |',
    ].join('\n');
    const rigged = loadPool(text);
    expect(rigged.economy.tenShotGuarantee).toBe('rare');
    for (let seed = 1; seed <= 80; seed++) {
      const c = newCollection(rigged, seed);
      c.tokens = 10;
      const ten = takeShots(rigged, c, 10)!.map((d) => d.item);
      expect(ten.some((d) => d.tier !== 'common'), `seed ${seed}`).toBe(true);
      for (const d of ten) if (d.asset === '000019') expect(d.tier).toBe('legendary');
    }
  });
});
