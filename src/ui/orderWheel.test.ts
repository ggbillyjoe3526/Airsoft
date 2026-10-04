import { describe, expect, it } from 'vitest';
import { REBINDABLE } from '../config/controls';
import { ORDER_WHEEL } from '../config/squad';
import { ORDER_KEYS } from './orderWheel';

describe('the order wheel teaches the direct keys (audit UI-22)', () => {
  it('names a rebindable key for every order but the team plan', () => {
    const rebindable = new Set(REBINDABLE.map((r) => r.action));
    for (const item of ORDER_WHEEL.items) {
      const action = ORDER_KEYS[item.command];
      if (item.command === 'cancel') expect(action).toBeNull();
      else expect(action !== null && rebindable.has(action)).toBe(true);
    }
  });
});
