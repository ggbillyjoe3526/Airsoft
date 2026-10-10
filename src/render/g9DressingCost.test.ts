import * as THREE from 'three';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { FULL_MOTION } from '../config/accessibility';
import { NEON, PLANE } from '../config/dressing';
import { QUALITY, type QualitySettings, SURFACES } from '../config/render';
import { DEPOT } from '../map/depot';
import type { MapData } from '../map/mapTypes';
import { NEON_HEIGHTS } from '../map/neonHeights';
import { WOODLAND } from '../map/woodland';
import { vec3 } from '../sim/vec';
import { addAtmosphere } from './atmosphere';
import { DressingEffects } from './dressingEffects';
import { resolveLighting } from './lightingPreset';
import { SKY_PART, type SkyPlaneUniforms } from './skyHost';
import { buildMapMeshes, disposeMapMeshes, type MapLook, mapLookOf, texturesFor } from './mapMeshes';
import { neonFlicker } from './neonDressing';
import type { SurfaceTextures } from './proceduralTextures';

/**
 * What G9's dressing costs on Woodland and Neon Heights (criteria 3 and 4): nothing at all on Low; on Medium and High
 * at most four more draw calls for the static dressing and one per moving effect on screen, and at most 15 000 more
 * triangles a map; nothing allocated per frame; Reduced motion stills every moving piece and the signs' flicker; and
 * every new geometry, material and texture is freed with the map or the match.
 */

const stub = (ids: readonly (keyof typeof SURFACES.worldSize)[]): SurfaceTextures =>
  Object.fromEntries(ids.map((id) => [id, { texture: Object.assign(new THREE.Texture(), { name: id }), worldSize: SURFACES.worldSize[id], mean: 1 }])) as unknown as SurfaceTextures;
const textures = (map: MapData): SurfaceTextures => stub(texturesFor(map));
const look = (q: QualitySettings): MapLook => ({ ...mapLookOf(q, null), relief: false });
const atlas = (): THREE.Texture => new THREE.Texture();
const meshes = (g: THREE.Object3D): THREE.Mesh[] => g.children.filter((o): o is THREE.Mesh => o instanceof THREE.Mesh);
const tris = (m: THREE.Mesh): number => (m.geometry.index ? m.geometry.index.count : m.geometry.getAttribute('position').count) / 3;
const triangles = (g: THREE.Object3D): number => meshes(g).reduce((n, m) => n + tris(m), 0);
const programs = (g: THREE.Object3D): string[] =>
  meshes(g).map((m) => `${m.name}:${(m.material as THREE.Material).type}:${(m.material as THREE.Material).customProgramCacheKey()}`);
const textureCount = (g: THREE.Object3D): number => meshes(g).filter((m) => (m.material as THREE.MeshLambertMaterial).map).length;
/** FNV-1a over a buffer of numbers, rounded to a 24th of a millimetre: a vertex-exact pin that survives rounding. */
function hashNums(a: ArrayLike<number>): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < a.length; i++) h = Math.imul(h ^ Math.round(a[i]! * 4096), 0x01000193) >>> 0;
  return h.toString(16).padStart(8, '0');
}

/** Each map without its dressing: what it drew before G9. */
const bareOf = (map: MapData): MapData => {
  const bare: MapData = { ...map };
  delete bare.dressing;
  return bare;
};

/** The world round a map (the ring, the skyline and its lights) at a quality: its meshes' names and triangles. */
function horizon(q: QualitySettings, map: MapData): { names: string[]; tris: number } {
  const scene = new THREE.Scene();
  const box = new THREE.Box3(new THREE.Vector3(-60, -0.5, -40), new THREE.Vector3(60, 8, 40));
  const a = addAtmosphere(scene, new THREE.Vector3(), new THREE.Vector3(0.4, 0.8, 0.3).normalize(), q, box, resolveLighting(map), map.dressing?.skyline, map.blocks.some((b) => b.kind === 'tree'));
  const names: string[] = [];
  let n = 0;
  for (const o of scene.children) {
    if (o instanceof THREE.Mesh && (o.name === 'trees' || o.name === 'skylineLights')) {
      names.push(o.name);
      n += tris(o);
    }
  }
  a.dispose();
  return { names: names.sort(), tris: n };
}

