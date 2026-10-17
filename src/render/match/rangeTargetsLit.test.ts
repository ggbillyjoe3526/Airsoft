import * as THREE from 'three';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { HITS } from '../../config/hits';
import { RANGE_VISUALS } from '../../config/range';
import { createRangeTargets } from '../../sim/rangeTargets';
import { RangeTargetsRenderer } from './rangeTargetsRenderer';

describe('lit targets and the START plate in the renderer (M93)', () => {
  afterEach(() => vi.unstubAllGlobals());

  function setup() {
    vi.stubGlobal('document', { createElement: () => ({ width: 0, height: 0, getContext: () => null }) });
    const targets = createRangeTargets();
    const r = new RangeTargetsRenderer(targets, HITS);
    const meshes = (): THREE.InstancedMesh[] => r.object.children.filter((o): o is THREE.InstancedMesh => o instanceof THREE.InstancedMesh);
    const twins = (): THREE.InstancedMesh[] => meshes().filter((m) => (m.material as THREE.MeshStandardMaterial).color?.getHex() === RANGE_VISUALS.litColour);
    /** The y scale of each instance of `m` that is actually drawn (the hidden ones are squashed to nothing). */
    const drawn = (m: THREE.InstancedMesh): number => {
      const e = m.instanceMatrix.array;
      let n = 0;
      for (let i = 0; i < m.count; i++) if (Math.hypot(e[i * 16]!, e[i * 16 + 1]!, e[i * 16 + 2]!) > 1e-6) n++;
      return n;
    };
    return { targets, r, twins, meshes, drawn };
  }

  it('draws a lit target through its orange twin and hides its own instance; unlit, the twin draws nothing', () => {
    const { targets, r, twins, meshes, drawn } = setup();
    expect(twins().length).toBeGreaterThan(0);
    expect(twins().every((m) => m.count === 0)).toBe(true);
    const plain = meshes().filter((m) => !twins().includes(m));
    const before = plain.reduce((n, m) => n + drawn(m), 0);
    const plate = targets.find((t) => t.kind === 'steel' && t.motion === 'still' && !t.start)!;
    plate.lit = 2;
    r.update(0.016);
    expect(twins().reduce((n, m) => n + m.count, 0)).toBeGreaterThanOrEqual(1);
    expect(plain.reduce((n, m) => n + drawn(m), 0)).toBeLessThan(before);
    const glowing = twins()[0]!.material as THREE.MeshStandardMaterial;
    expect(glowing.emissive.getHex()).toBe(RANGE_VISUALS.litColour);
    expect(glowing.emissiveIntensity).toBe(RANGE_VISUALS.litGlow);
    plate.lit = 0;
    r.update(0.016);
    expect(twins().every((m) => m.count === 0)).toBe(true);
    expect(plain.reduce((n, m) => n + drawn(m), 0)).toBe(before);
    r.dispose();
  });

  it('a lit figure lights both its torso and its head; a negative lit (resting) is not drawn lit', () => {
    const { targets, r, twins } = setup();
    const fig = targets.find((t) => t.kind === 'figure' && t.motion === 'still')!;
    fig.lit = 1;
    r.update(0.016);
    expect(twins().reduce((n, m) => n + m.count, 0)).toBe(2);
    fig.lit = -1;
    r.update(0.016);
    expect(twins().reduce((n, m) => n + m.count, 0)).toBe(0);
    r.dispose();
  });

  it('hides the START plate while the challenge is off and draws it when the plate is shown', () => {
    const { targets, r, meshes, drawn } = setup();
    const start = targets.find((t) => t.start)!;
    expect(start.hidden).toBe(true);
    const total = () => meshes().reduce((n, m) => n + drawn(m), 0);
    const hiddenTotal = total();
    start.hidden = false;
    r.update(0.016);
    expect(total()).toBeGreaterThan(hiddenTotal);
    start.hidden = true;
    r.update(0.016);
    expect(total()).toBe(hiddenTotal);
    // A lit but hidden target is not drawn lit.
    start.lit = 2;
    r.update(0.016);
    expect(total()).toBe(hiddenTotal);
    r.dispose();
  });
});
