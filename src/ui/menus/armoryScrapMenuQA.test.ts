import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import poolText from '../../../pool.md?raw';
import { ARMORY_TEXT } from '../../config/menus';
import { newCollection } from '../../pool/collection';
import { loadPool } from '../../pool/pool';
import { ArmoryScreen, fcText } from './armoryScreen';
import { EventNode, type FakePage, stubMenuPage } from './menuTestSupport';

/**
 * QA for the Armory's right-click scrap menu (M100): the right item and the right count with copies at several tiers,
 * the card and the keyboard after a scrap empties its spares, the spare-count words, and no listener left behind.
 */
const pool = loadPool(poolText);
const tier = (id: string) => pool.tiers.find((t) => t.id === id)!;
const [A, B] = [pool.assets[0]!, pool.assets[1]!];

let page: FakePage;
beforeEach(() => {
  page = stubMenuPage();
});
afterEach(() => vi.unstubAllGlobals());

function armory(owned: Record<string, number>, fc = 0, onChange: () => boolean | void = () => false) {
  const c = newCollection(pool, 3);
  c.owned = { ...owned };
  c.fc = fc;
  const screen = new ArmoryScreen({ pool: () => pool, collection: () => c, equipped: () => [], onChange });
  const root = screen.root as unknown as EventNode;
  const menu = root.querySelector('.context-menu')!;
  return {
    c,
    screen,
    root,
    menu,
    row: (id = A.id): EventNode | null => root.querySelector(`[data-action="spares-${id}"]`),
    choices: (): EventNode[] => menu.all('button').filter((b) => !b.hidden),
    rightClick: (id = A.id, x = 40, y = 40) => root.querySelector(`[data-action="spares-${id}"]`)!.fire('contextmenu', { clientX: x, clientY: y }),
    focused: (): EventNode => page.document.activeElement as EventNode,
  };
}

describe('scrapping with copies at several tiers (M100 QA)', () => {
  const owned = { [`${A.id}@common`]: 3, [`${A.id}@rare`]: 2 };

  it('counts every copy but the best one: 3 Common (all spare, a Rare is owned) and 1 of the 2 Rare make 4 spares, worth 3 x Common + 1 x Rare', () => {
    const a = armory(owned);
    const pay = 3 * tier('common').scrapFc + tier('rare').scrapFc;
    expect(a.row()!.querySelector('.armory-row-spares')!.textContent).toBe('4 spares');
    a.rightClick();
    expect(a.choices().map((b) => b.text)).toEqual([`Scrap 1 (+${fcText(tier('common').scrapFc)})`, `Scrap 4 (+${fcText(pay)})`]);
  });

  it('Scrap 1 takes the commonest spare, not the rare one, and pays that tier\'s price', () => {
    const a = armory(owned);
    a.rightClick();
    expect(a.choices()[0]!.getAttribute('aria-label')).toBe(`Scrap 1 Common ${A.name} for ${fcText(tier('common').scrapFc)}`);
    a.choices()[0]!.click();
    expect(a.c.owned).toEqual({ [`${A.id}@common`]: 2, [`${A.id}@rare`]: 2 });
    expect(a.c.fc).toBe(tier('common').scrapFc);
  });

  it('Scrap 4 empties every spare at both tiers, pays all of them once, and leaves exactly the one best copy', () => {
    const a = armory(owned);
    a.rightClick();
    a.choices()[1]!.click();
    expect(a.c.owned).toEqual({ [`${A.id}@rare`]: 1 });
    expect(a.c.fc).toBe(3 * tier('common').scrapFc + tier('rare').scrapFc);
  });

  it('a card whose only spares are above Common offers Scrap 1 of that tier', () => {
    const a = armory({ [`${A.id}@rare`]: 3 });
    a.rightClick();
    expect(a.choices().map((b) => b.text)).toEqual([`Scrap 1 (+${fcText(tier('rare').scrapFc)})`, `Scrap 2 (+${fcText(2 * tier('rare').scrapFc)})`]);
    expect(a.choices()[0]!.getAttribute('aria-label')).toContain('Rare');
  });

  it('shows a big pay with its thousands comma, in the label and the name (10 spare Legendary)', () => {
    const a = armory({ [`${A.id}@legendary`]: 11 });
    a.rightClick();
    const pay = fcText(10 * tier('legendary').scrapFc);
    expect(pay).toMatch(/,/);
    expect(a.choices()[1]!.text).toBe(`Scrap 10 (+${pay})`);
    expect(a.choices()[1]!.getAttribute('aria-label')).toBe(`Scrap 10 spare ${A.name} for ${pay}`);
  });

  it('two scraps in a row pay and count right: Scrap 1 then Scrap what is left', () => {
    const a = armory({ [`${A.id}@common`]: 5 });
    a.rightClick();
    a.choices()[0]!.click();
    expect(a.row()!.querySelector('.armory-row-spares')!.textContent).toBe('3 spares');
    a.rightClick();
    expect(a.choices().map((b) => b.text)).toEqual([`Scrap 1 (+${fcText(tier('common').scrapFc)})`, `Scrap 3 (+${fcText(3 * tier('common').scrapFc)})`]);
    a.choices()[1]!.click();
    expect(a.c.owned).toEqual({ [`${A.id}@common`]: 1 });
    expect(a.c.fc).toBe(4 * tier('common').scrapFc);
  });
});

