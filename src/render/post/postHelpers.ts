import * as THREE from 'three';
import { POST } from '../../config/post';
import { createRng, rngNext } from '../../sim/rng';

/**
 * The post stack's pure helpers (G5), shared by its node passes (WebGPU overhaul W4; WebGL's GLSL passes they came with
 * were deleted in W6): the temporal blend's jitter, where the sun falls on screen, which meshes reflect, and the
 * ambient occlusion denoise's rotation noise.
 */

/** The `index`-th value (from 1) of the Halton sequence in `base`: low-discrepancy sub-pixel offsets in 0..1. */
export function halton(index: number, base: number): number {
  let f = 1;
  let r = 0;
  for (let i = index; i > 0; i = Math.floor(i / base)) {
    f /= base;
    r += f * (i % base);
  }
  return r;
}

/** The jitter sequence: `count` (x, y) offsets in pixels, each in -0.5..0.5 (Halton 2 and 3, from the first). */
export function jitterSequence(count: number): Float32Array {
  const out = new Float32Array(count * 2);
  for (let i = 0; i < count; i++) {
    out[i * 2] = halton(i + 1, 2) - 0.5;
    out[i * 2 + 1] = halton(i + 1, 3) - 0.5;
  }
  return out;
}

/**
 * Moves the picture `camera` draws by a sub-pixel offset (`dx`, `dy` pixels of a `width` × `height` drawing buffer, +x
 * right, +y up): the temporal blend's jitter. The chain puts the projection back after it (the HUD, the overlay
 * and every later reader see the plain one).
 */
export function jitterProjection(camera: THREE.PerspectiveCamera, dx: number, dy: number, width: number, height: number): void {
  const e = camera.projectionMatrix.elements;
  // Clip x and y gain this times view z, and w is -z: the picture moves by minus this in NDC (2 across the buffer).
  e[8] -= (dx * 2) / width;
  e[9] -= (dy * 2) / height;
  camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert();
}

/** Where the key light falls on screen this frame, or null while it is behind the view or well off the edge. */
export interface SunOnScreen {
  /** Texture coordinates (0..1 on screen; beyond while off the edge). */
  u: number;
  v: number;
  /** 1 on screen, fading to 0 at POST.lightShafts.margin screen-heights off the edge. */
  fade: number;
}

/**
 * The sun's place on screen for `camera` (G5): its direction taken into view space, then projected. Fills `out` and
 * returns it, or null when the sun is behind the camera or past the margin. Allocation-free (`scratch` is the caller's).
 */
export function sunOnScreen(camera: THREE.PerspectiveCamera, sun: THREE.Vector3, scratch: THREE.Vector3, out: SunOnScreen): SunOnScreen | null {
  const v = scratch.copy(sun).transformDirection(camera.matrixWorldInverse);
  if (v.z >= 0) return null;
  v.applyMatrix4(camera.projectionMatrix);
  const marginY = 2 * POST.lightShafts.margin;
  const marginX = marginY / camera.aspect;
  const offX = Math.max(0, Math.abs(v.x) - 1) / marginX;
  const offY = Math.max(0, Math.abs(v.y) - 1) / marginY;
  const off = Math.max(offX, offY);
  if (off >= 1) return null;
  out.u = v.x * 0.5 + 0.5;
  out.v = v.y * 0.5 + 0.5;
  out.fade = 1 - off;
  return out;
}

/**
 * How reflective a mesh is (G5): its `userData.reflective` strength when it sets one (G8's puddles), the glass strength
 * for the map's merged glass (by name, POST.reflections.meshNames), else 0. Nothing else is ever reflective.
 */
export function reflectivity(o: THREE.Object3D): number {
  if (!(o instanceof THREE.Mesh)) return 0;
  const own = (o.userData as { reflective?: unknown }).reflective;
  if (typeof own === 'number') return Math.max(0, own);
  return POST.reflections.meshNames.some((n) => o.name.startsWith(n)) ? POST.reflections.glass : 0;
}

/** The reflective meshes under `root`, with their strengths, into `out` (cleared first). Not per frame: on a scene change. */
export function findReflective(root: THREE.Object3D, out: { mesh: THREE.Mesh; strength: number }[]): void {
  out.length = 0;
  root.traverse((o) => {
    const strength = reflectivity(o);
    if (strength > 0) out.push({ mesh: o as THREE.Mesh, strength });
  });
}

/** The denoise's rotation noise: four random bytes a texel from a fixed seed (Three's GTAOPass uses simplex noise). */
export function denoiseNoise(size: number, seed: number): THREE.DataTexture {
  const rng = createRng(seed);
  const data = new Uint8Array(size * size * 4);
  for (let i = 0; i < data.length; i++) data[i] = Math.floor(rngNext(rng) * 256);
  const t = new THREE.DataTexture(data, size, size, THREE.RGBAFormat, THREE.UnsignedByteType);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.needsUpdate = true;
  return t;
}
