import * as THREE from 'three';
import type { NodeFrame, WebGPURenderer } from 'three/webgpu';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { BAKED_LIGHT } from '../../config/bake';
import { LIGHTING_PRESETS, QUALITY, type QualitySettings, SURFACES } from '../../config/render';
import { DEPOT } from '../../map/depot';
import type { MapData } from '../../map/mapTypes';
import { NEON_HEIGHTS } from '../../map/neonHeights';
import { WOODLAND } from '../../map/woodland';
import { addAtmosphere } from '../atmosphere';
import { DressingEffects } from '../dressingEffects';
import { DustMotes } from '../dustMotes';
import { Fireflies } from '../fireflies';
import { buildLightFixtures } from '../lightFixtures';
import { resolveLighting } from '../lightingPreset';
import { buildMapMeshes, disposeMapMeshes, type MapLook, mapLookOf, texturesFor } from '../mapMeshes';
import { buildNightSky } from '../nightSky';
import type { ProbeGrid } from '../probeGrid';
import type { SurfaceTextures } from '../proceduralTextures';
import { patchSurfaceMaterial } from '../surfaceShader';
import { WEATHERING } from '../../config/weathering';
import { flamesTwin, pointKind } from './effectNodes';
import { PointSprites } from './pointSprites';
import { emptyGrid, SurfaceLambertTwin } from './surfaceNodes';
import { objectFloat, objectTexture3D, objectValue } from './twinUniforms';
import { worldTwin, WorldTwins } from './worldTwins';

/**
 * W2 QA: the world's node twins attacked from the side the build worker's tests do not look from: every patched
 * material of every map on every preset (not four hand-picked scenes), the way Three's node renderer decides whether a
 * drawn object's per-object uniforms are sent again (NodeMaterialObserver), the real heap growth of the twins' per-frame
 * paths, and Reduced motion through the sprite twins. Bugs found are pinned with `it.fails` (what must be true, failing
 * today); the Playwright side is e2e/webgpuWorld.qa.spec.ts.
 */

/** A Node module by name, which the app's tsconfig (no Node types) does not resolve as a literal. */
const loadNode = (name: string): Promise<unknown> => import(/* @vite-ignore */ `node:${name}`);

beforeAll(() => vi.stubGlobal('document', { createElement: () => ({ width: 0, height: 0, getContext: () => null }) }));
afterAll(() => vi.unstubAllGlobals());

const stub = (ids: readonly (keyof typeof SURFACES.worldSize)[]): SurfaceTextures =>
  Object.fromEntries(ids.map((id) => [id, { texture: Object.assign(new THREE.Texture(), { name: id }), worldSize: SURFACES.worldSize[id], mean: 1 }])) as unknown as SurfaceTextures;
const look = (q: QualitySettings, probes: ProbeGrid | null = null): MapLook => ({ ...mapLookOf(q, probes), relief: false });
function stubGrid(): ProbeGrid {
  const [nx, ny, nz] = [4, 3, 4];
  return { version: BAKED_LIGHT.bake.version, preset: 'day', hash: 0, nx, ny, nz, origin: [-40, 0, -60], spacing: 2, scale: 1, data: new Uint8Array(nx * ny * nz * 4).fill(128) };
}

/** Whether a material carries a GLSL patch (an onBeforeCompile of its own). */
const patched = (m: THREE.Material): boolean => m.onBeforeCompile !== THREE.Material.prototype.onBeforeCompile;

/** Every distinct material under `root`, with the object that draws it. */
function drawn(root: THREE.Object3D): { object: THREE.Object3D; material: THREE.Material }[] {
  const seen = new Set<THREE.Material>();
  const out: { object: THREE.Object3D; material: THREE.Material }[] = [];
  root.traverse((o) => {
    const m = (o as THREE.Mesh).material;
    if (!m) return;
    for (const one of Array.isArray(m) ? m : [m]) if (!seen.has(one)) (seen.add(one), out.push({ object: o, material: one }));
  });
  return out;
}

/** Every node of a graph (children walked, each once). */
function nodesOf(root: unknown, seen = new Set<unknown>()): unknown[] {
  if (!root || typeof root !== 'object' || seen.has(root)) return [];
  seen.add(root);
  const n = root as { getChildren?: () => Iterable<unknown> };
  const out: unknown[] = [root];
  if (typeof n.getChildren === 'function') for (const c of n.getChildren()) out.push(...nodesOf(c, seen));
  return out;
}

