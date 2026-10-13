import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { GAME_STATS } from '../config/gameStats';
import { AEG, CYBER_PISTOL, GAS_PISTOL } from '../config/replicas';
import type { ItemRef } from './item';
import { GAME_POOL } from './gamePool';
import { bbGlowFor, gameOwnership, kitPaint, LoadoutModel, type Ownership, type Unlocks, unlockedOwnership } from './loadoutModel';
import { EMPTY_FIT, FIT_SLOTS } from './kit';
import { MemoryStorage } from './testStorage';
import { saveSetting } from '../settings/storage';
import { withTags } from './testSupport';
import { GAME_LEVELS } from '../progress/gameLevels';
import { unlocksUpTo } from '../progress/levels';

const pool = GAME_POOL;
const id = (name: string) => pool.assets.find((a) => a.name === name)!.id;
const item = (name: string): ItemRef => ({ asset: id(name) });
const STARTERS = ['AEG Rifle', 'GBB Pistol', 'Standard Battery', 'Green Gas'].map((n) => item(n));

/** An ownership of exactly these items, which a test can change as it goes. */
function owning(items: ItemRef[]): Ownership & { items: Set<string> } {
  const set = new Set(items.map((r) => r.asset));
  return { items: set, owns: (r) => set.has(r.asset) };
}

/** A player's levels (LV1): level 0's kit plus the given items, levels.md placing each item; a test can add to `ids`. */
function unlocks(...items: ItemRef[]): Unlocks & { ids: string[] } {
  const ids = [...unlocksUpTo(GAME_LEVELS, 0), ...items.map((r) => r.asset)];
  return { ids, unlocked: () => ids, levelOf: (asset) => GAME_LEVELS.unlockLevel.get(asset) };
}

// Test files share a worker (isolate: false): the stand-in storage goes with this file.
afterAll(() => vi.unstubAllGlobals());

