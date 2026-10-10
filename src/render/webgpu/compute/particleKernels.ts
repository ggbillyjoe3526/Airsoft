import { DUST_MOTES, IMPACT_GRIT, type PuffConfig } from '../../../config/render';
import { DRESSING, FIREFLIES } from '../../../config/dressing';
import type { PlumeConfig } from '../../smokePlumes';
import { length3, type Ops, saturate, smoothstep, wrap } from './kernelOps';

/**
 * The particles' compute kernels (WebGPU overhaul W5): each moves one particle for a frame exactly as its CPU module's
 * loop does (dustMotes.ts, fireflies.ts, smokePlumes.ts, impactPuffs.ts, impactGrit.ts), written over `Ops` so the GPU's
 * pass (`tslOps`) and the tests (`numberOps`, against the module itself) run the same formula. The order of operations
 * follows the module's line for line, so on numbers the two agree to the last bit or within a rounding.
 */

/** A vector of three of a kernel's values. */
export interface V3<T> {
  x: T;
  y: T;
  z: T;
}

/** Where a particle is drawn and how much of it (alpha, or size: as the kernel says). */
export interface Drawn<T> extends V3<T> {
  w: T;
}

/**
 * One dust mote (dustMotes.ts DustMotes.update): its home `base` (0..box) and `phase`, moved by the air's `drift` and
 * its wander at `time`, wrapped round `eye`; `w` its alpha (moteFade, and the height fade when `hangsLow` is 1).
 */
export function moteKernel<T>(o: Ops<T>, base: V3<T>, phase: T, time: T, drift: V3<T>, eye: V3<T>, hangsLow: T): Drawn<T> {
  const D = DUST_MOTES;
  const w = o.add(o.mul(time, o.c(D.wanderRate)), phase);
  const at = (b: T, moved: T, e: T): T => o.sub(o.add(e, wrap(o, o.add(o.sub(o.add(b, moved), e), o.c(D.box / 2)), D.box)), o.c(D.box / 2));
  const x = at(base.x, o.add(drift.x, o.mul(o.sin(w), o.c(D.wander))), eye.x);
  const y = at(base.y, o.add(drift.y, o.mul(o.sin(o.mul(w, o.c(1.3))), o.c(D.wander))), eye.y);
  const z = at(base.z, o.add(drift.z, o.mul(o.cos(o.mul(w, o.c(0.9))), o.c(D.wander))), eye.z);
  const dx = o.sub(x, eye.x);
  const dy = o.sub(y, eye.y);
  const dz = o.sub(z, eye.z);
  const half = D.box / 2;
  const edge = o.max(o.max(o.abs(dx), o.abs(dy)), o.abs(dz));
  const fade = o.mul(smoothstep(o, D.fadeNear, D.fadeFar, length3(o, dx, dy, dz)), o.sub(o.c(1), smoothstep(o, half - D.edgeFade, half, edge)));
  const M = DRESSING.motes;
  const heightFade = saturate(o, o.div(o.sub(o.c(M.none), y), o.c(M.none - M.full)));
  return { x, y, z, w: o.mul(fade, o.add(o.sub(o.c(1), hangsLow), o.mul(hangsLow, heightFade))) };
}

/**
 * One firefly (fireflies.ts Fireflies.update): its home `base` moved along its `drift` by its wave at its `rate` and
 * `phase`, `w` its pulse from FIREFLIES.low to full; with `still` 1 (Reduced motion) it stands at home at full glow.
 */
export function fireflyKernel<T>(o: Ops<T>, base: V3<T>, drift: V3<T>, rate: T, phase: T, time: T, still: T): Drawn<T> {
  const t = o.add(o.mul(time, rate), phase);
  const moving = o.sub(o.c(1), still);
  const wave = o.mul(o.sin(o.mul(o.mul(t, o.c(Math.PI)), o.c(2))), moving);
  const s = o.div(o.add(wave, o.c(1)), o.c(2));
  const pulse = o.add(o.c(FIREFLIES.low), o.mul(o.mul(o.c(1 - FIREFLIES.low), s), s));
  return { x: o.add(base.x, o.mul(drift.x, wave)), y: o.add(base.y, o.mul(drift.y, wave)), z: o.add(base.z, o.mul(drift.z, wave)), w: o.add(o.mul(pulse, moving), still) };
}

/** A smoke or steam puff's look this frame: where it is and its size (`w`), and its alpha. */
export interface PlumePuff<T> extends Drawn<T> {
  alpha: T;
}

