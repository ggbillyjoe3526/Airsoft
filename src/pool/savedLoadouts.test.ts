import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { SAVED_LOADOUTS } from '../config/savedLoadouts';
import { GAME_LEVELS } from '../progress/gameLevels';
import { GAME_POOL } from './gamePool';
import { type ItemRef } from './item';
import { gameOwnership, LoadoutModel, type Ownership, type Unlocks } from './loadoutModel';
import { cleanName, copyName, SAVED_LOADOUTS_KEY, SAVED_LOADOUTS_VERSION, SavedLoadouts } from './savedLoadouts';
import { MemoryStorage } from './testStorage';
import { withTags } from './testSupport';

const pool = GAME_POOL;
const id = (name: string) => pool.assets.find((a) => a.name === name)!.id;
const item = (name: string): ItemRef => ({ asset: id(name) });
const STARTERS = ['AEG Rifle', 'GBB Pistol', 'Standard Battery', 'Green Gas'].map((n) => item(n));
const AEG = id('AEG Rifle');
const PISTOL = id('GBB Pistol');

/** An ownership of exactly these items, which a test can change as it goes. */
function owning(items: ItemRef[]): Ownership & { items: Set<string> } {
  const set = new Set(items.map((r) => r.asset));
  return { items: set, owns: (r) => set.has(r.asset) };
}

/** The levels' unlocks (LV1) of exactly these items, each at its levels.md level. */
function unlocking(items: ItemRef[]): Unlocks {
  return { unlocked: () => items.map((r) => r.asset), levelOf: (asset) => GAME_LEVELS.unlockLevel.get(asset) };
}

// Test files share a worker (isolate: false): the stand-in storage goes with this file.
afterAll(() => vi.unstubAllGlobals());

let storage: MemoryStorage;

/** The saved loadouts over a loadout owning `own`, on this test's storage (the settings' and their own). */
function setUp(own: Ownership = owning(STARTERS)): { model: LoadoutModel; saved: SavedLoadouts } {
  const model = new LoadoutModel(pool, own);
  return { model, saved: new SavedLoadouts(model, () => storage) };
}

const stored = (): Record<string, unknown> => JSON.parse(storage.getItem(SAVED_LOADOUTS_KEY) ?? 'null') as Record<string, unknown>;
const names = (saved: SavedLoadouts) => saved.views().map((v) => v?.name ?? null);

