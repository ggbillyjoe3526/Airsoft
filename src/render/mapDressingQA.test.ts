import * as THREE from 'three';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { DRESSING } from '../config/dressing';
import { QUALITY, type QualitySettings, SURFACES } from '../config/render';
import { DEPOT } from '../map/depot';
import type { MapBlock, MapData } from '../map/mapTypes';
import { buildJunkMesh, buildPuddleMesh } from './dressingMeshes';
import { buildMapMeshes, disposeMapMeshes, type MapLook, mapLookOf, restyleMap } from './mapMeshes';
import { clearOfPlay, frontRect, junkFits, junkRect, type JunkPiece, placeDressing } from './mapDressing';
import type { SurfaceTextures } from './proceduralTextures';
import { CORE_SURFACES } from './proceduralTextures';

/** QA for G8's placement and meshes: no dressing, determinism, puddle bounds, rebuilds and disposal. */

const BARE: MapData = { ...DEPOT };
delete BARE.dressing;
const textures = (): SurfaceTextures =>
  Object.fromEntries(CORE_SURFACES.map((id) => [id, { texture: Object.assign(new THREE.Texture(), { name: id }), worldSize: SURFACES.worldSize[id] }])) as unknown as SurfaceTextures;
const look = (q: QualitySettings): MapLook => ({ ...mapLookOf(q, null), relief: false });
const atlas = (): THREE.Texture => new THREE.Texture();
const names = (g: THREE.Object3D): string[] => g.children.map((o) => o.name).sort();
const positions = (m: THREE.Mesh): number[] => Array.from(m.geometry.getAttribute('position').array);

const block = (kind: MapBlock['kind'], x: number, y: number, z: number, sx: number, sy: number, sz: number): MapBlock => ({ kind, center: { x, y, z }, size: { x: sx, y: sy, z: sz } }) as MapBlock;

describe('G8 QA: a map with no dressing', () => {
  beforeAll(() => {
    vi.stubGlobal('document', { createElement: () => ({ width: 0, height: 0, getContext: () => null }) });
  });
  afterAll(() => vi.unstubAllGlobals());

  it('places nothing and builds neither dressing mesh at any quality', () => {
    const layout = placeDressing(BARE);
    expect(layout.decals).toHaveLength(0);
    expect(layout.junk).toHaveLength(0);
    expect(layout.puddles).toHaveLength(0);
    expect(layout.strips).toHaveLength(0);
    for (const q of [QUALITY.low, QUALITY.medium, QUALITY.high]) {
      const g = buildMapMeshes(BARE, textures(), look(q), atlas);
      expect(g.getObjectByName('map-junk')).toBeUndefined();
      expect(g.getObjectByName('map-puddles')).toBeUndefined();
      disposeMapMeshes(g);
    }
    expect(buildJunkMesh(layout)).toBeNull();
    expect(buildPuddleMesh(layout)).toBeNull();
  });

  it('a dressing block with only a seed places nothing and does not throw', () => {
    const layout = placeDressing({ ...BARE, dressing: { seed: 1 } });
    expect(layout.junk.length + layout.decals.length + layout.puddles.length + layout.strips.length).toBe(0);
  });

  // Bug: placeDressing returns one shared, mutable EMPTY layout, so a consumer's push leaks into every dressing-less map.
  it.fails('returns a fresh layout each call (no shared mutable EMPTY)', () => {
    placeDressing(BARE).junk.push({} as never);
    expect(placeDressing(BARE).junk).toHaveLength(0);
  });
});

