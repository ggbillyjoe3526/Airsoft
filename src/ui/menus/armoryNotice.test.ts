import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import poolText from '../../../pool.md?raw';
import { ARMORY_TEXT } from '../../config/menus';
import { newCollection } from '../../pool/collection';
import { loadPool } from '../../pool/pool';
import { FakeElement } from '../testSupport';
import { ArmoryScreen } from './armoryScreen';

/** The fake DOM with what the Armory also uses: dataset, tables, replaceChildren and simple selectors (M70, audit POOL-05). */
class Node extends FakeElement {
  dataset: Record<string, string> = {};
  tabIndex = 0;
  scope = '';
  title = '';
  constructor(tag: string) {
    super(tag);
    this.style = { setProperty: () => {} } as unknown as Record<string, string>;
  }
  createCaption(): Node {
    return this.add(new Node('caption'));
  }
  createTBody(): Node {
    return this.add(new Node('tbody'));
  }
  insertRow(): Node {
    return this.add(new Node('tr'));
  }
  /** Text nodes (append(' ', span)) are skipped: only elements are read back. */
  override append(...nodes: (FakeElement | string)[]): void {
    super.append(...nodes.filter((n): n is FakeElement => typeof n !== 'string'));
  }
  private add(n: Node): Node {
    this.append(n);
    return n;
  }
  replaceChildren(...n: Node[]): void {
    this.children.length = 0;
    this.append(...n);
  }
  private matches(sel: string): boolean {
    const action = /^\[data-action="(.+)"\]$/.exec(sel);
    if (action) return this.dataset.action === action[1];
    if (sel === '[data-autofocus]') return 'autofocus' in this.dataset;
    if (sel.startsWith('.')) return this.classList.contains(sel.slice(1));
    return this.tag === sel;
  }
  querySelectorAll(sel: string): Node[] {
    return (this.children as Node[]).flatMap((c) => [...(c.matches(sel) ? [c] : []), ...c.querySelectorAll(sel)]);
  }
  querySelector(sel: string): Node | null {
    return this.querySelectorAll(sel)[0] ?? null;
  }
}

describe('the Armory says once when another tab saved first (M70, audit POOL-05)', () => {
  const pool = loadPool(poolText);
  const setup = (onChange: () => boolean | void) => {
    const c = newCollection(pool, 7);
    c.tokens = 5;
    const screen = new ArmoryScreen({ pool: () => pool, collection: () => c, equipped: () => [], onChange, onBack: () => {} });
    const root = screen.root as unknown as Node;
    return {
      screen,
      notice: () => root.querySelector('.armory-notice')!,
      reveal: () => root.querySelectorAll('.armory-tile').length,
      shot: () => root.querySelector('[data-action="shot-1"]')!.click(),
    };
  };

  beforeEach(() => vi.stubGlobal('document', { createElement: (tag: string) => new Node(tag) }));
  afterEach(() => vi.unstubAllGlobals());

  it('is a status line, empty until a save is refused', () => {
    const a = setup(() => {});
    expect(a.notice().getAttribute('role')).toBe('status');
    expect(a.notice().textContent).toBe('');
  });

  it('shows the notice and no Shot items when the save was refused and the collection reloaded', () => {
    const a = setup(() => true);
    a.shot();
    expect(a.notice().textContent).toBe(ARMORY_TEXT.reloaded);
    expect(a.reveal()).toBe(0);
  });

  it('shows the Shot and no notice when the save held', () => {
    const a = setup(() => {});
    a.shot();
    expect(a.notice().textContent).toBe('');
    expect(a.reveal()).toBeGreaterThan(0);
  });

  it('says it once: the next change, or opening the screen again, clears it', () => {
    let reloaded = true;
    const a = setup(() => reloaded);
    a.shot();
    expect(a.notice().textContent).toBe(ARMORY_TEXT.reloaded);
    reloaded = false;
    a.shot();
    expect(a.notice().textContent).toBe('');
    reloaded = true;
    a.shot();
    a.screen.refresh();
    expect(a.notice().textContent).toBe('');
  });

  it('says it in plain words that name what happened and what it cost', () => {
    expect(ARMORY_TEXT.reloaded).toMatch(/another tab/i);
    expect(ARMORY_TEXT.reloaded).toMatch(/not kept/i);
  });

  it('captions the odds as before pity (M70, audit POOL-08)', () => {
    const a = setup(() => {});
    const caption = (a.screen.root as unknown as Node).querySelector('caption')!;
    expect(caption.textContent).toBe('Rarity odds (each item drawn, before pity)');
  });
});
