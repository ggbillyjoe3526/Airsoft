import * as THREE from 'three';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { FIXTURES, GROUND_LOOK, LIGHTING_PRESETS, NATURE_SHAPES, NIGHT_SKY, QUALITY, QUALITY_PRESETS, RENDER, SURFACES, type SurfaceTextureId, TERRAIN_LOOK } from '../config/render';
import { DEPOT } from '../map/depot';
import { buildGroundGrid, groundAt, groundUnderTrees, onPatch } from '../map/groundSurfaces';
import type { GroundSurface, MapBlock, MapData } from '../map/mapTypes';
import { NEON_HEIGHTS } from '../map/neonHeights';
import { RANGE_MAP } from '../map/range';
import { terrainHeightAt } from '../map/terrain';
import { WOODLAND } from '../map/woodland';
import { buildCanopyMesh, crownOf } from './canopyMeshes';
import { emptyBuffers, type Buffers } from './cuboidMesh';
import { addLighting } from './lighting';
import { buildLightFixtures, flameGeometry, flicker, flickerSeed } from './lightFixtures';
import { buildMapMeshes, disposeMapMeshes, mapLookOf, texturesFor } from './mapMeshes';
import { appendNatureShape, appendPebbles, isNatureKind, type NaturePaint } from './natureShapes';
import { addSurfaceTextures, CORE_SURFACES, disposeSurfaceTextures, type SurfaceTextures } from './proceduralTextures';

/**
 * M33i QA: the woodland look against its acceptance criteria, filling the gaps the worker's tests leave: every block of
 * Woodland (not one per size) inside its box and within 8 cm of it, the open feet buried; drawing-only solids kept low;
 * the canopy built from tree blocks only; Depot's texture set and GPU memory; the day building no sky or fixtures and
 * the night a moon and stars on every quality; the flames' GLSL flicker the same curve as the pool light's; and every
 * new mesh, texture and material freed when a session ends.
 */

const terrain = WOODLAND.terrain!;
const EPS = 1e-6;

/** Stand-in surface textures (canvases need a browser): only the world size matters to the geometry. */
const stubTextures = (ids: readonly SurfaceTextureId[]): SurfaceTextures =>
  Object.fromEntries(ids.map((id) => [id, { texture: Object.assign(new THREE.Texture(), { name: id }), worldSize: SURFACES.worldSize[id] }])) as unknown as SurfaceTextures;
const ALL_TEXTURES = stubTextures(Object.keys(SURFACES.worldSize) as SurfaceTextureId[]);

const paint = (): NaturePaint => ({ worldSize: 1.6, color: new THREE.Color(1, 1, 1), grimeFrom: 0 });

function shapeOf(block: MapBlock): Buffers {
  const buf = emptyBuffers();
  appendNatureShape(buf, block, paint(), null);
  return buf;
}

function triangles(buf: Buffers): THREE.Triangle[] {
  const v = (i: number) => new THREE.Vector3(buf.positions[i * 3], buf.positions[i * 3 + 1], buf.positions[i * 3 + 2]);
  const out: THREE.Triangle[] = [];
  for (let i = 0; i < buf.indices.length; i += 3) out.push(new THREE.Triangle(v(buf.indices[i]!), v(buf.indices[i + 1]!), v(buf.indices[i + 2]!)));
  return out;
}

/** An n × n grid of points on each face of the block's box but those `skip` names. */
function boxPoints(block: MapBlock, n: number, skip: readonly ('top' | 'bottom')[]): THREE.Vector3[] {
  const { center: c, size: s } = block;
  const h = [s.x / 2, s.y / 2, s.z / 2];
  const pts: THREE.Vector3[] = [];
  for (let axis = 0; axis < 3; axis++) {
    for (const sign of [-1, 1]) {
      if (axis === 1 && sign > 0 && skip.includes('top')) continue;
      if (axis === 1 && sign < 0 && skip.includes('bottom')) continue;
      const [u, v] = [(axis + 1) % 3, (axis + 2) % 3];
      for (let i = 0; i < n; i++) {
        for (let j = 0; j < n; j++) {
          const p = [0, 0, 0];
          p[axis] = sign * h[axis]!;
          p[u] = (-1 + (2 * i) / (n - 1)) * h[u]!;
          p[v] = (-1 + (2 * j) / (n - 1)) * h[v]!;
          pts.push(new THREE.Vector3(c.x + p[0]!, c.y + p[1]!, c.z + p[2]!));
        }
      }
    }
  }
  return pts;
}

