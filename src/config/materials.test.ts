import { describe, expect, it } from 'vitest';
import { BALLISTICS } from './ballistics';
import { BLOCK_MATERIALS } from './materials';

describe('block materials', () => {
  it('lets a pallet rack soak BBs up like the wrapped loads beside it: its faces are cardboard and film (bug pass)', () => {
    expect(BLOCK_MATERIALS.rack).toBe(BLOCK_MATERIALS.wrapped);
    expect(BALLISTICS.ricochet.restitution[BLOCK_MATERIALS.rack]).toBe(0);
  });
});
