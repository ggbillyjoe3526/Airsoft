import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { CANOPY } from '../config/render';
import { DEPOT } from '../map/depot';
import { WOODLAND } from '../map/woodland';
import { buildCanopyMesh, crownOf } from './canopyMeshes';

const MOON = new THREE.Vector3(0.3, 0.6, -0.7).normalize();

describe('the canopy (M33i: a crown over every tree block, standing against the sky)', () => {
  const trees = WOODLAND.blocks.filter((b) => b.kind === 'tree');

  it('hangs every crown at least CANOPY.minBase over the ground, so it never hides a standing figure', () => {
    for (const t of trees) {
      const c = crownOf(t, WOODLAND.terrain);
      expect(c.base - c.ground).toBeGreaterThanOrEqual(CANOPY.minBase - 1e-6);
      expect(c.triangles.length % 9).toBe(0);
      expect(c.triangles.length).toBeGreaterThan(0);
    }
  });

  it('builds one mesh for all the crowns, casting shadows only when asked', () => {
    const on = buildCanopyMesh(WOODLAND.blocks, WOODLAND.terrain, MOON, true)!;
    const off = buildCanopyMesh(WOODLAND.blocks, WOODLAND.terrain, MOON, false)!;
    expect(on.name).toBe('map-canopy');
    expect(on.castShadow).toBe(true);
    expect(off.castShadow).toBe(false);
    expect(on.receiveShadow).toBe(false);
    const tris = on.geometry.getAttribute('position').count / 3;
    // Cheap: under 30 triangles a tree on average (Low's budget is 150k for the whole frame).
    expect(tris / trees.length).toBeLessThan(30);
    for (const m of [on, off]) {
      m.geometry.dispose();
      (m.material as THREE.Material).dispose();
    }
  });

  it('builds nothing for a map without trees (Depot)', () => {
    expect(buildCanopyMesh(DEPOT.blocks, DEPOT.terrain, MOON, true)).toBeNull();
  });
});
