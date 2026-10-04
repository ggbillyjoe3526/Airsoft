import { describe, expect, it } from 'vitest';
import { DEFAULT_BINDINGS, REBINDABLE } from '../config/controls';
import { bindable, describeKeys, KeyBindings, type KeyValueStore, keyLabel, mouseButtonCode } from './keyBindings';

class MemoryStore implements KeyValueStore {
  readonly data = new Map<string, string>();
  getItem(key: string): string | null {
    return this.data.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    this.data.set(key, value);
  }
}

describe('KeyBindings', () => {
  it('starts with the defaults: Shift walks, Left Alt sprints', () => {
    const b = new KeyBindings(null);
    expect(b.codes('walk')).toEqual(['ShiftLeft', 'ShiftRight']);
    expect(b.primary('sprint')).toBe('AltLeft');
    expect(b.actionOf('KeyW')).toBe('forward');
    expect(b.actionOf('ArrowUp')).toBe('forward');
    expect(b.actionOf('KeyP')).toBeUndefined();
  });

  it('switches the weapon torch on T by default, a key no other action has, and it can be rebound (M33h)', () => {
    const b = new KeyBindings(null);
    expect(b.codes('torch')).toEqual(['KeyT']);
    expect(b.actionOf('KeyT')).toBe('torch');
    expect(bindable('KeyT')).toBe(true);
    expect(REBINDABLE.some((r) => r.action === 'torch')).toBe(true);
  });

  it('holds the scoreboard on Tab by default, and it can be rebound (M19)', () => {
    const b = new KeyBindings(null);
    expect(b.codes('scoreboard')).toEqual(['Tab']);
    expect(b.rebind('scoreboard', 'KeyX')).toBe(true);
    expect(b.codes('scoreboard')).toEqual(['KeyX']);
  });

  it('puts fire and aim on the left and right mouse buttons, and either can move to a key or a side button (M18)', () => {
    const b = new KeyBindings(null);
    expect(b.primary('fire')).toBe('Mouse0');
    expect(b.primary('aim')).toBe('Mouse2');
    expect(b.rebind('reload', 'Mouse3')).toBe(true);
    expect(b.actionOf('Mouse3')).toBe('reload');
    // Taking Left mouse for aim swaps: fire gets aim's old button.
    expect(b.rebind('aim', 'Mouse0')).toBe(true);
    expect(b.primary('fire')).toBe('Mouse2');
    expect(b.rebind('fire', 'KeyF')).toBe(true);
    expect(b.label('fire')).toBe('F');
  });

  it('keeps an old save\'s keys and gives the new fire and aim actions their mouse buttons', () => {
    const store = new Map<string, string>([['airsoft.keyBindings', JSON.stringify({ reload: ['KeyT'] })]]);
    const b = new KeyBindings({ getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, v) });
    expect(b.primary('reload')).toBe('KeyT');
    expect(b.primary('fire')).toBe('Mouse0');
    expect(b.primary('aim')).toBe('Mouse2');
  });

  it('rebinding the main key keeps the second one, shown in its own column (audit UI-05)', () => {
    const b = new KeyBindings(null);
    expect(b.rebind('forward', 'KeyI')).toBe(true);
    expect(b.codes('forward')).toEqual(['KeyI', 'ArrowUp']);
    expect(b.actionOf('KeyW')).toBeUndefined();
    expect(b.actionOf('ArrowUp')).toBe('forward');
  });

  it('binds a second key in slot 1, and an action\'s own second key swaps places with its main key (audit UI-05)', () => {
    const b = new KeyBindings(null);
    expect(b.rebind('reload', 'KeyT', 1)).toBe(true);
    expect(b.codes('reload')).toEqual(['KeyR', 'KeyT']);
    expect(b.rebind('reload', 'KeyT', 0)).toBe(true);
    expect(b.codes('reload')).toEqual(['KeyT', 'KeyR']);
    expect(b.rebind('reload', 'KeyY', 2)).toBe(false); // two slots only
  });

  it('a second key taken from another action\'s only key leaves that action unbound, unless it is essential', () => {
    const b = new KeyBindings(null);
    expect(b.rebind('jump', 'KeyC', 1)).toBe(true);
    expect(b.codes('jump')).toEqual(['Space', 'KeyC']);
    expect(b.codes('crouch')).toEqual([]);
    // Fire's only button can't go to an empty second slot: fire would have none.
    expect(b.strands('aim', 'Mouse0', 1)).toBe('fire');
    expect(b.rebind('aim', 'Mouse0', 1)).toBe(false);
    expect(b.primary('fire')).toBe('Mouse0');
    // Into the main slot it swaps as always, so fire keeps a button.
    expect(b.strands('aim', 'Mouse0', 0)).toBeNull();
  });

  it('clears a key with unbind; the second key moves up; an essential action keeps its last key (audit UI-05)', () => {
    const store = new MemoryStore();
    const b = new KeyBindings(store);
    expect(b.unbind('forward', 0)).toBe(true);
    expect(b.codes('forward')).toEqual(['ArrowUp']);
    expect(b.unbind('forward', 0)).toBe(false); // the last key of Move forward
    expect(b.unbind('jump', 0)).toBe(true);
    expect(b.codes('jump')).toEqual([]);
    expect(b.unbind('jump', 0)).toBe(false); // nothing to clear
    expect(b.unbind('debugOverlay', 0)).toBe(false);
    // Kept so in a new session.
    const again = new KeyBindings(store);
    expect(again.codes('jump')).toEqual([]);
    expect(again.codes('forward')).toEqual(['ArrowUp']);
  });

  it('names the main key for on-screen hints, following a rebind', () => {
    const b = new KeyBindings(null);
    expect(b.label('reload')).toBe('R');
    expect(b.label('walk')).toBe('Left Shift');
    b.rebind('reload', 'KeyX');
    expect(b.label('reload')).toBe('X');
  });

  it('swaps keys when the new key is another action\'s main key', () => {
    const b = new KeyBindings(null);
    b.rebind('reload', 'KeyC');
    expect(b.codes('reload')).toEqual(['KeyC']);
    expect(b.codes('crouch')).toEqual(['KeyR']);
  });

  it('swaps Walk and Sprint when Sprint takes Left Shift; Walk keeps its visible extra key', () => {
    const b = new KeyBindings(null);
    b.rebind('sprint', 'ShiftLeft');
    expect(b.codes('sprint')).toEqual(['ShiftLeft']);
    expect(b.codes('walk')).toEqual(['AltLeft', 'ShiftRight']);
  });

  it('taking another action\'s extra key just removes it there', () => {
    const b = new KeyBindings(null);
    b.rebind('jump', 'ArrowUp');
    expect(b.codes('jump')).toEqual(['ArrowUp']);
    expect(b.codes('forward')).toEqual(['KeyW']);
    expect(b.actionOf('Space')).toBeUndefined();
  });

  it('refuses keys that cannot be bound', () => {
    const b = new KeyBindings(null);
    expect(b.rebind('jump', 'Escape')).toBe(false);
    expect(b.primary('jump')).toBe('Space');
    // Keys the browser can't name (audit L-28): bound, they could never match a press again.
    expect(b.rebind('reload', '')).toBe(false);
    expect(b.rebind('reload', 'Unidentified')).toBe(false);
    expect(b.codes('reload')).toEqual(['KeyR']);
  });

  it('keeps the debug keys reserved: they never swap onto a player key', () => {
    const b = new KeyBindings(null);
    expect(b.rebind('jump', 'Backquote')).toBe(false);
    expect(b.rebind('reload', 'BracketRight')).toBe(false);
    expect(b.codes('jump')).toEqual(['Space']);
    expect(b.codes('debugOverlay')).toEqual(['Backquote', 'F3']);
    expect(b.codes('debugBbPaths')).toEqual(['BracketRight']);
    expect(b.rebind('debugOverlay', 'KeyP')).toBe(false);
  });

  it('saves changes and loads them in a new session', () => {
    const store = new MemoryStore();
    const a = new KeyBindings(store);
    a.rebind('walk', 'ControlLeft');
    const b = new KeyBindings(store);
    expect(b.primary('walk')).toBe('ControlLeft');
    expect(b.codes('walk')).toEqual(['ControlLeft', 'ShiftRight']); // the second key stays (audit UI-05)
  });

  it('resets to the defaults and notifies listeners', () => {
    const store = new MemoryStore();
    const b = new KeyBindings(store);
    let changes = 0;
    b.onChange(() => changes++);
    b.rebind('jump', 'KeyJ');
    b.reset();
    expect(changes).toBe(2);
    expect(b.primary('jump')).toBe('Space');
    expect(new KeyBindings(store).primary('jump')).toBe('Space');
  });

  it('ignores corrupt or invalid saved data', () => {
    const store = new MemoryStore();
    store.setItem('airsoft.keyBindings', '{not json');
    expect(new KeyBindings(store).primary('jump')).toBe('Space');
    store.setItem('airsoft.keyBindings', JSON.stringify({ jump: ['Escape'], reload: [3], nonsense: ['KeyX'] }));
    const b = new KeyBindings(store);
    expect(b.primary('jump')).toBe('Space');
    expect(b.primary('reload')).toBe('KeyR');
    store.setItem('airsoft.keyBindings', JSON.stringify({ reload: [''], jump: ['Unidentified'] }));
    const c = new KeyBindings(store);
    expect(c.codes('reload')).toEqual(['KeyR']);
    expect(c.codes('jump')).toEqual(['Space']);
  });

  it('falls back to the defaults when saved data would leave an action without a key', () => {
    const store = new MemoryStore();
    // A cleared action stays cleared (audit UI-05), but an essential one never loads with no key.
    store.setItem('airsoft.keyBindings', JSON.stringify({ jump: [], forward: [] }));
    expect(new KeyBindings(store).codes('jump')).toEqual([]);
    expect(new KeyBindings(store).codes('forward')).toEqual(['KeyW', 'ArrowUp']);
    // Forward takes Crouch's only key: Crouch would end up with none.
    store.setItem('airsoft.keyBindings', JSON.stringify({ forward: ['KeyC'], crouch: ['KeyC'] }));
    const b = new KeyBindings(store);
    expect(b.codes('forward')).toEqual(['KeyW', 'ArrowUp']);
    expect(b.codes('crouch')).toEqual(['KeyC']);
  });

  it('keeps the player\'s own keys when a newly added action\'s default clashes with one (the new action stays unbound)', () => {
    const store = new MemoryStore();
    // Saved before the fire selector existed: B on the pistol, and a custom jump.
    store.setItem('airsoft.keyBindings', JSON.stringify({ slot2: ['KeyB'], jump: ['KeyJ'] }));
    const b = new KeyBindings(store);
    expect(b.codes('slot2')).toEqual(['KeyB']);
    expect(b.codes('jump')).toEqual(['KeyJ']);
    expect(b.codes('fireMode')).toEqual([]);
    expect(b.primary('fireMode')).toBe('');
    // The player can give it a key afterwards.
    expect(b.rebind('fireMode', 'KeyV')).toBe(true);
    expect(b.codes('fireMode')).toEqual(['KeyV']);
    expect(b.codes('slot2')).toEqual(['KeyB']);
  });

  it('gives the order wheel Z in a set saved while Follow me was on Z; Follow me takes its new default (M23)', () => {
    const store = new MemoryStore();
    // A whole set saved before the wheel existed (every save writes every action), with one change: jump on J.
    const old: Record<string, readonly string[]> = { ...DEFAULT_BINDINGS, orderFollow: ['KeyZ'], jump: ['KeyJ'] };
    delete old.orderWheel;
    store.setItem('airsoft.keyBindings', JSON.stringify(old));
    const b = new KeyBindings(store);
    expect(b.codes('orderWheel')).toEqual(['KeyZ']);
    expect(b.codes('orderFollow')).toEqual(['KeyF']);
    expect(b.codes('jump')).toEqual(['KeyJ']);
  });

  it('keeps Follow me on Z once the player has bound it there themselves after the wheel came (M23)', () => {
    const store = new MemoryStore();
    const b = new KeyBindings(store);
    expect(b.rebind('orderFollow', 'KeyZ')).toBe(true);
    expect(b.codes('orderWheel')).toEqual(['KeyF']); // swapped
    const again = new KeyBindings(store);
    expect(again.codes('orderFollow')).toEqual(['KeyZ']);
    expect(again.codes('orderWheel')).toEqual(['KeyF']);
  });

  it('gives reserved debug keys priority over old saves that used them', () => {
    const store = new MemoryStore();
    store.setItem('airsoft.keyBindings', JSON.stringify({ jump: ['Backquote', 'KeyJ'] }));
    const b = new KeyBindings(store);
    expect(b.codes('debugOverlay')).toEqual(['Backquote', 'F3']);
    expect(b.codes('jump')).toEqual(['KeyJ']);
  });

  it('never leaves one key on two actions after loading', () => {
    const store = new MemoryStore();
    store.setItem('airsoft.keyBindings', JSON.stringify({ jump: ['KeyW'] }));
    const b = new KeyBindings(store);
    const owners = (Object.keys(DEFAULT_BINDINGS) as (keyof typeof DEFAULT_BINDINGS)[]).filter((a) => b.codes(a).includes('KeyW'));
    expect(owners).toHaveLength(1);
  });

  it('survives storage that throws', () => {
    const broken: KeyValueStore = {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
    };
    const b = new KeyBindings(broken);
    expect(b.rebind('jump', 'KeyJ')).toBe(true);
    expect(b.primary('jump')).toBe('KeyJ');
  });
});

