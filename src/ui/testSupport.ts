/**
 * A just-enough fake DOM for Vitest (no jsdom or happy-dom here): `document.createElement` gives FakeElements that keep
 * their children, class names, hidden/disabled flags and click handlers, enough to build an OptionPicker or a
 * ChoiceCards and read back what it shows. Install with vi.stubGlobal('document', fakeDocument()). A string appended
 * becomes a '#text' child holding it.
 */
export class FakeElement {
  className = '';
  textContent = '';
  hidden = false;
  disabled = false;
  type = '';
  open = false;
  innerHTML = '';
  src = '';
  alt = '';
  decoding = '';
  /** Inline styles by name; style.setProperty('--share', '0.5') sets style['--share'], as the CSSOM's does. */
  style: Record<string, string> = fakeStyle();
  readonly children: FakeElement[] = [];
  private readonly attrs = new Map<string, string>();
  private readonly listeners = new Map<string, ((e: unknown) => void)[]>();
  private readonly classes = new Set<string>();

  constructor(readonly tag: string) {}

  readonly classList = {
    add: (...names: string[]): void => {
      for (const name of names) this.classes.add(name);
    },
    remove: (...names: string[]): void => {
      for (const name of names) this.classes.delete(name);
    },
    toggle: (name: string, force?: boolean): boolean => {
      const on = force ?? !this.classes.has(name);
      if (on) this.classes.add(name);
      else this.classes.delete(name);
      return on;
    },
    contains: (name: string): boolean => this.classes.has(name) || this.className.split(/\s+/).includes(name),
  };

  setAttribute(name: string, value: string): void {
    this.attrs.set(name, value);
  }
  getAttribute(name: string): string | null {
    return this.attrs.get(name) ?? null;
  }
  /** The element this one was put in (append, appendChild, prepend, after), for `after`. */
  parent: FakeElement | null = null;
  append(...nodes: (FakeElement | string)[]): void {
    for (const n of nodes) {
      const node = typeof n === 'string' ? textNode(n) : n;
      node.parent = this;
      this.children.push(node);
    }
  }
  removeAttribute(name: string): void {
    this.attrs.delete(name);
  }
  hasAttribute(name: string): boolean {
    return this.attrs.has(name);
  }
  /** The text of this element and everything in it, as the DOM's textContent reads it when it has children. */
  get text(): string {
    return this.children.length === 0 ? this.textContent : this.children.map((c) => c.text).join('');
  }
  appendChild(node: FakeElement): FakeElement {
    node.parent = this;
    this.children.push(node);
    return node;
  }
  prepend(n: FakeElement | string): void {
    const node = typeof n === 'string' ? textNode(n) : n;
    node.parent = this;
    this.children.unshift(node);
  }
  /** Puts `node` right after this element in its parent, as the DOM's Element.after does. */
  after(node: FakeElement): void {
    if (!this.parent) return;
    node.parent = this.parent;
    this.parent.children.splice(this.parent.children.indexOf(this) + 1, 0, node);
  }
  insertAdjacentHTML(): void {}
  addEventListener(type: string, fn: (e: unknown) => void): void {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), fn]);
  }
  /** Fires the click handlers, as a person's click would unless the element is disabled. */
  click(): void {
    if (this.disabled) return;
    for (const fn of this.listeners.get('click') ?? []) fn({ target: this });
  }
  focus(): void {}
  /** Takes the element out of its parent, as the DOM's Element.remove does. */
  remove(): void {
    if (!this.parent) return;
    this.parent.children.splice(this.parent.children.indexOf(this), 1);
    this.parent = null;
  }
  showModal(): void {
    this.open = true;
  }
  close(): void {
    this.open = false;
  }
  getBoundingClientRect(): { left: number; right: number; top: number; bottom: number } {
    return { left: 0, right: 0, top: 0, bottom: 0 };
  }
}

function fakeStyle(): Record<string, string> {
  const style: Record<string, string> = {};
  // Out of sight of a test's toEqual on the styles: not an own enumerable property.
  Object.defineProperty(style, 'setProperty', { value: (name: string, value: string) => (style[name] = value), enumerable: false, writable: true });
  return style;
}

function textNode(text: string): FakeElement {
  const node = new FakeElement('#text');
  node.textContent = text;
  return node;
}

/** Every element under `root` (itself included) whose class list has `name`, in document order. */
export function findAll(root: FakeElement, name: string): FakeElement[] {
  const found = root.classList.contains(name) ? [root] : [];
  for (const c of root.children) found.push(...findAll(c, name));
  return found;
}

export function fakeDocument(): { createElement: (tag: string) => FakeElement } {
  return { createElement: (tag) => new FakeElement(tag) };
}
