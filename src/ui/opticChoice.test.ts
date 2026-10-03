import { describe, expect, it } from 'vitest';
import { DEFAULT_OPTIC, OPTIC_CHOICES, opticOf } from '../config/optics';
import { opticNote, opticTakesEffect } from './opticChoice';

describe('optic choice', () => {
  it('is off by default (iron sights) and offers the red dot', () => {
    expect(DEFAULT_OPTIC).toBe('none');
    expect(opticOf('none')).toBeNull();
    expect(OPTIC_CHOICES.map((o) => o.id)).toEqual(['none', 'redDot']);
    expect(opticOf('redDot')).toBe('redDot');
  });

  it('is fitted at once before the first match and on the result screen, else from the next round', () => {
    expect(opticTakesEffect(false, false)).toBe('now');
    expect(opticTakesEffect(true, true)).toBe('now');
    expect(opticTakesEffect(true, false)).toBe('nextRound');
  });

  it('notes a change only while it waits for the next round', () => {
    expect(opticNote('redDot', 'none', false)).toBe('Fitted from the next round.');
    expect(opticNote('none', 'none', false)).toBe('');
    expect(opticNote('redDot', 'none', true)).toBe('');
  });
});
