import { describe, expect, it } from 'vitest';
import { MemoryStorage } from '../pool/testStorage';
import { GuardedStorage } from './guardedStorage';

/** A store that refuses writes once `full` is set (a browser out of space). */
class FillingStorage extends MemoryStorage {
  full = false;
  override setItem(k: string, v: string): void {
    if (this.full) throw new DOMException('full', 'QuotaExceededError');
    super.setItem(k, v);
  }
}

describe('guarded storage (M31)', () => {
  it('passes reads and writes to the browser store and tells of each game write', () => {
    const backing = new MemoryStorage();
    const g = new GuardedStorage(backing);
    const heard: string[] = [];
    g.onWrite((k) => heard.push(k));
    g.setItem('airsoft.settings', '{"version":1}');
    g.setItem('other', 'x');
    g.removeItem('airsoft.settings');
    expect(backing.getItem('other')).toBe('x');
    expect(backing.getItem('airsoft.settings')).toBeNull();
    expect(heard).toEqual(['airsoft.settings', 'airsoft.settings']);
    expect(g.keeping).toBe(true);
  });

  it('keeps a refused write in memory, says so once, and reads see it', () => {
    const backing = new FillingStorage();
    const g = new GuardedStorage(backing);
    let problems = 0;
    g.onProblem(() => problems++);
    backing.full = true;
    g.setItem('airsoft.collection', 'a');
    g.setItem('airsoft.collection', 'b');
    expect(g.getItem('airsoft.collection')).toBe('b');
    expect(backing.getItem('airsoft.collection')).toBeNull();
    expect(problems).toBe(1);
    expect(g.blocked).toBe(true);
    expect(g.keeping).toBe(false);
  });

  it('works over memory alone when the browser blocks storage', () => {
    const g = new GuardedStorage(null);
    g.setItem('airsoft.records', 'r');
    expect(g.getItem('airsoft.records')).toBe('r');
    expect(g.length).toBe(1);
    expect(g.key(0)).toBe('airsoft.records');
    expect(g.blocked).toBe(true);
    expect(g.trySet('airsoft.save.meta', '{}')).toBe(false);
  });

  it('frozen, holds the game\'s writes in memory for the visit; writeThrough still reaches the browser', () => {
    const backing = new MemoryStorage();
    backing.setItem('airsoft.settings', 'old');
    const g = new GuardedStorage(backing);
    g.freeze('otherTab');
    g.setItem('airsoft.settings', 'new');
    expect(g.getItem('airsoft.settings')).toBe('new');
    expect(backing.getItem('airsoft.settings')).toBe('old');
    expect(g.trySet('airsoft.save.meta', '{}')).toBe(false);
    g.writeThrough('airsoft.settings', 'loaded');
    expect(backing.getItem('airsoft.settings')).toBe('loaded');
    expect(g.getItem('airsoft.settings')).toBe('loaded');
    // The first reason stays.
    g.freeze('reloading');
    expect(g.frozen).toBe('otherTab');
  });

  it('trySet reports a refusal without raising the saving warning', () => {
    const backing = new FillingStorage();
    const g = new GuardedStorage(backing);
    backing.full = true;
    expect(g.trySet('airsoft.save.restore', '[]')).toBe(false);
    expect(g.blocked).toBe(false);
    expect(g.getItem('airsoft.save.restore')).toBeNull();
  });
});
