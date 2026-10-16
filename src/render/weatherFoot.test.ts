import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { SURFACES, type SurfaceTextureId } from '../config/render';
import { DEPOT } from '../map/depot';
import type { BlockKind, MapBlock, MapData } from '../map/mapTypes';
import { OPEN_FIELD } from '../sim/testSupport';
import { vec3 } from '../sim/vec';
import { buildMapMeshes, disposeMapMeshes, type MapLook, texturesFor } from './mapMeshes';
import type { SurfaceTextures } from './proceduralTextures';

/**
 * Weathering's creep (G6) measures up a wall from its own foot (BP6; KNOWN_ISSUES: it measured from world y = 0, so a
 * wall on an upper floor or raised ground got none): each weathered map mesh carries `wearFoot` per vertex, the foot of
 * the block it belongs to where the block has a grime band, else 0 as before.
 */

const block = (kind: BlockKind, x0: number, x1: number, y0: number, y1: number, z0: number, z1: number): MapBlock => ({
  kind,
  center: vec3((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2),
  size: vec3(x1 - x0, y1 - y0, z1 - z0),
});

const stubTextures = (ids: readonly SurfaceTextureId[]): SurfaceTextures =>
  Object.fromEntries(ids.map((id) => [id, { texture: Object.assign(new THREE.Texture(), { name: id }), worldSize: SURFACES.worldSize[id] }])) as unknown as SurfaceTextures;

const LOOK: MapLook = { relief: false, normalMaps: false, detail: false, steelSheen: false, weathering: true };

const meshOf = (group: THREE.Group, name: string): THREE.Mesh => {
  const mesh = group.getObjectByName(name);
  expect(mesh, name).toBeInstanceOf(THREE.Mesh);
  return mesh as THREE.Mesh;
};

describe('weathering creeps up from a wall’s own foot (BP6)', () => {
  // A wall standing on a slab 3 m up, beside one on the ground.
  const map: MapData = { ...OPEN_FIELD, blocks: [...OPEN_FIELD.blocks, block('floor', 4, 10, 2.8, 3, -3, 3), block('wall', 5, 9, 3, 5.5, 0, 0.2), block('wall', -9, -5, 0, 2.5, 0, 0.2)] };

  it('gives every vertex of a weathered mesh its block’s foot: the upper wall 3 m, the ground wall 0', () => {
    const group = buildMapMeshes(map, stubTextures(texturesFor(map)), LOOK, null);
    const walls = meshOf(group, 'map-blockWall').geometry;
    const pos = walls.getAttribute('position');
    const foot = walls.getAttribute('wearFoot');
    expect(foot.count).toBe(pos.count);
    for (let i = 0; i < pos.count; i++) expect(foot.getX(i)).toBe(pos.getX(i) > 0 ? 3 : 0);
    disposeMapMeshes(group);
  });

  it('adds nothing without weathering', () => {
    const plain = buildMapMeshes(map, stubTextures(texturesFor(map)), { ...LOOK, weathering: false }, null);
    plain.traverse((o) => {
      if (o instanceof THREE.Mesh) expect(o.geometry.getAttribute('wearFoot'), o.name).toBeUndefined();
    });
    disposeMapMeshes(plain);
  });

  it('keeps Depot’s creep where it was: every block there stands on the ground at 0', () => {
    const group = buildMapMeshes(DEPOT, stubTextures(texturesFor(DEPOT)), LOOK, null);
    let weathered = 0;
    group.traverse((o) => {
      if (!(o instanceof THREE.Mesh)) return;
      const foot = o.geometry.getAttribute('wearFoot');
      if (!foot) return;
      weathered++;
      expect(foot.count, o.name).toBe(o.geometry.getAttribute('position').count);
      // Stacked pieces carry their own foot (as their grime band does); the ground pieces 0.
      for (let i = 0; i < foot.count; i++) expect(foot.getX(i)).toBeGreaterThanOrEqual(-0.01);
    });
    expect(weathered).toBeGreaterThan(3);
    disposeMapMeshes(group);
  });
});
