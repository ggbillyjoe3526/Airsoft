import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
// @ts-expect-error the pipeline's plain-JS module has no declarations
import { balanceResults } from '../../pipeline/contentReport.mjs';
import { MAGAZINES } from '../config/attachments';
import { GAME_STATS } from '../config/gameStats';
import { REPLICA_RANGES } from '../config/contentRules';
import { EMPTY_FIT, energyCapped, kitReplica, uncappedEnergy } from '../pool/kit';
import { GAME_POOL } from '../pool/gamePool';
import type { Pool } from '../pool/pool';
import { replicaOf } from '../pool/pool';
import { GAME_LEVELS } from '../progress/gameLevels';
import { MemoryStorage } from '../pool/testStorage';
import { gameInputs } from './gameContent';
import { GRID_LIMIT, kitGrid, kitNumbers, slotChoices } from './kitGrid';
import { asItComesFit, carried } from './kits';
import { replicaCompatibility } from './replicaChecks';

/** Gaps found checking CT1's acceptance 2 and 3: the grid finding a real fault, the kit helpers and the balance rows. */

beforeAll(() => vi.stubGlobal('localStorage', new MemoryStorage()));
afterAll(() => vi.unstubAllGlobals());

const AEG = GAME_POOL.byId.get('000002')!;
const PISTOL = GAME_POOL.byId.get('000001')!;

/**
 * `body` run on a fresh copy of the game's pool (its own grid) while the Hi-Cap Magazine's reload scale is negative (a
 * faulted stats.md row), the magazine put back after.
 */
function withBrokenMagazine<T>(body: (pool: Pool) => T): T {
  const saved = { ...MAGAZINES.hiCap };
  try {
    Object.assign(MAGAZINES.hiCap, { reloadScale: -0.5 });
    return body({ ...GAME_POOL });
  } finally {
    Object.assign(MAGAZINES.hiCap, saved);
  }
}

describe('the kit grid on a faulted pool', () => {
  it('finds nothing in the shipped pool', () => {
    expect(kitGrid(GAME_POOL, AEG, 'rifle').problems.filter((p) => p.severity === 'fail')).toEqual([]);
  });

  it('finds a reload that broke when a magazine’s reload scale is negative, and says which kit', () => {
    const broken = withBrokenMagazine((pool) => kitGrid(pool, AEG, 'rifle').problems.filter((p) => p.severity === 'fail'));
    expect(broken.length).toBeGreaterThan(0);
    expect(broken.some((p) => /reloadTime is -?[\d.]+: a number broke/.test(p.says))).toBe(true);
    expect(broken.every((p) => /AEG Rifle with .*Hi-Cap Magazine/.test(p.fit))).toBe(true);
    expect(MAGAZINES.hiCap.reloadScale).toBeGreaterThan(0); // put back
  });

  it('turns that into a failing replica.kits check', () => {
    const kits = withBrokenMagazine((pool) => replicaCompatibility(gameInputs(pool), AEG).find((r) => r.check === 'replica.kits')!);
    expect(kits.verdict).toBe('fail');
    expect(kits.says).toMatch(/break/);
  });

  it('is a new grid for a new pool, not the one worked out for the shipped pool', () => {
    const fresh = kitGrid(GAME_POOL, AEG, 'rifle');
    expect(kitGrid(GAME_POOL, AEG, 'rifle')).toBe(fresh);
    expect(kitGrid({ ...GAME_POOL }, AEG, 'rifle')).not.toBe(fresh);
  });

  it('warns, without failing, when a stacked kit runs well past the class range', () => {
    // A site class with a tight fire-rate ceiling: the shipped AEG's best kits pass it.
    const tight = { ...REPLICA_RANGES.rifle!, fireRate: { min: 0.5, max: 1 } };
    vi.spyOn(REPLICA_RANGES, 'rifle', 'get').mockReturnValue(tight);
    try {
      const grid = kitGrid({ ...GAME_POOL }, AEG, 'rifle');
      expect(grid.problems.some((p) => p.severity === 'warn' && /fireRate/.test(p.says))).toBe(true);
    } finally {
      vi.restoreAllMocks();
    }
  });

  it('visits every combination when under the limit, and a spread of GRID_LIMIT when over', () => {
    const grid = kitGrid({ ...GAME_POOL }, AEG, 'rifle');
    expect(grid.combinations).toBeGreaterThan(1);
    expect(grid.tried).toBe(Math.min(grid.combinations, GRID_LIMIT));
    expect(slotChoices(GAME_POOL, AEG).power).not.toContain(null);
  });
});