/** The nodes of a graph that Three updates itself (per frame, render or object): the twins' per-frame code. */
const updating = (root: unknown): { update(f: NodeFrame): unknown; updateType: string }[] =>
  nodesOf(root).filter((n) => typeof (n as { update?: unknown }).update === 'function' && (n as { updateType?: string }).updateType !== 'none') as never;

// --- Coverage: every patched material of the maps, on every preset ------------------------------------------------------

describe('W2 QA: every patched world material has a twin on every preset (acceptance 1)', () => {
  /** What Three's own node library draws as it is by design (never takes the scene's environment, nothing to add). */
  const THREES_OWN = new Set(['without-environment', 'night-sky-moon']);
  const MAPS: readonly [string, MapData][] = [
    ['Depot', DEPOT],
    ['Woodland', WOODLAND],
    ['Neon Heights', NEON_HEIGHTS],
  ];
  const PRESETS = ['low', 'medium', 'high', 'ultra'] as const;

  it('on all three maps, all four presets, day and night, with and without the baked light: nothing patched is left without a twin or a reason', () => {
    const grid = emptyGrid();
    const keys = new Set<string>();
    const unaccounted: string[] = [];
    for (const [name, map] of MAPS) {
      for (const preset of PRESETS) {
        for (const probes of [null, stubGrid()]) {
          const group = buildMapMeshes(map, stub(texturesFor(map)), look(QUALITY[preset], probes), () => new THREE.Texture());
          const roots: THREE.Object3D[] = [group];
          for (const night of [false, true]) {
            const scene = new THREE.Scene();
            const effects = new DressingEffects(scene, map);
            effects.setNight(night);
            effects.setMapGroup(group);
            effects.setQuality(QUALITY[preset]);
            const fixtures = buildLightFixtures(map, () => 0, true);
            if (fixtures) scene.add(fixtures.group);
            const box = new THREE.Box3(new THREE.Vector3(-24, -0.5, -16), new THREE.Vector3(24, 8, 16));
            const atmosphere = addAtmosphere(scene, new THREE.Vector3(), new THREE.Vector3(0.4, 0.8, 0.3).normalize(), QUALITY[preset], box, resolveLighting(map), map.dressing?.skyline, false, map.dressing?.plane);
            const sky = buildNightSky(LIGHTING_PRESETS[night ? 'night' : 'day'], new THREE.Vector3(0, 1, 0));
            if (sky) scene.add(sky.group);
            roots.push(scene);
            for (const root of roots) {
              for (const { object, material } of drawn(root).filter((d) => patched(d.material))) {
                const key = material.customProgramCacheKey();
                const where = `${name} ${preset}${probes ? ' +bake' : ''}${night ? ' night' : ' day'} ${object.name || object.type}: ${key.slice(0, 50)}`;
                keys.add(key.slice(0, 50));
                const ok = material instanceof THREE.PointsMaterial ? pointKind(material) !== null : THREES_OWN.has(key) || worldTwin(material, grid) !== null;
                if (!ok) unaccounted.push(where);
              }
            }
            effects.dispose();
            fixtures?.dispose();
            atmosphere.dispose();
            sky?.dispose();
          }
          disposeMapMeshes(group);
        }
      }
    }
    expect([...new Set(unaccounted)]).toEqual([]);
    // The sweep reached the families (a sweep that saw only the plain ones would pass for nothing).
    for (const family of ['surface:noenv:wear:probes', 'surface:env:wear:probes', 'dressing-junk-neon', ':puddles', 'sky-host', 'light-fixtures-flames', 'smoke-plumes', 'fireflies', 'night-sky-stars', 'light-fixtures-embers']) {
      expect([...keys].some((k) => k.includes(family)), family).toBe(true);
    }
    grid.dispose();
  }, 180_000);
});

// --- The refresh: do the per-object uniforms reach the GPU after the first draw? ---------------------------------------