function farthest(points: readonly THREE.Vector3[], tris: readonly THREE.Triangle[]): number {
  const q = new THREE.Vector3();
  let worst = 0;
  for (const p of points) {
    let best = Infinity;
    for (const t of tris) {
      best = Math.min(best, t.closestPointToPoint(p, q).distanceTo(p));
      if (best <= NATURE_SHAPES.maxGap * 0.5) break;
    }
    worst = Math.max(worst, best);
  }
  return worst;
}

const natureBlocks = WOODLAND.blocks.filter((b) => isNatureKind(b.kind));

describe('AC1: every tree, log and boulder on Woodland, not one per size (what you see is what stops you, to 8 cm)', () => {
  it('has every kind, in numbers (the checks below run over each block)', () => {
    const count = (k: string) => natureBlocks.filter((b) => b.kind === k).length;
    expect(count('tree')).toBeGreaterThan(100);
    expect(count('log')).toBeGreaterThan(20);
    expect(count('boulder')).toBeGreaterThan(10);
  });

  it('draws every vertex of every block inside that block’s box', () => {
    for (const b of natureBlocks) {
      const buf = shapeOf(b);
      expect(buf.positions.length, b.kind).toBeGreaterThan(0);
      for (let i = 0; i < buf.positions.length; i += 3) {
        const where = `${b.kind} at ${b.center.x.toFixed(2)}, ${b.center.z.toFixed(2)}`;
        expect(Math.abs(buf.positions[i]! - b.center.x), where).toBeLessThanOrEqual(b.size.x / 2 + EPS);
        expect(Math.abs(buf.positions[i + 1]! - b.center.y), where).toBeLessThanOrEqual(b.size.y / 2 + EPS);
        expect(Math.abs(buf.positions[i + 2]! - b.center.z), where).toBeLessThanOrEqual(b.size.z / 2 + EPS);
      }
    }
  });

  it('leaves no point of any block’s box over 8 cm from its shape, log bottoms included (boulders’ lumps vary by position)', () => {
    let worst = 0;
    for (const b of natureBlocks) {
      // A trunk's top is in its crown; trunk and boulder feet are buried (next test); a log's underside is drawn.
      const skip = b.kind === 'tree' ? (['top', 'bottom'] as const) : b.kind === 'boulder' ? (['bottom'] as const) : ([] as const);
      const gap = farthest(boxPoints(b, 13, skip), triangles(shapeOf(b)));
      worst = Math.max(worst, gap);
      expect(gap, `${b.kind} at ${b.center.x.toFixed(2)}, ${b.center.z.toFixed(2)}`).toBeLessThanOrEqual(NATURE_SHAPES.maxGap + EPS);
    }
    expect(worst).toBeGreaterThan(0.03);
  });

  it('buries the open feet of every trunk and boulder (nothing to see through, nothing invisible under them)', () => {
    for (const b of natureBlocks.filter((x) => x.kind !== 'log')) {
      const y0 = b.center.y - b.size.y / 2;
      for (const sx of [-1, -0.5, 0, 0.5, 1]) {
        for (const sz of [-1, -0.5, 0, 0.5, 1]) {
          const g = terrainHeightAt(terrain, b.center.x + (sx * b.size.x) / 2, b.center.z + (sz * b.size.z) / 2)!;
          expect(y0, `${b.kind} at ${b.center.x.toFixed(2)}, ${b.center.z.toFixed(2)}`).toBeLessThanOrEqual(g + EPS);
        }
      }
    }
  });

  it('keeps the drawing-only pebbles within 8 cm of the ground (no collider, so nothing to hide behind)', () => {
    const buf = emptyBuffers();
    appendPebbles(buf, WOODLAND, (x, z) => terrainHeightAt(terrain, x, z) ?? 0);
    expect(buf.positions.length / 3).toBeGreaterThan(100);
    let highest = 0;
    for (let i = 0; i < buf.positions.length; i += 3) {
      const g = terrainHeightAt(terrain, buf.positions[i]!, buf.positions[i + 2]!)!;
      highest = Math.max(highest, buf.positions[i + 1]! - g);
    }
    expect(highest).toBeLessThanOrEqual(NATURE_SHAPES.maxGap);
  });

  it('keeps every fire pit low (stones and logs well under a crouching figure; fixtures have no collider)', () => {
    const { ground: _ground, ...bare } = WOODLAND;
    const fireOnly: MapData = { ...bare, blocks: [], lights: WOODLAND.lights!.filter((l) => l.kind === 'fire') };
    const group = buildMapMeshes(fireOnly, ALL_TEXTURES, { relief: false, normalMaps: false, detail: false, steelSheen: false }, null);
    const parts = group.children.filter((c) => c.name === 'map-stone' || c.name === 'map-bark') as THREE.Mesh[];
    expect(parts.map((p) => p.name).sort()).toEqual(['map-bark', 'map-stone']);
    for (const m of parts) {
      const pos = m.geometry.getAttribute('position');
      for (let i = 0; i < pos.count; i++) {
        const g = terrainHeightAt(terrain, pos.getX(i), pos.getZ(i))!;
        expect(pos.getY(i) - g, m.name).toBeLessThan(0.35);
        const near = fireOnly.lights!.some((l) => Math.hypot(l.position.x - pos.getX(i), l.position.z - pos.getZ(i)) < 1);
        expect(near, m.name).toBe(true);
      }
    }
    disposeMapMeshes(group);
  });
});

