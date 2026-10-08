import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { DRESSING } from '../config/dressing';
import { QUALITY, SURFACES } from '../config/render';
import { buildMapMeshes, disposeMapMeshes, mapLookOf, texturesFor } from '../render/mapMeshes';
import { placeDressing } from '../render/mapDressing';
import { skylineGeometries } from '../render/skyline';
import type { SurfaceTextures } from '../render/proceduralTextures';
import { DEPOT } from './depot';
import { MAPS } from './maps';
import type { MapBlock, MapData, NeonSign } from './mapTypes';
import { NEON_HEIGHTS } from './neonHeights';
import { neonPlate } from '../render/neonDressing';
import { terrainHeightAt } from './terrain';
import { WOODLAND } from './woodland';

/**
 * G9 QA: the adversarial half of the placement tests. Where map/woodlandDressing.test.ts and neonHeightsDressing.test.ts
 * check the placer against its own helpers (clearOfPlay, frontRect, floorUnder), this file re-derives every rule from the
 * raw map data, so a wrong rule in the helper cannot also pass its own test. Bugs found are pinned with `it.fails`: the
 * test states what must be true, fails today, and turns green (so the suite flags it) when the worker fixes the bug.
 */

/** A Node module by name, which the app's tsconfig (no Node types) does not resolve as a literal. */
const loadNode = (name: string): Promise<unknown> => import(/* @vite-ignore */ `node:${name}`);

// --- Node's fs without Node's types (the app's tsconfig does not load them) ---------------------------------------------
type Fs = { readFileSync(p: string, e: 'utf8'): string; readdirSync(p: string, o: { withFileTypes: true }): { name: string; isDirectory(): boolean }[]; existsSync(p: string): boolean };
let fs: Fs;
beforeAll(async () => {
  fs = (await loadNode('fs')) as unknown as Fs;
});
const ROOT = new URL('../', import.meta.url).pathname;

// --- Raw geometry, written again here on purpose ---------------------------------------------------------------------
type Rect = readonly [number, number, number, number];
interface Piece {
  x: number;
  y: number;
  z: number;
  axis: 0 | 2;
  sign: 1 | -1;
  along: number;
  out: number;
  height: number;
  kind: string;
}
const rectOf = (p: Piece): Rect => {
  const hx = (p.axis === 0 ? p.out : p.along) / 2;
  const hz = (p.axis === 0 ? p.along : p.out) / 2;
  return [p.x - hx, p.x + hx, p.z - hz, p.z + hz];
};
const toRect = (x: number, z: number, r: Rect): number => Math.hypot(Math.max(r[0] - x, 0, x - r[1]), Math.max(r[2] - z, 0, z - r[3]));
/** Distance from a rectangle to a polyline, by walking it every 4 cm. */
function rectToPolyline(r: Rect, line: readonly { x: number; z: number }[]): number {
  let best = Infinity;
  for (let i = 0; i < line.length; i++) {
    const a = line[i]!;
    const b = line[i + 1] ?? a;
    const n = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / 0.04));
    for (let k = 0; k <= n; k++) best = Math.min(best, toRect(a.x + ((b.x - a.x) * k) / n, a.z + ((b.z - a.z) * k) / n, r));
  }
  return best;
}
const solid = (blocks: readonly MapBlock[]): MapBlock[] => blocks.filter((b) => b.kind !== 'floor' && b.kind !== 'ramp');
const lo = (b: MapBlock, i: 0 | 1 | 2): number => [b.center.x, b.center.y, b.center.z][i]! - [b.size.x, b.size.y, b.size.z][i]! / 2;
const hi = (b: MapBlock, i: 0 | 1 | 2): number => [b.center.x, b.center.y, b.center.z][i]! + [b.size.x, b.size.y, b.size.z][i]! / 2;
const overlapsPlan = (b: MapBlock, r: Rect): boolean => lo(b, 0) < r[1] && hi(b, 0) > r[0] && lo(b, 2) < r[3] && hi(b, 2) > r[2];

