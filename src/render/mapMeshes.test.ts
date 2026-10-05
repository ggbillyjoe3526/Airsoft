import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import { TEAM_COLOUR_SETS } from '../config/teams';
import { DEPOT } from '../map/depot';
import { WOODLAND } from '../map/woodland';
import { buildFoliageMesh } from './foliageMeshes';
import { terrainHeightAt, terrainMesh, terrainRange } from '../map/terrain';
import { SLOPE_YARD, SLOPE_YARD_TERRAIN } from '../map/testSupport';
import { FOLIAGE_LOOK, TERRAIN_LOOK } from '../config/render';
import { vec3 } from '../sim/vec';
import { QUALITY, SURFACES, type SurfaceTextureId } from '../config/render';
import {
  blockPieces,
  blockShade,
  blockTint,
  buildMapMeshes,
  castsShadow,
  disposeMapMeshes,
  groundNoise,
  type MapLook,
  mapLookOf,
  mapNeedsRebuild,
  restyleMap,
  setMapRelief,
  setMapTextures,
  texturesFor,
} from './mapMeshes';
import type { SurfaceTextures } from './proceduralTextures';

/** Every team colour of every set (Settings → Accessibility, M18b). */
const TEAM_COLORS = Object.values(TEAM_COLOUR_SETS).flatMap((s) => s.figures);

/** A prop colour "reads as a team" if it's saturated and within this hue distance of a team colour. */
const TEAM_HUE_MARGIN_DEG = 20;
const TEAM_MIN_SATURATION = 0.3;

function hsl(hex: number): { h: number; s: number } {
  const out = { h: 0, s: 0, l: 0 };
  new THREE.Color(hex).getHSL(out);
  return { h: out.h * 360, s: out.s };
}

function hueDistance(a: number, b: number): number {
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
}

describe('blockTint', () => {
  it('gives mirror twins the same colour, so a symmetric map looks symmetric', () => {
    for (const b of DEPOT.blocks) {
      const twin = { ...b, center: vec3(-b.center.x, b.center.y, b.center.z) };
      expect(blockTint(twin)).toBe(blockTint(b));
    }
  });

  it('never paints props in anything that reads as a team colour', () => {
    const teams = TEAM_COLORS.map(hsl);
    for (const b of DEPOT.blocks) {
      const tint = hsl(blockTint(b));
      if (tint.s < TEAM_MIN_SATURATION) continue;
      for (const t of teams) {
        expect(hueDistance(tint.h, t.h), `${b.kind} tint too close to a team colour`).toBeGreaterThan(TEAM_HUE_MARGIN_DEG);
      }
    }
  });

  it('the team-colour check catches near-team colours', () => {
    // Guard the guard: the old blue and orange prop tints must be flagged.
    for (const nearTeam of [0x3d6ea8, 0xf07c2a, 0x8c5b3e]) {
      const c = hsl(nearTeam);
      const flagged = c.s >= TEAM_MIN_SATURATION && TEAM_COLORS.map(hsl).some((t) => hueDistance(c.h, t.h) <= TEAM_HUE_MARGIN_DEG);
      expect(flagged).toBe(true);
    }
  });

  it('varies colours between props of the same kind', () => {
    const containerTints = new Set(DEPOT.blocks.filter((b) => b.kind === 'container').map(blockTint));
    expect(containerTints.size).toBeGreaterThan(1);
  });
});

