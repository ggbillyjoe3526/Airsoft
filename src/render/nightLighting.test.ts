import * as THREE from 'three';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { LIGHTING_PRESETS, QUALITY, SIGNS, type QualitySettings } from '../config/render';
import { DEPOT } from '../map/depot';
import type { MapData, MapSign } from '../map/mapTypes';
import { NEON_HEIGHTS } from '../map/neonHeights';
import { WOODLAND } from '../map/woodland';
import { OPEN_FIELD } from '../sim/testSupport';
import { vec3 } from '../sim/vec';
import { addLighting } from './lighting';
import { addMapSigns, buildSignGeometry, mapSignsOf, signColour } from './mapSigns';

/**
 * M34e QA: Neon Heights' lamps and signs as addLighting draws them under each preset (pools by Night only, signs by both),
 * a Day map's pools being inert through setQuality and follow, disposal of the lot, Woodland unchanged by Night, and the
 * edges of the sign mesh (all four facings, zero-size panels, dark windows). lightingScene.test.ts and mapSigns.test.ts
 * have the main behaviours.
 */

const night = LIGHTING_PRESETS.night;
const day = LIGHTING_PRESETS.day;
const QUALITIES: readonly [string, QualitySettings][] = [['low', QUALITY.low], ['medium', QUALITY.medium], ['high', QUALITY.high]];

const pointLights = (scene: THREE.Scene): THREE.PointLight[] => scene.children.filter((o): o is THREE.PointLight => o instanceof THREE.PointLight);
const poolMeshes = (scene: THREE.Scene): THREE.Object3D[] => scene.children.filter((o) => o.name.startsWith('pool-'));
const eyeAt = (x: number, z: number): THREE.PerspectiveCamera => {
  const c = new THREE.PerspectiveCamera();
  c.position.set(x, 1.6, z);
  c.updateMatrixWorld(true);
  return c;
};

describe('Neon Heights drawn under each preset (M34e acceptance 1 and 2)', () => {
  it('by Night: one pool glow, one pool ground and one unlit sign mesh with a quad for every sign', () => {
    // The city props' screens join the map's signs; its road markings are a mesh of their own (M34f).
    const signs = mapSignsOf(NEON_HEIGHTS).filter((s) => s.kind !== 'paint');
    expect(signs.length).toBeGreaterThan(12);
    const scene = new THREE.Scene();
    addLighting(scene, NEON_HEIGHTS, QUALITY.low, night);
    expect(scene.children.filter((o) => o.name === 'pool-glow')).toHaveLength(1);
    expect(scene.children.filter((o) => o.name === 'pool-ground')).toHaveLength(1);
    const meshes = scene.children.filter((o): o is THREE.Mesh => o instanceof THREE.Mesh && o.name === 'map-signs');
    expect(meshes).toHaveLength(1);
    expect(meshes[0]!.geometry.getAttribute('position').count).toBe(signs.length * 4);
    expect(meshes[0]!.material instanceof THREE.MeshBasicMaterial).toBe(true);
    expect((meshes[0]!.material as THREE.MeshBasicMaterial).fog).toBe(false); // the signs are the light: the fog does not dim them
    const paint = scene.getObjectByName('map-paint') as THREE.Mesh;
    expect(paint.material instanceof THREE.MeshLambertMaterial).toBe(true); // the markings never glow
    expect(paint.geometry.getAttribute('position').count).toBe(NEON_HEIGHTS.signs!.filter((s) => s.kind === 'paint').length * 4);
  });

  it('by Day: no pool at all, no real light on any quality, and the same signs as painted Lambert boards', () => {
    for (const [name, q] of QUALITIES) {
      const scene = new THREE.Scene();
      addLighting(scene, NEON_HEIGHTS, q, day);
      expect(poolMeshes(scene), name).toHaveLength(0);
      expect(pointLights(scene), name).toHaveLength(0);
      const mesh = scene.getObjectByName('map-signs') as THREE.Mesh;
      expect(mesh.geometry.getAttribute('position').count, name).toBe(mapSignsOf(NEON_HEIGHTS).filter((s) => s.kind !== 'paint').length * 4);
      expect(mesh.material instanceof THREE.MeshLambertMaterial, name).toBe(true);
    }
  });

  it('gives each real light of Neon Heights to a pool of the map by Night, and the nearest ones as the eye moves', () => {
    const scene = new THREE.Scene();
    const daylight = addLighting(scene, NEON_HEIGHTS, QUALITY.high, night);
    const lights = pointLights(scene);
    expect(lights).toHaveLength(4);
    const lamp = NEON_HEIGHTS.lights![0]!;
    for (let i = 0; i < 90; i++) daylight.follow(eyeAt(lamp.position.x, lamp.position.z), 1 / 30);
    const lit = pointLights(scene).filter((l) => l.intensity > 0);
    expect(lit).toHaveLength(4);
    expect(lit.some((l) => l.position.x === lamp.position.x && l.position.z === lamp.position.z)).toBe(true);
    expect(pointLights(scene)).toEqual(lights); // the same four objects, never a new one
  });
});

