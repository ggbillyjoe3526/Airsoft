import { type Action, BROWSER_KEYS, DEFAULT_BINDINGS, ESSENTIAL_ACTIONS, KEY_SLOTS, MOVED_DEFAULTS, REBINDABLE, UNBINDABLE_KEYS, WHEEL_CODES } from '../config/controls';
import { overStored } from '../save/overStored';

const REBINDABLE_ACTIONS: ReadonlySet<Action> = new Set(REBINDABLE.map((r) => r.action));

/** Where the bindings are saved (one of the stores a save file carries, save/stores.ts). */
export const KEY_BINDINGS_KEY = 'airsoft.keyBindings';

/**
 * What each physical key prints on the player's keyboard layout, by KeyboardEvent.code (`KeyW` → "z" on AZERTY), as
 * `navigator.keyboard.getLayoutMap()` gives it (input/keyboardLayout.ts; Chrome and Edge). Null where the browser
 * can't tell (Firefox): key names then follow a US layout.
 */
export type KeyLayout = ReadonlyMap<string, string> | null;

/** Minimal storage interface (window.localStorage in the game, a map in tests). */
export interface KeyValueStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

/**
 * The player's key bindings: defaults plus their changes, saved in the browser. Each action has up to KEY_SLOTS keys
 * in order, its main key first (defaults give some a second key, e.g. arrow keys); Settings → Key Bindings shows a
 * column for each (audit UI-05). A key belongs to at most one action. An action can be left with no key: one the
 * player cleared (not an ESSENTIAL_ACTIONS one), or one added after the player saved their bindings whose default key
 * they already use for something else (shown as "—" until they pick a key; their own bindings are kept).
 */
export class KeyBindings {
  private map = new Map<Action, string[]>();
  private readonly listeners = new Set<() => void>();
  private layoutMap: KeyLayout = null;

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

  /** The readable name of `action`'s main key ("R", "Left Shift"), on the player's keyboard layout; '' if it's unbound. */
  label(action: Action): string {
    const code = this.primary(action);
    return code ? keyLabel(code, this.layoutMap) : '';
  }

  /** The readable name of `code` on the player's keyboard layout (keyLabel). */
  keyName(code: string): string {
    return keyLabel(code, this.layoutMap);
  }

  /** Keys for display on the player's keyboard layout (describeKeys). */
  describe(codes: readonly string[]): string {
    return describeKeys(codes, this.layoutMap);
  }

  /** The keyboard layout key names follow (null: US names). Listeners hear of a change, so hints and settings rename. */
  setLayout(layout: KeyLayout): void {
    if (sameLayout(layout, this.layoutMap)) return;
    this.layoutMap = layout;
    for (const fn of this.listeners) fn();
  }

  /** Whether key names follow the player's own keyboard layout (false: US names, e.g. in Firefox). */
  get hasLayout(): boolean {
    return this.layoutMap !== null;
  }

  /** The action `code` is bound to, if any. */
  actionOf(code: string): Action | undefined {
    for (const [action, codes] of this.map) if (codes.includes(code)) return action;
    return undefined;
  }

  /**
   * Puts `code` in `action`'s key `slot` (0 the main key, 1 the second; audit UI-05), keeping its other key. If another
   * action had `code` as its main key, it gets this slot's old key in its place (a swap) or, with none to give, its
   * second key moves up; if `code` was only its second key, it just loses it. Returns false for keys that can't be
   * bound, keys reserved by actions the settings don't list (the debug keys, which never swap), and a take that would
   * leave an ESSENTIAL_ACTIONS action with no key (`strands`).
   */
  rebind(action: Action, code: string, slot = 0): boolean {
    if (!bindable(code) || !REBINDABLE_ACTIONS.has(action) || slot < 0 || slot >= KEY_SLOTS) return false;
    const other = this.actionOf(code);
    if (other && !REBINDABLE_ACTIONS.has(other)) return false;
    if (this.strands(action, code, slot)) return false;
    const mine = [...(this.map.get(action) ?? [])];
    const old = mine[slot];
    if (other && other !== action) {
      const theirs = this.map.get(other)!;
      const j = theirs.indexOf(code);
      const swapIn = j === 0 && old !== undefined && !theirs.includes(old);
      this.map.set(other, theirs.flatMap((c) => (c !== code ? [c] : swapIn ? [old] : [])));
    }
    const k = mine.indexOf(code);
    if (k >= 0 && k !== slot) {
      // Already this action's other key: the two change places.
      if (old === undefined) mine.splice(k, 1);
      else mine[k] = old;
    }
    if (slot < mine.length) mine[slot] = code;
    else mine.push(code);
    this.map.set(action, mine);
    this.save();
    return true;
  }

  /**
   * The ESSENTIAL_ACTIONS action that putting `code` in `action`'s `slot` would leave with no key (it is that action's
   * only key and the slot has none to swap in), or null.
   */
  strands(action: Action, code: string, slot = 0): Action | null {
    const other = this.actionOf(code);
    if (!other || other === action || !ESSENTIAL_ACTIONS.has(other)) return null;
    const theirs = this.map.get(other)!;
    const old = this.map.get(action)?.[slot];
    const left = theirs.length - 1 + (theirs[0] === code && old !== undefined && !theirs.includes(old) ? 1 : 0);
    return left > 0 ? null : other;
  }

