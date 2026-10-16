import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SAVED_LOADOUTS, SAVED_TEXT } from '../../config/savedLoadouts';
import type { ItemRef } from '../../pool/item';
import { GAME_POOL } from '../../pool/gamePool';
import { LoadoutModel, type Ownership } from '../../pool/loadoutModel';
import { SavedLoadouts } from '../../pool/savedLoadouts';
import { MemoryStorage } from '../../pool/testStorage';
import { findAll } from '../testSupport';
import { LoadoutPicker } from './loadoutPicker';
import { LoadoutScreen } from './loadoutScreen';
import { EventNode, stubMenuPage } from './menuTestSupport';

/**
 * SL1 / MR1 acceptance on the fake DOM: the Loadout's saved-loadout dropdown (one button naming the loadout carried, its
 * list with the current one marked and New loadout while a slot is free, keys 1 to 5), the Rename, Duplicate, New and
 * Delete buttons with their confirmations, inline rename, locked gear in words, the Match screen's pick, and bots
 * untouched. The model itself is in pool/savedLoadouts.test.ts.
 */
const pool = GAME_POOL;
const id = (name: string) => pool.assets.find((a) => a.name === name)!.id;
const item = (name: string): ItemRef => ({ asset: id(name) });
const STARTERS = ['AEG Rifle', 'GBB Pistol', 'Standard Battery', 'Green Gas'].map((n) => item(n));
const AEG = id('AEG Rifle');

function owning(items: ItemRef[]): Ownership & { items: Set<string> } {
  const set = new Set(items.map((r) => r.asset));
  return { items: set, owns: (r) => set.has(r.asset) };
}

beforeEach(() => {
  stubMenuPage();
  vi.stubGlobal('localStorage', new MemoryStorage());
  // The fake input has no select(); the bar calls it when a rename starts.
  (EventNode.prototype as unknown as { select: () => void }).select = () => {};
});
afterEach(() => vi.unstubAllGlobals());

const node = (e: unknown): EventNode => e as EventNode;

interface Rig {
  model: LoadoutModel;
  saved: SavedLoadouts;
  screen: LoadoutScreen;
  root: EventNode;
  changes: () => number;
  own: ReturnType<typeof owning>;
}

function rig(own = owning([...STARTERS, item('Red Dot'), item('Cyber Pistol')])): Rig {
  const storage = new MemoryStorage();
  const model = new LoadoutModel(pool, own);
  const saved = new SavedLoadouts(model, () => storage);
  let changes = 0;
  const screen = new LoadoutScreen({ model, saved, context: { pictures: null, realistic: () => false }, onChange: () => changes++ });
  screen.open(false);
  return { model, saved, screen, root: node(screen.root), changes: () => changes, own };
}

const part = (n: EventNode, cls: string): EventNode => findAll(n, cls)[0] as EventNode;
const pick = (r: Rig): EventNode => part(r.root, 'saved-pick');
const pickText = (r: Rig, cls: 'key' | 'name' | 'line'): string => part(pick(r), `saved-pick-${cls}`).text;
const bar = (r: Rig): EventNode => (r.root.all('section') as EventNode[]).find((s) => s.classList.contains('saved-loadouts'))!;
const input = (r: Rig): EventNode => part(r.root, 'saved-pick-input');
const typed = (r: Rig, text: string): void => void ((input(r) as unknown as { value: string }).value = text);
const key = (r: Rig, k: string): void => void r.screen.hints.find((h) => h.keys.includes(k))!.run?.();
const carried = (r: Rig): string[] => (findAll(r.root, 'gear-slot') as EventNode[]).filter((b) => !b.classList.contains('gear-grenades')).map((b) => b.text);

/** Opens the dropdown with a click on its button; reads and drives the list that appears. */
function listOf(r: Rig): { labels: string[]; details: string[]; items: EventNode[]; choose: (label: string) => void; isOpen: () => boolean } {
  pick(r).click();
  const menu = part(r.root, 'context-menu');
  const shown = (): EventNode[] => (findAll(menu, 'context-item') as EventNode[]).filter((b) => !b.hidden);
  return {
    labels: shown().map((b) => part(b, 'context-label').text),
    details: shown().map((b) => part(b, 'context-detail').text),
    items: shown(),
    choose: (label) => shown().find((b) => part(b, 'context-label').text === label)!.click(),
    isOpen: () => !menu.hidden,
  };
}

