import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import poolText from '../../../pool.md?raw';
import { ARMORY_TEXT } from '../../config/menus';
import { newCollection } from '../../pool/collection';
import { loadPool } from '../../pool/pool';
import { ArmoryScreen } from './armoryScreen';
import { EventNode, type FakePage, stubMenuPage } from './menuTestSupport';

/**
 * The Armory's collection scraps through a right-click menu (M100): no Scrap buttons on the cards, a short line under the
 * heading, and a small menu at the pointer (or from the keyboard on a focused card) with the same choices and amounts.
 */
const pool = loadPool(poolText);
const common = pool.tiers.find((t) => t.id === 'common')!;
const FIRST = pool.assets[0]!.id;

let page: FakePage;
beforeEach(() => {
  page = stubMenuPage();
});
afterEach(() => vi.unstubAllGlobals());

function setup(copies: number, onChange: () => boolean | void = () => false) {
  const c = newCollection(pool, 7);
  c.owned[`${FIRST}@common`] = copies;
  c.fc = 1000;
  let changes = 0;
  const screen = new ArmoryScreen({ pool: () => pool, collection: () => c, equipped: () => [], onChange: () => (changes++, onChange()) });
  const root = screen.root as unknown as EventNode;
  const menu = root.querySelector('.context-menu')!;
  return {
    c,
    screen,
    root,
    menu,
    changes: () => changes,
    row: (id = FIRST): EventNode | null => root.querySelector(`[data-action="spares-${id}"]`),
    choices: (): EventNode[] => menu.all('button').filter((b) => !b.hidden),
  };
}

describe('the collection has no Scrap buttons on its cards (M100)', () => {
  it('draws no button at all inside a card, even with spares to scrap', () => {
    const a = setup(4);
    const cards = a.root.querySelectorAll('.armory-row');
    expect(cards.length).toBeGreaterThan(0);
    expect(a.row()).not.toBeNull();
    for (const card of cards) expect(card.all('button'), card.text).toEqual([]);
    expect(a.root.querySelectorAll('.armory-owned').flatMap((o) => o.all('button')).map((b) => b.text)).toEqual([expect.stringContaining(ARMORY_TEXT.scrapAll)]);
  });

  it('says under the collection heading to right-click an item, and keeps Scrap all spares as it was', () => {
    const a = setup(4);
    const owned = a.root.querySelector('.armory-owned')!;
    const kinds = owned.children.map((k) => k.className);
    expect(kinds.indexOf('menu-readout armory-scrap-hint')).toBe(1);
    expect(owned.querySelector('.armory-scrap-hint')!.textContent).toBe('Right-click an item to scrap its spares.');
    const all = a.root.querySelector('[data-action="scrap-all"]')!;
    expect(all.text).toBe(`${ARMORY_TEXT.scrapAll} (+${(3 * common.scrapFc).toLocaleString('en-GB')} FC)`);
    // It still asks first.
    all.click();
    expect(a.c.owned[`${FIRST}@common`]).toBe(4);
  });
});