describe('W2 QA: a twin’s per-object uniforms are sent again every frame (acceptance 1: "the shader-moved effects move again")', () => {
  /**
   * Three's node renderer sends an object's uniforms again only when its NodeMaterialObserver says the object needs a
   * FULL refresh: `hasNode` (the drawn material has a node property) makes that every frame; otherwise only a changed
   * material property, geometry, lights map or instance matrix does. The observer is built from `builder.material`, the
   * material the scene holds, which for a twin is the PLAIN material (the library makes the twin only to build from), so
   * a twin built by `library.fromMaterial` reports `hasNode` false unless its `setupObserver` says otherwise. Measured in
   * the browser (e2e/webgpuWorld.qa.spec.ts): the flames and the passing plane never change after the first frame.
   */
  const observerOf = (twin: THREE.Material & { setupObserver(b: unknown): { hasNode: boolean } }, plain: THREE.Material): { hasNode: boolean } =>
    twin.setupObserver({ material: plain, object: new THREE.Mesh(), context: {} });

  const flames = (): { plain: THREE.Material; twin: ReturnType<typeof flamesTwin>; done: () => void } => {
    const fixtures = buildLightFixtures(WOODLAND, () => 0, true)!;
    const plain = (fixtures.group.getObjectByName('fire-flames') as THREE.Mesh).material as THREE.Material;
    return { plain, twin: flamesTwin(plain), done: () => fixtures.dispose() };
  };

  it('control: a sprite twin (a node material of its own) is seen as holding nodes, a plain Three conversion is not', () => {
    const scene = new THREE.Scene();
    const motes = new DustMotes(8);
    scene.add(motes.object);
    const sprites = new PointSprites();
    sprites.prepare(scene);
    const sprite = motes.object.children[0] as THREE.Sprite;
    const observer = observerOf(sprite.material as never, sprite.material as THREE.Material);
    expect(observer.hasNode).toBe(true);
    // What the surfaces and the flames are: built from the plain material the scene holds.
    const { plain, twin, done } = flames();
    expect(typeof twin.setupObserver).toBe('function');
    expect(Object.values(plain).some((v) => (v as { isNode?: boolean } | null)?.isNode)).toBe(false);
    done();
    sprites.dispose();
    motes.dispose();
  });

  // BUG W2-QA-1: the flames' clock (fxTime), the neon tubes' flicker (neonFlicker) and the passing plane's matrix
  // (skyPlane, skyPlaneUp) are object uniforms of twins whose observer has hasNode false: on a static mesh nothing makes
  // Three send them again, so on the node path the flames never sway or flicker, the neon never flickers and the plane
  // never appears (or moves). Fix: the twins' setupObserver returns an observer with hasNode set (measured: that alone
  // makes the flames move again).
  it.fails('the flames’ twin has its observer refresh the object every frame', () => {
    const { plain, twin, done } = flames();
    expect(observerOf(twin as never, plain).hasNode).toBe(true);
    done();
  });

  it.fails('the sky host’s twin (the plane’s matrix and visibility) has its observer refresh the object every frame', () => {
    const scene = new THREE.Scene();
    const box = new THREE.Box3(new THREE.Vector3(-24, -0.5, -16), new THREE.Vector3(24, 8, 16));
    const atmosphere = addAtmosphere(scene, new THREE.Vector3(), new THREE.Vector3(0.4, 0.8, 0.3).normalize(), QUALITY.high, box, resolveLighting(NEON_HEIGHTS), NEON_HEIGHTS.dressing?.skyline, false, NEON_HEIGHTS.dressing?.plane);
    const ring = scene.getObjectByName('trees') as THREE.Mesh;
    const plain = ring.material as THREE.Material;
    const twin = worldTwin(plain, emptyGrid()) as SurfaceLambertTwin;
    expect(twin).toBeInstanceOf(SurfaceLambertTwin);
    expect(observerOf(twin as never, plain).hasNode).toBe(true);
    atmosphere.dispose();
  });

  it.fails('the neon junk’s twin (the flicker channels) has its observer refresh the object every frame', () => {
    const group = buildMapMeshes(NEON_HEIGHTS, stub(texturesFor(NEON_HEIGHTS)), look(QUALITY.high), () => new THREE.Texture());
    const junk = drawn(group).find((d) => d.material.customProgramCacheKey().endsWith(':dressing-junk-neon'))!.material;
    const twin = worldTwin(junk, emptyGrid()) as SurfaceLambertTwin;
    expect(observerOf(twin as never, junk).hasNode).toBe(true);
    disposeMapMeshes(group);
  });
});

// --- Nothing allocated per frame -------------------------------------------------------------------------------------

