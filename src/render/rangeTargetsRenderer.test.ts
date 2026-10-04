import * as THREE from 'three';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { RANGE, RANGE_VISUALS } from '../config/range';
import { lastShotText } from '../ui/rangeReadout';
import { createRangeTargets } from '../sim/rangeTargets';
import { HITS } from '../config/hits';
import { figureRotation, figureTilt, plateRotation, plateScuffs, plateSwing, RangeTargetsRenderer } from './rangeTargetsRenderer';

describe('practice range presentation (M21)', () => {
  it('drops a figure back quickly, keeps it down, and stands it up at the end of its time down', () => {
    expect(figureTilt(0)).toBe(0);
    expect(figureTilt(RANGE.figureDownTime)).toBe(0); // just hit
    expect(figureTilt(RANGE.figureDownTime - RANGE_VISUALS.fallTime / 2)).toBeCloseTo(RANGE_VISUALS.downAngle / 2, 6);
    expect(figureTilt(RANGE.figureDownTime / 2)).toBe(RANGE_VISUALS.downAngle);
    expect(figureTilt(RANGE_VISUALS.riseTime / 2)).toBeCloseTo(RANGE_VISUALS.downAngle / 2, 6);
  });

  it('swings a plate back when hit, and lets it settle', () => {
    expect(plateSwing(0)).toBe(0); // hanging straight when the BB lands
    const peak = Math.PI / 2 / RANGE_VISUALS.swingRate;
    expect(plateSwing(peak)).toBeGreaterThan(0.5 * RANGE_VISUALS.swingAngle); // then swings well out
    expect(plateSwing(1)).toBeLessThan(0.01 * RANGE_VISUALS.swingAngle);
    for (let t = 0; t < 1; t += 0.01) expect(plateSwing(t)).toBeGreaterThanOrEqual(0);
  });

  it('swings plates and drops figures away from the firing line (downrange is -z)', () => {
    const turned = (rotationX: number, y: number): THREE.Vector3 => {
      const pivot = new THREE.Group();
      const part = new THREE.Object3D();
      part.position.y = y;
      pivot.add(part);
      pivot.rotation.x = rotationX;
      pivot.updateMatrixWorld(true);
      return part.getWorldPosition(new THREE.Vector3());
    };
    expect(turned(plateRotation(Math.PI / 2 / RANGE_VISUALS.swingRate), -0.3).z).toBeLessThan(-0.05); // a plate hangs below its hanger
    expect(turned(figureRotation(RANGE.figureDownTime / 2), 1.5).z).toBeLessThan(-1); // a figure stands above its hinge
  });

  it('reads out where the last BB landed and what it hit', () => {
    expect(lastShotText(null)).toContain('Practice range');
    expect(lastShotText({ distance: 30.6, target: { label: 'Steel', distance: 30 } })).toBe('Last BB: 31 m · hit Steel 30 m');
    expect(lastShotText({ distance: 44.2, target: null })).toBe('Last BB: 44 m · miss');
    expect(lastShotText({ distance: 0, target: null, lost: true })).toContain('flew out of the range');
  });
});

