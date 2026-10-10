import * as THREE from 'three';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { FULL_MOTION, REDUCED_MOTION } from '../config/accessibility';
import { NEON, PLANE } from '../config/dressing';
import { QUALITY, type QualitySettings, SURFACES } from '../config/render';
import type { MapData } from '../map/mapTypes';
import { NEON_HEIGHTS } from '../map/neonHeights';
import { WOODLAND } from '../map/woodland';
import { vec3 } from '../sim/vec';
import { addAtmosphere } from './atmosphere';
import { DressingEffects } from './dressingEffects';
import { Fireflies } from './fireflies';
import { resolveLighting } from './lightingPreset';
import { buildMapMeshes, disposeMapMeshes, type MapLook, mapLookOf, texturesFor } from './mapMeshes';
import { MapMeshCache } from './mapMeshCache';
import { neonFlicker } from './neonDressing';
import { PassingPlane } from './passingPlane';
import type { SurfaceTextures } from './proceduralTextures';

/**
 * G9 QA: the moving dressing and the cost of the static, attacked from the side the build worker's tests do not look
 * from: the order the game calls the effects in, the real flicker rate across every sign at once, exact stillness under
 * Reduced motion, real heap growth per frame, every object freed (listener on each one), vertex-exact Low, and the cost
 * the code states against the cost it has. Bugs found are pinned with `it.fails` (what must be true, failing today).
 */

/** A Node module by name, which the app's tsconfig (no Node types) does not resolve as a literal. */
const loadNode = (name: string): Promise<unknown> => import(/* @vite-ignore */ `node:${name}`);

const MAPS: readonly [string, MapData][] = [
  ['Woodland', WOODLAND],
  ['Neon Heights', NEON_HEIGHTS],
];
const stub = (ids: readonly (keyof typeof SURFACES.worldSize)[]): SurfaceTextures =>
  Object.fromEntries(ids.map((id) => [id, { texture: Object.assign(new THREE.Texture(), { name: id }), worldSize: SURFACES.worldSize[id], mean: 1 }])) as unknown as SurfaceTextures;
const look = (q: QualitySettings): MapLook => ({ ...mapLookOf(q, null), relief: false });
const bareOf = (map: MapData): MapData => {
  const bare: MapData = { ...map };
  delete bare.dressing;
  return bare;
};
const camera = (): THREE.PerspectiveCamera => new THREE.PerspectiveCamera();
const WIND = { x: 1, z: 0.5 };
const meshesOf = (g: THREE.Object3D): THREE.Mesh[] => g.children.filter((o): o is THREE.Mesh => o instanceof THREE.Mesh);
const tris = (m: THREE.Mesh): number => (m.geometry.index ? m.geometry.index.count : m.geometry.getAttribute('position').count) / 3;
const named = (scene: THREE.Scene, n: string): THREE.Object3D | undefined => scene.children.find((o) => o.name === n);

function fnv(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 0x01000193) >>> 0;
  return h.toString(16).padStart(8, '0');
}
const hashNums = (a: ArrayLike<number>): string => fnv(Array.from(a, (v) => Math.round(v * 4096)).join(','));
/** Every mesh under `g`: name, vertices, indices, material type and program key, and a hash of its positions and colours. */
function meshSignature(g: THREE.Object3D): string[] {
  const out: string[] = [];
  g.traverse((o) => {
    if (!(o instanceof THREE.Mesh)) return;
    const m = o.material as THREE.Material;
    out.push(
      [o.name, o.geometry.getAttribute('position').count, o.geometry.index?.count ?? 0, m.type, m.customProgramCacheKey(), hashNums(o.geometry.getAttribute('position').array), o.geometry.getAttribute('color') ? hashNums(o.geometry.getAttribute('color').array) : '', o.castShadow, o.visible].join(' '),
    );
  });
  return out;
}

/** The horizon (tree ring, skyline, lights) a map draws at a quality, as meshes' signatures. */
function horizonSignature(q: QualitySettings, map: MapData): string[] {
  const scene = new THREE.Scene();
  const box = new THREE.Box3(new THREE.Vector3(-60, -0.5, -40), new THREE.Vector3(60, 8, 40));
  const a = addAtmosphere(scene, new THREE.Vector3(), new THREE.Vector3(0.4, 0.8, 0.3).normalize(), q, box, resolveLighting(map), map.dressing?.skyline, map.blocks.some((b) => b.kind === 'tree'));
  const sig = meshSignature(scene).filter((s) => /^(trees|skylineLights) /.test(s));
  a.dispose();
  return sig;
}

beforeAll(() => {
  vi.stubGlobal('document', { createElement: () => ({ width: 0, height: 0, getContext: () => null }) });
});
afterAll(() => vi.unstubAllGlobals());

// --- Criterion 3: Low is unchanged, vertex for vertex ----------------------------------------------------------------------

