import { describe, expect, it } from 'vitest';
import { SETTINGS_KEY, SETTINGS_VERSION } from '../../settings/storage';
import { effectiveReducedMotion, loadReducedMotion, motionClass } from './savedChoices';

function storageWith(fields: Record<string, unknown>): Storage {
  const data = new Map<string, string>([[SETTINGS_KEY, JSON.stringify({ version: SETTINGS_VERSION, ...fields })]]);
  return {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
    removeItem: (k: string) => void data.delete(k),
    clear: () => data.clear(),
    key: () => null,
    length: data.size,
  };
}

// Reduced motion is tri-state (audit UI-07): the saved pick, or null while the player has not picked, so the system's
// "reduce motion" setting can decide live. The stored value is the same 'on' | 'off' as before.
describe('reduced motion (audit UI-07)', () => {
  it('reads a saved On or Off, and null when nothing (valid) is saved', () => {
    expect(loadReducedMotion(storageWith({ reducedMotion: 'on' }))).toBe(true);
    expect(loadReducedMotion(storageWith({ reducedMotion: 'off' }))).toBe(false);
    expect(loadReducedMotion(storageWith({}))).toBeNull();
    expect(loadReducedMotion(storageWith({ reducedMotion: 'sideways' }))).toBeNull();
    expect(loadReducedMotion(null)).toBeNull();
  });

  it('follows the system until the player picks, then the pick whatever the system says', () => {
    expect(effectiveReducedMotion(null, true)).toBe(true);
    expect(effectiveReducedMotion(null, false)).toBe(false);
    expect(effectiveReducedMotion(false, true)).toBe(false);
    expect(effectiveReducedMotion(true, false)).toBe(true);
  });

  it('sets a class on #app only once picked, so the stylesheet\'s media query can follow the system', () => {
    expect(motionClass(null)).toBeNull();
    expect(motionClass(true)).toBe('reduced-motion');
    expect(motionClass(false)).toBe('full-motion');
  });
});
