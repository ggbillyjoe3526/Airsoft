import * as THREE from 'three';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { IMPACT_PUFFS } from '../config/render';
import { ImpactPuffs } from './impactPuffs';

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