describe('Saved loadouts (SL1)', () => {
  beforeEach(() => {
    storage = new MemoryStorage();
    vi.stubGlobal('localStorage', storage);
  });

  it('starts with one saved loadout, the one carried, and writes nothing until the player changes something', () => {
    const { saved } = setUp();
    expect(saved.current()).toBe(0);
    expect(names(saved)).toEqual(['Loadout 1', null, null, null, null]);
    expect(saved.views()).toHaveLength(SAVED_LOADOUTS.slots);
    const first = saved.view(0)!;
    expect(first.current).toBe(true);
    expect(first.replicas.map((a) => a?.name)).toEqual(['AEG Rifle', 'GBB Pistol']);
    expect(first.missing).toEqual([]);
    expect(storage.getItem(SAVED_LOADOUTS_KEY)).toBeNull();
    expect(saved.canDelete(0)).toBe(false);
    expect(saved.hasRoom()).toBe(true);
  });

  it('makes a new loadout as a copy of the one carried, which it becomes; changes then go to the current one only', () => {
    const { model, saved } = setUp(owning([...STARTERS, item('Red Dot')]));
    model.setFit(AEG, 'optic', item('Red Dot'));
    expect(saved.create(1)).toBe(true);
    expect(saved.current()).toBe(1);
    expect(saved.view(1)!.name).toBe('Loadout 2');
    expect(model.fitOf(AEG).optic).toEqual(item('Red Dot')); // a copy: the same loadout, carried
    model.setFit(AEG, 'optic', null);
    model.setScheme(AEG, 'hazard');
    expect(saved.use(0)).toBe(true);
    expect(model.fitOf(AEG).optic).toEqual(item('Red Dot'));
    expect(model.scheme(AEG)).toBe('cobalt');
    expect(saved.use(1)).toBe(true);
    expect(model.fitOf(AEG).optic).toBeNull();
    expect(model.scheme(AEG)).toBe('hazard');
    expect(saved.create(1)).toBe(false); // not over a saved one
    expect(saved.create(SAVED_LOADOUTS.slots)).toBe(false);
    expect(saved.use(1)).toBe(false); // already carried
    expect(saved.use(4)).toBe(false); // empty
  });

  it('carries every pick on a switch: replicas, parts, battery and gas, BB weight, hop-up, Glowing BBs and colours', () => {
    const own = owning([...STARTERS, item('Black Gas'), item('Red Laser'), item('11.1 V LiPo Battery'), item('Red Dot'), item('Cyber Pistol')]);
    const { model, saved } = setUp(own);
    const before = model.kit();
    saved.create(1);
    model.equip('primary', item('Cyber Pistol'));
    model.equip('secondary', item('GBB Pistol'));
    model.setFit(PISTOL, 'power', item('Black Gas'));
    model.setFit(PISTOL, 'laser', item('Red Laser'));
    model.setHopUp(PISTOL, 0.4);
    model.setBbWeight(PISTOL, 0.28);
    model.setGlowBBs(PISTOL, 'always');
    model.setScheme(PISTOL, 'hazard');
    const after = model.kit();
    expect(after).not.toEqual(before);
    saved.use(0);
    expect(model.kit()).toEqual(before);
    saved.use(1);
    expect(model.kit()).toEqual(after);
    // The rifle, carried in slot 0 only, keeps its own parts there.
    saved.create(2);
    model.equip('primary', item('AEG Rifle'));
    model.setFit(AEG, 'power', item('11.1 V LiPo Battery'));
    model.setFit(AEG, 'optic', item('Red Dot'));
    const rifle = model.kit();
    saved.use(0);
    expect(model.kit()).toEqual(before);
    saved.use(2);
    expect(model.kit()).toEqual(rifle);
  });

  it('keeps them in the save: a new visit reads the names, the picks and the one carried back', () => {
    const { model, saved } = setUp(owning([...STARTERS, item('Red Dot')]));
    saved.create(2);
    model.setFit(AEG, 'optic', item('Red Dot'));
    saved.rename(2, 'Night ops');
    expect(stored()).toMatchObject({ version: SAVED_LOADOUTS_VERSION, current: 2 });
    const later = setUp(owning([...STARTERS, item('Red Dot')]));
    expect(names(later.saved)).toEqual(['Loadout 1', null, 'Night ops', null, null]);
    expect(later.saved.current()).toBe(2);
    expect(later.model.fitOf(AEG).optic).toEqual(item('Red Dot'));
    later.saved.use(0);
    expect(later.model.fitOf(AEG).optic).toBeNull();
    expect(stored()).toMatchObject({ current: 0 });
  });

  it('renames with a tidy name of at most SAVED_LOADOUTS.nameMax characters, and keeps the old one for an empty name', () => {
    const { saved } = setUp();
    expect(saved.rename(0, '  Night\n   ops  ')).toBe(true);
    expect(saved.view(0)!.name).toBe('Night ops');
    expect(saved.rename(0, '   ')).toBe(false);
    expect(saved.rename(3, 'Nobody')).toBe(false); // empty slot
    expect(saved.view(0)!.name).toBe('Night ops');
    expect(cleanName('x'.repeat(40))).toHaveLength(SAVED_LOADOUTS.nameMax);
    expect(cleanName('🔫'.repeat(25))).toBe('🔫'.repeat(SAVED_LOADOUTS.nameMax)); // characters, not code units
    expect(cleanName(42)).toBe('');
    expect(cleanName('a\u0000b\u007f')).toBe('ab');
  });

  it('duplicates into the first free slot as "<name> copy" (the one carried stays), and not once every slot is full', () => {
    const { model, saved } = setUp(owning([...STARTERS, item('Red Dot')]));
    model.setFit(AEG, 'optic', item('Red Dot'));
    expect(saved.duplicate(0)).toBe(1);
    expect(saved.view(1)!.name).toBe('Loadout 1 copy');
    expect(saved.current()).toBe(0);
    // A copy of a saved one (not carried) is of its record.
    saved.create(2);
    model.setFit(AEG, 'optic', null);
    expect(saved.duplicate(0)).toBe(3);
    saved.use(3);
    expect(model.fitOf(AEG).optic).toEqual(item('Red Dot'));
    expect(saved.duplicate(3)).toBe(4);
    expect(saved.hasRoom()).toBe(false);
    expect(saved.duplicate(0)).toBe(-1);
    expect(copyName('x'.repeat(SAVED_LOADOUTS.nameMax))).toHaveLength(SAVED_LOADOUTS.nameMax);
    expect(copyName('x'.repeat(SAVED_LOADOUTS.nameMax)).endsWith(' copy')).toBe(true);
  });

  it('replaces a saved loadout with the one carried, keeping its name; never the current one', () => {
    const { model, saved } = setUp(owning([...STARTERS, item('Red Dot')]));
    saved.create(1);
    saved.rename(1, 'CQB');
    saved.use(0);
    model.setFit(AEG, 'optic', item('Red Dot'));
    expect(saved.replace(0)).toBe(false);
    expect(saved.replace(1)).toBe(true);
    expect(saved.view(1)!.name).toBe('CQB');
    model.setFit(AEG, 'optic', null);
    saved.use(1);
    expect(model.fitOf(AEG).optic).toEqual(item('Red Dot'));
    expect(saved.replace(4)).toBe(false);
  });

  it('deletes any but the last; deleting the one carried carries the next, else the one before', () => {
    const { model, saved } = setUp(owning([...STARTERS, item('Red Dot')]));
    saved.create(1);
    saved.create(2);
    model.setFit(AEG, 'optic', item('Red Dot'));
    saved.use(1);
    expect(saved.nextAfter(1)).toBe(2);
    expect(saved.remove(1)).toBe(true);
    expect(saved.current()).toBe(2);
    expect(model.fitOf(AEG).optic).toEqual(item('Red Dot')); // slot 2's loadout, carried
    expect(saved.nextAfter(2)).toBe(0);
    expect(saved.remove(2)).toBe(true);
    expect(saved.current()).toBe(0);
    expect(model.fitOf(AEG).optic).toBeNull();
    expect(saved.canDelete(0)).toBe(false);
    expect(saved.remove(0)).toBe(false);
    expect(names(saved)).toEqual(['Loadout 1', null, null, null, null]);
  });

  it("keeps gear that isn't available now as picked: it plays as the default, shows what plays instead, and comes back", () => {
    const own = owning([...STARTERS, item('Red Dot'), item('Cyber Pistol')]);
    const { model, saved } = setUp(own);
    model.setFit(AEG, 'optic', item('Red Dot'));
    saved.create(1);
    model.equip('primary', item('Cyber Pistol'));
    model.equip('secondary', item('AEG Rifle'));
    saved.use(0);
    own.items.delete(id('Red Dot'));
    own.items.delete(id('Cyber Pistol'));

    const zero = saved.view(0)!;
    expect(zero.missing).toEqual([{ slot: 'optic', wanted: pool.byId.get(id('Red Dot')), instead: null, reason: 'locked', level: null }]);
    expect(model.fitOf(AEG).optic).toBeNull(); // plays as the default
    const one = saved.view(1)!;
    // Slot 1 began as a copy of slot 0, so its rifle has the Red Dot too.
    expect(one.missing.map((m) => [m.slot, m.wanted.name, m.instead?.name ?? null, m.reason])).toEqual([
      ['primary', 'Cyber Pistol', one.replicas[0]?.name, 'locked'],
      ['optic', 'Red Dot', null, 'locked'],
    ]);
    expect(one.replicas.map((a) => a?.name)).not.toContain('Cyber Pistol');

    // Switching and switching back keeps the pick (written as picked, not as it plays now).
    saved.use(1);
    saved.use(0);
    expect(saved.view(1)!.missing).toHaveLength(2);
    expect(saved.view(0)!.missing).toHaveLength(1);

    own.items.add(id('Red Dot'));
    own.items.add(id('Cyber Pistol'));
    expect(model.fitOf(AEG).optic).toEqual(item('Red Dot'));
    expect(saved.view(0)!.missing).toEqual([]);
    expect(saved.view(1)!.replicas[0]?.name).toBe('Cyber Pistol');
    saved.use(1);
    expect(model.equipped()[0]).toEqual(item('Cyber Pistol'));
  });

  it('marks dev gear with Dev content off as dev, not locked (the one ownership check decides both)', () => {
    const devPool = withTags(pool, { 'Red Dot': 'dev' });
    let devContent = true;
    const model = new LoadoutModel(devPool, gameOwnership(devPool, unlocking([...STARTERS, item('Red Dot')]), () => false, () => devContent));
    const saved = new SavedLoadouts(model, () => storage);
    model.setFit(AEG, 'optic', item('Red Dot'));
    expect(saved.view(0)!.missing).toEqual([]);
    devContent = false;
    expect(saved.view(0)!.missing.map((m) => [m.wanted.name, m.reason])).toEqual([['Red Dot', 'dev']]);
    devContent = true;
    expect(saved.view(0)!.missing).toEqual([]);
  });

  it('says the level that unlocks a locked pick (LV1), and nothing once it is unlocked', () => {
    const items = [...STARTERS];
    const levels: Unlocks = { unlocked: () => items.map((r) => r.asset), levelOf: (asset) => GAME_LEVELS.unlockLevel.get(asset) };
    const model = new LoadoutModel(pool, gameOwnership(pool, levels, () => false));
    // A saved loadout holding the Cyber Pistol: a player below level 10 is told which level brings it back.
    const picks = { ...model.picks(), 'equip.primary': id('Cyber Pistol') };
    expect(model.over(picks).missing().map((m) => [m.wanted.name, m.reason, m.level])).toEqual([['Cyber Pistol', 'locked', 10]]);
    items.push(item('Cyber Pistol'));
    expect(model.over(picks).missing()).toEqual([]);
  });

  it('keeps a set of its own while everything is unlocked, so turning it off brings back the real loadouts', () => {
    let unlocked = false;
    const model = new LoadoutModel(pool, gameOwnership(pool, unlocking([...STARTERS, item('Red Dot')]), () => unlocked));
    const saved = new SavedLoadouts(model, () => storage);
    model.setFit(AEG, 'optic', item('Red Dot'));
    saved.create(1);
    saved.rename(1, 'Real');
    saved.use(0);

    unlocked = true;
    expect(names(saved)).toEqual(['Loadout 1', 'Real', null, null, null]); // starts from the real set
    saved.create(2);
    model.setFit(AEG, 'optic', item('2x Scope'));
    saved.rename(0, 'Dev zero');
    saved.remove(1);
    expect(names(saved)).toEqual(['Dev zero', null, 'Loadout 3', null, null]);

    unlocked = false;
    expect(names(saved)).toEqual(['Loadout 1', 'Real', null, null, null]);
    expect(saved.current()).toBe(0);
    expect(model.fitOf(AEG).optic).toEqual(item('Red Dot'));
    unlocked = true;
    expect(names(saved)).toEqual(['Dev zero', null, 'Loadout 3', null, null]);
    expect(saved.current()).toBe(2);
    expect(model.fitOf(AEG).optic).toEqual(item('2x Scope'));
    expect(stored()).toHaveProperty('dev');
  });

  it('reads a damaged store safely: unreadable slots and values are dropped, and the one carried always has a slot', () => {
    storage.setItem(SAVED_LOADOUTS_KEY, '{not json');
    expect(names(setUp().saved)).toEqual(['Loadout 1', null, null, null, null]);

    const odd = { version: 1, slots: [{ name: 42, picks: { 'equip.primary': AEG, weird: { a: 1 }, other: null } }, 'nope', null, { name: 'B' }, { name: 'C', picks: {} }, { name: 'Sixth', picks: {} }], current: 9 };
    storage.setItem(SAVED_LOADOUTS_KEY, JSON.stringify(odd));
    const { saved } = setUp();
    // Slot 0 named by its place; 1 and 3 unreadable; 5 beyond the slots; the one carried put in the first free slot.
    expect(names(saved)).toEqual(['Loadout 1', 'Loadout 2', null, null, 'C']);
    expect(saved.current()).toBe(1);

    storage.setItem(SAVED_LOADOUTS_KEY, JSON.stringify({ version: 1, slots: Array.from({ length: 5 }, (_, i) => ({ name: `L${i}`, picks: {} })), current: -1 }));
    expect(setUp().saved.current()).toBe(0); // no free slot: the first is carried

    storage.setItem(SAVED_LOADOUTS_KEY, JSON.stringify({ version: 1, slots: [null, null], current: 0 }));
    expect(names(setUp().saved)).toEqual(['Loadout 1', null, null, null, null]);
  });

  it("never reads or writes over a newer build's store, and keeps the fields it doesn't know", () => {
    const newer = JSON.stringify({ version: SAVED_LOADOUTS_VERSION + 1, slots: [{ name: 'Future', picks: {} }], current: 0 });
    storage.setItem(SAVED_LOADOUTS_KEY, newer);
    const { saved } = setUp();
    expect(names(saved)).toEqual(['Loadout 1', null, null, null, null]);
    saved.create(1);
    expect(storage.getItem(SAVED_LOADOUTS_KEY)).toBe(newer);

    storage.setItem(SAVED_LOADOUTS_KEY, JSON.stringify({ version: 1, slots: [{ name: 'Mine', picks: {} }], current: 0, extra: 'kept' }));
    const again = setUp().saved;
    again.rename(0, 'Renamed');
    expect(stored()).toMatchObject({ extra: 'kept', slots: [{ name: 'Renamed' }, null, null, null, null] });
  });
});

