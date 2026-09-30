import { type Action, DEFAULT_BINDINGS, UNBINDABLE_KEYS } from '../config/controls';

const STORAGE_KEY = 'airsoft.keyBindings';

/** Minimal storage interface (window.localStorage in the game, a map in tests). */
export interface KeyValueStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

/**
 * The player's key bindings: defaults plus their changes, saved in the browser. Each action has an
 * ordered list of keys; the first is the one shown and changed in the settings. A key belongs to at
 * most one action: binding a key that another action uses swaps their keys.
 */
export class KeyBindings {
  private map = new Map<Action, string[]>();
  private readonly listeners = new Set<() => void>();

  constructor(private readonly store: KeyValueStore | null) {
    this.reset(false);
    this.load();
  }

  codes(action: Action): readonly string[] {
    return this.map.get(action) ?? [];
  }

  /** The key shown for `action` (its first key), or '' if unbound. */
  primary(action: Action): string {
    return this.codes(action)[0] ?? '';
  }

  /** The action `code` is bound to, if any. */
  actionOf(code: string): Action | undefined {
    for (const [action, codes] of this.map) if (codes.includes(code)) return action;
    return undefined;
  }

  /**
   * Makes `code` the main key for `action`. If another action used `code`, it gets `action`'s old main
   * key instead (a swap), so nothing is silently left without a key. Returns false for keys that
   * can't be bound.
   */
  rebind(action: Action, code: string): boolean {
    if (UNBINDABLE_KEYS.has(code)) return false;
    const mine = this.map.get(action) ?? [];
    const old = mine[0];
    if (old === code) return true;
    const other = this.actionOf(code);
    if (other && other !== action) {
      const theirs = this.map.get(other)!.filter((c) => c !== code);
      if (old !== undefined && !theirs.includes(old)) theirs.unshift(old);
      this.map.set(other, theirs);
    }
    // The new key first; keep the action's other keys (e.g. arrow keys), minus the old main key.
    this.map.set(action, [code, ...mine.filter((c) => c !== code && c !== old)]);
    this.save();
    return true;
  }

  /** Back to the defaults (and saved). */
  reset(save = true): void {
    this.map = new Map((Object.keys(DEFAULT_BINDINGS) as Action[]).map((a) => [a, [...DEFAULT_BINDINGS[a]]]));
    if (save) this.save();
  }

  onChange(fn: () => void): void {
    this.listeners.add(fn);
  }

  private save(): void {
    try {
      this.store?.setItem(STORAGE_KEY, JSON.stringify(Object.fromEntries(this.map)));
    } catch {
      // Storage unavailable: the change still applies for this session.
    }
    for (const fn of this.listeners) fn();
  }

  /** Applies saved bindings over the defaults, ignoring anything malformed or unknown. */
  private load(): void {
    let raw: string | null = null;
    try {
      raw = this.store?.getItem(STORAGE_KEY) ?? null;
    } catch {
      return;
    }
    if (!raw) return;
    try {
      const saved = JSON.parse(raw) as Record<string, unknown>;
      for (const action of Object.keys(DEFAULT_BINDINGS) as Action[]) {
        const codes = saved[action];
        if (Array.isArray(codes) && codes.every((c) => typeof c === 'string' && !UNBINDABLE_KEYS.has(c))) this.map.set(action, codes as string[]);
      }
    } catch {
      // Corrupt entry: keep the defaults.
    }
    // A key belongs to one action: if saved keys clash with a default (e.g. a newly added action), the
    // first action in the table keeps it.
    const seen = new Set<string>();
    for (const [action, codes] of this.map) {
      this.map.set(action, codes.filter((c) => !seen.has(c)));
      for (const c of codes) seen.add(c);
    }
  }
}

/** A readable name for a KeyboardEvent.code ("KeyW" → "W", "ShiftLeft" → "Left Shift"). */
export function keyLabel(code: string): string {
  if (!code) return '—';
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  if (code.startsWith('Numpad')) return `Num ${code.slice(6)}`;
  const arrows: Record<string, string> = { ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→' };
  if (arrows[code]) return arrows[code]!;
  const side = code.match(/^(Shift|Control|Alt|Meta)(Left|Right)$/);
  if (side) return `${side[2]} ${side[1] === 'Control' ? 'Ctrl' : side[1]}`;
  const names: Record<string, string> = { Space: 'Space', Backquote: '`', CapsLock: 'Caps Lock', Enter: 'Enter', Tab: 'Tab', Backspace: 'Backspace' };
  return names[code] ?? code;
}
