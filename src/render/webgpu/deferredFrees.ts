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