describe('W2 QA: the twins’ per-frame paths allocate nothing (acceptance 5)', () => {
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
  /** A few small objects a frame is 128 bytes. */
  const BUDGET = 128_000;
  /** The median of the batches a scavenge did not cut short (a busy machine cuts more of them, so only a few are required). */
  const median = (grown: number[]): number => grown[Math.floor(grown.length * 0.5)]!;

  it('control: the probe sees four small objects allocated per frame', async () => {
    const ring: THREE.Vector3[] = new Array<THREE.Vector3>(64);
    let n = 0;
    const step = (): void => {
      for (let k = 0; k < 4; k++) ring[n++ % 64] = new THREE.Vector3(n, k, 0.5);
    };
    const grown = await growthPerBatch(step, 20, 1000);
    expect(grown[grown.length - 1]!).toBeGreaterThan(BUDGET);
  });

  it('the object-uniform reads (wear, baked light, neon flicker, the plane) allocate nothing after the first', async () => {
    const tex = new THREE.Data3DTexture(new Uint8Array(4), 1, 1, 1);
    const probes = { bakeTex: { value: tex }, bakeMin: { value: new THREE.Vector3() }, bakeSize: { value: new THREE.Vector3(1, 1, 1) }, bakeScale: { value: 1 }, bakeOcclusion: { value: 1 }, bakeBounce: { value: 1 }, bakeLift: { value: 0.1 } };
    const material = patchSurfaceMaterial(new THREE.MeshLambertMaterial(), { environment: false, wear: WEATHERING.shader.concrete, probes });
    const nodes = [objectFloat('wearGrime'), objectFloat('bakeScale'), objectValue('bakeMin', new THREE.Vector3()), objectValue('skyPlane', new THREE.Matrix4()), objectTexture3D('bakeTex', emptyGrid(), new THREE.Vector3() as never)];
    const frame = { material } as unknown as NodeFrame;
    const step = (): void => {
      for (const n of nodes) (n as unknown as { update(f: NodeFrame): void }).update(frame);
    };
    const grown = await growthPerBatch(step, 60, 1000);
    expect(grown.length).toBeGreaterThan(3);
    expect(median(grown)).toBeLessThan(BUDGET);
  });

  it('the flames’ and every sprite twin’s updates and pre-draw hooks allocate nothing, with the CPU changing the buffers each frame', async () => {
    const scene = new THREE.Scene();
    const fixtures = buildLightFixtures(WOODLAND, () => 0, true)!;
    scene.add(fixtures.group);
    const motes = new DustMotes(64);
    motes.setCount(64);
    scene.add(motes.object);
    const box = new THREE.Box3(new THREE.Vector3(-24, -0.5, -16), new THREE.Vector3(24, 8, 16));
    const flies = new Fireflies(24, WOODLAND.terrain!, WOODLAND.foliage ?? [], box);
    scene.add(flies.object);
    const sky = buildNightSky(LIGHTING_PRESETS.night, new THREE.Vector3(0, 1, 0))!;
    scene.add(sky.group);
    const sprites = new PointSprites();
    sprites.prepare(scene);
    expect(sprites.count).toBe(4);
    const flames = flamesTwin((fixtures.group.getObjectByName('fire-flames') as THREE.Mesh).material as THREE.Material);
    const plainFlames = (fixtures.group.getObjectByName('fire-flames') as THREE.Mesh).material as THREE.Material;
    const renderer = { getSize: (v: THREE.Vector2) => v.set(1280, 720), getPixelRatio: () => 1 };
    const camera = new THREE.PerspectiveCamera();
    const hooks: (() => void)[] = [];
    const frames: NodeFrame[] = [{ material: plainFlames, renderer } as unknown as NodeFrame];
    const updaters = [...updating(flames.positionNode), ...updating(flames.colorNode)];
    for (const o of [flies.object, motes.object, fixtures.group.getObjectByName('fire-embers')!, sky.group.getObjectByName('night-stars')!]) {
      const sprite = o.children[0] as THREE.Sprite;
      const material = sprite.material as unknown as { positionNode: unknown; sizeNode: unknown; opacityNode: unknown; colorNode: unknown };
      for (const n of [material.positionNode, material.sizeNode, material.opacityNode, material.colorNode]) updaters.push(...updating(n));
      hooks.push(() => sprite.onBeforeRender(renderer as never, scene, camera, sprite.geometry, sprite.material, null as never));
    }
    expect(updaters.length).toBeGreaterThan(3);
    const frame = frames[0]!;
    let t = 0;
    const eye = { x: 0, y: 1, z: 0 };
    const look = { x: 0, y: 0, z: 1 };
    const step = (): void => {
      // The CPU's side of a frame (owned by their modules, pinned garbage-free by G9 QA), then the twins' own.
      flies.update(1 / 60);
      motes.update(1 / 60, eye, look);
      fixtures.advance(1 / 60);
      t += 1 / 60;
      for (const u of updaters) u.update(frame);
      for (const h of hooks) h();
    };
    const grown = await growthPerBatch(step, 60, 1000);
    expect(grown.length).toBeGreaterThan(3);
    // The CPU modules' own bookkeeping is a few dozen bytes a frame at most (G9 QA measured it); the twins add none.
    expect(median(grown)).toBeLessThan(BUDGET);
    expect(t).toBeGreaterThan(0);
    sprites.dispose();
    for (const d of [fixtures, motes, flies, sky]) d.dispose();
  });
});

