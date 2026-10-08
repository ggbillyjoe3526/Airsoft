import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { SURFACES } from '../config/render';
import { WEATHERING } from '../config/weathering';
import { DEPOT } from '../map/depot';
import type { MapBlock } from '../map/mapTypes';
import { allAtlasRects, atlasHeight, atlasRects, buildMapDecals, decalQuads, floorStains } from './mapDecals';

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
    // (The stains lie on the floors: G6, below.)
    for (const q of quads.filter((q) => q.axis !== 1)) {
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

  it('places the same signs on a map turned a quarter turn (engine-level: no map-specific axis)', () => {
    const swap = <T extends { x: number; y: number; z: number }>(v: T): T => ({ ...v, x: v.z, z: v.x });
    const turned = {
      ...DEPOT,
      blocks: DEPOT.blocks.map((b) => ({ ...b, center: swap(b.center), size: swap(b.size) })),
      deadZones: DEPOT.deadZones.map((zone) => zone.map((p) => ({ ...p, position: swap(p.position) }))),
    } as typeof DEPOT;
    const count = (list: typeof quads, rect: readonly number[]) => list.filter((q) => q.rect.every((v, i) => v === rect[i])).length;
    const turnedQuads = decalQuads(turned);
    expect(count(turnedQuads, rects.roundel)).toBe(count(quads, rects.roundel));
    expect(count(turnedQuads, rects.roundel)).toBeGreaterThanOrEqual(1);
    // On the walls along the longer side: they face across the short axis (x, once turned).
    for (const q of turnedQuads.filter((q) => q.rect.every((v, i) => v === rects.roundel[i]))) expect(q.axis).toBe(0);
  });

  it('draws every picture from inside the atlas, no two cells overlapping (G6: the stains among them)', () => {
    const all = allAtlasRects(rects);
    const d = rects.dressing;
    const dressing = d.logos.length + d.banks.length + d.litter.length + 5;
    expect(all.length).toBe(rects.stencils.length + 3 + Object.values(rects.stains).flat().length + dressing);
    // G8: the atlas is 1024 × 1536 (the dressing's cells in its last third).
    expect(atlasHeight()).toBe(D.atlasSize * 1.5);
    for (const r of all) {
      expect(r[0]).toBeGreaterThanOrEqual(0);
      expect(r[1]).toBeGreaterThanOrEqual(0);
      expect(r[0] + r[2]).toBeLessThanOrEqual(D.atlasSize);
      expect(r[1] + r[3]).toBeLessThanOrEqual(atlasHeight());
    }
    for (let i = 0; i < all.length; i++) {
      for (let j = i + 1; j < all.length; j++) {
        const [a, b] = [all[i]!, all[j]!];
        const apart = a[0] + a[2] <= b[0] || b[0] + b[2] <= a[0] || a[1] + a[3] <= b[1] || b[1] + b[3] <= a[1];
        expect(apart, `cells ${a.join(',')} and ${b.join(',')}`).toBe(true);
      }
    }
    // Every kind of stain has a picture.
    for (const kind of Object.keys(WEATHERING.stains.weights) as (keyof typeof rects.stains)[]) expect(rects.stains[kind].length).toBeGreaterThan(0);
  });

  describe('stains on the floors (G6)', () => {
    const stains = floorStains(DEPOT);
    const S = WEATHERING.stains;
    const floors = DEPOT.blocks.filter((b) => b.kind === 'floor');

    it('lies a few on Depot’s ground, the same ones every time, each kind among them', () => {
      expect(stains.length).toBeGreaterThan(10);
      expect(floorStains(DEPOT)).toEqual(stains);
      expect(quads.filter((q) => q.axis === 1)).toEqual(stains);
      const kinds = new Set(stains.map((q) => (Object.keys(rects.stains) as (keyof typeof rects.stains)[]).find((k) => rects.stains[k].some((r) => r === q.rect || r.every((v, i) => v === q.rect[i])))));
      expect(kinds.size).toBeGreaterThanOrEqual(4);
    });

    it('lies flat on a floor’s top, inside its edge, and never under a block', () => {
      for (const q of stains) {
        expect(q.axis).toBe(1);
        expect(q.sign).toBe(1);
        const [cx, cy, cz] = q.centre;
        const lo = [cx - q.width / 2, cz - q.height / 2];
        const hi = [cx + q.width / 2, cz + q.height / 2];
        const floor = floors.find((b) => Math.abs(b.center.y + b.size.y / 2 + D.offset - cy) < 1e-9 && lo[0]! >= b.center.x - b.size.x / 2 && hi[0]! <= b.center.x + b.size.x / 2 && lo[1]! >= b.center.z - b.size.z / 2 && hi[1]! <= b.center.z + b.size.z / 2);
        expect(floor, `stain at ${q.centre.join(', ')}`).toBeDefined();
        const top = floor!.center.y + floor!.size.y / 2;
        const over = DEPOT.blocks.filter(
          (b) =>
            b !== floor &&
            b.center.x + b.size.x / 2 > lo[0]! &&
            b.center.x - b.size.x / 2 < hi[0]! &&
            b.center.z + b.size.z / 2 > lo[1]! &&
            b.center.z - b.size.z / 2 < hi[1]! &&
            b.center.y + b.size.y / 2 > top + 1e-3 &&
            b.center.y - b.size.y / 2 < top + S.clearance,
        );
        expect(over, `stain at ${q.centre.join(', ')}`).toEqual([]);
      }
    });

    it('never lays one stain over another', () => {
      for (let i = 0; i < stains.length; i++) {
        for (let j = i + 1; j < stains.length; j++) {
          const [a, b] = [stains[i]!, stains[j]!];
          const apart = Math.abs(a.centre[0] - b.centre[0]) >= (a.width + b.width) / 2 || Math.abs(a.centre[2] - b.centre[2]) >= (a.height + b.height) / 2;
          expect(apart).toBe(true);
        }
      }
    });

    it('leaves out a stain where a block stands on the floor', () => {
      // A crate laid over every stain's place: every one of them goes.
      const covers = stains.map((q, i) => ({ ...DEPOT.blocks.find((b) => b.kind === 'crate')!, center: { x: q.centre[0], y: 0.5, z: q.centre[2] }, size: { x: 0.4, y: 1, z: 0.4 }, id: `cover-${i}` }));
      const covered = floorStains({ ...DEPOT, blocks: [...DEPOT.blocks, ...covers] });
      for (const q of stains) expect(covered.some((c) => c.centre[0] === q.centre[0] && c.centre[2] === q.centre[2])).toBe(false);
    });
  });

  it('builds the signs and stains as one blended mesh, two triangles each, drawn over the faces they sit on', () => {
    const atlas = new THREE.Texture();
    const mesh = buildMapDecals(DEPOT, () => atlas)!;
    expect(mesh.name).toBe('map-decals');
    expect(mesh.geometry.getIndex()!.count / 3).toBe(2 * quads.length);
    const material = mesh.material as THREE.MeshLambertMaterial;
    expect(material.map).toBe(atlas);
    expect(material.alphaTest).toBeGreaterThan(0);
    // G6: blended, so a stain fades at its edge; it writes no depth (it lies on a face already drawn).
    expect(material.transparent).toBe(true);
    expect(material.depthWrite).toBe(false);
    expect(material.polygonOffset).toBe(true);
    // A floor stain's quad lies flat, facing up.
    const normals = mesh.geometry.getAttribute('normal');
    const up = Array.from({ length: normals.count }, (_, i) => normals.getY(i)).filter((y) => y === 1).length;
    expect(up).toBe(4 * quads.filter((q) => q.axis === 1).length);
    mesh.geometry.dispose();
    material.dispose();
  });
});
