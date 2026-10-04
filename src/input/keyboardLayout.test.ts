import { describe, expect, it } from 'vitest';
import type { KeyLayout } from './keyBindings';
import { watchKeyboardLayout } from './keyboardLayout';

/** A target that records its listeners, so a test can fire them. */
function target() {
  const listeners = new Map<string, () => void>();
  return {
    addEventListener: (type: string, fn: () => void) => void listeners.set(type, fn),
    removeEventListener: (type: string) => void listeners.delete(type),
    fire: (type: string) => listeners.get(type)?.(),
    listeners,
  };
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('keyboard layout (audit UI-01)', () => {
  it('reads the layout map at start and again on layoutchange and focus', async () => {
    const maps = [new Map([['KeyW', 'z']]), new Map([['KeyW', 'w']]), new Map([['KeyZ', 'y']])];
    const kb = { ...target(), getLayoutMap: async () => maps.shift()! };
    const win = target();
    const seen: KeyLayout[] = [];
    const stop = watchKeyboardLayout(kb, win, (l) => seen.push(l));
    await flush();
    kb.fire('layoutchange');
    await flush();
    win.fire('focus');
    await flush();
    expect(seen.map((l) => l && [...l.entries()])).toEqual([[['KeyW', 'z']], [['KeyW', 'w']], [['KeyZ', 'y']]]);
    stop();
    expect(kb.listeners.size).toBe(0);
    expect(win.listeners.size).toBe(0);
  });

  it('falls back to US names (null) where the browser has no Keyboard Map API (Firefox) or refuses it', async () => {
    const seen: KeyLayout[] = [];
    watchKeyboardLayout(undefined, null, (l) => seen.push(l));
    watchKeyboardLayout({ getLayoutMap: () => Promise.reject(new Error('blocked')) }, null, (l) => seen.push(l));
    await flush();
    expect(seen).toEqual([null, null]);
  });
});
