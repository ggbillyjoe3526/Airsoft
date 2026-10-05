import * as THREE from 'three';
import { GROUND_LOOK, TERRAIN_LOOK } from '../config/render';
import { GROUND_SURFACES, type GroundGrid } from '../map/groundSurfaces';
import { type Terrain, terrainMesh, terrainRange } from '../map/terrain';
import { withoutEnvironment } from './surfaceMaterials';

/**
 * A map's ground drawn (M33i): its grid, the textured material, the tile's size (m) for the world UVs and its mean
 * linear luminance (the colours are divided by it, so the tile is grain around 1, not a darkening).
 */
export interface GroundLook {
  grid: GroundGrid;
  material: THREE.Material;
  tile: number;
  mean: number;
}

const surfaceColour = new THREE.Color();
const blended = new THREE.Color();

/**
 * The colour of the ground at a terrain vertex (x, z) of height share `k` (0 low .. 1 high) into `out`: the surfaces of
 * the cells within GROUND_LOOK.blend cells of it averaged (soft edges), grass the TERRAIN_LOOK greens by height, ground
 * under the trees GROUND_LOOK.underTreeShade darker. Exported for the tests.
 */
export function groundColour(grid: GroundGrid, x: number, z: number, k: number, low: THREE.Color, high: THREE.Color, out: THREE.Color): THREE.Color {
  const b = GROUND_LOOK.blend;
  out.setRGB(0, 0, 0);
  let n = 0;
  for (let a = -b; a < b; a++) {
    for (let c = -b; c < b; c++) {
      const i = Math.min(grid.cols - 1, Math.max(0, Math.floor((x + (a + 0.5) * grid.cell - grid.minX) / grid.cell)));
      const j = Math.min(grid.rows - 1, Math.max(0, Math.floor((z + (c + 0.5) * grid.cell - grid.minZ) / grid.cell)));
      const cell = j * grid.cols + i;
      const surface = GROUND_SURFACES[grid.surface[cell]!]!;
      if (surface === 'grass') surfaceColour.copy(low).lerp(high, k);
      else surfaceColour.setHex(GROUND_LOOK.colours[surface], THREE.SRGBColorSpace);
      if (grid.underTrees[cell] === 1) surfaceColour.multiplyScalar(GROUND_LOOK.underTreeShade);
      out.add(surfaceColour);
      n++;
    }
  }
  return out.multiplyScalar(1 / n);
}

/**
 * The ground of a map with terrain (M33c): one mesh of the terrain's own triangles (map/terrain.ts), so what you see is
 * what you stand on. A vertex-coloured grass green that varies a little from vertex to vertex and gets a touch lighter
 * uphill, so slopes and the hill read; with a map's ground (M33i, `ground`) each vertex takes its surfaces' colours
 * instead (render/groundColour), under a world-mapped greyscale tile in `ground.material`. One draw call either way; it
 * receives shadows and casts none (a heightfield this gentle shades itself by its normals).
 */
export function buildTerrainMesh(t: Terrain, ground: GroundLook | null = null): THREE.Mesh {
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
    if (ground) groundColour(ground.grid, positions[v * 3]!, positions[v * 3 + 2]!, k, low, high, blended).multiplyScalar(jitter / ground.mean);
    const out = ground ? blended : c.copy(low).lerp(high, k).multiplyScalar(jitter);
    colors[v * 3] = out.r;
    colors[v * 3 + 1] = out.g;
    colors[v * 3 + 2] = out.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  if (ground) {
    const uvs = new Float32Array((positions.length / 3) * 2);
    for (let v = 0; v < positions.length / 3; v++) uvs.set([positions[v * 3]! / ground.tile, -positions[v * 3 + 2]! / ground.tile], v * 2);
    geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  }
  geo.computeBoundingSphere();
  const mesh = new THREE.Mesh(geo, ground?.material ?? withoutEnvironment(new THREE.MeshLambertMaterial({ vertexColors: true })));
  mesh.name = 'map-terrain';
  mesh.receiveShadow = true;
  mesh.castShadow = false;
  mesh.matrixAutoUpdate = false;
  mesh.updateMatrix();
  return mesh;
}
