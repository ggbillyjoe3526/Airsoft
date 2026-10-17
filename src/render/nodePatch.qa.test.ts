import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { WEATHERING } from '../config/weathering';
import { carryNodePatch, nodePatchOf, patchKey, patchUniforms, type NodePatch, type PlainPatchKind } from './nodePatch';
import { hostSkyGuests } from './dressing/skyHost';
import { patchSurfaceMaterial, type ProbeUniforms } from './light/surfaceShader';

// W6b QA: the node patch a world material carries (acceptance: every GLSL patch is a node patch; no GLSL for a scene material).

const sources = import.meta.glob<string>(['/src/**/*.ts', '!/src/**/*.test.ts', '!/src/**/*.d.ts'], { query: '?raw', import: 'default', eager: true });
/** Code only: block and line comments dropped, so a note about the old `onBeforeCompile` does not count. */
const code = (text: string): string => text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1');

const KINDS: PlainPatchKind[] = ['stars', 'embers', 'fireflies', 'motes', 'flames', 'smoke', 'figure-finish', 'sleeve-camo'];
const recipe = (over: Partial<{ wear: boolean; probes: boolean; junk: 'glow' | 'neon' | null; skyHost: boolean }> = {}) => ({ wear: false, probes: false, junk: null, skyHost: false, ...over });
const probes = (): ProbeUniforms => ({
  bakeTex: { value: null },
  bakeMin: { value: new THREE.Vector3() },
  bakeSize: { value: new THREE.Vector3(1, 1, 1) },
  bakeScale: { value: 1 },
  bakeOcclusion: { value: 1 },
  bakeBounce: { value: 1 },
  bakeLift: { value: 0.1 },
});

describe('carryNodePatch', () => {
  it('sets the program key to the patch key and keeps the uniforms by reference', () => {
    const clock = { value: 0 };
    const m = carryNodePatch(new THREE.PointsMaterial(), { kind: 'flames' }, { fxTime: clock });
    expect(m.customProgramCacheKey()).toBe('flames');
    expect(nodePatchOf(m)?.patch).toEqual({ kind: 'flames' });
    expect(patchUniforms(m).fxTime).toBe(clock);
    clock.value = 7;
    expect(patchUniforms(m).fxTime!.value).toBe(7);
  });

  it('gives each kind its own key, named by the kind', () => {
    const keys = KINDS.map((kind) => carryNodePatch(new THREE.MeshStandardMaterial(), { kind }).customProgramCacheKey());
    expect(keys).toEqual(KINDS);
    expect(new Set(keys).size).toBe(KINDS.length);
  });

  it('gives every distinct surface recipe its own key, and equal recipes the same one', () => {
    const recipes = [recipe(), recipe({ wear: true }), recipe({ probes: true }), recipe({ wear: true, probes: true }), recipe({ junk: 'glow' }), recipe({ junk: 'neon' }), recipe({ skyHost: true }), recipe({ wear: true, probes: true, junk: 'neon', skyHost: true })];
    const keys = recipes.map((r) => patchKey({ kind: 'surface', recipe: r }));
    expect(new Set(keys).size).toBe(recipes.length);
    expect(patchKey({ kind: 'surface', recipe: recipe({ wear: true }) })).toBe(keys[1]);
    expect(keys[1]).toBe('surface:wear:none');
    expect(keys[7]).toBe('surface:wear:probes:dressing-junk-neon:sky-host');
    for (const k of keys) expect(KINDS).not.toContain(k);
  });

  it('keeps surfaces of different strengths in one program: the strengths are uniforms, not part of the key', () => {
    const a = patchSurfaceMaterial(new THREE.MeshLambertMaterial(), { wear: { grime: 0.2, rust: 0.1 }, probes: null });
    const b = patchSurfaceMaterial(new THREE.MeshLambertMaterial(), { wear: { grime: 0.9, rust: 0.7 }, probes: null });
    expect(a.customProgramCacheKey()).toBe(b.customProgramCacheKey());
    expect(patchUniforms(a).wearGrime!.value).toBe(0.2);
    expect(patchUniforms(b).wearGrime!.value).toBe(0.9);
    expect(patchUniforms(b).wearRust!.value).toBe(0.7);
    const concrete = patchSurfaceMaterial(new THREE.MeshLambertMaterial(), { wear: WEATHERING.shader.concrete, probes: null });
    expect(concrete.customProgramCacheKey()).toBe(a.customProgramCacheKey());
  });

  it('shares the baked light’s uniforms by reference across surfaces of a map build', () => {
    const p = probes();
    const a = patchSurfaceMaterial(new THREE.MeshLambertMaterial(), { wear: null, probes: p });
    const b = patchSurfaceMaterial(new THREE.MeshStandardMaterial(), { wear: WEATHERING.shader.concrete, probes: p });
    expect(patchUniforms(a).bakeBounce).toBe(p.bakeBounce);
    expect(patchUniforms(b).bakeTex).toBe(p.bakeTex);
    expect(patchKey(nodePatchOf(a)!.patch)).toBe('surface:none:probes');
  });

  it('a plain material carries nothing: no patch, no uniforms, Three’s default key', () => {
    const m = new THREE.MeshLambertMaterial();
    const before = m.customProgramCacheKey();
    expect(nodePatchOf(m)).toBeNull();
    expect(Object.keys(patchUniforms(m))).toEqual([]);
    expect(m.customProgramCacheKey()).toBe(before);
    // patchSurfaceMaterial itself always carries; Low's surfaces skip it (patchesShader false), so they stay plain.
    const low = patchSurfaceMaterial(new THREE.MeshLambertMaterial(), { wear: null, probes: null });
    expect(nodePatchOf(low)?.patch).toEqual({ kind: 'surface', recipe: recipe() } satisfies NodePatch);
  });
});

