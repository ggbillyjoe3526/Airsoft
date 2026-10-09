import * as THREE from 'three';
import type { NodeFrame, WebGPURenderer } from 'three/webgpu';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { BAKED_LIGHT } from '../../config/bake';
import { FIXTURES, LIGHTING_PRESETS, QUALITY, type QualitySettings, SURFACES } from '../../config/render';
import { WEATHERING } from '../../config/weathering';
import { DEPOT } from '../../map/depot';
import type { MapData } from '../../map/mapTypes';
import { NEON_HEIGHTS } from '../../map/neonHeights';
import { WOODLAND } from '../../map/woodland';
import { addAtmosphere } from '../atmosphere';
import { DustMotes } from '../dustMotes';
import { Fireflies } from '../fireflies';
import { buildLightFixtures, PHASE } from '../lightFixtures';
import { resolveLighting } from '../lightingPreset';
import { buildMapMeshes, disposeMapMeshes, type MapLook, mapLookOf, texturesFor } from '../mapMeshes';
import { buildNightSky } from '../nightSky';
import type { ProbeGrid } from '../probeGrid';
import type { SurfaceTextures } from '../proceduralTextures';
import { SmokePlumes, STEAM_PLUME } from '../smokePlumes';
import { patchSurfaceMaterial, type SurfacePatch } from '../surfaceShader';
import { withoutEnvironment } from '../surfaceMaterials';
import { flamesTwin, pointKind, smokeTwin } from './effectNodes';
import { PointSprites } from './pointSprites';
import { emptyGrid, SurfaceLambertTwin, surfaceRecipe, SurfaceStandardTwin } from './surfaceNodes';
import { objectFloat, objectValue, patchUniforms } from './twinUniforms';
import { worldTwin, WorldTwins } from './worldTwins';

/**
 * W2: the world materials' node twins. Every world material with a GLSL patch has a twin (or, for a sized point, a
 * sprite twin), each twin reads the patch's own uniform objects per drawn object, and its numbers are the config's as
 * the GLSL writes them. The pictures themselves are compared in the browser (pipeline/webgpu-compare.mjs).
 */

// The soft dots' canvases (smoke, motes) are stood in for: nothing is drawn here.
beforeAll(() => vi.stubGlobal('document', { createElement: () => ({ width: 0, height: 0, getContext: () => null }) }));
afterAll(() => vi.unstubAllGlobals());

const stub = (ids: readonly (keyof typeof SURFACES.worldSize)[]): SurfaceTextures =>
  Object.fromEntries(ids.map((id) => [id, { texture: Object.assign(new THREE.Texture(), { name: id }), worldSize: SURFACES.worldSize[id], mean: 1 }])) as unknown as SurfaceTextures;
const look = (q: QualitySettings, probes: ProbeGrid | null = null): MapLook => ({ ...mapLookOf(q, probes), relief: false });

/** A small baked-light grid (bakedLight.test.ts's stand-in). */
function stubGrid(): ProbeGrid {
  const [nx, ny, nz] = [4, 3, 4];
  return { version: BAKED_LIGHT.bake.version, preset: 'day', hash: 0, nx, ny, nz, origin: [-40, 0, -60], spacing: 2, scale: 1, data: new Uint8Array(nx * ny * nz * 4).fill(128) };
}

/** Every material in `root`. */
function materialsOf(root: THREE.Object3D): THREE.Material[] {
  const out = new Set<THREE.Material>();
  root.traverse((o) => {
    const m = (o as THREE.Mesh).material;
    if (m) for (const one of Array.isArray(m) ? m : [m]) out.add(one);
  });
  return [...out];
}

/** Whether a material carries a GLSL patch. */
const patched = (m: THREE.Material): boolean => m.onBeforeCompile !== THREE.Material.prototype.onBeforeCompile;

/** A frame as a node uniform's object update sees it. */
const frameOf = (material: THREE.Material): NodeFrame => ({ material }) as unknown as NodeFrame;