const dialog = (r: Rig): EventNode => findAll(r.root, 'confirm-dialog')[0] as EventNode;
const dialogButton = (r: Rig, label: string): EventNode => dialog(r).all('button').find((b) => b.text === label)!;
const barButton = (r: Rig, label: string): EventNode =>
  (findAll(r.root, 'saved-actions')[0] as EventNode).all('button').find((b) => b.text === label)!;

/** Adds a second loadout (slot 2, a copy of yours) with the New button and settles its name; it is the one carried. */
function addSecond(r: Rig): void {
  barButton(r, SAVED_TEXT.newShort).click();
  input(r).fire('keydown', { key: 'Enter' });
}

describe('criterion 1: one dropdown names the loadout carried', () => {
  it('draws one button with the number, the name and the replicas carried, a caret, and no name box open', () => {
    const r = rig();
    expect(findAll(r.root, 'saved-pick')).toHaveLength(1);
    expect(SAVED_LOADOUTS.slots).toBe(5);
    expect(pickText(r, 'key')).toBe('1');
    expect(pickText(r, 'name')).toBe('Loadout 1');
    expect(pickText(r, 'line')).toBe('AEG Rifle · GBB Pistol');
    expect(findAll(pick(r), 'saved-pick-caret')).toHaveLength(1);
    expect(pick(r).getAttribute('aria-haspopup')).toBe('true');
    expect(pick(r).getAttribute('aria-label')).toBe(SAVED_TEXT.pickerName(1, 'Loadout 1', 'AEG Rifle · GBB Pistol', 0));
    expect(input(r).hidden).toBe(true);
    expect(node(r.root).all('button').filter((b) => b.classList.contains('saved-tab-button'))).toHaveLength(0);
  });

  it('follows the loadout switched to: its number, name and replicas', () => {
    const r = rig();
    addSecond(r);
    r.model.equip('primary', item('Cyber Pistol'));
    r.screen.refresh();
    expect(pickText(r, 'key')).toBe('2');
    expect(pickText(r, 'name')).toBe('Loadout 2');
    expect(pickText(r, 'line')).toContain('Cyber Pistol');
    key(r, '1');
    expect(pickText(r, 'key')).toBe('1');
    expect(pickText(r, 'name')).toBe('Loadout 1');
    expect(pickText(r, 'line')).toBe('AEG Rifle · GBB Pistol');
    expect(pick(r).getAttribute('aria-label')).toBe(SAVED_TEXT.pickerName(1, 'Loadout 1', 'AEG Rifle · GBB Pistol', 0));
  });

  it('gives the whole name and what it lacks as the button\'s tip, for a name cut short on it', () => {
    const r = rig();
    barButton(r, SAVED_TEXT.newShort).click(); // its name is open for typing
    typed(r, 'Long range woodlands');
    input(r).fire('keydown', { key: 'Enter' });
    expect(pick(r).title).toBe('Long range woodlands');
  });
});

