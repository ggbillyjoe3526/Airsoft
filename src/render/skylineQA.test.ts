import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { DRESSING } from '../config/dressing';
import { LIGHTING_PRESETS, QUALITY } from '../config/render';
import { DEPOT } from '../map/depot';
import type { SkylinePiece } from '../map/mapTypes';
import { addAtmosphere } from './atmosphere';
import { skylineClear, skylineGeometries, smokingChimneys } from './skyline';

/** QA for G8's skyline: pure geometry, the tree ring it joins, and what Low and a map without one draw. */

const SKY = DEPOT.dressing!.skyline!;
const CENTRE = { x: 0, z: 0 };
const FIELD = new THREE.Box3(new THREE.Vector3(-25.5, -0.5, -16.5), new THREE.Vector3(25.5, 4, 16.5));
const SUN = new THREE.Vector3(0.4, 0.8, 0.3).normalize();
const tris = (m: THREE.Mesh): number => m.geometry.getAttribute('position').count / 3;
const free = (gs: THREE.BufferGeometry[]): void => gs.forEach((g) => g.dispose());

function ring(trees: 0 | 1 | 2, skyline: readonly SkylinePiece[] | undefined, scene = new THREE.Scene()): { scene: THREE.Scene; trees: THREE.Mesh | undefined; dispose: () => void; set: (t: 0 | 1 | 2) => void } {
  const a = addAtmosphere(scene, new THREE.Vector3(), SUN, { trees, clouds: false }, FIELD, LIGHTING_PRESETS.day, skyline);
  return {
    scene,
    get trees() {
      return scene.getObjectByName('trees') as THREE.Mesh | undefined;
    },
    dispose: () => a.dispose(),
    set: (t) => a.setQuality({ trees: t, clouds: false }),
  };
}

describe('G8 QA: skyline geometry', () => {
  it('every part is non-indexed with position, normal and colour and no uv (it must merge with the ring), all finite', () => {
    const gs = skylineGeometries(SKY, CENTRE);
    expect(gs.length).toBeGreaterThan(40);
    for (const g of gs) {
      expect(g.index).toBeNull();
      expect(g.getAttribute('uv')).toBeUndefined();
      for (const a of ['position', 'normal', 'color']) expect(g.getAttribute(a), a).toBeDefined();
      expect(Array.from(g.getAttribute('position').array).every(Number.isFinite)).toBe(true);
      expect(g.getAttribute('position').count % 3).toBe(0);
    }
    free(gs);
  });

  it('is deterministic and makes nothing for an empty skyline', () => {
    const a = skylineGeometries(SKY, CENTRE);
    const b = skylineGeometries(SKY, CENTRE);
    expect(a.map((g) => Array.from(g.getAttribute('position').array))).toEqual(b.map((g) => Array.from(g.getAttribute('position').array)));
    expect(skylineGeometries([], CENTRE)).toEqual([]);
    free(a);
    free(b);
  });

  it('every piece stands on the ground and stays under its stated height', () => {
    for (const piece of SKY) {
      if (piece.kind === 'powerLine') continue;
      const gs = skylineGeometries([piece], CENTRE);
      const box = new THREE.Box3();
      for (const g of gs) box.union(new THREE.Box3().setFromBufferAttribute(g.getAttribute('position') as THREE.BufferAttribute));
      expect(box.min.y, piece.kind).toBeGreaterThanOrEqual(-0.1);
      // Roofs and bands sit a little over the walls; a chimney or a crane never over its height.
      expect(box.max.y, piece.kind).toBeLessThanOrEqual(piece.height + 0.5);
      free(gs);
    }
  });

  it('smokingChimneys lists only chimneys marked to smoke, at their tops', () => {
    const list = smokingChimneys([...SKY, { kind: 'chimney', x: 1, z: 2, width: 2, depth: 2, height: 10 }]);
    expect(list).toHaveLength(SKY.filter((p) => p.kind === 'chimney' && p.smoke).length);
    for (const s of list) {
      const piece = SKY.find((p) => p.kind === 'chimney' && p.x === s.x && p.z === s.z)!;
      expect(s.y).toBe((piece as { height: number }).height);
      expect(s.radius).toBeLessThan((piece as { width: number }).width / 2);
    }
  });

  it('skylineClear keeps trees off every piece, turned or not, and leaves the open ring alone', () => {
    const T = DRESSING.skyline.treeClear;
    for (const p of SKY) if (p.kind !== 'powerLine') expect(skylineClear(SKY, p.x, p.z)).toBe(false);
    for (const p of SKY) if (p.kind === 'powerLine') for (const q of p.points) expect(skylineClear(SKY, q.x, q.z)).toBe(false);
    expect(skylineClear(SKY, 0, 0)).toBe(true);
    const turned: SkylinePiece = { kind: 'shed', x: 0, z: 0, width: 20, depth: 4, height: 6, turned: true };
    expect(skylineClear([turned], 0, 10 + T + 0.1)).toBe(true);
    expect(skylineClear([turned], 0, 10 + T - 0.1)).toBe(false);
    expect(skylineClear([turned], 2 + T - 0.1, 0)).toBe(false);
    expect(skylineClear([], 5, 5)).toBe(true);
  });
});