describe('Loadout model (M26b)', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', new MemoryStorage());
  });

  it('starts a new player on the AEG Rifle and GBB Pistol with their starter power sources and nothing else fitted', () => {
    const model = new LoadoutModel(pool, owning(STARTERS));
    expect(model.equipped()).toEqual([item('AEG Rifle'), item('GBB Pistol')]);
    expect(model.fitOf(id('AEG Rifle'))).toEqual({ ...EMPTY_FIT, power: item('Standard Battery') });
    expect(model.fitOf(id('GBB Pistol')).power).toEqual(item('Green Gas'));
    const kit = model.kit();
    expect(kit.slots.map((s) => s.replica.id)).toEqual([AEG.id, GAS_PISTOL.id]);
    expect(kit.hopUps).toEqual([AEG.hopUpDial, GAS_PISTOL.hopUpDial]);
    expect(kit.bbWeights).toEqual([AEG.bbWeight, GAS_PISTOL.bbWeight]);
  });

  it('lists the unlocked replicas in pool order and equips the rifle and pistol until the player picks', () => {
    const model = new LoadoutModel(pool, owning([...STARTERS, item('Cyber Pistol')]));
    expect(model.replicaChoices()).toEqual([item('GBB Pistol'), item('AEG Rifle'), item('Cyber Pistol')]);
    expect(model.equipped()).toEqual([item('AEG Rifle'), item('GBB Pistol')]);
    model.equip('primary', item('Cyber Pistol'));
    expect(model.equipped()).toEqual([item('Cyber Pistol'), item('GBB Pistol')]);
  });

  it('puts any replica in either slot, swapping rather than carrying one replica twice', () => {
    const model = new LoadoutModel(pool, owning(STARTERS));
    model.equip('primary', item('GBB Pistol'));
    expect(model.equipped()).toEqual([item('GBB Pistol'), item('AEG Rifle')]);
    expect(model.kit().slots.map((s) => s.replica.id)).toEqual([GAS_PISTOL.id, AEG.id]);
  });

  it('falls back to a default for a saved replica or part the player no longer owns', () => {
    const own = owning([...STARTERS, item('Cyber Pistol'), item('Red Dot')]);
    const model = new LoadoutModel(pool, own);
    model.equip('primary', item('Cyber Pistol'));
    model.setFit(id('AEG Rifle'), 'optic', item('Red Dot'));
    expect(model.fitOf(id('AEG Rifle')).optic).toEqual(item('Red Dot'));
    own.items.delete(id('Cyber Pistol'));
    own.items.delete(id('Red Dot'));
    expect(model.equipped()[0]).toEqual(item('AEG Rifle'));
    expect(model.fitOf(id('AEG Rifle')).optic).toBeNull();
  });

  it("offers only owned items that fit the replica's tags, and knows which slots a replica has at all", () => {
    const model = new LoadoutModel(pool, owning([...STARTERS, item('Red Dot'), item('Red Laser'), item('Black Gas'), item('Extended Magazine')]));
    expect(model.fitChoices(id('AEG Rifle'), 'optic')).toEqual([item('Red Dot')]);
    expect(model.fitChoices(id('GBB Pistol'), 'optic')).toEqual([]);
    expect(model.fitChoices(id('GBB Pistol'), 'power')).toEqual([item('Green Gas'), item('Black Gas')]);
    expect(model.fitChoices(id('AEG Rifle'), 'power')).toEqual([item('Standard Battery')]);
    expect(model.fitChoices(id('GBB Pistol'), 'magazine')).toEqual([item('Extended Magazine')]);
    expect(model.hasSlot(id('GBB Pistol'), 'optic')).toBe(false);
    expect(model.hasSlot(id('GBB Pistol'), 'laser')).toBe(true);
    expect(model.hasSlot(id('AEG Rifle'), 'laser')).toBe(false);
    expect(model.hasSlot(id('AEG Rifle'), 'grip')).toBe(true);
  });

  it('never fits something that does not fit, even if saved by hand, and never leaves the power slot empty', () => {
    const model = new LoadoutModel(pool, owning([...STARTERS, item('Red Laser'), item('Black Gas')]));
    model.setFit(id('AEG Rifle'), 'laser', item('Red Laser'));
    model.setFit(id('AEG Rifle'), 'power', item('Black Gas'));
    expect(model.fitOf(id('AEG Rifle')).laser).toBeNull();
    expect(model.fitOf(id('AEG Rifle')).power).toEqual(item('Standard Battery'));
    model.setFit(id('GBB Pistol'), 'power', null);
    expect(model.fitOf(id('GBB Pistol')).power).toEqual(item('Green Gas'));
    model.setFit(id('GBB Pistol'), 'power', item('Black Gas'));
    expect(model.kit().slots[1]!.replica.muzzleEnergy).toBeCloseTo(GAS_PISTOL.muzzleEnergy * 1.2);
  });

  it('keeps each replica its own BB weight (any 0.01 g step from 0.20 to 0.30 g) and hop-up dial', () => {
    const model = new LoadoutModel(pool, owning(STARTERS));
    model.setBbWeight(id('AEG Rifle'), 0.3);
    model.setBbWeight(id('GBB Pistol'), 0.305); // between steps: ignored
    model.setHopUp(id('GBB Pistol'), 0.4);
    expect(model.kit().bbWeights).toEqual([0.3, GAS_PISTOL.bbWeight]);
    expect(model.kit().hopUps).toEqual([AEG.hopUpDial, 0.4]);
  });

  describe('Colour schemes (G1)', () => {
    it('starts the rifle Cobalt and the pistol Ghost, and keeps each replica its own pick in the kit', () => {
      const model = new LoadoutModel(pool, owning(STARTERS));
      expect(model.kit().schemes).toEqual(['cobalt', 'ghost']);
      model.setScheme(id('GBB Pistol'), 'hazard');
      expect(model.scheme(id('GBB Pistol'))).toBe('hazard');
      expect(model.scheme(id('AEG Rifle'))).toBe('cobalt');
      model.equip('primary', item('GBB Pistol'));
      expect(model.kit().schemes).toEqual(['hazard', 'cobalt']);
    });

    it('saves the pick by replica asset id, and an older save without it (or with a stranger value) reads the default', () => {
      const model = new LoadoutModel(pool, owning(STARTERS));
      model.setScheme(id('AEG Rifle'), 'teal');
      const stored = JSON.parse(localStorage.getItem('airsoft.settings')!) as Record<string, unknown>;
      expect(stored[`scheme.${id('AEG Rifle')}`]).toBe('teal');
      // A version 1 object from before G1 (no scheme keys), and one holding a value this build doesn't know.
      localStorage.setItem('airsoft.settings', JSON.stringify({ version: 1, [`hopUp.${id('AEG Rifle')}`]: 0.5, [`scheme.${id('GBB Pistol')}`]: 'chrome' }));
      const later = new LoadoutModel(pool, owning(STARTERS));
      expect(later.kit().schemes).toEqual(['cobalt', 'ghost']);
      expect(later.hopUp(id('AEG Rifle'))).toBe(0.5);
    });

    it('keeps one pick per replica whether or not everything is unlocked (a colour is cosmetic)', () => {
      const dev = new LoadoutModel(pool, { ...owning(STARTERS), sandboxed: () => true });
      dev.setScheme(id('AEG Rifle'), 'acid');
      expect(new LoadoutModel(pool, owning(STARTERS)).scheme(id('AEG Rifle'))).toBe('acid');
    });

    it('paints the kit plain under Realistic colours (kitPaint)', () => {
      const kit = new LoadoutModel(pool, owning(STARTERS)).kit();
      expect(kitPaint(kit)).toEqual({ schemes: ['cobalt', 'ghost'], realistic: false });
      expect(kitPaint(kit, { robots: true, realisticColours: true })).toEqual({ schemes: ['cobalt', 'ghost'], realistic: true });
    });
  });

  describe('Glowing BBs (M33b)', () => {
    it('defaults every replica to At Night and keeps each replica its own choice', () => {
      const model = new LoadoutModel(pool, owning(STARTERS));
      expect(model.glowBBs(id('AEG Rifle'))).toBe('night');
      expect(model.glowBBs(id('GBB Pistol'))).toBe('night');
      model.setGlowBBs(id('AEG Rifle'), 'always');
      expect(model.glowBBs(id('AEG Rifle'))).toBe('always');
      expect(model.glowBBs(id('GBB Pistol'))).toBe('night');
      model.setGlowBBs(id('GBB Pistol'), 'off');
      expect(model.glowBBs(id('GBB Pistol'))).toBe('off');
      expect(model.glowBBs(id('AEG Rifle'))).toBe('always');
    });

    it('is saved by replica asset id, and kept apart while everything is unlocked (as FA10 keeps the dials)', () => {
      const model = new LoadoutModel(pool, owning(STARTERS));
      expect(model.glowField(id('AEG Rifle'))).toBe(`glowBBs.${id('AEG Rifle')}`);
      model.setGlowBBs(id('AEG Rifle'), 'always');
      let sandboxed = true;
      const dev = new LoadoutModel(pool, { ...owning(STARTERS), sandboxed: () => sandboxed });
      expect(dev.glowField(id('AEG Rifle'))).toBe(`glowBBs.dev.${id('AEG Rifle')}`);
      expect(dev.glowBBs(id('AEG Rifle'))).toBe('always');
      dev.setGlowBBs(id('AEG Rifle'), 'off');
      expect(dev.glowBBs(id('AEG Rifle'))).toBe('off');
      sandboxed = false;
      expect(dev.glowBBs(id('AEG Rifle'))).toBe('always');
    });

    it('is saved: a new model over the same storage reads the pick back', () => {
      new LoadoutModel(pool, owning(STARTERS)).setGlowBBs(id('AEG Rifle'), 'off');
      expect(new LoadoutModel(pool, owning(STARTERS)).glowBBs(id('AEG Rifle'))).toBe('off');
    });

    it('falls back to At Night for a stored value that is not a choice', () => {
      const model = new LoadoutModel(pool, owning(STARTERS));
      model.setGlowBBs(id('AEG Rifle'), 'always');
      const raw = JSON.parse(localStorage.getItem(localStorage.key(0)!)!);
      raw[`glowBBs.${id('AEG Rifle')}`] = 'sparkly';
      localStorage.setItem(localStorage.key(0)!, JSON.stringify(raw));
      expect(model.glowBBs(id('AEG Rifle'))).toBe('night');
    });

    it("puts each slot's choice in the kit, following the slots when they swap", () => {
      const model = new LoadoutModel(pool, owning(STARTERS));
      model.setGlowBBs(id('AEG Rifle'), 'always');
      model.setGlowBBs(id('GBB Pistol'), 'off');
      expect(model.kit().glowBBs).toEqual(['always', 'off']);
      model.equip('primary', item('GBB Pistol'));
      expect(model.kit().glowBBs).toEqual(['off', 'always']);
    });

    it('resolves the kit against the field: yours by slot, the bots the default way', () => {
      const model = new LoadoutModel(pool, owning(STARTERS));
      model.setGlowBBs(id('AEG Rifle'), 'always');
      model.setGlowBBs(id('GBB Pistol'), 'off');
      expect(bbGlowFor(model.kit(), false)).toEqual({ player: [true, false], others: false });
      expect(bbGlowFor(model.kit(), true)).toEqual({ player: [true, false], others: true });
      model.setGlowBBs(id('AEG Rifle'), 'night');
      model.setGlowBBs(id('GBB Pistol'), 'night');
      expect(bbGlowFor(model.kit(), true)).toEqual({ player: [true, true], others: true });
      expect(bbGlowFor(model.kit(), false)).toEqual({ player: [false, false], others: false });
    });
  });

  it('carries nothing in a slot it owns no replica for', () => {
    const model = new LoadoutModel(pool, owning([item('GBB Pistol')]));
    expect(model.equipped()).toEqual([item('GBB Pistol'), null]);
    expect(model.kit().slots).toHaveLength(1);
  });

  it('offers every asset while Dev settings → Disable levelling is on, and only what the levels unlocked after (M26d)', () => {
    let unlocked = true;
    const levels = unlocks();
    const before = [...levels.ids];
    const model = new LoadoutModel(pool, gameOwnership(pool, levels, () => unlocked));
    expect(model.fitChoices(id('AEG Rifle'), 'optic')).toEqual([item('Red Dot'), item('2x Scope')]);
    expect(model.replicaChoices()).toEqual([item('GBB Pistol'), item('AEG Rifle'), item('Cyber Pistol')]);
    expect(model.equipped()[0]).toEqual(item('AEG Rifle'));
    expect(levels.ids).toEqual(before); // the progress itself is untouched
    unlocked = false;
    expect(model.fitChoices(id('AEG Rifle'), 'optic')).toEqual([]);
    expect(model.replicaChoices()).toEqual([item('GBB Pistol'), item('AEG Rifle')]);
  });

  it('keeps picks made with everything unlocked apart, so turning it off brings back the real loadout (M26d)', () => {
    let unlocked = false;
    const model = new LoadoutModel(pool, gameOwnership(pool, unlocks(item('Red Dot')), () => unlocked));
    const aeg = id('AEG Rifle');
    model.setFit(aeg, 'optic', item('Red Dot'));
    unlocked = true;
    expect(model.fitOf(aeg).optic).toEqual(item('Red Dot')); // starts from the real picks
    model.equip('primary', item('Cyber Pistol'));
    model.setFit(aeg, 'optic', item('2x Scope'));
    expect(model.fitOf(aeg).optic).toEqual(item('2x Scope'));
    unlocked = false;
    expect(model.equipped()[0]).toEqual(item('AEG Rifle'));
    expect(model.fitOf(aeg).optic).toEqual(item('Red Dot'));
    unlocked = true; // and the sandboxed picks are still there next time
    expect(model.equipped()[0]).toEqual(item('Cyber Pistol'));
    expect(model.fitOf(aeg).optic).toEqual(item('2x Scope'));
  });

  describe('the replica as it comes and the site limit (M29)', () => {
    const ALL = [...STARTERS, item('Black Gas'), item('11.1 V LiPo Battery'), item('Red Dot'), item('Red Laser'), item('Hi-Cap Magazine'), item('Tight-Bore Barrel')];

    it('builds asItComes on the starter power source, whatever the player unlocked, equips or fits', () => {
      const model = new LoadoutModel(pool, owning(ALL));
      model.setFit(id('AEG Rifle'), 'power', item('11.1 V LiPo Battery'));
      model.setFit(id('AEG Rifle'), 'optic', item('Red Dot'));
      model.setFit(id('AEG Rifle'), 'magazine', item('Hi-Cap Magazine'));
      model.setFit(id('AEG Rifle'), 'barrel', item('Tight-Bore Barrel'));
      model.setFit(id('GBB Pistol'), 'power', item('Black Gas'));
      const aeg = model.asItComes(id('AEG Rifle'));
      expect(aeg.replica).toEqual({ ...AEG, name: 'AEG Rifle' });
      expect(aeg.optic).toBeNull();
      expect(aeg.parts.grip).toBe('none');
      expect(aeg.parts.laser).toBeNull();
      expect(aeg.parts.magazine).toBe(AEG.magazines[0]);
      // The player's own slot is better than it comes; the factory one is untouched by the picks.
      const carried = model.slotKit(item('AEG Rifle'));
      expect(carried.replica.fireRate).toBeGreaterThan(aeg.replica.fireRate);
      expect(carried.replica.spreadDeg).toBeLessThan(aeg.replica.spreadDeg);
      const pistol = model.asItComes(id('GBB Pistol'));
      expect(pistol.replica).toEqual({ ...GAS_PISTOL, name: 'GBB Pistol' });
      expect(model.slotKit(item('GBB Pistol')).replica.muzzleEnergy).toBeGreaterThan(pistol.replica.muzzleEnergy);
    });

    it("is the same slot the bots carry: the shared config's numbers", () => {
      const model = new LoadoutModel(pool, owning(STARTERS));
      expect(model.asItComes(id('AEG Rifle')).replica.muzzleEnergy).toBe(AEG.muzzleEnergy);
      expect(model.asItComes(id('GBB Pistol')).replica.fireRate).toBe(GAS_PISTOL.fireRate);
    });

    it('says capped only when the site limit stops the energy of that replica with its current fit', () => {
      const model = new LoadoutModel(pool, owning(ALL));
      const pistol = item('GBB Pistol');
      model.setFit(id('GBB Pistol'), 'power', item('Black Gas'));
      expect(model.capped(pistol)).toBe(false); // 0.52 J · 1.2 is under 1.00 J as shipped
      const black = GAME_STATS.power[id('Black Gas')]!;
      const saved = { ...black };
      try {
        Object.assign(black, { energy: 2 }); // a looser file: the same fit now runs past the limit
        expect(model.capped(pistol)).toBe(true);
        expect(model.capped(item('AEG Rifle'))).toBe(false);
        model.setFit(id('GBB Pistol'), 'power', item('Green Gas'));
        expect(model.capped(pistol)).toBe(false); // the fit decides, not the replica
      } finally {
        Object.assign(black, saved);
      }
    });
  });
});