describe('G8 QA: determinism across two builds', () => {
  beforeAll(() => {
    vi.stubGlobal('document', { createElement: () => ({ width: 0, height: 0, getContext: () => null }) });
  });
  afterAll(() => vi.unstubAllGlobals());

  it('the same map and seed give the same layout and the same mesh vertices; another seed gives another', () => {
    const a = placeDressing(DEPOT);
    const b = placeDressing(DEPOT);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    expect(a.junk.length).toBeGreaterThan(5);
    expect(a.junk.length).toBeLessThanOrEqual(DRESSING.junk.max);
    const ga = buildMapMeshes(DEPOT, textures(), look(QUALITY.high), atlas);
    const gb = buildMapMeshes(DEPOT, textures(), look(QUALITY.high), atlas);
    for (const n of ['map-junk', 'map-puddles', 'map-decals']) {
      expect(positions(ga.getObjectByName(n) as THREE.Mesh), n).toEqual(positions(gb.getObjectByName(n) as THREE.Mesh));
    }
    const other = placeDressing({ ...DEPOT, dressing: { ...DEPOT.dressing!, seed: DEPOT.dressing!.seed + 1 } });
    expect(JSON.stringify(other.junk)).not.toBe(JSON.stringify(a.junk));
    expect(JSON.stringify(other.decals)).not.toBe(JSON.stringify(a.decals));
    disposeMapMeshes(ga);
    disposeMapMeshes(gb);
  });

  it('placement does not depend on a previous call (no hidden module state)', () => {
    const first = JSON.stringify(placeDressing(DEPOT));
    placeDressing({ ...DEPOT, dressing: { ...DEPOT.dressing!, seed: 9 } });
    expect(JSON.stringify(placeDressing(DEPOT))).toBe(first);
  });

  it('every loose piece stands on its floor, at most 0.3 m tall', () => {
    for (const p of placeDressing(DEPOT).junk) {
      expect(p.height).toBeLessThanOrEqual(DRESSING.junk.maxHeight);
      const floor = DEPOT.blocks.find((b) => b.kind === 'floor' && Math.abs(b.center.y + b.size.y / 2 - p.y) < 0.01 && Math.abs(b.center.x - p.x) <= b.size.x / 2 && Math.abs(b.center.z - p.z) <= b.size.z / 2);
      expect(floor, `${p.kind} at ${p.x},${p.z}`).toBeDefined();
    }
  });
});

describe('G8 QA: puddles', () => {
  const floor = block('floor', 0, -0.5, 0, 20, 1, 20);

  it('drops a puddle that is off the floor or under a block', () => {
    const map: MapData = {
      ...BARE,
      blocks: [floor, block('wall', 0, 1.5, 0, 4, 3, 4)],
      lanes: [],
      dressing: {
        seed: 3,
        puddles: [
          { x: 0, z: 0, width: 1, depth: 1 },
          { x: 9.8, z: 0, width: 1, depth: 1 },
          { x: 5, z: 5, width: 1, depth: 1 },
        ],
      },
    };
    const kept = placeDressing(map).puddles;
    expect(kept.map((p) => [p.x, p.z])).toEqual([[5, 5]]);
  });

  it('keeps the puddle seeds distinct', () => {
    const seeds = placeDressing(DEPOT).puddles.map((p) => p.seed);
    expect(new Set(seeds).size).toBe(seeds.length);
  });

  // Bug: the outline wobbles out to 1.35 x its half size, but only the nominal rectangle is checked against the floor and blocks.
  it.fails("a puddle's wobbled outline stays on its floor and out from under a block beside it", () => {
    const wall = block('wall', 0, 1.5, 6, 4, 3, 2);
    const map: MapData = {
      ...BARE,
      blocks: [floor, wall],
      lanes: [],
      dressing: {
        seed: 3,
        // Each nominal rectangle just fits: one at the floor's east edge, one touching the wall's south face (z = 5).
        puddles: [-8, -6, -4, -2, 0, 2, 4, 6].map((z) => ({ x: 9.05, z, width: 1.9, depth: 1.9 })).concat([{ x: 0, z: 3.95, width: 1.9, depth: 1.9 }]),
      },
    };
    const layout = placeDressing(map);
    expect(layout.puddles).toHaveLength(9);
    const mesh = buildPuddleMesh(layout)!;
    const pos = mesh.geometry.getAttribute('position');
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const z = pos.getZ(i);
      expect(Math.abs(x) <= 10 && Math.abs(z) <= 10, `vertex ${x},${z} off the floor`).toBe(true);
      expect(Math.abs(x) < 2 && z > 5 && z < 7, `vertex ${x},${z} inside the wall`).toBe(false);
    }
    mesh.geometry.dispose();
    (mesh.material as THREE.Material).dispose();
  });

  it("Depot's puddle outlines stay on a floor and out from under every block", () => {
    const mesh = buildPuddleMesh(placeDressing(DEPOT))!;
    const pos = mesh.geometry.getAttribute('position');
    const solid = DEPOT.blocks.filter((b) => b.kind !== 'floor' && b.kind !== 'ramp');
    const floors = DEPOT.blocks.filter((b) => b.kind === 'floor');
    for (let i = 0; i < pos.count; i++) {
      const [x, y, z] = [pos.getX(i), pos.getY(i), pos.getZ(i)];
      expect(floors.some((f) => Math.abs(f.center.y + f.size.y / 2 - y) < 0.05 && Math.abs(x - f.center.x) <= f.size.x / 2 && Math.abs(z - f.center.z) <= f.size.z / 2)).toBe(true);
      expect(solid.some((b) => Math.abs(x - b.center.x) < b.size.x / 2 && Math.abs(z - b.center.z) < b.size.z / 2 && b.center.y + b.size.y / 2 > y + 0.01 && b.center.y - b.size.y / 2 < y + 2)).toBe(false);
    }
    mesh.geometry.dispose();
    (mesh.material as THREE.Material).dispose();
  });
});