/** Every point play cares about: spawns, dead zones, the flag, and every Extraction spot (with an exit's radius). */
function playSpots(map: MapData): { x: number; z: number; radius: number }[] {
  const out: { x: number; z: number; radius: number }[] = [];
  for (const team of [...map.spawns, ...map.deadZones]) for (const s of team) out.push({ x: s.position.x, z: s.position.z, radius: 0 });
  if (map.flag) out.push({ x: map.flag.x, z: map.flag.z, radius: 0 });
  const e = map.extraction;
  if (e) {
    for (const i of e.insertions) for (const s of i.spawns) out.push({ x: s.position.x, z: s.position.z, radius: 0 });
    for (const x of e.exits) out.push({ x: x.position.x, z: x.position.z, radius: x.radius });
    for (const s of [...e.opponentStarts, ...e.cases, ...e.regens]) out.push({ x: s.position.x, z: s.position.z, radius: 0 });
  }
  return out;
}

const NEON = placeDressing(NEON_HEIGHTS);
const WOODS = placeDressing(WOODLAND);

/** The loose pieces of each map: Neon's litter and Woodland's fallen branches, twigs and logs. */
const LOOSE: readonly [string, MapData, Piece[], boolean][] = [
  // `whole`: a street's litter lies flush along a wall; a branch may be longer than the narrow trunk or log it leans on
  // (it lies on the ground and overhangs its end), so on Woodland only the piece's middle must have a face behind it.
  ['Neon Heights', NEON_HEIGHTS, NEON.junk, true],
  ['Woodland', WOODLAND, WOODS.fallen, false],
];

describe('G9 QA: loose pieces keep every rule, checked from the raw map (acceptance 2)', () => {
  for (const [name, map, pieces, whole] of LOOSE) {
    it(`${name}: no piece sits on a lane or at a spawn, dead zone, flag or Extraction spot (true distance to the rectangle)`, () => {
      expect(pieces.length).toBeGreaterThan(10);
      const spots = playSpots(map);
      let nearestLane = Infinity;
      for (const p of pieces) {
        const r = rectOf(p);
        for (const lane of map.lanes) nearestLane = Math.min(nearestLane, rectToPolyline(r, lane));
        for (const s of spots) expect(toRect(s.x, s.z, r), `${p.kind} at ${p.x.toFixed(2)}, ${p.z.toFixed(2)} by a spot`).toBeGreaterThanOrEqual(DRESSING.junk.pointClear + s.radius - 1e-9);
      }
      expect(nearestLane).toBeGreaterThanOrEqual(DRESSING.junk.laneClear - 1e-9);
    });

    it(`${name}: every piece is flush against a solid face along its whole back (no piece in a doorway or gap)`, () => {
      const walls = solid(map.blocks);
      for (const p of pieces) {
        const where = `${p.kind} at ${p.x.toFixed(2)}, ${p.z.toFixed(2)}`;
        const r = rectOf(p);
        // The back edge runs along the face; sample it every 10 cm, low (5 cm over the piece's foot) and at its top.
        const backAt = (p.axis === 0 ? p.x : p.z) - p.sign * (p.out / 2 + 0.04);
        const a0 = p.axis === 0 ? r[2] : r[0];
        const a1 = p.axis === 0 ? r[3] : r[1];
        const mid = (a0 + a1) / 2;
        for (let a = whole ? a0 + 0.01 : mid - 0.1; a <= (whole ? a1 : mid + 0.1); a += 0.1) {
          for (const y of [p.y + 0.05, p.y + p.height - 0.01]) {
            const backed = walls.some((b) => {
              const face = p.sign > 0 ? hi(b, p.axis) : lo(b, p.axis);
              const alongAxis: 0 | 2 = p.axis === 0 ? 2 : 0;
              // The face the piece leans on looks the way the piece faces: its outward normal is the piece's `sign`.
              return Math.abs(face - backAt) < 0.06 && a >= lo(b, alongAxis) - 1e-6 && a <= hi(b, alongAxis) + 1e-6 && y >= lo(b, 1) - 1e-6 && y <= hi(b, 1) + 1e-6;
            });
            expect(backed, `${where}: back edge at ${a.toFixed(2)}, height ${y.toFixed(2)} has a face behind it`).toBe(true);
          }
        }
      }
    });

    it(`${name}: no piece is inside, or under, any block, and the 1.6 m in front of it holds nothing at body height`, () => {
      for (const p of pieces) {
        const where = `${p.kind} at ${p.x.toFixed(2)}, ${p.z.toFixed(2)}`;
        const r = rectOf(p);
        for (const b of map.blocks) {
          if (!overlapsPlan(b, r)) continue;
          if (b.kind === 'floor') {
            // A floor is the ground it lies on, or a roof over it: never one above.
            expect(lo(b, 1), `${where}: a floor over it`).toBeLessThanOrEqual(p.y + 0.01);
            continue;
          }
          if (b.kind === 'ramp') continue;
          expect(hi(b, 1) <= p.y + 0.02 || lo(b, 1) >= p.y + 3, `${where}: inside or under a ${b.kind}`).toBe(true);
          expect(lo(b, 1) > p.y + 0.3 ? 'over' : 'clear', `${where}: a ${b.kind} over it`).toBe('clear');
        }
        const reach = DRESSING.junk.openFront;
        const front: Rect =
          p.axis === 0
            ? p.sign > 0
              ? [r[1], r[1] + reach, r[2], r[3]]
              : [r[0] - reach, r[0], r[2], r[3]]
            : p.sign > 0
              ? [r[0], r[1], r[3], r[3] + reach]
              : [r[0], r[1], r[2] - reach, r[2]];
        for (const b of solid(map.blocks)) {
          const meets = overlapsPlan(b, front) && hi(b, 1) > p.y + 0.05 && lo(b, 1) < p.y + 1.8;
          expect(meets, `${where}: a ${b.kind} within ${reach} m in front`).toBe(false);
        }
      }
    });

    it(`${name}: pieces keep 0.3 m apart and none lies in another's front`, () => {
      for (const [i, p] of pieces.entries()) {
        const r = rectOf(p);
        for (const q of pieces.slice(i + 1)) {
          const s = rectOf(q);
          const gap = Math.max(s[0] - r[1], r[0] - s[1], s[2] - r[3], r[2] - s[3]);
          expect(gap, `${p.kind} and ${q.kind}`).toBeGreaterThanOrEqual(DRESSING.junk.gap - 1e-9);
        }
      }
    });
  }
});

