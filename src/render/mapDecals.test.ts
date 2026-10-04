import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { SURFACES } from '../config/render';
import { DEPOT } from '../map/depot';
import type { MapBlock } from '../map/mapTypes';
import { atlasRects, buildMapDecals, decalQuads } from './mapDecals';

const D = SURFACES.decals;

function inside(b: MapBlock, p: readonly number[]): boolean {
  return Math.abs(p[0]! - b.center.x) < b.size.x / 2 && Math.abs(p[1]! - b.center.y) < b.size.y / 2 && Math.abs(p[2]! - b.center.z) < b.size.z / 2;
}

describe('map signs (decals, map asset group)', () => {
  const quads = decalQuads(DEPOT);
  const rects = atlasRects();

  it('stencils the containers, chevrons the barriers, a roundel on the long perimeter walls and SAFE ZONE by each dead zone', () => {
    const same = (a: readonly number[], b: readonly number[]) => a.every((v, i) => v === b[i]);
    const count = (rect: readonly number[]) => quads.filter((q) => same(q.rect, rect)).length;
    expect(quads.filter((q) => rects.stencils.some((r) => same(q.rect, r))).length).toBeGreaterThan(4);
    expect(count(rects.chevrons)).toBeGreaterThan(2);
    expect(count(rects.roundel)).toBeGreaterThanOrEqual(1);
    expect(count(rects.safeZone)).toBe(DEPOT.deadZones.length);
  });

  it('puts every sign flat on a face of a block, with nothing standing in front of it', () => {
    const solid = DEPOT.blocks.filter((b) => b.kind !== 'floor' && b.kind !== 'ramp');
    for (const q of quads) {
      const front = [...q.centre];
      front[q.axis] = front[q.axis]! + q.sign * 0.05;
      const behind = [...q.centre];
      behind[q.axis] = behind[q.axis]! - q.sign * 0.05;
      expect(solid.some((b) => inside(b, front)), `sign at ${q.centre.join(', ')}`).toBe(false);
      expect(solid.some((b) => inside(b, behind)), `sign at ${q.centre.join(', ')}`).toBe(true);
      expect(q.width).toBeGreaterThan(0);
      expect(q.height).toBeGreaterThan(0);
    }
  });

  it('draws every picture from inside the atlas', () => {
    for (const r of [...rects.stencils, rects.roundel, rects.safeZone, rects.chevrons]) {
      expect(r[0]).toBeGreaterThanOrEqual(0);
      expect(r[1]).toBeGreaterThanOrEqual(0);
      expect(r[0] + r[2]).toBeLessThanOrEqual(D.atlasSize);
      expect(r[1] + r[3]).toBeLessThanOrEqual(D.atlasSize);
    }
  });

  it('builds the signs as one cut-out mesh, two triangles each, drawn over the faces they sit on', () => {
    const atlas = new THREE.Texture();
    const mesh = buildMapDecals(DEPOT, () => atlas)!;
    expect(mesh.name).toBe('map-decals');
    expect(mesh.geometry.getIndex()!.count / 3).toBe(2 * quads.length);
    const material = mesh.material as THREE.MeshLambertMaterial;
    expect(material.map).toBe(atlas);
    expect(material.alphaTest).toBeGreaterThan(0);
    expect(material.transparent).toBe(false);
    expect(material.polygonOffset).toBe(true);
    mesh.geometry.dispose();
    material.dispose();
  });
});