  /**
   * Clears `action`'s key `slot` (Backspace or Delete in Key Bindings; audit UI-05): its second key moves up if the
   * main key goes. Refused (false) for an empty slot, an action the settings don't list, and the last key of an
   * ESSENTIAL_ACTIONS action.
   */
  unbind(action: Action, slot = 0): boolean {
    const mine = this.map.get(action) ?? [];
    if (!REBINDABLE_ACTIONS.has(action) || slot < 0 || slot >= mine.length) return false;
    if (mine.length === 1 && ESSENTIAL_ACTIONS.has(action)) return false;
    this.map.set(action, mine.filter((_, i) => i !== slot));
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
      // Actions a newer build added (or a loaded save carried in) keep their keys (M31).
      if (this.store) this.store.setItem(KEY_BINDINGS_KEY, JSON.stringify(overStored(this.store, KEY_BINDINGS_KEY, Object.fromEntries(this.map))));
    } catch {
      // Storage unavailable: the change still applies for this session.
    }
    for (const fn of this.listeners) fn();
  }

  /** Applies saved bindings over the defaults, ignoring anything malformed or unknown. */
  private load(): void {
    let raw: string | null = null;
    try {
      raw = this.store?.getItem(KEY_BINDINGS_KEY) ?? null;
    } catch {
      return;
    }
    if (!raw) return;
    /** Actions whose keys came from the saved set (the rest are on their defaults), and those saved with none. */
    const fromSave = new Set<Action>();
    const savedEmpty = new Set<Action>();
    try {
      const saved = JSON.parse(raw) as Record<string, unknown>;
      for (const action of Object.keys(DEFAULT_BINDINGS) as Action[]) {
        if (!REBINDABLE_ACTIONS.has(action)) continue; // debug keys always keep their defaults
        const codes = saved[action];
        if (!Array.isArray(codes) || codes.length > KEY_SLOTS || !codes.every((c) => typeof c === 'string' && bindable(c))) continue;
        // No key: the player cleared it (audit UI-05), or it was saved unbound; kept so, except for an essential action.
        if (codes.length === 0) {
          if (!ESSENTIAL_ACTIONS.has(action)) {
            this.map.set(action, []);
            savedEmpty.add(action);
          }
          continue;
        }
        if (movedDefault(saved, action, codes as string[])) continue;
        this.map.set(action, codes as string[]);
        fromSave.add(action);
      }
    } catch {
      // Corrupt entry: keep the defaults.
    }
    // A key belongs to one action. On a clash the reserved debug keys win, then the player's saved choices
    // (so a newly added action's default never takes a key they bound), then the first action in the table.
    const rank = (a: Action): number => (!REBINDABLE_ACTIONS.has(a) ? 0 : fromSave.has(a) || savedEmpty.has(a) ? 1 : 2);
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

/** `action`'s saved `codes` are an old default a later action has since taken (MOVED_DEFAULTS), in a set saved before it. */
function movedDefault(saved: Record<string, unknown>, action: Action, codes: readonly string[]): boolean {
  return MOVED_DEFAULTS.some((m) => m.action === action && !(m.added in saved) && m.old.length === codes.length && m.old.every((c, i) => codes[i] === c));
}

/** Whether `code` can be bound: not empty (a key the browser couldn't name), not UNBINDABLE_KEYS nor BROWSER_KEYS. */
export function bindable(code: string): boolean {
  return code.length > 0 && !UNBINDABLE_KEYS.has(code) && !BROWSER_KEYS.has(code);
}

/** An action's keys for display; a Left+Right pair of one modifier shows as just "Shift" etc. */
export function describeKeys(codes: readonly string[], layout: KeyLayout = null): string {
  const labels: string[] = [];
  for (const code of codes) {
    const side = code.match(/^(Shift|Control|Alt)(Left|Right)$/);
    const twin = side ? `${side[1]}${side[2] === 'Left' ? 'Right' : 'Left'}` : '';
    if (side && codes.includes(twin)) {
      if (side[2] === 'Left') labels.push(side[1] === 'Control' ? 'Ctrl' : side[1]!);
    } else {
      labels.push(keyLabel(code, layout));
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
const KEY_NAMES: Readonly<Record<string, string>> = {
  Space: 'Space',
  Backquote: '`',
  CapsLock: 'Caps Lock',
  Enter: 'Enter',
  Tab: 'Tab',
  Backspace: 'Backspace',
  [WHEEL_CODES.up]: 'Wheel up',
  [WHEEL_CODES.down]: 'Wheel down',
};
const SIDE_KEY = /^(Shift|Control|Alt|Meta)(Left|Right)$/;

/** Codes whose key shows the same thing on every layout people play on: named by code alone, never by the layout. */
const LAYOUT_FREE = /^(Digit|Numpad|Arrow|F\d|Mouse|Wheel)/;

/**
 * A readable name for a KeyboardEvent.code ("KeyW" → "W", "ShiftLeft" → "Left Shift"), a mouse button's or a wheel
 * direction's code. With the player's keyboard `layout` (audit UI-01), a key that prints a character is named by it:
 * `KeyW` is "Z" on AZERTY, `KeyZ` "Y" on QWERTZ. The number row keeps its digits (AZERTY prints "&" unshifted on 1).
 */
export function keyLabel(code: string, layout: KeyLayout = null): string {
  if (!code) return '—';
  if (layout && !LAYOUT_FREE.test(code)) {
    const printed = layout.get(code);
    if (printed && printed.trim() !== '') return printed.toUpperCase();
  }
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

/** Whether two layouts name every key the same (a layout read again on focus usually hasn't changed). */
function sameLayout(a: KeyLayout, b: KeyLayout): boolean {
  if (a === b) return true;
  if (!a || !b || a.size !== b.size) return false;
  for (const [code, printed] of a) if (b.get(code) !== printed) return false;
  return true;
}
