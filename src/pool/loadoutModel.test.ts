import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AEG, GAS_PISTOL } from '../config/replicas';
import { type ItemRef, itemKey } from './collection';
import { GAME_POOL } from './gamePool';
import { LoadoutModel, type Ownership } from './loadoutModel';
import { MemoryStorage } from './testStorage';

const pool = GAME_POOL;
const id = (name: string) => pool.assets.find((a) => a.name === name)!.id;
const item = (name: string, tier = 'common'): ItemRef => ({ asset: id(name), tier });
const STARTERS = ['AEG Rifle', 'Gas Pistol', 'Standard Battery', 'Green Gas'].map((n) => item(n));

/** An ownership of exactly these items, which a test can change as it goes. */
function owning(items: ItemRef[]): Ownership & { items: Set<string> } {
  const set = new Set(items.map((r) => itemKey(r.asset, r.tier)));
  return { items: set, owns: (r) => set.has(itemKey(r.asset, r.tier)) };
}

describe('Loadout model (M26b)', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', new MemoryStorage());
  });

  it('starts a new player on the AEG Rifle and Gas Pistol with their starter power sources and nothing else fitted', () => {
    const model = new LoadoutModel(pool, owning(STARTERS));
    expect(model.equipped()).toEqual([item('AEG Rifle'), item('Gas Pistol')]);
    expect(model.fitOf(id('AEG Rifle'))).toEqual({ optic: null, grip: null, laser: null, magazine: null, power: item('Standard Battery') });
    expect(model.fitOf(id('Gas Pistol')).power).toEqual(item('Green Gas'));
    const kit = model.kit();
    expect(kit.slots.map((s) => s.replica.id)).toEqual([AEG.id, GAS_PISTOL.id]);
    expect(kit.hopUps).toEqual([AEG.hopUpDial, GAS_PISTOL.hopUpDial]);
    expect(kit.bbWeights).toEqual([AEG.bbWeight, GAS_PISTOL.bbWeight]);
  });

  it('lists owned copies rarest first and equips the best copy of each replica until the player picks', () => {
    const model = new LoadoutModel(pool, owning([...STARTERS, item('AEG Rifle', 'epic'), item('Gas Pistol', 'rare')]));
    expect(model.replicaChoices()).toEqual([item('Gas Pistol', 'rare'), item('Gas Pistol'), item('AEG Rifle', 'epic'), item('AEG Rifle')]);
    expect(model.equipped()).toEqual([item('AEG Rifle', 'epic'), item('Gas Pistol', 'rare')]);
    model.equip('primary', item('AEG Rifle'));
    expect(model.equipped()[0]).toEqual(item('AEG Rifle'));
  });

  it('puts any replica in either slot, swapping rather than carrying one replica twice', () => {
    const model = new LoadoutModel(pool, owning(STARTERS));
    model.equip('primary', item('Gas Pistol'));
    expect(model.equipped()).toEqual([item('Gas Pistol'), item('AEG Rifle')]);
    expect(model.kit().slots.map((s) => s.replica.id)).toEqual([GAS_PISTOL.id, AEG.id]);
  });

  it('falls back to a default for a saved replica or part the player no longer owns', () => {
    const own = owning([...STARTERS, item('AEG Rifle', 'legendary'), item('Red Dot', 'rare')]);
    const model = new LoadoutModel(pool, own);
    model.equip('primary', item('AEG Rifle', 'legendary'));
    model.setFit(id('AEG Rifle'), 'optic', item('Red Dot', 'rare'));
    expect(model.fitOf(id('AEG Rifle')).optic).toEqual(item('Red Dot', 'rare'));
    own.items.delete(itemKey(id('AEG Rifle'), 'legendary'));
    own.items.delete(itemKey(id('Red Dot'), 'rare'));
    expect(model.equipped()[0]).toEqual(item('AEG Rifle'));
    expect(model.fitOf(id('AEG Rifle')).optic).toBeNull();
  });

  it("offers only owned items that fit the replica's tags, and knows which slots a replica has at all", () => {
    const model = new LoadoutModel(pool, owning([...STARTERS, item('Red Dot'), item('Red Laser'), item('Black Gas', 'epic'), item('Extended Magazine')]));
    expect(model.fitChoices(id('AEG Rifle'), 'optic')).toEqual([item('Red Dot')]);
    expect(model.fitChoices(id('Gas Pistol'), 'optic')).toEqual([]);
    expect(model.fitChoices(id('Gas Pistol'), 'power')).toEqual([item('Green Gas'), item('Black Gas', 'epic')]);
    expect(model.fitChoices(id('AEG Rifle'), 'power')).toEqual([item('Standard Battery')]);
    expect(model.fitChoices(id('Gas Pistol'), 'magazine')).toEqual([item('Extended Magazine')]);
    expect(model.hasSlot(id('Gas Pistol'), 'optic')).toBe(false);
    expect(model.hasSlot(id('Gas Pistol'), 'laser')).toBe(true);
    expect(model.hasSlot(id('AEG Rifle'), 'laser')).toBe(false);
    expect(model.hasSlot(id('AEG Rifle'), 'grip')).toBe(true);
  });

  it('never fits something that does not fit, even if saved by hand, and never leaves the power slot empty', () => {
    const model = new LoadoutModel(pool, owning([...STARTERS, item('Red Laser'), item('Black Gas')]));
    model.setFit(id('AEG Rifle'), 'laser', item('Red Laser'));
    model.setFit(id('AEG Rifle'), 'power', item('Black Gas'));
    expect(model.fitOf(id('AEG Rifle')).laser).toBeNull();
    expect(model.fitOf(id('AEG Rifle')).power).toEqual(item('Standard Battery'));
    model.setFit(id('Gas Pistol'), 'power', null);
    expect(model.fitOf(id('Gas Pistol')).power).toEqual(item('Green Gas'));
    model.setFit(id('Gas Pistol'), 'power', item('Black Gas'));
    expect(model.kit().slots[1]!.replica.muzzleEnergy).toBeCloseTo(GAS_PISTOL.muzzleEnergy * 1.2);
  });

  it('keeps each replica its own BB weight (any 0.01 g step from 0.20 to 0.30 g) and hop-up dial', () => {
    const model = new LoadoutModel(pool, owning(STARTERS));
    model.setBbWeight(AEG, 0.3);
    model.setBbWeight(GAS_PISTOL, 0.305); // between steps: ignored
    model.setHopUp(GAS_PISTOL, 0.4);
    expect(model.kit().bbWeights).toEqual([0.3, GAS_PISTOL.bbWeight]);
    expect(model.kit().hopUps).toEqual([AEG.hopUpDial, 0.4]);
  });

  it('carries nothing in a slot it owns no replica for', () => {
    const model = new LoadoutModel(pool, owning([item('Gas Pistol')]));
    expect(model.equipped()).toEqual([item('Gas Pistol'), null]);
    expect(model.kit().slots).toHaveLength(1);
  });
});
