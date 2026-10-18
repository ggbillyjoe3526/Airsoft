import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { DIFFICULTIES, type Difficulty } from '../config/bots';
import { DEFAULT_MATCH_RULES, DEFAULT_RULESET } from '../config/matchRules';
import { DEFAULT_MODE } from '../config/modes';
import { CYBER_PISTOL, LOADOUT } from '../config/replicas';
import type { MapId } from '../map/maps';
import { botsMayCarryDev, matchUsesDev, type NewGamePicks, playedPicks } from '../newGamePicks';
import { kitsMayHoldDev } from './botKit';
import { GAME_BOT_KITS } from './gameBotKits';
import { GAME_POOL } from './gamePool';
import type { ItemRef } from './item';
import { FIT_SLOTS } from './kit';
import { gameOwnership, LoadoutModel } from './loadoutModel';
import { assetOfReplica } from './pool';
import { MemoryStorage } from './testStorage';
import { GAME_LEVELS } from '../progress/gameLevels';
import { newProgress, type Progress } from '../progress/progress';

/**
 * M33h QA, acceptance 1: the Weapon Torch as the game itself wires it (playSetup.ts: LoadoutModel over the whole GAME_POOL
 * with gameOwnership, and matchUsesDev over the Loadout's equipped items). With Dev content off a save that has the
 * torch (level 0, given to every save) has no Light slot, no torch in its kit and Depot counts and gives XP at every
 * difficulty; with Dev content on, Depot by day still counts and gives XP, torch fitted or not, at every difficulty.
 */

// Test files share a worker (isolate: false): the stand-in storage goes with this file.
afterAll(() => vi.unstubAllGlobals());

const TORCH: ItemRef = { asset: '000020' };
/** The public levels (Pro is dev content itself, M38); each picks its opponents' kits from bot-kits.md (BG1). */
const LEVELS = DIFFICULTIES.filter((d) => d.tag === 'public').map((d) => d.id);
const picks = (map: MapId, difficulty: Difficulty): NewGamePicks => ({ map, mode: DEFAULT_MODE, difficulty, teammateDifficulty: difficulty, ruleset: DEFAULT_RULESET, rules: { ...DEFAULT_MATCH_RULES } });

/** The game's Loadout (playSetup.ts): the whole pool, owned through gameOwnership (the player's levels) with the Dev content switch. */
function gameLoadout(progress: Progress, dev: { on: boolean }): LoadoutModel {
  const unlocks = { unlocked: () => progress.unlocked, levelOf: (id: string) => GAME_LEVELS.unlockLevel.get(id) };
  return new LoadoutModel(GAME_POOL, gameOwnership(GAME_POOL, unlocks, () => false, () => dev.on));
}

/** playSetup.ts equippedItems: each gear slot's replica and everything fitted to it. */
const equippedItems = (m: LoadoutModel): (ItemRef | null)[] => m.equipped().flatMap((r) => (r ? [r, ...Object.values(m.fitOf(r.asset))] : []));
const holdsTorch = (items: readonly (ItemRef | null)[]): boolean => items.some((r) => r?.asset === TORCH.asset);

describe('Dev content off: no Light slot, no torch, Depot counts and gives XP (M33h acceptance 1)', () => {
  beforeEach(() => vi.stubGlobal('localStorage', new MemoryStorage()));

  it('hides an unlocked torch: no Light slot on any replica, nothing fitted even after a saved pick, no light in the kit', () => {
    const save = newProgress(GAME_LEVELS);
    expect(save.unlocked).toContain(TORCH.asset); // every save has it (level 0)
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

  it('plays a dev map as Depot, so a Woodland pick with Dev content off counts and gives XP like Depot', () => {
    for (const d of DIFFICULTIES.map((x) => x.id)) {
      const played = playedPicks(picks('woodland', d), false);
      expect(played.map).toBe('depot');
      expect(matchUsesDev(played, equippedItems(gameLoadout(newProgress(GAME_LEVELS), { on: false })), GAME_POOL, false), d).toBe(false);
    }
  });

  it('counts and gives XP a Depot match at every difficulty, as before the torch', () => {
    const model = gameLoadout(newProgress(GAME_LEVELS), { on: false });
    // Every level as it plays with Dev content off (a Pro pick plays as the default).
    for (const d of DIFFICULTIES.map((x) => x.id)) {
      expect(matchUsesDev(playedPicks(picks('depot', d), false), equippedItems(model), GAME_POOL, false), d).toBe(false);
      expect(botsMayCarryDev(GAME_POOL, false, d), d).toBe(false);
    }
  });
});

describe('Dev content on: Depot by day still counts and gives XP (M33h acceptance 1, fork "what counts as dev")', () => {
  beforeEach(() => vi.stubGlobal('localStorage', new MemoryStorage()));

  it("fits the level 0 torch by default, yet Depot by day counts and gives XP at every difficulty, the bots' kits included", () => {
    const model = gameLoadout(newProgress(GAME_LEVELS), { on: true });
    const items = equippedItems(model);
    expect(holdsTorch(items)).toBe(true);
    // The torch is the only dev item in the pool and a light is never part of a kit, so no bot kit holds dev gear.
    for (const d of LEVELS) {
      expect(kitsMayHoldDev(GAME_BOT_KITS, d, GAME_POOL), d).toBe(false);
      expect(botsMayCarryDev(GAME_POOL, true, d), d).toBe(false);
      expect(matchUsesDev(picks('depot', d), items, GAME_POOL, true), d).toBe(false);
      // With the torch taken off as well: the same.
      expect(matchUsesDev(picks('depot', d), items.filter((r) => r?.asset !== TORCH.asset), GAME_POOL, true), d).toBe(false);
    }
  });

  it('counts Woodland (a night field) as dev, whatever the kit', () => {
    const items = equippedItems(gameLoadout(newProgress(GAME_LEVELS), { on: true }));
    for (const d of LEVELS) expect(matchUsesDev(picks('woodland', d), items, GAME_POOL, true), d).toBe(true);
  });

  it('keeps the light the last fit slot, so the slots before it draw as they did', () => {
    expect(FIT_SLOTS).toEqual(['optic', 'grip', 'laser', 'barrel', 'muzzle', 'magazine', 'power', 'light']);
  });
});
