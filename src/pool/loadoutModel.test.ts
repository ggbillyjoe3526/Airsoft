import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GAME_STATS } from '../config/gameStats';
import { AEG, GAS_PISTOL } from '../config/replicas';
import { type ItemRef, itemKey } from './collection';
import { GAME_POOL } from './gamePool';
import { gameOwnership, LoadoutModel, type Ownership } from './loadoutModel';
import { EMPTY_FIT } from './kit';
import { newCollection } from './collection';
import { MemoryStorage } from './testStorage';
import { saveSetting } from '../settings/storage';

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
    expect(model.fitOf(id('AEG Rifle'))).toEqual({ ...EMPTY_FIT, power: item('Standard Battery') });
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
    model.setBbWeight(id('AEG Rifle'), 0.3);
    model.setBbWeight(id('Gas Pistol'), 0.305); // between steps: ignored
    model.setHopUp(id('Gas Pistol'), 0.4);
    expect(model.kit().bbWeights).toEqual([0.3, GAS_PISTOL.bbWeight]);
    expect(model.kit().hopUps).toEqual([AEG.hopUpDial, 0.4]);
  });

  it('carries nothing in a slot it owns no replica for', () => {
    const model = new LoadoutModel(pool, owning([item('Gas Pistol')]));
    expect(model.equipped()).toEqual([item('Gas Pistol'), null]);
    expect(model.kit().slots).toHaveLength(1);
  });

  it('offers every asset at every tier while Dev settings → Unlock all gear is on, and only the collection after (M26d)', () => {
    let unlocked = true;
    const c = newCollection(pool, 1);
    const model = new LoadoutModel(pool, gameOwnership(pool, () => c, () => unlocked));
    expect(model.fitChoices(id('AEG Rifle'), 'optic')).toHaveLength(2 * pool.tiers.length);
    expect(model.equipped()[0]).toEqual(item('AEG Rifle', 'legendary'));
    expect(c.owned).toEqual(newCollection(pool, 1).owned); // the collection itself is untouched
    unlocked = false;
    expect(model.fitChoices(id('AEG Rifle'), 'optic')).toEqual([]);
    expect(model.equipped()[0]).toEqual(item('AEG Rifle'));
  });

  it('keeps picks made with everything unlocked apart, so turning it off brings back the real loadout (M26d)', () => {
    let unlocked = false;
    const c = newCollection(pool, 1);
    c.owned[itemKey(id('Red Dot'), 'common')] = 1;
    const model = new LoadoutModel(pool, gameOwnership(pool, () => c, () => unlocked));
    const aeg = id('AEG Rifle');
    model.setFit(aeg, 'optic', item('Red Dot'));
    unlocked = true;
    expect(model.fitOf(aeg).optic).toEqual(item('Red Dot')); // starts from the real picks
    model.equip('primary', item('AEG Rifle', 'legendary'));
    model.setFit(aeg, 'optic', item('2x Scope', 'legendary'));
    expect(model.fitOf(aeg).optic).toEqual(item('2x Scope', 'legendary'));
    unlocked = false;
    expect(model.equipped()[0]).toEqual(item('AEG Rifle'));
    expect(model.fitOf(aeg).optic).toEqual(item('Red Dot'));
    unlocked = true; // and the sandboxed picks are still there next time
    expect(model.fitOf(aeg).optic).toEqual(item('2x Scope', 'legendary'));
  });

  describe('the replica as it comes and the site limit (M29)', () => {
    const ALL = [...STARTERS, item('AEG Rifle', 'legendary'), item('Gas Pistol', 'legendary'), item('Black Gas', 'legendary'), item('11.1 V LiPo Battery'), item('Red Dot', 'legendary'), item('Red Laser', 'legendary'), item('Hi-Cap Magazine')];

    it('builds asItComes at the lowest tier on the starter power source, whatever the player owns, equips or fits', () => {
      const model = new LoadoutModel(pool, owning(ALL));
      model.equip('primary', item('AEG Rifle', 'legendary'));
      model.setFit(id('AEG Rifle'), 'power', item('11.1 V LiPo Battery'));
      model.setFit(id('AEG Rifle'), 'optic', item('Red Dot', 'legendary'));
      model.setFit(id('AEG Rifle'), 'magazine', item('Hi-Cap Magazine'));
      model.setFit(id('Gas Pistol'), 'power', item('Black Gas', 'legendary'));
      const aeg = model.asItComes(id('AEG Rifle'));
      expect(aeg.replica).toEqual({ ...AEG, name: 'AEG Rifle' });
      expect(aeg.optic).toBeNull();
      expect(aeg.parts.grip).toBe('none');
      expect(aeg.parts.laser).toBeNull();
      expect(aeg.parts.magazine).toBe(AEG.magazines[0]);
      // The player's own slot is better than it comes; the factory one is untouched by the picks.
      const carried = model.slotKit(item('AEG Rifle', 'legendary'));
      expect(carried.replica.fireRate).toBeGreaterThan(aeg.replica.fireRate);
      expect(carried.replica.spreadDeg).toBeLessThan(aeg.replica.spreadDeg);
      const pistol = model.asItComes(id('Gas Pistol'));
      expect(pistol.replica).toEqual({ ...GAS_PISTOL, name: 'Gas Pistol' });
      expect(model.slotKit(item('Gas Pistol')).replica.muzzleEnergy).toBeGreaterThan(pistol.replica.muzzleEnergy);
    });

    it("is the same slot the bots carry: the shared config's numbers", () => {
      const model = new LoadoutModel(pool, owning(STARTERS));
      expect(model.asItComes(id('AEG Rifle')).replica.muzzleEnergy).toBe(AEG.muzzleEnergy);
      expect(model.asItComes(id('Gas Pistol')).replica.fireRate).toBe(GAS_PISTOL.fireRate);
    });

    it('says capped only when the site limit stops the energy of that replica with its current fit', () => {
      const model = new LoadoutModel(pool, owning(ALL));
      const legendaryPistol = item('Gas Pistol', 'legendary');
      model.setFit(id('Gas Pistol'), 'power', item('Black Gas', 'legendary'));
      expect(model.capped(legendaryPistol)).toBe(false); // 0.52 J · 1.075 · 1.275 is under 1.00 J as shipped
      const black = GAME_STATS.power[id('Black Gas')]!;
      const saved = { ...black };
      try {
        Object.assign(black, { energy: 2 }); // a looser file: the same fit now runs past the limit
        expect(model.capped(legendaryPistol)).toBe(true);
        expect(model.capped(item('Gas Pistol'))).toBe(true);
        model.setFit(id('Gas Pistol'), 'power', item('Green Gas'));
        expect(model.capped(legendaryPistol)).toBe(false); // the fit decides, not the replica
      } finally {
        Object.assign(black, saved);
      }
    });
  });
});