describe('AC1: the canopy, from tree blocks only', () => {
  const moon = new THREE.Vector3(0.3, 0.6, -0.7).normalize();

  it('is built from the tree blocks and nothing else: a crown each, no more', () => {
    const trees = WOODLAND.blocks.filter((b) => b.kind === 'tree');
    const mesh = buildCanopyMesh(WOODLAND.blocks, terrain, moon, false)!;
    const expected = trees.reduce((n, t) => n + crownOf(t, terrain).triangles.length / 9, 0);
    expect(mesh.geometry.getAttribute('position').count / 3).toBe(expected);
    // Logs and boulders on their own make no canopy.
    expect(buildCanopyMesh(WOODLAND.blocks.filter((b) => b.kind !== 'tree'), terrain, moon, false)).toBeNull();
    mesh.geometry.dispose();
    (mesh.material as THREE.Material).dispose();
  });
});

describe('AC1: Depot’s textures and GPU memory are unchanged', () => {
  it('asks for the core set only on Depot and the range, and draws nothing new into the shared set', () => {
    // Neon Heights asks for the city's (M34f, cityLook.test.ts), none of the woods' but the planters' boards.
    expect(texturesFor(NEON_HEIGHTS).filter((id) => ['bark', 'stone', 'groundDetail'].includes(id))).toEqual([]);
    for (const map of [DEPOT, RANGE_MAP]) {
      expect(new Set(texturesFor(map)), map.name).toEqual(new Set(CORE_SURFACES));
      const set = stubTextures(CORE_SURFACES);
      const before = { ...set };
      // A draw would need a canvas (none here): drawing nothing is the only way this passes.
      expect(addSurfaceTextures(set, texturesFor(map), 256, 1)).toBe(set);
      expect(set).toEqual(before);
    }
  });

  it('asks for every woods surface on Woodland (bark, planks, stone, the ground tile)', () => {
    expect(new Set(texturesFor(WOODLAND))).toEqual(new Set([...CORE_SURFACES, 'bark', 'planks', 'stone', 'groundDetail']));
  });

  it('frees the woods’ textures with the shared set', () => {
    const set = stubTextures([...CORE_SURFACES, 'bark', 'planks', 'stone', 'groundDetail']);
    const freed = new Set<string>();
    for (const t of Object.values(set)) t!.texture.addEventListener('dispose', () => freed.add(t!.texture.name));
    disposeSurfaceTextures(set);
    expect(freed).toEqual(new Set(Object.keys(set)));
  });
});

