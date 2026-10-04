import type { Difficulty } from '../config/bots';
import { createRng, rngNext, type RngState } from '../sim/rng';
import { addItem, type Collection, type ItemRef, itemKey, ownedCount } from './collection';
import { type Asset, type Economy, fcPerToken, type Pool, type RarityTier } from './pool';

/**
 * The Armory's rules (M26c): Field Credits earned by a match, Tokens bought with them, Shots that dispense random assets
 * at random tiers, and spare copies scrapped back into FC. All numbers come from pool.md (Economy, Rarity). Pure: it
 * changes the Collection it is given and nothing else; the Armory screen saves it.
 */

/** What a finished match was, for its Field Credits. */
export interface MatchOutcome {
  won: boolean;
  /** Rounds your team won. */
  roundsWon: number;
  /** Your BBs on an opponent. */
  hits: number;
  /** The match's rounds to win (5 in the standard match). */
  winsNeeded: number;
  /** The opponents' difficulty. */
  difficulty: Difficulty;
}

/** A match's Field Credits, line by line as the summary shows them, and the total (after the difficulty). */
export interface Earnings {
  lines: { label: string; fc: number }[];
  /** The opponents' difficulty multiplier the lines are scaled by. */
  multiplier: number;
  total: number;
}

/** The standard match's rounds to win: Match played and Match won are paid in full from here on (pool.md). */
const FULL_MATCH_WINS = 5;

export function matchEarnings(e: Economy, o: MatchOutcome): Earnings {
  const scale = Math.min(1, Math.max(0, o.winsNeeded) / FULL_MATCH_WINS);
  const lines = [{ label: 'Match played', fc: Math.round(e.earn.matchPlayed * scale) }];
  if (o.won) lines.push({ label: 'Match won', fc: Math.round(e.earn.matchWon * scale) });
  if (o.roundsWon > 0) lines.push({ label: `${o.roundsWon} ${o.roundsWon === 1 ? 'round' : 'rounds'} won`, fc: e.earn.roundWon * o.roundsWon });
  if (o.hits > 0) lines.push({ label: `${o.hits} ${o.hits === 1 ? 'hit' : 'hits'} on an opponent`, fc: e.earn.hit * o.hits });
  const multiplier = e.difficulty[o.difficulty];
  const total = Math.max(0, Math.round(lines.reduce((sum, l) => sum + l.fc, 0) * multiplier));
  return { lines, multiplier, total };
}

/** What a decided match pays: its earnings, or nothing with the Armory switched off (Dev settings, M26d). */
export function matchPay(e: Economy, o: MatchOutcome, armoryOff: boolean): Earnings | null {
  return armoryOff ? null : matchEarnings(e, o);
}

/** Adds a match's Field Credits to the collection. */
export function earn(c: Collection, fc: number): void {
  c.fc += Math.max(0, Math.round(fc));
}

/** Tokens the collection could buy with all its FC. */
export function tokensAffordable(e: Economy, c: Collection): number {
  return Math.floor(c.fc / fcPerToken(e));
}

/** Exchanges FC for `tokens` Tokens; false (nothing changes) if the FC don't cover them. */
export function buyTokens(e: Economy, c: Collection, tokens: number): boolean {
  const cost = tokens * fcPerToken(e);
  if (!Number.isInteger(tokens) || tokens < 1 || cost > c.fc) return false;
  c.fc -= cost;
  c.tokens += tokens;
  return true;
}

/** Shots come one at a time or ten at once. */
export type ShotCount = 1 | 10;

/** Tokens `count` Shots cost. */
function shotTokens(e: Economy, count: ShotCount): number {
  return count === 10 ? e.tokensPerTenShots : e.tokensPerShot * count;
}

/** What `count` Shots would take: Tokens first, then FC at the exchange rate for any Tokens short. */
export function shotPrice(e: Economy, c: Collection, count: ShotCount): { tokens: number; fc: number } {
  const need = shotTokens(e, count);
  const tokens = Math.min(c.tokens, need);
  return { tokens, fc: (need - tokens) * fcPerToken(e) };
}

export function canTakeShots(e: Economy, c: Collection, count: ShotCount): boolean {
  return shotPrice(e, c, count).fc <= c.fc;
}

/** One asset a Shot dispensed: the item, and whether it was the first copy owned (else a spare). */
export interface Dispensed {
  item: ItemRef;
  isNew: boolean;
}

