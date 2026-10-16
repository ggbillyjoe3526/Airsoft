/**
 * The small number helpers the simulation, the bots and the textures share (DX0: each used to keep its own copy).
 * Pure, allocation-free, and deliberately tiny: anything with a vector in it belongs in `sim/vec.ts`.
 */

/** `v` held between `lo` and `hi`. */
export const clamp = (v: number, lo: number, hi: number): number => (v < lo ? lo : v > hi ? hi : v);

/** `v` held between 0 and 1. */
export const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);

/** The point `t` of the way from `a` to `b` (0 gives `a`, 1 gives `b`; not clamped). */
export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