describe('G9 QA: Low draws exactly what it drew before (acceptance 3)', { timeout: 30_000 }, () => {
  for (const [name, map] of MAPS) {
    it(`${name}: Low’s map meshes and horizon are vertex-for-vertex, colour-for-colour the bare map’s`, () => {
      const q = QUALITY.low;
      const dressed = buildMapMeshes(map, stub(texturesFor(map)), look(q), () => new THREE.Texture());
      const bare = buildMapMeshes(bareOf(map), stub(texturesFor(bareOf(map))), look(q), () => new THREE.Texture());
      expect(meshSignature(dressed)).toEqual(meshSignature(bare));
      expect(horizonSignature(q, map)).toEqual(horizonSignature(q, bareOf(map)));
      disposeMapMeshes(dressed);
      disposeMapMeshes(bare);
    });

    it(`${name}: Low adds no moving effect in any combination of night and Reduced motion, and a High -> Low switch hides all of them`, () => {
      for (const night of [false, true]) {
        for (const motion of [false, true]) {
          const scene = new THREE.Scene();
          const group = buildMapMeshes(map, stub(texturesFor(map)), look(QUALITY.high), () => new THREE.Texture());
          const fx = new DressingEffects(scene, map);
          fx.setMotion(motion);
          fx.setNight(night);
          fx.setMapGroup(group);
          fx.setQuality(QUALITY.low);
          for (let i = 0; i < 120; i++) fx.update(1 / 60, camera(), WIND);
          expect(scene.children, `${name} night ${night} motion ${motion}`).toHaveLength(0);
          fx.setQuality(QUALITY.high);
          for (let i = 0; i < 600; i++) fx.update(1 / 60, camera(), WIND);
          const high = scene.children.length;
          expect(high).toBeGreaterThan(0);
          fx.setQuality(QUALITY.low);
          for (let i = 0; i < 60; i++) fx.update(1 / 60, camera(), WIND);
          expect(scene.children.filter((o) => o.visible).map((o) => o.name)).toEqual([]);
          fx.setQuality(QUALITY.high);
          fx.setQuality(QUALITY.medium);
          expect(scene.children.length, 'no second copy of any effect after High, Low, High, Medium').toBe(high);
          fx.dispose();
          disposeMapMeshes(group);
        }
      }
    });
  }
});

// --- Cost: the code states what the dressing costs; the numbers must be the real ones --------------------------------------

/** The map's triangles the dressing adds at a quality (its meshes, the tree ring and the skyline's lights). */
function extraTriangles(map: MapData, q: QualitySettings): number {
  const count = (m: MapData): number => {
    const g = buildMapMeshes(m, stub(texturesFor(m)), look(q), () => new THREE.Texture());
    const own = meshesOf(g).reduce((n, mesh) => n + tris(mesh), 0);
    disposeMapMeshes(g);
    const scene = new THREE.Scene();
    const a = addAtmosphere(scene, new THREE.Vector3(), new THREE.Vector3(0.4, 0.8, 0.3).normalize(), q, new THREE.Box3(new THREE.Vector3(-60, -0.5, -40), new THREE.Vector3(60, 8, 40)), resolveLighting(m), m.dressing?.skyline, m.blocks.some((b) => b.kind === 'tree'));
    const ring = meshesOf(scene).filter((o) => o.name === 'trees' || o.name === 'skylineLights').reduce((n, mesh) => n + tris(mesh), 0);
    a.dispose();
    return own + ring;
  };
  return count(map) - count(bareOf(map));
}

describe('G9 QA: the cost the code states is the cost it has (acceptance 3: “each cost stated in the code”)', { timeout: 30_000 }, () => {
  let source = '';
  beforeAll(async () => {
    const fs = (await loadNode('fs')) as unknown as { readFileSync(p: string, e: 'utf8'): string };
    source = fs.readFileSync(new URL('../config/dressing.ts', import.meta.url).pathname, 'utf8');
  });
  const stated = (map: string): number => Number(new RegExp(`${map} \\(Medium, High\\): ([\\d ]+) more triangles`).exec(source)![1]!.replace(/ /g, ''));

  it('Woodland: the stated 11 636 more triangles is what Medium and High draw', () => {
    expect(stated('Woodland')).toBe(11636);
    for (const q of [QUALITY.medium, QUALITY.high]) expect(extraTriangles(WOODLAND, q)).toBe(stated('Woodland'));
  });

  // Was BUG G9-QA-6 (fixed): src/config/dressing.ts said Neon Heights costs 9 546 more triangles (the junk mesh 5 558),
  // but the junk mesh is 5 666 and the whole is 9 654: the stated figure was 108 triangles stale. Under the 15 000 cap,
  // but the criterion is that the cost stated in the code is the real one.
  it('Neon Heights: the stated 9 654 more triangles is what Medium and High draw', () => {
    expect(stated('Neon Heights')).toBe(9654);
    for (const q of [QUALITY.medium, QUALITY.high]) expect(extraTriangles(NEON_HEIGHTS, q)).toBe(stated('Neon Heights'));
  });
});

