import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ContextMenu } from './contextMenu';
import { EventNode } from './menuTestSupport';
import { placeMenu } from './menuPlacement';

/**
 * QA for the context menu (M100): what the worker's own tests leave open. The page here is stricter than
 * menuTestSupport's: a listener is removed only by the same type, function AND capture flag, as in a browser, so a
 * listener added with `true` and removed without it is a leak this file sees.
 */
type Fn = (e: unknown) => void;

interface StrictPage {
  /** Every listener held now, as "document:pointerdown:capture" lines, sorted. */
  held(): string[];
  fireDocument(type: string, target?: unknown): void;
  fireWindow(type: string): void;
  document: { activeElement: unknown };
}

function strictPage(width = 1280, height = 720): StrictPage {
  const held = new Map<string, Fn>();
  const key = (who: string, type: string, fn: Fn, capture: unknown): string => `${who}:${type}:${capture === true || (typeof capture === 'object' && capture !== null && (capture as { capture?: boolean }).capture) ? 'capture' : 'bubble'}#${fnId(fn)}`;
  const ids = new WeakMap<Fn, number>();
  let next = 0;
  const fnId = (fn: Fn): number => ids.get(fn) ?? (ids.set(fn, ++next), next);
  const target = (who: string) => ({
    addEventListener: (type: string, fn: Fn, capture?: unknown) => void held.set(key(who, type, fn, capture), fn),
    removeEventListener: (type: string, fn: Fn, capture?: unknown) => void held.delete(key(who, type, fn, capture)),
  });
  const win = { innerWidth: width, innerHeight: height, ...target('window') };
  const document = { activeElement: null as unknown, defaultView: win, createElement: (tag: string) => new EventNode(tag), ...target('document') };
  vi.stubGlobal('document', document);
  const fire = (who: string, type: string, event: unknown): void => {
    for (const [k, fn] of [...held]) if (k.startsWith(`${who}:${type}:`)) fn(event);
  };
  return {
    held: () => [...held.keys()].map((k) => k.replace(/#\d+$/, '')).sort(),
    fireDocument: (type, t = null) => fire('document', type, { type, target: t }),
    fireWindow: (type) => fire('window', type, { type }),
    document,
  };
}

let page: StrictPage;
beforeEach(() => {
  page = strictPage();
});
afterEach(() => vi.unstubAllGlobals());

const node = (m: ContextMenu): EventNode => m.root as unknown as EventNode;
const items = (m: ContextMenu): EventNode[] => node(m).all('button').filter((b) => !b.hidden);
const choice = (label: string, run: () => void = vi.fn()) => ({ label, run });
const open = (m: ContextMenu, n = 2, x = 10, y = 10, returnTo: EventNode | null = null): void =>
  m.open('Item', Array.from({ length: n }, (_, i) => choice(`Choice ${i + 1}`)), x, y, returnTo as unknown as HTMLElement | null);

describe('the context menu keeps no listener once it is closed, by any route (M100 QA)', () => {
  const routes: [string, (m: ContextMenu) => void][] = [
    ['Esc', (m) => void node(m).fire('keydown', { key: 'Escape' })],
    ['a press outside', () => page.fireDocument('pointerdown', new EventNode('div'))],
    ['a scroll', () => page.fireDocument('scroll')],
    ['a resize', () => page.fireWindow('resize')],
    ['the window losing focus', () => page.fireWindow('blur')],
    ['focus leaving it', (m) => void node(m).fire('focusout', { relatedTarget: new EventNode('input') })],
    ['focus leaving it for nowhere (the page itself)', (m) => void node(m).fire('focusout', { relatedTarget: null })],
    ['a choice', (m) => items(m)[0]!.click()],
    ['close()', (m) => m.close()],
  ];

  it.each(routes)('closes on %s: hidden, not open, and not one page listener left (capture flags matching)', (_name, close) => {
    const m = new ContextMenu();
    open(m);
    expect(page.held().sort()).toEqual(['document:pointerdown:capture', 'document:scroll:capture', 'window:blur:bubble', 'window:resize:bubble']);
    close(m);
    expect([m.isOpen, node(m).hidden, page.held()]).toEqual([false, true, []]);
  });

  it('does not pile listeners up over many openings, nor when it is opened again while still open', () => {
    const m = new ContextMenu();
    for (let i = 0; i < 25; i++) {
      open(m);
      open(m, 1, 50, 50);
      expect(page.held()).toHaveLength(4);
      page.fireDocument('scroll');
    }
    expect(page.held()).toEqual([]);
  });

  it('closes a second time harmlessly and does not run a choice twice when a press arrives after it closed', () => {
    const m = new ContextMenu();
    const run = vi.fn();
    m.open('x', [choice('A', run)], 10, 10);
    items(m)[0]!.click();
    m.close();
    page.fireDocument('pointerdown', new EventNode('div'));
    expect(run).toHaveBeenCalledTimes(1);
  });

  it('can be opened from inside a choice (the next menu keeps its listeners: the first one\'s close runs before the choice)', () => {
    const m = new ContextMenu();
    m.open('x', [{ label: 'A', run: () => m.open('y', [choice('B')], 20, 20) }], 10, 10);
    items(m)[0]!.click();
    expect(m.isOpen).toBe(true);
    expect(page.held()).toHaveLength(4);
    expect(items(m).map((b) => b.text)).toEqual(['B']);
  });
});

describe('Esc and the other ways out leave the focus where the player put it (M100 QA)', () => {
  it('Esc is stopped and prevented, hands the focus back to the card, and the menu can be opened again afterwards', () => {
    const m = new ContextMenu();
    const card = new EventNode('div');
    open(m, 2, 10, 10, card);
    const esc = node(m).fire('keydown', { key: 'Escape' });
    expect([esc.stopped, esc.defaultPrevented, page.document.activeElement]).toEqual([true, true, card]);
    open(m, 2, 10, 10, card);
    expect(m.isOpen).toBe(true);
    expect(page.held()).toHaveLength(4);
  });

  it('Esc with no card to return to closes without a throw', () => {
    const m = new ContextMenu();
    open(m);
    expect(() => node(m).fire('keydown', { key: 'Escape' })).not.toThrow();
    expect(m.isOpen).toBe(false);
  });

  it('only Esc is stopped: Enter, Tab, Space, letters and the arrows are not swallowed from the page', () => {
    const m = new ContextMenu();
    open(m);
    for (const key of ['Enter', 'Tab', ' ', 'a', 'F10', 'ContextMenu']) {
      const e = node(m).fire('keydown', { key });
      expect([key, e.stopped, e.defaultPrevented]).toEqual([key, false, false]);
    }
  });

  it.each([
    ['a press outside', () => page.fireDocument('pointerdown', new EventNode('div'))],
    ['a scroll', () => page.fireDocument('scroll')],
    ['a resize', () => page.fireWindow('resize')],
    ['the window losing focus', () => page.fireWindow('blur')],
    ['focus moving to another control', undefined],
  ])('does not pull the focus back to the card on %s', (_name, away) => {
    const m = new ContextMenu();
    const card = new EventNode('div');
    const other = new EventNode('button');
    open(m, 2, 10, 10, card);
    other.focus();
    if (away) away();
    else node(m).fire('focusout', { relatedTarget: other });
    expect([m.isOpen, page.document.activeElement]).toEqual([false, other]);
  });

  it('a press on the menu itself, or focus moving between its own buttons, keeps it open', () => {
    const m = new ContextMenu();
    open(m, 3);
    page.fireDocument('pointerdown', node(m));
    page.fireDocument('pointerdown', items(m)[2]);
    node(m).fire('focusout', { relatedTarget: items(m)[1] });
    expect(m.isOpen).toBe(true);
  });

  it('the browser\'s own menu never shows on top of it', () => {
    const m = new ContextMenu();
    open(m);
    expect(node(m).fire('contextmenu').defaultPrevented).toBe(true);
  });
});

describe('the keyboard in the context menu (M100 QA)', () => {
  it('starts on the first item and walks Down and Up with wrap-around, Home and End jumping to the ends', () => {
    const m = new ContextMenu();
    open(m, 3);
    const [a, b, c] = items(m);
    const press = (key: string): unknown => (node(m).fire('keydown', { key }), page.document.activeElement);
    expect(page.document.activeElement).toBe(a);
    expect(press('ArrowUp')).toBe(c);
    expect(press('ArrowDown')).toBe(a);
    expect(press('ArrowDown')).toBe(b);
    expect(press('End')).toBe(c);
    expect(press('ArrowDown')).toBe(a);
    expect(press('End')).toBe(c);
    expect(press('Home')).toBe(a);
    expect(press('Home')).toBe(a);
  });

  it('prevents the page from scrolling on the keys it handles, and on none other', () => {
    const m = new ContextMenu();
    open(m, 2);
    for (const key of ['ArrowDown', 'ArrowUp', 'Home', 'End']) expect([key, node(m).fire('keydown', { key }).defaultPrevented]).toEqual([key, true]);
    for (const key of ['ArrowLeft', 'ArrowRight', 'PageDown']) expect([key, node(m).fire('keydown', { key }).defaultPrevented]).toEqual([key, false]);
  });

  it('skips the buttons a shorter list leaves hidden', () => {
    const m = new ContextMenu();
    open(m, 3);
    m.close();
    open(m, 2);
    const [a, b] = items(m);
    expect(items(m)).toHaveLength(2);
    node(m).fire('keydown', { key: 'End' });
    expect(page.document.activeElement).toBe(b);
    node(m).fire('keydown', { key: 'ArrowDown' });
    expect(page.document.activeElement).toBe(a);
  });

  it('a single item keeps the focus on itself for every arrow', () => {
    const m = new ContextMenu();
    open(m, 1);
    for (const key of ['ArrowDown', 'ArrowUp', 'Home', 'End']) {
      node(m).fire('keydown', { key });
      expect(page.document.activeElement).toBe(items(m)[0]);
    }
  });

  it('a held Enter on an item is not repeated (it would choose again on the screen that replaces the menu)', () => {
    const m = new ContextMenu();
    open(m, 1);
    expect(items(m)[0]!.fire('keydown', { key: 'Enter', repeat: true }).defaultPrevented).toBe(true);
    expect(items(m)[0]!.fire('keydown', { key: 'Enter', repeat: false }).defaultPrevented).toBe(false);
  });

  it('after Esc the keyboard is back on the card so the Menu key can open it again (the cycle works twice)', () => {
    const m = new ContextMenu();
    const card = new EventNode('div');
    for (let i = 0; i < 2; i++) {
      open(m, 2, 10, 10, card);
      expect(page.document.activeElement).toBe(items(m)[0]);
      node(m).fire('keydown', { key: 'Escape' });
      expect(page.document.activeElement).toBe(card);
    }
  });
});

describe('what the menu says, and to whom (M100 QA)', () => {
  it('is a labelled group, titled and re-labelled for whatever it is opened for, never keeping the last one\'s names', () => {
    const m = new ContextMenu();
    m.open('AEG Rifle', [{ label: 'Scrap 1 (+5 FC)', name: 'Scrap 1 Common AEG Rifle for 5 FC', run: vi.fn() }, choice('Scrap 3 (+15 FC)')], 10, 10);
    expect([node(m).getAttribute('role'), node(m).getAttribute('aria-label')]).toEqual(['group', 'AEG Rifle']);
    expect(node(m).querySelector('.context-menu-title')!.textContent).toBe('AEG Rifle');
    m.open('Red Dot', [choice('Scrap 1 (+10 FC)')], 10, 10);
    expect([node(m).getAttribute('aria-label'), node(m).querySelector('.context-menu-title')!.textContent]).toEqual(['Red Dot', 'Red Dot']);
    // The single button reads the new label and the new name (the label, as no name was given), not the old rifle's.
    expect(items(m).map((b) => [b.text, b.getAttribute('aria-label')])).toEqual([['Scrap 1 (+10 FC)', 'Scrap 1 (+10 FC)']]);
  });

  it('the button i runs choice i of the list it was last opened with (no closure over a previous list)', () => {
    const m = new ContextMenu();
    const first = vi.fn();
    const second = vi.fn();
    m.open('A', [choice('a1', first), choice('a2', first)], 10, 10);
    m.open('B', [choice('b1', second), choice('b2', second)], 10, 10);
    items(m)[1]!.click();
    expect([first.mock.calls.length, second.mock.calls.length]).toEqual([0, 1]);
  });

  it('a click on a button its list no longer has (a stale hidden one) does nothing', () => {
    const m = new ContextMenu();
    const run = vi.fn();
    m.open('A', [choice('a1', run), choice('a2', run)], 10, 10);
    const stale = items(m)[1]!;
    m.open('B', [choice('b1', run)], 10, 10);
    expect(stale.hidden).toBe(true);
    stale.click();
    expect(run).not.toHaveBeenCalled();
  });
});

describe('where the menu opens (M100 QA, the fake menu is 200 x 100 in a 1280 x 720 window)', () => {
  const at = (x: number, y: number, avoid: { left: number; top: number; right: number; bottom: number }[] = []): [string | undefined, string | undefined] => {
    const m = new ContextMenu();
    m.open('x', [choice('A')], x, y, null, avoid);
    return [node(m).style.left, node(m).style.top];
  };

  it('flips from each of the four corners of the window to keep fully inside it', () => {
    expect(at(100, 100)).toEqual(['100px', '100px']);
    expect(at(1270, 100)).toEqual(['1070px', '100px']);
    expect(at(100, 700)).toEqual(['100px', '600px']);
    expect(at(1270, 700)).toEqual(['1070px', '600px']);
  });

  it('keeps the pointer\'s corner when the menu just fits, and flips one pixel past it', () => {
    // Fits: 1280 - 8 - 200 = 1072; 720 - 8 - 100 = 612.
    expect(at(1072, 612)).toEqual(['1072px', '612px']);
    expect(at(1073, 613)).toEqual(['873px', '513px']);
  });

  it('keeps 8 px inside the window when the pointer is outside it (a right-click on the edge, a negative coordinate)', () => {
    expect(at(-30, -30)).toEqual(['8px', '8px']);
    expect(at(5000, 5000)).toEqual(['1072px', '612px']);
  });

  it('opens clear of a name box in the middle, to the right edge and the bottom edge alike', () => {
    const box = { left: 1100, top: 640, right: 1260, bottom: 660 };
    const [left, top] = at(1150, 650, [box]);
    const l = Number.parseInt(left!);
    const t = Number.parseInt(top!);
    const overlaps = l < box.right && l + 200 > box.left && t < box.bottom && t + 100 > box.top;
    expect(overlaps).toBe(false);
    expect([l >= 8, t >= 8, l + 200 <= 1272, t + 100 <= 712]).toEqual([true, true, true, true]);
  });
});

describe('placeMenu on a seeded spread of pointers and name boxes (M100 QA)', () => {
  const W = 1280;
  const H = 720;
  const w = 230;
  const h = 130;
  let seed = 20261008;
  const rnd = (): number => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32);

  it('always lands inside the window, 8 px from every edge, and off the name and spare boxes, for 5000 right-clicks on a card', () => {
    for (let i = 0; i < 5000; i++) {
      const bx = rnd() * (W - 220);
      const by = rnd() * (H - 70);
      const name = { left: bx, top: by, right: bx + 100 + rnd() * 100, bottom: by + 18 };
      const spares = { left: name.left, top: name.bottom + 20 + rnd() * 20, right: name.left + 70, bottom: name.bottom + 48 + rnd() * 20 };
      const avoid = rnd() < 0.5 ? [name, spares] : [name];
      const x = name.left + rnd() * (name.right - name.left) + 2;
      const y = name.top + rnd() * 18 + 2;
      const p = placeMenu(x, y, w, h, W, H, avoid);
      const inside = p.left >= 8 && p.top >= 8 && p.left + w <= W - 8 && p.top + h <= H - 8;
      const clear = avoid.every((a) => p.left + w <= a.left || p.left >= a.right || p.top + h <= a.top || p.top >= a.bottom);
      if (!inside || !clear) throw new Error(`run ${i}: ${JSON.stringify({ x, y, avoid, p })}`);
    }
  });

  it('never returns NaN, even for a pointer at 0,0 or a window smaller than the menu', () => {
    for (const [x, y, ww, hh] of [[0, 0, 1280, 720], [0, 0, 100, 60], [50, 50, 300, 20]] as const) {
      const p = placeMenu(x, y, 230, 130, ww, hh);
      expect(Number.isFinite(p.left) && Number.isFinite(p.top)).toBe(true);
    }
  });
});

describe('pressing a button of the menu with a mouse that does not focus buttons (Safari, Firefox on a Mac)', () => {
  // Those browsers send the focus to the page, not to the pressed button, on mouse down; the menu's own focusout then
  // sees no related target and closes it before the click lands. A focusable root (tabindex -1) catches that focus.
  // Risk, not yet seen in a real Safari: the menu's root is not focusable, so a press on a button there blurs to nothing and closes it.
  it.fails('takes the focus itself when its text is pressed (the root is focusable with tabindex -1), so a press inside never blurs to nothing', () => {
    const settable: string[] = [];
    class Focusable extends EventNode {
      constructor(tag: string) {
        super(tag);
        // A menu that makes its root focusable sets the property or the attribute; either is seen here.
        Object.defineProperty(this, 'tabIndex', { get: () => -1, set: (v: number) => void settable.push(String(v)) });
      }
      override setAttribute(name: string, value: string): void {
        if (name === 'tabindex') settable.push(value);
        super.setAttribute(name, value);
      }
    }
    vi.stubGlobal('document', { ...page.document, createElement: (tag: string) => new Focusable(tag) });
    const m = new ContextMenu();
    expect(settable).toContain('-1');
    expect(m.root).toBeDefined();
  });
});