describe('pools by Day are inert (M34e acceptance 2)', () => {
  it('ignores setQuality and follow on a Day map that has pools: no light and no pool mesh appears, and the signs stay as they were', () => {
    for (const map of [NEON_HEIGHTS, WOODLAND]) {
      const scene = new THREE.Scene();
      const daylight = addLighting(scene, map, QUALITY.high, day);
      const signsBefore = scene.getObjectByName('map-signs');
      for (const [, q] of QUALITIES) daylight.setQuality(q);
      daylight.setQuality({ ...QUALITY.high, poolLights: 4 });
      for (let i = 0; i < 120; i++) daylight.follow(eyeAt(Math.sin(i) * 20, Math.cos(i * 0.3) * 20), 1 / 60);
      expect(scene.getObjectByName('map-signs'), map.name).toBe(signsBefore); // the signs are not rebuilt by a quality change
      expect(pointLights(scene), map.name).toHaveLength(0);
      expect(poolMeshes(scene), map.name).toHaveLength(0);
      daylight.dispose();
      expect(scene.children, map.name).toHaveLength(0);
    }
  });

  it('draws a pool-less map the same under both presets (Depot has no pools and no signs)', () => {
    for (const preset of [night, day]) {
      const scene = new THREE.Scene();
      addLighting(scene, DEPOT, QUALITY.high, preset).dispose();
      expect(scene.children).toHaveLength(0);
      const again = new THREE.Scene();
      addLighting(again, DEPOT, QUALITY.high, preset);
      expect(poolMeshes(again)).toHaveLength(0);
      expect(again.getObjectByName('map-signs')).toBeUndefined();
    }
  });

  it('keeps Woodland as it was: its pools by Night on every quality, no signs, nothing of a sign mesh by either preset', () => {
    for (const [name, q] of QUALITIES) {
      const scene = new THREE.Scene();
      addLighting(scene, WOODLAND, q, night);
      expect(scene.getObjectByName('pool-glow'), name).toBeDefined();
      expect(scene.getObjectByName('pool-ground'), name).toBeDefined();
      expect(scene.getObjectByName('map-signs'), name).toBeUndefined();
      expect(pointLights(scene), name).toHaveLength(q.poolLights);
    }
    expect(WOODLAND.signs).toBeUndefined();
    const byDay = new THREE.Scene();
    addLighting(byDay, WOODLAND, QUALITY.high, day);
    expect(byDay.getObjectByName('map-signs')).toBeUndefined();
  });
});

describe('disposing the night lighting (M34e)', () => {
  beforeAll(() => {
    vi.stubGlobal('document', { createElement: () => ({ width: 0, height: 0, getContext: () => null }) });
  });
  afterAll(() => vi.unstubAllGlobals());

  /** Every geometry and material under `scene`. */
  const resources = (scene: THREE.Scene): Set<THREE.BufferGeometry | THREE.Material> => {
    const out = new Set<THREE.BufferGeometry | THREE.Material>();
    scene.traverse((o) => {
      if (o instanceof THREE.Mesh || o instanceof THREE.Points || o instanceof THREE.LineSegments) out.add(o.geometry);
      if (o instanceof THREE.Mesh || o instanceof THREE.Points || o instanceof THREE.LineSegments || o instanceof THREE.Sprite) {
        for (const m of Array.isArray(o.material) ? o.material : [o.material]) out.add(m as THREE.Material);
      }
    });
    return out;
  };

  it('empties the scene and frees every geometry and material of Neon Heights by Night and by Day', () => {
    for (const preset of [night, day]) {
      const scene = new THREE.Scene();
      const daylight = addLighting(scene, NEON_HEIGHTS, QUALITY.high, preset);
      daylight.follow(eyeAt(0, 0), 1 / 60);
      daylight.setQuality(QUALITY.low);
      const used = resources(scene);
      const signMesh = scene.getObjectByName('map-signs') as THREE.Mesh;
      expect(used.has(signMesh.geometry)).toBe(true);
      const freed = new Set<unknown>();
      for (const r of used) r.addEventListener('dispose', () => freed.add(r));
      daylight.dispose();
      expect(scene.children).toHaveLength(0);
      expect([...used].filter((r) => !freed.has(r)).map((r) => `${r.type} ${r.name}`)).toEqual([]);
      expect(freed.has(signMesh.geometry)).toBe(true);
      expect(freed.has(signMesh.material)).toBe(true);
    }
  });

  it('can be disposed twice without throwing, and a second lighting on the scene starts clean', () => {
    const scene = new THREE.Scene();
    const first = addLighting(scene, NEON_HEIGHTS, QUALITY.medium, night);
    first.dispose();
    expect(() => first.dispose()).not.toThrow();
    expect(scene.children).toHaveLength(0);
    addLighting(scene, NEON_HEIGHTS, QUALITY.medium, day);
    expect(poolMeshes(scene)).toHaveLength(0);
    expect(scene.children.filter((o) => o.name === 'map-signs')).toHaveLength(1);
  });
});

