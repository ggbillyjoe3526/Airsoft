import { describe, expect, it } from 'vitest';
import { DEFAULT_BINDINGS } from '../config/controls';
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

  it('rebinding gives the action only the new key (no hidden extra keys left working)', () => {
    const b = new KeyBindings(null);
    expect(b.rebind('forward', 'KeyI')).toBe(true);
    expect(b.codes('forward')).toEqual(['KeyI']);
    expect(b.actionOf('KeyW')).toBeUndefined();
    expect(b.actionOf('ArrowUp')).toBeUndefined();
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
    expect(b.actionOf('ShiftRight')).toBeUndefined();
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
    store.setItem('airsoft.keyBindings', JSON.stringify({ jump: [] }));
    expect(new KeyBindings(store).codes('jump')).toEqual(['Space']);
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
  });
});