describe('criterion 2: the list holds every loadout and New loadout; keys 1 to 5 and a pick switch', () => {
  it('lists each saved loadout as "N · Name" with what it carries, marks the current one, and ends with New loadout', () => {
    const r = rig();
    addSecond(r);
    r.saved.create(3);
    key(r, '2');
    const list = listOf(r);
    expect(list.isOpen()).toBe(true);
    expect(list.labels).toEqual(['1 · Loadout 1', '2 · Loadout 2', '4 · Loadout 4', SAVED_TEXT.newLoadout]);
    expect(list.details).toEqual(['AEG Rifle · GBB Pistol', 'AEG Rifle · GBB Pistol', 'AEG Rifle · GBB Pistol', SAVED_TEXT.newNote]);
    expect(list.items.map((b) => b.classList.contains('is-current'))).toEqual([false, true, false, false]);
    expect(list.items[1]!.getAttribute('aria-current')).toBe('true');
    expect(list.items[0]!.getAttribute('aria-current')).toBeNull();
  });

  it('lists no New loadout with every slot in use', () => {
    const r = rig();
    for (let i = 1; i < SAVED_LOADOUTS.slots; i++) addSecond(r);
    expect(r.saved.hasRoom()).toBe(false);
    const list = listOf(r);
    expect(list.labels).toHaveLength(SAVED_LOADOUTS.slots);
    expect(list.labels).not.toContain(SAVED_TEXT.newLoadout);
    expect(list.labels.at(-1)).toBe('5 · Loadout 5');
  });

  it('opens with ArrowDown on the button as well', () => {
    const r = rig();
    const ev = pick(r).fire('keydown', { key: 'ArrowDown' });
    expect(ev.defaultPrevented).toBe(true);
    expect(part(r.root, 'context-menu').hidden).toBe(false);
  });

  it('picking New loadout makes a copy of the loadout carried in the first free slot, carries it and opens its name for typing', () => {
    const r = rig();
    const before = r.changes();
    listOf(r).choose(SAVED_TEXT.newLoadout);
    expect(r.saved.views().map((v) => v?.name ?? null)).toEqual(['Loadout 1', 'Loadout 2', null, null, null]);
    expect(r.saved.current()).toBe(1);
    expect(r.changes()).toBe(before + 1);
    expect(pickText(r, 'key')).toBe('2');
    expect(input(r).hidden).toBe(false);
    expect(bar(r).classList.contains('is-renaming')).toBe(true);
    expect((input(r) as unknown as { value: string }).value).toBe('Loadout 2');
  });

  it('the New button does the same, and fills the first free slot even when a later one is in use', () => {
    const r = rig();
    r.saved.create(1);
    r.saved.create(3);
    r.screen.refresh();
    const before = r.changes();
    barButton(r, SAVED_TEXT.newShort).click();
    expect(r.saved.view(2)).not.toBeNull();
    expect(r.saved.current()).toBe(2);
    expect(r.changes()).toBe(before + 1);
    expect(input(r).hidden).toBe(false);
  });

  it('offers a hint for each of the keys 1 to 5, and only a filled slot answers', () => {
    const r = rig();
    const hints = r.screen.hints.filter((h) => /^[1-5]$/.test(h.keys[0]!));
    expect(hints.map((h) => h.keys[0])).toEqual(['1', '2', '3', '4', '5']);
    expect(hints.map((h) => h.code)).toEqual(['Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5']);
    key(r, '4'); // empty: nothing
    expect(r.saved.views().filter(Boolean)).toHaveLength(1);
    expect(r.saved.current()).toBe(0);
    expect(r.changes()).toBe(0);
  });

  it('switches with the keys: the carried cards and the model kit follow, and the game hears of it', () => {
    const r = rig();
    addSecond(r);
    // Slot 2 carries a Cyber Pistol in the primary slot; slot 1 keeps the AEG Rifle.
    r.model.equip('primary', item('Cyber Pistol'));
    r.screen.refresh();
    const kit2 = r.model.kit().slots.map((s) => s.replica.id);
    expect(carried(r).join('|')).toContain('Cyber Pistol');
    const before = r.changes();

    key(r, '1');
    expect(r.saved.current()).toBe(0);
    expect(r.changes()).toBe(before + 1);
    expect(carried(r).join('|')).not.toContain('Cyber Pistol');
    expect(carried(r).join('|')).toContain('AEG Rifle');
    expect(r.model.kit().slots.map((s) => s.replica.id)).not.toEqual(kit2);
    expect(pickText(r, 'name')).toBe('Loadout 1');

    key(r, '2');
    expect(carried(r).join('|')).toContain('Cyber Pistol');
    expect(r.model.kit().slots.map((s) => s.replica.id)).toEqual(kit2);
    expect(pickText(r, 'name')).toBe('Loadout 2');
  });

  it('switches with a pick from the list in the same way, and the list closes', () => {
    const r = rig();
    addSecond(r);
    r.model.equip('primary', item('Cyber Pistol'));
    r.screen.refresh();
    const kit2 = r.model.kit().slots.map((s) => s.replica.id);
    const before = r.changes();

    const list = listOf(r);
    list.choose('1 · Loadout 1');
    expect(list.isOpen()).toBe(false);
    expect(r.saved.current()).toBe(0);
    expect(r.changes()).toBe(before + 1);
    expect(carried(r).join('|')).not.toContain('Cyber Pistol');
    expect(r.model.kit().slots.map((s) => s.replica.id)).not.toEqual(kit2);

    listOf(r).choose('2 · Loadout 2');
    expect(r.saved.current()).toBe(1);
    expect(carried(r).join('|')).toContain('Cyber Pistol');
    expect(r.model.kit().slots.map((s) => s.replica.id)).toEqual(kit2);
  });

  it('does nothing when the key (or a pick) is for the loadout already carried', () => {
    const r = rig();
    key(r, '1');
    listOf(r).choose('1 · Loadout 1');
    expect(r.saved.current()).toBe(0);
    expect(r.changes()).toBe(0);
  });
});