describe('AC3: the night sky by preset, fires’ fixtures and their flicker', () => {
  beforeAll(() => {
    vi.stubGlobal('document', { createElement: () => ({ width: 0, height: 0, getContext: () => null }) });
  });
  afterAll(() => vi.unstubAllGlobals());

  const names = (scene: THREE.Scene): Map<string, THREE.Object3D> => {
    const out = new Map<string, THREE.Object3D>();
    scene.traverse((o) => {
      if (o.name) out.set(o.name, o);
    });
    return out;
  };

  it('builds no moon, stars, flames or embers under the day preset, on any quality, even on a map with fires', () => {
    const woodlandByDay: MapData = { ...WOODLAND, lighting: { presets: ['day'] } };
    for (const q of QUALITY_PRESETS) {
      const scene = new THREE.Scene();
      const light = addLighting(scene, woodlandByDay, QUALITY[q], LIGHTING_PRESETS.day);
      const n = names(scene);
      for (const name of ['night-sky', 'night-stars', 'night-moon', 'light-fixtures', 'fire-flames', 'fire-embers']) expect(n.has(name), `${q}: ${name}`).toBe(false);
      light.dispose();
    }
  });

  it('draws the moon and stars on every quality at night, and embers only where dust motes are on, through settings changes', () => {
    for (const q of QUALITY_PRESETS) {
      const scene = new THREE.Scene();
      const light = addLighting(scene, WOODLAND, QUALITY[q], LIGHTING_PRESETS.night);
      const n = names(scene);
      expect(n.get('night-stars')?.visible, q).toBe(true);
      expect(n.get('night-moon')?.visible, q).toBe(true);
      expect(n.get('fire-flames')?.visible, q).toBe(true);
      expect(n.get('fire-embers')?.visible, q).toBe(QUALITY[q].dustMotes > 0);
      for (const other of QUALITY_PRESETS) {
        light.setQuality(QUALITY[other]);
        // Your torch takes a light (M33h): the embers keep to the dust motes setting.
        light.reserveLights(1);
        expect(n.get('fire-embers')!.visible, `${q} -> ${other}`).toBe(QUALITY[other].dustMotes > 0);
        expect(n.get('night-moon')!.parent, `${q} -> ${other}`).not.toBeNull();
      }
      light.dispose();
    }
  });

  it('puts the stars and moon inside the camera’s far plane (else they are clipped away)', () => {
    expect(NIGHT_SKY.radius).toBeLessThan(RENDER.far);
  });

  it('flickers the flames in the shader with the same curve the real pool light uses (same rates, weights and phases)', () => {
    const fx = buildLightFixtures(WOODLAND, () => 0, true)!;
    const flames = fx.group.getObjectByName('fire-flames') as THREE.Mesh;
    const shader = { uniforms: {} as Record<string, unknown>, vertexShader: '#include <begin_vertex>\n#include <color_vertex>', fragmentShader: '#include <alphatest_fragment>' };
    (flames.material as THREE.Material).onBeforeCompile(shader as never, null as never);
    const glsl = /float fxFlicker\(float seed\) \{ return (.*); \}/.exec(shader.vertexShader)![1]!;
    const js = new Function('fxTime', 'seed', `return ${glsl.replace(/sin\(/g, 'Math.sin(')};`) as (t: number, s: number) => number;
    for (let i = 0; i < 400; i++) {
      const t = i * 0.137;
      const seed = flickerSeed(i % 7);
      expect(1 + FIXTURES.flicker.amount * js(t, seed)).toBeCloseTo(flicker(t, seed), 3);
    }
    // The flames brighten by it, and the clock is the fixtures' own (advanced each frame, one uniform).
    expect(shader.vertexShader).toContain('vColor.rgb *= 1.0 + flicker.y * fxFlicker(flicker.x);');
    fx.advance(0.25);
    expect((shader.uniforms.fxTime as { value: number }).value).toBeCloseTo(0.25, 9);
    fx.dispose();
  });

  it('seeds each fire’s first flame card as its real light (the index in MapData.lights), so flames and light flicker together', () => {
    const lights = WOODLAND.lights!;
    const geo = flameGeometry(lights, () => 0);
    const fl = geo.getAttribute('flicker');
    const perCard = FIXTURES.fire.flames.rows.length * 2;
    let v = 0;
    let fires = 0;
    lights.forEach((l, i) => {
      if (l.kind === 'fire') {
        expect(fl.getX(v)).toBeCloseTo(flickerSeed(i), 5);
        v += perCard * FIXTURES.fire.flames.cards;
        fires++;
      } else if (l.kind === 'lantern') v += 16;
    });
    expect(fires).toBeGreaterThan(0);
    expect(v).toBe(fl.count);
  });
});