describe('bindable', () => {
  it('takes named keys and mouse buttons, not Escape, OS keys or a key the browser could not name', () => {
    expect(bindable('KeyT')).toBe(true);
    expect(bindable('Mouse3')).toBe(true);
    for (const code of ['', 'Unidentified', 'Escape', 'MetaLeft', 'ContextMenu']) expect(bindable(code)).toBe(false);
  });

  it('refuses the browser\'s own keys: reload, fullscreen, developer tools, navigation (audit UI-07)', () => {
    for (const code of ['F5', 'F11', 'F12', 'BrowserBack', 'BrowserForward', 'BrowserRefresh', 'PrintScreen', 'Pause']) expect(bindable(code)).toBe(false);
    expect(bindable('F10')).toBe(true);
    expect(bindable('WheelUp')).toBe(true);
    expect(new KeyBindings(null).rebind('reload', 'F5')).toBe(false);
  });

  it('drops a saved binding on a key that is no longer bindable, keeping the default', () => {
    const store = new MemoryStore();
    store.setItem('airsoft.keyBindings', JSON.stringify({ reload: ['F5'] }));
    expect(new KeyBindings(store).codes('reload')).toEqual(['KeyR']);
  });
});

describe('describeKeys', () => {
  it('lists every key, showing a Left+Right modifier pair as one', () => {
    expect(describeKeys(['KeyW', 'ArrowUp'])).toBe('W / ↑');
    expect(describeKeys(['ShiftLeft', 'ShiftRight'])).toBe('Shift');
    expect(describeKeys(['ShiftRight', 'ShiftLeft'])).toBe('Shift');
    expect(describeKeys(['AltLeft', 'ShiftRight'])).toBe('Left Alt / Right Shift');
    expect(describeKeys(['ControlLeft', 'ControlRight', 'KeyX'])).toBe('Ctrl / X');
  });
});