describe('criterion 3: the buttons beside the dropdown, confirmations and rename', () => {
  const twoLoadouts = (): Rig => {
    const r = rig();
    addSecond(r);
    return r;
  };

  it('has Rename, Duplicate, New and Delete beside the dropdown, all enabled with two loadouts and room', () => {
    const r = twoLoadouts();
    const actions = (findAll(r.root, 'saved-actions')[0] as EventNode).all('button').map((b) => b.text);
    expect(actions).toEqual([SAVED_TEXT.rename, SAVED_TEXT.duplicate, SAVED_TEXT.newShort, SAVED_TEXT.delete]);
    for (const label of actions.slice(1)) expect(barButton(r, label).getAttribute('aria-disabled')).toBe('false');
  });

  it('offers no Duplicate and no New with every slot in use, on the bar or in the list', () => {
    const r = rig();
    for (let i = 1; i < SAVED_LOADOUTS.slots; i++) addSecond(r);
    expect(r.saved.hasRoom()).toBe(false);
    for (const label of [SAVED_TEXT.duplicate, SAVED_TEXT.newShort]) {
      expect(barButton(r, label).getAttribute('aria-disabled')).toBe('true');
      expect(barButton(r, label).title).toBe(SAVED_TEXT.full);
    }
    barButton(r, SAVED_TEXT.duplicate).click();
    barButton(r, SAVED_TEXT.newShort).click();
    expect(r.saved.views().filter(Boolean)).toHaveLength(SAVED_LOADOUTS.slots);
    expect(r.saved.current()).toBe(SAVED_LOADOUTS.slots - 1);
    expect(listOf(r).labels).not.toContain(SAVED_TEXT.newLoadout);
  });

  it('Delete asks first and removes only on confirm', () => {
    const r = twoLoadouts(); // current: slot 2
    barButton(r, SAVED_TEXT.delete).click();
    expect(dialog(r).open).toBe(true);
    expect(findAll(dialog(r), 'menu-dialog-title')[0]!.text).toBe(SAVED_TEXT.deleteTitle('Loadout 2'));
    expect(r.saved.view(1)).not.toBeNull();
    dialogButton(r, 'Cancel').click();
    expect(dialog(r).open).toBe(false);
    expect(r.saved.view(1)).not.toBeNull();
    expect(listOf(r).labels).toEqual(['1 · Loadout 1', '2 · Loadout 2', SAVED_TEXT.newLoadout]);

    barButton(r, SAVED_TEXT.delete).click();
    dialogButton(r, SAVED_TEXT.delete).click();
    expect(dialog(r).open).toBe(false);
    expect(r.saved.view(1)).toBeNull();
    expect(listOf(r).labels).toEqual(['1 · Loadout 1', SAVED_TEXT.newLoadout]);
  });

  it('deleting the current loadout says which one is carried instead, and carries it', () => {
    const r = twoLoadouts(); // current slot 2, next-after falls back to slot 1
    const before = r.changes();
    pick(r).fire('keydown', { key: 'Delete' });
    expect(dialog(r).open).toBe(true);
    expect(findAll(dialog(r), 'confirm-text')[0]!.text).toBe(SAVED_TEXT.deleteCurrentBody('Loadout 1'));
    dialogButton(r, SAVED_TEXT.delete).click();
    expect(r.saved.current()).toBe(0);
    expect(r.saved.view(1)).toBeNull();
    expect(r.changes()).toBe(before + 1);
    expect(pickText(r, 'key')).toBe('1');
    expect(pickText(r, 'name')).toBe('Loadout 1');
  });

  it('deleting the current loadout among three names the one the model carries next', () => {
    const r = twoLoadouts();
    r.saved.create(2);
    key(r, '1');
    const next = r.saved.view(r.saved.nextAfter(0))!;
    barButton(r, SAVED_TEXT.delete).click();
    expect(findAll(dialog(r), 'confirm-text')[0]!.text).toBe(SAVED_TEXT.deleteCurrentBody(next.name));
    dialogButton(r, SAVED_TEXT.delete).click();
    expect(r.saved.view(0)).toBeNull();
    expect(r.saved.current()).toBe(next.slot);
    expect(pickText(r, 'name')).toBe(next.name);
  });

  it('offers no Delete on the last loadout: not in the list, not on the bar, and the Delete key asks nothing', () => {
    const r = rig();
    expect(listOf(r).labels).toEqual(['1 · Loadout 1', SAVED_TEXT.newLoadout]);
    expect(barButton(r, SAVED_TEXT.delete).getAttribute('aria-disabled')).toBe('true');
    expect(barButton(r, SAVED_TEXT.delete).title).toBe(SAVED_TEXT.onlyOne);
    pick(r).fire('keydown', { key: 'Delete' });
    barButton(r, SAVED_TEXT.delete).click();
    expect(dialog(r).open).toBe(false);
    expect(r.saved.view(0)).not.toBeNull();
  });

  it('enables Delete once there are two, and disables it again when one is left', () => {
    const r = twoLoadouts();
    expect(barButton(r, SAVED_TEXT.delete).getAttribute('aria-disabled')).toBe('false');
    barButton(r, SAVED_TEXT.delete).click();
    dialogButton(r, SAVED_TEXT.delete).click();
    expect(barButton(r, SAVED_TEXT.delete).getAttribute('aria-disabled')).toBe('true');
  });

  it('renames inline: the box shows the name, Enter commits it to the dropdown and the model', () => {
    const r = twoLoadouts();
    barButton(r, SAVED_TEXT.rename).click();
    const box = input(r);
    expect(box.hidden).toBe(false);
    expect((box as unknown as { value: string }).value).toBe('Loadout 2');
    expect(box.getAttribute('aria-label')).toBe(SAVED_TEXT.nameLabel);
    typed(r, 'CQB rush');
    const ev = box.fire('keydown', { key: 'Enter' });
    expect(ev.defaultPrevented).toBe(true);
    expect(box.hidden).toBe(true);
    expect(pickText(r, 'name')).toBe('CQB rush');
    expect(r.saved.view(1)!.name).toBe('CQB rush');
    expect(listOf(r).labels).toContain('2 · CQB rush');
  });

  it('F2 on the dropdown starts the same rename', () => {
    const r = twoLoadouts();
    const ev = pick(r).fire('keydown', { key: 'F2' });
    expect(ev.defaultPrevented).toBe(true);
    expect(input(r).hidden).toBe(false);
    expect((input(r) as unknown as { value: string }).value).toBe('Loadout 2');
  });

  it('cancels a rename with Escape: the old name stays, and the Esc goes no further (it would be Back)', () => {
    const r = twoLoadouts();
    barButton(r, SAVED_TEXT.rename).click();
    typed(r, 'Nope');
    const ev = input(r).fire('keydown', { key: 'Escape' });
    expect(ev.stopped).toBe(true);
    expect(input(r).hidden).toBe(true);
    expect(pickText(r, 'name')).toBe('Loadout 2');
    expect(r.saved.view(1)!.name).toBe('Loadout 2');
  });

  it('keeps the old name when the typed one is empty', () => {
    const r = twoLoadouts();
    barButton(r, SAVED_TEXT.rename).click();
    typed(r, '   ');
    input(r).fire('keydown', { key: 'Enter' });
    expect(pickText(r, 'name')).toBe('Loadout 2');
    expect(r.saved.view(1)!.name).toBe('Loadout 2');
  });

  it('limits the typed name to the name length', () => {
    const r = rig();
    expect((input(r) as unknown as { maxLength: number }).maxLength).toBe(SAVED_LOADOUTS.nameMax);
  });

  it('Duplicate fills the first free slot with a "copy", carries it, hands the game the change and opens its name', () => {
    const r = twoLoadouts(); // current: slot 2
    r.model.equip('primary', item('Cyber Pistol'));
    r.screen.refresh();
    const before = r.changes();
    barButton(r, SAVED_TEXT.duplicate).click();
    expect(r.saved.view(2)!.name).toBe('Loadout 2 copy');
    expect(r.saved.current()).toBe(2);
    expect(r.changes()).toBe(before + 1);
    expect(pickText(r, 'key')).toBe('3');
    expect(pickText(r, 'name')).toBe('Loadout 2 copy');
    expect(pickText(r, 'line')).toContain('Cyber Pistol'); // the copy carries what the original did
    expect(carried(r).join('|')).toContain('Cyber Pistol');
    expect(input(r).hidden).toBe(false);
    expect((input(r) as unknown as { value: string }).value).toBe('Loadout 2 copy');
    expect(r.saved.view(1)!.name).toBe('Loadout 2'); // the original is untouched
  });
});