// --- Neon Heights' signs and posters -------------------------------------------------------------------------------

/** How many of the nine points (3 × 3) over a sign's plate lie against a wall face on the side the sign faces. */
function backing(map: MapData, s: NeonSign): number {
  const [w, h] = neonPlate(s);
  const axis: 0 | 2 = s.facing.endsWith('x') ? 0 : 2;
  const sign = s.facing.startsWith('+') ? 1 : -1;
  const along: 0 | 2 = axis === 0 ? 2 : 0;
  const c = [s.centre.x, s.centre.y, s.centre.z];
  let backed = 0;
  for (const du of [-0.5, 0, 0.5]) {
    for (const dv of [-0.5, 0, 0.5]) {
      const pt = [...c];
      pt[along] = c[along]! + du * w;
      pt[1] = c[1]! + dv * h;
      const ok = solid(map.blocks).some((b) => {
        const face = sign > 0 ? hi(b, axis) : lo(b, axis);
        return Math.abs(face - pt[axis]!) <= 0.12 && pt[along]! >= lo(b, along) - 0.01 && pt[along]! <= hi(b, along) + 0.01 && pt[1]! >= lo(b, 1) - 0.01 && pt[1]! <= hi(b, 1) + 0.01;
      });
      if (ok) backed++;
    }
  }
  return backed;
}
const nameOf = (s: NeonSign): string => `${s.text ?? s.emblem} at ${s.centre.x}, ${s.centre.y}, ${s.centre.z}`;

describe('G9 QA: Neon Heights’ neon signs hang on walls (acceptance 2: nothing floats)', () => {
  it('control: the checker sees a sign that is on its wall (the Noodle Alley, Hotel, Taxi, Kiosk, Parts and Bar signs)', () => {
    const ok = NEON.neon.filter((s) => ['NOODLE', 'HOTEL', 'TAXI', 'KIOSK', 'PARTS', 'BAR'].includes(s.text ?? ''));
    expect(ok.length).toBe(6);
    for (const s of ok) expect(backing(NEON_HEIGHTS, s), nameOf(s)).toBe(9);
  });

  // BUG G9-QA-1: the bowl (Noodle Alley), LANE, the Drone Dock arrow and DOCK 4 hang 0.2 to 0.3 m in front of the wall they
  // are meant for (their plan z is 10.2, 4.7, 14.8 and 14.8 where the faces are at 10.0, 5.0, 15.0 and 15.0, while the
  // signs that work sit on the face itself), so nothing is behind any of the nine points of their plate.
  it.fails('BUG: every sign has a wall face within 12 cm behind its plate (the bowl, LANE, the arrow and DOCK 4 float off their walls)', () => {
    const floating = NEON.neon.filter((s) => backing(NEON_HEIGHTS, s) === 0).map(nameOf);
    expect(floating).toEqual([]);
  });

  // BUG G9-QA-2: PLAY overhangs the end of its wall into the opening beside it (a third of the plate has no wall behind
  // it) and the cup hangs from the bottom edge of a lintel (two thirds of the plate is in the air).
  it.fails('BUG: every sign’s whole plate is on wall (PLAY and the cup hang half off the edge of theirs)', () => {
    const partial = NEON.neon.filter((s) => backing(NEON_HEIGHTS, s) > 0 && backing(NEON_HEIGHTS, s) < 9).map((s) => `${nameOf(s)}: ${backing(NEON_HEIGHTS, s)}/9`);
    expect(partial).toEqual([]);
  });
});