describe('the right card is scrapped when a second menu is opened without closing the first (M100 QA)', () => {
  it('a right-click on card B while A\'s menu is open (the press outside closes A first) scraps B and leaves A', () => {
    const a = armory({ [`${A.id}@common`]: 4, [`${B.id}@common`]: 4 });
    a.rightClick(A.id);
    expect(a.menu.hidden).toBe(false);
    page.fireDocument('pointerdown', a.row(B.id));
    a.rightClick(B.id);
    expect(a.menu.getAttribute('aria-label')).toBe(B.name);
    a.choices()[1]!.click();
    expect([a.c.owned[`${A.id}@common`], a.c.owned[`${B.id}@common`]]).toEqual([4, 1]);
  });

  it('a right-click on B without any press first (a synthetic contextmenu) still opens B\'s choices, never A\'s', () => {
    const a = armory({ [`${A.id}@common`]: 4, [`${B.id}@common`]: 2 });
    a.rightClick(A.id);
    a.rightClick(B.id);
    expect(a.choices().map((x) => x.text)).toEqual([`Scrap 1 (+${fcText(tier('common').scrapFc)})`]);
    a.choices()[0]!.click();
    expect([a.c.owned[`${A.id}@common`], a.c.owned[`${B.id}@common`]]).toEqual([4, 1]);
  });

  it('Scrap all spares clicked while a menu is open closes the menu first and scraps nothing by itself', () => {
    const a = armory({ [`${A.id}@common`]: 4 });
    a.rightClick();
    page.fireDocument('pointerdown', a.root.querySelector('[data-action="scrap-all"]'));
    expect(a.menu.hidden).toBe(true);
    expect(a.c.owned[`${A.id}@common`]).toBe(4);
  });
});

describe('the card and the keyboard after a scrap empties the spares (M100 QA)', () => {
  it('the card is no tab stop any more, names no menu, has no spare line, and its menu cannot be opened', () => {
    const a = armory({ [`${A.id}@common`]: 2 });
    a.rightClick();
    a.choices()[0]!.click();
    const card = a.root.querySelectorAll('.armory-row').find((r) => r.querySelector('.armory-row-name')!.textContent === A.name)!;
    expect([card.tabIndex, card.dataset.action, card.getAttribute('role'), card.querySelector('.armory-row-spares')]).toEqual([-1, undefined, null, null]);
    expect(card.getAttribute('aria-label')).toBeNull();
    expect(card.fire('keydown', { key: 'ContextMenu' }).defaultPrevented).toBe(false);
    expect(card.fire('contextmenu').defaultPrevented).toBe(false);
    expect(a.menu.hidden).toBe(true);
  });

  it('the keyboard lands on a live, enabled control, not on the card that went (Scrap all spares while others have spares)', () => {
    const a = armory({ [`${A.id}@common`]: 2, [`${B.id}@common`]: 3 });
    a.rightClick(A.id);
    a.choices()[0]!.click();
    expect(a.focused().dataset.action).toBe('scrap-all');
    expect(a.root.contains(a.focused())).toBe(true);
  });

  it('with no spares left anywhere it lands on Buy a Token when the FC can pay for one', () => {
    const a = armory({ [`${A.id}@common`]: 2 }, 10_000);
    a.rightClick();
    a.choices()[0]!.click();
    expect(a.root.contains(a.focused())).toBe(true);
    expect(a.focused().disabled).toBe(false);
    expect(['shot-1', 'buy-1']).toContain(a.focused().dataset.action);
  });

  it('with nothing to afford it lands on the heading (always on the page), never on a detached card or a hidden button', () => {
    const a = armory({ [`${A.id}@common`]: 2 }, 0);
    a.rightClick();
    a.choices()[0]!.click();
    const f = a.focused();
    expect([f.tag, f.hidden, f.disabled, a.root.contains(f)]).toEqual(['h1', false, false, true]);
    expect(a.menu.hidden).toBe(true);
  });

  it('a card that still has spares gets the keyboard back after Scrap 1, ready for the Menu key again', () => {
    const a = armory({ [`${A.id}@common`]: 4 });
    a.rightClick();
    a.choices()[0]!.click();
    expect(a.focused()).toBe(a.row());
    expect(a.row()!.fire('keydown', { key: 'ContextMenu' }).defaultPrevented).toBe(true);
    expect(a.menu.hidden).toBe(false);
  });

  it('leaves no page listener behind after any scrap', () => {
    const a = armory({ [`${A.id}@common`]: 3 });
    a.rightClick();
    expect(page.listenerCount()).toBeGreaterThan(0);
    a.choices()[1]!.click();
    expect(page.listenerCount()).toBe(0);
  });

  it('a redraw while the menu is open (a match paid, the screen refreshed) closes it and its listeners', () => {
    const a = armory({ [`${A.id}@common`]: 3 });
    a.rightClick();
    a.screen.refresh();
    expect([a.menu.hidden, page.listenerCount()]).toEqual([true, 0]);
  });
});

