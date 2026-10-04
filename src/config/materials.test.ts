import { describe, expect, it } from 'vitest';
import { BALLISTICS } from './ballistics';
import { BLOCK_MATERIALS, TERRAIN_MATERIAL } from './materials';
import { IMPACT_DUST } from './render';
import { cues, IMPACT_MATERIALS, SOUNDS } from './sounds';

describe('block materials', () => {
  it('lets a pallet rack soak BBs up like the wrapped loads beside it: its faces are cardboard and film (bug pass)', () => {
    expect(BLOCK_MATERIALS.rack).toBe(BLOCK_MATERIALS.wrapped);
    expect(BALLISTICS.ricochet.restitution[BLOCK_MATERIALS.rack]).toBe(0);
  });
});

describe('the earth impact material (M33c)', () => {
  it('is what the ground of a map with terrain is made of, and no block is made of it', () => {
    expect(TERRAIN_MATERIAL).toBe('earth');
    expect(IMPACT_MATERIALS).toContain('earth');
    expect(Object.values(BLOCK_MATERIALS)).not.toContain('earth');
  });

  it('gives a BB no bounce, a sound cue and a dust puff of its own, like every other material', () => {
    expect(BALLISTICS.ricochet.restitution.earth).toBe(0);
    for (const m of IMPACT_MATERIALS) {
      expect(BALLISTICS.ricochet.restitution[m], m).toBeGreaterThanOrEqual(0);
      expect(IMPACT_DUST[m], m).toBeDefined();
      expect(SOUNDS[cues.impact(m)], m).toBeDefined();
    }
    expect(cues.impact('earth')).toBe('impact.earth');
    expect(SOUNDS['impact.earth'].layers.length).toBeGreaterThan(0);
    // Soil is a dull puff, not the pale concrete dust.
    expect(IMPACT_DUST.earth.tint).not.toBe(IMPACT_DUST.concrete.tint);
  });
});
