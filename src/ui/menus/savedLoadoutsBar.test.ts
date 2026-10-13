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
 * SL1 acceptance on the fake DOM: the five tabs of the Loadout (current one marked, empty ones offer New loadout, keys 1
 * to 5), the tab's right-click menu with its confirmations, inline rename, locked gear in words, the Match screen's pick,
 * and bots untouched. The model itself is in pool/savedLoadouts.test.ts.
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

const tabs = (r: Rig): EventNode[] => findAll(r.root, 'saved-tab') as EventNode[];
const part = (tab: EventNode, cls: string): EventNode => findAll(tab, cls)[0] as EventNode;
const button = (tab: EventNode): EventNode => tab.children[0] as EventNode;
const input = (tab: EventNode): EventNode => tab.children[1] as EventNode;
const key = (r: Rig, k: string): void => void r.screen.hints.find((h) => h.keys.includes(k))!.run?.();
const names = (r: Rig): string[] => tabs(r).map((t) => part(t, 'saved-tab-name').text);
const carried = (r: Rig): string[] => (findAll(r.root, 'gear-slot') as EventNode[]).filter((b) => !b.classList.contains('gear-grenades')).map((b) => b.text);

function menuFor(r: Rig, slot: number): { labels: string[]; choose: (label: string) => void; isOpen: () => boolean } {
  button(tabs(r)[slot]!).fire('contextmenu', { clientX: 20, clientY: 20 });
  const menu = findAll(r.root, 'context-menu')[0] as EventNode;
  const shown = (): EventNode[] => (findAll(menu, 'context-item') as EventNode[]).filter((b) => !b.hidden);
  return {
    labels: shown().map((b) => part(b, 'context-label').text),
    choose: (label) => shown().find((b) => part(b, 'context-label').text === label)!.click(),
    isOpen: () => !menu.hidden,
  };
}

const dialog = (r: Rig): EventNode => findAll(r.root, 'confirm-dialog')[0] as EventNode;
const dialogButton = (r: Rig, label: string): EventNode => dialog(r).all('button').find((b) => b.text === label)!;
const barButton = (r: Rig, label: string): EventNode =>
  (findAll(r.root, 'saved-actions')[0] as EventNode).all('button').find((b) => b.text === label)!;

describe('criterion 1: five tabs, the current one marked', () => {
  it('draws one tab per slot, numbered 1 to 5, and tags only the current one', () => {
    const r = rig();
    expect(tabs(r)).toHaveLength(SAVED_LOADOUTS.slots);
    expect(SAVED_LOADOUTS.slots).toBe(5);
    tabs(r).forEach((t, i) => expect(part(t, 'saved-tab-key').text).toBe(String(i + 1)));
    const [first, second] = tabs(r) as [EventNode, EventNode];
    expect(first.classList.contains('is-current')).toBe(true);
    expect(button(first).getAttribute('aria-current')).toBe('true');
    expect(part(first, 'saved-tab-tag').text).toBe(SAVED_TEXT.current);
    expect(second.classList.contains('is-current')).toBe(false);
    expect(button(second).getAttribute('aria-current')).toBeNull();
    expect(part(second, 'saved-tab-tag').text).toBe('');
  });

  it('moves the mark to the tab switched to', () => {
    const r = rig();
    button(tabs(r)[1]!).click(); // empty: becomes a new loadout and current
    expect(tabs(r).map((t) => t.classList.contains('is-current'))).toEqual([false, true, false, false, false]);
    expect(tabs(r).map((t) => part(t, 'saved-tab-tag').text)).toEqual(['', SAVED_TEXT.current, '', '', '']);
    expect(button(tabs(r)[1]!).getAttribute('aria-current')).toBe('true');
    expect(button(tabs(r)[0]!).getAttribute('aria-current')).toBeNull();
  });

  it('names the replicas a tab carries on its second line', () => {
    const r = rig();
    expect(part(tabs(r)[0]!, 'saved-tab-line').text).toBe('AEG Rifle · GBB Pistol');
  });
});

