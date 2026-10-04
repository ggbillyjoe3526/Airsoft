import type { KeyLayout } from './keyBindings';

/** The part of `navigator.keyboard` (Keyboard Map API: Chrome, Edge) the game uses. */
export interface KeyboardMapSource {
  getLayoutMap(): Promise<ReadonlyMap<string, string>>;
  addEventListener?(type: 'layoutchange', listener: () => void): void;
  removeEventListener?(type: 'layoutchange', listener: () => void): void;
}

/** Where the layout can change: the window regains focus after the player switched layouts elsewhere. */
export interface FocusSource {
  addEventListener(type: 'focus', listener: () => void): void;
  removeEventListener(type: 'focus', listener: () => void): void;
}

/**
 * Follows the player's keyboard layout (audit UI-01), so key names on screen are the letters printed on their keys:
 * reads `navigator.keyboard.getLayoutMap()` at start, again on `layoutchange` where the browser fires it, and when the
 * window regains focus (where it doesn't). `onLayout` gets the map, or null where the browser has no Keyboard Map API
 * (Firefox) or refuses it (an iframe without permission): names then follow a US layout. Returns the unsubscribe.
 */
export function watchKeyboardLayout(keyboard: KeyboardMapSource | undefined, focus: FocusSource | null, onLayout: (layout: KeyLayout) => void): () => void {
  if (!keyboard || typeof keyboard.getLayoutMap !== 'function') {
    onLayout(null);
    return () => undefined;
  }
  let stopped = false;
  const read = (): void => {
    keyboard.getLayoutMap().then(
      (map) => {
        if (!stopped) onLayout(map);
      },
      () => {
        if (!stopped) onLayout(null);
      },
    );
  };
  read();
  keyboard.addEventListener?.('layoutchange', read);
  focus?.addEventListener('focus', read);
  return () => {
    stopped = true;
    keyboard.removeEventListener?.('layoutchange', read);
    focus?.removeEventListener('focus', read);
  };
}

/** `navigator.keyboard` where the browser has it (typed loosely: it isn't in TypeScript's DOM library). */
export function browserKeyboardMap(): KeyboardMapSource | undefined {
  try {
    return (globalThis.navigator as (Navigator & { keyboard?: KeyboardMapSource }) | undefined)?.keyboard;
  } catch {
    return undefined;
  }
}
