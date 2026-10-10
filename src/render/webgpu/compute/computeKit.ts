import type * as THREE from 'three';
import type { WebGPURenderer } from 'three/webgpu';
import type { V3 } from './particleKernels';

/**
 * What the compute passes share (WebGPU overhaul W5): vec3 views of a TSL vec4 and freeing a storage buffer's GPU memory.
 */

/* eslint-disable @typescript-eslint/no-explicit-any -- TSL nodes are loosely typed (kernelOps.ts Node). */

/** The x, y, z of a TSL vector node, as a kernel's V3. */
export function xyz(v: any): V3<any> {
  return { x: v.x, y: v.y, z: v.z };
}
/* eslint-enable @typescript-eslint/no-explicit-any */

/** The part of Three's renderer that holds every GPU buffer it made (not in its public types; null until it starts). */
interface AttributeStore {
  _attributes?: { delete(attribute: THREE.BufferAttribute): unknown } | null;
}

/** Says once, loudly, that Three's private API a compute pass leans on is gone (a Three upgrade renamed it). */
const said = new Set<string>();
export function privateApiMissing(what: string, cost: string): void {
  if (said.has(what)) return;
  said.add(what);
  console.error(`render/webgpu/compute: Three's ${what} is missing (renamed by a Three upgrade?): ${cost}`);
}

/**
 * Frees `attribute`'s GPU buffer now. Three frees a geometry's attributes with the geometry, but a storage buffer only a
 * compute pass binds belongs to no geometry: without this it would stay on the GPU until the device goes. Harmless for
 * a buffer never uploaded (or a renderer not started: `_attributes` is null then). Three's buffer store is private
 * (KNOWN_ISSUES): if an upgrade renames it, this says so once instead of leaking quietly; computeKit.test.ts pins it.
 */
export function freeBuffer(renderer: WebGPURenderer, attribute: THREE.BufferAttribute): void {
  const store = renderer as unknown as AttributeStore;
  if (!('_attributes' in store)) return privateApiMissing('WebGPURenderer._attributes', 'compute buffers stay on the GPU until the device goes');
  store._attributes?.delete(attribute);
}

/** The part of Three's WebGL2 back end a draw goes through (not in its public types). */
interface WebGLDraws {
  isWebGLBackend?: boolean;
  vaoCache?: unknown;
  get(key: object): { vaoGPU?: unknown; switchBuffers?: unknown; bufferGPU?: unknown };
  draw(renderObject: { getAttributes(): (object & { isStorageBufferAttribute?: boolean; isStorageInstancedBufferAttribute?: boolean })[] }, info: unknown): void;
}

const HALF_RATE = 'compute output reaches the screen every other frame on the WebGL2 back end';

/**
 * On the node renderer's WebGL2 back end, has every draw that reads a compute pass's output read its latest frame.
 * Three 0.186 runs a pass there as transform feedback into the second of two GPU buffers and then swaps them, but a
 * draw keeps the vertex array it first made, bound to whichever of the two was current then: it saw a pass's output
 * only every other frame (the steam, flies and grass moving at half the frame rate, the grass culled for the frame
 * before). A draw reading a swapped buffer drops its cached array before it runs, so Three looks the array up by the
 * buffers current now (made once per pair, then cached). Nothing on WebGPU. Every private member it uses (the back
 * end's `get`, `draw` and `vaoCache`, a buffer's `switchBuffers`, the `vaoGPU` its `draw` caches) is checked, and one that is gone
 * is said once (KNOWN_ISSUES).
 */
export function followSwappedBuffers(renderer: WebGPURenderer): void {
  const backend = renderer.backend as unknown as WebGLDraws;
  if (!backend?.isWebGLBackend) return;
  if (typeof backend.draw !== 'function' || typeof backend.get !== 'function' || typeof backend.vaoCache !== 'object') {
    return privateApiMissing('WebGLBackend draw, get or vaoCache', HALF_RATE);
  }
  // The array a draw caches is its attributes' `vaoGPU` (property names survive minification).
  if (!String(backend.draw).includes('vaoGPU')) return privateApiMissing("WebGLBackend draw's vaoGPU", HALF_RATE);
  const draw = backend.draw.bind(backend);
  backend.draw = (renderObject, info) => {
    const attributes = renderObject.getAttributes();
    let swapped = false;
    for (const a of attributes) {
      if (!a.isStorageBufferAttribute && !a.isStorageInstancedBufferAttribute) continue;
      const data = backend.get(a);
      if (typeof data.switchBuffers === 'function') swapped = true;
      else if (data.bufferGPU !== undefined) privateApiMissing("a transform-feedback buffer's switchBuffers", HALF_RATE);
    }
    if (swapped) delete backend.get(attributes).vaoGPU;
    draw(renderObject, info);
  };
}
