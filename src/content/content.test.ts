import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { REPLICA_RANGES } from '../config/contentRules';
import type { ReplicaConfig } from '../config/replicas';
import { GAME_POOL } from '../pool/gamePool';
import type { Asset, Pool } from '../pool/pool';
import { MemoryStorage } from '../pool/testStorage';
import { assetRules, brandsIn, isTitleCase } from './assetRules';
import { type CheckResult, worstVerdict } from './checks';
import type { ContentInputs } from './contentInputs';
import { checkAllAssets, checkAsset, gameInputs } from './gameContent';
import { kitGrid } from './kitGrid';
import { partCompatibility, partRules } from './partChecks';
import { replicaCompatibility, replicaRules } from './replicaChecks';

/**
 * The content toolkit's levels 1 and 2 (CT1): every asset the game ships passes them, and each check fails on the fault
 * it is there to catch (a pool, config or table with that fault in it).
 */

beforeAll(() => vi.stubGlobal('localStorage', new MemoryStorage()));
afterAll(() => vi.unstubAllGlobals());

const asset = (id: string): Asset => GAME_POOL.byId.get(id)!;
const AEG = asset('000002');
const RED_DOT = asset('000007');
const VERTICAL_GRIP = asset('000006');

/** The game's inputs with `extra` added to the pool (an asset with an ID already there replaces it). */
function withAssets(extra: readonly Asset[], change: Partial<ContentInputs> = {}): ContentInputs {
  const ids = new Set(extra.map((a) => a.id));
  const assets = [...GAME_POOL.assets.filter((a) => !ids.has(a.id)), ...extra];
  const pool: Pool = { ...GAME_POOL, assets, byId: new Map(assets.map((a) => [a.id, a])) };
  return { ...gameInputs(pool), ...change };
}

/** The verdict of check `check` among `results` (undefined when it didn't run). */
const verdictOf = (results: readonly CheckResult[], check: string): string | undefined => {
  const own = results.filter((r) => r.check === check);
  return own.length > 0 ? worstVerdict(own) : undefined;
};

describe('the content checks on the game as it ships', () => {
  it('pass every asset with nothing to look at', () => {
    const results = checkAllAssets();
    const flagged = results.filter((r) => r.verdict === 'fail' || r.verdict === 'warn').map((r) => `${r.check} · ${r.item}: ${r.says}`);
    expect(flagged).toEqual([]);
    expect(results.length).toBeGreaterThan(GAME_POOL.assets.length * 3);
  });

  it('try every kit the AEG can wear, at the commonest and rarest tier', () => {
    const grid = kitGrid(GAME_POOL, AEG, 'rifle');
    expect(grid.tried).toBe(grid.combinations);
    expect(grid.problems).toEqual([]);
    expect(grid.strongest.uncapped).toBeGreaterThan(gameInputs().replicas.aeg!.muzzleEnergy);
    expect(grid.strongest.limit).toBe(1.2);
  });
});

describe('the rules every item keeps', () => {
  it('want a Title Case name with no real brand in it', () => {
    expect(isTitleCase('Red Dot')).toBe(true);
    expect(isTitleCase('11.1 V LiPo Battery')).toBe(true);
    expect(isTitleCase('red dot')).toBe(false);
    expect(brandsIn('Tokyo Marui Rifle')).not.toEqual([]);
    expect(brandsIn('Marching Rifle')).toEqual([]);
    expect(verdictOf(assetRules({ ...RED_DOT, name: 'red dot sight' }, 'optic'), 'optic.name')).toBe('fail');
  });

  it('keep a new item dev until the owner makes it public', () => {
    const fresh = { ...RED_DOT, id: '999001', name: 'Holo Sight' };
    expect(verdictOf(assetRules({ ...fresh, tag: 'dev' }, 'optic'), 'optic.access')).toBe('pass');
    expect(verdictOf(assetRules({ ...fresh, tag: 'public' }, 'optic'), 'optic.access')).toBe('fail');
    expect(verdictOf(assetRules({ ...fresh, tag: 'public' }, 'optic', { '999001': 'the owner, playtested' }), 'optic.access')).toBe('pass');
  });
});

