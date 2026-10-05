import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { BOT_LOADOUTS, DIFFICULTIES, type Difficulty } from '../config/bots';
import { DEFAULT_MATCH_RULES, DEFAULT_RULESET } from '../config/matchRules';
import { DEFAULT_MODE } from '../config/modes';
import { CYBER_PISTOL, LOADOUT } from '../config/replicas';
import type { MapId } from '../map/maps';
import { botsMayCarryDev, matchUsesDev, type NewGamePicks, playedPicks } from '../newGamePicks';
import { rolledKitMayHoldDev } from './botKit';
import { type Collection, type ItemRef, itemKey, newCollection } from './collection';
import { GAME_POOL } from './gamePool';
import { FIT_SLOTS } from './kit';
import { gameOwnership, LoadoutModel } from './loadoutModel';
import { assetOfReplica } from './pool';
import { MemoryStorage } from './testStorage';

/**
 * M33h QA, acceptance 1: the Weapon Torch as the game itself wires it (game.ts: LoadoutModel over the whole GAME_POOL
 * with gameOwnership, and matchUsesDev over the Loadout's equipped items). With Dev content off a save that owns the
 * torch (a starter, granted to every save) has no Light slot, no torch in its kit and Depot counts and pays at every
 * difficulty; with Dev content on, Depot by day still counts and pays, torch fitted or not, at every difficulty.
 */

// Test files share a worker (isolate: false): the stand-in storage goes with this file.
afterAll(() => vi.unstubAllGlobals());

const TORCH: ItemRef = { asset: '000020', tier: 'common' };
/** The public levels (Pro is dev content itself, M38); Hard rolls each opponent a kit (BOT_LOADOUTS). */
const LEVELS = DIFFICULTIES.filter((d) => d.tag === 'public').map((d) => d.id);
const picks = (map: MapId, difficulty: Difficulty): NewGamePicks => ({ map, mode: DEFAULT_MODE, difficulty, teammateDifficulty: difficulty, ruleset: DEFAULT_RULESET, rules: { ...DEFAULT_MATCH_RULES } });

/** The game's Loadout (game.ts): the whole pool, owned through gameOwnership with the Dev content switch. */
function gameLoadout(collection: Collection, dev: { on: boolean }): LoadoutModel {
  return new LoadoutModel(GAME_POOL, gameOwnership(GAME_POOL, () => collection, () => false, () => dev.on));
}

/** game.ts equippedItems: each gear slot's replica and everything fitted to it. */
const equippedItems = (m: LoadoutModel): (ItemRef | null)[] => m.equipped().flatMap((r) => (r ? [r, ...Object.values(m.fitOf(r.asset))] : []));
const holdsTorch = (items: readonly (ItemRef | null)[]): boolean => items.some((r) => r?.asset === TORCH.asset);

describe('Dev content off: no Light slot, no torch, Depot counts and pays (M33h acceptance 1)', () => {
  beforeEach(() => vi.stubGlobal('localStorage', new MemoryStorage()));

  it('hides an owned torch: no Light slot on any replica, nothing fitted even after a saved pick, no light in the kit', () => {
    const save = newCollection(GAME_POOL, 1);
    expect(save.owned[itemKey(TORCH.asset, TORCH.tier)]).toBe(1); // every save owns it (a starter)
    const dev = { on: false };
    const model = gameLoadout(save, dev);
    for (const r of [...LOADOUT, CYBER_PISTOL]) {
      const id = assetOfReplica(GAME_POOL, r)!.id;
      expect(model.hasSlot(id, 'light'), r.id).toBe(false);
      expect(model.fitChoices(id, 'light'), r.id).toEqual([]);
      expect(model.fitOf(id).light, r.id).toBeNull();
    }
    // A pick saved while Dev content was on is kept, not played: it comes back when Dev content is on again.
    const rifle = model.equipped()[0]!.asset;
    model.setFit(rifle, 'light', TORCH);
    expect(model.fitOf(rifle).light).toBeNull();
    expect(holdsTorch(equippedItems(model))).toBe(false);
    expect(model.kit().slots.every((s) => s.parts.light === null)).toBe(true);
    dev.on = true;
    expect(model.fitOf(rifle).light).toEqual(TORCH);
    expect(model.kit().slots[0]!.parts.light).toBe('weaponTorch');
  });

  it('plays a dev map as Depot, so a Woodland pick with Dev content off counts and pays like Depot', () => {
    for (const d of DIFFICULTIES.map((x) => x.id)) {
      const played = playedPicks(picks('woodland', d), false);
      expect(played.map).toBe('depot');
      expect(matchUsesDev(played, equippedItems(gameLoadout(newCollection(GAME_POOL, 2), { on: false })), GAME_POOL, false), d).toBe(false);
    }
  });

  it('counts and pays a Depot match at every difficulty, as before the torch', () => {
    const model = gameLoadout(newCollection(GAME_POOL, 3), { on: false });
    // Every level as it plays with Dev content off (a Pro pick plays as the default).
    for (const d of DIFFICULTIES.map((x) => x.id)) {
      expect(matchUsesDev(playedPicks(picks('depot', d), false), equippedItems(model), GAME_POOL, false), d).toBe(false);
      expect(botsMayCarryDev(GAME_POOL, false, d), d).toBe(false);
    }
  });
});

describe('Dev content on: Depot by day still counts and pays (M33h acceptance 1, fork "what counts as dev")', () => {
  beforeEach(() => vi.stubGlobal('localStorage', new MemoryStorage()));

  it("fits the starter torch by default, yet Depot by day counts and pays at every difficulty, kits that roll included", () => {
    const model = gameLoadout(newCollection(GAME_POOL, 4), { on: true });
    const items = equippedItems(model);
    expect(holdsTorch(items)).toBe(true);
    // The torch is the only dev item in the pool and a light is never rolled, so a rolled kit (Hard, Pro) holds no dev gear.
    expect(rolledKitMayHoldDev(GAME_POOL, LOADOUT)).toBe(false);
    expect(LEVELS.some((d) => BOT_LOADOUTS[d] === 'random')).toBe(true);
    for (const d of LEVELS) {
      expect(botsMayCarryDev(GAME_POOL, true, d), d).toBe(false);
      expect(matchUsesDev(picks('depot', d), items, GAME_POOL, true), d).toBe(false);
      // With the torch taken off as well: the same.
      expect(matchUsesDev(picks('depot', d), items.filter((r) => r?.asset !== TORCH.asset), GAME_POOL, true), d).toBe(false);
    }
  });

  it('counts Woodland (a night field) as dev, whatever the kit', () => {
    const items = equippedItems(gameLoadout(newCollection(GAME_POOL, 5), { on: true }));
    for (const d of LEVELS) expect(matchUsesDev(picks('woodland', d), items, GAME_POOL, true), d).toBe(true);
  });

  it('keeps the light the last fit slot, so the slots before it draw as they did', () => {
    expect(FIT_SLOTS).toEqual(['optic', 'grip', 'laser', 'barrel', 'muzzle', 'magazine', 'power', 'light']);
  });
});