describe('the art pass on the map (M14)', () => {
  /**
   * Stand-in textures (canvases need a browser): their world size matters to the geometry, their name (the surface)
   * to restyling, and each has a stand-in normal map (worked out from a canvas in the game).
   */
  const textures = Object.fromEntries(
    (Object.keys(SURFACES.worldSize) as SurfaceTextureId[]).map((id) => [
      id,
      { texture: Object.assign(new THREE.Texture(), { name: id }) as THREE.CanvasTexture, worldSize: SURFACES.worldSize[id], normal: new THREE.Texture() },
    ]),
  ) as SurfaceTextures;
  const EPS = 1e-9;
  /** The look before map detail, with bump-mapped relief on or off. */
  const plain = (relief: boolean): MapLook => ({ relief, normalMaps: false, detail: false, steelSheen: false });

  it('draws every detail inside its own block, so what you see is exactly what collides (with map detail too)', () => {
    for (const b of DEPOT.blocks) {
      if (b.kind === 'ramp') continue;
      for (const p of [...blockPieces(b, DEPOT.blocks), ...blockPieces(b, DEPOT.blocks, true)]) {
        for (let axis = 0; axis < 3; axis++) {
          const key = (['x', 'y', 'z'] as const)[axis]!;
          expect(p.box.min[axis]!).toBeGreaterThanOrEqual(b.center[key] - b.size[key] / 2 - EPS);
          expect(p.box.max[axis]!).toBeLessThanOrEqual(b.center[key] + b.size[key] / 2 + EPS);
          expect(p.box.max[axis]!).toBeGreaterThan(p.box.min[axis]!);
        }
      }
    }
  });

  it('dresses props: container frames, wall copings, and a pallet under each crate that stands on the ground', () => {
    const container = DEPOT.blocks.find((b) => b.kind === 'container')!;
    expect(blockPieces(container, DEPOT.blocks).length).toBeGreaterThan(8);
    const wall = DEPOT.blocks.find((b) => b.kind === 'wall')!;
    expect(blockPieces(wall, DEPOT.blocks).map((p) => p.texture)).toEqual(['blockWall', 'concrete']);
    const crates = DEPOT.blocks.filter((b) => b.kind === 'crate');
    const under = (b: (typeof crates)[number]): boolean =>
      crates.some((o) => o !== b && Math.abs(o.center.x - b.center.x) < 0.01 && Math.abs(o.center.z - b.center.z) < 0.01 && Math.abs(o.center.y + o.size.y / 2 - (b.center.y - b.size.y / 2)) < 0.01);
    const onGround = crates.filter((b) => b.center.y - b.size.y / 2 < 0.05);
    const stacked = crates.filter(under);
    expect(onGround.length).toBeGreaterThan(0);
    expect(stacked.length).toBeGreaterThan(0);
    for (const b of onGround) expect(blockPieces(b, DEPOT.blocks).length).toBeGreaterThan(1);
    for (const b of stacked) expect(blockPieces(b, DEPOT.blocks)).toHaveLength(1);
  });

  it('draws each site prop (M25b) with its details, out to every side of its block, so a BB stops on what you see', () => {
    const details = { toilet: 5, rack: 20, gabion: 2, wrapped: 4, ibc: 20, sandbags: 4, generator: 10, skip: 6 } as const;
    for (const [kind, least] of Object.entries(details)) {
      const blocks = DEPOT.blocks.filter((b) => b.kind === kind);
      expect(blocks.length, kind).toBeGreaterThan(0);
      for (const b of blocks) {
        const pieces = blockPieces(b, DEPOT.blocks);
        expect(pieces.length, kind).toBeGreaterThanOrEqual(least);
        // Some piece comes within a few centimetres of each side face.
        for (const [axis, key] of [[0, 'x'], [2, 'z']] as const) {
          const lo = b.center[key] - b.size[key] / 2;
          const hi = b.center[key] + b.size[key] / 2;
          expect(Math.min(...pieces.map((p) => p.box.min[axis]!)) - lo, `${kind} ${key}`).toBeLessThan(0.06);
          expect(hi - Math.max(...pieces.map((p) => p.box.max[axis]!)), `${kind} ${key}`).toBeLessThan(0.06);
        }
        expect(Math.max(...pieces.map((p) => p.box.max[1]!)), kind).toBeCloseTo(b.center.y + b.size.y / 2, 6);
      }
    }
  });

  it('builds the whole of Depot in a handful of draw calls', () => {
    const group = buildMapMeshes(DEPOT, textures, plain(true));
    // One mesh per texture (and shadow setting): 8 before M25b's sandbag and gabion textures.
    expect(group.children.length).toBeLessThanOrEqual(10);
    disposeMapMeshes(group);
  });

  it('makes the dock and its ramps cast shadows, and not the ground (KNOWN_ISSUES: raised floors cast none)', () => {
    const floors = DEPOT.blocks.filter((b) => b.kind === 'floor' || b.kind === 'ramp');
    const ground = floors.filter((b) => b.center.y + b.size.y / 2 <= 0);
    const raised = floors.filter((b) => b.center.y + b.size.y / 2 > 0.1);
    expect(ground.length).toBeGreaterThan(0);
    expect(raised.length).toBeGreaterThanOrEqual(3); // the dock's deck and its two ramps
    for (const b of ground) expect(castsShadow(b)).toBe(false);
    for (const b of raised) expect(castsShadow(b), `${b.kind} at ${b.center.x}`).toBe(true);
    // No part of the deck is left in a mesh that casts nothing (it shared the ground's), and no new mesh is needed.
    const group = buildMapMeshes(DEPOT, textures, plain(true));
    const deck = raised.find((b) => b.kind === 'floor')!;
    const top = deck.center.y + deck.size.y / 2;
    const flat = group.children.filter((m): m is THREE.Mesh => m instanceof THREE.Mesh && !m.castShadow);
    const deckInFlat = flat.some((m) => {
      const pos = m.geometry.getAttribute('position');
      for (let i = 0; i < pos.count; i++) {
        const inside = Math.abs(pos.getX(i) - deck.center.x) <= deck.size.x / 2 + 1e-6 && Math.abs(pos.getZ(i) - deck.center.z) <= deck.size.z / 2 + 1e-6;
        if (inside && Math.abs(pos.getY(i) - top) < 1e-6) return true;
      }
      return false;
    });
    expect(deckInFlat).toBe(false);
    expect(group.children.length).toBeLessThanOrEqual(10);
    disposeMapMeshes(group);
  });

  it('varies brightness a little between props without changing their hue, the same for mirror twins', () => {
    for (const b of DEPOT.blocks) {
      const shade = blockShade(b);
      expect(shade).toBeGreaterThanOrEqual(1 - SURFACES.shadeJitter - EPS);
      expect(shade).toBeLessThanOrEqual(1);
      expect(blockShade({ ...b, center: vec3(-b.center.x, b.center.y, b.center.z) })).toBe(shade);
    }
    expect(new Set(DEPOT.blocks.map(blockShade)).size).toBeGreaterThan(5);
  });

  it('turns surface relief on and off on a built map', () => {
    const group = buildMapMeshes(DEPOT, textures, plain(false));
    const materials = group.children.map((m) => (m as THREE.Mesh).material as THREE.MeshLambertMaterial);
    expect(materials.every((m) => m.bumpMap === null)).toBe(true);
    setMapRelief(group, textures, { relief: true, normalMaps: false });
    expect(materials.every((m) => m.bumpMap === m.map)).toBe(true);
    disposeMapMeshes(group);
  });

  it('points a built map at another texture set (Texture detail, REN-13), keeping each surface and its relief', () => {
    /** A set like createSurfaceTextures' (each texture named by its surface), stubbed: no canvas in the tests. */
    const named = (): SurfaceTextures =>
      Object.fromEntries(
        (Object.keys(SURFACES.worldSize) as SurfaceTextureId[]).map((id) => {
          const texture = new THREE.Texture() as THREE.CanvasTexture;
          texture.name = id;
          return [id, { texture, worldSize: SURFACES.worldSize[id] }];
        }),
      ) as SurfaceTextures;
    const [small, large] = [named(), named()];
    const group = buildMapMeshes(DEPOT, small, plain(true));
    const materials = group.children.map((m) => (m as THREE.Mesh).material as THREE.MeshLambertMaterial);
    const surfaces = materials.map((m) => m.map!.name);
    setMapTextures(group, large);
    expect(materials.map((m) => m.map!.name)).toEqual(surfaces);
    for (const m of materials) {
      expect(m.map).toBe(large[m.map!.name as SurfaceTextureId]!.texture);
      expect(m.bumpMap).toBe(m.map);
    }
    // Relief off stays off.
    setMapRelief(group, large, { relief: false, normalMaps: false });
    setMapTextures(group, small);
    expect(materials.every((m) => m.bumpMap === null && m.map === small[m.map!.name as SurfaceTextureId]!.texture)).toBe(true);
    disposeMapMeshes(group);
  });

  /** Map detail as Medium has it, with a stand-in for the signs' texture. */
  const detailed: MapLook = { relief: true, normalMaps: true, detail: true, steelSheen: true };
  const atlas = () => Object.assign(new THREE.Texture(), { name: 'decals' });
  const triangles = (group: THREE.Group): number =>
    group.children.reduce((n, m) => n + Math.min((m as THREE.Mesh).geometry.index!.count, (m as THREE.Mesh).geometry.drawRange.count) / 3, 0);

  it('reads its look from the quality settings: Low is the look before map detail', () => {
    expect(mapLookOf(QUALITY.low)).toEqual({ relief: false, normalMaps: false, detail: false, steelSheen: false, foliageShadows: false });
    expect(mapLookOf(QUALITY.medium)).toEqual({ ...detailed, foliageShadows: false });
    // Tree crowns cast shadows only where the shadow map follows the view (M33i): High.
    expect(mapLookOf(QUALITY.high).foliageShadows).toBe(true);
    expect(mapNeedsRebuild(mapLookOf(QUALITY.medium), mapLookOf(QUALITY.high))).toBe(false);
    expect(mapNeedsRebuild(mapLookOf(QUALITY.low), mapLookOf(QUALITY.medium))).toBe(true);
    expect(mapNeedsRebuild(plain(true), plain(false))).toBe(false);
  });

  it('adds prop detail with map detail: lock boxes, deck boards, a fuel cap, rubble and a barrier’s recessed top', () => {
    for (const kind of ['container', 'crate', 'generator', 'skip', 'barrier'] as const) {
      const b = DEPOT.blocks.find((o) => o.kind === kind && blockPieces(o, DEPOT.blocks).length >= 1 && o.surface !== 'metal' && (kind !== 'crate' || blockPieces(o, DEPOT.blocks).length > 1))!;
      expect(blockPieces(b, DEPOT.blocks, true).length, kind).toBeGreaterThan(blockPieces(b, DEPOT.blocks).length);
    }
  });

  it('with map detail: bevels, tiles and baked shade on Depot, the signs, and steel that takes the sky', () => {
    const before = buildMapMeshes(DEPOT, textures, plain(true));
    const group = buildMapMeshes(DEPOT, textures, detailed, atlas);
    expect(group.getObjectByName('map-decals')).toBeDefined();
    expect(before.getObjectByName('map-decals')).toBeUndefined();
    expect(triangles(group)).toBeGreaterThan(2 * triangles(before));
    // The ground's vertex colours vary (occlusion along wall feet, ground variation); without detail it is one colour.
    const shades = (g: THREE.Group) => {
      const m = g.getObjectByName('map-concrete-flat') as THREE.Mesh;
      const c = m.geometry.getAttribute('color');
      const values = Array.from({ length: c.count }, (_, i) => c.getY(i));
      return { min: Math.min(...values), max: Math.max(...values) };
    };
    expect(shades(before).max - shades(before).min).toBeLessThan(0.05);
    expect(shades(group).max - shades(group).min).toBeGreaterThan(0.1);
    const steel = group.getObjectByName('map-steelPlate-flat') ?? group.getObjectByName('map-steelPlate');
    expect((steel as THREE.Mesh).material).toBeInstanceOf(THREE.MeshStandardMaterial);
    expect(group.children.length).toBeLessThanOrEqual(11);
    disposeMapMeshes(before);
    disposeMapMeshes(group);
  });

  it('draws plain boxes into the shadow map in place of the detailed ones (the same mesh, another index range)', () => {
    const group = buildMapMeshes(DEPOT, textures, detailed, atlas);
    const casters = group.children.filter((m): m is THREE.Mesh => m instanceof THREE.Mesh && m.castShadow && m.name !== 'map-decals');
    expect(casters.length).toBeGreaterThan(3);
    for (const m of casters) {
      const geo = m.geometry;
      const all = geo.index!.count;
      const drawn = geo.drawRange.count;
      expect(geo.drawRange.start).toBe(0);
      expect(drawn).toBeLessThan(all);
      m.onBeforeShadow({} as never, {} as never, {} as never, {} as never, geo, {} as never, null as never);
      expect(geo.drawRange.start).toBe(drawn);
      expect(geo.drawRange.count).toBe(all - drawn);
      expect(geo.drawRange.count).toBeLessThan(drawn);
      m.onAfterShadow({} as never, {} as never, {} as never, {} as never, geo, {} as never, null as never);
      expect(geo.drawRange.start).toBe(0);
      expect(geo.drawRange.count).toBe(drawn);
    }
    // Without map detail every mesh draws all of itself everywhere.
    const before = buildMapMeshes(DEPOT, textures, plain(true));
    for (const m of before.children as THREE.Mesh[]) expect(m.geometry.drawRange.count).toBe(Number.POSITIVE_INFINITY);
    disposeMapMeshes(before);
    disposeMapMeshes(group);
  });

  it('restyles a built map in place, or builds it again (freeing the old one) when map detail or the steel changes', () => {
    const scene = new THREE.Scene();
    const low = buildMapMeshes(DEPOT, textures, mapLookOf(QUALITY.low));
    scene.add(low);
    const dispose = vi.spyOn(THREE.BufferGeometry.prototype, 'dispose');
    const medium = restyleMap(low, DEPOT, textures, mapLookOf(QUALITY.low), mapLookOf(QUALITY.medium), atlas);
    expect(medium).not.toBe(low);
    expect(low.parent).toBeNull();
    expect(medium.parent).toBe(scene);
    expect(dispose).toHaveBeenCalled();
    dispose.mockClear();
    const high = restyleMap(medium, DEPOT, textures, mapLookOf(QUALITY.medium), mapLookOf(QUALITY.high));
    expect(high).toBe(medium);
    expect(dispose).not.toHaveBeenCalled();
    dispose.mockRestore();
    disposeMapMeshes(high);
    expect(scene.children).toHaveLength(0);
  });

  it('frees the normal maps once the look stops drawing them (Bump or relief off), as the sheen while off', () => {
    const fresh = (): SurfaceTextures =>
      Object.fromEntries(
        (Object.keys(SURFACES.worldSize) as SurfaceTextureId[]).map((id) => [
          id,
          { texture: Object.assign(new THREE.Texture(), { name: id }) as THREE.CanvasTexture, worldSize: SURFACES.worldSize[id], normal: new THREE.Texture() },
        ]),
      ) as SurfaceTextures;
    const set = fresh();
    const normals = Object.values(set).map((t) => t.normal!);
    const freed = normals.map((n) => vi.spyOn(n, 'dispose'));
    let group = buildMapMeshes(DEPOT, set, detailed, atlas);
    group = restyleMap(group, DEPOT, set, detailed, { ...detailed, relief: true }, atlas);
    expect(freed.every((f) => f.mock.calls.length === 0)).toBe(true);
    // Relief maps: Bump (in place): the normal maps go, and every material draws the bump map instead.
    group = restyleMap(group, DEPOT, set, detailed, { ...detailed, normalMaps: false }, atlas);
    expect(freed.every((f) => f.mock.calls.length === 1)).toBe(true);
    expect(Object.values(set).every((t) => t.normal === undefined)).toBe(true);
    disposeMapMeshes(group);
    // Built again at Low (relief off): the same.
    const other = fresh();
    const otherFreed = Object.values(other).map((t) => vi.spyOn(t.normal!, 'dispose'));
    group = buildMapMeshes(DEPOT, other, detailed, atlas);
    group = restyleMap(group, DEPOT, other, detailed, mapLookOf(QUALITY.low), atlas);
    expect(otherFreed.every((f) => f.mock.calls.length === 1)).toBe(true);
    disposeMapMeshes(group);
  });

  it('frees the signs’ texture with the map', () => {
    const texture = atlas();
    const dispose = vi.spyOn(texture, 'dispose');
    disposeMapMeshes(buildMapMeshes(DEPOT, textures, detailed, () => texture));
    expect(dispose).toHaveBeenCalled();
  });
});