describe('G9 QA: Neon Heights’ posters stay on the wall they are pasted to', () => {
  it('has every corner of every poster against a wall face, with nothing within 30 cm in front of it', () => {
    expect(NEON.posters.length).toBeGreaterThan(10);
    const walls = solid(NEON_HEIGHTS.blocks);
    for (const q of NEON.posters) {
      const along: 0 | 2 = q.axis === 0 ? 2 : 0;
      for (const du of [-0.5, 0.5]) {
        for (const dv of [-0.5, 0.5]) {
          const pt = [...q.centre];
          pt[along] = q.centre[along] + du * q.width;
          pt[1] = q.centre[1] + dv * q.height;
          const ok = walls.some((b) => {
            const face = q.sign > 0 ? hi(b, q.axis) : lo(b, q.axis);
            return Math.abs(face - pt[q.axis]!) < 0.08 && pt[along]! >= lo(b, along) - 0.01 && pt[along]! <= hi(b, along) + 0.01 && pt[1]! >= lo(b, 1) - 0.01 && pt[1]! <= hi(b, 1) + 0.01;
          });
          expect(ok, `poster at ${q.centre.map((v) => v.toFixed(2)).join(', ')} corner ${du},${dv}`).toBe(true);
        }
      }
      const inFront = walls.some((b) => {
        const near = q.sign > 0 ? [hi(b, q.axis), hi(b, q.axis) + 0.3] : [lo(b, q.axis) - 0.3, lo(b, q.axis)];
        void near;
        // A block in the 30 cm slab out from the poster, over its extent, that is not the wall it is pasted to.
        const slab = q.sign > 0 ? [q.centre[q.axis] + 0.02, q.centre[q.axis] + 0.3] : [q.centre[q.axis] - 0.3, q.centre[q.axis] - 0.02];
        return lo(b, q.axis) < slab[1]! && hi(b, q.axis) > slab[0]! && lo(b, along) < q.centre[along] + q.width / 2 && hi(b, along) > q.centre[along] - q.width / 2 && lo(b, 1) < q.centre[1] + q.height / 2 && hi(b, 1) > q.centre[1] - q.height / 2;
      });
      expect(inFront, `poster at ${q.centre.map((v) => v.toFixed(2)).join(', ')} has something in front`).toBe(false);
    }
  });
});

// --- The background: nothing of it stands in the field, nothing of it hides a player ------------------------------------

/** The skyline's vertices that stand in the field's footprint (plus a margin) more than 5 cm over the ground. */
function skylineInField(map: MapData, margin: number): { piece: number; kind: string; worst: number; vertices: number }[] {
  const sky = map.dressing!.skyline!;
  const t = map.terrain;
  const floors = map.blocks.filter((b) => b.kind === 'floor');
  const box = t
    ? { x0: t.minX, x1: t.minX + t.cols * t.cell, z0: t.minZ, z1: t.minZ + t.rows * t.cell }
    : { x0: Math.min(...floors.map((b) => lo(b, 0))), x1: Math.max(...floors.map((b) => hi(b, 0))), z0: Math.min(...floors.map((b) => lo(b, 2))), z1: Math.max(...floors.map((b) => hi(b, 2))) };
  const out: { piece: number; kind: string; worst: number; vertices: number }[] = [];
  sky.forEach((piece, i) => {
    let worst = 0;
    let vertices = 0;
    for (const g of skylineGeometries([piece], { x: 0, z: 0 })) {
      const pos = g.getAttribute('position');
      for (let k = 0; k < pos.count; k++) {
        const x = pos.getX(k);
        const z = pos.getZ(k);
        if (x < box.x0 - margin || x > box.x1 + margin || z < box.z0 - margin || z > box.z1 + margin) continue;
        const above = pos.getY(k) - (t ? (terrainHeightAt(t, x, z) ?? 0) : 0);
        if (above > 0.05) {
          vertices++;
          worst = Math.max(worst, above);
        }
      }
      g.dispose();
    }
    if (vertices > 0) out.push({ piece: i, kind: piece.kind, worst, vertices });
  });
  return out;
}