describe('the keyboard opens the menu where the card is (M100 QA)', () => {
  it('Menu key and Shift+F10 open it beside the card, 12 px in and 24 px down, with the card as the place to return to', () => {
    const a = armory({ [`${A.id}@common`]: 3 });
    const row = a.row()!;
    vi.spyOn(row, 'getBoundingClientRect').mockReturnValue({ left: 300, top: 200, right: 500, bottom: 380, width: 200, height: 180 } as never);
    row.fire('keydown', { key: 'ContextMenu' });
    expect([a.menu.style.left, a.menu.style.top]).toEqual(['312px', '224px']);
    a.menu.fire('keydown', { key: 'Escape' });
    expect([a.menu.hidden, a.focused()]).toEqual([true, row]);
    row.fire('keydown', { key: 'F10', shiftKey: true });
    expect(a.menu.hidden).toBe(false);
  });

  it('other F10 and Menu look-alikes do nothing: F10 alone, Ctrl+F10 is not Shift+F10 but Shift is what counts, and a letter', () => {
    const a = armory({ [`${A.id}@common`]: 3 });
    for (const e of [{ key: 'F10' }, { key: 'F10', shiftKey: false }, { key: 'F9', shiftKey: true }, { key: 'm' }, { key: 'Enter' }, { key: ' ' }]) {
      expect([JSON.stringify(e), a.row()!.fire('keydown', e).defaultPrevented]).toEqual([JSON.stringify(e), false]);
    }
    expect(a.menu.hidden).toBe(true);
  });

  it('a press of the Menu key on a card in a menu that is already open for it keeps one menu, with the keyboard in it', () => {
    const a = armory({ [`${A.id}@common`]: 3 });
    a.row()!.fire('keydown', { key: 'ContextMenu' });
    a.row()!.fire('keydown', { key: 'ContextMenu' });
    expect(a.root.querySelectorAll('.context-menu')).toHaveLength(1);
    expect(a.choices()).toHaveLength(2);
    expect(page.listenerCount()).toBe(4);
    expect(a.focused()).toBe(a.choices()[0]);
  });
});

describe('the spare-count words (M100 QA)', () => {
  it('one spare is singular, none or several plural, on the card, in its name and in the menu text', () => {
    expect([0, 1, 2, 11].map(ARMORY_TEXT.spareCount)).toEqual(['0 spares', '1 spare', '2 spares', '11 spares']);
    expect(ARMORY_TEXT.rowMenuHint('Red Dot', 1)).toBe('Red Dot, 1 spare. Press the Menu key or Shift and F10 to scrap.');
    expect(ARMORY_TEXT.rowMenuHint('Red Dot', 4)).toBe('Red Dot, 4 spares. Press the Menu key or Shift and F10 to scrap.');
  });

  it('the card says "1 spare" for two copies and "N spares" beyond, and its accessible name agrees with the line', () => {
    for (const [copies, words] of [[2, '1 spare'], [3, '2 spares'], [12, '11 spares']] as const) {
      const a = armory({ [`${A.id}@common`]: copies });
      expect(a.row()!.querySelector('.armory-row-spares')!.textContent).toBe(words);
      expect(a.row()!.getAttribute('aria-label')).toBe(`${A.name}, ${words}. Press the Menu key or Shift and F10 to scrap.`);
    }
  });

  it('counts the spares of all tiers on one card, not only the best one', () => {
    const a = armory({ [`${A.id}@common`]: 1, [`${A.id}@rare`]: 1 });
    expect(a.row()!.querySelector('.armory-row-spares')!.textContent).toBe('1 spare');
    a.rightClick();
    expect(a.choices().map((b) => b.text)).toEqual([`Scrap 1 (+${fcText(tier('common').scrapFc)})`]);
    a.choices()[0]!.click();
    expect(a.c.owned).toEqual({ [`${A.id}@rare`]: 1 });
  });

  it('the confirmation of Scrap all spares counts copies in the singular too', () => {
    expect(ARMORY_TEXT.confirmScrap(1, '5 FC')).toContain('Scrap 1 spare copy for 5 FC');
    expect(ARMORY_TEXT.confirmScrap(3, '15 FC')).toContain('Scrap 3 spare copies for 15 FC');
  });
});
