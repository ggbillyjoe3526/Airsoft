import type { RetroLook } from '../config/render';

/** The low-resolution view's size for a page of `width` × `height` CSS pixels: a texel per retro pixel, rounded up. */
export function retroTargetSize(width: number, height: number, pixelSize: number): { width: number; height: number } {
  return { width: Math.max(1, Math.ceil(width / pixelSize)), height: Math.max(1, Math.ceil(height / pixelSize)) };
}

/**
 * How wide one retro pixel is at the middle of a view `fovDegrees` high over `height` CSS pixels, as a tangent of the
 * view (the units BBRenderer sizes its balls and streaks in): 0 for an empty view.
 */
export function retroPixelAngle(fovDegrees: number, height: number, pixelSize: number): number {
  return height > 0 ? (2 * Math.tan((fovDegrees * Math.PI) / 360) * pixelSize) / height : 0;
}

/** The 2×2 Bayer matrix's cell (x, y in 0..1): [[0, 2], [3, 1]], rows by y. */
function bayer2(x: number, y: number): number {
  return 2 * Math.abs(x - y) + y;
}

/**
 * The 4×4 ordered-dither threshold of the retro pixel at (x, y), in (0, 1): the shader's `bayer4`, kept here to test it.
 * Every one of the 16 cells has its own threshold, so a flat colour between two levels breaks into an even pattern.
 */
export function bayerThreshold(x: number, y: number): number {
  const cx = ((x % 4) + 4) % 4;
  const cy = ((y % 4) + 4) % 4;
  const index = 4 * bayer2(cx % 2, cy % 2) + bayer2(cx >> 1, cy >> 1);
  return (index + 0.5) / 16;
}

/** One channel (0..1, display-encoded) crushed to `levels` shades by the threshold `t`: the shader's quantisation. */
export function quantize(value: number, levels: number, t: number): number {
  const steps = levels - 1;
  return Math.min(steps, Math.floor(Math.min(1, Math.max(0, value)) * steps + t)) / steps;
}

/** What the Renderer holds of a retro filter, whichever renderer draws it (WebGL's in retroFilterWebGL.ts, the node renderer's since W4). */
export interface RetroView {
  setLook(look: RetroLook): void;
  resize(width: number, height: number, pixelRatio: number): void;
  dispose(): void;
}