describe('Loadout model: barrels and muzzle parts (M29b)', () => {
  const PARTS = [...STARTERS, item('Tight-Bore Barrel'), item('Long Barrel'), item('Silencer')];

  it('gives the AEG both rows and the GBB Pistol a muzzle only: its barrel is fixed', () => {
    const model = new LoadoutModel(pool, owning(STARTERS));
    expect(model.hasSlot(id('AEG Rifle'), 'barrel')).toBe(true);
    expect(model.hasSlot(id('AEG Rifle'), 'muzzle')).toBe(true);
    expect(model.hasSlot(id('GBB Pistol'), 'barrel')).toBe(false);
    expect(model.hasSlot(id('GBB Pistol'), 'muzzle')).toBe(true);
  });

  it('offers only the barrels and silencer the player unlocked (none from the start), and the pistol only the silencer', () => {
    expect(new LoadoutModel(pool, owning(STARTERS)).fitChoices(id('AEG Rifle'), 'barrel')).toEqual([]);
    expect(new LoadoutModel(pool, owning(STARTERS)).fitChoices(id('AEG Rifle'), 'muzzle')).toEqual([]);
    const model = new LoadoutModel(pool, owning(PARTS));
    expect(model.fitChoices(id('AEG Rifle'), 'barrel').map((r) => r.asset).sort()).toEqual([id('Tight-Bore Barrel'), id('Long Barrel')].sort());
    expect(model.fitChoices(id('AEG Rifle'), 'muzzle')).toEqual([item('Silencer')]);
    expect(model.fitChoices(id('GBB Pistol'), 'barrel')).toEqual([]);
    expect(model.fitChoices(id('GBB Pistol'), 'muzzle')).toEqual([item('Silencer')]);
  });

  it('carries the fitted barrel and silencer into the kit, and refuses a barrel on the pistol even if saved by hand', () => {
    const model = new LoadoutModel(pool, owning(PARTS));
    model.setFit(id('AEG Rifle'), 'barrel', item('Long Barrel'));
    model.setFit(id('AEG Rifle'), 'muzzle', item('Silencer'));
    model.setFit(id('GBB Pistol'), 'barrel', item('Tight-Bore Barrel'));
    model.setFit(id('GBB Pistol'), 'muzzle', item('Silencer'));
    const [rifle, pistol] = model.kit().slots;
    expect([rifle!.parts.barrel, rifle!.parts.muzzle]).toEqual(['long', 'silencer']);
    expect([pistol!.parts.barrel, pistol!.parts.muzzle]).toEqual([null, 'silencer']);
    expect(model.fitOf(id('GBB Pistol')).barrel).toBeNull();
    // Falls back to nothing fitted when the part is no longer unlocked.
    const own = owning(PARTS);
    const m2 = new LoadoutModel(pool, own);
    m2.setFit(id('AEG Rifle'), 'muzzle', item('Silencer'));
    own.items.delete(id('Silencer'));
    expect(m2.fitOf(id('AEG Rifle')).muzzle).toBeNull();
  });

  it('offers every barrel and muzzle part with Disable levelling, and none of them after', () => {
    let unlocked = true;
    const model = new LoadoutModel(pool, gameOwnership(pool, unlocks(), () => unlocked));
    expect(model.fitChoices(id('AEG Rifle'), 'barrel')).toEqual([item('Tight-Bore Barrel'), item('Long Barrel')]);
    expect(model.fitChoices(id('AEG Rifle'), 'muzzle')).toEqual([item('Silencer')]);
    expect(model.fitChoices(id('GBB Pistol'), 'muzzle')).toEqual([item('Silencer')]);
    expect(model.fitChoices(id('GBB Pistol'), 'barrel')).toEqual([]);
    unlocked = false;
    expect(model.fitChoices(id('AEG Rifle'), 'barrel')).toEqual([]);
  });

  it('keys the dials by replica asset, reads a dial saved by config id before, and sandboxes them under Disable levelling (audit POOL-17)', () => {
    saveSetting('hopUp.aeg', 0.7);
    let unlocked = false;
    const model = new LoadoutModel(pool, gameOwnership(pool, unlocks(), () => unlocked));
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

});

describe('Loadout model with dev gear (M35)', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', new MemoryStorage());
  });

  const devPool = withTags(pool, { 'Red Dot': 'dev', 'GBB Pistol': 'dev' });
  const devId = (name: string) => devPool.assets.find((a) => a.name === name)!.id;
  const dref = (name: string): ItemRef => ({ asset: devId(name) });

  it('offers an unlocked dev part only while Dev content is on, and keeps the saved pick for when it comes back', () => {
    let devContent = false;
    const levels = unlocks(dref('Red Dot'));
    const model = new LoadoutModel(devPool, gameOwnership(devPool, levels, () => false, () => devContent));
    const aeg = devId('AEG Rifle');
    expect(model.fitChoices(aeg, 'optic')).toEqual([]);
    devContent = true;
    expect(model.fitChoices(aeg, 'optic')).toEqual([dref('Red Dot')]);
    model.setFit(aeg, 'optic', dref('Red Dot'));
    expect(model.fitOf(aeg).optic).toEqual(dref('Red Dot'));
    devContent = false;
    expect(model.fitChoices(aeg, 'optic')).toEqual([]);
    expect(model.fitOf(aeg).optic).toBeNull(); // plays as the default (nothing)
    devContent = true;
    expect(model.fitOf(aeg).optic).toEqual(dref('Red Dot')); // the same saved pick is back
    expect(levels.ids).toContain(devId('Red Dot')); // never lost from the save
  });

  it('offers an unlocked dev replica only while Dev content is on, and an equipped one plays as the default until then', () => {
    let devContent = true;
    const model = new LoadoutModel(devPool, gameOwnership(devPool, unlocks(), () => false, () => devContent));
    expect(model.replicaChoices()).toContainEqual(dref('GBB Pistol'));
    model.equip('primary', dref('GBB Pistol'));
    expect(model.equipped()[0]).toEqual(dref('GBB Pistol'));
    devContent = false;
    expect(model.replicaChoices().map((r) => r.asset)).not.toContain(devId('GBB Pistol'));
    expect(model.replicaChoices().map((r) => r.asset)).toContain(devId('AEG Rifle'));
    expect(model.equipped()[0]).toEqual(dref('AEG Rifle'));
    expect(model.equipped().map((r) => r?.asset)).not.toContain(devId('GBB Pistol'));
    devContent = true;
    expect(model.equipped()[0]).toEqual(dref('GBB Pistol')); // the same pick, back
  });

  it('hides unlocked dev gear when no devContent switch is given (the default is off)', () => {
    const model = new LoadoutModel(devPool, gameOwnership(devPool, unlocks(dref('Red Dot')), () => false));
    expect(model.fitChoices(devId('AEG Rifle'), 'optic')).toEqual([]);
  });

  it('lends no dev gear with Disable levelling while Dev content is off, and all of it while on', () => {
    let devContent = false;
    const model = new LoadoutModel(devPool, gameOwnership(devPool, unlocks(), () => true, () => devContent));
    const aeg = devId('AEG Rifle');
    // The rifle takes the Red Dot (dev) and the 2x Scope (public).
    expect(model.fitChoices(aeg, 'optic')).toEqual([dref('2x Scope')]);
    // The rifle and the Cyber Pistol (public), not the dev GBB Pistol.
    expect(model.replicaChoices()).toEqual([dref('AEG Rifle'), dref('Cyber Pistol')]);
    devContent = true;
    expect(model.fitChoices(aeg, 'optic')).toEqual([dref('Red Dot'), dref('2x Scope')]);
    expect(model.replicaChoices()).toEqual([dref('GBB Pistol'), dref('AEG Rifle'), dref('Cyber Pistol')]);
  });
});

