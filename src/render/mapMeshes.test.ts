import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import { TEAM_COLOUR_SETS } from '../config/teams';
import { DEPOT } from '../map/depot';
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
      expect(m.map).toBe(large[m.map!.name as SurfaceTextureId].texture);
      expect(m.bumpMap).toBe(m.map);
    }
    // Relief off stays off.
    setMapRelief(group, large, { relief: false, normalMaps: false });
    setMapTextures(group, small);
    expect(materials.every((m) => m.bumpMap === null && m.map === small[m.map!.name as SurfaceTextureId].texture)).toBe(true);
    disposeMapMeshes(group);
  });

  /** Map detail as Medium has it, with a stand-in for the signs' texture. */
  const detailed: MapLook = { relief: true, normalMaps: true, detail: true, steelSheen: true };
  const atlas = () => Object.assign(new THREE.Texture(), { name: 'decals' });
  const triangles = (group: THREE.Group): number =>
    group.children.reduce((n, m) => n + Math.min((m as THREE.Mesh).geometry.index!.count, (m as THREE.Mesh).geometry.drawRange.count) / 3, 0);

  it('reads its look from the quality settings: Low is the look before map detail', () => {
    expect(mapLookOf(QUALITY.low)).toEqual({ relief: false, normalMaps: false, detail: false, steelSheen: false });
    expect(mapLookOf(QUALITY.medium)).toEqual(detailed);
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
