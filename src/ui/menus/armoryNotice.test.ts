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

/** QA for M70: the notice's once-only life, the other actions, strict reading of the hook's answer, and the reload showing. */
describe('the Armory notice, further cases (M70, audit POOL-05)', () => {
  const pool = loadPool(poolText);
  const setup = (onChange: (c: ReturnType<typeof newCollection>) => boolean | void | unknown, fc = 100000) => {
    const c = newCollection(pool, 7);
    c.tokens = 5;
    c.fc = fc;
    let calls = 0;
    const screen = new ArmoryScreen({ pool: () => pool, collection: () => c, equipped: () => [], onChange: () => (calls++, onChange(c) as boolean | void), onBack: () => {} });
    const root = screen.root as unknown as Node;
    const text = (n: Node): string => n.textContent + n.children.map((k) => text(k as Node)).join(' ');
    return {
      c,
      screen,
      root,
      calls: () => calls,
      notices: () => root.querySelectorAll('.armory-notice'),
      notice: () => root.querySelector('.armory-notice')!,
      reveal: () => root.querySelectorAll('.armory-tile').length,
      click: (action: string) => root.querySelector(`[data-action="${action}"]`)!.click(),
      balance: () => text(root.querySelector('.armory-balance')!),
    };
  };

  beforeEach(() => vi.stubGlobal('document', { createElement: (tag: string) => new Node(tag) }));
  afterEach(() => vi.unstubAllGlobals());

  it('shows it for a refused Token purchase too, and onChange is asked once per change', () => {
    const a = setup(() => true);
    a.click('buy-1');
    expect(a.calls()).toBe(1);
    expect(a.notice().textContent).toBe(ARMORY_TEXT.reloaded);
  });

  it('shows it for a refused scrap', () => {
    const a = setup(() => true);
    a.c.owned['000001@common'] = 3;
    a.screen.refresh();
    const scrap = a.root.querySelector('[data-action="scrap1-000001"]');
    expect(scrap).not.toBeNull();
    scrap!.click();
    expect(a.calls()).toBe(1);
    expect(a.notice().textContent).toBe(ARMORY_TEXT.reloaded);
  });

  it('reads the answer strictly: only true shows the notice (false, undefined, a truthy non-boolean do not)', () => {
    for (const answer of [false, undefined, 1, 'yes', {}, null]) {
      const a = setup(() => answer);
      a.click('shot-1');
      expect(a.notice().textContent, String(answer)).toBe('');
      expect(a.reveal(), String(answer)).toBeGreaterThan(0);
    }
  });

  it('is one element for the life of the screen, a status line, whether empty, filled or cleared', () => {
    let reloaded = true;
    const a = setup(() => reloaded);
    const first = a.notice();
    a.click('shot-1');
    expect(a.notices()).toHaveLength(1);
    expect(a.notice()).toBe(first);
    expect(first.getAttribute('role')).toBe('status');
    reloaded = false;
    a.click('buy-1');
    a.screen.refresh();
    expect(a.notices()).toHaveLength(1);
    expect(a.notice()).toBe(first);
    expect(first.getAttribute('role')).toBe('status');
    expect(first.textContent).toBe('');
  });

  it('is empty when the screen is first built and after opening it again, even straight after a refusal', () => {
    const a = setup(() => true);
    expect(a.notice().textContent).toBe('');
    a.click('buy-1');
    expect(a.notice().textContent).not.toBe('');
    a.screen.refresh();
    expect(a.notice().textContent).toBe('');
  });

  it('a refusal drops an earlier Shot\'s reveal; the next change that holds shows its own and clears the notice', () => {
    let reloaded = false;
    const a = setup(() => reloaded);
    a.click('shot-1');
    const first = a.reveal();
    expect(first).toBeGreaterThan(0);
    reloaded = true;
    a.click('buy-1');
    expect(a.notice().textContent).toBe(ARMORY_TEXT.reloaded);
    expect(a.reveal()).toBe(0);
    reloaded = false;
    a.click('shot-1');
    expect(a.notice().textContent).toBe('');
    expect(a.reveal()).toBeGreaterThan(0);
  });

  it('keeps the earlier Shot\'s reveal when the later change was not refused (only a refusal suppresses it)', () => {
    const a = setup(() => false);
    a.click('shot-1');
    const n = a.reveal();
    a.click('buy-1');
    expect(a.reveal()).toBe(n);
    expect(a.notice().textContent).toBe('');
  });

  it('draws the reloaded collection, not this tab\'s stale one, when the hook reloads it in place', () => {
    const a = setup((c) => {
      // What saveOrReload does: the other tab's save replaces this tab's contents.
      Object.assign(c, { fc: 4242, tokens: 0, owned: {}, pity: {} });
      return true;
    });
    a.click('shot-1');
    expect(a.balance()).toContain('4,242 FC');
    expect(a.notice().textContent).toBe(ARMORY_TEXT.reloaded);
    expect(a.reveal()).toBe(0);
  });

  it('still lists the Cyber Pistol\'s chase line under the odds, as before the caption changed (POOL-08 touches the caption only)', () => {
    const a = setup(() => {});
    const lines = a.root.querySelectorAll('.armory-chase');
    expect(lines.length).toBeGreaterThan(0);
    expect(lines.some((l) => l.textContent.includes('Cyber Pistol'))).toBe(true);
  });
});
