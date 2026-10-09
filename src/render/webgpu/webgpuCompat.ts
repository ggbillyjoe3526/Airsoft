/**
 * A browser difference the node renderer meets on WebGPU (WebGPU overhaul W3). Three 0.186 passes every texture view a
 * `swizzle` of `'rgba'` (the WebGPU spec's string, for the `texture-component-swizzle` feature). Chromium builds of the
 * feature's first draft (Chromium 141, the container's among them) type that member as a dictionary and reject the
 * string, so the first texture view a frame makes throws and the game stops on its crash screen. Where a test view says
 * so, the member is cleared before each view is made (`undefined` reads as absent: the identity swizzle Three asked
 * for); everywhere else nothing is touched.
 *
 * The browser's own `GPUTexture.prototype.createView` is wrapped once per page, by the first node renderer that finds
 * the rejection; the wrap writes into the descriptor it is given (Three reuses one), so it allocates nothing.
 */

/** The parts of WebGPU's objects read here (the project carries no WebGPU types). */
interface ViewDescriptor {
  swizzle?: unknown;
}
interface Texture {
  createView(descriptor?: ViewDescriptor): unknown;
  destroy(): void;
}
interface Device {
  createTexture(descriptor: { size: [number, number]; format: string; usage: number }): Texture;
}

/** `TEXTURE_BINDING` (GPUTextureUsage), a constant of the spec. */
const TEXTURE_BINDING = 0x04;

let wrapped = false;

/** Whether `device`'s browser rejects Three's string swizzle (a TypeError for the member's type). */
export function rejectsStringSwizzle(device: Device): boolean {
  const texture = device.createTexture({ size: [1, 1], format: 'rgba8unorm', usage: TEXTURE_BINDING });
  try {
    texture.createView({ swizzle: 'rgba' });
    return false;
  } catch (error) {
    return error instanceof TypeError;
  } finally {
    texture.destroy();
  }
}

/** Clears `swizzle` from every texture view's descriptor on this page from now on. Once per page; true if it wrapped. */
export function clearSwizzle(prototype: Texture | undefined): boolean {
  if (wrapped || !prototype) return false;
  wrapped = true;
  const own = prototype.createView;
  prototype.createView = function createView(this: Texture, descriptor?: ViewDescriptor) {
    if (descriptor && typeof descriptor.swizzle === 'string') descriptor.swizzle = undefined;
    return own.call(this, descriptor);
  };
  return true;
}

/** Applies the fixes `device`'s browser needs (W3: the swizzle). Returns which were applied, for the tests and the log. */
export function fitBrowser(device: Device | undefined): string[] {
  if (!device || !rejectsStringSwizzle(device)) return [];
  const prototype = (globalThis as { GPUTexture?: { prototype: Texture } }).GPUTexture?.prototype;
  return clearSwizzle(prototype) || wrapped ? ['swizzle'] : [];
}