/** How many cross-team spawn-to-spawn lines of sight (eye to chest) pass through the skyline's meshes. */
function skylineBlocksSight(map: MapData): { blocked: number; pairs: number } {
  const geos = skylineGeometries(map.dressing!.skyline!, { x: 0, z: 0 });
  const mesh = new THREE.Mesh(mergeGeometries(geos)!, new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }));
  mesh.updateMatrixWorld();
  const ray = new THREE.Raycaster();
  const ground = (x: number, z: number): number => (map.terrain ? (terrainHeightAt(map.terrain, x, z) ?? 0) : 0);
  let blocked = 0;
  let pairs = 0;
  for (const a of map.spawns[0]) {
    for (const b of map.spawns[1]) {
      const from = new THREE.Vector3(a.position.x, ground(a.position.x, a.position.z) + 1.6, a.position.z);
      const to = new THREE.Vector3(b.position.x, ground(b.position.x, b.position.z) + 1.0, b.position.z);
      const d = to.clone().sub(from);
      ray.set(from, d.clone().normalize());
      ray.far = d.length();
      pairs++;
      if (ray.intersectObject(mesh).length > 0) blocked++;
    }
  }
  for (const g of geos) g.dispose();
  mesh.geometry.dispose();
  return { blocked, pairs };
}

describe('G9 QA: the background stays out of the field and hides nobody (acceptance 2)', () => {
  it('control: Neon Heights’ towers stand wholly outside its walls, and block no line between the teams', () => {
    expect(skylineInField(NEON_HEIGHTS, 0)).toEqual([]);
    expect(skylineBlocksSight(NEON_HEIGHTS)).toEqual({ blocked: 0, pairs: 25 });
  });

  it('control: Woodland’s treelines and its four far hills stand outside the field', () => {
    const intruders = skylineInField(WOODLAND, 2).filter((v) => v.kind !== 'hill' || v.piece !== 4);
    expect(intruders).toEqual([]);
  });

  // BUG G9-QA-3 (severe): Woodland's east hill ({ x: wx(170), width: 150, height: 26 }) is centred 110 m east with a
  // 75 m radius, so its dome reaches 75 m west of its middle, to x = 35: it stands 14 m high inside the field over the
  // fort and the East camp, a green wall that every line of sight from the west half of the field runs into.
  it.fails('BUG: no part of the skyline stands in Woodland’s field above the ground (the east hill is 14 m high at the fence)', () => {
    expect(skylineInField(WOODLAND, 0)).toEqual([]);
  });

  it.fails('BUG: the skyline hides no Woodland player: no West-to-East spawn line of sight passes through a hill (all 25 do)', () => {
    const { blocked } = skylineBlocksSight(WOODLAND);
    expect(blocked).toBe(0);
  });
});

// --- Placement is deterministic; the dressing never writes to the map ------------------------------------------------

function fnv(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 0x01000193) >>> 0;
  return h.toString(16).padStart(8, '0');
}
/** A whole map (typed arrays as arrays) as a hash, leaving out the listed keys. */
const fingerprint = (value: unknown, skip: readonly string[] = []): string =>
  fnv(JSON.stringify(value, (k, v) => (skip.includes(k) ? undefined : ArrayBuffer.isView(v) ? Array.from(v as unknown as ArrayLike<number>) : v)));

const stub = (ids: readonly (keyof typeof SURFACES.worldSize)[]): SurfaceTextures =>
  Object.fromEntries(ids.map((id) => [id, { texture: Object.assign(new THREE.Texture(), { name: id }), worldSize: SURFACES.worldSize[id], mean: 1 }])) as unknown as SurfaceTextures;