const MAPS: readonly [string, MapData][] = [
  ['Woodland', WOODLAND],
  ['Neon Heights', NEON_HEIGHTS],
];

describe('G9: what the two maps’ dressing costs', { timeout: 30_000 }, () => {
  beforeAll(() => {
    vi.stubGlobal('document', { createElement: () => ({ width: 0, height: 0, getContext: () => null }) });
  });
  afterAll(() => vi.unstubAllGlobals());

  for (const [name, map] of MAPS) {
    it(`${name}: Low draws exactly what it drew before — the same meshes, triangles, shaders, textures and horizon, and no effects`, () => {
      const q = QUALITY.low;
      const dressed = buildMapMeshes(map, textures(map), look(q), atlas);
      const bare = buildMapMeshes(bareOf(map), textures(map), look(q), atlas);
      expect(programs(dressed)).toEqual(programs(bare));
      expect(triangles(dressed)).toBe(triangles(bare));
      expect(textureCount(dressed)).toBe(textureCount(bare));
      expect(horizon(q, map)).toEqual(horizon(q, bareOf(map)));
      const scene = new THREE.Scene();
      const fx = new DressingEffects(scene, map);
      fx.setNight(true);
      fx.setQuality(q);
      fx.update(1 / 60, new THREE.PerspectiveCamera(), vec3());
      expect(scene.children.length).toBe(0);
      fx.dispose();
      disposeMapMeshes(dressed);
      disposeMapMeshes(bare);
    });
  }

  for (const [name, map] of MAPS) {
    for (const preset of ['medium', 'high'] as const) {
      it(`${name} on ${preset}: at most four more static draw calls, one per moving effect, and 15 000 more triangles`, () => {
        const q = QUALITY[preset];
        const dressed = buildMapMeshes(map, textures(map), look(q), atlas);
        const bare = buildMapMeshes(bareOf(map), textures(map), look(q), atlas);
        const added = meshes(dressed).filter((m) => !bare.getObjectByName(m.name));
        expect(added.map((m) => m.name).sort()).toEqual(['map-junk', 'map-puddles']);
        expect(added.every((m) => !m.castShadow)).toBe(true);
        // No new texture: the dressing is vertex-coloured (its decals share the map's one atlas).
        expect(textureCount(dressed)).toBe(textureCount(bare));
        const hDressed = horizon(q, map);
        const hBare = horizon(q, bareOf(map));
        // The skyline joins the ring's mesh; only its own lights (a tower's windows and signs) are a draw of their own.
        const staticDraws = added.length + (hDressed.names.length - hBare.names.length);
        expect(staticDraws).toBeLessThanOrEqual(4);
        const extra = triangles(dressed) - triangles(bare) + hDressed.tris - hBare.tris;
        expect(extra).toBeGreaterThan(2000);
        expect(extra).toBeLessThanOrEqual(15000);
        // The moving effects G9 adds, over what the map ran without a dressing: one mesh, so one draw, each.
        const scene = new THREE.Scene();
        const fx = new DressingEffects(scene, map);
        fx.setNight(true);
        fx.setMapGroup(dressed);
        fx.setQuality(q);
        const camera = new THREE.PerspectiveCamera();
        for (let i = 0; i < 60; i++) fx.update(1 / 60, camera, vec3());
        const was = new THREE.Scene();
        const fxBare = new DressingEffects(was, bareOf(map));
        fxBare.setNight(true);
        fxBare.setQuality(q);
        const before = was.children.map((o) => o.name);
        const moving = scene.children.map((o) => o.name).filter((n) => !before.includes(n));
        // Woodland: the fireflies and the dust its feet kick up. Neon Heights: the vents' steam, the plane and the dust.
        expect(moving.sort()).toEqual(map === WOODLAND ? ['fireflies', 'kickedDust'] : ['kickedDust', 'passingPlane', 'steamPlumes']);
        // Each is a single mesh of its own, drawn once; none of them casts a shadow.
        for (const n of moving) {
          const o = scene.getObjectByName(n)!;
          expect(o.children.length, n).toBe(0);
          expect((o as THREE.Mesh).castShadow, n).toBe(false);
        }
        expect(staticDraws + moving.length).toBeLessThanOrEqual(7);
        fxBare.dispose();
        fx.dispose();
        expect(scene.children.length).toBe(0);
        disposeMapMeshes(dressed);
        disposeMapMeshes(bare);
      });
    }
  }

  /**
   * Every mesh Depot builds on High, pinned from `origin/main` (the same probe run in a clean worktree of main): the
   * name, the vertices, the indices and a hash of the positions and the vertex colours. G9 touches the dressing engine
   * and the nature shapes, so this says Depot's dressing, props and ground come out of them unchanged, to the vertex.
   */
  const DEPOT_ON_MAIN = [
    'map-steelPlate v774 i1368 pca5bc22f cadc1818d',
    'map-concrete v5582 i20460 pbb34821a c8e168e66',
    'map-blockWall v6230 i18114 p74b2dedb c7fd54042',
    'map-barrier v21140 i33372 p7dfc9152 cb57e0a41',
    'map-crate v6584 i9888 p5c1e59af c13f494d7',
    'map-corrugated v24024 i46782 p54c857ef cefd4a3e4',
    'map-sandbag v1176 i1800 pa76b789d ca2e24669',
    'map-gabion v1006 i1728 p6264eebd c9424b872',
    'map-decals v1128 i1692 pdc0f84b5 c054cd98d',
    'map-junk v13344 i13344 pcf884546 ce093db17',
    'map-puddles v511 i2520 p332fd4c8 c415451dd',
  ];

  it('Depot draws exactly as it does on main: the same meshes, vertices and colours, and the same horizon', () => {
    const high = buildMapMeshes(DEPOT, textures(DEPOT), look(QUALITY.high), atlas);
    expect(
      meshes(high).map((m) => {
        const pos = m.geometry.getAttribute('position');
        const col = m.geometry.getAttribute('color');
        return `${m.name} v${pos.count} i${m.geometry.index?.count ?? 0} p${hashNums(pos.array)} c${col ? hashNums(col.array) : '-'}`;
      }),
    ).toEqual(DEPOT_ON_MAIN);
    disposeMapMeshes(high);
    for (const preset of ['low', 'medium', 'high'] as const) {
      const q = QUALITY[preset];
      const dressed = buildMapMeshes(DEPOT, textures(DEPOT), look(q), atlas);
      const bare = buildMapMeshes(bareOf(DEPOT), textures(DEPOT), look(q), atlas);
      const extra = triangles(dressed) - triangles(bare) + horizon(q, DEPOT).tris - horizon(q, bareOf(DEPOT)).tris;
      // What G8's dressing costs Depot: nothing on Low (no map detail), 6 718 triangles on Medium and High.
      expect(extra, preset).toBe(preset === 'low' ? 0 : 6718);
      // Depot has no skyline, so its horizon stays the tree ring alone at every Trees level.
      expect(horizon(q, DEPOT).names, preset).toEqual(['trees']);
      disposeMapMeshes(dressed);
      disposeMapMeshes(bare);
    }
  });

  for (const [name, map] of MAPS) {
    it(`${name}: Reduced motion stills every moving piece and the signs' flicker`, () => {
      const scene = new THREE.Scene();
      const group = buildMapMeshes(map, textures(map), look(QUALITY.high), atlas);
      const fx = new DressingEffects(scene, map);
      fx.setNight(true);
      fx.setMapGroup(group);
      fx.setQuality(QUALITY.high);
      fx.setMotion(false);
      const camera = new THREE.PerspectiveCamera();
      const snapshot = (): string =>
        scene.children
          .map((o) => {
            const m = o as THREE.InstancedMesh & THREE.Points;
            const matrix = m.instanceMatrix ? Array.from(m.instanceMatrix.array) : [];
            const points = m.geometry?.getAttribute('position') ? Array.from(m.geometry.getAttribute('position').array) : [];
            const alpha = m.geometry?.getAttribute('flyAlpha') ? Array.from(m.geometry.getAttribute('flyAlpha').array) : [];
            return `${o.name}:${o.visible}:${matrix.join(',')}:${points.join(',')}:${alpha.join(',')}`;
          })
          .join('|');
      fx.update(0.5, camera, vec3(2, 0, 0));
      const before = snapshot();
      for (let i = 0; i < 20; i++) fx.update(0.5, camera, vec3(2, 0, 0));
      expect(snapshot()).toBe(before);
      // No plane crosses, and the neon signs burn steady.
      expect(scene.children.some((o) => o.name === 'passingPlane' && o.visible)).toBe(false);
      const junk = group.getObjectByName('map-junk') as THREE.Mesh | undefined;
      const flicker = junk?.userData.neonFlicker as { value: THREE.Vector3 } | undefined;
      if (flicker) expect(flicker.value.toArray()).toEqual([1, 1, 1]);
      // With motion back they move again.
      fx.setMotion(FULL_MOTION.dust > 0);
      for (let i = 0; i < 10; i++) fx.update(0.2, camera, vec3());
      expect(snapshot()).not.toBe(before);
      fx.dispose();
      disposeMapMeshes(group);
    });
  }

  it('makes and shows the effects alike in the game’s call order: the quality first (CombatPresentation), then the map group and the night (MatchSession)', () => {
    for (const [name, map, effect] of [['Woodland', WOODLAND, 'fireflies'], ['Neon Heights', NEON_HEIGHTS, 'passingPlane']] as const) {
      const scene = new THREE.Scene();
      const group = buildMapMeshes(map, textures(map), look(QUALITY.medium), atlas);
      const fx = new DressingEffects(scene, map);
      // CombatPresentation's constructor: setQuality while the effects still think it is day.
      fx.setQuality(QUALITY.medium);
      // MatchSession, right after: the lighting (night on both maps here) and the built map's group.
      fx.setNight(true);
      fx.setMapGroup(group);
      const camera = new THREE.PerspectiveCamera();
      for (let i = 0; i < 30; i++) fx.update(1 / 60, camera, vec3());
      const o = scene.getObjectByName(effect);
      expect(o, `${name}: ${effect}`).toBeDefined();
      if (effect === 'fireflies') {
        expect(o!.visible, name).toBe(true);
        // By day they go, and come back at night; on Low they are hidden whatever the hour.
        fx.setNight(false);
        expect(o!.visible, `${name} by day`).toBe(false);
        fx.setNight(true);
        expect(o!.visible, `${name} at night again`).toBe(true);
        fx.setQuality(QUALITY.low);
        expect(o!.visible, `${name} on Low`).toBe(false);
      } else {
        // The airframe follows the night: dark by night, pale by day (its first vertex is the fuselage's).
        const colour = (o as THREE.Mesh).geometry.getAttribute('color');
        const first = (): number[] => [colour.getX(0), colour.getY(0), colour.getZ(0)].map((v) => +v.toFixed(4));
        const as = (hex: string): number[] => new THREE.Color(hex).toArray().map((v) => +v.toFixed(4));
        expect(first(), `${name} night airframe`).toEqual(as(PLANE.night));
        fx.setNight(false);
        expect(first(), `${name} day airframe`).toEqual(as(PLANE.day));
        fx.setNight(true);
        expect(first(), `${name} night again`).toEqual(as(PLANE.night));
      }
      fx.dispose();
      disposeMapMeshes(group);
    }
  });

  it('starts a plane pass every `every` seconds, start to start, and leaves the sky empty between passes', () => {
    const every = NEON_HEIGHTS.dressing!.plane!.every;
    const scene = new THREE.Scene();
    const fx = new DressingEffects(scene, NEON_HEIGHTS);
    fx.setQuality(QUALITY.high);
    fx.setNight(true);
    const camera = new THREE.PerspectiveCamera();
    const plane = scene.getObjectByName('passingPlane')!;
    const starts: number[] = [];
    let up = 0;
    let was = false;
    const dt = 0.05;
    for (let t = 0; t < 400; t += dt) {
      fx.update(dt, camera, vec3());
      if (plane.visible && !was) starts.push(t);
      if (plane.visible) up += dt;
      was = plane.visible;
    }
    expect(starts.length).toBeGreaterThanOrEqual(Math.floor(400 / every) - 1);
    for (let i = 1; i < starts.length; i++) expect(starts[i]! - starts[i - 1]!).toBeCloseTo(every, 0);
    // The crossing (PLANE.path / PLANE.speed) is shorter than the period: the sky is empty for part of each.
    expect(PLANE.path / PLANE.speed).toBeLessThan(every);
    expect(up / 400).toBeLessThan(0.6);
    fx.dispose();
  });

  it('the signs’ flicker is gentle: never a dip faster than three a second, never dark, and steady most of the time', () => {
    for (const channel of [1, 2, 3]) {
      let dips = 0;
      let low = 1;
      let steady = 0;
      const step = 1 / 120;
      let wasDown = false;
      for (let t = 0; t < 300; t += step) {
        const v = neonFlicker(channel, t);
        expect(v).toBeGreaterThanOrEqual(NEON.flicker.low - 1e-9);
        expect(v).toBeLessThanOrEqual(1 + 1e-9);
        low = Math.min(low, v);
        if (v > 0.999) steady++;
        const down = v < 0.9;
        if (down && !wasDown) dips++;
        wasDown = down;
      }
      // Three dips a second would be 900 in 300 s; a burst of two every ten seconds or so is far under that.
      expect(dips).toBeLessThan(300 * 3);
      expect(dips).toBeGreaterThan(0);
      expect(low).toBeLessThan(0.9);
      // Steady for most of the time (the dips are short bursts).
      expect(steady / (300 / step)).toBeGreaterThan(0.85);
    }
    // Channel 0 (a sign with no flicker) never changes.
    for (let t = 0; t < 50; t += 0.37) expect(neonFlicker(0, t)).toBe(1);
  });

  for (const [name, map] of MAPS) {
    it(`${name}: frees every new geometry, material and texture with the map and the match`, () => {
      const group = buildMapMeshes(map, textures(map), look(QUALITY.high), atlas);
      let freed = 0;
      for (const n of ['map-junk', 'map-puddles']) {
        const mesh = group.getObjectByName(n) as THREE.Mesh;
        mesh.geometry.addEventListener('dispose', () => freed++);
        (mesh.material as THREE.Material).addEventListener('dispose', () => freed++);
      }
      disposeMapMeshes(group);
      expect(freed, name).toBe(4);
      const scene = new THREE.Scene();
      const fx = new DressingEffects(scene, map);
      fx.setNight(true);
      fx.setQuality(QUALITY.high);
      let fxFreed = 0;
      for (const o of scene.children as (THREE.Mesh & { material: THREE.MeshBasicMaterial })[]) {
        o.geometry.addEventListener('dispose', () => fxFreed++);
        o.material.addEventListener('dispose', () => fxFreed++);
        o.material.map?.addEventListener('dispose', () => fxFreed++);
      }
      const made = scene.children.length;
      expect(made).toBeGreaterThan(0);
      fx.dispose();
      expect(scene.children.length).toBe(0);
      expect(fxFreed, name).toBeGreaterThanOrEqual(2 * made);
    });
  }

  it('the horizon is freed and rebuilt when the Trees setting changes, leaving nothing behind; the lights and plane ride the ring', () => {
    const scene = new THREE.Scene();
    const box = new THREE.Box3(new THREE.Vector3(-24, -0.5, -16), new THREE.Vector3(24, 8, 16));
    const a = addAtmosphere(scene, new THREE.Vector3(), new THREE.Vector3(0.4, 0.8, 0.3).normalize(), QUALITY.high, box, resolveLighting(NEON_HEIGHTS), NEON_HEIGHTS.dressing?.skyline, false, NEON_HEIGHTS.dressing?.plane);
    const parts = (o: THREE.Object3D | undefined): number[] => {
      const a = (o as THREE.Mesh | undefined)?.geometry.getAttribute('skyPart');
      return a ? [...new Set(a.array)].sort() : [];
    };
    // One mesh, one draw call: the ring, the skyline's lights and the plane (render/skyHost.ts).
    const ring = scene.getObjectByName('trees') as THREE.Mesh;
    expect(parts(ring)).toEqual([SKY_PART.ring, SKY_PART.light, SKY_PART.plane]);
    expect(ring.userData.skyPlane).toBeDefined();
    expect(scene.getObjectByName('skylineLights')).toBeUndefined();
    let freed = 0;
    ring.geometry.addEventListener('dispose', () => freed++);
    (ring.material as THREE.Material).addEventListener('dispose', () => freed++);
    // Trees: Simple draws no skyline: a plain ring again, on the program it always had.
    a.setQuality({ ...QUALITY.high, trees: 1 });
    expect(freed).toBe(2);
    const simple = scene.getObjectByName('trees') as THREE.Mesh;
    expect(parts(simple)).toEqual([]);
    expect(simple.userData.skyPlane).toBeUndefined();
    expect((simple.material as THREE.Material).customProgramCacheKey()).toBe('without-environment');
    a.setQuality(QUALITY.high);
    expect(parts(scene.getObjectByName('trees'))).toEqual([SKY_PART.ring, SKY_PART.light, SKY_PART.plane]);
    a.dispose();
    expect(scene.getObjectByName('trees')).toBeUndefined();
  });

  it('the plane rides the ring in the game: its matrix and whether it is up reach the ring, its own mesh undrawn', () => {
    const scene = new THREE.Scene();
    const box = new THREE.Box3(new THREE.Vector3(-24, -0.5, -16), new THREE.Vector3(24, 8, 16));
    const a = addAtmosphere(scene, new THREE.Vector3(), new THREE.Vector3(0.4, 0.8, 0.3).normalize(), QUALITY.medium, box, resolveLighting(NEON_HEIGHTS), NEON_HEIGHTS.dressing?.skyline, false, NEON_HEIGHTS.dressing?.plane);
    const fx = new DressingEffects(scene, NEON_HEIGHTS);
    fx.setQuality(QUALITY.medium);
    fx.setNight(true);
    const plane = scene.getObjectByName('passingPlane')!;
    const host = (scene.getObjectByName('trees') as THREE.Mesh).userData.skyPlane as SkyPlaneUniforms;
    const at = new THREE.Vector3();
    let up = 0;
    for (let i = 0; i < 400; i++) {
      fx.update(0.1, new THREE.PerspectiveCamera(), { x: 0, z: 0 });
      expect(plane.layers.mask, 'the plane’s own mesh is not drawn').toBe(0);
      expect(host.skyPlaneUp.value).toBe(plane.visible ? 1 : 0);
      if (plane.visible) {
        up++;
        expect(at.setFromMatrixPosition(host.skyPlane.value).distanceTo(new THREE.Vector3().setFromMatrixPosition(plane.matrix))).toBe(0);
        // Inside the ring's culling sphere, which holds every pass.
        expect((scene.getObjectByName('trees') as THREE.Mesh).geometry.boundingSphere!.containsPoint(at)).toBe(true);
      }
    }
    expect(up).toBeGreaterThan(0);
    // Reduced motion: the plane is gone from the ring at once.
    fx.setMotion(false);
    fx.update(0.1, new THREE.PerspectiveCamera(), { x: 0, z: 0 });
    expect(host.skyPlaneUp.value).toBe(0);
    // Without the ring (the Trees setting rebuilt it, or no host at all), the plane draws itself again.
    a.dispose();
    fx.setMotion(true);
    fx.update(0.1, new THREE.PerspectiveCamera(), { x: 0, z: 0 });
    expect(plane.layers.mask).toBe(1);
    fx.dispose();
  });

  for (const [name, map] of MAPS) {
    it(`${name}: the moving effects allocate nothing per frame (the same buffers after a thousand frames)`, () => {
      const scene = new THREE.Scene();
      const fx = new DressingEffects(scene, map);
      fx.setNight(true);
      fx.setQuality(QUALITY.high);
      const camera = new THREE.PerspectiveCamera();
      const buffers = scene.children.map((o) => {
        const m = o as THREE.InstancedMesh & THREE.Points;
        return [m.instanceMatrix?.array, m.geometry?.getAttribute('position')?.array, m.geometry?.getAttribute('flyAlpha')?.array, m.geometry?.getAttribute('puffAlpha')?.array];
      });
      for (let i = 0; i < 1000; i++) fx.update(1 / 60, camera, vec3(0.3, 0, -0.2));
      scene.children.forEach((o, i) => {
        const m = o as THREE.InstancedMesh & THREE.Points;
        expect(m.instanceMatrix?.array, name).toBe(buffers[i]![0]);
        expect(m.geometry?.getAttribute('position')?.array, name).toBe(buffers[i]![1]);
        expect(m.geometry?.getAttribute('flyAlpha')?.array, name).toBe(buffers[i]![2]);
        expect(m.geometry?.getAttribute('puffAlpha')?.array, name).toBe(buffers[i]![3]);
      });
      fx.dispose();
    });
  }
});
