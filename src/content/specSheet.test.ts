import { describe, expect, it } from 'vitest';
import { MODEL_BUDGET } from '../config/contentRules';
import { SHOT_PROFILES } from '../config/sounds';
import { GAME_POOL } from '../pool/gamePool';
import { replicaOf } from '../pool/pool';
import { type ModelCensus, modelCensus, type SoundCensus, soundCensus } from './census';
import { worstVerdict } from './checks';
import { asItComesFit, carried } from './kits';
import { compareSheets, partSpecChecks, replicaSpecChecks } from './specChecks';
import { specSheet } from './specSheet';

/** The spec test (CT1, level 3): the chrono and range table, the model and sound census, and their verdicts. */

const AEG = GAME_POOL.byId.get('000002')!;
const PISTOL = GAME_POOL.byId.get('000001')!;
const CYBER = GAME_POOL.byId.get('000019')!;
const sheetOf = (id: string) => {
  const a = GAME_POOL.byId.get(id)!;
  return specSheet(carried(GAME_POOL, a, asItComesFit(GAME_POOL, a)));
};

describe('the spec sheet', () => {
  const aeg = sheetOf(AEG.id);

  it('chronos the AEG under its site limit with every BB weight, heavier BBs slower', () => {
    expect(aeg.chrono.map((r) => r.grams)).toEqual([0.2, 0.25, 0.28, 0.3]);
    for (const r of aeg.chrono) expect(r.joules).toBeLessThan(replicaOf(AEG).energyLimit);
    for (let i = 1; i < aeg.chrono.length; i++) expect(aeg.chrono[i]!.speed).toBeLessThan(aeg.chrono[i - 1]!.speed);
  });

  it('keeps the AEG on target to about 39 m, and the pistol shorter', () => {
    expect(aeg.onTarget).toBeGreaterThan(35);
    expect(aeg.onTarget).toBeLessThan(45);
    expect(aeg.bestOnTarget.metres).toBeGreaterThanOrEqual(aeg.onTarget - 1e-9);
    expect(sheetOf(PISTOL.id).onTarget).toBeLessThan(aeg.onTarget);
  });

  it('lifts the AEG over the aim line at mid range, then drops it', () => {
    const at = (m: number): number => aeg.drop.find((d) => d.metres === m)!.cm;
    expect(at(20)).toBeLessThan(0);
    expect(at(50)).toBeGreaterThan(at(40));
    expect(at(50)).toBeGreaterThan(0);
  });

  it('groups wider further out', () => {
    expect(aeg.group[1]!.cm).toBeGreaterThan(aeg.group[0]!.cm);
    expect(aeg.emptyMag).toBeCloseTo(aeg.magSize / aeg.fireRate, 6);
  });

  it('compares sheets one way and the other', () => {
    const pistol = sheetOf(PISTOL.id);
    const ab = compareSheets(aeg, pistol);
    const ba = compareSheets(pistol, aeg);
    expect(ab.better).toEqual(ba.worse);
    expect(ab.worse).toEqual(ba.better);
    expect(ab.better).toContain('reach');
    expect(compareSheets(aeg, aeg)).toEqual({ better: [], worse: [] });
  });
});

describe('the census', () => {
  it('counts what the AEG draws, its parts included', () => {
    const c = modelCensus(replicaOf(AEG));
    expect(c.fromFile).toBe(false);
    expect(c.low.triangles).toBeGreaterThan(0);
    expect(c.high.triangles).toBeGreaterThanOrEqual(c.low.triangles);
    expect(c.parts.map((p) => p.name)).toEqual(expect.arrayContaining(['optic:redDot', 'magazine:hiCap', 'muzzle:silencer']));
  });

  it('hears every shot profile', () => {
    for (const s of soundCensus(SHOT_PROFILES)) {
      expect(s.loudnessDb, s.profile).toBeLessThan(0);
      expect(s.peakDb, s.profile).toBeGreaterThanOrEqual(s.loudnessDb);
      expect(s.centroidHz, s.profile).toBeGreaterThan(0);
    }
  });
});

