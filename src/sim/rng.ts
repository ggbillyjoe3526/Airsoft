/**
 * Seedable pseudo-random generator (mulberry32). State is a plain object so it can be
 * snapshotted with the rest of the game state. Never use Math.random() in simulation code.
 */
export interface RngState {
  s: number;
}

export function createRng(seed: number): RngState {
  return { s: seed >>> 0 };
}

/** Uniform float in [0, 1). */
export function rngNext(r: RngState): number {
  r.s = (r.s + 0x6d2b79f5) >>> 0;
  let t = r.s;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

/** Approximately normal (mean 0, sd 1) from the sum of four uniforms: cheap and bounded (±3.46). */
export function rngGaussian(r: RngState): number {
  return (rngNext(r) + rngNext(r) + rngNext(r) + rngNext(r) - 2) * 1.7320508;
}
