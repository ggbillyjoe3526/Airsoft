import type { Difficulty } from '../config/bots';
import { CUSTOM_RULES_PAY_CAP } from '../config/matchRules';
import { randomSeed } from '../core/seed';
import { createRng, rngNext, type RngState } from '../sim/rng';
import { addItem, type Collection, type ItemRef, itemKey, ownedCount } from './collection';
import { type Asset, comesIn, type Economy, fcPerToken, isChase, type Pool, type RarityTier, tiersOf } from './pool';

/**
 * The Armory's rules (M26c): Field Credits earned by a match, Tokens bought with them, Shots that dispense random assets
 * at random tiers, and spare copies scrapped back into FC. All numbers come from pool.md (Economy, Rarity). Pure: it
 * changes the Collection it is given and nothing else; the Armory screen saves it.
 */

/** What a finished match was, for its Field Credits. */
export interface MatchOutcome {
  won: boolean;
  /** Rounds your team won that you played a part in (audit POOL-08: a round sat out pays nothing). */
  roundsWon: number;
  /** Your BBs on an opponent. */
  hits: number;
  /** The match's rounds to win (5 in the standard match). */
  winsNeeded: number;
  /** The opponents' difficulty. */
  difficulty: Difficulty;
  /** Your teammates' difficulty; absent with no teammates (1v1). The lower multiplier of the two pays (audit POOL-08). */
  teammateDifficulty?: Difficulty;
  /**
   * Custom rules (M39, config/matchRules.ts standardRules: not a named ruleset's standard match): the multiplier is
   * capped at CUSTOM_RULES_PAY_CAP (Pro's ×2 is for the named rulesets). Absent: the standard match.
   */
  customRules?: boolean;
  /**
   * Extraction (M44): what the runner got out with, which goes into the collection with the pay, in the same save
   * (settleMatch). Absent in the other modes and for a run that didn't extract.
   */
  haul?: { fc: number; items: readonly ItemRef[] };
}

/** A match's Field Credits, line by line as the summary shows them, and the total (after the difficulty). */
export interface Earnings {
  lines: { label: string; fc: number }[];
  /** The difficulty multiplier the lines are scaled by (the lower of the opponents' and the teammates'). */
  multiplier: number;
  total: number;
}

/** The standard match's rounds to win: Match played, Match won and Round won are paid in full from here on (pool.md). */
const FULL_MATCH_WINS = 5;

export function matchEarnings(e: Economy, o: MatchOutcome): Earnings {
  const scale = Math.min(1, Math.max(0, o.winsNeeded) / FULL_MATCH_WINS);
  const lines = [{ label: 'Match played', fc: Math.round(e.earn.matchPlayed * scale) }];
  if (o.won) lines.push({ label: 'Match won', fc: Math.round(e.earn.matchWon * scale) });
  // Scaled like the match lines (audit POOL-09): a short 1v1 is no richer a farm than the standard match.
  if (o.roundsWon > 0) lines.push({ label: `${o.roundsWon} ${o.roundsWon === 1 ? 'round' : 'rounds'} won`, fc: Math.round(e.earn.roundWon * o.roundsWon * scale) });
  if (o.hits > 0) lines.push({ label: `${o.hits} ${o.hits === 1 ? 'hit' : 'hits'} on an opponent`, fc: e.earn.hit * o.hits });
  // The lower of the two teams' (audit POOL-08): Hard teammates carrying you against Hard opponents pay as Hard only
  // if you're in there too, and Easy opponents never pay Hard rates.
  const multiplier = Math.min(
    e.difficulty[o.difficulty],
    o.teammateDifficulty ? e.difficulty[o.teammateDifficulty] : Number.POSITIVE_INFINITY,
    o.customRules ? CUSTOM_RULES_PAY_CAP : Number.POSITIVE_INFINITY,
  );
  const total = Math.max(0, Math.round(lines.reduce((sum, l) => sum + l.fc, 0) * multiplier));
  return { lines, multiplier, total };
}

