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

/** The part of Three's renderer that holds every GPU buffer it made (not in its public types). */
interface AttributeStore {
  _attributes?: { delete(attribute: THREE.BufferAttribute): unknown } | null;
}

/**
 * Frees `attribute`'s GPU buffer now. Three frees a geometry's attributes with the geometry, but a storage buffer only a
 * compute pass binds belongs to no geometry: without this it would stay on the GPU until the device goes. Harmless for
 * a buffer never uploaded.
 */
export function freeBuffer(renderer: WebGPURenderer, attribute: THREE.BufferAttribute): void {
  (renderer as unknown as AttributeStore)._attributes?.delete(attribute);
}


/** The part of Three's WebGL2 back end a draw goes through (not in its public types). */
interface WebGLDraws {
  isWebGLBackend?: boolean;
  get(key: object): { vaoGPU?: unknown; switchBuffers?: unknown };
  draw(renderObject: { getAttributes(): object[] }, info: unknown): void;
}

/**
 * On the node renderer's WebGL2 back end, has every draw that reads a compute pass's output read its latest frame.
 * Three 0.186 runs a pass there as transform feedback into the second of two GPU buffers and then swaps them, but a
 * draw keeps the vertex array it first made, bound to whichever of the two was current then: it saw a pass's output
 * only every other frame (the steam, flies and grass moving at half the frame rate, the grass culled for the frame
 * before). A draw reading a swapped buffer drops its cached array before it runs, so Three looks the array up by the
 * buffers current now (made once per pair, then cached). Nothing on WebGPU.
 */
export function followSwappedBuffers(renderer: WebGPURenderer): void {
  const backend = renderer.backend as unknown as WebGLDraws;
  if (!backend.isWebGLBackend || typeof backend.draw !== 'function') return;
  const draw = backend.draw.bind(backend);
  backend.draw = (renderObject, info) => {
    const attributes = renderObject.getAttributes();
    for (const a of attributes) {
      if (backend.get(a).switchBuffers) {
        delete backend.get(attributes).vaoGPU;
        break;
      }
    }
    draw(renderObject, info);
  };
}