describe('the sky host (render/dressing/skyHost.ts hostSkyGuests)', () => {
  const ring = (material: THREE.MeshLambertMaterial) => new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), material);

  it('merges onto the surface patch the ring already carries: its recipe and uniforms stay, the sky host and plane are added', () => {
    const p = probes();
    const material = patchSurfaceMaterial(new THREE.MeshLambertMaterial(), { wear: WEATHERING.shader.concrete, probes: p });
    const keyBefore = material.customProgramCacheKey();
    const mesh = ring(material);
    hostSkyGuests(mesh, 40);
    const carried = nodePatchOf(material)!;
    expect(carried.patch).toEqual({ kind: 'surface', recipe: recipe({ wear: true, probes: true, skyHost: true }) });
    expect(material.customProgramCacheKey()).toBe('surface:wear:probes:sky-host');
    expect(material.customProgramCacheKey()).not.toBe(keyBefore);
    expect(carried.uniforms.bakeTex).toBe(p.bakeTex);
    expect(carried.uniforms.wearGrime).toBeDefined();
    expect(carried.uniforms.skyPlane).toBe((mesh.userData.skyPlane as Record<string, unknown>).skyPlane);
    expect(carried.uniforms.skyPlaneUp).toBeDefined();
  });

  it('on a ring with no patch, starts a bare surface patch with the sky host; with no plane, leaves no plane on the mesh', () => {
    const material = new THREE.MeshLambertMaterial();
    const mesh = ring(material);
    hostSkyGuests(mesh, null);
    expect(nodePatchOf(material)!.patch).toEqual({ kind: 'surface', recipe: recipe({ skyHost: true }) });
    expect(material.customProgramCacheKey()).toBe('surface:none:none:sky-host');
    expect(mesh.userData.skyPlane).toBeUndefined();
  });

  it('keeps the junk glow of a ring that carries it', () => {
    const material = patchSurfaceMaterial(new THREE.MeshLambertMaterial(), { wear: null, probes: null }, { flicker: { value: new THREE.Vector3() } });
    hostSkyGuests(ring(material), null);
    expect(material.customProgramCacheKey()).toBe('surface:none:none:dressing-junk-neon:sky-host');
    expect(patchUniforms(material).neonFlicker).toBeDefined();
  });
});

describe('no GLSL for a scene material is left in the sources (W6b)', () => {
  const offenders = (re: RegExp): string[] => Object.entries(sources).filter(([, t]) => re.test(code(t))).map(([f]) => f);

  it('no non-test file assigns or defines onBeforeCompile', () => {
    expect(offenders(/\bonBeforeCompile\b/)).toEqual([]);
  });

  it('no non-test file holds GLSL: no #include chunks, gl_ built-ins, ShaderMaterial or shader-chunk replacement', () => {
    expect(offenders(/#include\s*</)).toEqual([]);
    expect(offenders(/\bgl_(?:PointSize|FragColor|Position|FragCoord|PointCoord)\b/)).toEqual([]);
    expect(offenders(/\b(?:Raw)?ShaderMaterial\b/)).toEqual([]);
    expect(offenders(/\bShaderChunk\b|\bvarying\s+(?:float|vec\d)\b|\buniform\s+(?:float|vec\d|mat\d|sampler\w+)\s/)).toEqual([]);
  });

  it('the guard sees a violation (the sources glob is not empty and the stripper keeps real code)', () => {
    expect(Object.keys(sources).length).toBeGreaterThan(100);
    expect(code('m.onBeforeCompile = (s) => s;')).toMatch(/onBeforeCompile/);
    expect(code('// the old onBeforeCompile\nconst a = 1;')).not.toMatch(/onBeforeCompile/);
  });
});
