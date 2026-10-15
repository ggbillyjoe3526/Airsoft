import { describe, expect, it } from 'vitest';
import { CITY_PROPS } from '../config/renderSurfaces';
import type { MapBlock } from '../map/mapTypes';
import { vec3 } from '../sim/vec';
import { impactMaterialAt } from './soundMaterials';

/** Dev 6 item 44, acceptance 5: a BB landing in a planter's shrubs rustles; the box below them is still wood. */
const planter: MapBlock = { kind: 'planter', center: vec3(0, 0.5, 0), size: vec3(2, 1, 1) };
const top = 1;

describe('impactMaterialAt, planters', () => {
  it('is leaves in the shrubs on top of a planter', () => {
    expect(impactMaterialAt([planter], vec3(0, top - CITY_PROPS.planter.foliage / 2, 0))).toBe('leaves');
    expect(impactMaterialAt([planter], vec3(0.5, top, 0))).toBe('leaves');
  });

  it('is wood in the box below the shrubs', () => {
    expect(impactMaterialAt([planter], vec3(0, top - CITY_PROPS.planter.foliage - 0.05, 0))).toBe('wood');
    expect(impactMaterialAt([planter], vec3(0, 0.2, 0))).toBe('wood');
  });

  it('is not leaves on another prop of the same height', () => {
    const crate: MapBlock = { ...planter, kind: 'crate' };
    expect(impactMaterialAt([crate], vec3(0, top - 0.02, 0))).not.toBe('leaves');
  });
});