describe('the kit helpers', () => {
  it('uncappedEnergy is the energy before the site limit, and energyCapped is its comparison with the limit', () => {
    const fit = asItComesFit(GAME_POOL, AEG);
    const item = { asset: AEG.id };
    const base = replicaOf(AEG);
    expect(uncappedEnergy(GAME_POOL, item, EMPTY_FIT)).toBeCloseTo(base.muzzleEnergy, 9);
    for (const a of GAME_POOL.assets.filter((x) => x.category === 'replica')) {
      const it = { asset: a.id };
      for (const f of [EMPTY_FIT, asItComesFit(GAME_POOL, a)]) {
        const u = uncappedEnergy(GAME_POOL, it, f);
        expect(energyCapped(GAME_POOL, it, f)).toBe(u > replicaOf(a).energyLimit);
        expect(kitReplica(GAME_POOL, it, f).muzzleEnergy).toBeCloseTo(Math.min(replicaOf(a).energyLimit, u), 9);
      }
    }
    expect(fit.power).not.toBeNull();
  });

  it('uncappedEnergy reads the stats it is given, and energyCapped follows it', () => {
    const item = { asset: AEG.id };
    const stats = { ...GAME_STATS, power: Object.fromEntries(Object.entries(GAME_STATS.power).map(([k, v]) => [k, { ...v, energy: 5 }])) };
    const fit = asItComesFit(GAME_POOL, AEG);
    expect(GAME_STATS.power[fit.power?.asset ?? '']).toBeDefined();
    expect(uncappedEnergy(GAME_POOL, item, fit, stats)).toBeGreaterThan(uncappedEnergy(GAME_POOL, item, fit));
    expect(energyCapped(GAME_POOL, item, fit, stats)).toBe(true);
  });

  it('asItComesFit gives a replica its level 0 power source and nothing else', () => {
    for (const a of [AEG, PISTOL]) {
      const fit = asItComesFit(GAME_POOL, a);
      for (const [slot, ref] of Object.entries(fit)) if (slot !== 'power') expect(ref).toBeNull();
      expect(fit.power).not.toBeNull();
      {
        const power = GAME_POOL.byId.get(fit.power!.asset)!;
        expect(power.category).toBe('power');
        const fitting = GAME_POOL.assets.filter((x) => x.category === 'power' && x.tags.some((t) => a.tags.includes(t)));
        if (fitting.some((x) => GAME_LEVELS.unlockLevel.get(x.id) === 0)) expect(GAME_LEVELS.unlockLevel.get(power.id)).toBe(0);
        expect(fit.power).toEqual({ asset: power.id });
      }
    }
  });

  it('carried takes the part handling into the numbers', () => {
    const asIs = carried(GAME_POOL, AEG, asItComesFit(GAME_POOL, AEG));
    expect(asIs.name).toBe(AEG.name);
    const hiCap = GAME_POOL.assets.find((a) => a.category === 'magazine' && a.key === 'hiCap');
    expect(hiCap).toBeDefined();
    {
      const withMag = carried(GAME_POOL, AEG, { ...asItComesFit(GAME_POOL, AEG), magazine: { asset: hiCap!.id } });
      expect(withMag.magSize).toBeGreaterThan(asIs.magSize);
      const n = kitNumbers(GAME_POOL, { asset: AEG.id }, { ...asItComesFit(GAME_POOL, AEG), magazine: { asset: hiCap!.id } });
      expect(withMag.magSize).toBe(n.magSize);
      expect(withMag.reloadTime).toBeCloseTo(n.reloadTime, 9);
    }
  });
});

describe('the balance rows in the report', () => {
  it('turn a measure that did not run into a look-at-this row when it has a band, and a figure when it has none', () => {
    const rows = balanceResults([
      { label: 'Depot: share', value: Number.NaN, of: 0, band: { min: 0.4, max: 0.6 } },
      { label: 'Depot: unbanded', value: Number.NaN, of: 0, band: {} },
    ]);
    expect(rows.map((r: { verdict: string }) => r.verdict)).toEqual(['warn', 'info']);
    expect(rows[0].says).toContain('–');
    expect(rows.every((r: { level: string }) => r.level === 'balance')).toBe(true);
  });

  it('puts the worst figure first and keeps a measure within noise as a look, not a fail', () => {
    const rows = balanceResults([
      { label: 'ok', value: 0.5, of: 400, band: { min: 0.4, max: 0.6 } },
      { label: 'near', value: 0.61, of: 400, band: { min: 0.4, max: 0.6 } },
      { label: 'far', value: 0.9, of: 400, band: { min: 0.4, max: 0.6 } },
    ]);
    expect(rows.map((r: { item: string; verdict: string }) => [r.item, r.verdict])).toEqual([['far', 'fail'], ['near', 'warn'], ['ok', 'pass']]);
  });
});
