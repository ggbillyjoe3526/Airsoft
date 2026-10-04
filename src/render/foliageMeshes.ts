import * as THREE from 'three';
import { FOLIAGE_LOOK } from '../config/render';
import type { Bush } from '../map/foliage';
import { withoutEnvironment } from './surfaceMaterials';

/** A fixed hash of an integer to [-1, 1], so every bush keeps its lumps and shade from one load to the next. */
function hash(n: number): number {
  return ((Math.imul(n + 1, 2654435761) >>> 0) / 0xffffffff) * 2 - 1;
}

/**
 * A map's bushes (M33e, MapData.foliage) as one merged mesh: each bush a lumpy icosphere stretched to its ellipsoid, in
 * a vertex-coloured dark green. One draw call for every bush on the map; they cast and receive shadows. No collider:
 * bushes are drawn only (bots read them through map/foliage.ts). Null when the map has none.
 */
export function buildFoliageMesh(bushes: readonly Bush[]): THREE.Mesh | null {
  if (bushes.length === 0) return null;
  const unit = new THREE.IcosahedronGeometry(1, FOLIAGE_LOOK.detail);
  const unitPos = unit.getAttribute('position');
  const perBush = unitPos.count;
  const positions = new Float32Array(perBush * bushes.length * 3);
  const colors = new Float32Array(positions.length);
  const base = new THREE.Color().setHex(FOLIAGE_LOOK.colour, THREE.SRGBColorSpace);
  const c = new THREE.Color();
  // Vertices that share a position must move together, or the lumps tear the surface open: key the push on the position.
  const key = (x: number, y: number, z: number): number => Math.round(x * 1000) * 73856093 ^ Math.round(y * 1000) * 19349663 ^ Math.round(z * 1000) * 83492791;
  bushes.forEach((bush, b) => {
    const half = bush.height / 2;
    for (let v = 0; v < perBush; v++) {
      const ux = unitPos.getX(v);
      const uy = unitPos.getY(v);
      const uz = unitPos.getZ(v);
      const k = key(ux, uy, uz) + b * 7919;
      const push = 1 + FOLIAGE_LOOK.lump * hash(k);
      const o = (b * perBush + v) * 3;
      positions[o] = bush.x + ux * bush.radius * push;
      positions[o + 1] = bush.y + half + uy * half * push;
      positions[o + 2] = bush.z + uz * bush.radius * push;
      // Darker underneath, lighter on top, with a little noise.
      c.copy(base).multiplyScalar((0.8 + 0.25 * (uy + 1) / 2) * (1 + FOLIAGE_LOOK.jitter * hash(k + 1)));
      colors[o] = c.r;
      colors[o + 1] = c.g;
      colors[o + 2] = c.b;
    }
  });
  unit.dispose();
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.computeVertexNormals();
  geo.computeBoundingSphere();
  const mesh = new THREE.Mesh(geo, withoutEnvironment(new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true })));
  mesh.name = 'map-foliage';
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.matrixAutoUpdate = false;
  mesh.updateMatrix();
  return mesh;
}