/**
 * One puff of a plume (smokePlumes.ts SmokePlumes.update): its source `source` (x, y, z) of `radius`, its seeded
 * `jitter` (x, z spread in −1..1, `phase` offset) and `share` (its place in the loop, i / puffs), at `time` in a `wind`
 * (x, z). `w` is its size; `alpha` its fade in and out.
 */
export function plumeKernel<T>(o: Ops<T>, M: PlumeConfig, source: V3<T>, radius: T, jitter: V3<T>, share: T, time: T, wind: { x: T; z: T }): PlumePuff<T> {
  const phase = o.fract(o.add(o.add(o.div(time, o.c(M.period)), share), jitter.z));
  const age = o.mul(phase, o.c(M.period));
  const spread = o.add(radius, o.mul(o.c(M.spread), phase));
  const fadeIn = o.min(o.c(1), o.div(phase, o.c(M.fadeIn)));
  const out = o.sub(o.c(1), phase);
  return {
    x: o.add(o.add(source.x, o.mul(jitter.x, spread)), o.mul(wind.x, age)),
    y: o.add(source.y, o.mul(phase, o.c(M.rise))),
    z: o.add(o.add(source.z, o.mul(jitter.y, spread)), o.mul(wind.z, age)),
    w: o.add(o.c(M.size[0]), o.mul(o.c(M.size[1] - M.size[0]), phase)),
    alpha: o.mul(o.mul(fadeIn, out), out),
  };
}

/**
 * One soft puff (impactPuffs.ts ImpactPuffs.update), `age` s after it was spawned at `at` with its own `velocity` and
 * size share `scale`, seen from `eye`: where it is and its size (`w`, 0 once its life is over, as the CPU's fade makes it).
 */
export function puffKernel<T>(o: Ops<T>, P: PuffConfig, at: V3<T>, velocity: V3<T>, scale: T, age: T, eye: V3<T>): Drawn<T> {
  const t = age;
  const L = o.c(P.lifetime);
  const grow = o.add(o.c(P.startScale), o.mul(o.c(1 - P.startScale), o.min(o.c(1), o.div(t, o.c(P.growTime)))));
  const fade = o.sub(o.c(1), o.max(o.c(0), o.div(o.sub(t, o.c(P.growTime)), o.c(P.lifetime - P.growTime))));
  const dist = length3(o, o.sub(at.x, eye.x), o.sub(at.y, eye.y), o.sub(at.z, eye.z));
  const s = o.mul(o.max(o.c(0), o.mul(grow, fade)), o.max(scale, o.mul(dist, o.c(P.minAngularRadius / P.radius))));
  const tl = o.min(t, L);
  const pushed = o.mul(tl, o.sub(o.c(1), o.div(tl, o.c(2 * P.lifetime))));
  return {
    x: o.add(at.x, o.mul(velocity.x, pushed)),
    y: o.add(o.add(at.y, o.mul(velocity.y, pushed)), o.mul(t, o.c(P.drift))),
    z: o.add(at.z, o.mul(velocity.z, pushed)),
    w: s,
  };
}

/** A chip of grit in flight: where it is and how it moves, its roll about the view and its spin. */
export interface Chip<T> {
  position: V3<T>;
  velocity: V3<T>;
  roll: T;
}

/** One chip moved on by `dt` (impactGrit.ts ImpactGrit.update): it falls under IMPACT_GRIT.gravity and spins. */
export function gritStep<T>(o: Ops<T>, chip: Chip<T>, spin: T, dt: T): Chip<T> {
  const vy = o.sub(chip.velocity.y, o.mul(o.c(IMPACT_GRIT.gravity), dt));
  return {
    position: { x: o.add(chip.position.x, o.mul(chip.velocity.x, dt)), y: o.add(chip.position.y, o.mul(vy, dt)), z: o.add(chip.position.z, o.mul(chip.velocity.z, dt)) },
    velocity: { x: chip.velocity.x, y: vy, z: chip.velocity.z },
    roll: o.add(chip.roll, o.mul(spin, dt)),
  };
}

/** A chip's drawn size `age` s into its life at `at`, seen from `eye` (its `size` m, never under its angular minimum). */
export function gritScale<T>(o: Ops<T>, at: V3<T>, size: T, age: T, eye: V3<T>): T {
  const G = IMPACT_GRIT;
  const dist = length3(o, o.sub(at.x, eye.x), o.sub(at.y, eye.y), o.sub(at.z, eye.z));
  const a = o.max(o.c(0), o.div(age, o.c(G.lifetime)));
  return o.mul(o.max(size, o.mul(dist, o.c(G.minAngularSize))), o.sub(o.c(1), o.mul(a, a)));
}