describe('range targets with map detail (audit section 5)', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('scatters the same BB scuffs for a seed, inside the plate, bunched round its middle', () => {
    const D = RANGE_VISUALS.detail;
    const a = plateScuffs(7);
    expect(plateScuffs(7)).toEqual(a);
    expect(plateScuffs(8)).not.toEqual(a);
    expect(a.length).toBeGreaterThanOrEqual(D.scuffs[0]);
    expect(a.length).toBeLessThanOrEqual(D.scuffs[1]);
    const half = D.textureSize / 2;
    let near = 0;
    for (const s of a) {
      expect(Math.hypot(s.x - half, s.y - half)).toBeLessThan(half);
      if (Math.hypot(s.x - half, s.y - half) < half / 2) near++;
    }
    expect(near).toBeGreaterThan(a.length / 2);
  });

  it('moves only the instances of the target that was hit, and only while it moves', () => {
    vi.stubGlobal('document', { createElement: () => ({ width: 0, height: 0, getContext: () => null }) });
    const targets = createRangeTargets();
    const r = new RangeTargetsRenderer(targets, HITS);
    const movers = (): THREE.InstancedMesh[] => r.object.children.filter((o): o is THREE.InstancedMesh => o instanceof THREE.InstancedMesh);
    const matrices = (): number[][] => movers().map((m) => Array.from(m.instanceMatrix.array));
    const versions = (): number[] => movers().map((m) => m.instanceMatrix.version);
    const still = matrices();
    const v0 = versions();
    r.update(0.1);
    expect(versions()).toEqual(v0); // nothing moved: nothing uploaded
    const steel = targets.find((t) => t.kind === 'steel')!;
    r.afterTick([{ type: 'targetHit', targetId: steel.id, kind: 'steel', shooterId: 0, position: steel.position, ricochet: false }]);
    r.update(Math.PI / 2 / RANGE_VISUALS.swingRate);
    const swung = matrices();
    const changed = swung.map((m, k) => m.some((x, j) => x !== still[k]![j]));
    expect(changed.filter(Boolean).length).toBe(2); // that plate and its chain
    const figure = targets.find((t) => t.kind === 'figure')!;
    figure.down = RANGE.figureDownTime / 2;
    r.update(0);
    const fallen = matrices();
    expect(fallen.map((m, k) => m.some((x, j) => x !== swung[k]![j])).filter(Boolean).length).toBe(2); // its torso and head
    r.dispose();
  });

  it('shows its chains, arms, bands, brackets and shelf and paints its plates only with map detail', () => {
    vi.stubGlobal('document', { createElement: () => ({ width: 0, height: 0, getContext: () => null }) });
    const r = new RangeTargetsRenderer(createRangeTargets(), HITS);
    const visible = (): { meshes: number; mapped: number } => {
      let meshes = 0;
      let mapped = 0;
      r.object.traverseVisible((o) => {
        if (!(o instanceof THREE.Mesh)) return;
        meshes++;
        if ((o.material as THREE.MeshStandardMaterial).map) mapped++;
      });
      return { meshes, mapped };
    };
    const plain = visible();
    const plainMaps: THREE.Texture[] = [];
    r.object.traverse((o) => {
      const m = (o as THREE.Mesh).material as THREE.MeshStandardMaterial | undefined;
      for (const t of [m?.map, m?.roughnessMap]) if (t) plainMaps.push(t);
    });
    r.setDetail(true);
    const detailed = visible();
    expect(detailed.meshes).toBeGreaterThan(plain.meshes);
    // Few draw calls: one chain mesh per plate (it swings with the plate) and one mesh for every static fitting.
    const plates = createRangeTargets().filter((t) => t.kind === 'steel').length;
    expect(detailed.meshes - plain.meshes).toBeLessThanOrEqual(plates + 1);
    expect(detailed.mapped).toBeGreaterThan(plain.mapped);
    // Detail off frees the paint's GPU copies (the canvases stay for the next time it is on).
    const maps = (): Set<THREE.Texture> => {
      const found = new Set<THREE.Texture>();
      r.object.traverse((o) => {
        const m = (o as THREE.Mesh).material as THREE.MeshStandardMaterial | undefined;
        for (const t of [m?.map, m?.roughnessMap]) if (t) found.add(t);
      });
      return found;
    };
    const paint = maps();
    for (const t of plainMaps) paint.delete(t);
    expect(paint.size).toBeGreaterThan(0);
    const freed = vi.fn();
    for (const t of paint) t.addEventListener('dispose', freed);
    r.setDetail(false);
    expect(freed).toHaveBeenCalledTimes(paint.size);
    expect(visible()).toEqual(plain);
    r.dispose();
  });
});
