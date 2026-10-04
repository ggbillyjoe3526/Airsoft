import * as THREE from 'three';
import { TERRAIN_LOOK } from '../config/render';
import { type Terrain, terrainMesh, terrainRange } from '../map/terrain';
import { withoutEnvironment } from './surfaceMaterials';

/**
 * The ground of a map with terrain (M33c): one mesh of the terrain's own triangles (map/terrain.ts), so what you see is
 * what you stand on. Greybox for now: a vertex-coloured grass green that varies a little from vertex to vertex and gets
 * a touch lighter uphill, so slopes and the hill read. One draw call; it receives shadows and casts none (a heightfield
 * this gentle shades itself by its normals).
 */
export function buildTerrainMesh(t: Terrain): THREE.Mesh {
  const { positions, indices } = terrainMesh(t);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setIndex(new THREE.BufferAttribute(indices, 1));
  geo.computeVertexNormals();
  const { min, max } = terrainRange(t);
  const span = Math.max(1e-6, max - min);
  const low = new THREE.Color().setHex(TERRAIN_LOOK.low, THREE.SRGBColorSpace);
  const high = new THREE.Color().setHex(TERRAIN_LOOK.high, THREE.SRGBColorSpace);
  const c = new THREE.Color();
  const colors = new Float32Array(positions.length);
  for (let v = 0; v < positions.length / 3; v++) {
    const k = (positions[v * 3 + 1]! - min) / span;
    // A fixed per-vertex jitter (a hash of the index), so the green isn't flat; no randomness at run time.
    const jitter = 1 + TERRAIN_LOOK.jitter * (((Math.imul(v + 1, 2654435761) >>> 0) / 0xffffffff) * 2 - 1);
    c.copy(low).lerp(high, k).multiplyScalar(jitter);
    colors[v * 3] = c.r;
    colors[v * 3 + 1] = c.g;
    colors[v * 3 + 2] = c.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.computeBoundingSphere();
  const mesh = new THREE.Mesh(geo, withoutEnvironment(new THREE.MeshLambertMaterial({ vertexColors: true })));
  mesh.name = 'map-terrain';
  mesh.receiveShadow = true;
  mesh.castShadow = false;
  mesh.matrixAutoUpdate = false;
  mesh.updateMatrix();
  return mesh;
}
