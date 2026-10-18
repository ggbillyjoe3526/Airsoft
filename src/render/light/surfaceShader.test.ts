import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { QUALITY, SURFACES } from '../../config/render';
import { WEATHERING } from '../../config/weathering';
import { DEPOT } from '../../map/depot';
import { buildMapMeshes, disposeMapMeshes, mapLookOf } from '../field/mapMeshes';
import { CORE_SURFACES, type SurfaceTextures } from '../field/proceduralTextures';
import { nodePatchOf, patchKey } from '../nodePatch';
import { patchesShader, patchSurfaceMaterial, type ProbeUniforms, type SurfacePatch, surfaceNodePatch } from './surfaceShader';

/** The map surfaces' shader additions (G6): weathering and the per-pixel baked light, carried as node patches (W6b). */

const probes = (): ProbeUniforms => ({
  bakeTex: { value: null },
  bakeMin: { value: new THREE.Vector3() },
  bakeSize: { value: new THREE.Vector3(1, 1, 1) },
  bakeScale: { value: 1 },
  bakeOcclusion: { value: 1 },
  bakeBounce: { value: 1 },
  bakeLift: { value: 0.3 },
});

describe('the surface shader patch (G6)', () => {
  const wear = WEATHERING.shader.corrugated;

  it('carries the weathering as the surface’s own values and the baked light by reference', () => {
    const p: SurfacePatch = { wear, probes: probes() };
    const { recipe, uniforms } = surfaceNodePatch(p);
    expect(recipe).toEqual({ wear: true, probes: true, junk: null, skyHost: false });
    expect(uniforms.bakeTex).toBe(p.probes!.bakeTex);
    expect(uniforms.bakeLift).toBe(p.probes!.bakeLift);
    expect(uniforms.wearGrime!.value).toBe(wear.grime);
    expect(uniforms.wearRust!.value).toBe(wear.rust);
    const m = patchSurfaceMaterial(new THREE.MeshLambertMaterial(), p);
    expect(nodePatchOf(m)?.patch).toEqual({ kind: 'surface', recipe });
    expect(nodePatchOf(m)?.uniforms.bakeTex).toBe(p.probes!.bakeTex);
    m.dispose();
  });

  it('adds nothing for a patch with neither (Low’s surfaces are Three’s own)', () => {
    const p: SurfacePatch = { wear: null, probes: null };
    expect(patchesShader(p)).toBe(false);
    expect(patchesShader({ ...p, wear: WEATHERING.shader.glass })).toBe(false);
    expect(patchesShader({ ...p, probes: probes() })).toBe(true);
    expect(surfaceNodePatch(p).uniforms).toEqual({});
  });

  it('keys one program per variant (weathering, baked light, the junk), whatever the surface’s strengths', () => {
    const key = (p: SurfacePatch, flicker?: boolean): string =>
      patchKey({ kind: 'surface', recipe: surfaceNodePatch(p, flicker === undefined ? null : { flicker: flicker ? { value: new THREE.Vector3() } : null }).recipe });
    const keys = new Set([
      key({ wear: WEATHERING.shader.blockWall, probes: null }),
      key({ wear: WEATHERING.shader.blockWall, probes: probes() }),
      key({ wear: null, probes: probes() }),
      key({ wear: null, probes: null }, false),
      key({ wear: null, probes: null }, true),
    ]);
    expect(keys.size).toBe(5);
    // Surfaces weathered at different strengths, with or without rust, share a program.
    expect(key({ wear: WEATHERING.shader.blockWall, probes: probes() })).toBe(key({ wear: WEATHERING.shader.corrugated, probes: probes() }));
    const m = patchSurfaceMaterial(new THREE.MeshLambertMaterial(), { wear: WEATHERING.shader.blockWall, probes: null });
    expect(m.customProgramCacheKey()).toBe('surface:wear:none');
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
      // G8: Depot's set dressing (its junk and its puddles) is two programs of its own from Medium, none on Low.
      const dressing = group.children.filter((o) => o.name === 'map-junk' || o.name === 'map-puddles');
      expect(dressing.length, q).toBe(weathered ? 2 : 0);
      const keys = group.children.filter((o) => !dressing.includes(o)).map((o) => ((o as THREE.Mesh).material as THREE.Material).customProgramCacheKey());
      expect(keys.some((k) => k.includes(':wear')), q).toBe(weathered);
      const patched = group.children.filter((o) => !dressing.includes(o) && nodePatchOf((o as THREE.Mesh).material as THREE.Material));
      if (!weathered) expect(patched).toEqual([]);
      // A handful of programs for the whole map (a match start compiles few).
      expect(new Set(keys).size, q).toBeLessThanOrEqual(2);
      disposeMapMeshes(group);
    }
  });
});