describe('G8 QA: the skyline in the tree ring', () => {
  it('Low (trees simple or none) draws the same ring with and without a skyline, and no skyline mesh of its own', () => {
    for (const t of [0, 1] as const) {
      const a = ring(t, SKY);
      const b = ring(t, undefined);
      expect(a.trees ? tris(a.trees) : 0, `trees ${t}`).toBe(b.trees ? tris(b.trees) : 0);
      expect(a.scene.children.map((o) => o.name).sort()).toEqual(b.scene.children.map((o) => o.name).sort());
      a.dispose();
      b.dispose();
    }
  });

  it('detailed trees with a skyline add triangles and stay one tree mesh; an empty skyline changes nothing', () => {
    const a = ring(2, SKY);
    const b = ring(2, undefined);
    const c = ring(2, []);
    expect(a.scene.children.filter((o) => o.name === 'trees')).toHaveLength(1);
    expect(tris(a.trees!)).toBeGreaterThan(tris(b.trees!));
    expect(tris(c.trees!)).toBe(tris(b.trees!));
    for (const r of [a, b, c]) r.dispose();
  });

  it('quality changes rebuild the ring without leaking: the old geometry is freed and one ring remains', () => {
    const r = ring(2, SKY);
    const first = r.trees!;
    let freed = 0;
    first.geometry.addEventListener('dispose', () => freed++);
    (first.material as THREE.Material).addEventListener('dispose', () => freed++);
    r.set(1);
    expect(freed).toBeGreaterThanOrEqual(1);
    expect(r.scene.children.filter((o) => o.name === 'trees')).toHaveLength(1);
    const simple = tris(r.trees!);
    r.set(2);
    expect(r.scene.children.filter((o) => o.name === 'trees')).toHaveLength(1);
    expect(tris(r.trees!)).not.toBe(simple);
    r.set(0);
    expect(r.trees).toBeUndefined();
    r.set(2);
    const again = r.trees!;
    r.dispose();
    expect(r.scene.children.filter((o) => o.name === 'trees')).toHaveLength(0);
    expect(again.geometry).toBeDefined();
  });

  it('two builds give the same ring (determinism)', () => {
    const a = ring(2, SKY);
    const b = ring(2, SKY);
    expect(Array.from(a.trees!.geometry.getAttribute('position').array)).toEqual(Array.from(b.trees!.geometry.getAttribute('position').array));
    a.dispose();
    b.dispose();
  });

  it('QUALITY.low has the simple ring, so Depot adds no skyline on Low', () => {
    expect(QUALITY.low.trees).toBe(1);
  });
});