describe('criterion 4: the Match screen picks a saved loadout', () => {
  const picker = (r: Rig): { picker: LoadoutPicker; picked: () => number; managed: () => number; items: () => EventNode[] } => {
    let picked = 0;
    let managed = 0;
    const p = new LoadoutPicker(r.saved, () => picked++, () => managed++);
    p.update();
    const items = (): EventNode[] => (findAll(node(p.menu.root), 'context-item') as EventNode[]).filter((b) => !b.hidden);
    return { picker: p, picked: () => picked, managed: () => managed, items };
  };
  const label = (b: EventNode): string => part(b, 'context-label').text;

  it('names the loadout carried on its button and follows a switch', () => {
    const r = rig();
    const p = picker(r);
    const name = part(node(p.picker.root), 'loadout-pick-name');
    expect(name.text).toBe('Loadout 1');
    expect(node(p.picker.root).getAttribute('aria-label')).toBe(SAVED_TEXT.pickName('Loadout 1'));
    r.saved.create(1);
    r.saved.rename(1, 'Long range');
    p.picker.update();
    expect(name.text).toBe('Long range');
  });

  it('gives the name in full and what it carries as the button\'s tip, for a name cut short on it (BP5)', () => {
    const r = rig();
    r.saved.create(1);
    r.saved.rename(1, 'Long range woodlands');
    const p = picker(r);
    expect(node(p.picker.root).title).toBe('Long range woodlands · AEG Rifle · GBB Pistol');
  });

  it('lists every saved loadout, marks the current one, and ends with Manage loadouts', () => {
    const r = rig();
    r.saved.create(1);
    r.saved.rename(1, 'Long range');
    r.saved.create(3);
    const p = picker(r);
    node(p.picker.root).click();
    expect(node(p.picker.menu.root).hidden).toBe(false);
    expect(p.items().map(label)).toEqual(['Loadout 1', 'Long range', 'Loadout 4', SAVED_TEXT.manage]);
    expect(p.items().map((b) => b.classList.contains('is-current'))).toEqual([false, false, true, false]);
    expect(p.items()[2]!.getAttribute('aria-current')).toBe('true');
    expect(part(p.items()[0]!, 'context-detail').text).toBe('AEG Rifle · GBB Pistol');
  });

  it('a pick carries that loadout and calls onPick; the current one does nothing', () => {
    const r = rig();
    r.saved.create(1);
    r.saved.rename(1, 'Long range');
    const p = picker(r);
    node(p.picker.root).click();
    p.items()[0]!.click(); // Loadout 1
    expect(r.saved.current()).toBe(0);
    expect(p.picked()).toBe(1);
    node(p.picker.root).click();
    p.items()[0]!.click(); // already carried
    expect(p.picked()).toBe(1);
    expect(r.saved.current()).toBe(0);
  });

  it('Manage loadouts calls the Loadout action and picks nothing', () => {
    const r = rig();
    const p = picker(r);
    node(p.picker.root).click();
    p.items().at(-1)!.click();
    expect(p.managed()).toBe(1);
    expect(p.picked()).toBe(0);
  });

  it('opens with ArrowDown on the button as well', () => {
    const r = rig();
    const p = picker(r);
    node(p.picker.root).fire('keydown', { key: 'ArrowDown' });
    expect(node(p.picker.menu.root).hidden).toBe(false);
  });
});