describe('groundNoise', () => {
  it('is a smooth, repeatable variation between -1 and 1', () => {
    let lo = Infinity;
    let hi = -Infinity;
    for (let x = -20; x < 20; x += 0.37) {
      for (let z = -15; z < 15; z += 0.41) {
        const n = groundNoise(x, z);
        lo = Math.min(lo, n);
        hi = Math.max(hi, n);
        expect(Math.abs(groundNoise(x + 0.01, z) - n)).toBeLessThan(0.05);
      }
    }
    expect(lo).toBeGreaterThanOrEqual(-1);
    expect(hi).toBeLessThanOrEqual(1);
    expect(hi - lo).toBeGreaterThan(0.8);
    expect(groundNoise(3.3, -2.1)).toBe(groundNoise(3.3, -2.1));
  });
});

describe('the ground of a map with terrain (M33c)', () => {
  const textures = Object.fromEntries(
    (Object.keys(SURFACES.worldSize) as SurfaceTextureId[]).map((id) => [id, { texture: new THREE.Texture() as THREE.CanvasTexture, worldSize: SURFACES.worldSize[id] }]),
  ) as SurfaceTextures;
  const terrainMeshOf = (group: THREE.Group): THREE.Mesh | undefined => group.children.find((c) => c.name === 'map-terrain') as THREE.Mesh | undefined;
  const plain = (relief: boolean): MapLook => ({ relief, normalMaps: false, detail: false, steelSheen: false });

  it('adds one mesh named map-terrain, one more draw call than the same map without it, and none on Depot', () => {
    const withGround = buildMapMeshes(SLOPE_YARD, textures, plain(true));
    const { terrain: _ground, ...flat } = SLOPE_YARD;
    const without = buildMapMeshes(flat, textures, plain(true));
    expect(withGround.children.filter((c) => c.name === 'map-terrain')).toHaveLength(1);
    expect(withGround.children.length).toBe(without.children.length + 1);
    expect(terrainMeshOf(without)).toBeUndefined();
    const depot = buildMapMeshes(DEPOT, textures, plain(true));
    expect(terrainMeshOf(depot)).toBeUndefined();
    for (const g of [withGround, without, depot]) disposeMapMeshes(g);
  });

  it('is one vertex-coloured mesh of the terrain\'s own triangles that receives shadows and casts none', () => {
    const group = buildMapMeshes(SLOPE_YARD, textures, plain(false));
    const mesh = terrainMeshOf(group)!;
    expect(mesh.receiveShadow).toBe(true);
    expect(mesh.castShadow).toBe(false);
    expect((mesh.material as THREE.MeshLambertMaterial).vertexColors).toBe(true);
    const { positions, indices } = terrainMesh(SLOPE_YARD_TERRAIN);
    const geo = mesh.geometry;
    expect(Array.from(geo.getAttribute('position').array)).toEqual(Array.from(positions));
    expect(Array.from(geo.getIndex()!.array)).toEqual(Array.from(indices));
    expect(geo.getAttribute('color').count).toBe(geo.getAttribute('position').count);
    // Smooth normals pointing up.
    for (let v = 0; v < geo.getAttribute('normal').count; v++) expect(geo.getAttribute('normal').getY(v)).toBeGreaterThan(0.5);
    // Turning surface relief on leaves the ground alone (it has no texture to take relief from).
    setMapRelief(group, textures, { relief: true, normalMaps: false });
    expect((mesh.material as THREE.MeshLambertMaterial).bumpMap).toBeNull();
    disposeMapMeshes(group);
  });

  it('colours the ground lighter where it is higher (a greybox grass, darker low and lighter high)', () => {
    const group = buildMapMeshes(SLOPE_YARD, textures, plain(false));
    const geo = terrainMeshOf(group)!.geometry;
    const pos = geo.getAttribute('position');
    const col = geo.getAttribute('color');
    const { min, max } = terrainRange(SLOPE_YARD_TERRAIN);
    // Mean brightness of the lowest tenth of the vertices by height against the highest tenth.
    const order = Array.from({ length: pos.count }, (_, i) => i).sort((a, b) => pos.getY(a) - pos.getY(b));
    const tenth = Math.floor(order.length / 10);
    const grey = (i: number): number => (col.getX(i) + col.getY(i) + col.getZ(i)) / 3;
    const avg = (ids: number[]): number => ids.reduce((s, i) => s + grey(i), 0) / ids.length;
    const lowest = avg(order.slice(0, tenth));
    const highest = avg(order.slice(-tenth));
    expect(highest).toBeGreaterThan(lowest * 1.15);
    // The very lowest and highest vertices are the TERRAIN_LOOK greens (within its jitter).
    const low = new THREE.Color().setHex(TERRAIN_LOOK.low, THREE.SRGBColorSpace);
    const high = new THREE.Color().setHex(TERRAIN_LOOK.high, THREE.SRGBColorSpace);
    const bottom = order[0]!;
    const top = order[order.length - 1]!;
    expect(pos.getY(bottom)).toBeCloseTo(min, 5);
    expect(pos.getY(top)).toBeCloseTo(max, 5);
    expect(Math.abs(col.getY(bottom) / low.g - 1)).toBeLessThanOrEqual(TERRAIN_LOOK.jitter + 1e-6);
    expect(Math.abs(col.getY(top) / high.g - 1)).toBeLessThanOrEqual(TERRAIN_LOOK.jitter + 1e-6);
    // Same height, same mesh: the mesh's heights are the ground's.
    expect(pos.getY(0)).toBeCloseTo(terrainHeightAt(SLOPE_YARD_TERRAIN, pos.getX(0), pos.getZ(0))!, 5);
    disposeMapMeshes(group);
  });
});

