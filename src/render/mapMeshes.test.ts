import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { TEAM_COLOUR_SETS } from '../config/teams';
import { DEPOT } from '../map/depot';
import { terrainHeightAt, terrainMesh, terrainRange } from '../map/terrain';
import { SLOPE_YARD, SLOPE_YARD_TERRAIN } from '../map/testSupport';
import { FOLIAGE_LOOK, TERRAIN_LOOK } from '../config/render';
import { vec3 } from '../sim/vec';
import { SURFACES, type SurfaceTextureId } from '../config/render';
import { blockPieces, blockShade, blockTint, buildMapMeshes, disposeMapMeshes, setMapRelief } from './mapMeshes';
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
  /** Stand-in textures (canvases need a browser): only their world size matters to the geometry. */
  const textures = Object.fromEntries(
    (Object.keys(SURFACES.worldSize) as SurfaceTextureId[]).map((id) => [id, { texture: new THREE.Texture() as THREE.CanvasTexture, worldSize: SURFACES.worldSize[id] }]),
  ) as SurfaceTextures;
  const EPS = 1e-9;

  it('draws every detail inside its own block, so what you see is exactly what collides', () => {
    for (const b of DEPOT.blocks) {
      if (b.kind === 'ramp') continue;
      for (const p of blockPieces(b, DEPOT.blocks)) {
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
    const group = buildMapMeshes(DEPOT, textures, true);
    // One mesh per texture (and shadow setting): 8 before M25b's sandbag and gabion textures.
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
    const group = buildMapMeshes(DEPOT, textures, false);
    const materials = group.children.map((m) => (m as THREE.Mesh).material as THREE.MeshLambertMaterial);
    expect(materials.every((m) => m.bumpMap === null)).toBe(true);
    setMapRelief(group, true);
    expect(materials.every((m) => m.bumpMap === m.map)).toBe(true);
    disposeMapMeshes(group);
  });
});

describe('the ground of a map with terrain (M33c)', () => {
  const textures = Object.fromEntries(
    (Object.keys(SURFACES.worldSize) as SurfaceTextureId[]).map((id) => [id, { texture: new THREE.Texture() as THREE.CanvasTexture, worldSize: SURFACES.worldSize[id] }]),
  ) as SurfaceTextures;
  const terrainMeshOf = (group: THREE.Group): THREE.Mesh | undefined => group.children.find((c) => c.name === 'map-terrain') as THREE.Mesh | undefined;

  it('adds one mesh named map-terrain, one more draw call than the same map without it, and none on Depot', () => {
    const withGround = buildMapMeshes(SLOPE_YARD, textures, true);
    const { terrain: _ground, ...flat } = SLOPE_YARD;
    const without = buildMapMeshes(flat, textures, true);
    expect(withGround.children.filter((c) => c.name === 'map-terrain')).toHaveLength(1);
    expect(withGround.children.length).toBe(without.children.length + 1);
    expect(terrainMeshOf(without)).toBeUndefined();
    const depot = buildMapMeshes(DEPOT, textures, true);
    expect(terrainMeshOf(depot)).toBeUndefined();
    for (const g of [withGround, without, depot]) disposeMapMeshes(g);
  });

  it('is one vertex-coloured mesh of the terrain\'s own triangles that receives shadows and casts none', () => {
    const group = buildMapMeshes(SLOPE_YARD, textures, false);
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
    setMapRelief(group, true);
    expect((mesh.material as THREE.MeshLambertMaterial).bumpMap).toBeNull();
    disposeMapMeshes(group);
  });

  it('colours the ground lighter where it is higher (a greybox grass, darker low and lighter high)', () => {
    const group = buildMapMeshes(SLOPE_YARD, textures, false);
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
    const withBushes = buildMapMeshes({ ...SLOPE_YARD, foliage: bushes }, textures, true);
    const without = buildMapMeshes(SLOPE_YARD, textures, true);
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