describe('the sign mesh at its edges (M34e)', () => {
  const at = (facing: MapSign['facing'], over: Partial<MapSign> = {}): MapSign => ({ centre: vec3(1, 2, 3), width: 2, height: 1, facing, colour: 0x22e6ff, kind: 'neon', ...over });

  it('lays a panel flat against its wall for each of the four facings: no depth along the wall normal but the offset', () => {
    const axis = { '+x': 'x', '-x': 'x', '+z': 'z', '-z': 'z' } as const;
    const sign = { '+x': 1, '-x': -1, '+z': 1, '-z': -1 } as const;
    for (const f of ['+x', '-x', '+z', '-z'] as const) {
      const geo = buildSignGeometry([at(f)], true);
      const pos = geo.getAttribute('position');
      const nor = geo.getAttribute('normal');
      const normalAxis = axis[f];
      const wallAt = normalAxis === 'x' ? 1 : 3;
      const across = normalAxis === 'x' ? 'z' : 'x';
      const box = new THREE.Box3().setFromBufferAttribute(pos as THREE.BufferAttribute);
      expect(box.max[normalAxis] - box.min[normalAxis], f).toBeCloseTo(0, 6);
      expect(box.min[normalAxis], f).toBeCloseTo(wallAt + sign[f] * SIGNS.offset, 6);
      expect(box.max[across] - box.min[across], f).toBeCloseTo(2, 6); // the full width, along the wall
      expect(box.max.y - box.min.y, f).toBeCloseTo(1, 6);
      // The front is the way it faces (the winding agrees with the normal), whichever wall it hangs on.
      const idx = geo.index!;
      const a = new THREE.Vector3().fromBufferAttribute(pos, idx.getX(0));
      const b = new THREE.Vector3().fromBufferAttribute(pos, idx.getX(1)).sub(a);
      const c = new THREE.Vector3().fromBufferAttribute(pos, idx.getX(2)).sub(a);
      const face = b.cross(c).normalize();
      expect(face.dot(new THREE.Vector3().fromBufferAttribute(nor, 0)), f).toBeCloseTo(1, 6);
      geo.dispose();
    }
  });

  it('colours the four corners of a quad alike with signColour, and a dark window glows nothing by Night', () => {
    const dark = at('+x', { kind: 'window', colour: 0x000000 });
    const neon = at('+z');
    for (const night of [true, false]) {
      const col = buildSignGeometry([dark, neon], night).getAttribute('color');
      const want = [signColour(dark, night), signColour(neon, night)];
      for (let v = 0; v < 8; v++) {
        const w = want[Math.floor(v / 4)]!;
        expect([col.getX(v), col.getY(v), col.getZ(v)]).toEqual([expect.closeTo(w.r, 6), expect.closeTo(w.g, 6), expect.closeTo(w.b, 6)]);
      }
    }
    expect(signColour(dark, true).getHex()).toBe(0x000000); // unlit and black: dark glass in the night city
    expect(signColour(dark, false).getHex()).toBe(SIGNS.glass);
  });

  it('survives zero-size panels: finite vertices, a mesh that still adds and disposes, no NaN in the bounds', () => {
    const flat = [at('+x', { width: 0 }), at('-z', { height: 0 }), at('+z', { width: 0, height: 0 })];
    const geo = buildSignGeometry(flat, true);
    const pos = geo.getAttribute('position');
    expect(pos.count).toBe(12);
    for (let i = 0; i < pos.count * 3; i++) expect(Number.isFinite((pos.array as Float32Array)[i]!)).toBe(true);
    geo.computeBoundingSphere();
    expect(Number.isNaN(geo.boundingSphere!.radius)).toBe(false);
    const map: MapData = { ...OPEN_FIELD, signs: flat };
    for (const isNight of [true, false]) {
      const scene = new THREE.Scene();
      addMapSigns(scene, map, isNight).dispose();
      expect(scene.children).toHaveLength(0);
    }
  });

  it('adds nothing for an empty sign list, and makes an empty geometry for it', () => {
    const scene = new THREE.Scene();
    const handle = addMapSigns(scene, { ...OPEN_FIELD, signs: [] }, true);
    expect(scene.children).toHaveLength(0);
    expect(() => handle.dispose()).not.toThrow();
    const geo = buildSignGeometry([], true);
    expect(geo.getAttribute('position').count).toBe(0);
    expect(geo.index!.count).toBe(0);
  });

  it('is one mesh however many signs there are, indexed so no quad shares a vertex with another', () => {
    const many = Array.from({ length: 40 }, (_, i) => at(i % 2 ? '+x' : '-z', { centre: vec3(i, 2, -i) }));
    const geo = buildSignGeometry(many, false);
    expect(geo.getAttribute('position').count).toBe(160);
    expect(geo.index!.count).toBe(240);
    const seen = new Set<number>();
    for (let t = 0; t < 240; t++) seen.add(geo.index!.getX(t));
    expect(seen.size).toBe(160);
    const scene = new THREE.Scene();
    addMapSigns(scene, { ...OPEN_FIELD, signs: many }, false);
    expect(scene.children.filter((o) => o instanceof THREE.Mesh)).toHaveLength(1);
  });
});
