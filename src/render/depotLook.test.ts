import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { LIGHTING_PRESETS, SURFACES } from '../config/render';
import { DEPOT } from '../map/depot';
import { buildGroundGrid } from '../map/groundSurfaces';
import { buildLightFixtures } from './lightFixtures';
import { buildMapMeshes, disposeMapMeshes, texturesFor } from './mapMeshes';
import { buildNightSky } from './nightSky';
import { CORE_SURFACES, type SurfaceTextures } from './proceduralTextures';

/**
 * Depot builds exactly as before the woodland look (M33i owner rule): its map meshes, vertex for vertex, as captured from
 * the code before M33i (main 0438405) with the same look and stand-in textures. A change here is a change to Depot's
 * look: deliberate ones re-capture the pin and say so in DECISIONS. Re-captured for G6: the concrete's casting and
 * non-casting pieces are one mesh (the ground drawn after the slabs, out of the shadow map's range), the gabions' tops
 * are rubble (the gabion texture, no sand) and the precast walls' texture repeats every 2 m (their UVs).
 */

/** FNV-1a over a float array rounded to 1e-4 (stable across platforms for these sizes). */
function hash(a: ArrayLike<number>): number {
  let h = 2166136261;
  for (let i = 0; i < a.length; i++) h = Math.imul(h ^ Math.round(a[i]! * 1e4), 16777619) >>> 0;
  return h;
}

/** [name, casts shadow, vertices, indices, draw range (null: all), texture, then hashes of position, colour, uv, normal]. */
type Row = [string, boolean, number, number, number | null, string, number, number, number, number];

const PIN: Record<'plain' | 'detail', Row[]> = {
  plain: [
    ['map-steelPlate', true, 228, 336, null, 'steelPlate', 1687633717, 96722977, 2738363157, 2591861685],
    ['map-concrete', true, 648, 972, 972, 'concrete', 2128768533, 2435460381, 1611042853, 3175850853],
    ['map-blockWall', true, 768, 1440, null, 'blockWall', 1607307813, 16672525, 2280480309, 879862725],
    ['map-barrier', true, 7048, 11100, null, 'barrier', 1784704581, 707736317, 4144938713, 3048512101],
    ['map-crate', true, 1816, 2748, null, 'crate', 1511588965, 3625141501, 1560544645, 3011479333],
    ['map-corrugated', true, 5304, 8676, null, 'corrugated', 2633553733, 1344298709, 952225461, 3811663397],
    ['map-sandbag', true, 288, 432, null, 'sandbag', 1096613445, 680019765, 4012324245, 2927012421],
    ['map-gabion', true, 336, 576, null, 'gabion', 3917581061, 355657397, 4189000705, 526193029],
  ],
  detail: [
    ['map-steelPlate', true, 774, 1368, 1032, 'steelPlate', 838859125, 3890357677, 1140776278, 1856083041],
    ['map-concrete', true, 5582, 20460, 19416, 'concrete', 3488080045, 478623096, 526800199, 1656451013],
    ['map-blockWall', true, 6230, 18114, 16674, 'blockWall', 2209911561, 428390416, 2985850169, 873620969],
    ['map-barrier', true, 21140, 33372, 20760, 'barrier', 3191135753, 2695292710, 3093672965, 2646408605],
    ['map-crate', true, 6584, 9888, 5268, 'crate', 1394211205, 3958199917, 524222949, 3907965557],
    ['map-corrugated', true, 24024, 46782, 37674, 'corrugated', 3201333815, 2735355188, 1833331958, 1580581405],
    ['map-sandbag', true, 1176, 1800, 1368, 'sandbag', 718864357, 2216120893, 1353423407, 4156775293],
    ['map-gabion', true, 1006, 1728, 1152, 'gabion', 2623655341, 4174580944, 145423981, 3485225441],
  ],
};

/** The core set, stubbed (no canvas in the tests), each texture named by its surface. */
const textures = (): SurfaceTextures =>
  Object.fromEntries(CORE_SURFACES.map((id) => [id, { texture: Object.assign(new THREE.Texture(), { name: id }), worldSize: SURFACES.worldSize[id] }])) as unknown as SurfaceTextures;

describe('Depot after the woodland look (M33i: a map using none of it builds exactly as today)', () => {
  for (const detail of [false, true]) {
    it(`builds the same meshes, vertex for vertex, ${detail ? 'with' : 'without'} map detail`, () => {
      const group = buildMapMeshes(DEPOT, textures(), { relief: false, normalMaps: false, detail, steelSheen: detail, foliageShadows: true }, null);
      const rows = group.children.map((o): Row => {
        const m = o as THREE.Mesh;
        const geo = m.geometry;
        const range = geo.drawRange.count;
        return [
          m.name,
          m.castShadow,
          geo.getAttribute('position').count,
          geo.index?.count ?? 0,
          Number.isFinite(range) ? range : null,
          (m.material as THREE.MeshLambertMaterial).map?.name ?? '',
          hash(geo.getAttribute('position').array),
          hash(geo.getAttribute('color').array),
          hash(geo.getAttribute('uv')?.array ?? []),
          hash(geo.getAttribute('normal')?.array ?? []),
        ];
      });
      expect(rows).toEqual(PIN[detail ? 'detail' : 'plain']);
      disposeMapMeshes(group);
    });
  }

  it('draws only the core textures, no ground grid, no fixtures, and by day no night sky', () => {
    expect(new Set(texturesFor(DEPOT))).toEqual(new Set(CORE_SURFACES));
    expect(DEPOT.ground).toBeUndefined();
    expect(buildGroundGrid(DEPOT)).toBeNull();
    expect(buildLightFixtures(DEPOT, () => 0, true)).toBeNull();
    expect(buildNightSky(LIGHTING_PRESETS.day, new THREE.Vector3(0, 1, 0))).toBeNull();
  });
});
