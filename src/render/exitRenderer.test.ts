import * as THREE from 'three';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { EXIT_VISUALS as V } from '../config/render';
import { buildTerrain, terrainHeightAt } from '../map/terrain';
import { createRunState, type RunExit } from '../sim/extraction';
import { vec3 } from '../sim/vec';
import { ExitRenderer } from './exitRenderer';

/** A field rising 10 % to the east (+x) and 5 % to the south (+z), like a stretch of Woodland's slope but steeper. */
const SLOPE = buildTerrain(-10, -10, 1, 20, 20, (x, z) => 2 + 0.1 * x + 0.05 * z);
const groundAt = (x: number, z: number): number => terrainHeightAt(SLOPE, x, z)!;

function exitAt(x: number, z: number): RunExit {
  return { name: 'Gate', position: vec3(x, groundAt(x, z), z), radius: 3, late: false, closed: false, open: true } as RunExit;
}

/** The world positions of a mesh's vertices. */
function worldVertices(m: THREE.Mesh): THREE.Vector3[] {
  m.updateWorldMatrix(true, false);
  const p = m.geometry.attributes.position!;
  return Array.from({ length: p.count }, (_, i) => new THREE.Vector3(p.getX(i), p.getY(i), p.getZ(i)).applyMatrix4(m.matrixWorld));
}

function meshes(o: THREE.Object3D): THREE.Mesh[] {
  const out: THREE.Mesh[] = [];
  o.traverse((c) => {
    if (c instanceof THREE.Mesh) out.push(c);
  });
  return out;
}

describe('ExitRenderer on terrain (M48)', () => {
  // The EXIT board is drawn on a canvas; the unit tests run without a page, so a canvas with no 2D context stands in.
  beforeAll(() => {
    vi.stubGlobal('document', { createElement: () => ({ width: 0, height: 0, getContext: () => null }) });
  });
  afterAll(() => {
    vi.unstubAllGlobals();
  });

  it('lays the ring and its wash on a slope just over the ground, so the uphill side is not buried', () => {
    const run = createRunState();
    run.exits = [exitAt(1, -2)];
    const r = new ExitRenderer(run, SLOPE);
    r.object.updateMatrixWorld(true);
    const [ring, fill] = meshes(r.object);
    for (const [mesh, lift] of [[ring!, V.ringLift], [fill!, V.ringLift * 0.5]] as const) {
      for (const v of worldVertices(mesh)) expect(v.y - groundAt(v.x, v.z), `${v.x.toFixed(2)}, ${v.z.toFixed(2)}`).toBeCloseTo(lift, 4);
    }
    r.dispose();
  });

  it('stands the cones and the sign post on the ground round the ring', () => {
    const run = createRunState();
    run.exits = [exitAt(1, -2)];
    const r = new ExitRenderer(run, SLOPE);
    r.object.updateMatrixWorld(true);
    const standing = meshes(r.object).filter((m) => m.geometry instanceof THREE.ConeGeometry || m.geometry instanceof THREE.CylinderGeometry);
    expect(standing).toHaveLength(V.cones + 1);
    for (const m of standing) {
      const foot = new THREE.Vector3().setFromMatrixPosition(m.matrixWorld);
      expect(foot.y, `${foot.x.toFixed(2)}, ${foot.z.toFixed(2)}`).toBeCloseTo(groundAt(foot.x, foot.z), 4);
    }
    r.dispose();
  });

  it('keeps an exit flat where the map has no terrain, as on Depot and Neon Heights', () => {
    const run = createRunState();
    run.exits = [{ ...exitAt(1, -2), position: vec3(1, 3, -2) }];
    const r = new ExitRenderer(run);
    r.object.updateMatrixWorld(true);
    for (const v of worldVertices(meshes(r.object)[0]!)) expect(v.y).toBeCloseTo(3 + V.ringLift, 5);
    r.dispose();
  });
});
