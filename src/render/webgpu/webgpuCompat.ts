/**
 * Browser differences the node renderer meets on WebGPU (WebGPU overhaul W3), both found in Chromium 141 (the
 * container's) by pipeline/webgpu-compare.mjs; each is tested for on the device and fitted only where it is found.
 *
 * - **The string swizzle.** Three 0.186 passes every texture view a `swizzle` of `'rgba'` (the WebGPU spec's string,
 *   for the `texture-component-swizzle` feature). Builds of the feature's first draft type that member as a dictionary
 *   and reject the string, so the first texture view a frame makes throws and the game stops on its crash screen. The
 *   member is cleared before each view is made (`undefined` reads as absent: the identity swizzle Three asked for).
 * - **Layers written into a 3D texture that may be drawn into.** Three gives every texture `RENDER_ATTACHMENT` use, and
 *   writes a 3D texture a layer at a time (the baked light's grid, render/bakedLight.ts); Dawn there clears such a
 *   texture first through a 2D view of it, which is invalid, so the grid is never uploaded and every surface reading it
 *   fails to draw (Depot went black). The game draws into no 3D texture, so its 3D textures are made without that use.
 *
 * The browser's own `GPUTexture.prototype.createView` and `GPUDevice.prototype.createTexture` are wrapped once per page,
 * by the first node renderer that finds the difference; each wrap writes into the descriptor it is given (Three reuses
 * its own), so it allocates nothing.
 */

/** The parts of WebGPU's objects read here (the project carries no WebGPU types). */
interface ViewDescriptor {
  swizzle?: unknown;
}
interface TextureDescriptor {
  size: [number, number, number?];
  format: string;
  usage: number;
  dimension?: string;
}
interface Texture {
  createView(descriptor?: ViewDescriptor): unknown;
  destroy(): void;
}
interface Device {
  createTexture(descriptor: TextureDescriptor): Texture;
  queue?: { writeTexture(destination: object, data: ArrayBufferView, layout: object, size: object): void };
  pushErrorScope?(filter: string): void;
  popErrorScope?(): Promise<unknown>;
}

/** GPUTextureUsage's constants, from the spec. */
const COPY_DST = 0x02;
const TEXTURE_BINDING = 0x04;
const RENDER_ATTACHMENT = 0x10;

let swizzleWrapped = false;
let attachmentWrapped = false;

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
  if (swizzleWrapped || !prototype) return false;
  swizzleWrapped = true;
  const own = prototype.createView;
  prototype.createView = function createView(this: Texture, descriptor?: ViewDescriptor) {
    if (descriptor && typeof descriptor.swizzle === 'string') descriptor.swizzle = undefined;
    return own.call(this, descriptor);
  };
  return true;
}

/** Whether `device` fails a layer written into a 3D texture made for drawing into (the validation error it raises). */
export async function rejects3DLayerWrite(device: Device): Promise<boolean> {
  if (!device.queue || !device.pushErrorScope || !device.popErrorScope) return false;
  device.pushErrorScope('validation');
  const texture = device.createTexture({ size: [2, 2, 2], format: 'rgba8unorm', usage: TEXTURE_BINDING | COPY_DST | RENDER_ATTACHMENT, dimension: '3d' });
  device.queue.writeTexture({ texture, origin: { x: 0, y: 0, z: 1 } }, new Uint8Array(16), { bytesPerRow: 8 }, { width: 2, height: 2, depthOrArrayLayers: 1 });
  const error = await device.popErrorScope();
  texture.destroy();
  return error != null;
}

/** Makes every 3D texture on this page without `RENDER_ATTACHMENT` use from now on. Once per page; true if it wrapped. */
export function no3DAttachment(prototype: Device | undefined): boolean {
  if (attachmentWrapped || !prototype) return false;
  attachmentWrapped = true;
  const own = prototype.createTexture;
  prototype.createTexture = function createTexture(this: Device, descriptor: TextureDescriptor) {
    if (descriptor?.dimension === '3d') descriptor.usage &= ~RENDER_ATTACHMENT;
    return own.call(this, descriptor);
  };
  return true;
}

/** Applies the fixes `device`'s browser needs. Returns which were applied (or were already), for the tests and the log. */
export async function fitBrowser(device: Device | undefined): Promise<string[]> {
  if (!device) return [];
  const fits: string[] = [];
  if (rejectsStringSwizzle(device)) {
    const prototype = (globalThis as { GPUTexture?: { prototype: Texture } }).GPUTexture?.prototype;
    if (clearSwizzle(prototype) || swizzleWrapped) fits.push('swizzle');
  }
  if (await rejects3DLayerWrite(device)) {
    const prototype = (globalThis as { GPUDevice?: { prototype: Device } }).GPUDevice?.prototype;
    if (no3DAttachment(prototype) || attachmentWrapped) fits.push('3d-attachment');
  }
  return fits;
}
