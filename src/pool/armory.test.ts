import { describe, expect, it } from 'vitest';
import {
  buyTokens,
  canTakeShots,
  cheapestSpare,
  collectionRows,
  earn,
  pityLeft,
  rarestFirst,
  revealSummary,
  shotFcPrice,
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
import { addItem, type ItemRef, loadCollection, newCollection, ownedCount, saveCollection } from './collection';
import { MemoryStorage } from './testStorage';
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

  it('scale Match played, Match won and Round won down for a short custom match, never up for a long one', () => {
    const short = matchEarnings(e, { won: true, roundsWon: 1, hits: 1, winsNeeded: 1, difficulty: 'normal' });
    expect(short.lines).toEqual([
      { label: 'Match played', fc: 8 },
      { label: 'Match won', fc: 12 },
      { label: '1 round won', fc: 2 },
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
    const first = takeShots(pool, a, 1, 0);
    expect(takeShots(pool, b, 1, 0)).toEqual(first);
    expect(a.seed).toBe(b.seed);
    expect(takeShots(pool, a, 1, 0)).not.toEqual(first);
  });

  it('give tiers by the odds over many Shots, and always a Rare or better in ten', () => {
    const c = newCollection(pool, 3);
    const counts = new Map<string, number>();
    for (let i = 0; i < 400; i++) {
      c.tokens = 10;
      const got = takeShots(pool, c, 10, i)!;
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
    expect(spares(pool, c, item('Red Dot', 'epic'))).toBe(2);
    expect(scrapSpares(pool, c, item('Red Dot', 'epic'))).toBe(160);
    expect(ownedCount(c, item('Red Dot', 'epic'))).toBe(1);
    expect(scrapSpares(pool, c, item('Red Dot', 'epic'))).toBe(0);
    expect(scrapAllSpares(pool, c)).toBe(10);
    expect(ownedCount(c, item('Green Gas'))).toBe(1);
    expect(c.fc).toBe(170);
  });
});

/** A pool.md with the given Rarity rows, one replica and one optic in Shots, and optional extra tables. */
function rigged(tiers: string[], extra: string[] = []): Pool {
  return loadPool(
    [
      '### Rarity',
      '| Tier | Odds % | Bonus % | Scrap FC |',
      '|---|---|---|---|',
      ...tiers,
      '### Replicas',
      '| ID | Name | Key | Tags | Starter | In Shots |',
      '|---|---|---|---|---|---|',
      '| 000001 | Gas Pistol | pistol | pistol, gas, top-rail | yes | yes |',
      '### Optics',
      '| ID | Name | Key | Fits | Starter | In Shots |',
      '|---|---|---|---|---|---|',
      '| 000007 | Red Dot | redDot | top-rail | no | yes |',
      ...extra,
    ].join('\n'),
  );
}

const SIX_TIERS = ['| Common | 99 | 0 | 5 |', '| Uncommon | 1 | 3 | 10 |', '| Rare | 0 | 6 | 20 |', '| Very Rare | 0 | 9 | 40 |', '| Epic | 0 | 12 | 80 |', '| Legendary | 0 | 15 | 160 |'];

describe('pity (audit POOL-01)', () => {
  it('reads the Pity table of the shipped pool.md: an Epic or rarer within 20 Shots, a Legendary within 100', () => {
    expect(e.pity).toEqual([
      { tier: 'legendary', shots: 100 },
      { tier: 'epic', shots: 20 },
    ]);
  });

  it('gives a Legendary exactly at the cap when the odds never would, an Epic at every 20th Shot, and counts across visits', () => {
    const p = rigged(SIX_TIERS);
    expect(p.economy.pity.map((r) => `${r.tier}:${r.shots}`)).toEqual(['legendary:100', 'epic:20']);
    const c = newCollection(p, 9);
    const tiersPerShot: string[][] = [];
    for (let shot = 1; shot <= 100; shot++) {
      c.tokens = 1;
      tiersPerShot.push(takeShots(p, c, 1, shot)!.map((d) => d.item.tier));
    }
    const has = (shot: number, tier: string) => tiersPerShot[shot - 1]!.includes(tier);
    // Shots 20, 40, 60 and 80 lift one item to Epic or rarer (only Epic and Legendary are possible from there: odds 0).
    for (const shot of [20, 40, 60, 80]) expect(has(shot, 'epic') || has(shot, 'legendary')).toBe(true);
    expect(tiersPerShot.slice(0, 19).flat().every((t) => t === 'common' || t === 'uncommon')).toBe(true);
    expect(has(100, 'legendary')).toBe(true);
    expect(tiersPerShot.flat().filter((t) => t === 'legendary')).toHaveLength(tiersPerShot.slice(0, 99).flat().filter((t) => t === 'legendary').length + 1);
    expect(c.pity).toEqual({ legendary: 0, epic: 0 });
  });

  it('keeps the counts in the save, and pityLeft says how many Shots remain', () => {
    const p = rigged(SIX_TIERS);
    const storage = new MemoryStorage();
    const c = newCollection(p, 9);
    c.tokens = 10;
    takeShots(p, c, 10, 1);
    expect(c.pity).toEqual({ legendary: 10, epic: 10 });
    saveCollection(c, storage);
    const back = loadCollection(p, 1, storage);
    expect(back.pity).toEqual({ legendary: 10, epic: 10 });
    expect(pityLeft(p, back).map((x) => `${x.tier.id}:${x.shots}`)).toEqual(['legendary:90', 'epic:10']);
  });

  it('resets a count when its tier comes up by the odds', () => {
    const p = rigged(['| Common | 0 | 0 | 5 |', '| Epic | 100 | 12 | 80 |', '| Legendary | 0 | 15 | 160 |']);
    const c = newCollection(p, 3);
    c.tokens = 1;
    c.pity = { epic: 15, legendary: 50 };
    takeShots(p, c, 1, 0);
    expect(c.pity).toEqual({ epic: 0, legendary: 51 });
  });
});

describe('duplicate protection (audit POOL-05)', () => {
  it('picks an asset not owned at the drawn tier twice as often as one owned, leaving the tier odds alone', () => {
    // Common only: the Gas Pistol is owned at Common (a starter), the Red Dot never is (scrapped back after each Shot).
    const p = rigged(['| Common | 100 | 0 | 5 |']);
    expect(p.economy.unownedWeight).toBe(2);
    const c = newCollection(p, 5);
    let dots = 0;
    const n = 6000;
    for (let i = 0; i < n; i++) {
      c.tokens = 1;
      for (const d of takeShots(p, c, 1, i)!) if (d.item.asset === '000007') dots++;
      delete c.owned['000007@common'];
    }
    // The first draw of a Shot: 2 : 1 for the Red Dot. Later draws in the Shot count a Red Dot already drawn as owned.
    expect(dots / (n * 3)).toBeGreaterThan(0.55);
    expect(dots / (n * 3)).toBeLessThan(0.66);
  });

  it('lets a lower tier go once a rarer copy of the same asset is owned, never the best one', () => {
    const c = newCollection(pool, 1);
    const dot = (tier: string) => item('Red Dot', tier);
    addItem(c, dot('common'), 2);
    addItem(c, dot('rare'));
    expect(spares(pool, c, dot('common'))).toBe(2);
    expect(spares(pool, c, dot('rare'))).toBe(0);
    expect(cheapestSpare(pool, c, dot('common').asset)).toEqual(dot('common'));
    expect(scrapSpares(pool, c, dot('common'), 1)).toBe(5);
    expect(ownedCount(c, dot('common'))).toBe(1);
    expect(scrapAllSpares(pool, c)).toBe(5);
    expect(ownedCount(c, dot('common'))).toBe(0);
    expect(ownedCount(c, dot('rare'))).toBe(1);
    // The AEG at Common is the only copy: kept.
    expect(ownedCount(c, item('AEG Rifle'))).toBe(1);
  });
});

describe('the Armory catalogue and reveal (audit POOL-04, POOL-11, POOL-13)', () => {
  it('lists every asset Shots can give, owned or not, with its copies per tier and the completion', () => {
    const c = newCollection(pool, 1);
    addItem(c, item('Red Dot', 'epic'), 2);
    const cat = collectionRows(pool, c);
    expect(cat.rows.map((r) => r.asset.id)).toEqual(shotAssets(pool).map((a) => a.id));
    expect(cat.total).toBe(shotAssets(pool).length * pool.tiers.length);
    expect(cat.owned).toBe(5);
    const dot = cat.rows.find((r) => r.asset.name === 'Red Dot')!;
    expect(dot.counts).toEqual([0, 0, 0, 0, 2, 0]);
    expect([dot.spares, dot.spareFc]).toEqual([1, 80]);
    expect(cat.rows.find((r) => r.asset.name === 'Silencer')!.counts.every((n) => n === 0)).toBe(true);
  });

  it('sorts a Shot rarest first and sums it up in a line', () => {
    const got = [
      { item: item('Red Dot', 'common'), isNew: true },
      { item: item('Red Dot', 'epic'), isNew: true },
      { item: item('Green Gas', 'common'), isNew: false },
      { item: item('Angled Grip', 'rare'), isNew: false },
    ];
    expect(rarestFirst(pool, got).map((d) => d.item.tier)).toEqual(['epic', 'rare', 'common', 'common']);
    expect(revealSummary(pool, got)).toBe('1 Epic, 1 Rare, 2 others · 2 new');
    expect(revealSummary(pool, got.slice(2, 3))).toBe('1 item');
  });

  it('prices Shots in FC on the buttons: 160 FC a Shot, 1,600 FC for ten', () => {
    expect(shotFcPrice(e, 1)).toBe(160);
    expect(shotFcPrice(e, 10)).toBe(1600);
  });
});

describe('save edits and FC bounds (audit POOL-07, POOL-19)', () => {
  it('mixes fresh entropy into each Shot, so the saved seed alone does not tell the next one', () => {
    const p = rigged(['| Common | 50 | 0 | 5 |', '| Legendary | 50 | 15 | 160 |']);
    const results = new Set<string>();
    for (let k = 0; k < 8; k++) {
      const c = newCollection(p, 37);
      c.tokens = 1;
      results.add(JSON.stringify(takeShots(p, c, 1)));
    }
    expect(results.size).toBeGreaterThan(1);
  });

  it('never lets earnings or scrap overflow the balance', () => {
    const c = newCollection(pool, 1);
    c.fc = Number.MAX_SAFE_INTEGER - 3;
    earn(c, 100);
    expect(c.fc).toBe(Number.MAX_SAFE_INTEGER);
  });
});

describe('Round won pay (audit POOL-08, POOL-09)', () => {
  it('pays the lower of the two teams’ difficulty multipliers, the opponents’ alone with no teammates', () => {
    const o = { won: true, roundsWon: 5, hits: 6, winsNeeded: 5, difficulty: 'hard' } as const;
    expect(matchEarnings(e, { ...o, teammateDifficulty: 'easy' }).multiplier).toBe(0.5);
    expect(matchEarnings(e, { ...o, teammateDifficulty: 'hard' }).multiplier).toBe(1.5);
    expect(matchEarnings(e, o).multiplier).toBe(1.5);
    expect(matchEarnings(e, { ...o, difficulty: 'easy', teammateDifficulty: 'hard' }).multiplier).toBe(0.5);
  });

  it('scales Round won by the match length like the match lines', () => {
    const short = matchEarnings(e, { won: true, roundsWon: 3, hits: 0, winsNeeded: 3, difficulty: 'normal' });
    expect(short.lines.find((l) => l.label === '3 rounds won')!.fc).toBe(18);
  });
});