// --- Criterion 4: moving dressing --------------------------------------------------------------------------------------------

describe('G9 QA: the order the game calls DressingEffects in (acceptance 1: fireflies at night)', () => {
  // The real order, from CombatPresentation: its constructor calls setQuality(quality) while the effects still think it
  // is day, and MatchSession calls setLighting(preset) -> setNight(true) right after. Woodland is a night map.
  // Was BUG G9-QA-4 (fixed) (severe): the fireflies (and the plane's night airframe) are only made inside setQuality, so a night map
  // that sets its quality first, as the game does, never gets its fireflies until the player changes a graphics setting.
  it('Woodland gets its fireflies when setNight(true) comes after setQuality(High), the order the game uses', () => {
    const scene = new THREE.Scene();
    const fx = new DressingEffects(scene, WOODLAND);
    fx.setQuality(QUALITY.high);
    fx.setNight(true);
    for (let i = 0; i < 10; i++) fx.update(1 / 60, camera(), WIND);
    const flies = named(scene, 'fireflies');
    expect(flies, 'fireflies in the scene').toBeDefined();
    expect(flies!.visible).toBe(true);
    fx.dispose();
  });

  it('control: the fireflies appear when the night is set first (the order the worker’s tests use)', () => {
    const scene = new THREE.Scene();
    const fx = new DressingEffects(scene, WOODLAND);
    fx.setNight(true);
    fx.setQuality(QUALITY.high);
    expect(named(scene, 'fireflies')?.visible).toBe(true);
    fx.dispose();
  });

  it('control: by day there are no fireflies at any quality or motion', () => {
    for (const motion of [false, true]) {
      const scene = new THREE.Scene();
      const fx = new DressingEffects(scene, WOODLAND);
      fx.setMotion(motion);
      fx.setNight(false);
      fx.setQuality(QUALITY.high);
      fx.setQuality(QUALITY.medium);
      expect(named(scene, 'fireflies')).toBeUndefined();
      fx.dispose();
    }
  });

  // Was BUG G9-QA-5 (fixed): the plane's airframe colour is chosen when it is built, on the same first setQuality, so with the game's
  // order a night map gets the pale day airframe (a light grey shape on a dark sky) instead of the dark night one.
  it('Neon Heights’ plane is the night airframe when setNight(true) comes after setQuality(High)', () => {
    const scene = new THREE.Scene();
    const fx = new DressingEffects(scene, NEON_HEIGHTS);
    fx.setQuality(QUALITY.high);
    fx.setNight(true);
    const plane = named(scene, 'passingPlane') as THREE.Mesh;
    const colours = plane.geometry.getAttribute('color');
    const dark = new THREE.Color(PLANE.night);
    // The fuselage is the first part: its first vertex.
    expect([colours.getX(0), colours.getY(0), colours.getZ(0)].map((v) => +v.toFixed(3))).toEqual([dark.r, dark.g, dark.b].map((v) => +v.toFixed(3)));
    fx.dispose();
  });
});

describe('G9 QA: the plane (acceptance 1: “a passing plane”)', () => {
  it('flies high over the middle on a seeded line, the same for the same seed, and is hidden between passes', () => {
    const run = (): string => {
      const p = new PassingPlane({ x: 0, z: 0 }, 130, 20, true);
      const seen: string[] = [];
      let visibleFor = 0;
      for (let t = 0; t < 400; t += 0.5) {
        p.update(0.5);
        if (p.object.visible) {
          visibleFor += 0.5;
          const m = p.object.matrix.elements;
          expect(m[13]!, 'height').toBeGreaterThanOrEqual(130 * 0.85 - 1e-6);
          expect(m[13]!, 'height').toBeLessThanOrEqual(130 * 1.15 + 1e-6);
          seen.push(`${m[12]!.toFixed(3)},${m[14]!.toFixed(3)}`);
        }
      }
      expect(visibleFor).toBeGreaterThan(0);
      expect(visibleFor).toBeLessThan(400);
      p.dispose();
      return seen.join('|');
    };
    expect(run()).toBe(run());
  });

  // Was BUG G9-QA-7 (fixed): MapDressing.plane is “how often one passes (s)” and Neon's data says “about every twenty seconds”, but
  // `every` is only the empty gap: a pass takes 260 m / 16 m/s = 16 s on top, so a plane starts a pass every 36 s and is
  // in the sky 45 % of the time.
  it('a pass starts about every `every` seconds (20), not every 36', () => {
    const p = new PassingPlane({ x: 0, z: 0 }, 130, 20, true);
    const starts: number[] = [];
    let was = false;
    for (let t = 0; t < 600; t += 0.1) {
      p.update(0.1);
      if (p.object.visible && !was) starts.push(t);
      was = p.object.visible;
    }
    p.dispose();
    expect(starts.length).toBeGreaterThan(5);
    for (let i = 1; i < starts.length; i++) expect(starts[i]! - starts[i - 1]!).toBeLessThan(25);
  });
});

