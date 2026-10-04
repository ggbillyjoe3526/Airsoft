import { afterAll, describe, expect, it, vi } from 'vitest';
import { DEFAULT_DIFFICULTY } from '../config/bots';
import { DEFAULT_MATCH_RULES, DEFAULT_RULESET } from '../config/matchRules';
import { DEFAULT_MODE } from '../config/modes';
import { CYBER_PISTOL, LOADOUT } from '../config/replicas';
import { TORCHES } from '../config/torches';
import type { MapId } from '../map/maps';
import { botsCarryDevLight, matchUsesDev, type NewGamePicks, playsAtNight, usedItems } from '../newGamePicks';
import { createCharacter } from '../sim/character';
import { vec3 } from '../sim/vec';
import { botLight, fitBotLight, randomKit } from './botKit';
import { grantStarters, itemKey } from './collection';
import { contentPool } from './contentPool';
import { GAME_POOL } from './gamePool';
import { FIT_SLOTS } from './kit';
import { LoadoutModel } from './loadoutModel';
import { MemoryStorage } from './testStorage';
import { assetOfReplica, type Pool } from './pool';

// Test files share a worker (isolate: false): the stand-in storage goes with this file.
afterAll(() => vi.unstubAllGlobals());

const TORCH_ID = '000020';
const torchRef = { asset: TORCH_ID, tier: 'common' };
const picks = (map: MapId): NewGamePicks => ({ map, mode: DEFAULT_MODE, difficulty: DEFAULT_DIFFICULTY, teammateDifficulty: DEFAULT_DIFFICULTY, ruleset: DEFAULT_RULESET, rules: { ...DEFAULT_MATCH_RULES } });
const without = (pool: Pool, id: string): Pool => {
  const assets = pool.assets.filter((a) => a.id !== id);
  return { ...pool, assets, byId: new Map(assets.map((a) => [a.id, a])) };
};

describe('the Weapon Torch in the pool (M33h)', () => {
  it("is pool.md's 000020: a dev light, a starter never in Shots, Common only, fitting all three replicas", () => {
    const torch = GAME_POOL.byId.get(TORCH_ID)!;
    expect(GAME_POOL.errors).toEqual([]);
    expect(torch).toMatchObject({ name: 'Weapon Torch', category: 'light', key: 'weaponTorch', starter: true, inShots: false, tag: 'dev', tiers: ['common'] });
    expect(TORCHES[torch.key as 'weaponTorch'].reach).toBe(40);
    expect(FIT_SLOTS.at(-1)).toBe('light');
    for (const r of [...LOADOUT, CYBER_PISTOL]) {
      const replica = assetOfReplica(GAME_POOL, r)!;
      expect(torch.tags.some((t) => replica.tags.includes(t) || t === replica.id), r.id).toBe(true);
    }
  });

  it('reaches an existing save as a starter', () => {
    const old = { owned: { [itemKey('000001', 'common')]: 1 }, fc: 120, tokens: 0, seed: 1, pity: {}, rev: 3 };
    grantStarters(old, GAME_POOL);
    expect(old.owned[itemKey(TORCH_ID, 'common')]).toBe(1);
    expect(old.fc).toBe(120);
  });

  it('is gone with Dev content off: no light in the pool, so no bot carries one', () => {
    const shown = contentPool(GAME_POOL, false);
    expect(shown.assets.some((a) => a.category === 'light')).toBe(false);
    expect(botLight(shown)).toBeNull();
    expect(botLight(contentPool(GAME_POOL, true))).toBe('weaponTorch');
  });

  it('gives the Loadout a Light slot only with Dev content on, the owned starter torch fitted by default', () => {
    vi.stubGlobal('localStorage', new MemoryStorage());
    const owns = { owns: (r: { tier: string }) => r.tier === 'common' };
    const rifle = GAME_POOL.assets.find((a) => a.name === 'AEG Rifle')!.id;
    expect(new LoadoutModel(contentPool(GAME_POOL, false), owns).hasSlot(rifle, 'light')).toBe(false);
    const dev = new LoadoutModel(contentPool(GAME_POOL, true), owns);
    expect(dev.hasSlot(rifle, 'light')).toBe(true);
    expect(dev.fitOf(rifle).light).toEqual(torchRef);
  });

  it('is fitted to every replica of a bot that it fits, keeping the other parts', () => {
    const c = createCharacter(3, vec3(), 0, LOADOUT, 1);
    const before = c.armament.parts.map((p) => ({ ...p }));
    fitBotLight(c, GAME_POOL, null);
    expect(c.armament.parts.every((p) => !p.light)).toBe(true);
    fitBotLight(c, GAME_POOL, 'weaponTorch');
    c.armament.parts.forEach((p, i) => expect(p).toEqual({ ...before[i], light: 'weaponTorch' }));
    const plain = createCharacter(4, vec3(), 0, LOADOUT, 1);
    fitBotLight(plain, contentPool(GAME_POOL, false), 'weaponTorch'); // not in the pool shown: nothing fitted
    expect(plain.armament.parts.every((p) => !p.light)).toBe(true);
  });

  it('leaves every seeded bot kit as it was (a light is never rolled)', () => {
    const before = without(GAME_POOL, TORCH_ID);
    for (const seed of [1, 7, 42, 1234, 99991]) {
      const kit = randomKit(GAME_POOL, LOADOUT, seed, 1);
      expect(kit).toEqual(randomKit(before, LOADOUT, seed, 1));
      expect(kit.every((s) => !s.parts.light)).toBe(true);
    }
  });
});

describe('a match with the torch counts and pays (M33h, M35)', () => {
  it('plays Woodland at night and Depot by day', () => {
    expect(playsAtNight('woodland')).toBe(true);
    expect(playsAtNight('depot')).toBe(false);
  });

  it('counts a fitted torch only at night: Depot by day with Dev content on counts and pays as before', () => {
    expect(usedItems(GAME_POOL, [torchRef, null], false)).toEqual([null]);
    expect(usedItems(GAME_POOL, [torchRef, null], true)).toEqual([torchRef, null]);
    expect(matchUsesDev(picks('depot'), [torchRef], GAME_POOL, true)).toBe(false);
    expect(matchUsesDev(picks('woodland'), [torchRef], GAME_POOL, true)).toBe(true);
  });

  it("counts the bots' torches on a night field with Dev content on, never by day or with it off", () => {
    expect(botsCarryDevLight(GAME_POOL, true, true)).toBe(true);
    expect(botsCarryDevLight(GAME_POOL, true, false)).toBe(false);
    expect(botsCarryDevLight(GAME_POOL, false, true)).toBe(false);
    // Woodland is a dev map itself (M33d), so only Depot by day shows the torch adds nothing there.
    expect(matchUsesDev(picks('depot'), [], GAME_POOL, true)).toBe(false);
  });
});