describe('Loadout slots and dev gear (M35 hasSlot)', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', new MemoryStorage());
  });

  // The Red Laser is the only laser, and it fits the pistol: tagging it dev leaves the pistol's laser slot with dev parts only.
  const devPool = withTags(pool, { 'Red Laser': 'dev' });
  const pistol = devPool.assets.find((a) => a.name === 'GBB Pistol')!.id;
  const aeg = devPool.assets.find((a) => a.name === 'AEG Rifle')!.id;

  it('has no slot for a part that is only dev while Dev content is off, and has it once on', () => {
    let devContent = false;
    const model = new LoadoutModel(devPool, gameOwnership(devPool, unlocks(), () => false, () => devContent));
    expect(model.hasSlot(pistol, 'laser')).toBe(false);
    devContent = true;
    expect(model.hasSlot(pistol, 'laser')).toBe(true);
    devContent = false;
    expect(model.hasSlot(pistol, 'laser')).toBe(false);
  });

  it('does the same with Disable levelling on, and still has the slots that have a public part', () => {
    let devContent = false;
    const model = new LoadoutModel(devPool, gameOwnership(devPool, unlocks(), () => true, () => devContent));
    expect(model.hasSlot(pistol, 'laser')).toBe(false);
    expect(model.hasSlot(pistol, 'muzzle')).toBe(true);
    expect(model.hasSlot(aeg, 'optic')).toBe(true);
    devContent = true;
    expect(model.hasSlot(pistol, 'laser')).toBe(true);
  });

  it('keeps a slot with at least one public part while Dev content is off', () => {
    const mixed = withTags(pool, { 'Red Dot': 'dev' }); // the 2x Scope stays public
    const model = new LoadoutModel(mixed, gameOwnership(mixed, unlocks(), () => false, () => false));
    expect(model.hasSlot(aeg, 'optic')).toBe(true);
  });

  it('has the slot with plain unlocked ownership, which offers no filter', () => {
    const ids = unlocksUpTo(GAME_LEVELS, 0);
    const model = new LoadoutModel(devPool, unlockedOwnership(() => ids));
    expect(unlockedOwnership(() => ids).offers).toBeUndefined();
    expect(model.hasSlot(pistol, 'laser')).toBe(true);
    expect(new LoadoutModel(devPool, owning([])).hasSlot(pistol, 'laser')).toBe(true);
  });
});

