import type { WebGPURenderer } from 'three/webgpu';
import { privateApiMissing } from './compute/computeKit';

/** The part of Three's WebGPU back end that frees a uniform buffer (not in its public types). */
interface UniformFrees {
  isWebGPUBackend?: boolean;
  get(key: object): { buffer?: { destroy(): void } };
  delete(key: object): void;
  destroyUniformBuffer(binding: object): void;
}

/** What is lost while the patch can't apply. */
const COST = 'a material rebuilt mid-frame can drop that frame with a "used in submit while destroyed" error';

/**
 * Holds every uniform buffer Three frees during a frame until the frame's draws are submitted (`flush`, after each
 * frame), on a WebGPU device. Three 0.186 rebuilds a draw whose material's cache key changed (a map's surface texture
 * arriving, for one) inside the pass that draws it, and frees the old draw's uniform buffers there and then: when an
 * earlier draw in the same pass used one of them (Neon Heights at Low, the steel plates' shared `render` group), the
 * pass is refused at submit and the frame is dropped with "buffer used in submit while destroyed" (W6a; traced with
 * a destroy log). WebGPU frees a buffer destroyed after its submit once the GPU is done with it, so the destroy waits
 * until then. The binding is let go at once, as Three does, so a draw made again meanwhile gets a buffer of its own.
 * Nothing on the WebGL2 back end. The private members it uses (the back end's `get`, `delete` and
 * `destroyUniformBuffer`) are checked, and one that is gone is said once.
 */
export function deferUniformFrees(renderer: WebGPURenderer): { flush(): void } {
  const pending: { destroy(): void }[] = [];
  const flush = (): void => {
    for (const buffer of pending) buffer.destroy();
    pending.length = 0;
  };
  const backend = renderer.backend as unknown as UniformFrees;
  if (!backend?.isWebGPUBackend) return { flush };
  if (typeof backend.destroyUniformBuffer !== 'function' || typeof backend.get !== 'function' || typeof backend.delete !== 'function') {
    privateApiMissing('WebGPUBackend destroyUniformBuffer, get or delete', COST);
    return { flush };
  }
  backend.destroyUniformBuffer = (binding) => {
    const buffer = backend.get(binding).buffer;
    if (buffer) pending.push(buffer);
    backend.delete(binding);
  };
  return { flush };
}

/** The part of Three's WebGL2 back end that keeps a vertex array per set of attributes (not in its public types). */
interface VertexArrays {
  isWebGLBackend?: boolean;
  vaoCache: Record<string, unknown>;
  get(key: object): { id?: number };
  destroyAttribute(attribute: object): void;
}

/** What is lost while the patch can't apply. */
const VAO_COST = 'each match quit keeps its geometry buffers on the GPU and in memory';

/**
 * Lets go of the vertex arrays made with an attribute when Three frees it, on the WebGL2 back end. Three 0.186 caches a
 * vertex array per set of attributes (its `vaoCache`, keyed by their ids) and never drops one, so every geometry a match
 * drew stayed referenced after the match was freed, and a buffer still attached to a vertex array is kept by the driver:
 * one of three things that together kept about 18 MB a match quit or played again (with renderer.ts's warm-up timer and
 * the viewmodel's lights), measured with heap snapshots in the container (BP6c). The entries go once
 * the attributes freed together are in (one sweep a batch); a vertex array still bound to a draw stays with that draw,
 * which looks it up from its own cache, and the browser deletes the rest as it collects them. Nothing on WebGPU.
 */
export function dropFreedVertexArrays(renderer: WebGPURenderer): void {
  const backend = renderer.backend as unknown as VertexArrays;
  if (!backend?.isWebGLBackend) return;
  if (typeof backend.destroyAttribute !== 'function' || typeof backend.get !== 'function' || typeof backend.vaoCache !== 'object' || backend.vaoCache === null) {
    privateApiMissing('WebGLBackend destroyAttribute, get or vaoCache', VAO_COST);
    return;
  }
  const freed = new Set<string>();
  const sweep = (): void => {
    for (const key of Object.keys(backend.vaoCache)) {
      if (key.split(':').some((id) => freed.has(id))) delete backend.vaoCache[key];
    }
    freed.clear();
  };
  const destroy = backend.destroyAttribute.bind(backend);
  backend.destroyAttribute = (attribute) => {
    const id = backend.get(attribute).id;
    if (id !== undefined) {
      if (freed.size === 0) queueMicrotask(sweep);
      freed.add(String(id));
    }
    destroy(attribute);
  };
}