describe('a replica', () => {
  const TEST_RIFLE: Asset = { ...AEG, id: '999002', name: 'Test Rifle', tag: 'dev' };

  it('passes as a copy of the AEG', () => {
    const inputs = withAssets([TEST_RIFLE]);
    const results = [...replicaRules(inputs, TEST_RIFLE), ...replicaCompatibility(inputs, TEST_RIFLE)];
    expect(results.filter((r) => r.verdict === 'fail')).toEqual([]);
  });

  it('fails a Key the code does not know', () => {
    const odd = { ...TEST_RIFLE, key: 'nope' };
    expect(verdictOf(replicaRules(withAssets([odd]), odd), 'replica.key')).toBe('fail');
  });

  it('fails a number outside its class range, and energy past the site limit', () => {
    const hot: ReplicaConfig = { ...gameInputs().replicas.aeg!, muzzleEnergy: 1.3, fireRate: REPLICA_RANGES.rifle!.fireRate.max + 10 };
    const inputs = withAssets([TEST_RIFLE], { replicas: { ...gameInputs().replicas, aeg: hot } });
    const results = replicaRules(inputs, TEST_RIFLE);
    expect(verdictOf(results, 'replica.ranges')).toBe('fail');
    expect(verdictOf(results, 'replica.siteLimit')).toBe('fail');
  });

  it('fails without its drive tag, and without its class tag', () => {
    const noDrive = { ...TEST_RIFLE, tags: TEST_RIFLE.tags.filter((t) => t !== 'electric') };
    expect(verdictOf(replicaRules(withAssets([noDrive]), noDrive), 'replica.drive')).toBe('fail');
    const noClass = { ...TEST_RIFLE, tags: TEST_RIFLE.tags.filter((t) => t !== 'rifle') };
    expect(verdictOf(replicaRules(withAssets([noClass]), noClass), 'replica.class')).toBe('fail');
  });

  it('fails when its model does not draw a part that fits it', () => {
    const tables = gameInputs().drawTables;
    const aeg = tables.aeg!;
    const inputs = withAssets([], { drawTables: { ...tables, aeg: { ...aeg, parts: aeg.parts.filter((p) => p !== 'optic:redDot') } } });
    expect(verdictOf(replicaCompatibility(inputs, AEG), 'replica.model')).toBe('fail');
    expect(verdictOf(partCompatibility(inputs, RED_DOT), 'optic.model')).toBe('fail');
  });

  it('fails without its sounds', () => {
    const inputs = withAssets([], { soundCues: new Set<string>() });
    expect(verdictOf(replicaCompatibility(inputs, AEG), 'replica.sound')).toBe('fail');
  });

  it('asks for a look when a tag of its is used by no part', () => {
    const tagged = { ...TEST_RIFLE, tags: [...TEST_RIFLE.tags, 'side-rail'] };
    expect(verdictOf(replicaCompatibility(withAssets([tagged]), tagged), 'replica.tags')).toBe('warn');
  });

  it('fails when no power source fits it', () => {
    const inputs = withAssets(GAME_POOL.assets.filter((a) => a.category === 'power').map((a) => ({ ...a, tags: ['nothing'] })));
    expect(verdictOf(replicaCompatibility(inputs, AEG), 'replica.power')).toBe('fail');
  });
});

describe('a part', () => {
  it('fails when it fits no replica', () => {
    const lost = { ...RED_DOT, id: '999003', name: 'Lost Sight', tag: 'dev' as const, tags: ['side-rail'] };
    expect(verdictOf(partRules(withAssets([lost]), lost), 'optic.fits')).toBe('fail');
  });

  it('asks for a look when it fits by naming a replica', () => {
    const named = { ...RED_DOT, id: '999004', name: 'Named Sight', tag: 'dev' as const, tags: ['000002'] };
    expect(verdictOf(partRules(withAssets([named]), named), 'optic.fits')).toBe('warn');
  });

  it('fails a Key the code does not know', () => {
    const odd = { ...VERTICAL_GRIP, id: '999005', name: 'Odd Grip', tag: 'dev' as const, key: 'nope' };
    expect(verdictOf(partRules(withAssets([odd]), odd), 'grip.key')).toBe('fail');
  });

  it('fails when it is better at everything with no cost, and asks for a look when it improves nothing', () => {
    const grip = { ...VERTICAL_GRIP, id: '999006', name: 'Magic Grip', tag: 'dev' as const };
    const better = withAssets([grip], { effects: () => [{ says: 'handling ×0.5', change: 'better' }] });
    expect(verdictOf(partRules(better, grip), 'grip.tradeOff')).toBe('fail');
    const nothing = withAssets([grip], { effects: () => [{ says: 'handling ×1', change: 'same' }] });
    expect(verdictOf(partRules(nothing, grip), 'grip.tradeOff')).toBe('warn');
    const traded = withAssets([grip], { effects: () => [{ says: 'handling ×0.5', change: 'better' }, { says: 'spread ×1.2', change: 'worse' }] });
    expect(verdictOf(partRules(traded, grip), 'grip.tradeOff')).toBe('pass');
  });

  it('passes an optic better at everything: its cost is built in', () => {
    const optic = { ...RED_DOT, id: '999007', name: 'Bright Sight', tag: 'dev' as const };
    expect(verdictOf(partRules(withAssets([optic], { effects: () => [{ says: 'zoom ×2', change: 'better' }] }), optic), 'optic.tradeOff')).toBe('pass');
  });

  it('runs every level-1 and level-2 check through checkAsset', () => {
    const checks = new Set(checkAsset(gameInputs(), RED_DOT).map((r) => r.check));
    expect([...checks]).toEqual(expect.arrayContaining(['optic.name', 'optic.access', 'optic.key', 'optic.stats', 'optic.fits', 'optic.tradeOff', 'optic.model', 'optic.kits']));
  });
});