describe('M32 acceptance 4: the Cyber Pistol, the level cap’s unlock (LV1)', () => {
  const CYBER = '000019';
  const cyber: ItemRef = { asset: CYBER };

  beforeEach(() => {
    vi.stubGlobal('localStorage', new MemoryStorage());
  });

  it('is lent by Disable levelling, and not without it: a player below the cap does not have one', () => {
    const own = gameOwnership(pool, unlocks(), () => true);
    expect(own.owns(cyber)).toBe(true);
    expect(own.lockedAt!(cyber)).toBeNull();
    const model = new LoadoutModel(pool, own);
    expect(model.replicaChoices().filter((r) => r.asset === CYBER)).toEqual([cyber]);
    const off = gameOwnership(pool, unlocks(), () => false);
    expect(off.owns(cyber)).toBe(false);
    expect(off.lockedAt!(cyber)).toBe(GAME_LEVELS.cap);
  });

  it('takes it as it comes, with no power source: the spec numbers, whatever the player unlocked', () => {
    const model = new LoadoutModel(pool, owning([...STARTERS, cyber]));
    const slot = model.asItComes(CYBER);
    expect(slot.replica.id).toBe(CYBER_PISTOL.id);
    expect(slot.replica.name).toBe('Cyber Pistol');
    expect(slot.replica.muzzleEnergy).toBeCloseTo(1.0, 2);
    expect(slot.replica.fireRate).toBeCloseTo(14, 1);
    // Exactly what carrying it with nothing fitted gives, and its config's own numbers.
    expect(slot.replica).toEqual(model.slotKit(cyber).replica);
    expect(slot.replica).toEqual({ ...CYBER_PISTOL, name: 'Cyber Pistol' });
    expect(slot.optic).toBeNull();
    expect(model.asItComes(id('AEG Rifle')).replica).toEqual({ ...AEG, name: 'AEG Rifle' });
  });

  it('has no slot for any part or power source, and offers none, so Customise has nothing to pick', () => {
    const model = new LoadoutModel(pool, gameOwnership(pool, unlocks(), () => true));
    for (const slot of FIT_SLOTS) {
      expect(model.hasSlot(CYBER, slot), slot).toBe(false);
      expect(model.fitChoices(CYBER, slot), slot).toEqual([]);
    }
    // The other replicas keep theirs: a power source and a magazine for both.
    for (const r of ['AEG Rifle', 'GBB Pistol']) {
      expect(model.hasSlot(id(r), 'power'), r).toBe(true);
      expect(model.hasSlot(id(r), 'magazine'), r).toBe(true);
    }
  });

  it('carries it in a gear slot like any replica, on nothing fitted', () => {
    const model = new LoadoutModel(pool, owning([...STARTERS, cyber]));
    model.equip('primary', cyber);
    const [primary, secondary] = model.kit().slots;
    expect(primary!.replica.id).toBe(CYBER_PISTOL.id);
    expect(primary!.replica.muzzleEnergy).toBeCloseTo(1.0, 2);
    expect(secondary!.replica.id).toBe(GAS_PISTOL.id);
    expect(model.fitOf(CYBER)).toEqual(EMPTY_FIT);
  });
});

