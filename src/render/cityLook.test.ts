import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { CITY_PROPS, SIGNS, SURFACES, type SurfaceTextureId } from '../config/render';
import { DEPOT } from '../map/depot';
import type { BlockKind, MapBlock, MapData, MapSign } from '../map/mapTypes';
import { WOODLAND } from '../map/woodland';
import { OPEN_FIELD } from '../sim/testSupport';
import { vec3 } from '../sim/vec';
import { cityPropPieces, isCityProp, propSigns } from './cityProps';
import { decalQuads } from './mapDecals';
import { blockPieces, blockTint, buildMapMeshes, texturesFor, type Piece } from './mapMeshes';
import { addMapSigns, buildSignGeometry, mapSignsOf } from './mapSigns';
import type { SurfaceTextures } from './proceduralTextures';

/**
 * M34f: the city's look as engine features any map can use: a block's finish and paint, the city props (solid to their
 * bounds), the props' glowing screens, and flat painted markings. Neon Heights' own data is in
 * map/neonHeightsArt.test.ts.
 */

const block = (kind: BlockKind, x0: number, x1: number, y0: number, y1: number, z0: number, z1: number, extra: Partial<MapBlock> = {}): MapBlock => ({
  kind,
  center: vec3((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2),
  size: vec3(x1 - x0, y1 - y0, z1 - z0),
  ...extra,
});

/** Stand-in surface textures (canvases need a browser): only the world size matters to the geometry. */
const stubTextures = (ids: readonly SurfaceTextureId[]): SurfaceTextures =>
  Object.fromEntries(ids.map((id) => [id, { texture: Object.assign(new THREE.Texture(), { name: id }), worldSize: SURFACES.worldSize[id] }])) as unknown as SurfaceTextures;
const LOOK = { relief: false, normalMaps: false, detail: false, steelSheen: false };

const inBox = (p: readonly number[], box: Piece['box'], eps = 1e-9): boolean => [0, 1, 2].every((a) => p[a]! >= box.min[a]! - eps && p[a]! <= box.max[a]! + eps);

/** The props, one of each, in the sizes Neon Heights uses them. */
const PROPS: MapBlock[] = [
  block('cabinet', 0, 0.6, 0, 2.4, 0, 3.4),
  block('cabinet', 0, 2.4, 0, 2.4, 0, 0.6),
  block('vending', 0, 1.6, 0, 2.4, 0, 0.8),
  block('vending', 0, 1.3, 0, 2.4, 0, 2.4),
  block('stall', 0, 1.4, 0, 2.4, 0, 2.8),
  block('planter', 0, 1.2, 3, 4.2, 0, 1.2),
  block('booth', 0, 2.6, 0, 2.4, 0, 2),
  block('van', -2, 0.2, 0, 2.4, 3, 7.6),
];

describe('a block finish and paint (M34f)', () => {
  it('draws a finished wall in its finish under its coping, and a finished prop as one box in its finish', () => {
    const wall = block('wall', 0, 0.3, 0, 3, 0, 4, { finish: 'plaster' });
    expect(blockPieces(wall, [wall]).map((p) => p.texture)).toEqual(['plaster', 'concrete']);
    const crate = block('crate', 0, 1.2, 0, 1.2, 0, 1.2, { finish: 'cladding' });
    const pieces = blockPieces(crate, [crate]);
    expect(pieces).toHaveLength(1); // no pallet, no planks
    expect(pieces[0]!.texture).toBe('cladding');
    expect(pieces[0]!.box).toEqual({ min: [0, 0, 0], max: [1.2, 1.2, 1.2] });
  });

  it('puts the finish only on top of a raised floor, with a plastered ceiling under it; the ground is its finish all through', () => {
    const slab = block('floor', 0, 4, 2.7, 3, 0, 4, { finish: 'tiles' });
    const [ceiling, top] = blockPieces(slab, [slab]);
    expect(ceiling!.texture).toBe('plaster');
    expect(top!.texture).toBe('tiles');
    expect(top!.box.max[1]).toBe(3);
    expect(top!.box.min[1]).toBeCloseTo(3 - SURFACES.ceiling.depth, 9);
    expect(ceiling!.box.max[1]).toBe(top!.box.min[1]);
    expect(ceiling!.box.min[1]).toBe(2.7);
    const road = block('floor', 0, 4, -0.5, 0, 0, 4, { finish: 'asphalt' });
    expect(blockPieces(road, [road]).map((p) => p.texture)).toEqual(['asphalt']);
  });

  it('paints a block its paint, whatever its kind palette says', () => {
    expect(blockTint(block('wall', 0, 1, 0, 1, 0, 1, { paint: 0x123456 }))).toBe(0x123456);
    expect(blockTint(block('vending', 0, 1, 0, 1, 0, 1, { paint: 0xabcdef }))).toBe(0xabcdef);
  });

  it('asks for the textures a finished or city map draws, and none of them on a map without', () => {
    const city: MapData = { ...OPEN_FIELD, blocks: [...OPEN_FIELD.blocks, block('floor', 0, 4, 2.7, 3, 0, 4, { finish: 'tiles' }), ...PROPS] };
    const ids = new Set(texturesFor(city));
    for (const id of ['tiles', 'plaster', 'glass', 'planks'] as const) expect(ids.has(id), id).toBe(true);
    for (const map of [DEPOT, WOODLAND]) {
      const own = texturesFor(map);
      for (const id of ['plaster', 'cladding', 'tiles', 'asphalt', 'paving', 'glass'] as const) expect(own, `${map.name} ${id}`).not.toContain(id);
      expect(map.blocks.some((b) => b.finish !== undefined || b.paint !== undefined || isCityProp(b.kind)), map.name).toBe(false);
    }
  });

  it('builds a finished city into meshes, one per surface, with no surface left undrawn', () => {
    const city: MapData = { ...OPEN_FIELD, blocks: [...OPEN_FIELD.blocks, block('wall', 0, 0.3, 0, 3, 0, 4, { finish: 'cladding', paint: 0xc0b4ea }), ...PROPS] };
    const group = buildMapMeshes(city, stubTextures(texturesFor(city)), LOOK, null);
    const names = group.children.map((m) => m.name);
    for (const id of ['cladding', 'glass', 'barrier', 'planks']) expect(names.some((n) => n.startsWith(`map-${id}`)), id).toBe(true);
  });

  it('draws look-only decor as blocks are, with its textures, without it among the blocks play reads', () => {
    const road = block('floor', 0, 4, -0.05, 0.005, 0, 4, { finish: 'asphalt' });
    const plain = buildMapMeshes(OPEN_FIELD, stubTextures(texturesFor(OPEN_FIELD)), LOOK, null);
    const withRoad: MapData = { ...OPEN_FIELD, decor: [road] };
    expect(texturesFor(withRoad)).toContain('asphalt');
    expect(texturesFor(OPEN_FIELD)).not.toContain('asphalt');
    const group = buildMapMeshes(withRoad, stubTextures(texturesFor(withRoad)), LOOK, null);
    expect(group.children.map((m) => m.name).filter((n) => n.startsWith('map-asphalt'))).toHaveLength(1);
    expect(group.children.length).toBe(plain.children.length + 1);
    expect(withRoad.blocks).toBe(OPEN_FIELD.blocks);
  });
});

describe('the city props (M34f)', () => {
  it('stays inside its block: every piece', () => {
    for (const p of PROPS) {
      const out: Piece[] = [];
      cityPropPieces(p as MapBlock & { kind: 'van' }, new THREE.Color(1, 1, 1), out);
      expect(out.length, p.kind).toBeGreaterThan(1);
      const box: Piece['box'] = { min: [p.center.x - p.size.x / 2, p.center.y - p.size.y / 2, p.center.z - p.size.z / 2], max: [p.center.x + p.size.x / 2, p.center.y + p.size.y / 2, p.center.z + p.size.z / 2] };
      for (const piece of out) {
        expect(inBox(piece.box.min, box), `${p.kind} piece min`).toBe(true);
        expect(inBox(piece.box.max, box), `${p.kind} piece max`).toBe(true);
        for (const a of [0, 1, 2]) expect(piece.box.max[a]!, `${p.kind} piece has size`).toBeGreaterThan(piece.box.min[a]!);
      }
    }
  });

  it('is solid to its bounds: every face is drawn no more than CITY_PROPS.inset in from where it stops BBs', () => {
    const k = CITY_PROPS.inset + 1e-3;
    for (const p of PROPS) {
      const out: Piece[] = [];
      cityPropPieces(p as MapBlock & { kind: 'van' }, new THREE.Color(1, 1, 1), out);
      const min = [p.center.x - p.size.x / 2, p.center.y - p.size.y / 2, p.center.z - p.size.z / 2];
      const max = [p.center.x + p.size.x / 2, p.center.y + p.size.y / 2, p.center.z + p.size.z / 2];
      // Every face but the bottom, sampled on a grid clear of its edges (where the next face takes over).
      for (const axis of [0, 1, 2]) {
        for (const side of axis === 1 ? [1] : [-1, 1]) {
          const [u, v] = [0, 1, 2].filter((a) => a !== axis) as [number, number];
          for (let i = 1; i < 10; i++) {
            for (let j = 1; j < 10; j++) {
              const q = [0, 0, 0];
              q[u] = min[u]! + ((max[u]! - min[u]!) * i) / 10;
              q[v] = min[v]! + ((max[v]! - min[v]!) * j) / 10;
              q[axis] = side > 0 ? max[axis]! - k : min[axis]! + k;
              expect(
                out.some((piece) => inBox(q, piece.box)),
                `${p.kind} face ${axis}${side > 0 ? '+' : '-'} at ${q.map((x) => x.toFixed(2))}`,
              ).toBe(true);
            }
          }
        }
      }
    }
  });

  it('lights its screens and windows by Night: a screen per arcade cabinet on each long face, a window each side of a vending machine', () => {
    const row = PROPS[0]!; // 3.4 m long: four cabinets
    const screens = propSigns(row);
    expect(screens).toHaveLength(2 * Math.round(3.4 / CITY_PROPS.cabinet.width));
    expect(new Set(screens.map((s) => s.facing))).toEqual(new Set(['-x', '+x']));
    for (const s of screens) {
      expect(s.kind).toBe('window');
      expect(Math.abs(s.centre.x - row.center.x)).toBeCloseTo(row.size.x / 2, 9); // on the face
    }
    const vending = propSigns(PROPS[2]!);
    expect(vending.map((s) => s.facing).sort()).toEqual(['+z', '-z']);
    expect(propSigns(PROPS[4]!)).toEqual([]); // a stall has no screen
    expect(propSigns(block('crate', 0, 1, 0, 1, 0, 1))).toEqual([]);
  });
});

describe('painted markings and the props among the signs (M34f)', () => {
  const FLAT: MapSign = { centre: vec3(2, 0, -3), width: 0.5, height: 2, facing: '+y', colour: 0xffffff, kind: 'paint' };

  it('lays a flat marking on its floor, a hair above it, facing up, width along x and height along z', () => {
    const geo = buildSignGeometry([FLAT], true);
    const pos = geo.getAttribute('position');
    const nor = geo.getAttribute('normal');
    const box = new THREE.Box3().setFromBufferAttribute(pos as THREE.BufferAttribute);
    expect(box.min.y).toBeCloseTo(SIGNS.offset, 9);
    expect(box.max.y).toBeCloseTo(SIGNS.offset, 9);
    expect([box.min.x, box.max.x, box.min.z, box.max.z]).toEqual([1.75, 2.25, -4, -2].map((v) => expect.closeTo(v, 6)));
    for (let i = 0; i < 4; i++) expect(nor.getY(i)).toBe(1);
    // Wound counter-clockwise seen from above.
    const [a, b, c] = [0, 1, 2].map((t) => new THREE.Vector3().fromBufferAttribute(pos, geo.index!.getX(t)));
    expect(b!.clone().sub(a!).cross(c!.clone().sub(a!)).y).toBeGreaterThan(0);
  });

  it('draws markings as their own Lambert mesh by Day and Night, never glowing, taking shadows; the props screens join the signs', () => {
    const vending = block('vending', 0, 1.6, 0, 2.4, 4, 4.8);
    const street: MapData = { ...OPEN_FIELD, blocks: [...OPEN_FIELD.blocks, vending], signs: [FLAT] };
    expect(mapSignsOf(street)).toHaveLength(3);
    for (const night of [true, false]) {
      const scene = new THREE.Scene();
      const signs = addMapSigns(scene, street, night);
      const paint = scene.getObjectByName('map-paint') as THREE.Mesh;
      expect(paint.material instanceof THREE.MeshLambertMaterial).toBe(true);
      expect(paint.receiveShadow).toBe(true);
      expect(paint.geometry.getAttribute('position').count).toBe(4);
      const glow = scene.getObjectByName('map-signs') as THREE.Mesh;
      expect(glow.geometry.getAttribute('position').count).toBe(8); // the vending machine's two windows
      expect(glow.material instanceof THREE.MeshBasicMaterial).toBe(night);
      signs.dispose();
      expect(scene.children).toHaveLength(0);
    }
  });

  it('leaves hazard chevrons off a finished rail', () => {
    const rail = block('barrier', -2, 2, 0, 1, 0, 0.15);
    const plain: MapData = { ...OPEN_FIELD, blocks: [...OPEN_FIELD.blocks, rail] };
    const steel: MapData = { ...OPEN_FIELD, blocks: [...OPEN_FIELD.blocks, { ...rail, finish: 'cladding' }] };
    expect(decalQuads(plain).length).toBeGreaterThan(decalQuads(steel).length);
  });
});
