import { describe, expect, it } from 'vitest';
import {
  buyTokens,
  canTakeShots,
  earn,
  matchEarnings,
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
import { loadPool, type Pool } from './pool';

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
