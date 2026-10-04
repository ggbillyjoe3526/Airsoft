import { describe, expect, it } from 'vitest';
import { SQUAD_ORDERS } from '../config/squad';
import { squadLineText } from './squadOrderLine';

describe('squad order line (M22)', () => {
  it('names the order in force, shows nothing for the team plan, and a notice over either', () => {
    expect(squadLineText('follow', '')).toBe('Squad · Follow me');
    expect(squadLineText('hold', '')).toBe('Squad · Hold here');
    expect(squadLineText('none', '')).toBe('');
    expect(squadLineText('none', SQUAD_ORDERS.cancelled)).toBe(SQUAD_ORDERS.cancelled);
    expect(squadLineText('regroup', SQUAD_ORDERS.nobody)).toBe(SQUAD_ORDERS.nobody);
  });
});
