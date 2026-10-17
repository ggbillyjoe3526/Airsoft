import * as THREE from 'three';
import type { MapBlock } from '../../../map/mapTypes';
import { RAMP_FACES, rampCorners } from '../../../map/surfaces';
import { type Buffers, FACES } from '../cuboidMesh';
import type { ProceduralTexture } from '../proceduralTextures';

/** A ramp drawn as its wedge (A8: the one block kind that isn't built from boxes). Allocation-free. */

const rampCorner = new Float32Array(18);
const faceNormal = new THREE.Vector3();
const edgeA = new THREE.Vector3();
const edgeB = new THREE.Vector3();

/**
 * A ramp's wedge (see map/surfaces.ts), flat-shaded with world UVs: each face is textured along the box
 * face whose normal is closest to its own (the slope like the top, so its texture stretches by 1 / cos of
 * the slope).
 */
export function appendRamp(buf: Buffers, block: MapBlock, tex: ProceduralTexture, color: THREE.Color): void {
  const c = block.center;
  const p = rampCorner;
  rampCorners(block, p);
  for (const face of RAMP_FACES) {
    const [i0, i1, i2] = face as [number, number, number];
    edgeA.set(p[i1 * 3]! - p[i0 * 3]!, p[i1 * 3 + 1]! - p[i0 * 3 + 1]!, p[i1 * 3 + 2]! - p[i0 * 3 + 2]!);
    edgeB.set(p[i2 * 3]! - p[i0 * 3]!, p[i2 * 3 + 1]! - p[i0 * 3 + 1]!, p[i2 * 3 + 2]! - p[i0 * 3 + 2]!);
    faceNormal.crossVectors(edgeA, edgeB).normalize();
    let f: (typeof FACES)[number] = FACES[0];
    let best = Number.NEGATIVE_INFINITY;
    for (const g of FACES) {
      const d = g.n[0] * faceNormal.x + g.n[1] * faceNormal.y + g.n[2] * faceNormal.z;
      if (d > best) {
        best = d;
        f = g;
      }
    }
    const base = buf.positions.length / 3;
    for (const k of face) {
      const px = c.x + p[k * 3]!;
      const py = c.y + p[k * 3 + 1]!;
      const pz = c.z + p[k * 3 + 2]!;
      buf.positions.push(px, py, pz);
      buf.normals.push(faceNormal.x, faceNormal.y, faceNormal.z);
      buf.colors.push(color.r, color.g, color.b);
      buf.uvs.push((px * f.u[0] + py * f.u[1] + pz * f.u[2]) / tex.worldSize, (px * f.v[0] + py * f.v[1] + pz * f.v[2]) / tex.worldSize);
    }
    for (let k = 2; k < face.length; k++) buf.indices.push(base, base + k - 1, base + k);
  }
}