/** Every number constant in a node graph (ConstNode values), walking its children. */
function constants(node: unknown, out = new Set<number>(), seen = new Set<unknown>()): Set<number> {
  if (!node || typeof node !== 'object' || seen.has(node)) return out;
  seen.add(node);
  const n = node as { isConstNode?: boolean; value?: unknown; getChildren?: () => Iterable<unknown> };
  if (n.isConstNode && typeof n.value === 'number') out.add(Number(n.value.toFixed(6)));
  if (typeof n.getChildren === 'function') for (const child of n.getChildren()) constants(child, out, seen);
  return out;
}

describe('every world patch has a node twin (W2 criterion 1)', () => {
  const scenes: THREE.Object3D[] = [];
  afterEach(() => {
    for (const s of scenes.splice(0)) disposeMapMeshes(s as THREE.Group);
  });

  const built = (map: MapData, q: QualitySettings, grid: ProbeGrid | null = null): THREE.Group => {
    const g = buildMapMeshes(map, stub(texturesFor(map)), look(q, grid), () => new THREE.Texture());
    scenes.push(g);
    return g;
  };

  it('on each map and preset, every patched map material is a twin or drawn by Three as it is by design', () => {
    const grid = emptyGrid();
    const cases: [string, THREE.Object3D][] = [
      ['Depot Low', built(DEPOT, QUALITY.low, stubGrid())],
      ['Depot High', built(DEPOT, QUALITY.high, stubGrid())],
      ['Woodland High', built(WOODLAND, QUALITY.high)],
      ['Neon Heights Medium', built(NEON_HEIGHTS, QUALITY.medium)],
    ];
    const keys = new Set<string>();
    for (const [name, root] of cases) {
      for (const m of materialsOf(root).filter(patched)) {
        const key = m.customProgramCacheKey();
        keys.add(key);
        const twin = worldTwin(m, grid);
        if (key === 'without-environment') expect(twin, `${name}: ${key}`).toBeNull();
        else expect(twin, `${name}: ${key}`).not.toBeNull();
      }
    }
    // The families the maps draw: weathered surfaces with the baked light, the junk (and the city's neon), the puddles.
    expect([...keys].some((k) => /^surface:noenv:wear:probes$/.test(k))).toBe(true);
    expect([...keys].some((k) => k.endsWith(':dressing-junk-neon'))).toBe(true);
    expect([...keys].some((k) => k.endsWith(':puddles'))).toBe(true);
    grid.dispose();
  });

  it('the sky host, flames, smoke and steam have twins; stars, embers, fireflies and motes have sprite twins; the moon is Three’s own', () => {
    const scene = new THREE.Scene();
    const box = new THREE.Box3(new THREE.Vector3(-24, -0.5, -16), new THREE.Vector3(24, 8, 16));
    const atmosphere = addAtmosphere(scene, new THREE.Vector3(), new THREE.Vector3(0.4, 0.8, 0.3).normalize(), QUALITY.high, box, resolveLighting(NEON_HEIGHTS), NEON_HEIGHTS.dressing?.skyline, false, NEON_HEIGHTS.dressing?.plane);
    const ring = scene.getObjectByName('trees') as THREE.Mesh;
    expect((ring.material as THREE.Material).customProgramCacheKey()).toBe('without-environment:sky-host');
    expect(worldTwin(ring.material as THREE.Material, emptyGrid())).toBeInstanceOf(SurfaceLambertTwin);
    const fixtures = buildLightFixtures(WOODLAND, () => 0, true)!;
    const flames = fixtures.group.getObjectByName('fire-flames') as THREE.Mesh;
    expect(worldTwin(flames.material as THREE.Material, emptyGrid())?.positionNode).toBeTruthy();
    const smoke = new SmokePlumes([{ x: 0, y: 10, z: 0, radius: 0.5 }]);
    const steam = new SmokePlumes([{ x: 0, y: 0, z: 0, radius: 0.2 }], STEAM_PLUME, 'steamPlumes');
    for (const p of [smoke, steam]) expect(worldTwin(p.object.material as THREE.Material, emptyGrid())?.opacityNode).toBeTruthy();
    const sky = buildNightSky(LIGHTING_PRESETS.night, new THREE.Vector3(0, 1, 0))!;
    const stars = sky.group.getObjectByName('night-stars') as THREE.Points;
    const moon = sky.group.getObjectByName('night-moon') as THREE.Mesh;
    const embers = fixtures.group.getObjectByName('fire-embers') as THREE.Points;
    const motes = new DustMotes(8);
    const flies = new Fireflies(6, WOODLAND.terrain!, WOODLAND.foliage ?? [], box);
    expect([stars, embers, flies.object, motes.object].map((p) => pointKind(p.material as THREE.Material))).toEqual(['stars', 'embers', 'fireflies', 'motes']);
    expect(worldTwin(moon.material as THREE.Material, emptyGrid())).toBeNull();
    for (const d of [atmosphere, fixtures, smoke, steam, sky, motes, flies]) d.dispose();
  });

  it('reads program keys as their patches write them', () => {
    expect(surfaceRecipe('surface:noenv:wear:probes')).toEqual({ wear: true, probes: true, junk: null, skyHost: false });
    expect(surfaceRecipe('surface:env:none:probes:puddles')).toEqual({ wear: false, probes: true, junk: null, skyHost: false });
    expect(surfaceRecipe('surface:noenv:none:none:dressing-junk-neon')).toEqual({ wear: false, probes: false, junk: 'neon', skyHost: false });
    expect(surfaceRecipe('surface:noenv:none:probes:dressing-junk')).toEqual({ wear: false, probes: true, junk: 'glow', skyHost: false });
    expect(surfaceRecipe('without-environment:sky-host')).toEqual({ wear: false, probes: false, junk: null, skyHost: true });
    // Nothing to add: Three's own node Lambert (which never takes the scene's environment) draws these.
    expect(surfaceRecipe('without-environment')).toBeNull();
    expect(surfaceRecipe('surface:env:none:none')).toBeNull();
    expect(surfaceRecipe('fa8-vertex-finish')).toBeNull();
  });
});

