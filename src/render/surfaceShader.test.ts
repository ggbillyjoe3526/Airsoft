import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { QUALITY, SURFACES } from '../config/render';
import { WEATHERING } from '../config/weathering';
import { DEPOT } from '../map/depot';
import { buildMapMeshes, disposeMapMeshes, mapLookOf } from './mapMeshes';
import { CORE_SURFACES, type SurfaceTextures } from './proceduralTextures';
import { NO_ENVIRONMENT } from './surfaceMaterials';
import { applySurfacePatch, patchesShader, patchSurfaceMaterial, type ProbeUniforms, type SurfacePatch, surfacePatchKey } from './surfaceShader';

/** The map surfaces' shader additions (G6): weathering and the per-pixel baked light, on Three.js's own shaders. */

const probes = (): ProbeUniforms => ({
  bakeTex: { value: null },
  bakeMin: { value: new THREE.Vector3() },
  bakeSize: { value: new THREE.Vector3(1, 1, 1) },
  bakeScale: { value: 1 },
  bakeOcclusion: { value: 1 },
  bakeBounce: { value: 1 },
  bakeLift: { value: 0.3 },
});

/** What onBeforeCompile receives for a material of `kind`: Three.js's own shader source. */
function shaderOf(kind: 'lambert' | 'physical'): THREE.WebGLProgramParametersWithUniforms {
  const lib = THREE.ShaderLib[kind === 'lambert' ? 'lambert' : 'physical'];
  return { vertexShader: lib.vertexShader, fragmentShader: lib.fragmentShader, uniforms: {} } as unknown as THREE.WebGLProgramParametersWithUniforms;
}

describe('the surface shader patch (G6)', () => {
  const wear = WEATHERING.shader.corrugated;

  it('finds every place it writes into, in the Lambert and the Standard shaders', () => {
    for (const kind of ['lambert', 'physical'] as const) {
      const shader = shaderOf(kind);
      const before = { v: shader.vertexShader, f: shader.fragmentShader };
      const p: SurfacePatch = { environment: false, wear, probes: probes() };
      applySurfacePatch(shader, p);
      expect(shader.vertexShader.startsWith(NO_ENVIRONMENT)).toBe(true);
      expect(shader.vertexShader).toContain('vSurfW = (modelMatrix');
      expect(shader.fragmentShader).toContain('float wearG = 0.0;');
      expect(shader.fragmentShader).toContain('reflectedLight.indirectDiffuse = reflectedLight.indirectDiffuse * bakeVis');
      expect(shader.fragmentShader).toContain('uniform highp sampler3D bakeTex;');
      // Rust on steel (the corrugated sheet's).
      expect(shader.fragmentShader).toContain('float rs = ');
      if (kind === 'physical') expect(shader.fragmentShader).toContain('roughnessFactor = mix(roughnessFactor, 1.0, wearG');
      expect(shader.uniforms.bakeTex).toBe(p.probes!.bakeTex);
      expect(shader.vertexShader.length).toBeGreaterThan(before.v.length);
      expect(shader.fragmentShader.length).toBeGreaterThan(before.f.length);
    }
  });

  it('adds nothing for a patch with neither (Low’s shader stays withoutEnvironment’s)', () => {
    const p: SurfacePatch = { environment: false, wear: null, probes: null };
    expect(patchesShader(p)).toBe(false);
    expect(patchesShader({ ...p, wear: WEATHERING.shader.glass })).toBe(false);
    const shader = shaderOf('lambert');
    const f = shader.fragmentShader;
    applySurfacePatch(shader, p);
    expect(shader.fragmentShader).toBe(NO_ENVIRONMENT + f);
    // The environment kept: nothing at all.
    const steel = shaderOf('physical');
    const sf = steel.fragmentShader;
    applySurfacePatch(steel, { environment: true, wear: null, probes: null });
    expect(steel.fragmentShader).toBe(sf);
  });

  it('keys one program per variant: weathering strength, rust, baked light and the environment', () => {
    const keys = new Set(
      [
        { environment: false, wear: null, probes: null },
        { environment: false, wear: WEATHERING.shader.blockWall, probes: null },
        { environment: false, wear: WEATHERING.shader.corrugated, probes: null },
        { environment: false, wear: WEATHERING.shader.blockWall, probes: probes() },
        { environment: true, wear: WEATHERING.shader.steelPlate, probes: probes() },
      ].map(surfacePatchKey),
    );
    expect(keys.size).toBe(5);
    // Two materials with the same patch share a program.
    expect(surfacePatchKey({ environment: false, wear: WEATHERING.shader.blockWall, probes: probes() })).toBe(
      surfacePatchKey({ environment: false, wear: WEATHERING.shader.blockWall, probes: probes() }),
    );
    const m = patchSurfaceMaterial(new THREE.MeshLambertMaterial(), { environment: false, wear: WEATHERING.shader.blockWall, probes: null });
    expect(m.customProgramCacheKey()).toBe(surfacePatchKey({ environment: false, wear: WEATHERING.shader.blockWall, probes: null }));
    m.dispose();
  });

  it('weathers Depot from Medium up, never on Low', () => {
    const textures = Object.fromEntries(
      CORE_SURFACES.map((id) => [id, { texture: Object.assign(new THREE.Texture(), { name: id }), worldSize: SURFACES.worldSize[id] }]),
    ) as unknown as SurfaceTextures;
    for (const [q, weathered] of [
      ['low', false],
      ['medium', true],
      ['high', true],
    ] as const) {
      const group = buildMapMeshes(DEPOT, textures, { ...mapLookOf(QUALITY[q]), relief: false }, null);
      const keys = group.children.map((o) => ((o as THREE.Mesh).material as THREE.Material).customProgramCacheKey());
      expect(keys.some((k) => k.includes(':g')), q).toBe(weathered);
      if (!weathered) expect(keys.every((k) => k === 'without-environment')).toBe(true);
      disposeMapMeshes(group);
    }
  });
});
