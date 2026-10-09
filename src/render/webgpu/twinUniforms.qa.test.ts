import * as THREE from 'three';
import type { NodeFrame } from 'three/webgpu';
import { describe, expect, it } from 'vitest';
import { WEATHERING } from '../../config/weathering';
import { patchSurfaceMaterial } from '../surfaceShader';
import { emptyGrid, type SurfaceLambertTwin } from './surfaceNodes';
import { objectTexture3D } from './twinUniforms';
import { worldTwin } from './worldTwins';

/**
 * W3 QA: Depot's baked light on WebGPU. Three binds a texture again only when its version differs from the one bound
 * (not when it is another texture of the same version), so a map's grid swapped in with the version of the last one must
 * be marked for upload once; and a surface's twin starts on its own material's grid. The pictures are compared on a
 * WebGPU device (pipeline/webgpu-compare.mjs, Depot's views).
 */

/** A grid uploaded `uploads` times (its version). */
function grid(uploads: number): THREE.Data3DTexture {
  const t = new THREE.Data3DTexture(new Uint8Array(4), 1, 1, 1);
  for (let i = 0; i < uploads; i++) t.needsUpdate = true;
  return t;
}
/** A frame whose drawn object's material carries `bakeTex` (or no probes at all). */
function frameWith(bakeTex?: THREE.Data3DTexture): NodeFrame {
  const material = new THREE.MeshLambertMaterial();
  if (bakeTex) material.onBeforeCompile = (shader) => void (shader.uniforms.bakeTex = { value: bakeTex });
  return { material } as unknown as NodeFrame;
}
const run = (node: unknown, frame: NodeFrame): void => (node as { update(f: NodeFrame): void }).update(frame);
const probes = (tex: THREE.Data3DTexture) => ({ bakeTex: { value: tex }, bakeMin: { value: new THREE.Vector3() }, bakeSize: { value: new THREE.Vector3(1, 1, 1) }, bakeScale: { value: 1 }, bakeOcclusion: { value: 1 }, bakeBounce: { value: 1 }, bakeLift: { value: 0.1 } });

describe('the baked light’s grid follows the drawn object (W3 criterion 1: Depot’s baked light)', () => {
  it('a grid swapped in with the same version as the one swapped out is marked for upload once, so Three binds the new one', () => {
    const stand = grid(1);
    const node = objectTexture3D('bakeTex', stand, new THREE.Vector3() as never);
    const depot = grid(1);
    expect(depot.version).toBe(stand.version);
    run(node, frameWith(depot));
    expect(node.value).toBe(depot);
    expect(depot.version).toBe(stand.version + 1);
    // The next frames with the same grid add nothing: it is uploaded once, not every frame.
    const settled = depot.version;
    for (let i = 0; i < 5; i++) run(node, frameWith(depot));
    expect(depot.version).toBe(settled);
  });

  it('swapping between two maps’ grids marks only the swap that would have kept the old one bound; the versions then differ', () => {
    const a = grid(1);
    const b = grid(1);
    const node = objectTexture3D('bakeTex', a, new THREE.Vector3() as never);
    run(node, frameWith(a));
    expect(a.version).toBe(1);
    run(node, frameWith(b));
    expect(b.version).toBe(2);
    // Back to the first: its version (1) differs from the second's (2), so Three rebinds with no mark.
    run(node, frameWith(a));
    expect(node.value).toBe(a);
    expect(a.version).toBe(1);
    run(node, frameWith(b));
    expect(node.value).toBe(b);
    expect(b.version).toBe(2);
  });

  it('leaves a grid of another version alone (Three binds it already) and leaves the one it replaced alone', () => {
    const stand = grid(1);
    const node = objectTexture3D('bakeTex', stand, new THREE.Vector3() as never);
    const later = grid(4);
    run(node, frameWith(later));
    expect(node.value).toBe(later);
    expect(later.version).toBe(4);
    expect(stand.version).toBe(1);
  });

  it('an object with no grid of its own reads the stand-in, which is not marked when it differs in version', () => {
    const stand = grid(3);
    const node = objectTexture3D('bakeTex', stand, new THREE.Vector3() as never);
    const depot = grid(1);
    run(node, frameWith(depot));
    run(node, frameWith());
    expect(node.value).toBe(stand);
    expect(stand.version).toBe(3);
  });
});

describe('a surface twin starts on its own material’s grid (W3: the first draws bind it)', () => {
  const surface = (tex: THREE.Data3DTexture | null, withProbes = true) =>
    patchSurfaceMaterial(new THREE.MeshLambertMaterial(), { environment: false, wear: WEATHERING.shader.concrete, probes: withProbes && tex ? probes(tex) : null });
  const startedOn = (twin: SurfaceLambertTwin | null) => (twin!.surface as unknown as { grid: THREE.Data3DTexture }).grid;

  it('reads the material’s bakeTex for a surface with probes, and the stand-in for one without', () => {
    const stand = emptyGrid();
    const own = grid(1);
    expect(startedOn(worldTwin(surface(own), stand) as SurfaceLambertTwin)).toBe(own);
    expect(startedOn(worldTwin(surface(null, false), stand) as SurfaceLambertTwin)).toBe(stand);
  });

  it('falls back to the stand-in while the material’s grid is null (a freed grid is never drawn)', () => {
    const stand = emptyGrid();
    const p = probes(grid(1));
    p.bakeTex.value = null as unknown as THREE.Data3DTexture;
    const bare = patchSurfaceMaterial(new THREE.MeshLambertMaterial(), { environment: false, wear: WEATHERING.shader.concrete, probes: p });
    expect(startedOn(worldTwin(bare, stand) as SurfaceLambertTwin)).toBe(stand);
  });
});