describe('a twin reads its patch’s own uniforms, per drawn object (W2 criterion 1, 5)', () => {
  const probes = () => {
    const tex = new THREE.Data3DTexture(new Uint8Array(4), 1, 1, 1);
    return { bakeTex: { value: tex }, bakeMin: { value: new THREE.Vector3(1, 2, 3) }, bakeSize: { value: new THREE.Vector3(4, 5, 6) }, bakeScale: { value: 2 }, bakeOcclusion: { value: 0.7 }, bakeBounce: { value: 0.5 }, bakeLift: { value: 0.3 } };
  };

  it('finds the very objects the GLSL is given (the baked light by reference, the wear as the surface’s own values)', () => {
    const p = probes();
    const patch: SurfacePatch = { environment: false, wear: WEATHERING.shader.corrugated, probes: p };
    const m = patchSurfaceMaterial(new THREE.MeshLambertMaterial(), patch);
    const u = patchUniforms(m);
    for (const name of Object.keys(p) as (keyof typeof p)[]) expect(u[name]).toBe(p[name]);
    expect(u.wearGrime!.value).toBe(WEATHERING.shader.corrugated.grime);
    expect(u.wearRust!.value).toBe(WEATHERING.shader.corrugated.rust);
    // Found once and kept.
    expect(patchUniforms(m)).toBe(u);
  });

  it('two surfaces sharing one program read their own weathering, and a later map’s grid replaces the first', () => {
    const first = probes();
    const concrete = patchSurfaceMaterial(new THREE.MeshLambertMaterial(), { environment: false, wear: WEATHERING.shader.concrete, probes: first });
    const steel = patchSurfaceMaterial(new THREE.MeshLambertMaterial(), { environment: false, wear: WEATHERING.shader.corrugated, probes: first });
    expect(concrete.customProgramCacheKey()).toBe(steel.customProgramCacheKey());
    const grime = objectFloat('wearGrime');
    const rust = objectFloat('wearRust');
    const scale = objectFloat('bakeScale');
    const min = objectValue('bakeMin', new THREE.Vector3());
    const read = (m: THREE.Material): number[] => {
      for (const n of [grime, rust, scale, min]) (n as unknown as { update(f: NodeFrame): void }).update(frameOf(m));
      return [grime.value as number, rust.value as number, scale.value as number];
    };
    expect(read(concrete)).toEqual([WEATHERING.shader.concrete.grime, 0, 2]);
    expect(read(steel)).toEqual([WEATHERING.shader.corrugated.grime, WEATHERING.shader.corrugated.rust, 2]);
    expect(min.value).toBe(first.bakeMin.value);
    // The same object, so a change the game makes is drawn (nothing copied).
    first.bakeScale.value = 3;
    expect(read(steel)[2]).toBe(3);
    const second = probes();
    const later = patchSurfaceMaterial(new THREE.MeshLambertMaterial(), { environment: false, wear: WEATHERING.shader.concrete, probes: second });
    read(later);
    expect(min.value).toBe(second.bakeMin.value);
  });

  it('makes a Lambert twin for Lambert surfaces and a Standard twin for steel and puddles, copying the plain settings', () => {
    const p = probes();
    const lambert = patchSurfaceMaterial(new THREE.MeshLambertMaterial({ color: 0x336699, vertexColors: true }), { environment: false, wear: WEATHERING.shader.concrete, probes: p });
    const standard = patchSurfaceMaterial(new THREE.MeshStandardMaterial({ roughness: 0.4, metalness: 0.8 }), { environment: true, wear: WEATHERING.shader.steelPlate, probes: null });
    const lt = worldTwin(lambert, emptyGrid()) as SurfaceLambertTwin;
    const st = worldTwin(standard, emptyGrid()) as SurfaceStandardTwin;
    expect(lt).toBeInstanceOf(SurfaceLambertTwin);
    expect(st).toBeInstanceOf(SurfaceStandardTwin);
    expect(lt.color).toBe(lambert.color);
    expect(lt.vertexColors).toBe(true);
    expect([st.roughness, st.metalness]).toEqual([0.4, 0.8]);
    // A new twin per build, as Three's library makes them.
    expect(worldTwin(lambert, emptyGrid())).not.toBe(lt);
  });
});