const meshHash = (g: THREE.Object3D): string => {
  const parts: string[] = [];
  g.traverse((o) => {
    if (!(o instanceof THREE.Mesh)) return;
    const pos = o.geometry.getAttribute('position');
    const col = o.geometry.getAttribute('color');
    parts.push(`${o.name}:${pos.count}:${fnv(Array.from(pos.array as ArrayLike<number>, (v) => Math.round(v * 4096)).join(','))}:${col ? fnv(Array.from(col.array as ArrayLike<number>, (v) => Math.round(v * 4096)).join(',')) : ''}`);
  });
  return parts.join('|');
};

describe('G9 QA: the maps are exactly what main shipped, and dressing code writes nothing to them', () => {
  // Pinned from origin/main in a clean checkout of it (the same fingerprint run there): every field of the map except
  // its dressing, typed arrays included. If a G9 change moved a block, a lane, a spawn or a terrain vertex, one of these
  // changes.
  it('Woodland, Neon Heights and Depot have the data they had on main (blocks, lanes, spawns, terrain, bushes, extraction)', () => {
    expect(fingerprint(WOODLAND, ['dressing'])).toBe('e15bc4d6');
    expect(fingerprint(NEON_HEIGHTS, ['dressing'])).toBe('bc4721b8');
    expect(fingerprint(WOODLAND.blocks)).toBe('7358a13e');
    expect(fingerprint(NEON_HEIGHTS.blocks)).toBe('4fae8481');
    // Depot's dressing too: "Depot draws exactly as it does on main".
    expect(fingerprint(DEPOT)).toBe('b1abf8a0');
  });

  it('placing, building, drawing the horizon and running the effects writes nothing into either map', async () => {
    vi.stubGlobal('document', { createElement: () => ({ width: 0, height: 0, getContext: () => null }) });
    const { DressingEffects } = await import('../render/dressingEffects');
    const { addAtmosphere } = await import('../render/atmosphere');
    const { resolveLighting } = await import('../render/lightingPreset');
    try {
      const before = [WOODLAND, NEON_HEIGHTS, DEPOT].map((m) => fingerprint(m));
      for (const map of [WOODLAND, NEON_HEIGHTS, DEPOT]) {
        for (const q of [QUALITY.low, QUALITY.medium, QUALITY.high]) {
          placeDressing(map);
          const g = buildMapMeshes(map, stub(texturesFor(map)), { ...mapLookOf(q, null), relief: false }, () => new THREE.Texture());
          const scene = new THREE.Scene();
          const a = addAtmosphere(scene, new THREE.Vector3(), new THREE.Vector3(0.4, 0.8, 0.3).normalize(), q, new THREE.Box3(new THREE.Vector3(-60, -0.5, -40), new THREE.Vector3(60, 8, 40)), resolveLighting(map), map.dressing?.skyline);
          const fx = new DressingEffects(scene, map);
          fx.setNight(true);
          fx.setMapGroup(g);
          fx.setQuality(q);
          for (let i = 0; i < 30; i++) fx.update(0.1, new THREE.PerspectiveCamera(), { x: 1, z: 1 });
          fx.dispose();
          a.dispose();
          disposeMapMeshes(g);
        }
      }
      expect([WOODLAND, NEON_HEIGHTS, DEPOT].map((m) => fingerprint(m))).toEqual(before);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

/** Math.random throws, except for Three.js's own object ids (UUIDs), which nothing the dressing draws depends on. */
function forbidRandom(): void {
  const real = Math.random.bind(Math);
  vi.spyOn(Math, 'random').mockImplementation(() => {
    if (!/node_modules\/three\//.test(new Error().stack ?? '')) throw new Error('Math.random used by the dressing');
    return real();
  });
}

describe('G9 QA: placement uses no clock and no Math.random, and is the same in any order', () => {
  afterEach(() => vi.restoreAllMocks());

  it('places both maps with Math.random and the clock forbidden, and gets the same layout back in the other order', () => {
    const first = [placeDressing(WOODLAND), placeDressing(NEON_HEIGHTS)];
    forbidRandom();
    vi.spyOn(Date, 'now').mockImplementation(() => {
      throw new Error('Date.now used by the dressing');
    });
    const second = [placeDressing(NEON_HEIGHTS), placeDressing(WOODLAND)];
    expect(second[1]).toEqual(first[0]);
    expect(second[0]).toEqual(first[1]);
    // The skyline's geometry, too.
    const a = fingerprint(skylineGeometries(WOODLAND.dressing!.skyline!, { x: 0, z: 0 }).map((g) => Array.from(g.getAttribute('position').array)));
    const b = fingerprint(skylineGeometries(WOODLAND.dressing!.skyline!, { x: 0, z: 0 }).map((g) => Array.from(g.getAttribute('position').array)));
    expect(a).toBe(b);
  });

  it('builds the same meshes (vertex for vertex, colour for colour) every time, Math.random forbidden', () => {
    vi.stubGlobal('document', { createElement: () => ({ width: 0, height: 0, getContext: () => null }) });
    forbidRandom();
    try {
      for (const map of [WOODLAND, NEON_HEIGHTS]) {
        const build = (): string => {
          const g = buildMapMeshes(map, stub(texturesFor(map)), { ...mapLookOf(QUALITY.high, null), relief: false }, () => new THREE.Texture());
          const h = meshHash(g);
          disposeMapMeshes(g);
          return h;
        };
        expect(build()).toBe(build());
      }
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('every seed changes the placement of its map: three seeds, three different layouts, on both maps', () => {
    for (const map of [WOODLAND, NEON_HEIGHTS]) {
      const seen = new Set<string>();
      for (const d of [0, 1, 2]) seen.add(fingerprint(placeDressing({ ...map, dressing: { ...map.dressing!, seed: map.dressing!.seed + d } })));
      expect(seen.size).toBe(3);
    }
  });
});

// --- Both maps stay Dev content ---------------------------------------------------------------------------------------

/** Every file the static `import`/`export … from` statements of `entry` reach (dynamic import() is a chunk, not a dependency). */
function staticClosure(entry: string): Set<string> {
  const seen = new Set<string>();
  const queue = [entry];
  while (queue.length > 0) {
    const file = queue.pop()!;
    if (seen.has(file) || !fs.existsSync(file)) continue;
    seen.add(file);
    const text = fs.readFileSync(file, 'utf8');
    for (const m of text.matchAll(/(?:^|\n)\s*(?:import|export)\s[^;]*?from\s+['"](\.[^'"]+)['"]|(?:^|\n)\s*import\s+['"](\.[^'"]+)['"]/g)) {
      const spec = (m[1] ?? m[2])!;
      const base = new URL(spec, `file://${file}`).pathname;
      for (const cand of [`${base}.ts`, `${base}/index.ts`, base]) {
        if (fs.existsSync(cand) && cand.endsWith('.ts')) {
          queue.push(cand);
          break;
        }
      }
    }
  }
  return seen;
}

describe('G9 QA: Woodland and Neon Heights stay Dev content (acceptance 5)', () => {
  it('lists them as dev and Depot alone as public', () => {
    expect(MAPS.map((m) => [m.id, m.tag])).toEqual([
      ['depot', 'public'],
      ['woodland', 'dev'],
      ['neonHeights', 'dev'],
    ]);
  });

  it('keeps their data, and so their dressing data, out of the public bundle: nothing main.ts imports statically reaches it', () => {
    const reached = [...staticClosure(`${ROOT}main.ts`)].map((f) => f.slice(ROOT.length));
    expect(reached.length).toBeGreaterThan(100);
    for (const banned of ['map/woodland.ts', 'map/neonHeights.ts', 'map/woodlandDressing.ts', 'map/neonHeightsDressing.ts', 'map/devMaps.ts', 'map/woodlandExtraction.ts', 'map/neonHeightsExtraction.ts']) {
      expect(reached, banned).not.toContain(banned);
    }
    // Depot's data is public, and is in.
    expect(reached).toContain('map/depot.ts');
  });

  it('is read by nothing that decides play: no dressing in sim, ai, physics, nav, input, stats or the pool', () => {
    const offenders: string[] = [];
    const walk = (dir: string): void => {
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const path = `${dir}/${e.name}`;
        if (e.isDirectory()) walk(path);
        else if (e.name.endsWith('.ts') && !e.name.endsWith('.test.ts') && !/testSupport|Support\.ts$/.test(e.name)) {
          const text = fs.readFileSync(path, 'utf8');
          if (/\.dressing\b|dressing/i.test(text.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, ''))) offenders.push(path.slice(ROOT.length));
        }
      }
    };
    for (const d of ['sim', 'ai', 'physics', 'nav', 'input', 'stats', 'pool']) if (fs.existsSync(`${ROOT}${d}`)) walk(`${ROOT}${d}`);
    expect(offenders).toEqual([]);
  });
});
