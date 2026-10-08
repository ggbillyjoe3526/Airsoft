import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ContextMenu } from './contextMenu';
import { EventNode, type FakePage, stubMenuPage } from './menuTestSupport';

/** The context menu (M100): built once, opens at the pointer, closes on Esc, a press outside, a choice. */
let page: FakePage;
beforeEach(() => {
  page = stubMenuPage();
});
afterEach(() => vi.unstubAllGlobals());

const node = (m: ContextMenu): EventNode => m.root as unknown as EventNode;
const items = (m: ContextMenu): EventNode[] => node(m).all('button').filter((b) => !b.hidden);

describe('the context menu', () => {
  it('is built hidden, with no buttons and nothing listening on the page', () => {
    const m = new ContextMenu();
    expect([node(m).hidden, m.isOpen, items(m).length, page.listenerCount()]).toEqual([true, false, 0, 0]);
  });

  it('opens at the pointer with a button per choice, each named, and the keyboard on the first', () => {
    const m = new ContextMenu();
    const run = vi.fn();
    m.open('AEG Rifle', [{ label: 'Scrap 1 (+40 FC)', name: 'Scrap 1 Common AEG Rifle for 40 FC', run }, { label: 'Scrap 3 (+120 FC)', run }], 300, 200);
    expect(m.isOpen).toBe(true);
    expect(node(m).hidden).toBe(false);
    expect([node(m).style.left, node(m).style.top]).toEqual(['300px', '200px']);
    expect(node(m).getAttribute('aria-label')).toBe('AEG Rifle');
    expect(items(m).map((b) => [b.tag, b.type, b.text, b.getAttribute('aria-label')])).toEqual([
      ['button', 'button', 'Scrap 1 (+40 FC)', 'Scrap 1 Common AEG Rifle for 40 FC'],
      ['button', 'button', 'Scrap 3 (+120 FC)', 'Scrap 3 (+120 FC)'],
    ]);
    expect(page.document.activeElement).toBe(items(m)[0]);
  });

  it('keeps itself inside the window when the pointer is near an edge', () => {
    const m = new ContextMenu();
    m.open('x', [{ label: 'A', run: vi.fn() }], 1270, 715);
    expect([node(m).style.left, node(m).style.top]).toEqual(['1072px', '612px']);
    m.open('x', [{ label: 'A', run: vi.fn() }], -50, 2);
    expect([node(m).style.left, node(m).style.top]).toEqual(['8px', '8px']);
  });

  it('runs the chosen choice once and closes before it does', () => {
    const m = new ContextMenu();
    const seen: boolean[] = [];
    m.open('x', [{ label: 'A', run: () => seen.push(m.isOpen) }, { label: 'B', run: () => seen.push(m.isOpen) }], 10, 10);
    items(m)[1]!.click();
    expect(seen).toEqual([false]);
    expect([m.isOpen, node(m).hidden, page.listenerCount()]).toEqual([false, true, 0]);
  });

  it('closes on Esc, stopping the key so the menus\' own Esc (Back) never sees it, and gives the focus back', () => {
    const m = new ContextMenu();
    const card = new EventNode('div');
    m.open('x', [{ label: 'A', run: vi.fn() }], 10, 10, card as unknown as HTMLElement);
    const other = node(m).fire('keydown', { key: 'ArrowDown' });
    expect(other.stopped).toBe(false);
    const esc = node(m).fire('keydown', { key: 'Escape' });
    expect([esc.defaultPrevented, esc.stopped, m.isOpen, node(m).hidden]).toEqual([true, true, false, true]);
    expect(page.document.activeElement).toBe(card);
  });

  it('closes on a press outside it, but not on one inside', () => {
    const m = new ContextMenu();
    m.open('x', [{ label: 'A', run: vi.fn() }], 10, 10);
    page.fireDocument('pointerdown', items(m)[0]);
    expect(m.isOpen).toBe(true);
    page.fireDocument('pointerdown', new EventNode('div'));
    expect([m.isOpen, node(m).hidden]).toEqual([false, true]);
  });

  it('closes when the page scrolls or resizes, and when focus leaves it', () => {
    const m = new ContextMenu();
    const reopen = (): void => m.open('x', [{ label: 'A', run: vi.fn() }], 10, 10);
    reopen();
    page.fireDocument('scroll', null);
    expect(m.isOpen).toBe(false);
    reopen();
    page.fireWindow('resize');
    expect(m.isOpen).toBe(false);
    reopen();
    node(m).fire('focusout', { relatedTarget: new EventNode('input') });
    expect(m.isOpen).toBe(false);
    reopen();
    node(m).fire('focusout', { relatedTarget: items(m)[0] });
    expect(m.isOpen).toBe(true);
  });

  it('keeps its page listeners on only while open', () => {
    const m = new ContextMenu();
    m.open('x', [{ label: 'A', run: vi.fn() }], 10, 10);
    const on = page.listenerCount();
    expect(on).toBeGreaterThan(0);
    m.open('y', [{ label: 'B', run: vi.fn() }], 20, 20);
    expect(page.listenerCount()).toBe(on);
    m.close();
    expect(page.listenerCount()).toBe(0);
  });

  it('is built once: showing it again reuses its root and buttons, and hides the ones a shorter list leaves over', () => {
    const m = new ContextMenu();
    const root = m.root;
    m.open('x', [{ label: 'A', run: vi.fn() }, { label: 'B', run: vi.fn() }], 10, 10);
    const [a, b] = items(m);
    m.close();
    m.open('y', [{ label: 'C', run: vi.fn() }], 40, 50);
    expect(m.root).toBe(root);
    expect(items(m)).toEqual([a]);
    expect([a!.text, b!.hidden, node(m).all("button").length]).toEqual(['C', true, 2]);
  });

  it('moves between its buttons with the arrow keys, wrapping', () => {
    const m = new ContextMenu();
    m.open('x', [{ label: 'A', run: vi.fn() }, { label: 'B', run: vi.fn() }], 10, 10);
    const [a, b] = items(m);
    node(m).fire('keydown', { key: 'ArrowDown' });
    expect(page.document.activeElement).toBe(b);
    node(m).fire('keydown', { key: 'ArrowDown' });
    expect(page.document.activeElement).toBe(a);
    node(m).fire('keydown', { key: 'End' });
    expect(page.document.activeElement).toBe(b);
  });

  it('opens nothing without choices', () => {
    const m = new ContextMenu();
    m.open('x', [], 10, 10);
    expect([m.isOpen, page.listenerCount()]).toEqual([false, 0]);
  });
});
