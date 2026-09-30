import { describe, expect, it } from 'vitest';
import { DEFAULT_BINDINGS } from '../config/controls';
import { KeyBindings, type KeyValueStore, keyLabel } from './keyBindings';

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
    expect(b.actionOf('KeyZ')).toBeUndefined();
  });

  it('rebinding gives the action only the new key (no hidden extra keys left working)', () => {
    const b = new KeyBindings(null);
    expect(b.rebind('forward', 'KeyI')).toBe(true);
    expect(b.codes('forward')).toEqual(['KeyI']);
    expect(b.actionOf('KeyW')).toBeUndefined();
    expect(b.actionOf('ArrowUp')).toBeUndefined();
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

describe('keyLabel', () => {
  it('gives readable key names', () => {
    expect(keyLabel('KeyW')).toBe('W');
    expect(keyLabel('Digit1')).toBe('1');
    expect(keyLabel('ShiftLeft')).toBe('Left Shift');
    expect(keyLabel('ControlRight')).toBe('Right Ctrl');
    expect(keyLabel('AltLeft')).toBe('Left Alt');
    expect(keyLabel('ArrowUp')).toBe('↑');
    expect(keyLabel('')).toBe('—');
  });
});
