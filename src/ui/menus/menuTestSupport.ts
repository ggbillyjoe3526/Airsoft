import { vi } from 'vitest';
import { FakeElement } from '../testSupport';

/** What a handler is given: a press, a key or a context-menu event, with the calls the menus make on it. */
export interface FakeEvent {
  type: string;
  target: unknown;
  key?: string;
  shiftKey?: boolean;
  repeat?: boolean;
  clientX?: number;
  clientY?: number;
  relatedTarget?: unknown;
  defaultPrevented: boolean;
  stopped: boolean;
  preventDefault(): void;
  stopPropagation(): void;
}

/**
 * The fake DOM with what the Armory and the context menu also use (dataset, selectors, contains, events a test can fire,
 * a focus that moves `document.activeElement`), for tests of the right-click scrap menu (M100).
 */
export class EventNode extends FakeElement {
  dataset: Record<string, string> = {};
  /** A div is not a tab stop until a screen makes it one. */
  tabIndex = -1;
  scope = '';
  title = '';
  private readonly handlers = new Map<string, ((e: FakeEvent) => void)[]>();

  constructor(tag: string) {
    super(tag);
    this.style = { setProperty: () => {} } as unknown as Record<string, string>;
  }

  override addEventListener(type: string, fn: (e: never) => void): void {
    this.handlers.set(type, [...(this.handlers.get(type) ?? []), fn as (e: FakeEvent) => void]);
    super.addEventListener(type, fn as (e: unknown) => void);
  }

  /** Fires `type` at this element with `init` added; returns the event, to read `defaultPrevented` and `stopped`. */
  fire(type: string, init: Partial<FakeEvent> = {}): FakeEvent {
    const e: FakeEvent = {
      type,
      target: this,
      defaultPrevented: false,
      stopped: false,
      preventDefault() {
        e.defaultPrevented = true;
      },
      stopPropagation() {
        e.stopped = true;
      },
      ...init,
    };
    for (const fn of this.handlers.get(type) ?? []) fn(e);
    return e;
  }

  createCaption(): EventNode {
    return this.add(new EventNode('caption'));
  }
  createTBody(): EventNode {
    return this.add(new EventNode('tbody'));
  }
  insertRow(): EventNode {
    return this.add(new EventNode('tr'));
  }
  /** Text nodes (append(' ', span)) are skipped: only elements are read back. */
  override append(...nodes: (FakeElement | string)[]): void {
    super.append(...nodes.filter((n): n is FakeElement => typeof n !== 'string'));
  }
  private add(n: EventNode): EventNode {
    this.append(n);
    return n;
  }
  replaceChildren(...n: EventNode[]): void {
    this.children.length = 0;
    this.append(...n);
  }
  /** A box 200 × 100 where the element's `style` puts it (left and top), so a menu can be checked against the window's edge. */
  override getBoundingClientRect(): { left: number; right: number; top: number; bottom: number; width: number; height: number } {
    const left = parseFloat(this.style.left ?? '') || 0;
    const top = parseFloat(this.style.top ?? '') || 0;
    return { left, top, right: left + 200, bottom: top + 100, width: 200, height: 100 };
  }
  contains(other: unknown): boolean {
    return other === this || this.children.some((c) => (c as EventNode).contains(other));
  }
  override focus(): void {
    (globalThis as { document?: { activeElement?: unknown } }).document!.activeElement = this;
  }
  private matches(sel: string): boolean {
    const action = /^\[data-action="(.+)"\]$/.exec(sel);
    if (action) return this.dataset.action === action[1];
    if (sel === '[data-autofocus]') return 'autofocus' in this.dataset;
    if (sel.startsWith('.')) return this.classList.contains(sel.slice(1));
    return this.tag === sel;
  }
  querySelectorAll(sel: string): EventNode[] {
    return (this.children as EventNode[]).flatMap((c) => [...(c.matches(sel) ? [c] : []), ...c.querySelectorAll(sel)]);
  }
  querySelector(sel: string): EventNode | null {
    return this.querySelectorAll(sel)[0] ?? null;
  }
  /** Every element under this one (itself included) of this tag. */
  all(tag: string): EventNode[] {
    return [...(this.tag === tag ? [this] : []), ...(this.children as EventNode[]).flatMap((c) => c.all(tag))];
  }
}

/** The page: listeners added to the document and the window, and which element has the focus. */
export interface FakePage {
  /** Fires `type` at the document's listeners (capture or not), as a press outside would. */
  fireDocument(type: string, target: unknown): void;
  /** Fires `type` at the window's listeners. */
  fireWindow(type: string): void;
  /** How many listeners the document and the window hold now. */
  listenerCount(): number;
  document: { activeElement: unknown };
}

/** Stubs the global `document` with a page whose window is 1280 × 720; undo with vi.unstubAllGlobals(). */
export function stubMenuPage(): FakePage {
  const onDoc = new Map<string, Set<(e: unknown) => void>>();
  const onWin = new Map<string, Set<(e: unknown) => void>>();
  const bag = (m: Map<string, Set<(e: unknown) => void>>, type: string): Set<(e: unknown) => void> => m.get(type) ?? m.set(type, new Set()).get(type)!;
  const win = {
    innerWidth: 1280,
    innerHeight: 720,
    addEventListener: (t: string, f: (e: unknown) => void) => void bag(onWin, t).add(f),
    removeEventListener: (t: string, f: (e: unknown) => void) => void bag(onWin, t).delete(f),
  };
  const document = {
    activeElement: null as unknown,
    defaultView: win,
    createElement: (tag: string) => new EventNode(tag),
    addEventListener: (t: string, f: (e: unknown) => void) => void bag(onDoc, t).add(f),
    removeEventListener: (t: string, f: (e: unknown) => void) => void bag(onDoc, t).delete(f),
  };
  vi.stubGlobal('document', document);
  const count = (m: Map<string, Set<unknown>>): number => [...m.values()].reduce((n, s) => n + s.size, 0);
  return {
    fireDocument: (type, target) => bag(onDoc, type).forEach((f) => f({ type, target })),
    fireWindow: (type) => bag(onWin, type).forEach((f) => f({ type })),
    listenerCount: () => count(onDoc) + count(onWin),
    document,
  };
}
