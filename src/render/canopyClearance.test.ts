// M33i QA: every crown vertex stays CANOPY.minBase over the ground directly under it, not only under its trunk.
import { expect, it } from 'vitest';
import { CANOPY } from '../config/render';
import { terrainHeightAt } from '../map/terrain';
import { WOODLAND } from '../map/woodland';
import { crownOf } from './canopyMeshes';

it('keeps every crown vertex at least CANOPY.minBase over the ground directly under it (not only under its trunk)', () => {
  const t = WOODLAND.terrain!;
  let worst = Infinity;
  let where = '';
  for (const b of WOODLAND.blocks.filter((x) => x.kind === 'tree')) {
    const c = crownOf(b, t);
    for (let i = 0; i < c.triangles.length; i += 3) {
      const x = c.triangles[i]!;
      const z = c.triangles[i + 2]!;
      const clearance = c.triangles[i + 1]! - (terrainHeightAt(t, x, z) ?? Number.NEGATIVE_INFINITY);
      if (clearance < worst) {
        worst = clearance;
        where = `tree at ${b.center.x.toFixed(2)}, ${b.center.z.toFixed(2)}; vertex at ${x.toFixed(2)}, ${z.toFixed(2)}`;
      }
    }
  }
  expect(worst, where).toBeGreaterThanOrEqual(CANOPY.minBase - 1e-6);
});