/** The assets Shots can dispense: every pool.md row marked In Shots. */
export function shotAssets(pool: Pool): Asset[] {
  return pool.assets.filter((a) => a.inShots);
}

/** A tier drawn by the odds (normalised, so odds that don't add up to 100 still work), from `from` (index) up. */
function drawTier(tiers: readonly RarityTier[], rng: RngState, from = 0): RarityTier {
  const pool = tiers.slice(from);
  const total = pool.reduce((sum, t) => sum + Math.max(0, t.odds), 0);
  if (total <= 0) return pool[0] ?? tiers[0]!;
  let roll = rngNext(rng) * total;
  for (const t of pool) {
    roll -= Math.max(0, t.odds);
    if (roll < 0) return t;
  }
  return pool[pool.length - 1]!;
}

/**
 * Takes `count` Shots: pays for them (Tokens, then FC for any short), dispenses `assetsPerShot` assets each (any asset
 * marked In Shots, equally likely, at a tier drawn by the odds) and adds them to the collection. A ten-Shot holds at
 * least one item of the guaranteed tier or rarer: if none came up, its last item's tier is drawn again from those
 * tiers only. Returns what was dispensed, in order, or null (nothing changes) if it can't be paid for or there is
 * nothing to dispense. The draws carry on from the collection's saved random state.
 */
export function takeShots(pool: Pool, c: Collection, count: ShotCount): Dispensed[] | null {
  const e = pool.economy;
  const assets = shotAssets(pool);
  if (assets.length === 0 || pool.tiers.length === 0 || !canTakeShots(e, c, count)) return null;
  const price = shotPrice(e, c, count);
  c.tokens -= price.tokens;
  c.fc -= price.fc;
  const rng = createRng(c.seed);
  const draws: { asset: Asset; tier: RarityTier }[] = [];
  for (let i = 0; i < count * Math.max(1, e.assetsPerShot); i++) {
    const asset = assets[Math.min(assets.length - 1, Math.floor(rngNext(rng) * assets.length))]!;
    draws.push({ asset, tier: drawTier(pool.tiers, rng) });
  }
  const floor = count === 10 && e.tenShotGuarantee ? pool.tiers.findIndex((t) => t.id === e.tenShotGuarantee) : -1;
  if (floor >= 0 && !draws.some((d) => pool.tiers.indexOf(d.tier) >= floor)) draws[draws.length - 1]!.tier = drawTier(pool.tiers, rng, floor);
  c.seed = rng.s;
  return draws.map(({ asset, tier }) => {
    const item = { asset: asset.id, tier: tier.id };
    const isNew = ownedCount(c, item) === 0;
    addItem(c, item);
    return { item, isNew };
  });
}

/** Copies of an item beyond the one you keep. */
export function spares(c: Collection, item: ItemRef): number {
  return Math.max(0, ownedCount(c, item) - 1);
}

/** FC one spare copy of an item pays (its tier's Scrap FC). */
export function scrapValue(pool: Pool, item: ItemRef): number {
  return pool.tiers.find((t) => t.id === item.tier)?.scrapFc ?? 0;
}

/** Scraps every spare copy of `item` (you keep one); returns the FC paid. */
export function scrapSpares(pool: Pool, c: Collection, item: ItemRef): number {
  const n = spares(c, item);
  if (n === 0 || !pool.byId.has(item.asset)) return 0;
  const fc = n * scrapValue(pool, item);
  c.owned[itemKey(item.asset, item.tier)] = 1;
  c.fc += fc;
  return fc;
}

/** Scraps every spare of every item in the pool; returns the FC paid. */
export function scrapAllSpares(pool: Pool, c: Collection): number {
  let fc = 0;
  for (const a of pool.assets) for (const t of pool.tiers) fc += scrapSpares(pool, c, { asset: a.id, tier: t.id });
  return fc;
}

/** Each tier's chance, normalised to 100 (as the Armory shows and draws them). */
export function tierChances(pool: Pool): { tier: RarityTier; percent: number }[] {
  const total = pool.tiers.reduce((sum, t) => sum + Math.max(0, t.odds), 0);
  return pool.tiers.map((tier) => ({ tier, percent: total > 0 ? (Math.max(0, tier.odds) / total) * 100 : 0 }));
}