describe('Loadout model: barrels and muzzle parts (M29b)', () => {
  const PARTS = [...STARTERS, item('Tight-Bore Barrel'), item('Long Barrel', 'epic'), item('Silencer', 'rare')];

  it('gives the AEG both rows and the Gas Pistol a muzzle only: its barrel is fixed', () => {
    const model = new LoadoutModel(pool, owning(STARTERS));
    expect(model.hasSlot(id('AEG Rifle'), 'barrel')).toBe(true);
    expect(model.hasSlot(id('AEG Rifle'), 'muzzle')).toBe(true);
    expect(model.hasSlot(id('Gas Pistol'), 'barrel')).toBe(false);
    expect(model.hasSlot(id('Gas Pistol'), 'muzzle')).toBe(true);
  });

  it('offers only the barrels and silencer the player owns (none from the start), and the pistol only the silencer', () => {
    expect(new LoadoutModel(pool, owning(STARTERS)).fitChoices(id('AEG Rifle'), 'barrel')).toEqual([]);
    expect(new LoadoutModel(pool, owning(STARTERS)).fitChoices(id('AEG Rifle'), 'muzzle')).toEqual([]);
    const model = new LoadoutModel(pool, owning(PARTS));
    expect(model.fitChoices(id('AEG Rifle'), 'barrel').map((r) => r.asset).sort()).toEqual([id('Tight-Bore Barrel'), id('Long Barrel')].sort());
    expect(model.fitChoices(id('AEG Rifle'), 'muzzle')).toEqual([item('Silencer', 'rare')]);
    expect(model.fitChoices(id('Gas Pistol'), 'barrel')).toEqual([]);
    expect(model.fitChoices(id('Gas Pistol'), 'muzzle')).toEqual([item('Silencer', 'rare')]);
  });

  it('carries the fitted barrel and silencer into the kit, and refuses a barrel on the pistol even if saved by hand', () => {
    const model = new LoadoutModel(pool, owning(PARTS));
    model.setFit(id('AEG Rifle'), 'barrel', item('Long Barrel', 'epic'));
    model.setFit(id('AEG Rifle'), 'muzzle', item('Silencer', 'rare'));
    model.setFit(id('Gas Pistol'), 'barrel', item('Tight-Bore Barrel'));
    model.setFit(id('Gas Pistol'), 'muzzle', item('Silencer', 'rare'));
    const [rifle, pistol] = model.kit().slots;
    expect([rifle!.parts.barrel, rifle!.parts.muzzle]).toEqual(['long', 'silencer']);
    expect([pistol!.parts.barrel, pistol!.parts.muzzle]).toEqual([null, 'silencer']);
    expect(model.fitOf(id('Gas Pistol')).barrel).toBeNull();
    // Falls back to nothing fitted when the part is no longer owned.
    const own = owning(PARTS);
    const m2 = new LoadoutModel(pool, own);
    m2.setFit(id('AEG Rifle'), 'muzzle', item('Silencer', 'rare'));
    own.items.delete(itemKey(id('Silencer'), 'rare'));
    expect(m2.fitOf(id('AEG Rifle')).muzzle).toBeNull();
  });

  it('offers every barrel and muzzle part at every tier with Unlock all gear, and none of them after', () => {
    let unlocked = true;
    const model = new LoadoutModel(pool, gameOwnership(pool, () => newCollection(pool, 1), () => unlocked));
    expect(model.fitChoices(id('AEG Rifle'), 'barrel')).toHaveLength(2 * pool.tiers.length);
    expect(model.fitChoices(id('AEG Rifle'), 'muzzle')).toHaveLength(pool.tiers.length);
    expect(model.fitChoices(id('Gas Pistol'), 'muzzle')).toHaveLength(pool.tiers.length);
    expect(model.fitChoices(id('Gas Pistol'), 'barrel')).toEqual([]);
    unlocked = false;
    expect(model.fitChoices(id('AEG Rifle'), 'barrel')).toEqual([]);
  });

  it('keys the dials by replica asset, reads a dial saved by config id before, and sandboxes them under Unlock all gear (audit POOL-17)', () => {
    saveSetting('hopUp.aeg', 0.7);
    let unlocked = false;
    const model = new LoadoutModel(pool, gameOwnership(pool, () => newCollection(pool, 1), () => unlocked));
    expect(model.hopUp(id('AEG Rifle'))).toBe(0.7);
    expect(model.dialField('hopUp', id('AEG Rifle'))).toBe(`hopUp.${id('AEG Rifle')}`);
    model.setHopUp(id('AEG Rifle'), 0.5);
    unlocked = true;
    expect(model.dialField('hopUp', id('AEG Rifle'))).toBe(`hopUp.dev.${id('AEG Rifle')}`);
    expect(model.hopUp(id('AEG Rifle'))).toBe(0.5);
    model.setHopUp(id('AEG Rifle'), 0.9);
    model.setBbWeight(id('AEG Rifle'), 0.3);
    expect(model.kit().hopUps[0]).toBe(0.9);
    unlocked = false;
    expect(model.hopUp(id('AEG Rifle'))).toBe(0.5);
    expect(model.bbWeight(id('AEG Rifle'))).toBe(AEG.bbWeight);
  });

  it('moves a pick to the best copy left of the same item when the picked copy is scrapped (audit POOL-05)', () => {
    const own = owning([...STARTERS, item('AEG Rifle', 'rare'), item('Red Dot'), item('Red Dot', 'epic')]);
    const model = new LoadoutModel(pool, own);
    model.equip('primary', item('AEG Rifle'));
    model.setFit(id('AEG Rifle'), 'optic', item('Red Dot'));
    // The Common AEG and the Common Red Dot scrapped: the rarer copies take their places, not the defaults.
    own.items.delete(itemKey(id('AEG Rifle'), 'common'));
    own.items.delete(itemKey(id('Red Dot'), 'common'));
    expect(model.equipped()[0]).toEqual(item('AEG Rifle', 'rare'));
    expect(model.fitOf(id('AEG Rifle')).optic).toEqual(item('Red Dot', 'epic'));
  });
});