describe('bushes (M33e)', () => {
  const textures = Object.fromEntries(
    (Object.keys(SURFACES.worldSize) as SurfaceTextureId[]).map((id) => [id, { texture: new THREE.Texture() as THREE.CanvasTexture, worldSize: SURFACES.worldSize[id] }]),
  ) as SurfaceTextures;
  const bushes = [
    { x: 0, y: 0, z: 0, radius: 1, height: 1.6 },
    { x: 5, y: 0.5, z: -2, radius: 1.3, height: 1.2 },
  ];

  it('are one more mesh, map-foliage, holding every bush, casting and receiving shadows; none on a map without them', () => {
    const withBushes = buildMapMeshes({ ...SLOPE_YARD, foliage: bushes }, textures, { relief: true, normalMaps: false, detail: false, steelSheen: false });
    const without = buildMapMeshes(SLOPE_YARD, textures, { relief: true, normalMaps: false, detail: false, steelSheen: false });
    expect(withBushes.children.length).toBe(without.children.length + 1);
    expect(without.children.find((c) => c.name === 'map-foliage')).toBeUndefined();
    const mesh = withBushes.children.find((c) => c.name === 'map-foliage') as THREE.Mesh;
    expect(mesh.castShadow).toBe(true);
    expect(mesh.receiveShadow).toBe(true);
    // Every bush's leaves stay within its ellipsoid, give or take the lumps.
    const pos = mesh.geometry.getAttribute('position');
    const perBush = pos.count / bushes.length;
    for (const [b, bush] of bushes.entries()) {
      for (let v = b * perBush; v < (b + 1) * perBush; v++) {
        const y = pos.getY(v);
        expect(Math.hypot(pos.getX(v) - bush.x, pos.getZ(v) - bush.z)).toBeLessThanOrEqual(bush.radius * (1 + FOLIAGE_LOOK.lump) + 1e-6);
        expect(y).toBeGreaterThanOrEqual(bush.y - (bush.height / 2) * FOLIAGE_LOOK.lump - 1e-6);
        expect(y).toBeLessThanOrEqual(bush.y + bush.height * (1 + FOLIAGE_LOOK.lump / 2) + 1e-6);
      }
    }
    disposeMapMeshes(withBushes);
    disposeMapMeshes(without);
  });
});