describe('G8 QA: disposal on a second build and on a quality change', () => {
  beforeAll(() => {
    vi.stubGlobal('document', { createElement: () => ({ width: 0, height: 0, getContext: () => null }) });
  });
  afterAll(() => vi.unstubAllGlobals());

  it('a second build shares nothing with the first: freeing one leaves the other whole', () => {
    const first = buildMapMeshes(DEPOT, textures(), look(QUALITY.high), atlas);
    const second = buildMapMeshes(DEPOT, textures(), look(QUALITY.high), atlas);
    let freed = 0;
    for (const n of ['map-junk', 'map-puddles']) {
      const m = second.getObjectByName(n) as THREE.Mesh;
      expect(m, n).toBeDefined();
      expect(m.geometry).not.toBe((first.getObjectByName(n) as THREE.Mesh).geometry);
      expect(m.material).not.toBe((first.getObjectByName(n) as THREE.Mesh).material);
      m.geometry.addEventListener('dispose', () => freed++);
      (m.material as THREE.Material).addEventListener('dispose', () => freed++);
    }
    disposeMapMeshes(first);
    expect(freed).toBe(0);
    disposeMapMeshes(second);
    expect(freed).toBe(4);
  });

  it('restyleMap high -> low frees the old dressing and builds none; low -> high builds it again', () => {
    const tex = textures();
    const high = look(QUALITY.high);
    const low = look(QUALITY.low);
    const parent = new THREE.Group();
    const a = buildMapMeshes(DEPOT, tex, high, atlas);
    parent.add(a);
    let freed = 0;
    for (const n of ['map-junk', 'map-puddles']) {
      const m = a.getObjectByName(n) as THREE.Mesh;
      m.geometry.addEventListener('dispose', () => freed++);
      (m.material as THREE.Material).addEventListener('dispose', () => freed++);
    }
    const b = restyleMap(a, DEPOT, tex, high, low, atlas);
    expect(freed).toBe(4);
    expect(b.getObjectByName('map-junk')).toBeUndefined();
    expect(b.getObjectByName('map-puddles')).toBeUndefined();
    expect(parent.children).toEqual([b]);
    const c = restyleMap(b, DEPOT, tex, low, high, atlas);
    expect(names(c)).toEqual(expect.arrayContaining(['map-junk', 'map-puddles']));
    expect(parent.children).toEqual([c]);
    disposeMapMeshes(c);
  });

  it('Low makes no dressing mesh, and its group holds exactly the meshes of the same map without dressing', () => {
    const dressed = buildMapMeshes(DEPOT, textures(), look(QUALITY.low), atlas);
    const bare = buildMapMeshes(BARE, textures(), look(QUALITY.low), atlas);
    expect(names(dressed)).toEqual(names(bare));
    disposeMapMeshes(dressed);
    disposeMapMeshes(bare);
  });

  it('every dressing mesh is merged: junk and strips are one mesh, puddles one, however many pieces', () => {
    const g = buildMapMeshes(DEPOT, textures(), look(QUALITY.high), atlas);
    expect(g.children.filter((o) => o.name === 'map-junk')).toHaveLength(1);
    expect(g.children.filter((o) => o.name === 'map-puddles')).toHaveLength(1);
    const junk = g.getObjectByName('map-junk') as THREE.Mesh;
    expect(junk.castShadow).toBe(false);
    for (const a of ['position', 'normal', 'color', 'glow']) expect(junk.geometry.getAttribute(a), a).toBeDefined();
    disposeMapMeshes(g);
  });
});