describe('criterion 2: an empty tab offers New loadout; keys 1 to 5 and a click switch', () => {
  it('shows an empty tab as New loadout, with the note that it starts as a copy, and no Current tag', () => {
    const r = rig();
    const empty = tabs(r)[2]!;
    expect(empty.classList.contains('is-empty')).toBe(true);
    expect(part(empty, 'saved-tab-name').text).toBe(SAVED_TEXT.newLoadout);
    expect(part(empty, 'saved-tab-line').text).toBe(SAVED_TEXT.newNote);
    expect(button(empty).getAttribute('aria-label')).toBe(SAVED_TEXT.emptyTabName(3));
    expect(tabs(r)[0]!.classList.contains('is-empty')).toBe(false);
  });

  it('clicking an empty tab makes a copy of the loadout carried, carries it and opens its name for typing', () => {
    const r = rig();
    const before = r.changes();
    button(tabs(r)[1]!).click();
    expect(names(r)).toEqual(['Loadout 1', 'Loadout 2', SAVED_TEXT.newLoadout, SAVED_TEXT.newLoadout, SAVED_TEXT.newLoadout]);
    expect(r.saved.current()).toBe(1);
    expect(r.changes()).toBe(before + 1);
    expect(input(tabs(r)[1]!).hidden).toBe(false);
    expect(tabs(r)[1]!.classList.contains('is-renaming')).toBe(true);
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
    button(tabs(r)[1]!).click();
    input(tabs(r)[1]!).fire('keydown', { key: 'Enter' });
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
    expect(tabs(r)[0]!.classList.contains('is-current')).toBe(true);

    key(r, '2');
    expect(carried(r).join('|')).toContain('Cyber Pistol');
    expect(r.model.kit().slots.map((s) => s.replica.id)).toEqual(kit2);
  });

  it('does nothing when the key (or a click) is for the loadout already carried', () => {
    const r = rig();
    key(r, '1');
    button(tabs(r)[0]!).click();
    expect(r.changes()).toBe(0);
  });
});