describe('criterion 5: locked gear is said in words', () => {
  it('counts what is locked on the dropdown and lists it, with what plays instead, under it', () => {
    const own = owning([...STARTERS, item('Red Dot'), item('Cyber Pistol')]);
    const r = rig(own);
    r.model.setFit(AEG, 'optic', item('Red Dot'));
    r.model.equip('primary', item('Cyber Pistol'));
    r.screen.refresh();
    const box = findAll(r.root, 'saved-locked')[0] as EventNode;
    expect(box.hidden).toBe(true);
    expect(pickText(r, 'line')).not.toContain('locked');

    own.items.delete(id('Red Dot'));
    own.items.delete(id('Cyber Pistol'));
    r.screen.refresh();
    const line = pickText(r, 'line');
    expect(line).toContain(SAVED_TEXT.locked(r.saved.view(0)!.missing.length));
    expect(line).toMatch(/\d+ locked$/);
    expect(pick(r).classList.contains('has-locked')).toBe(true);
    expect(pick(r).getAttribute('aria-label')).toContain('locked');
    expect(listOf(r).details[0]).toMatch(/\d+ locked$/);
    expect(box.hidden).toBe(false);
    const items = (findAll(box, 'saved-locked-list')[0] as EventNode).children.map((c) => c.text);
    const missing = r.saved.view(0)!.missing;
    expect(items).toHaveLength(missing.length);
    expect(items.length).toBeGreaterThanOrEqual(2);
    expect(items.some((t) => t.startsWith('Cyber Pistol (locked): ') && t.endsWith(' instead'))).toBe(true);
    expect(items).toContain('Red Dot (locked): nothing in its place');
    for (const t of items) expect(pick(r).title).toContain(t);
    // The list sits under the dropdown, in the same section.
    const section = bar(r);
    const order = section.children.map((c) => c.classList.contains('saved-locked'));
    expect(order.indexOf(true)).toBeGreaterThan(section.children.findIndex((c) => findAll(c, 'saved-pick').length > 0));

    own.items.add(id('Red Dot'));
    own.items.add(id('Cyber Pistol'));
    r.screen.refresh();
    expect(box.hidden).toBe(true);
    expect(pickText(r, 'line')).not.toContain('locked');
    expect(pick(r).classList.contains('has-locked')).toBe(false);
  });

  it("shows another loadout's locked gear in the list only: the list under the dropdown is the current loadout's", () => {
    const own = owning([...STARTERS, item('Red Dot')]);
    const r = rig(own);
    addSecond(r);
    r.model.setFit(AEG, 'optic', item('Red Dot'));
    key(r, '1');
    own.items.delete(id('Red Dot'));
    r.screen.refresh();
    expect(listOf(r).details[1]).toMatch(/1 locked$/);
    expect(pickText(r, 'line')).not.toContain('locked');
    expect((findAll(r.root, 'saved-locked')[0] as EventNode).hidden).toBe(true);
  });

  it('says dev gear is off, not locked, in the words of the list', () => {
    expect(SAVED_TEXT.missing('Red Dot', true, null)).toBe('Red Dot (dev gear: Dev content is off): nothing in its place');
    expect(SAVED_TEXT.missing('Red Dot', false, 'Iron Sights')).toBe('Red Dot (locked): Iron Sights instead');
  });
});