/** The flicker uniform a built Neon Heights junk mesh carries. */
function flickerOf(group: THREE.Object3D): { value: THREE.Vector3 } {
  return (group.getObjectByName('map-junk') as THREE.Mesh).userData.neonFlicker as { value: THREE.Vector3 };
}

describe('G9 QA: Reduced motion stills everything, exactly (acceptance 4)', () => {
  it('Neon Heights: the signs burn at exactly 1 for five simulated minutes with Reduced motion on, across every dip the signs would have had', () => {
    const group = buildMapMeshes(NEON_HEIGHTS, stub(texturesFor(NEON_HEIGHTS)), look(QUALITY.high), () => new THREE.Texture());
    const flicker = flickerOf(group);
    expect(flicker).toBeDefined();
    const scene = new THREE.Scene();
    const fx = new DressingEffects(scene, NEON_HEIGHTS);
    fx.setNight(true);
    fx.setQuality(QUALITY.high);
    fx.setMotion(REDUCED_MOTION.dust > 0);
    fx.setMapGroup(group);
    let dipsThatWouldHaveHappened = 0;
    for (let t = 0; t < 300; t += 0.1) {
      if ([1, 2, 3].some((c) => neonFlicker(c, t) < 0.9)) dipsThatWouldHaveHappened++;
      fx.update(0.1, camera(), WIND);
      expect(flicker.value.toArray()).toEqual([1, 1, 1]);
    }
    expect(dipsThatWouldHaveHappened).toBeGreaterThan(10);
    fx.dispose();
    disposeMapMeshes(group);
  });

  it('turning Reduced motion on in the middle of a dip brings the signs back to full at once and keeps them there; off again, they flicker again', () => {
    const group = buildMapMeshes(NEON_HEIGHTS, stub(texturesFor(NEON_HEIGHTS)), look(QUALITY.high), () => new THREE.Texture());
    const flicker = flickerOf(group);
    const fx = new DressingEffects(new THREE.Scene(), NEON_HEIGHTS);
    fx.setNight(true);
    fx.setQuality(QUALITY.high);
    fx.setMapGroup(group);
    let dimmed = false;
    for (let i = 0; i < 6000 && !dimmed; i++) {
      fx.update(1 / 60, camera(), WIND);
      dimmed = flicker.value.toArray().some((v) => v < 0.9);
    }
    expect(dimmed, 'a dip within 100 s').toBe(true);
    fx.setMotion(false);
    expect(flicker.value.toArray()).toEqual([1, 1, 1]);
    for (let i = 0; i < 600; i++) fx.update(1 / 60, camera(), WIND);
    expect(flicker.value.toArray()).toEqual([1, 1, 1]);
    fx.setMotion(true);
    let again = false;
    for (let i = 0; i < 60 * 120 && !again; i++) {
      fx.update(1 / 60, camera(), WIND);
      again = flicker.value.toArray().some((v) => v < 0.9);
    }
    expect(again).toBe(true);
    fx.dispose();
    disposeMapMeshes(group);
  });

  it('hands a map group over after Reduced motion is already on: the signs start at 1 and stay', () => {
    const group = buildMapMeshes(NEON_HEIGHTS, stub(texturesFor(NEON_HEIGHTS)), look(QUALITY.high), () => new THREE.Texture());
    const flicker = flickerOf(group);
    flicker.value.set(0.4, 0.5, 0.6);
    const fx = new DressingEffects(new THREE.Scene(), NEON_HEIGHTS);
    fx.setMotion(false);
    fx.setMapGroup(group);
    expect(flicker.value.toArray()).toEqual([1, 1, 1]);
    for (let i = 0; i < 100; i++) fx.update(0.5, camera(), WIND);
    expect(flicker.value.toArray()).toEqual([1, 1, 1]);
    fx.dispose();
    disposeMapMeshes(group);
  });

  it('the plane, mid-pass, is gone the moment Reduced motion is on and stays gone through five minutes; it was up before', () => {
    const scene = new THREE.Scene();
    const fx = new DressingEffects(scene, NEON_HEIGHTS);
    fx.setNight(true);
    fx.setQuality(QUALITY.high);
    const plane = named(scene, 'passingPlane') as THREE.Mesh;
    let up = 0;
    for (let i = 0; i < 600; i++) {
      fx.update(0.1, camera(), WIND);
      if (plane.visible) up++;
    }
    expect(up).toBeGreaterThan(0);
    while (!plane.visible) fx.update(0.1, camera(), WIND);
    fx.setMotion(false);
    expect(plane.visible).toBe(false);
    for (let i = 0; i < 3000; i++) {
      fx.update(0.1, camera(), WIND);
      expect(plane.visible).toBe(false);
    }
    fx.dispose();
  });

  it('a plane made after Reduced motion is on never shows; the fireflies sit at their base, at full glow, and never move', () => {
    const neon = new THREE.Scene();
    const fn = new DressingEffects(neon, NEON_HEIGHTS);
    fn.setMotion(false);
    fn.setNight(true);
    fn.setQuality(QUALITY.high);
    for (let i = 0; i < 1000; i++) {
      fn.update(0.1, camera(), WIND);
      expect((named(neon, 'passingPlane') as THREE.Mesh).visible).toBe(false);
    }
    fn.dispose();
    const woods = new THREE.Scene();
    const fw = new DressingEffects(woods, WOODLAND);
    fw.setMotion(false);
    fw.setNight(true);
    fw.setQuality(QUALITY.high);
    const flies = named(woods, 'fireflies') as THREE.Points;
    const pos = Float32Array.from(flies.geometry.getAttribute('position').array);
    for (let i = 0; i < 500; i++) fw.update(0.3, camera(), WIND);
    expect(Array.from(flies.geometry.getAttribute('position').array)).toEqual(Array.from(pos));
    expect(Array.from(flies.geometry.getAttribute('flyAlpha').array).every((a) => a === 1)).toBe(true);
    expect(flies.visible).toBe(true);
    fw.dispose();
  });

  it('feet kick up no dust under Reduced motion, and the full-motion value of the setting is what turns the effects back on', () => {
    expect(REDUCED_MOTION.dust).toBe(0);
    expect(FULL_MOTION.dust).toBe(1);
  });
});