describe('criterion 3: the tab menu, confirmations and rename', () => {
  const twoLoadouts = (): Rig => {
    const r = rig();
    button(tabs(r)[1]!).click();
    input(tabs(r)[1]!).fire('keydown', { key: 'Enter' });
    return r;
  };

  it('offers Rename, Duplicate and Delete on the current loadout, and Use and Replace on another', () => {
    const r = twoLoadouts(); // current: slot 2
    expect(menuFor(r, 1).labels).toEqual([SAVED_TEXT.rename, SAVED_TEXT.duplicate, SAVED_TEXT.delete]);
    expect(menuFor(r, 0).labels).toEqual([SAVED_TEXT.use, SAVED_TEXT.rename, SAVED_TEXT.duplicate, SAVED_TEXT.replace, SAVED_TEXT.delete]);
  });

  it('offers New loadout alone on an empty tab, and a right-click is the tab menu, not the browser menu', () => {
    const r = twoLoadouts();
    const ev = button(tabs(r)[3]!).fire('contextmenu', { clientX: 5, clientY: 5 });
    expect(ev.defaultPrevented).toBe(true);
    expect(menuFor(r, 3).labels).toEqual([SAVED_TEXT.newLoadout]);
  });

  it('offers no Duplicate with every slot in use', () => {
    const r = rig();
    for (let i = 1; i < SAVED_LOADOUTS.slots; i++) {
      button(tabs(r)[i]!).click();
      input(tabs(r)[i]!).fire('keydown', { key: 'Enter' });
    }
    expect(r.saved.hasRoom()).toBe(false);
    expect(menuFor(r, 0).labels).not.toContain(SAVED_TEXT.duplicate);
    expect(barButton(r, SAVED_TEXT.duplicate).getAttribute('aria-disabled')).toBe('true');
  });

  it('Use switches at once', () => {
    const r = twoLoadouts();
    menuFor(r, 0).choose(SAVED_TEXT.use);
    expect(r.saved.current()).toBe(0);
  });

  it('Delete asks first and removes only on confirm', () => {
    const r = twoLoadouts();
    menuFor(r, 0).choose(SAVED_TEXT.delete);
    expect(dialog(r).open).toBe(true);
    expect(findAll(dialog(r), 'menu-dialog-title')[0]!.text).toBe(SAVED_TEXT.deleteTitle('Loadout 1'));
    expect(r.saved.view(0)).not.toBeNull();
    dialogButton(r, 'Cancel').click();
    expect(dialog(r).open).toBe(false);
    expect(r.saved.view(0)).not.toBeNull();
    expect(names(r)[0]).toBe('Loadout 1');

    menuFor(r, 0).choose(SAVED_TEXT.delete);
    dialogButton(r, SAVED_TEXT.delete).click();
    expect(dialog(r).open).toBe(false);
    expect(r.saved.view(0)).toBeNull();
    expect(names(r)[0]).toBe(SAVED_TEXT.newLoadout);
    expect(tabs(r)[0]!.classList.contains('is-empty')).toBe(true);
  });

  it('deleting the current loadout says which one is carried instead, and carries it', () => {
    const r = twoLoadouts(); // current slot 2, next-after falls back to slot 1
    const before = r.changes();
    button(tabs(r)[1]!).fire('keydown', { key: 'Delete' });
    expect(findAll(dialog(r), 'confirm-text')[0]!.text).toBe(SAVED_TEXT.deleteCurrentBody('Loadout 1'));
    dialogButton(r, SAVED_TEXT.delete).click();
    expect(r.saved.current()).toBe(0);
    expect(r.changes()).toBe(before + 1);
    expect(tabs(r)[0]!.classList.contains('is-current')).toBe(true);
  });

  it('Replace asks first and copies the loadout carried over the other only on confirm', () => {
    const r = twoLoadouts(); // current: slot 2 (a copy of 1)
    r.model.equip('primary', item('Cyber Pistol'));
    r.screen.refresh();
    const was = r.saved.view(0)!.replicas.map((a) => a?.name);
    menuFor(r, 0).choose(SAVED_TEXT.replace);
    expect(dialog(r).open).toBe(true);
    expect(findAll(dialog(r), 'confirm-text')[0]!.text).toBe(SAVED_TEXT.replaceBody('Loadout 1'));
    expect(r.saved.view(0)!.replicas.map((a) => a?.name)).toEqual(was);
    dialogButton(r, 'Cancel').click();
    expect(r.saved.view(0)!.replicas.map((a) => a?.name)).toEqual(was);

    menuFor(r, 0).choose(SAVED_TEXT.replace);
    dialogButton(r, SAVED_TEXT.replace).click();
    expect(r.saved.view(0)!.replicas.map((a) => a?.name)).toContain('Cyber Pistol');
    expect(r.saved.view(0)!.name).toBe('Loadout 1'); // keeps its name
    expect(r.saved.current()).toBe(1); // and the one carried is unchanged
    expect(part(tabs(r)[0]!, 'saved-tab-line').text).toContain('Cyber Pistol');
  });

  it('offers no Delete on the last loadout: not in the menu, not on the bar, and the Delete key asks nothing', () => {
    const r = rig();
    expect(menuFor(r, 0).labels).not.toContain(SAVED_TEXT.delete);
    expect(barButton(r, SAVED_TEXT.delete).getAttribute('aria-disabled')).toBe('true');
    expect(barButton(r, SAVED_TEXT.delete).title).toBe(SAVED_TEXT.onlyOne);
    button(tabs(r)[0]!).fire('keydown', { key: 'Delete' });
    barButton(r, SAVED_TEXT.delete).click();
    expect(dialog(r).open).toBe(false);
    expect(r.saved.view(0)).not.toBeNull();
  });

  it('enables Delete once there are two', () => {
    const r = twoLoadouts();
    expect(barButton(r, SAVED_TEXT.delete).getAttribute('aria-disabled')).toBe('false');
  });

  it('renames inline: the box shows the name, Enter commits it to the tab and the model', () => {
    const r = twoLoadouts();
    menuFor(r, 0).choose(SAVED_TEXT.rename);
    const box = input(tabs(r)[0]!);
    expect(box.hidden).toBe(false);
    expect((box as unknown as { value: string }).value).toBe('Loadout 1');
    expect(box.getAttribute('aria-label')).toBe(SAVED_TEXT.nameLabel);
    (box as unknown as { value: string }).value = 'CQB rush';
    const ev = box.fire('keydown', { key: 'Enter' });
    expect(ev.defaultPrevented).toBe(true);
    expect(box.hidden).toBe(true);
    expect(names(r)[0]).toBe('CQB rush');
    expect(r.saved.view(0)!.name).toBe('CQB rush');
  });

  it('cancels a rename with Escape: the old name stays, and the Esc goes no further (it would be Back)', () => {
    const r = twoLoadouts();
    menuFor(r, 0).choose(SAVED_TEXT.rename);
    const box = input(tabs(r)[0]!);
    (box as unknown as { value: string }).value = 'Nope';
    const ev = box.fire('keydown', { key: 'Escape' });
    expect(ev.stopped).toBe(true);
    expect(box.hidden).toBe(true);
    expect(names(r)[0]).toBe('Loadout 1');
    expect(r.saved.view(0)!.name).toBe('Loadout 1');
  });

  it('keeps the old name when the typed one is empty', () => {
    const r = twoLoadouts();
    menuFor(r, 0).choose(SAVED_TEXT.rename);
    (input(tabs(r)[0]!) as unknown as { value: string }).value = '   ';
    input(tabs(r)[0]!).fire('keydown', { key: 'Enter' });
    expect(names(r)[0]).toBe('Loadout 1');
  });

  it('limits the typed name to the name length', () => {
    const r = rig();
    expect((input(tabs(r)[0]!) as unknown as { maxLength: number }).maxLength).toBe(SAVED_LOADOUTS.nameMax);
  });

  it('Duplicate fills the first free slot with a "copy" and opens its name', () => {
    const r = twoLoadouts();
    menuFor(r, 0).choose(SAVED_TEXT.duplicate);
    expect(names(r)[2]).toBe('Loadout 1 copy');
    expect(input(tabs(r)[2]!).hidden).toBe(false);
    expect(r.saved.current()).toBe(1); // the one carried stays
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
  it('counts what is locked on the tab and lists it, with what plays instead, under the tabs', () => {
    const own = owning([...STARTERS, item('Red Dot'), item('Cyber Pistol')]);
    const r = rig(own);
    r.model.setFit(AEG, 'optic', item('Red Dot'));
    r.model.equip('primary', item('Cyber Pistol'));
    r.screen.refresh();
    const box = findAll(r.root, 'saved-locked')[0] as EventNode;
    expect(box.hidden).toBe(true);
    expect(part(tabs(r)[0]!, 'saved-tab-line').text).not.toContain('locked');

    own.items.delete(id('Red Dot'));
    own.items.delete(id('Cyber Pistol'));
    r.screen.refresh();
    const line = part(tabs(r)[0]!, 'saved-tab-line').text;
    expect(line).toContain(SAVED_TEXT.locked(r.saved.view(0)!.missing.length));
    expect(line).toMatch(/\d+ locked$/);
    expect(tabs(r)[0]!.classList.contains('has-locked')).toBe(true);
    expect(button(tabs(r)[0]!).getAttribute('aria-label')).toContain('locked');
    expect(box.hidden).toBe(false);
    const items = (findAll(box, 'saved-locked-list')[0] as EventNode).children.map((c) => c.text);
    const missing = r.saved.view(0)!.missing;
    expect(items).toHaveLength(missing.length);
    expect(items.length).toBeGreaterThanOrEqual(2);
    expect(items.some((t) => t.startsWith('Cyber Pistol (locked): ') && t.endsWith(' instead'))).toBe(true);
    expect(items).toContain('Red Dot (locked): nothing in its place');

    own.items.add(id('Red Dot'));
    own.items.add(id('Cyber Pistol'));
    r.screen.refresh();
    expect(box.hidden).toBe(true);
    expect(part(tabs(r)[0]!, 'saved-tab-line').text).not.toContain('locked');
  });

  it("shows another tab's locked gear on that tab only", () => {
    const own = owning([...STARTERS, item('Red Dot')]);
    const r = rig(own);
    button(tabs(r)[1]!).click();
    input(tabs(r)[1]!).fire('keydown', { key: 'Enter' });
    r.model.setFit(AEG, 'optic', item('Red Dot'));
    key(r, '1');
    own.items.delete(id('Red Dot'));
    r.screen.refresh();
    expect(part(tabs(r)[1]!, 'saved-tab-line').text).toMatch(/1 locked$/);
    expect(part(tabs(r)[0]!, 'saved-tab-line').text).not.toContain('locked');
    expect((findAll(r.root, 'saved-locked')[0] as EventNode).hidden).toBe(true); // the list is the current loadout's
  });

  it('says dev gear is off, not locked, in the words of the list', () => {
    expect(SAVED_TEXT.missing('Red Dot', true, null)).toBe('Red Dot (dev gear: Dev content is off): nothing in its place');
    expect(SAVED_TEXT.missing('Red Dot', false, 'Iron Sights')).toBe('Red Dot (locked): Iron Sights instead');
  });
});

describe('criterion 6: bots do not read the saved loadouts', () => {
  /** The bot code's source text, by path (Vite reads the files raw; no test files). */
  const botSource = import.meta.glob(['../../ai/**/*.ts', '!../../ai/**/*.test.ts', '../../pool/botKit.ts', '../../pool/kit.ts', '../../config/bots.ts'], {
    query: '?raw',
    import: 'default',
    eager: true,
  }) as Record<string, string>;

  it('imports the saved loadouts nowhere in the bot code (src/ai, the bot kit, the kit and the bot config)', () => {
    const bot = Object.entries(botSource);
    expect(bot.length).toBeGreaterThan(10);
    const offenders = bot.filter(([, text]) => /savedLoadouts|SavedLoadouts|airsoft\.loadouts/.test(text)).map(([path]) => path);
    expect(offenders).toEqual([]);
  });

  it('rolls the same bot kit before and after the player switches loadout', async () => {
    const { rolledKit } = await import('../../pool/botKit');
    const r = rig();
    const loadout = r.model.kit().slots.map((s) => s.replica);
    const roll = () => JSON.stringify(rolledKit(pool, loadout, 1234));
    const before = roll();
    button(tabs(r)[1]!).click();
    input(tabs(r)[1]!).fire('keydown', { key: 'Enter' });
    r.model.equip('primary', item('Cyber Pistol'));
    expect(roll()).toBe(before);
  });
});