describe('Loadout model over saved picks (SL1)', () => {
  beforeEach(() => {
    storage = new MemoryStorage();
    vi.stubGlobal('localStorage', storage);
  });

  it('writes every slot of each replica carried, so the record alone gives the same loadout', () => {
    const model = new LoadoutModel(pool, owning(STARTERS));
    const picks = model.picks();
    expect(picks['equip.primary']).toBe(AEG);
    expect(picks[`fit.${AEG}.optic`]).toBe('none');
    expect(picks[`fit.${AEG}.power`]).toBe(id('Standard Battery'));
    expect(picks[`hopUp.${PISTOL}`]).toBe(model.hopUp(PISTOL));
    expect(picks[`scheme.${AEG}`]).toBe('cobalt');
    expect(model.over(picks).kit()).toEqual(model.kit());
  });

  it('plays a saved record without saving anything: a model over it changes only its own copy', () => {
    const model = new LoadoutModel(pool, owning([...STARTERS, item('Red Dot')]));
    const picks = model.picks();
    const before = storage.getItem('airsoft.settings');
    const other = model.over(picks);
    other.setFit(AEG, 'optic', item('Red Dot'));
    expect(other.fitOf(AEG).optic).toEqual(item('Red Dot'));
    expect(model.fitOf(AEG).optic).toBeNull();
    expect(picks[`fit.${AEG}.optic`]).toBe('none');
    expect(storage.getItem('airsoft.settings')).toBe(before);
  });

  it("leaves out a field it doesn't know or a value that isn't a pick", () => {
    const model = new LoadoutModel(pool, owning(STARTERS));
    const before = model.picks();
    model.usePicks({
      'equip.tertiary': AEG,
      'equip.primary': 'not a key',
      [`fit.${AEG}.optic.more`]: 'none',
      [`fit.${AEG}.wings`]: 'none',
      'fit.999999.optic': 'none',
      [`hopUp.${AEG}`]: 99,
      [`bbWeight.${AEG}`]: 'heavy',
      [`glowBBs.${AEG}`]: 'sometimes',
      [`scheme.${AEG}`]: 'plaid',
      [`scheme.${id('Red Dot')}`]: 'hazard',
      nonsense: 1,
    });
    expect(model.picks()).toEqual(before);
  });
});
