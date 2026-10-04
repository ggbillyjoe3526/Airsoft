import * as THREE from 'three';
import { REPLICA_FINISH } from '../config/replicaFinish';
import { createRng, rngNext } from '../sim/rng';

/**
 * The replicas' moulded speckle (FA8, REPLICA_FINISH.speckle): a small height field of 1-pixel noise, used as a
 * roughness map and, through a Sobel pass, as a normal map. Data textures, so they need no canvas and are tested
 * headless. The caller owns (and disposes) them.
 */
export interface SpeckleTextures {
  roughness: THREE.DataTexture;
  normal: THREE.DataTexture;
  dispose(): void;
}

/** The speckle's heights (0..255), `size`² from a seeded generator: `grey` ± `noise`. */
export function speckleHeights(size: number, grey: number, noise: number, seed: number): Uint8Array {
  const rng = createRng(seed);
  const out = new Uint8Array(size * size);
  for (let i = 0; i < out.length; i++) out[i] = Math.round(grey + (rngNext(rng) * 2 - 1) * noise);
  return out;
}

/**
 * A tangent-space normal map (RGBA, 0..255) from a tiling height field: a Sobel gradient of `strength` per unit of
 * height (over 255), wrapped at the edges so the texture repeats without a seam.
 */
export function heightToNormal(heights: Uint8Array, size: number, strength: number): Uint8Array {
  const out = new Uint8Array(size * size * 4);
  const h = (x: number, y: number): number => heights[((y + size) % size) * size + ((x + size) % size)]! / 255;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = h(x + 1, y - 1) + 2 * h(x + 1, y) + h(x + 1, y + 1) - h(x - 1, y - 1) - 2 * h(x - 1, y) - h(x - 1, y + 1);
      const dy = h(x - 1, y + 1) + 2 * h(x, y + 1) + h(x + 1, y + 1) - h(x - 1, y - 1) - 2 * h(x, y - 1) - h(x + 1, y - 1);
      let nx = -dx * strength;
      let ny = -dy * strength;
      let nz = 1;
      const len = Math.hypot(nx, ny, nz);
      nx /= len;
      ny /= len;
      nz /= len;
      const o = (y * size + x) * 4;
      out[o] = Math.round((nx * 0.5 + 0.5) * 255);
      out[o + 1] = Math.round((ny * 0.5 + 0.5) * 255);
      out[o + 2] = Math.round((nz * 0.5 + 0.5) * 255);
      out[o + 3] = 255;
    }
  }
  return out;
}

function dataTexture(data: Uint8Array, size: number): THREE.DataTexture {
  const tex = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.generateMipmaps = true;
  tex.needsUpdate = true;
  return tex;
}

/** The speckle's roughness and normal maps (REPLICA_FINISH.speckle). */
export function speckleTextures(): SpeckleTextures {
  const S = REPLICA_FINISH.speckle;
  const heights = speckleHeights(S.size, S.grey, S.noise, S.seed);
  const grey = new Uint8Array(S.size * S.size * 4);
  for (let i = 0; i < heights.length; i++) grey.set([heights[i]!, heights[i]!, heights[i]!, 255], i * 4);
  const roughness = dataTexture(grey, S.size);
  const normal = dataTexture(heightToNormal(heights, S.size, S.normalStrength), S.size);
  return {
    roughness,
    normal,
    dispose() {
      roughness.dispose();
      normal.dispose();
    },
  };
}

/**
 * Box-projected texture coordinates (metres × `perMetre`) for a part of the replica: each vertex takes the two axes
 * across its normal's main axis, so the speckle has the same grain on every face whatever the part's size. Sets `uv`.
 */
export function projectSpeckleUvs(geo: THREE.BufferGeometry, perMetre: number): void {
  const pos = geo.getAttribute('position');
  const nor = geo.getAttribute('normal');
  const uv = new Float32Array(pos.count * 2);
  for (let i = 0; i < pos.count; i++) {
    const ax = Math.abs(nor.getX(i));
    const ay = Math.abs(nor.getY(i));
    const az = Math.abs(nor.getZ(i));
    const [u, v] = ax >= ay && ax >= az ? [pos.getZ(i), pos.getY(i)] : ay >= az ? [pos.getX(i), pos.getZ(i)] : [pos.getX(i), pos.getY(i)];
    uv[i * 2] = u * perMetre;
    uv[i * 2 + 1] = v * perMetre;
  }
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
}