describe('keyLabel', () => {
  it('gives readable key names', () => {
    expect(keyLabel('KeyW')).toBe('W');
    expect(keyLabel('Digit1')).toBe('1');
    expect(keyLabel('ShiftLeft')).toBe('Left Shift');
    expect(keyLabel('ControlRight')).toBe('Right Ctrl');
    expect(keyLabel('AltLeft')).toBe('Left Alt');
    expect(keyLabel('ArrowUp')).toBe('↑');
    expect(keyLabel('')).toBe('—');
    expect(keyLabel(mouseButtonCode(0))).toBe('Left mouse');
    expect(keyLabel(mouseButtonCode(2))).toBe('Right mouse');
    expect(keyLabel(mouseButtonCode(3))).toBe('Mouse 4');
    expect(keyLabel(mouseButtonCode(4))).toBe('Mouse 5');
    expect(keyLabel('Mouse7')).toBe('Mouse 8');
    expect(keyLabel('WheelUp')).toBe('Wheel up');
    expect(keyLabel('WheelDown')).toBe('Wheel down');
  });

  it('names a key by what the player\'s layout prints on it, keeping digits, arrows and named keys (audit UI-01)', () => {
    const azerty = new Map([
      ['KeyW', 'z'],
      ['KeyA', 'q'],
      ['KeyZ', 'w'],
      ['Digit1', '&'],
      ['BracketRight', '$'],
    ]);
    expect(keyLabel('KeyW', azerty)).toBe('Z');
    expect(keyLabel('KeyZ', azerty)).toBe('W');
    expect(keyLabel('BracketRight', azerty)).toBe('$');
    expect(keyLabel('Digit1', azerty)).toBe('1');
    expect(keyLabel('KeyR', azerty)).toBe('R'); // not in the map: by code
    expect(keyLabel('ShiftLeft', azerty)).toBe('Left Shift');
    expect(keyLabel('KeyW')).toBe('W'); // no layout (Firefox): US names
    expect(describeKeys(['KeyW', 'ArrowUp'], azerty)).toBe('Z / ↑');
  });

  it('follows a layout set on the bindings, telling listeners so hints rename', () => {
    const b = new KeyBindings(null);
    let changes = 0;
    b.onChange(() => changes++);
    expect(b.hasLayout).toBe(false);
    b.setLayout(new Map([['KeyZ', 'y']]));
    expect(b.label('orderWheel')).toBe('Y');
    expect(b.keyName('KeyZ')).toBe('Y');
    expect(b.hasLayout).toBe(true);
    b.setLayout(new Map([['KeyZ', 'y']])); // the same layout read again: no change
    expect(changes).toBe(1);
  });
});