// --- Reduced motion through the sprite twins -------------------------------------------------------------------------------

describe('W2 QA: Reduced motion stills the fireflies and hides the motes on the node path (acceptance: the effects still still)', () => {
  it('the fireflies’ twin reads the Points’ own arrays and sends the reset positions and alphas again when motion goes off', () => {
    const scene = new THREE.Scene();
    const box = new THREE.Box3(new THREE.Vector3(-24, -0.5, -16), new THREE.Vector3(24, 8, 16));
    const flies = new Fireflies(12, WOODLAND.terrain!, WOODLAND.foliage ?? [], box);
    scene.add(flies.object);
    const sprites = new PointSprites();
    sprites.prepare(scene);
    const sprite = flies.object.children[0] as THREE.Sprite;
    const material = sprite.material as unknown as { positionNode: unknown; opacityNode: unknown; colorNode: unknown };
    const buffers = [material.positionNode, material.opacityNode, material.colorNode].flatMap((g) => nodesOf(g)).filter((n) => (n as { value?: unknown }).value instanceof THREE.InstancedInterleavedBuffer) as unknown as { value: THREE.InstancedInterleavedBuffer }[];
    expect(buffers.length).toBeGreaterThanOrEqual(2);
    // No copy: the very arrays the Points holds.
    const position = flies.object.geometry.getAttribute('position') as THREE.BufferAttribute;
    expect(buffers.some((b) => b.value.array === position.array)).toBe(true);
    const call = (): void => sprite.onBeforeRender(null as never, scene, new THREE.PerspectiveCamera(), sprite.geometry, sprite.material, null as never);
    for (let i = 0; i < 30; i++) flies.update(1 / 30);
    call();
    const versions = buffers.map((b) => b.value.version);
    const moved = Array.from(position.array as Float32Array);
    flies.setMotion(false);
    call();
    // The reset reached the shared arrays, and every buffer read from the changed attributes was marked to be sent.
    expect(Array.from(position.array as Float32Array)).not.toEqual(moved);
    expect(buffers.some((b, i) => b.value.version > versions[i]!)).toBe(true);
    // Still afterwards: the arrays no longer change, so nothing more is sent.
    const still = buffers.map((b) => b.value.version);
    for (let i = 0; i < 30; i++) flies.update(1 / 30);
    call();
    expect(buffers.map((b) => b.value.version)).toEqual(still);
    sprites.dispose();
    flies.dispose();
  });

  it('the motes’ Points is hidden under Reduced motion, and so is its sprite (a child of a hidden parent is not drawn)', () => {
    const scene = new THREE.Scene();
    const motes = new DustMotes(16);
    motes.setCount(16);
    scene.add(motes.object);
    const sprites = new PointSprites();
    sprites.prepare(scene);
    motes.setMotion(false);
    const sprite = motes.object.children[0] as THREE.Sprite;
    // Three draws an object only through visible ancestors; the sprite twin leans on that and has no flag of its own.
    let drawnNow = false;
    scene.traverseVisible((o) => {
      if (o === sprite) drawnNow = true;
    });
    expect(drawnNow).toBe(false);
    motes.setMotion(true);
    scene.traverseVisible((o) => {
      if (o === sprite) drawnNow = true;
    });
    expect(drawnNow).toBe(true);
    sprites.dispose();
    motes.dispose();
  });
});

// --- The library hook --------------------------------------------------------------------------------------------------