describe('Loadout model: what levels lock and unlock (LV1)', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', new MemoryStorage());
  });

  const at = (name: string, level: number) => ({ item: item(name), level });
  const torch = item('Weapon Torch');

  it('owns only what the levels unlocked, and says the level that unlocks the rest', () => {
    const own = gameOwnership(pool, unlocks(), () => false);
    for (const r of STARTERS) {
      expect(own.owns(r), pool.byId.get(r.asset)!.name).toBe(true);
      expect(own.lockedAt!(r)).toBeNull();
    }
    expect(own.owns(item('Red Dot'))).toBe(false);
    expect(own.lockedAt!(item('Red Dot'))).toBe(1);
    expect(own.lockedAt!(item('Long Barrel'))).toBe(9);
    expect(own.lockedAt!(item('Cyber Pistol'))).toBe(10);
    // Every pooled item the player lacks has the level levels.md gives it.
    for (const a of pool.assets.filter((x) => !own.owns({ asset: x.id }) && x.tag === 'public')) {
      expect(own.lockedAt!({ asset: a.id }), a.name).toBe(GAME_LEVELS.unlockLevel.get(a.id));
    }
  });

  it('owns an item the moment it is unlocked, and no longer says it is locked', () => {
    const levels = unlocks();
    const own = gameOwnership(pool, levels, () => false);
    expect(own.owns(item('Red Dot'))).toBe(false);
    levels.ids.push(id('Red Dot'));
    expect(own.owns(item('Red Dot'))).toBe(true);
    expect(own.lockedAt!(item('Red Dot'))).toBeNull();
  });

  it('never owns or locks an item pool.md no longer lists, nor gives a level to one levels.md has none for', () => {
    const levels = unlocks({ asset: '999998' });
    const own = gameOwnership(pool, levels, () => false);
    expect(own.owns({ asset: '999998' })).toBe(false);
    expect(own.lockedAt!({ asset: '999998' })).toBeNull();
    expect(own.lockedAt!({ asset: '999997' })).toBeNull();
    const noLevel = gameOwnership(pool, { unlocked: () => [], levelOf: () => undefined }, () => false);
    expect(noLevel.owns(item('Red Dot'))).toBe(false);
    expect(noLevel.lockedAt!(item('Red Dot'))).toBeNull();
  });

  it('owns everything offered with Disable levelling, locks nothing, and is sandboxed', () => {
    const own = gameOwnership(pool, unlocks(), () => true);
    for (const a of pool.assets.filter((x) => x.tag === 'public')) {
      expect(own.owns({ asset: a.id }), a.name).toBe(true);
      expect(own.lockedAt!({ asset: a.id }), a.name).toBeNull();
    }
    expect(own.sandboxed!()).toBe(true);
    expect(gameOwnership(pool, unlocks(), () => false).sandboxed!()).toBe(false);
    const model = new LoadoutModel(pool, own);
    expect(model.lockedReplicas()).toEqual([]);
    for (const slot of FIT_SLOTS) expect(model.lockedFitChoices(id('AEG Rifle'), slot), slot).toEqual([]);
  });

  it('owns a dev item (the level 0 Weapon Torch) only with Dev content on, unlocked or with Disable levelling', () => {
    let devContent = false;
    for (const all of [false, true]) {
      const own = gameOwnership(pool, unlocks(), () => all, () => devContent);
      devContent = false;
      expect(own.owns(torch), `all ${all}`).toBe(false);
      expect(own.offers!(pool.byId.get(torch.asset)!)).toBe(false);
      expect(own.devContent!()).toBe(false);
      devContent = true;
      expect(own.owns(torch), `all ${all}`).toBe(true);
      expect(own.offers!(pool.byId.get(torch.asset)!)).toBe(true);
    }
    // Not unlocked and not lent: Dev content alone gives nothing.
    const none = gameOwnership(pool, { unlocked: () => [], levelOf: (a) => GAME_LEVELS.unlockLevel.get(a) }, () => false, () => true);
    expect(none.owns(torch)).toBe(false);
    expect(none.lockedAt!(torch)).toBe(0);
  });

  it('lists the replicas still to unlock with their levels: the Cyber Pistol at the cap, none once it is unlocked', () => {
    const levels = unlocks();
    const model = new LoadoutModel(pool, gameOwnership(pool, levels, () => false));
    expect(model.lockedReplicas()).toEqual([at('Cyber Pistol', 10)]);
    levels.ids.push(id('Cyber Pistol'));
    expect(model.lockedReplicas()).toEqual([]);
  });

  it("lists each slot's parts still to unlock, lowest level first, only those that fit the replica", () => {
    const levels = unlocks();
    const model = new LoadoutModel(pool, gameOwnership(pool, levels, () => false));
    const aeg = id('AEG Rifle');
    const pistol = id('GBB Pistol');
    expect(model.lockedFitChoices(aeg, 'optic')).toEqual([at('Red Dot', 1), at('2x Scope', 7)]);
    expect(model.lockedFitChoices(aeg, 'magazine')).toEqual([at('Hi-Cap Magazine', 3), at('Low-Cap Magazine', 6)]);
    expect(model.lockedFitChoices(aeg, 'barrel')).toEqual([at('Tight-Bore Barrel', 5), at('Long Barrel', 9)]);
    expect(model.lockedFitChoices(aeg, 'power')).toEqual([at('11.1 V LiPo Battery', 8)]);
    expect(model.lockedFitChoices(pistol, 'power')).toEqual([at('Red Gas', 5), at('Black Gas', 9)]);
    expect(model.lockedFitChoices(pistol, 'laser')).toEqual([at('Red Laser', 2)]);
    expect(model.lockedFitChoices(aeg, 'laser')).toEqual([]);
    expect(model.lockedFitChoices(pistol, 'barrel')).toEqual([]);
    expect(model.lockedFitChoices(id('Cyber Pistol'), 'power')).toEqual([]);
    expect(model.lockedFitChoices('999999', 'optic')).toEqual([]);
    // Unlocking one moves it from the locked list to the choices.
    levels.ids.push(id('Red Dot'));
    expect(model.lockedFitChoices(aeg, 'optic')).toEqual([at('2x Scope', 7)]);
    expect(model.fitChoices(aeg, 'optic')).toEqual([item('Red Dot')]);
  });

  it('locks nothing at or below the level reached: halfway up, only the higher levels are left', () => {
    const ids = unlocksUpTo(GAME_LEVELS, 5);
    const model = new LoadoutModel(pool, gameOwnership(pool, { unlocked: () => ids, levelOf: (a) => GAME_LEVELS.unlockLevel.get(a) }, () => false));
    const locked = [...model.lockedReplicas(), ...FIT_SLOTS.flatMap((s) => [...model.lockedFitChoices(id('AEG Rifle'), s), ...model.lockedFitChoices(id('GBB Pistol'), s)])];
    expect(locked.length).toBeGreaterThan(0);
    for (const l of locked) expect(l.level, pool.byId.get(l.item.asset)!.name).toBeGreaterThan(5);
    expect(model.fitChoices(id('AEG Rifle'), 'barrel')).toEqual([item('Tight-Bore Barrel')]);
  });

  it('keeps a locked dev part off the list while Dev content is off, and lists it at its level once on', () => {
    let devContent = false;
    const devPool = withTags(pool, { 'Red Dot': 'dev' });
    const model = new LoadoutModel(devPool, gameOwnership(devPool, unlocks(), () => false, () => devContent));
    expect(model.lockedFitChoices(id('AEG Rifle'), 'optic')).toEqual([at('2x Scope', 7)]);
    devContent = true;
    expect(model.lockedFitChoices(id('AEG Rifle'), 'optic')).toEqual([at('Red Dot', 1), at('2x Scope', 7)]);
  });

  it('locks nothing with an ownership that knows no levels (owns alone)', () => {
    const model = new LoadoutModel(pool, owning(STARTERS));
    expect(model.lockedReplicas()).toEqual([]);
    expect(model.lockedFitChoices(id('AEG Rifle'), 'optic')).toEqual([]);
  });
});
