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

describe('ImpactPuffs uploads (REN-22)', () => {
  // The soft dot's canvas is stood in for: nothing is drawn here.
  beforeAll(() => vi.stubGlobal('document', { createElement: () => ({ width: 0, height: 0, getContext: () => null }) }));
  afterAll(() => vi.unstubAllGlobals());

  it('uploads nothing while no puff is alive, and clears the last one once', () => {
    const puffs = new ImpactPuffs(IMPACT_PUFFS);
    const camera = new THREE.PerspectiveCamera();
    const versions = () => [puffs.object.instanceMatrix.version, puffs.object.instanceColor!.version];
    puffs.update(1 / 60, camera);
    const idle = versions();
    puffs.update(1 / 60, camera);
    expect(versions()).toEqual(idle);

    puffs.spawn({ x: 0, y: 1, z: -3 });
    puffs.update(1 / 60, camera);
    expect(puffs.object.count).toBe(1);
    expect(puffs.object.instanceMatrix.version).toBeGreaterThan(idle[0]!);
    // Past its lifetime: one frame uploads the empty pool, then nothing more.
    puffs.update(IMPACT_PUFFS.lifetime, camera);
    puffs.update(1 / 60, camera);
    expect(puffs.object.count).toBe(0);
    const gone = versions();
    puffs.update(1 / 60, camera);
    expect(versions()).toEqual(gone);
    puffs.dispose();
  });
});