describe('the woodland look (M33i)', () => {
  const textures = Object.fromEntries(
    (Object.keys(SURFACES.worldSize) as SurfaceTextureId[]).map((id) => [id, { texture: Object.assign(new THREE.Texture(), { name: id }) as THREE.CanvasTexture, worldSize: SURFACES.worldSize[id] }]),
  ) as SurfaceTextures;
  const drawn = (m: THREE.Mesh): number => Math.min(m.geometry.index?.count ?? m.geometry.getAttribute('position').count, m.geometry.drawRange.count) / 3;
  const meshOf = (group: THREE.Group, name: string): THREE.Mesh => group.children.find((c) => c.name === name) as THREE.Mesh;

  it('draws the woods’ textures only for a map that uses them', () => {
    expect(texturesFor(WOODLAND)).toEqual(expect.arrayContaining(['bark', 'planks', 'stone', 'groundDetail']));
    expect(texturesFor(DEPOT)).not.toEqual(expect.arrayContaining(['bark']));
  });

  it('draws trees and logs in bark, boulders in stone, fences in planks, crowns over the trees, inside a triangle budget', () => {
    for (const q of [QUALITY.low, QUALITY.medium]) {
      const group = buildMapMeshes(WOODLAND, textures, { ...mapLookOf(q), relief: false, normalMaps: false }, null);
      const names = group.children.map((c) => c.name);
      expect(names).toEqual(expect.arrayContaining(['map-bark', 'map-stone', 'map-planks', 'map-canopy', 'map-terrain', 'map-foliage']));
      expect(names.filter((n) => n === 'map-crate')).toHaveLength(0);
      // The map's whole share of a frame (Low: 150k triangles with the figures, Medium 200k at 5v5): measured 52k / 55k.
      const total = group.children.reduce((n, c) => n + drawn(c as THREE.Mesh), 0);
      expect(total, q.mapDetail ? 'medium' : 'low').toBeLessThan(q.mapDetail ? 60_000 : 56_000);
      disposeMapMeshes(group);
    }
  });

  it('casts crown and bush shadows only where the shadow map follows the view, switched in place', () => {
    const medium = { ...mapLookOf(QUALITY.medium), relief: false, normalMaps: false };
    const group = buildMapMeshes(WOODLAND, textures, medium, null);
    expect(meshOf(group, 'map-canopy').castShadow).toBe(false);
    expect(meshOf(group, 'map-foliage').castShadow).toBe(false);
    const high = { ...mapLookOf(QUALITY.high), relief: false, normalMaps: false };
    expect(restyleMap(group, WOODLAND, textures, medium, high, null)).toBe(group);
    expect(meshOf(group, 'map-canopy').castShadow).toBe(true);
    expect(meshOf(group, 'map-foliage').castShadow).toBe(true);
    // The trunks, logs and boulders still cast theirs, from boxes (the shadow proxy).
    expect(meshOf(group, 'map-bark').castShadow).toBe(true);
    disposeMapMeshes(group);
  });

  it('rims bushes towards the moon without moving a leaf', () => {
    const bushes = WOODLAND.foliage!.slice(0, 5);
    const plainBushes = buildFoliageMesh(bushes)!;
    const rimmed = buildFoliageMesh(bushes, new THREE.Vector3(0, 0.6, -0.8))!;
    expect(rimmed.geometry.getAttribute('position').array).toEqual(plainBushes.geometry.getAttribute('position').array);
    expect(rimmed.geometry.getAttribute('color').array).not.toEqual(plainBushes.geometry.getAttribute('color').array);
  });
});