describe('W2 QA: the library hook is installed once and given back whole', () => {
  const lib = (): { fromMaterial: (m: THREE.Material) => unknown } => ({ fromMaterial: (m: THREE.Material) => ({ own: m }) });

  it('a second dispose (a lost renderer is disposed by the loss and again by its owner) neither throws nor leaves the hook', () => {
    const library = lib();
    const own = library.fromMaterial;
    const twins = new WorldTwins({ library } as unknown as WebGPURenderer);
    expect(library.fromMaterial).not.toBe(own);
    twins.dispose();
    expect(() => twins.dispose()).not.toThrow();
    expect(library.fromMaterial).toBe(own);
  });

  it('a renderer swap: the new renderer’s library is hooked on its own and the old one’s is whole again', () => {
    const first = lib();
    const second = lib();
    const ownFirst = first.fromMaterial;
    const ownSecond = second.fromMaterial;
    const a = new WorldTwins({ library: first } as unknown as WebGPURenderer);
    const b = new WorldTwins({ library: second } as unknown as WebGPURenderer);
    const surface = patchSurfaceMaterial(new THREE.MeshLambertMaterial(), { environment: false, wear: WEATHERING.shader.concrete, probes: null });
    expect(first.fromMaterial(surface)).toBeInstanceOf(SurfaceLambertTwin);
    expect(second.fromMaterial(surface)).toBeInstanceOf(SurfaceLambertTwin);
    a.dispose();
    expect(first.fromMaterial).toBe(ownFirst);
    expect(second.fromMaterial).not.toBe(ownSecond);
    expect(second.fromMaterial(surface)).toBeInstanceOf(SurfaceLambertTwin);
    b.dispose();
    expect(second.fromMaterial).toBe(ownSecond);
  });
});

// --- The comparison script's bar -----------------------------------------------------------------------------------------

describe('W2 QA: the comparison script’s bar tells W1’s plain materials from the twins (acceptance 3)', () => {
  /**
   * W1's plain node materials scored by pipeline/webgpu-compare.mjs with the world twins switched off after boot (the
   * library hook, the sprites and the node renderer's sky taken away: pipeline/out/qa-artifacts/w2qa-plain-compare.sh,
   * 2026-10-09, High, 1280x720): mean absolute difference per channel and the share of pixels over 24. The twins' own
   * worst pair of the 22 is 0.319 with 0.83 % over.
   */
  const PLAIN: readonly { view: string; mad: number; over: number }[] = [
    { view: 'depot day overview', mad: 6.526, over: 0.1428 },
    { view: 'depot day ground', mad: 10.973, over: 0.29951 },
    { view: 'woodland night overview', mad: 0.013, over: 0.00004 },
    { view: 'woodland night ground', mad: 0.015, over: 0.00007 },
    { view: 'woodland night fire', mad: 0.477, over: 0.00179 },
    { view: 'woodland night sky', mad: 0.001, over: 0 },
    { view: 'neonHeights night aerial', mad: 1.392, over: 0.00877 },
    { view: 'neonHeights night ground', mad: 1.556, over: 0 },
    { view: 'neonHeights night sky', mad: 4.199, over: 0.0215 },
    { view: 'neonHeights day aerial', mad: 1.689, over: 0.0078 },
    { view: 'neonHeights day ground', mad: 2.155, over: 0 },
  ];
  const loadBar = async (): Promise<{ verdict(score: { mad: number; over: number }): { pass: boolean; fails: string[] }; COMPARE_BAR: { mad: number; over: number; threshold: number } }> => {
    const path = '../../../pipeline/webgpuCompare.mjs';
    return (await import(/* @vite-ignore */ path)) as never;
  };

  it('fails the plain materials on more than one view, and on both maps with surfaces to weather', async () => {
    const { verdict } = await loadBar();
    const failed = PLAIN.filter((p) => !verdict(p).pass).map((p) => p.view);
    expect(failed).toEqual(['depot day overview', 'depot day ground', 'neonHeights night sky']);
  });

  // BUG W2-QA-2: the bar (mean 2.5, 2.5 % over 24) is eight times the twins' worst pair, and W1's plain materials pass it
  // on 8 of the 11 High pairs, among them Neon Heights' aerial and ground views, where the plain surfaces miss their
  // weathering and the junk its glow. On those views (and all of Woodland's) a missing twin would be scored as a match, so
  // "every pair passes" says nothing about them. A bar of mean 0.5 with 1 % over still passes all 22 of the twins' pairs
  // and fails W1's plain materials on 7 of 11.
  it.fails('fails the plain materials on Neon Heights’ aerial and ground views too', async () => {
    const { verdict } = await loadBar();
    for (const view of ['neonHeights night aerial', 'neonHeights night ground', 'neonHeights day aerial', 'neonHeights day ground']) {
      expect(verdict(PLAIN.find((p) => p.view === view)!).pass, view).toBe(false);
    }
  });
});