describe('G9 QA: the signs’ flicker never flashes more than three times a second (acceptance 4)', () => {
  /** Rising edges of “dimmer than 90 %” (a flash: a drop of more than a tenth of the light) of one or more channels. */
  const dipTimes = (channels: readonly number[], seconds: number): number[] => {
    const out: number[] = [];
    const step = 1 / 120;
    for (const c of channels) {
      let down = false;
      for (let t = 0; t < seconds; t += step) {
        const d = neonFlicker(c, t) < 0.9;
        if (d && !down) out.push(t);
        down = d;
      }
    }
    return out.sort((a, b) => a - b);
  };
  /** The most dips in any one-second window. */
  const worstSecond = (times: readonly number[]): number => {
    let worst = 0;
    for (let i = 0; i < times.length; i++) {
      let j = i;
      while (j < times.length && times[j]! - times[i]! < 1) j++;
      worst = Math.max(worst, j - i);
    }
    return worst;
  };

  it('no sign dips more than twice in any one second, in an hour, and none is ever darker than the floor', () => {
    for (const c of [1, 2, 3]) {
      expect(worstSecond(dipTimes([c], 3600)), `channel ${c}`).toBeLessThanOrEqual(2);
      let min = 1;
      for (let t = 0; t < 3600; t += 0.05) min = Math.min(min, neonFlicker(c, t));
      expect(min).toBeGreaterThanOrEqual(NEON.flicker.low - 1e-9);
    }
  });

  // Was BUG G9-QA-8 (fixed): each channel dips twice in a burst, but the three channels have unrelated periods and sometimes burst
  // together: with all three flickering signs in view (they hang in four different alleys, so a rooftop sees them at
  // once) the screen flashes six times in a second. The limit is three a second for the picture, not for each sign.
  it('all the flickering signs together never dip more than three times in any one second', () => {
    expect(worstSecond(dipTimes([1, 2, 3], 3600))).toBeLessThanOrEqual(3);
  });

  it('is exactly the flicker the shader gets: the uniform is neonFlicker(channel, t) frame for frame', () => {
    const group = buildMapMeshes(NEON_HEIGHTS, stub(texturesFor(NEON_HEIGHTS)), look(QUALITY.high), () => new THREE.Texture());
    const flicker = flickerOf(group);
    const fx = new DressingEffects(new THREE.Scene(), NEON_HEIGHTS);
    fx.setMapGroup(group);
    let t = 0;
    for (let i = 0; i < 2000; i++) {
      const dt = 1 / 30;
      fx.update(dt, camera(), WIND);
      t += dt;
      expect(flicker.value.toArray()).toEqual([neonFlicker(1, t), neonFlicker(2, t), neonFlicker(3, t)]);
    }
    fx.dispose();
    disposeMapMeshes(group);
  });
});

// --- Pooling: nothing allocated per frame ---------------------------------------------------------------------------------

