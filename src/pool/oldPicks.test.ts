import { beforeEach, describe, expect, it, vi } from 'vitest';
import { saveSetting } from '../settings/storage';
import { addItem, type ItemRef, newCollection, ownedCount } from './collection';
import { GAME_POOL } from './gamePool';
import { collectionOwnership, LoadoutModel } from './loadoutModel';
import { carryOverOldPicks } from './oldPicks';
import { MemoryStorage } from './testStorage';

const pool = GAME_POOL;
const id = (name: string) => pool.assets.find((a) => a.name === name)!.id;
const item = (name: string, tier = 'common'): ItemRef => ({ asset: id(name), tier });

describe("a returning player's M17b picks (M26b)", () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', new MemoryStorage());
  });

  it('are given to them and fitted where they were, once', () => {
    saveSetting('optic', 'scope2x');
    saveSetting('grip.aeg', 'angled');
    saveSetting('mag.aeg', 'standard'); // as it comes: nothing to give
    saveSetting('mag.pistol', 'extended');
    const c = newCollection(pool, 1);
    addItem(c, item('Angled Grip', 'epic')); // already owned: fitted, not given again
    const model = new LoadoutModel(pool, collectionOwnership(() => c));
    expect(carryOverOldPicks(model, c)).toBe(true);
    expect(ownedCount(c, item('2x Scope'))).toBe(1);
    expect(ownedCount(c, item('Angled Grip'))).toBe(0);
    expect(ownedCount(c, item('Extended Magazine'))).toBe(1);
    expect(model.fitOf(id('AEG Rifle'))).toMatchObject({ optic: item('2x Scope'), grip: item('Angled Grip', 'epic'), magazine: null });
    expect(model.fitOf(id('Gas Pistol')).magazine).toEqual(item('Extended Magazine'));
    // Never again, even if the player later scraps or changes them.
    model.setFit(id('AEG Rifle'), 'optic', null);
    expect(carryOverOldPicks(model, c)).toBe(false);
    expect(model.fitOf(id('AEG Rifle')).optic).toBeNull();
  });

  it('leave a new player as they are', () => {
    const c = newCollection(pool, 1);
    const before = JSON.stringify(c);
    expect(carryOverOldPicks(new LoadoutModel(pool, collectionOwnership(() => c)), c)).toBe(false);
    expect(JSON.stringify(c)).toBe(before);
  });
});
