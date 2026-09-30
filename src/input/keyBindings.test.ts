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

  it('rebinds an action and keeps its extra keys', () => {
    const b = new KeyBindings(null);
    expect(b.rebind('forward', 'KeyI')).toBe(true);
    expect(b.codes('forward')).toEqual(['KeyI', 'ArrowUp']);
    expect(b.actionOf('KeyW')).toBeUndefined();
  });

  it('swaps keys when the new key belongs to another action', () => {
    const b = new KeyBindings(null);
    b.rebind('reload', 'KeyC');
    expect(b.primary('reload')).toBe('KeyC');
    expect(b.primary('crouch')).toBe('KeyR');
    expect(b.actionOf('KeyC')).toBe('reload');
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
    expect(b.actionOf('ShiftRight')).toBe('walk');
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