describe('G9 QA: the moving effects allocate nothing per frame (acceptance 4)', () => {
  /** Bytes the young generation grew by over a batch of `frames` calls of `step` (a scavenge in the batch shows as a drop and is dropped). */
  async function growthPerBatch(step: () => void, batches: number, frames: number): Promise<number[]> {
    const v8 = (await loadNode('v8')) as unknown as { getHeapSpaceStatistics(): { space_name: string; space_used_size: number }[] };
    const young = (): number => v8.getHeapSpaceStatistics().find((s) => s.space_name === 'new_space')!.space_used_size;
    for (let i = 0; i < 5000; i++) step();
    const out: number[] = [];
    for (let b = 0; b < batches; b++) {
      const before = young();
      for (let i = 0; i < frames; i++) step();
      out.push(young() - before);
    }
    return out.filter((d) => d >= 0).sort((a, b) => a - b);
  }

  /** What counts as allocating: a few small objects a frame is 128 bytes; boxed doubles from a flicker are about 50. */
  const BUDGET = 128_000;

  it('control: the probe sees four small objects allocated per frame', async () => {
    const ring: THREE.Vector3[] = new Array<THREE.Vector3>(64);
    let n = 0;
    const step = (): void => {
      for (let k = 0; k < 4; k++) ring[n++ % 64] = new THREE.Vector3(n, k, 0.5);
    };
    const grown = await growthPerBatch(step, 20, 1000);
    expect(grown[grown.length - 1]!).toBeGreaterThan(BUDGET);
  });

  for (const [name, map] of MAPS) {
    it(`${name}: sixty thousand frames at every effect and the flicker grow the young generation by under 128 bytes a frame`, async () => {
      const scene = new THREE.Scene();
      const group = buildMapMeshes(map, stub(texturesFor(map)), look(QUALITY.high), () => new THREE.Texture());
      const fx = new DressingEffects(scene, map);
      fx.setNight(true);
      fx.setMapGroup(group);
      fx.setQuality(QUALITY.high);
      const cam = camera();
      const wind = { x: 2, z: -1 };
      const grown = await growthPerBatch(() => fx.update(1 / 60, cam, wind), 40, 1000);
      expect(grown.length).toBeGreaterThan(10);
      // The probe's own bookkeeping is about 2 500 a batch. (The neon flicker's three boxed doubles are about 50 a frame.)
      expect(grown[Math.floor(grown.length * 0.9)]!).toBeLessThan(BUDGET);
      fx.dispose();
      disposeMapMeshes(group);
    });
  }

  it('keeps one instanced / points / mesh object per effect through a thousand setQuality calls', () => {
    for (const [, map] of MAPS) {
      const scene = new THREE.Scene();
      const fx = new DressingEffects(scene, map);
      fx.setNight(true);
      fx.setQuality(QUALITY.high);
      const first = [...scene.children];
      for (let i = 0; i < 1000; i++) fx.setQuality(i % 3 === 0 ? QUALITY.low : i % 3 === 1 ? QUALITY.medium : QUALITY.high);
      fx.setQuality(QUALITY.high);
      expect(scene.children).toEqual(first);
      fx.dispose();
    }
  });
});

// --- Culling: the spheres are right ----------------------------------------------------------------------------------------

describe('G9 QA: the pooled effects stay inside their culling spheres (they are drawn when on screen, and only then)', () => {
  it('Neon Heights’ steam: every puff of a long loop at the strongest wind, in any direction, is inside the sphere', () => {
    for (const wind of [{ x: 4, z: 0 }, { x: -4, z: 0 }, { x: 0, z: 4 }, { x: 0, z: -4 }, { x: 2.83, z: 2.83 }]) {
      const scene = new THREE.Scene();
      const fx = new DressingEffects(scene, NEON_HEIGHTS);
      fx.setNight(true);
      fx.setQuality(QUALITY.high);
      const steam = named(scene, 'steamPlumes') as THREE.InstancedMesh;
      const sphere = steam.boundingSphere!;
      for (let t = 0; t < 90; t += 0.25) {
        fx.update(0.25, camera(), wind);
        const m = steam.instanceMatrix.array;
        for (let i = 0; i < steam.count; i++) expect(Math.hypot(m[i * 16 + 12]! - sphere.center.x, m[i * 16 + 13]! - sphere.center.y, m[i * 16 + 14]! - sphere.center.z)).toBeLessThanOrEqual(sphere.radius);
      }
      fx.dispose();
    }
  });

  it('the steam is in view looking at the vents and out of view looking away, from outside the map; the fireflies likewise', () => {
    const view = (cam: THREE.PerspectiveCamera, o: THREE.Object3D): boolean => {
      cam.updateMatrixWorld();
      cam.updateProjectionMatrix();
      return new THREE.Frustum().setFromProjectionMatrix(new THREE.Matrix4().multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse)).intersectsObject(o);
    };
    const cam = new THREE.PerspectiveCamera(70, 1.78, 0.1, 400);
    const neon = new THREE.Scene();
    const fn = new DressingEffects(neon, NEON_HEIGHTS);
    fn.setNight(true);
    fn.setQuality(QUALITY.high);
    const steam = named(neon, 'steamPlumes') as THREE.InstancedMesh;
    // The vents lie within x -21..12, z -15..11, steam rising to 4 m: stand 90 m east of them.
    cam.position.set(90, 3, 0);
    cam.lookAt(0, 3, 0);
    expect(view(cam, steam)).toBe(true);
    cam.lookAt(200, 3, 0);
    expect(view(cam, steam)).toBe(false);
    fn.dispose();
    const woods = new THREE.Scene();
    const fw = new DressingEffects(woods, WOODLAND);
    fw.setNight(true);
    fw.setQuality(QUALITY.high);
    const flies = named(woods, 'fireflies') as THREE.Points;
    cam.position.set(-200, 1.7, 0);
    cam.lookAt(0, 1.7, 0);
    expect(view(cam, flies)).toBe(true);
    cam.lookAt(-400, 1.7, 0);
    expect(view(cam, flies)).toBe(false);
    fw.dispose();
  });
});