describe('AC2: the ground drawn from the grid', () => {
  it('paints each terrain vertex from the ground grid: its surface’s colour, darker under the trees, under the ground tile', () => {
    const group = buildMapMeshes(WOODLAND, ALL_TEXTURES, { relief: false, normalMaps: false, detail: false, steelSheen: false }, null);
    const t = group.getObjectByName('map-terrain') as THREE.Mesh;
    expect((t.material as THREE.MeshLambertMaterial).map?.name).toBe('groundDetail');
    expect(t.geometry.getAttribute('uv').count).toBe(t.geometry.getAttribute('position').count);
    const grid = buildGroundGrid(WOODLAND)!;
    const pos = t.geometry.getAttribute('position');
    const col = t.geometry.getAttribute('color');
    const j = TERRAIN_LOOK.jitter;
    const seen: Record<string, number> = {};
    const b = GROUND_LOOK.blend;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const z = pos.getZ(i);
      // The vertex's blend neighbourhood, read through the footsteps' lookup: one surface, all under trees or none.
      const cells: [GroundSurface, boolean][] = [];
      for (let a = -b; a < b; a++) for (let c = -b; c < b; c++) cells.push([groundAt(grid, x + (a + 0.5) * grid.cell, z + (c + 0.5) * grid.cell), groundUnderTrees(grid, x + (a + 0.5) * grid.cell, z + (c + 0.5) * grid.cell)]);
      const [surface, under] = cells[0]!;
      if (surface === 'grass' || cells.some(([s, u]) => s !== surface || u !== under)) continue;
      const want = new THREE.Color().setHex(GROUND_LOOK.colours[surface], THREE.SRGBColorSpace).multiplyScalar(under ? GROUND_LOOK.underTreeShade : 1);
      const k = col.getX(i) / want.r;
      const where = `${surface}${under ? ' under trees' : ''} at ${x.toFixed(1)}, ${z.toFixed(1)}`;
      expect(k, where).toBeGreaterThanOrEqual(1 - j - 1e-4);
      expect(k, where).toBeLessThanOrEqual(1 + j + 1e-4);
      expect(col.getY(i) / want.g, where).toBeCloseTo(k, 4);
      expect(col.getZ(i) / want.b, where).toBeCloseTo(k, 4);
      const key = `${surface}${under ? '*' : ''}`;
      seen[key] = (seen[key] ?? 0) + 1;
    }
    // Leaf litter under the trees, the creek's gravel and the tracks' earth all show somewhere.
    expect(Object.keys(seen)).toEqual(expect.arrayContaining(['leaves*', 'gravel', 'earth']));
    disposeMapMeshes(group);
  });
});