describe('the effects’ twins use the GLSL’s numbers (W2 criterion 5)', () => {
  it('the flames sway and flicker with the fixtures’ rates, weights and phases, rounded as the GLSL writes them', () => {
    const fixtures = buildLightFixtures(WOODLAND, () => 0, true)!;
    const plain = (fixtures.group.getObjectByName('fire-flames') as THREE.Mesh).material as THREE.MeshBasicMaterial;
    const twin = flamesTwin(plain);
    const used = new Set([...constants(twin.positionNode), ...constants(twin.colorNode)]);
    const { rates, weights } = FIXTURES.flicker;
    for (const x of [...rates, ...weights, ...PHASE]) expect(used.has(Number(x.toFixed(4))), `${x}`).toBe(true);
    for (const x of FIXTURES.fire.flames.swayRates) expect(used.has(Number(x.toFixed(3))), `${x}`).toBe(true);
    expect(used.has(Number(PHASE[1].toFixed(3)))).toBe(true);
    // The same blending, sides and fog as the plain material.
    expect([twin.blending, twin.side, twin.fog, twin.forceSinglePass, twin.depthWrite]).toEqual([plain.blending, plain.side, false, true, false]);
    fixtures.dispose();
  });

  it('the smoke keeps its colour, map and opacity, and fades each puff by its own alpha', () => {
    const smoke = new SmokePlumes([{ x: 0, y: 10, z: 0, radius: 0.5 }]);
    const plain = smoke.object.material as THREE.MeshBasicMaterial;
    const twin = smokeTwin(plain);
    expect([twin.color, twin.map, twin.opacity, twin.transparent]).toEqual([plain.color, plain.map, plain.opacity, true]);
    expect(twin.opacityNode).toBeTruthy();
    smoke.dispose();
  });
});