// --- Fireflies on the ground ------------------------------------------------------------------------------------------------

describe('G9 QA: the fireflies hang over the ground, inside the field, the same every time (acceptance 1, 5)', () => {
  const t = WOODLAND.terrain!;
  const bounds = new THREE.Box3(new THREE.Vector3(t.minX, 0, t.minZ), new THREE.Vector3(t.minX + t.cols * t.cell, 0, t.minZ + t.rows * t.cell));
  it('keeps every fly inside the terrain, above its ground and under 2.5 m, through a full drift', async () => {
    const { terrainHeightAt } = await import('../map/terrain');
    const f = new Fireflies(WOODLAND.dressing!.fireflies!.count, t, WOODLAND.foliage ?? [], bounds);
    f.object.visible = true;
    const pos = f.object.geometry.getAttribute('position');
    expect(pos.count).toBe(150);
    for (let step = 0; step < 400; step++) {
      f.update(0.25);
      for (let i = 0; i < pos.count; i++) {
        const x = pos.getX(i);
        const z = pos.getZ(i);
        // A fly by the fence may drift a hand's breadth past the terrain's edge (nothing is drawn there to hang over).
        expect(x, `fly ${i}`).toBeGreaterThan(bounds.min.x - 0.5);
        expect(x, `fly ${i}`).toBeLessThan(bounds.max.x + 0.5);
        expect(z, `fly ${i}`).toBeGreaterThan(bounds.min.z - 0.5);
        expect(z, `fly ${i}`).toBeLessThan(bounds.max.z + 0.5);
        const g = terrainHeightAt(t, x, z);
        if (g === undefined) continue;
        expect(pos.getY(i) - g).toBeGreaterThan(0.1);
        expect(pos.getY(i) - g).toBeLessThan(2.6);
      }
    }
    f.dispose();
  });

  it('places the same flies for the same seed with Math.random forbidden', () => {
    const real = Math.random.bind(Math);
    const spy = vi.spyOn(Math, 'random').mockImplementation(() => {
      if (!/node_modules\/three\//.test(new Error().stack ?? '')) throw new Error('Math.random used by the fireflies');
      return real();
    });
    try {
      const a = new Fireflies(150, t, WOODLAND.foliage ?? [], bounds);
      const b = new Fireflies(150, t, WOODLAND.foliage ?? [], bounds);
      expect(Array.from(a.object.geometry.getAttribute('position').array)).toEqual(Array.from(b.object.geometry.getAttribute('position').array));
      a.dispose();
      b.dispose();
    } finally {
      spy.mockRestore();
    }
  });

  it('pulses slowly: no fly changes by more than 90 % of its glow in under a third of a second, and none is ever dark', () => {
    const f = new Fireflies(150, t, WOODLAND.foliage ?? [], bounds);
    f.object.visible = true;
    const alpha = f.object.geometry.getAttribute('flyAlpha');
    // (The very first update takes every fly from its construction value of 1 to its place in the pulse.)
    f.update(1 / 60);
    let last = Float32Array.from(alpha.array);
    let worst = 0;
    let min = 1;
    for (let s = 0; s < 4000; s++) {
      f.update(1 / 60);
      for (let i = 0; i < alpha.count; i++) {
        worst = Math.max(worst, Math.abs(alpha.getX(i) - last[i]!));
        min = Math.min(min, alpha.getX(i));
      }
      last = Float32Array.from(alpha.array);
    }
    // A change of 0.9 in 1/60 s would be a flash; the real pulse takes seconds.
    expect(worst).toBeLessThan(0.05);
    expect(min).toBeGreaterThan(0);
    f.dispose();
  });
});

// --- Dispose frees everything ------------------------------------------------------------------------------------------------

/** Every geometry, material and texture reachable from an object (and its materials' textures), once each. */
function resourcesOf(root: THREE.Object3D): { geometries: Set<THREE.BufferGeometry>; materials: Set<THREE.Material>; textures: Set<THREE.Texture> } {
  const geometries = new Set<THREE.BufferGeometry>();
  const materials = new Set<THREE.Material>();
  const textures = new Set<THREE.Texture>();
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.geometry) geometries.add(m.geometry);
    for (const mat of ([] as THREE.Material[]).concat(m.material ?? [])) {
      materials.add(mat);
      for (const v of Object.values(mat as unknown as Record<string, unknown>)) if (v instanceof THREE.Texture) textures.add(v);
    }
  });
  return { geometries, materials, textures };
}
/** Listen for dispose on all of them; returns what has NOT been disposed. */
function watch(r: ReturnType<typeof resourcesOf>): () => string[] {
  const live = new Map<object, string>();
  const note = (o: THREE.EventDispatcher<{ dispose: object }>, label: string): void => {
    live.set(o, label);
    o.addEventListener('dispose', () => live.delete(o));
  };
  for (const g of r.geometries) note(g as never, 'geometry');
  for (const m of r.materials) note(m as never, `material ${m.type}`);
  for (const t of r.textures) note(t as never, `texture ${t.name || t.uuid}`);
  return () => [...live.values()];
}

