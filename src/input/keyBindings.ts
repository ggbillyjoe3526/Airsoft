import { type Action, DEFAULT_BINDINGS, REBINDABLE, UNBINDABLE_KEYS } from '../config/controls';

const REBINDABLE_ACTIONS: ReadonlySet<Action> = new Set(REBINDABLE.map((r) => r.action));

const STORAGE_KEY = 'airsoft.keyBindings';

/** Minimal storage interface (window.localStorage in the game, a map in tests). */
export interface KeyValueStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

/**
 * The player's key bindings: defaults plus their changes, saved in the browser. Each action has an
 * ordered list of keys (defaults give some a second key, e.g. arrow keys); the settings show them all.
 * A key belongs to at most one action, and every action always has at least one key.
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
   * Makes `code` the only key for `action` (its other keys are released). If another action used
   * `code` as its main key, that action gets `action`'s old main key in its place (a swap); if it was
   * only its extra key, it just loses it. Returns false for keys that can't be bound, including keys
   * reserved by actions the settings don't list (the debug keys), which never swap.
   */
  rebind(action: Action, code: string): boolean {
    if (UNBINDABLE_KEYS.has(code) || !REBINDABLE_ACTIONS.has(action)) return false;
    const owner = this.actionOf(code);
    if (owner && !REBINDABLE_ACTIONS.has(owner)) return false;
    const mine = this.map.get(action) ?? [];
    const old = mine[0];
    const other = owner;
    if (other && other !== action) {
      const theirs = this.map.get(other)!;
      const swapIn = old !== undefined && !theirs.includes(old) && (theirs[0] === code || theirs.length === 1);
      this.map.set(other, theirs.flatMap((c) => (c !== code ? [c] : swapIn ? [old] : [])));
    }
    this.map.set(action, [code]);
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
        if (!REBINDABLE_ACTIONS.has(action)) continue; // debug keys always keep their defaults
      const codes = saved[action];
        if (Array.isArray(codes) && codes.length > 0 && codes.every((c) => typeof c === 'string' && !UNBINDABLE_KEYS.has(c))) this.map.set(action, codes as string[]);
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
    // An action left with no key can't be used or even seen: the saved set is unusable, start over.
    for (const codes of this.map.values()) {
      if (codes.length === 0) {
        this.reset(false);
        return;
      }
    }
  }
}

/** An action's keys for display; a Left+Right pair of one modifier shows as just "Shift" etc. */
export function describeKeys(codes: readonly string[]): string {
  const labels: string[] = [];
  for (const code of codes) {
    const side = code.match(/^(Shift|Control|Alt)(Left|Right)$/);
    const twin = side ? `${side[1]}${side[2] === 'Left' ? 'Right' : 'Left'}` : '';
    if (side && codes.includes(twin)) {
      if (side[2] === 'Left') labels.push(side[1] === 'Control' ? 'Ctrl' : side[1]!);
    } else {
      labels.push(keyLabel(code));
    }
  }
  return labels.join(' / ');
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
