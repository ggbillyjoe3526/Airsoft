import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { WHEEL_CODES } from '../config/controls';
import { KeyBindings } from '../input/keyBindings';
import { KeySettings } from './keySettings';
import { FakeElement } from './testSupport';

/** A button that keeps its click handlers and fires them with a stoppable event, as the page does. */
class Box extends FakeElement {
  private readonly clicks: ((e: unknown) => void)[] = [];
  override addEventListener(type: string, fn: (e: unknown) => void): void {
    if (type === 'click') this.clicks.push(fn);
  }
  override click(): void {
    for (const fn of this.clicks) fn({ detail: 1, stopPropagation() {} });
  }
}

interface Registration {
  type: string;
  fn: (e: never) => void;
  capture: boolean;
  passive: boolean;
}

/** A `window` that remembers its listeners, and removes one only by the type, function and capture flag it was added with. */
function fakeWindow(): { registered: Registration[]; fire: (type: string, event: object) => void } {
  const registered: Registration[] = [];
  const captured = (options: boolean | { capture?: boolean } | undefined): boolean => (typeof options === 'object' ? options.capture === true : options === true);
  vi.stubGlobal('window', {
    addEventListener: (type: string, fn: (e: never) => void, options?: boolean | { capture?: boolean; passive?: boolean }) =>
      registered.push({ type, fn, capture: captured(options), passive: typeof options === 'object' && options.passive === true }),
    removeEventListener: (type: string, fn: (e: never) => void, options?: boolean | { capture?: boolean }) => {
      const at = registered.findIndex((r) => r.type === type && r.fn === fn && r.capture === captured(options));
      if (at >= 0) registered.splice(at, 1);
    },
  });
  return { registered, fire: (type, event) => registered.filter((r) => r.type === type).forEach((r) => r.fn(event as never)) };
}

describe('the Key Bindings wheel listener (audit UI-14)', () => {
  let win: ReturnType<typeof fakeWindow>;
  let settings: KeySettings;
  let boxes: Box[];
  const wheels = (): Registration[] => win.registered.filter((r) => r.type === 'wheel');

  beforeEach(() => {
    vi.stubGlobal('document', { createElement: (tag: string) => (tag === 'button' ? new Box(tag) : new FakeElement(tag)) });
    win = fakeWindow();
    settings = new KeySettings(new KeyBindings(null));
    const list = settings.root as unknown as FakeElement;
    boxes = list.children[0]!.children.flatMap((row) => row.children[1]!.children) as Box[];
  });
  afterEach(() => vi.unstubAllGlobals());

  it('is not on the window while no key box waits, so the page scrolls without waiting for it', () => {
    expect(wheels()).toEqual([]);
    expect(win.registered.map((r) => r.type)).toContain('keydown'); // the key and mouse captures stay
  });

  it('comes on, capturing and non-passive, when a box starts waiting, and goes when it stops', () => {
    boxes[0]!.click();
    expect(wheels()).toMatchObject([{ capture: true, passive: false }]);
    boxes[0]!.click(); // clicking the waiting box again cancels
    expect(wheels()).toEqual([]);
    boxes[0]!.click();
    expect(wheels()).toHaveLength(1);
    win.fire('keydown', { code: 'Escape', repeat: false, preventDefault() {}, stopImmediatePropagation() {} });
    expect(wheels()).toEqual([]);
  });

  it('binds a wheel notch while a box waits, and is gone once it has', () => {
    boxes[0]!.click();
    const event = { deltaY: -100, preventDefault: vi.fn(), stopImmediatePropagation: vi.fn() };
    win.fire('wheel', event);
    expect(event.preventDefault).toHaveBeenCalled();
    expect((boxes[0]!.textContent)).toContain(new KeyBindings(null).describe([WHEEL_CODES.up]));
    expect(wheels()).toEqual([]);
  });

  it('is not left behind when the screen closes or goes', () => {
    boxes[0]!.click();
    expect(wheels()).toHaveLength(1);
    settings.setVisible(false);
    expect(wheels()).toEqual([]);
    boxes[1]!.click();
    expect(wheels()).toHaveLength(1);
    settings.dispose();
    expect(win.registered).toEqual([]);
  });
});
