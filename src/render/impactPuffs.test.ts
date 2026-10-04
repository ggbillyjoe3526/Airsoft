import * as THREE from 'three';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { IMPACT_PUFFS } from '../config/render';
import { ImpactPuffs } from './impactPuffs';

const FRAME = 1 / 60;

/** The scale the pool drew instance 0 with on its last update. */
function drawnScale(pool: ImpactPuffs): number {
  const m = new THREE.Matrix4();
  pool.object.getMatrixAt(0, m);
  return new THREE.Vector3().setFromMatrixScale(m).x;
}

describe('impact puffs (M28)', () => {
  beforeAll(() => {
    vi.stubGlobal('document', { createElement: () => ({ width: 0, height: 0, getContext: () => null }) });
  });
  afterAll(() => vi.unstubAllGlobals());

  function fresh(): { pool: ImpactPuffs; camera: THREE.Camera } {
    const pool = new ImpactPuffs(IMPACT_PUFFS);
    const camera = new THREE.PerspectiveCamera();
    camera.position.set(0, 0, 0);
    // A puff 1 m from the eye: well inside the distance where the minimum on-screen size would take over.
    pool.spawn({ x: 0, y: 0, z: -1 });
    return { pool, camera };
  }

  it('is at least half its full size on the first frame', () => {
    const { pool, camera } = fresh();
    pool.update(FRAME, camera);
    const first = drawnScale(pool);
    const grown = new ImpactPuffs(IMPACT_PUFFS);
    grown.spawn({ x: 0, y: 0, z: -1 });
    grown.update(IMPACT_PUFFS.growTime, camera);
    const full = drawnScale(grown);
    expect(full).toBeCloseTo(1, 5);
    expect(first).toBeGreaterThanOrEqual(0.5 * full);
    expect(first).toBeLessThan(full);
    pool.dispose();
    grown.dispose();
  });

  it('still fades to nothing by the end of its lifetime', () => {
    const { pool, camera } = fresh();
    pool.update(IMPACT_PUFFS.lifetime, camera);
    expect(drawnScale(pool)).toBe(0);
    pool.update(FRAME, camera);
    expect(pool.object.count).toBe(0);
    pool.dispose();
  });
});
