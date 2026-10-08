import { afterEach, describe, expect, it, vi } from 'vitest';
import { watchScroll } from './menuParts';

/** A screen root with just what watchScroll touches. */
function fakeRoot(children: object[] = [{}, {}]) {
  const listeners = new Set<unknown>();
  const toggle = vi.fn();
  const root = {
    scrollTop: 0,
    clientHeight: 100,
    scrollHeight: 400,
    children,
    classList: { toggle },
    addEventListener: (_type: string, fn: unknown) => listeners.add(fn),
    removeEventListener: (_type: string, fn: unknown) => listeners.delete(fn),
  };
  return { root: root as unknown as HTMLElement, listeners, toggle };
}

describe('watchScroll (audit CORE-07)', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('observes the screen and its children, and its stop function removes the listener and disconnects the observer', () => {
    const observed: unknown[] = [];
    const disconnect = vi.fn();
    vi.stubGlobal(
      'ResizeObserver',
      class {
        observe = (target: unknown): number => observed.push(target);
        disconnect = disconnect;
      },
    );
    const { root, listeners } = fakeRoot();
    const stop = watchScroll(root);
    expect(listeners.size).toBe(1);
    expect(observed).toHaveLength(3);
    expect(disconnect).not.toHaveBeenCalled();
    stop();
    expect(listeners.size).toBe(0);
    expect(disconnect).toHaveBeenCalledTimes(1);
  });

  it('still removes its scroll listener where there is no ResizeObserver', () => {
    vi.stubGlobal('ResizeObserver', undefined);
    const { root, listeners } = fakeRoot();
    const stop = watchScroll(root);
    expect(listeners.size).toBe(1);
    stop();
    expect(listeners.size).toBe(0);
  });

  it('marks the screen more-below from the scroll listener', () => {
    vi.stubGlobal('ResizeObserver', undefined);
    const { root, listeners, toggle } = fakeRoot();
    watchScroll(root);
    for (const fn of listeners) (fn as () => void)();
    expect(toggle).toHaveBeenCalledWith('more-below', true);
  });
});