describe('sized points become sprites on the node path (W2 criterion 1, 5)', () => {
  it('each sized Points gets one sprite child drawing as many quads as it draws points, and gives its layers back when freed', () => {
    const scene = new THREE.Scene();
    const motes = new DustMotes(20);
    scene.add(motes.object);
    const sky = buildNightSky(LIGHTING_PRESETS.night, new THREE.Vector3(0, 1, 0))!;
    scene.add(sky.group);
    const plain = new THREE.Points(new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0], 3)), new THREE.PointsMaterial());
    scene.add(plain);
    const sprites = new PointSprites();
    sprites.prepare(scene);
    // Stars and motes; a plain Points (none in the world) is left to Three.
    expect(sprites.count).toBe(2);
    expect(plain.children).toEqual([]);
    expect(motes.object.layers.mask).toBe(0);
    const twin = motes.object.children[0] as THREE.Sprite;
    expect(twin).toBeInstanceOf(THREE.Sprite);
    // Without a rescan nothing is looked for again.
    sprites.prepare(scene);
    expect(motes.object.children.length).toBe(1);
    // Before a draw: as many quads as the Points draws, and the CPU's new positions sent.
    motes.setCount(7);
    motes.update(0.1, { x: 0, y: 1, z: 0 }, { x: 0, y: 0, z: 0 });
    const call = (): void => twin.onBeforeRender(null as never, scene, new THREE.PerspectiveCamera(), twin.geometry, twin.material, null as never);
    const material = twin.material as unknown as { positionNode: { value?: unknown; node?: { value?: unknown } } };
    expect(material.positionNode).toBeTruthy();
    call();
    expect(twin.count).toBe(7);
    // The stars' sprite runs the stars' own hook: they follow the camera.
    const stars = sky.group.getObjectByName('night-stars') as THREE.Points;
    const starTwin = stars.children[0] as THREE.Sprite;
    const cam = new THREE.PerspectiveCamera();
    cam.position.set(5, 6, 7);
    cam.updateMatrixWorld();
    starTwin.onBeforeRender(null as never, scene, cam, starTwin.geometry, starTwin.material, null as never);
    expect(stars.position.toArray()).toEqual([5, 6, 7]);
    // The Points' material freed (its owner's dispose): the twin goes, the layers come back.
    motes.dispose();
    expect(sprites.count).toBe(1);
    expect(motes.object.layers.mask).toBe(1);
    expect(motes.object.children).toEqual([]);
    sprites.dispose();
    expect(stars.layers.mask).toBe(1);
    expect(stars.children).toEqual([]);
    sky.dispose();
  });

  it('frees each twin’s material and quad (and so the per-point buffers read with it)', () => {
    const scene = new THREE.Scene();
    const fixtures = buildLightFixtures(WOODLAND, () => 0, true)!;
    scene.add(fixtures.group);
    const sprites = new PointSprites();
    sprites.prepare(scene);
    const embers = fixtures.group.getObjectByName('fire-embers') as THREE.Points;
    const twin = embers.children[0] as THREE.Sprite;
    let freed = 0;
    twin.geometry.addEventListener('dispose', () => freed++);
    (twin.material as THREE.Material).addEventListener('dispose', () => freed++);
    sprites.dispose();
    expect(freed).toBe(2);
    fixtures.dispose();
  });
});

describe('the node library asks for a twin first (W2)', () => {
  it('installs into the renderer’s library, falls through to Three’s own, and gives it back on dispose', () => {
    const own = (m: THREE.Material) => ({ own: m }) as never;
    const library = { fromMaterial: own };
    const twins = new WorldTwins({ library } as unknown as WebGPURenderer);
    const surface = patchSurfaceMaterial(new THREE.MeshLambertMaterial(), { environment: false, wear: WEATHERING.shader.concrete, probes: null });
    expect(library.fromMaterial(surface)).toBeInstanceOf(SurfaceLambertTwin);
    const plain = withoutEnvironment(new THREE.MeshLambertMaterial());
    expect(library.fromMaterial(plain)).toEqual({ own: plain });
    expect(twins.environment(false, { sky: LIGHTING_PRESETS.day.sky, sun: { x: 0, y: 1, z: 0 }, ground: 0 })).toBeNull();
    twins.dispose();
    expect(library.fromMaterial).toBe(own);
  });
});