describe('the spec verdicts', () => {
  const cost = (triangles: number, meshes: number) => ({ triangles, meshes });
  const census = (high: number, partMeshes = 2): ModelCensus => ({ replica: 'aeg', fromFile: false, low: cost(high / 2, 10), high: cost(high, 12), parts: [{ name: 'optic:redDot', low: cost(100, 1), high: cost(200, partMeshes) }] });
  const sound = (profile: SoundCensus['profile'], loudnessDb: number): SoundCensus => ({ profile, peakDb: loudnessDb + 10, loudnessDb, centroidHz: 1000 });
  const aeg = sheetOf(AEG.id);
  const pistol = sheetOf(PISTOL.id);
  const cyber = sheetOf(CYBER.id);
  const budget = MODEL_BUDGET.highTriangles.rifle!;
  const sounds = [sound('electric', -20), sound('gas', -20)];

  it('passes the AEG as it is', () => {
    expect(worstVerdict(replicaSpecChecks(AEG, 'rifle', aeg, [], census(budget - 1), sounds[0], sounds))).toBe('pass');
  });

  it('fails a model over its budget and a part with too many meshes', () => {
    const over = replicaSpecChecks(AEG, 'rifle', aeg, [], census(budget + 1), sounds[0], sounds);
    expect(over.find((r) => r.check === 'replica.modelCost')!.verdict).toBe('fail');
    const heavy = replicaSpecChecks(AEG, 'rifle', aeg, [], census(budget - 1, MODEL_BUDGET.partMeshes + 1), sounds[0], sounds);
    expect(heavy.find((r) => r.check === 'replica.partCost')!.verdict).toBe('fail');
    const part = GAME_POOL.byId.get('000007')!;
    expect(partSpecChecks(part, 'optic:redDot', [{ replica: 'AEG Rifle', census: census(budget, MODEL_BUDGET.partMeshes + 1) }])[0]!.verdict).toBe('fail');
    expect(partSpecChecks(part, 'optic:holo', [{ replica: 'AEG Rifle', census: census(budget) }])[0]!.verdict).toBe('fail');
    expect(partSpecChecks(part, 'optic:redDot', [{ replica: 'AEG Rifle', census: census(budget) }])[0]!.verdict).toBe('pass');
  });

  it('asks for a listen when a shot is far louder than the rest, and fails a silent one', () => {
    const loud = replicaSpecChecks(AEG, 'rifle', aeg, [], census(1000), sound('electric', -5), sounds);
    expect(loud.find((r) => r.check === 'replica.soundLevel')!.verdict).toBe('warn');
    const silent = replicaSpecChecks(AEG, 'rifle', aeg, [], census(1000), undefined, sounds);
    expect(silent.find((r) => r.check === 'replica.soundLevel')!.verdict).toBe('fail');
  });

  it('asks for a look at a replica better than every other at everything, unless it is allowed stronger', () => {
    const worse = { ...pistol, onTarget: 1, fireRate: 1, magSize: 1, mags: 1, reload: 99, draw: 99, recoilDeg: 99, group: pistol.group.map((g) => ({ ...g, cm: 999 })) };
    const strong = replicaSpecChecks(PISTOL, 'pistol', pistol, [worse], census(1000), sounds[1], sounds);
    expect(strong.find((r) => r.check === 'replica.sidegrade')!.verdict).toBe('warn');
    const allowed = replicaSpecChecks(CYBER, 'pistol', pistol, [worse], census(1000), sounds[1], sounds);
    expect(allowed.find((r) => r.check === 'replica.sidegrade')!.verdict).toBe('pass');
    const traded = replicaSpecChecks(PISTOL, 'pistol', pistol, [cyber], census(1000), sounds[1], sounds);
    expect(traded.find((r) => r.check === 'replica.sidegrade')!.verdict).toBe('pass');
  });
});