describe('G9 QA: dispose frees every geometry, material and texture the dressing made (acceptance 4)', () => {
  for (const [name, map] of MAPS) {
    it(`${name}: after the effects, the map’s meshes and the horizon are disposed, nothing the dressing built is left live and the scene is empty`, () => {
      const textures = stub(texturesFor(map));
      const shared = new Set<THREE.Texture>(Object.values(textures).map((t) => t.texture));
      const scene = new THREE.Scene();
      const group = buildMapMeshes(map, textures, look(QUALITY.high), () => new THREE.Texture());
      scene.add(group);
      const box = new THREE.Box3(new THREE.Vector3(-60, -0.5, -40), new THREE.Vector3(60, 8, 40));
      const atmosphere = addAtmosphere(scene, new THREE.Vector3(), new THREE.Vector3(0.4, 0.8, 0.3).normalize(), QUALITY.high, box, resolveLighting(map), map.dressing?.skyline, map.blocks.some((b) => b.kind === 'tree'));
      const fx = new DressingEffects(scene, map);
      fx.setNight(true);
      fx.setMapGroup(group);
      fx.setQuality(QUALITY.high);
      fx.afterTick([{ type: 'footstep', characterId: 0, kind: 'sprint' } as never], [{ id: 0, position: vec3(0, 0, 0) } as never], vec3());
      for (let i = 0; i < 600; i++) fx.update(0.1, camera(), WIND);
      const all = resourcesOf(scene);
      // The surface textures belong to the renderer and outlive the map.
      for (const t of shared) all.textures.delete(t);
      const undisposed = watch(all);
      const count = all.geometries.size + all.materials.size;
      expect(count).toBeGreaterThan(20);
      fx.dispose();
      atmosphere.dispose();
      disposeMapMeshes(group);
      expect(undisposed(), `${name}: left live`).toEqual([]);
      expect(scene.children.filter((o) => o.name !== '')).toEqual([]);
    });
  }

  it('dispose twice is harmless, and a disposed effects object makes no scene change when asked to update', () => {
    const scene = new THREE.Scene();
    const fx = new DressingEffects(scene, NEON_HEIGHTS);
    fx.setNight(true);
    fx.setQuality(QUALITY.high);
    fx.dispose();
    fx.dispose();
    fx.update(0.1, camera(), WIND);
    fx.afterTick([], [], vec3());
    expect(scene.children).toHaveLength(0);
  });

  it('switching High -> Low -> High through the map cache frees the old junk and puddle meshes each time and loses no flicker', () => {
    const cache = new MapMeshCache(() => new THREE.Texture());
    const textures = stub(texturesFor(NEON_HEIGHTS));
    const scene = new THREE.Scene();
    const fx = new DressingEffects(scene, NEON_HEIGHTS);
    fx.setNight(true);
    let group = cache.take(NEON_HEIGHTS, textures, look(QUALITY.high));
    scene.add(group);
    fx.setMapGroup(group);
    for (let round = 0; round < 3; round++) {
      const old = group;
      const live = watch(resourcesOf(old));
      const shared = new Set<THREE.Texture>(Object.values(textures).map((t) => t.texture));
      group = cache.restyle(textures, look(round % 2 === 0 ? QUALITY.low : QUALITY.high));
      fx.setMapGroup(group);
      expect(group).not.toBe(old);
      expect(live().filter((l) => !/texture/.test(l)), `round ${round}`).toEqual([]);
      void shared;
      // Low has no junk mesh, so no flicker; High has, and it is the new one.
      const junk = group.getObjectByName('map-junk');
      expect(junk === undefined).toBe(round % 2 === 0);
      for (let i = 0; i < 30; i++) fx.update(1 / 60, camera(), WIND);
    }
    fx.dispose();
    cache.clear();
  });
});