describe('G8 QA: keeping clear of play', () => {
  const floor = block('floor', 0, -0.5, 0, 20, 1, 20);
  const wall = block('wall', 0, 1.5, 0, 6, 3, 1);
  const piece: JunkPiece = { kind: 'cans', x: 0, y: 0, z: 0.5 + 0.04 + 0.1, axis: 2, sign: 1, along: 0.42, out: 0.2, height: 0.12, variant: 0 };
  const mapWith = (extra: Partial<MapData>): MapData => ({ ...BARE, blocks: [floor, wall], lanes: [], spawns: [[], []], deadZones: [[], []], flag: undefined, extraction: undefined, ...extra }) as MapData;

  it('a piece in the open against a wall fits, so the cases below fail for their own reason', () => {
    const m = mapWith({});
    expect(junkFits(m, m.blocks, piece, [], [])).toBe(true);
  });

  it('refuses a piece on a lane, a spawn, the flag, and one with a block standing in its front', () => {
    const lane = mapWith({ lanes: [[{ x: -5, z: 0.6 }, { x: 5, z: 0.6 }]] as never });
    expect(clearOfPlay(lane, junkRect(piece))).toBe(false);
    const spawn = mapWith({ spawns: [[{ position: { x: 0, y: 0, z: 0.7 }, yaw: 0 }], []] as never });
    expect(clearOfPlay(spawn, junkRect(piece))).toBe(false);
    const flag = mapWith({ flag: { x: 0.2, y: 0, z: 0.7 } as never });
    expect(clearOfPlay(flag, junkRect(piece))).toBe(false);
    const crate = block('crate', 0, 0.5, 0.54 + 0.2 + 1.0, 1, 1, 0.5);
    const m = mapWith({});
    expect(junkFits(m, [...m.blocks, crate], piece, [], [])).toBe(false);
    expect(frontRect(piece)[3]).toBeCloseTo(junkRect(piece)[3] + 1.6, 9);
  });

  // Bug: a lane with a single point is never tested (the loop needs two points), so junk can stand on it.
  it.fails('refuses a piece on a one-point lane', () => {
    const lane = mapWith({ lanes: [[{ x: 0, z: 0.64 }]] as never });
    expect(clearOfPlay(lane, junkRect(piece))).toBe(false);
  });

  it('two pieces closer than the gap do not both fit', () => {
    const m = mapWith({});
    const near = { ...piece, x: piece.x + piece.along + 0.1 };
    expect(junkFits(m, m.blocks, near, [], [piece])).toBe(false);
    expect(junkFits(m, m.blocks, { ...piece, x: piece.x + piece.along + 0.5 }, [], [piece])).toBe(true);
  });

  it('a map with no blocks, lanes, spawns or extraction places without throwing', () => {
    const empty: MapData = { ...BARE, blocks: [], lanes: [], spawns: [[], []], deadZones: [[], []], flag: undefined, extraction: undefined, dressing: { seed: 5, clutter: { dirt: 1, junk: 1, litter: 1 }, marks: { logos: 1, walls: 1 }, puddles: [{ x: 0, z: 0, width: 1, depth: 1 }] } } as unknown as MapData;
    const layout = placeDressing(empty);
    expect(layout.junk.length + layout.decals.length + layout.puddles.length).toBe(0);
  });
});