describe('AC2: the ground grid footsteps will read (M33j)', () => {
  const grid = buildGroundGrid(WOODLAND)!;
  const patches = WOODLAND.ground!.patches;

  it('lays each patch along its whole length, not just its middle, where no later patch covers it', () => {
    let checked = 0;
    patches.forEach((p, k) => {
      if (!p.path || p.path.length < 2) return;
      for (let s = 1; s < p.path.length; s++) {
        const a = p.path[s - 1]!;
        const c = p.path[s]!;
        const len = Math.hypot(c.x - a.x, c.z - a.z);
        for (let d = 0; d <= len; d += 0.5) {
          // The middle of the cell holding the centreline point (the grid is sampled at cell centres).
          const i = Math.floor((a.x + ((c.x - a.x) * d) / len - grid.minX) / grid.cell);
          const jz = Math.floor((a.z + ((c.z - a.z) * d) / len - grid.minZ) / grid.cell);
          const x = grid.minX + (i + 0.5) * grid.cell;
          const z = grid.minZ + (jz + 0.5) * grid.cell;
          if (!onPatch(p, x, z) || patches.slice(k + 1).some((q) => onPatch(q, x, z))) continue;
          expect(groundAt(grid, x, z), `${p.surface} at ${x}, ${z}`).toBe(p.surface);
          checked++;
        }
      }
    });
    expect(checked).toBeGreaterThan(300);
  });

  it('answers from the grid alone, in constant time: a million steps’ lookups well under a second', () => {
    // A grid by hand, no map behind it: two columns, two rows (grass, gravel / wood, leaves), cells 2 m.
    const g = { minX: -2, minZ: -2, cell: 2, cols: 2, rows: 2, surface: Uint8Array.from([0, 3, 4, 1]), underTrees: Uint8Array.from([0, 0, 0, 1]) };
    expect([groundAt(g, -1, -1), groundAt(g, 1, -1), groundAt(g, -1, 1), groundAt(g, 1, 1)]).toEqual(['grass', 'gravel', 'wood', 'leaves']);
    expect(groundUnderTrees(g, 1, 1)).toBe(true);
    // Past the edge, the edge's cell.
    expect(groundAt(g, 50, -50)).toBe('gravel');
    let sink = 0;
    const t0 = performance.now();
    for (let i = 0; i < 1_000_000; i++) sink += groundAt(grid, (i % 197) - 98, (i % 151) - 75).length;
    expect(performance.now() - t0).toBeLessThan(1000);
    expect(sink).toBeGreaterThan(0);
  });
});

describe('GPU disposal: the woods’ meshes, sky and fixtures are freed when the session ends', () => {
  beforeAll(() => {
    vi.stubGlobal('document', { createElement: () => ({ width: 0, height: 0, getContext: () => null }) });
  });
  afterAll(() => vi.unstubAllGlobals());

  function resources(scene: THREE.Scene): Set<THREE.BufferGeometry | THREE.Material> {
    const out = new Set<THREE.BufferGeometry | THREE.Material>();
    scene.traverse((o) => {
      if (o instanceof THREE.Mesh || o instanceof THREE.Points || o instanceof THREE.LineSegments) {
        out.add(o.geometry);
        for (const m of Array.isArray(o.material) ? o.material : [o.material]) out.add(m as THREE.Material);
      }
    });
    return out;
  }

  function expectClean(name: string, build: (scene: THREE.Scene) => () => void, mustHave: readonly string[]): void {
    const scene = new THREE.Scene();
    const dispose = build(scene);
    const have = new Set<string>();
    scene.traverse((o) => have.add(o.name));
    for (const n of mustHave) expect(have.has(n), `${name} draws ${n}`).toBe(true);
    const used = resources(scene);
    const freed = new Set<unknown>();
    for (const r of used) r.addEventListener('dispose', () => freed.add(r));
    dispose();
    expect(scene.children, `${name} leaves the scene`).toHaveLength(0);
    expect([...used].filter((r) => !freed.has(r)).map((r) => `${r.type} ${r.name}`), `${name} frees everything`).toEqual([]);
  }

  it('Woodland’s map meshes (bark, stone, planks, canopy, textured terrain, bushes) on every quality', () => {
    for (const q of QUALITY_PRESETS) {
      expectClean(
        `Woodland meshes ${q}`,
        (scene) => {
          const group = buildMapMeshes(WOODLAND, ALL_TEXTURES, { ...mapLookOf(QUALITY[q]), normalMaps: false }, () => new THREE.Texture());
          scene.add(group);
          return () => disposeMapMeshes(group);
        },
        ['map-bark', 'map-stone', 'map-planks', 'map-canopy', 'map-terrain', 'map-foliage'],
      );
    }
  });

  it('Woodland’s night light: the moon, stars, flames and embers, after settings changes', () => {
    for (const q of QUALITY_PRESETS) {
      expectClean(
        `Woodland night ${q}`,
        (scene) => {
          const light = addLighting(scene, WOODLAND, QUALITY[q], LIGHTING_PRESETS.night);
          for (const other of QUALITY_PRESETS) light.setQuality(QUALITY[other]);
          light.setQuality(QUALITY[q]);
          return () => light.dispose();
        },
        ['night-stars', 'night-moon', 'fire-flames', 'fire-embers'],
      );
    }
  });
});