describe('criterion 6: bots do not read the saved loadouts', () => {
  /** The bot code's source text, by path (Vite reads the files raw; no test files). */
  const botSource = import.meta.glob(['../../ai/**/*.ts', '!../../ai/**/*.test.ts', '../../pool/botKit.ts', '../../pool/gameBotKits.ts', '../../pool/kit.ts', '../../config/bots.ts'], {
    query: '?raw',
    import: 'default',
    eager: true,
  }) as Record<string, string>;

  it('imports the saved loadouts nowhere in the bot code (src/ai, the bot kits, the kit and the bot config)', () => {
    const bot = Object.entries(botSource);
    expect(bot.length).toBeGreaterThan(10);
    const offenders = bot.filter(([, text]) => /savedLoadouts|SavedLoadouts|airsoft\.loadouts/.test(text)).map(([path]) => path);
    expect(offenders).toEqual([]);
  });

  it('picks the same bot kits before and after the player switches loadout', async () => {
    const { botKitSeed, botKitSlots, pickBotKit } = await import('../../pool/botKit');
    const { GAME_BOT_KITS } = await import('../../pool/gameBotKits');
    const r = rig();
    const roll = () =>
      JSON.stringify(
        [3, 4, 5].map((id) => {
          const kit = pickBotKit(GAME_BOT_KITS, 'hard', pool, botKitSeed(1234, id));
          return kit ? botKitSlots(pool, kit) : null;
        }),
      );
    const before = roll();
    addSecond(r);
    r.model.equip('primary', item('Cyber Pistol'));
    expect(roll()).toBe(before);
  });
});
