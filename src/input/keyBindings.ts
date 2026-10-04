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
 * A key belongs to at most one action, and every action has at least one key, except an action added after
 * the player saved their bindings whose default key they already use for something else: it stays unbound
 * (shown as "—" in the settings) until they pick a key, and their own bindings are kept.
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

  /** The readable name of `action`'s main key ("R", "Left Shift"), or '' if it's unbound. */
  label(action: Action): string {
    const code = this.primary(action);
    return code ? keyLabel(code) : '';
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
    if (!bindable(code) || !REBINDABLE_ACTIONS.has(action)) return false;
    const other = this.actionOf(code);
    if (other && !REBINDABLE_ACTIONS.has(other)) return false;
    const mine = this.map.get(action) ?? [];
    const old = mine[0];
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
    /** Actions whose keys came from the saved set (the rest are on their defaults). */
    const fromSave = new Set<Action>();
    try {
      const saved = JSON.parse(raw) as Record<string, unknown>;
      for (const action of Object.keys(DEFAULT_BINDINGS) as Action[]) {
        if (!REBINDABLE_ACTIONS.has(action)) continue; // debug keys always keep their defaults
        const codes = saved[action];
        if (Array.isArray(codes) && codes.length > 0 && codes.every((c) => typeof c === 'string' && bindable(c))) {
          this.map.set(action, codes as string[]);
          fromSave.add(action);
        }
      }
    } catch {
      // Corrupt entry: keep the defaults.
    }
    // A key belongs to one action. On a clash the reserved debug keys win, then the player's saved choices
    // (so a newly added action's default never takes a key they bound), then the first action in the table.
    const rank = (a: Action): number => (!REBINDABLE_ACTIONS.has(a) ? 0 : fromSave.has(a) ? 1 : 2);
    const seen = new Set<string>();
    const order = [...this.map.keys()].sort((a, b) => rank(a) - rank(b));
    for (const action of order) {
      const codes = this.map.get(action)!;
      this.map.set(action, codes.filter((c) => !seen.has(c)));
      for (const c of codes) seen.add(c);
    }
    // A saved action left with no key means the saved set is unusable: start over. An action on its
    // defaults that lost its key to the player's own bindings just stays unbound until they pick one.
    for (const action of fromSave) {
      if (this.map.get(action)!.length === 0) {
        this.reset(false);
        return;
      }
    }
  }
}

/** Whether `code` can be bound: not empty (a key the browser couldn't name) and not one of UNBINDABLE_KEYS. */
export function bindable(code: string): boolean {
  return code.length > 0 && !UNBINDABLE_KEYS.has(code);
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
  return labels.length > 0 ? labels.join(' / ') : keyLabel('');
}

/**
 * The binding code of a mouse button (MouseEvent.button: 0 left, 1 middle/wheel, 2 right, 3 and 4 the side buttons),
 * so mouse buttons bind like keys (M18).
 */
export function mouseButtonCode(button: number): string {
  return `Mouse${button}`;
}

/** Mouse buttons by their usual names: the side buttons are "Mouse 4" and "Mouse 5" in most games and mouse software. */
const MOUSE_LABELS: Readonly<Record<string, string>> = {
  Mouse0: 'Left mouse',
  Mouse1: 'Middle mouse',
  Mouse2: 'Right mouse',
  Mouse3: 'Mouse 4',
  Mouse4: 'Mouse 5',
};

const ARROW_LABELS: Readonly<Record<string, string>> = { ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→' };
const KEY_NAMES: Readonly<Record<string, string>> = { Space: 'Space', Backquote: '`', CapsLock: 'Caps Lock', Enter: 'Enter', Tab: 'Tab', Backspace: 'Backspace' };
const SIDE_KEY = /^(Shift|Control|Alt|Meta)(Left|Right)$/;

/** A readable name for a KeyboardEvent.code ("KeyW" → "W", "ShiftLeft" → "Left Shift") or a mouse button's code. */
export function keyLabel(code: string): string {
  if (!code) return '—';
  if (code.startsWith('Mouse')) return MOUSE_LABELS[code] ?? `Mouse ${Number(code.slice(5)) + 1}`;
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  if (code.startsWith('Numpad')) return `Num ${code.slice(6)}`;
  const arrow = ARROW_LABELS[code];
  if (arrow) return arrow;
  const side = SIDE_KEY.exec(code);
  if (side) return `${side[2]} ${side[1] === 'Control' ? 'Ctrl' : side[1]}`;
  return KEY_NAMES[code] ?? code;
}