describe('a right-click on a card opens its scrap menu (M100)', () => {
  it('opens at the pointer on contextmenu, stopping the browser\'s own menu, with Scrap 1 and Scrap N and their FC', () => {
    const a = setup(4);
    const e = a.row()!.fire('contextmenu', { clientX: 300, clientY: 200 });
    expect(e.defaultPrevented).toBe(true);
    expect(a.menu.hidden).toBe(false);
    expect(Number.parseInt(a.menu.style.left!)).toBeGreaterThanOrEqual(300);
    expect(Number.parseInt(a.menu.style.left!)).toBeLessThanOrEqual(306);
    expect(a.choices().map((b) => b.text)).toEqual([
      `${ARMORY_TEXT.scrapOne} (+${common.scrapFc.toLocaleString('en-GB')} FC)`,
      `${ARMORY_TEXT.scrap} 3 (+${(3 * common.scrapFc).toLocaleString('en-GB')} FC)`,
    ]);
    // Buttons with names, naming the item and the pay.
    expect(a.choices().map((b) => b.getAttribute('aria-label'))).toEqual([
      expect.stringMatching(/^Scrap 1 Common .+ for \d/),
      expect.stringMatching(/^Scrap 3 spare .+ for \d/),
    ]);
  });

  it('offers only Scrap 1 when there is a single spare', () => {
    const a = setup(2);
    a.row()!.fire('contextmenu', { clientX: 50, clientY: 60 });
    expect(a.choices().map((b) => b.text)).toEqual([`${ARMORY_TEXT.scrapOne} (+${common.scrapFc.toLocaleString('en-GB')} FC)`]);
  });

  it('Scrap 1 scraps one spare of that item, pays its FC, saves, closes the menu and puts the keyboard back on the card', () => {
    const a = setup(4);
    a.row()!.fire('contextmenu', { clientX: 10, clientY: 10 });
    a.choices()[0]!.click();
    expect(a.c.owned[`${FIRST}@common`]).toBe(3);
    expect(a.c.fc).toBe(1000 + common.scrapFc);
    expect(a.changes()).toBe(1);
    expect([a.menu.hidden, page.listenerCount()]).toEqual([true, 0]);
    expect(page.document.activeElement).toBe(a.row());
  });

  it('Scrap N scraps every spare of that item and keeps the best copy', () => {
    const a = setup(4);
    a.row()!.fire('contextmenu', { clientX: 10, clientY: 10 });
    a.choices()[1]!.click();
    expect(a.c.owned[`${FIRST}@common`]).toBe(1);
    expect(a.c.fc).toBe(1000 + 3 * common.scrapFc);
    expect([a.menu.hidden, a.changes()]).toEqual([true, 1]);
  });

  it('scraps the card that was right-clicked, not another that also has spares', () => {
    const a = setup(3);
    const other = pool.assets.find((x) => x.id !== FIRST && a.row(x.id) === null)!;
    a.c.owned[`${other.id}@common`] = 3;
    a.screen.refresh();
    a.row(other.id)!.fire('contextmenu', { clientX: 10, clientY: 10 });
    a.choices()[0]!.click();
    expect([a.c.owned[`${other.id}@common`], a.c.owned[`${FIRST}@common`]]).toEqual([2, 3]);
  });

  it('a card with no spare has no menu and is not a tab stop', () => {
    const a = setup(1);
    expect(a.row()).toBeNull();
    const stops = a.root.querySelectorAll('.armory-row').filter((r) => r.tabIndex === 0);
    expect(stops).toEqual([]);
    a.c.owned[`${FIRST}@common`] = 3;
    a.screen.refresh();
    expect(a.root.querySelectorAll('.armory-row').filter((r) => r.tabIndex === 0)).toEqual([a.row()]);
  });

  it('a refused scrap (another tab saved first) shows the notice, as the buttons did', () => {
    const a = setup(4, () => true);
    a.row()!.fire('contextmenu', { clientX: 10, clientY: 10 });
    a.choices()[0]!.click();
    expect(a.root.querySelector('.armory-notice')!.textContent).toBe(ARMORY_TEXT.reloaded);
  });
});

describe('the same menu from the keyboard (M100)', () => {
  it('opens on the ContextMenu key and on Shift+F10 when a card is focused, with the same choices', () => {
    const a = setup(4);
    const row = a.row()!;
    const viaContextMenuKey = row.fire('keydown', { key: 'ContextMenu' });
    expect(viaContextMenuKey.defaultPrevented).toBe(true);
    const first = a.choices().map((b) => b.text);
    expect(first).toHaveLength(2);
    a.screen.refresh();
    expect(a.menu.hidden).toBe(true);
    const viaShiftF10 = a.row()!.fire('keydown', { key: 'F10', shiftKey: true });
    expect(viaShiftF10.defaultPrevented).toBe(true);
    expect(a.choices().map((b) => b.text)).toEqual(first);
    expect(page.document.activeElement).toBe(a.choices()[0]);
  });

  it('ignores F10 alone and other keys, and a card is a tab stop with a name that tells how to open it', () => {
    const a = setup(4);
    const row = a.row()!;
    expect(row.fire('keydown', { key: 'F10' }).defaultPrevented).toBe(false);
    expect(row.fire('keydown', { key: 'Enter' }).defaultPrevented).toBe(false);
    expect(a.menu.hidden).toBe(true);
    expect([row.tabIndex, row.getAttribute('aria-label')]).toEqual([0, expect.stringContaining('Shift and F10')]);
  });

  it('Esc closes it with the focus back on the card; a press outside closes it too', () => {
    const a = setup(4);
    a.row()!.fire('keydown', { key: 'ContextMenu' });
    const esc = a.menu.fire('keydown', { key: 'Escape' });
    expect([esc.stopped, a.menu.hidden, page.document.activeElement]).toEqual([true, true, a.row()]);
    a.row()!.fire('contextmenu', { clientX: 5, clientY: 5 });
    page.fireDocument('pointerdown', new EventNode('div'));
    expect(a.menu.hidden).toBe(true);
    expect(a.c.owned[`${FIRST}@common`]).toBe(4);
  });

  it('is one menu for the whole screen, built once and reused for every card and every redraw', () => {
    const a = setup(4);
    const menus = (): number => a.root.querySelectorAll('.context-menu').length;
    expect(menus()).toBe(1);
    a.row()!.fire('contextmenu', { clientX: 5, clientY: 5 });
    a.choices()[0]!.click();
    a.screen.refresh();
    a.row()!.fire('contextmenu', { clientX: 5, clientY: 5 });
    expect(menus()).toBe(1);
    expect(a.root.querySelector('.context-menu')).toBe(a.menu);
  });
});
