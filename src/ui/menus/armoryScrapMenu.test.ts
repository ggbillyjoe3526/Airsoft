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

describe('each card says how many spares it has (M100)', () => {
  const badge = (a: ReturnType<typeof setup>, id = FIRST): string | undefined => a.row(id)?.querySelector('.armory-row-spares')?.textContent;

  it('words the count: one spare, several spares', () => {
    expect([ARMORY_TEXT.spareCount(1), ARMORY_TEXT.spareCount(2), ARMORY_TEXT.spareCount(12)]).toEqual(['1 spare', '2 spares', '12 spares']);
  });

  it('shows "N spares" on a card with copies beyond the best one, one less than the copies owned', () => {
    expect(badge(setup(4))).toBe('3 spares');
    expect(badge(setup(2))).toBe('1 spare');
  });

  it('shows nothing on a card with no spare, and the count follows a scrap', () => {
    const none = setup(1);
    expect(none.root.querySelectorAll('.armory-row-spares')).toEqual([]);
    const a = setup(3);
    a.row()!.fire('contextmenu', { clientX: 10, clientY: 10 });
    a.choices()[0]!.click();
    expect(badge(a)).toBe('1 spare');
    a.row()!.fire('contextmenu', { clientX: 10, clientY: 10 });
    a.choices()[0]!.click();
    expect(a.root.querySelectorAll('.armory-row-spares')).toEqual([]);
  });

  it('is only on cards that have a scrap menu, and is not read twice (the card\'s own name says it)', () => {
    const a = setup(4);
    const cards = a.root.querySelectorAll('.armory-row');
    for (const card of cards) {
      const has = card.querySelector('.armory-row-spares') !== null;
      expect([card.dataset.action !== undefined, card.text.includes('spare')]).toEqual([has, has]);
    }
    expect(a.row()!.querySelector('.armory-row-spares')!.getAttribute('aria-hidden')).toBe('true');
  });
});

describe('the scrap menu does not cover the card\'s own name (M100)', () => {
  const box = (left: number, top: number, right: number, bottom: number) => ({ left, top, right, bottom, width: right - left, height: bottom - top });
  const covers = (a: ReturnType<typeof setup>, name: { left: number; top: number; right: number; bottom: number }): boolean => {
    const left = Number.parseInt(a.menu.style.left!);
    const top = Number.parseInt(a.menu.style.top!);
    // The fake menu is 200 x 100.
    return left < name.right && left + 200 > name.left && top < name.bottom && top + 100 > name.top;
  };

  it('opens below the name and the spare count when the pointer is right on the name', () => {
    const a = setup(4);
    const row = a.row()!;
    const name = box(300, 400, 400, 416);
    const spares = box(300, 436, 370, 456);
    vi.spyOn(row.querySelector('.armory-row-name')!, 'getBoundingClientRect').mockReturnValue(name);
    vi.spyOn(row.querySelector('.armory-row-spares')!, 'getBoundingClientRect').mockReturnValue(spares);
    row.fire('contextmenu', { clientX: 320, clientY: 408 });
    expect([covers(a, name), covers(a, spares)]).toEqual([false, false]);
    expect(Number.parseInt(a.menu.style.top!)).toBeGreaterThanOrEqual(name.bottom);
  });

  it('flips left of the pointer at the window\'s right edge and still clears the name', () => {
    const a = setup(4);
    const row = a.row()!;
    const name = box(1150, 400, 1240, 416);
    vi.spyOn(row.querySelector('.armory-row-name')!, 'getBoundingClientRect').mockReturnValue(name);
    vi.spyOn(row.querySelector('.armory-row-spares')!, 'getBoundingClientRect').mockReturnValue(box(1200, 330, 1260, 354));
    row.fire('contextmenu', { clientX: 1230, clientY: 410 });
    const left = Number.parseInt(a.menu.style.left!);
    expect(left + 200).toBeLessThanOrEqual(1280 - 8);
    expect(covers(a, name)).toBe(false);
  });

  it('does the same from the keyboard, beside the focused card', () => {
    const a = setup(4);
    const row = a.row()!;
    const name = box(100, 150, 220, 170);
    vi.spyOn(row, 'getBoundingClientRect').mockReturnValue(box(90, 70, 300, 260));
    vi.spyOn(row.querySelector('.armory-row-name')!, 'getBoundingClientRect').mockReturnValue(name);
    vi.spyOn(row.querySelector('.armory-row-spares')!, 'getBoundingClientRect').mockReturnValue(box(230, 80, 290, 104));
    row.fire('keydown', { key: 'ContextMenu' });
    expect(covers(a, name)).toBe(false);
  });
});
