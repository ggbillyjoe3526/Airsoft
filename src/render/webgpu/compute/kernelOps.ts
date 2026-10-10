import { abs, cos, float, floor, fract, max, min, select, sin, sqrt } from 'three/tsl';

/**
 * The arithmetic a compute kernel is written in (WebGPU overhaul W5), so one kernel is both the GPU's pass and a plain
 * function the unit tests run against the CPU module it stands in for: `numberOps` evaluates it on numbers (what
 * `particleKernels.test.ts` compares with dustMotes.ts, fireflies.ts, smokePlumes.ts, impactPuffs.ts and impactGrit.ts,
 * value for value), `tslOps` builds the same expression as TSL nodes for `renderer.compute`. A kernel is written once and
 * cannot drift from its pass: there is no second copy of the formula.
 */
export interface Ops<T> {
  /** A constant. */
  c(x: number): T;
  add(a: T, b: T): T;
  sub(a: T, b: T): T;
  mul(a: T, b: T): T;
  div(a: T, b: T): T;
  min(a: T, b: T): T;
  max(a: T, b: T): T;
  floor(a: T): T;
  fract(a: T): T;
  sin(a: T): T;
  cos(a: T): T;
  abs(a: T): T;
  sqrt(a: T): T;
  /** `a < b ? x : y`. */
  ifLess(a: T, b: T, x: T, y: T): T;
}

/** The kernels on plain numbers (the CPU's doubles): what the tests run. */
export const numberOps: Ops<number> = {
  c: (x) => x,
  add: (a, b) => a + b,
  sub: (a, b) => a - b,
  mul: (a, b) => a * b,
  div: (a, b) => a / b,
  min: Math.min,
  max: Math.max,
  floor: Math.floor,
  fract: (a) => a - Math.floor(a),
  sin: Math.sin,
  cos: Math.cos,
  abs: Math.abs,
  sqrt: Math.sqrt,
  ifLess: (a, b, x, y) => (a < b ? x : y),
};

/* eslint-disable @typescript-eslint/no-explicit-any -- TSL's node types don't follow its own operators. */
/** A TSL node (loosely typed: TSL's types don't follow its own swizzles and operators). */
export type Node = any;

/** The kernels as TSL nodes (float32 on the GPU). */
export const tslOps: Ops<Node> = {
  c: (x) => float(x),
  add: (a, b) => a.add(b),
  sub: (a, b) => a.sub(b),
  mul: (a, b) => a.mul(b),
  div: (a, b) => a.div(b),
  min: (a, b) => min(a, b),
  max: (a, b) => max(a, b),
  floor: (a) => floor(a),
  fract: (a) => fract(a),
  sin: (a) => sin(a),
  cos: (a) => cos(a),
  abs: (a) => abs(a),
  sqrt: (a) => sqrt(a),
  ifLess: (a, b, x, y) => select(a.lessThan(b), x, y),
};
/* eslint-enable @typescript-eslint/no-explicit-any */

/** `x` clamped to 0..1. */
export function saturate<T>(o: Ops<T>, x: T): T {
  return o.min(o.c(1), o.max(o.c(0), x));
}

/** GLSL's smoothstep, as the CPU modules write it (dustMotes.ts). */
export function smoothstep<T>(o: Ops<T>, a: number, b: number, x: T): T {
  const t = saturate(o, o.div(o.sub(x, o.c(a)), o.c(b - a)));
  return o.mul(o.mul(t, t), o.sub(o.c(3), o.mul(o.c(2), t)));
}

/** `v` wrapped into 0..size (dustMotes.ts wrap). */
export function wrap<T>(o: Ops<T>, v: T, size: number): T {
  return o.sub(v, o.mul(o.floor(o.div(v, o.c(size))), o.c(size)));
}

/** Length of (x, y, z). */
export function length3<T>(o: Ops<T>, x: T, y: T, z: T): T {
  return o.sqrt(o.add(o.add(o.mul(x, x), o.mul(y, y)), o.mul(z, z)));
}
