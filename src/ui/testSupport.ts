/**
 * A just-enough fake DOM for Vitest (no jsdom or happy-dom here): `document.createElement` gives FakeElements that keep
 * their children, class names, hidden/disabled flags and click handlers, enough to build an OptionPicker or a
 * ChoiceDialog and read back what it shows. Install with vi.stubGlobal('document', fakeDocument()).
 */
export class FakeElement {
  className = '';
  textContent = '';
  hidden = false;
  disabled = false;
  type = '';
  open = false;
  innerHTML = '';
  style: Record<string, string> = {};
  readonly children: FakeElement[] = [];
  private readonly attrs = new Map<string, string>();
  private readonly listeners = new Map<string, ((e: unknown) => void)[]>();
  private readonly classes = new Set<string>();

  constructor(readonly tag: string) {}

  readonly classList = {
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
  append(...nodes: FakeElement[]): void {
    this.children.push(...nodes);
  }
  appendChild(node: FakeElement): FakeElement {
    this.children.push(node);
    return node;
  }
  prepend(node: FakeElement): void {
    this.children.unshift(node);
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

export function fakeDocument(): { createElement: (tag: string) => FakeElement } {
  return { createElement: (tag) => new FakeElement(tag) };
}