/** What a decided match pays: its earnings, or nothing with the Armory switched off (Dev settings, M26d). */
export function matchPay(e: Economy, o: MatchOutcome, armoryOff: boolean): Earnings | null {
  return armoryOff ? null : matchEarnings(e, o);
}

/** Adds a match's Field Credits to the collection (never past the largest whole number held exactly, audit POOL-19). */
export function earn(c: Collection, fc: number): void {
  c.fc = Math.min(Number.MAX_SAFE_INTEGER, c.fc + Math.max(0, Math.round(fc)));
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

/** The assets Shots can dispense: every public pool.md row marked In Shots. */
export function shotAssets(pool: Pool): Asset[] {
  return pool.assets.filter(dispensable);
}

/** Whether Shots can give `a`: marked In Shots and public (M35: dev gear never drops, even with Dev content on). */
export function dispensable(a: Asset): boolean {
  return a.inShots && a.tag === 'public';
}

/** A tier drawn by the odds (normalised, so odds that don't add up to 100 still work), from `from` (index) up. */
export function drawTier(tiers: readonly RarityTier[], rng: RngState, from = 0): RarityTier {
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

/** Pity left (audit POOL-01): for each pool.md Pity rule, rarest first, the Shots within which its tier or rarer comes. */
export function pityLeft(pool: Pool, c: Collection): { tier: RarityTier; shots: number }[] {
  return pool.economy.pity.flatMap((rule) => {
    const tier = pool.tiers.find((t) => t.id === rule.tier);
    return tier ? [{ tier, shots: Math.max(1, rule.shots - (c.pity?.[rule.tier] ?? 0)) }] : [];
  });
}

/** The asset of a draw at `tier`: any In Shots asset, one not yet owned at that tier (nor drawn already) weighted up. */
function drawAsset(assets: readonly Asset[], tier: RarityTier, owned: Readonly<Record<string, number>>, drawn: ReadonlySet<string>, weight: number, rng: RngState): Asset {
  const w = (a: Asset): number => {
    const key = itemKey(a.id, tier.id);
    return (owned[key] ?? 0) > 0 || drawn.has(key) ? 1 : weight;
  };
  let roll = rngNext(rng) * assets.reduce((sum, a) => sum + w(a), 0);
  for (const a of assets) {
    roll -= w(a);
    if (roll < 0) return a;
  }
  return assets[assets.length - 1]!;
}

/**
 * A chase item for one draw (M32), each on its own chance (pool.md's Drop %), or null for the usual draw. With no chase
 * items in the pool it draws no random number, so the usual draws are exactly as they were.
 */
function drawChase(chase: readonly Asset[], rng: RngState): Asset | null {
  if (chase.length === 0) return null;
  let roll = rngNext(rng);
  for (const a of chase) {
    roll -= a.dropChance ?? 0;
    if (roll < 0) return a;
  }
  return null;
}

/**
 * Takes `count` Shots: pays for them (Tokens, then FC for any short), dispenses `assetsPerShot` assets each and adds
 * them to the collection. Each draw is first a chase item on its own Drop %, in a tier it comes in (M32); else it takes
 * its tier by the odds, then an asset marked In Shots that comes in that tier, one you don't own at that tier
 * `unownedWeight` times likelier (audit POOL-05). Pity (audit POOL-01): a Shot that reaches a Pity rule's
 * count without its tier or rarer has its commonest item drawn again from those tiers (tier, then asset); the counts carry on in the
 * collection. A ten-Shot also holds at least one item of the guaranteed tier or rarer (its last item lifted if
 * none came up). Returns what was dispensed, in order, or null (nothing changes) if it can't be paid for or there is
 * nothing to dispense. The draws carry on from the collection's saved random state mixed with `entropy` (audit
 * POOL-07: fresh each call, so the save doesn't tell the next Shot; pass a fixed one to replay).
 */
export function takeShots(pool: Pool, c: Collection, count: ShotCount, entropy = randomSeed()): Dispensed[] | null {
  const e = pool.economy;
  const assets = shotAssets(pool);
  if (assets.length === 0 || pool.tiers.length === 0 || !canTakeShots(e, c, count)) return null;
  const price = shotPrice(e, c, count);
  c.tokens -= price.tokens;
  c.fc -= price.fc;
  const rng = createRng((c.seed ^ entropy) >>> 0);
  // Chase items (M32) come on their own chance; the rest are drawn by tier, among those that come in it.
  const chase = assets.filter(isChase);
  const even = assets.filter((a) => !isChase(a));
  const comingIn = (tier: RarityTier): readonly Asset[] => {
    const own = even.filter((a) => comesIn(a, tier.id));
    return own.length > 0 ? own : even.length > 0 ? even : assets;
  };
  const rank = (t: RarityTier): number => pool.tiers.indexOf(t);
  const floorOf = (id: string | null): number => (id ? pool.tiers.findIndex((t) => t.id === id) : -1);
  const tenFloor = count === 10 ? floorOf(e.tenShotGuarantee) : -1;
  const pity = (c.pity ??= {});
  const perShot = Math.max(1, e.assetsPerShot);
  const out: Dispensed[] = [];
  let tenMet = false;
  for (let shot = 0; shot < count; shot++) {
    const draws: { asset: Asset; tier: RarityTier }[] = [];
    const drawn = new Set<string>();
    for (let i = 0; i < perShot; i++) {
      const chased = drawChase(chase, rng);
      const tier = chased ? drawTier(tiersOf(pool, chased), rng) : drawTier(pool.tiers, rng);
      const asset = chased ?? drawAsset(comingIn(tier), tier, c.owned, drawn, e.unownedWeight, rng);
      drawn.add(itemKey(asset.id, tier.id));
      draws.push({ asset, tier });
    }
    const lift = (floor: number): void => {
      if (draws.some((d) => rank(d.tier) >= floor)) return;
      // The commonest item (the last of equals) is drawn again from the floor up: its tier, then its asset at that
      // tier, so the unowned weight counts for a lifted item too.
      let at = draws.length - 1;
      for (let i = draws.length - 1; i >= 0; i--) if (rank(draws[i]!.tier) < rank(draws[at]!.tier)) at = i;
      const tier = drawTier(pool.tiers, rng, floor);
      const others = new Set(draws.flatMap((d, i) => (i === at ? [] : [itemKey(d.asset.id, d.tier.id)])));
      draws[at] = { tier, asset: drawAsset(comingIn(tier), tier, c.owned, others, e.unownedWeight, rng) };
    };
    if (tenFloor >= 0) {
      tenMet ||= draws.some((d) => rank(d.tier) >= tenFloor);
      if (shot === count - 1 && !tenMet) lift(tenFloor);
    }
    for (const rule of e.pity) {
      const floor = floorOf(rule.tier);
      if (floor >= 0 && (pity[rule.tier] ?? 0) + 1 >= rule.shots) lift(floor);
    }
    for (const rule of e.pity) {
      const floor = floorOf(rule.tier);
      if (floor >= 0) pity[rule.tier] = draws.some((d) => rank(d.tier) >= floor) ? 0 : (pity[rule.tier] ?? 0) + 1;
    }
    for (const { asset, tier } of draws) {
      const item = { asset: asset.id, tier: tier.id };
      out.push({ item, isNew: ownedCount(c, item) === 0 });
      addItem(c, item);
    }
  }
  c.seed = rng.s;
  return out;
}

/**
 * A part found in an Extraction case (M44): drawn like a Shot's item (its tier by the Rarity odds from tier `from` up,
 * then an asset that comes in it, one not owned at that tier, nor already `drawn` this run, `unownedWeight` times
 * likelier), from the parts Shots can give (dispensable: never dev gear; no replicas, so no chase items). Pity is
 * neither counted nor used: its guarantees are about Shots. Null with nothing to draw. Pure (it only moves `rng`).
 */
export function drawPart(pool: Pool, owned: Readonly<Record<string, number>>, from: string, drawn: ReadonlySet<string>, rng: RngState): ItemRef | null {
  const parts = pool.assets.filter((a) => dispensable(a) && a.category !== 'replica' && !isChase(a));
  if (parts.length === 0 || pool.tiers.length === 0) return null;
  const tier = drawTier(pool.tiers, rng, Math.max(0, pool.tiers.findIndex((t) => t.id === from)));
  const own = parts.filter((a) => comesIn(a, tier.id));
  const asset = drawAsset(own.length > 0 ? own : parts, tier, owned, drawn, pool.economy.unownedWeight, rng);
  return { asset: asset.id, tier: tier.id };
}

/**
 * An Extraction haul goes into the collection (M44): its Field Credits earned and each part added, in the order found;
 * the caller saves once. Returns the parts as the Armory's reveal shows them (new, or a spare). Pity is untouched.
 */
export function grantHaul(c: Collection, haul: { fc: number; items: readonly ItemRef[] }): Dispensed[] {
  earn(c, haul.fc);
  return haul.items.map((item) => {
    const isNew = ownedCount(c, item) === 0;
    addItem(c, item);
    return { item, isNew };
  });
}

/**
 * Copies of an item you can scrap: every copy beyond the one you keep, and that one too when you own the same asset at
 * a rarer tier (audit POOL-05: one kept per asset, so a Common Red Dot doesn't stay for ever once a Rare one is owned).
 */
export function spares(pool: Pool, c: Collection, item: ItemRef): number {
  const at = pool.tiers.findIndex((t) => t.id === item.tier);
  const rarerOwned = at >= 0 && pool.tiers.slice(at + 1).some((t) => ownedCount(c, { asset: item.asset, tier: t.id }) > 0);
  return Math.max(0, ownedCount(c, item) - (rarerOwned ? 0 : 1));
}

/** FC one spare copy of an item pays (its tier's Scrap FC). */
export function scrapValue(pool: Pool, item: ItemRef): number {
  return pool.tiers.find((t) => t.id === item.tier)?.scrapFc ?? 0;
}

/** Scraps up to `max` spare copies of `item` (all of them by default); returns the FC paid. */
export function scrapSpares(pool: Pool, c: Collection, item: ItemRef, max = Number.POSITIVE_INFINITY): number {
  const n = Math.min(spares(pool, c, item), Math.max(0, Math.floor(max)));
  if (n === 0 || !pool.byId.has(item.asset)) return 0;
  const fc = n * scrapValue(pool, item);
  const key = itemKey(item.asset, item.tier);
  const left = ownedCount(c, item) - n;
  if (left > 0) c.owned[key] = left;
  else delete c.owned[key];
  earn(c, fc);
  return fc;
}

/** Scraps every spare of every item in the pool (rarest tier first, so each asset keeps its best); returns the FC paid. */
export function scrapAllSpares(pool: Pool, c: Collection): number {
  let fc = 0;
  for (const a of pool.assets) for (let t = pool.tiers.length - 1; t >= 0; t--) fc += scrapSpares(pool, c, { asset: a.id, tier: pool.tiers[t]!.id });
  return fc;
}

/** FC scrapping every spare would pay. */
export function sparesValue(pool: Pool, c: Collection): number {
  let fc = 0;
  for (const a of pool.assets) for (const t of pool.tiers) fc += spares(pool, c, { asset: a.id, tier: t.id }) * t.scrapFc;
  return fc;
}

/** One asset of the Armory's catalogue (audit POOL-04): its copies at each tier, its spares and what they scrap for. */
export interface CollectionRow {
  asset: Asset;
  /** Copies owned at each tier, in tier order (commonest first). */
  counts: number[];
  spares: number;
  spareFc: number;
}

/**
 * The Armory's catalogue (audit POOL-04): every asset Shots can give, and any other owned one, in pool order; and how
 * many of its items (asset × tier) are owned out of all of them.
 */
export function collectionRows(pool: Pool, c: Collection): { rows: CollectionRow[]; owned: number; total: number } {
  const rows: CollectionRow[] = [];
  let owned = 0;
  for (const asset of pool.assets) {
    const counts = pool.tiers.map((t) => ownedCount(c, { asset: asset.id, tier: t.id }));
    if (!dispensable(asset) && counts.every((n) => n === 0)) continue;
    let n = 0;
    let fc = 0;
    pool.tiers.forEach((t) => {
      const s = spares(pool, c, { asset: asset.id, tier: t.id });
      n += s;
      fc += s * t.scrapFc;
    });
    owned += counts.filter((k) => k > 0).length;
    rows.push({ asset, counts, spares: n, spareFc: fc });
  }
  // Each asset counts the tiers it comes in (a chase replica: Legendary only, M32).
  return { rows, owned, total: rows.reduce((sum, r) => sum + tiersOf(pool, r.asset).length, 0) };
}

/** The commonest item of an asset that has a spare (what "Scrap 1" scraps), or null. */
export function cheapestSpare(pool: Pool, c: Collection, asset: string): ItemRef | null {
  for (const t of pool.tiers) if (spares(pool, c, { asset, tier: t.id }) > 0) return { asset, tier: t.id };
  return null;
}

/** The chase items Shots can give (M32), each with its chance per item drawn (0..1) and the tiers it comes in. */
export function chaseChances(pool: Pool): { asset: Asset; chance: number; tiers: readonly RarityTier[] }[] {
  return shotAssets(pool)
    .filter(isChase)
    .map((asset) => ({ asset, chance: asset.dropChance ?? 0, tiers: tiersOf(pool, asset) }));
}

/** Each tier's chance, normalised to 100 (as the Armory shows and draws them). */
export function tierChances(pool: Pool): { tier: RarityTier; percent: number }[] {
  const total = pool.tiers.reduce((sum, t) => sum + Math.max(0, t.odds), 0);
  return pool.tiers.map((tier) => ({ tier, percent: total > 0 ? (Math.max(0, tier.odds) / total) * 100 : 0 }));
}

/** What `count` Shots cost in FC alone (audit POOL-13: the price shown on the buttons, whatever Tokens are held). */
export function shotFcPrice(e: Economy, count: ShotCount): number {
  return shotTokens(e, count) * fcPerToken(e);
}

/** A Shot's items rarest first (audit POOL-11), draw order kept between equals. */
export function rarestFirst(pool: Pool, got: readonly Dispensed[]): Dispensed[] {
  const rank = (d: Dispensed): number => pool.tiers.findIndex((t) => t.id === d.item.tier);
  return got.map((d, i) => ({ d, i })).sort((a, b) => rank(b.d) - rank(a.d) || a.i - b.i).map(({ d }) => d);
}

/**
 * One line for a Shot (audit POOL-11): "1 Epic, 4 Rare, 25 others · 3 new". Tiers from Rare up are named (the ten-Shot
 * guarantee's tier, else the third), the rest counted together.
 */
export function revealSummary(pool: Pool, got: readonly Dispensed[]): string {
  const guaranteed = pool.tiers.findIndex((t) => t.id === pool.economy.tenShotGuarantee);
  const named = guaranteed > 0 ? guaranteed : Math.min(2, pool.tiers.length - 1);
  const parts: string[] = [];
  for (let t = pool.tiers.length - 1; t >= named; t--) {
    const n = got.filter((d) => d.item.tier === pool.tiers[t]!.id).length;
    if (n > 0) parts.push(`${n} ${pool.tiers[t]!.label}`);
  }
  const rest = got.filter((d) => pool.tiers.findIndex((t) => t.id === d.item.tier) < named).length;
  if (rest > 0) parts.push(parts.length > 0 ? `${rest} ${rest === 1 ? 'other' : 'others'}` : `${rest} ${rest === 1 ? 'item' : 'items'}`);
  const fresh = got.filter((d) => d.isNew).length;
  const summary = fresh > 0 ? `${parts.join(', ')} · ${fresh} new` : parts.join(', ');
  // A chase item (M32) leads the line.
  const chased = got.flatMap((d) => {
    const a = pool.byId.get(d.item.asset);
    return a && isChase(a) ? [a.name] : [];
  });
  return chased.length > 0 ? `Chase item: ${[...new Set(chased)].join(', ')}! · ${summary}` : summary;
}
