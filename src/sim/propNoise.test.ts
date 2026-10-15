import { describe, expect, it } from 'vitest';
import { NOISE, type NoiseConfig } from '../config/noise';
import type { MapBlock } from '../map/mapTypes';
import { createCharacter } from './character';
import type { GameEvent } from './events';
import { createPropNoiseContext, noisyPropsOf, type PropNoiseContext, readyQuiet, ringProp, stepPropBump } from './propNoise';
import { vec3 } from './vec';

/** The noisy-prop rules on plain data (NP1): what counts as running into a prop, and a BB ringing off one. */

const DT = 1 / 60;
const RADIUS = 0.3;
const HEIGHT = 1.8;

const block = (kind: MapBlock['kind'], x: number, y: number, z: number, sx: number, sy: number, sz: number): MapBlock => ({ kind, center: vec3(x, y, z), size: vec3(sx, sy, sz) });

/** A crate whose near face is at z = -1 - RADIUS - 0.02 (the controller's skin), right in front of a body at the origin. */
const CRATE = block('crate', 0, 0.6, -1.32 - 0.6, 1.2, 1.2, 1.2);
const WALL = block('wall', 0, 1.5, -1.52, 6, 3, 0.4);
const SKIP = block('skip', 0, 0.7, -5, 3, 1.4, 1.2);

function contextFor(blocks: MapBlock[], cfg: NoiseConfig = NOISE, time = 10): PropNoiseContext {
  const ctx = createPropNoiseContext(cfg, noisyPropsOf(blocks, cfg.props));
  ctx.time = time;
  ctx.events = [];
  return ctx;
}

/** A body at (x, 0, z) wanting `want` (m/s, x and z) this tick, held back to `kept` of it along z by what it ran into. */
function bump(ctx: PropNoiseContext, want: [number, number], kept: [number, number] = [want[0], 0], at: [number, number] = [0, -1]): GameEvent[] {
  const c = createCharacter(3, vec3(at[0], 0, at[1]), 0, undefined, 1);
  const before = ctx.events.length;
  stepPropBump(c, vec3(want[0] * DT, 0, want[1] * DT), vec3(kept[0] * DT, 0, kept[1] * DT), DT, RADIUS, HEIGHT, ctx);
  return ctx.events.slice(before);
}

/** `e` is a prop's noise from (x, y, z). */
function expectAt(e: GameEvent | undefined, x: number, y: number, z: number): void {
  if (e?.type !== 'propNoise') throw new Error(`no prop noise: ${JSON.stringify(e)}`);
  expect(e.position.x).toBeCloseTo(x, 9);
  expect(e.position.y).toBeCloseTo(y, 9);
  expect(e.position.z).toBeCloseTo(z, 9);
}

describe('noisy props on a map (NP1)', () => {
  it('lists the blocks with a row in NOISE.props, in block order, with half their size', () => {
    const props = noisyPropsOf([WALL, CRATE, block('floor', 0, -0.25, 0, 20, 0.5, 20), SKIP, block('log', 3, 0.3, 3, 4, 0.6, 0.6)], NOISE.props);
    expect(props.map((p) => p.kind)).toEqual(['crate', 'skip']);
    expect(props[1]!.half).toEqual({ x: 1.5, y: 0.7, z: 0.6 });
    expect(props[1]!.center).toBe(SKIP.center);
    expect(props[0]!.noise).toBe(NOISE.props.crate);
  });

  it('keeps everything that is part of the level, cover or nature silent', () => {
    for (const kind of ['floor', 'wall', 'ramp', 'barrier', 'gabion', 'sandbags', 'log', 'boulder', 'tree', 'planter'] as const) expect(NOISE.props[kind], kind).toBeUndefined();
  });

  it('makes every noisy prop carry further than the run that hit it, and none further than a shot is heard', () => {
    for (const [kind, p] of Object.entries(NOISE.props)) {
      expect(p.bumped, kind).toBeGreaterThan(11);
      expect(p.bumped, kind).toBeLessThan(22);
      expect(p.shot, kind).toBeLessThan(p.bumped);
    }
  });

  it('readies one quiet slot per prop, growing only, allocating nothing once it has them', () => {
    const quiet: number[] = [];
    readyQuiet(quiet, 3);
    expect(quiet).toEqual([-Infinity, -Infinity, -Infinity]);
    quiet[1] = 5;
    readyQuiet(quiet, 2);
    readyQuiet(quiet, 3);
    expect(quiet).toEqual([-Infinity, 5, -Infinity]);
    expect(createPropNoiseContext(NOISE).quiet).toEqual([]);
  });
});

describe('running into a noisy prop (NP1, stepPropBump)', () => {
  it('a run straight in (4.2 m/s, stopped dead) knocks the crate, from its face at about hip height', () => {
    const ctx = contextFor([CRATE]);
    const [e] = bump(ctx, [0, -4.2]);
    expect(e).toMatchObject({ type: 'propNoise', characterId: 3, prop: 0, kind: 'crate', range: NOISE.props.crate!.bumped, shot: false });
    expectAt(e, 0, NOISE.noiseHeight, -1.32);
    expect(ctx.quiet[0]).toBe(10 + NOISE.quiet);
  });

  it('a walk, a crouch or a run glancing in under about 45° is too slow into the face to knock it', () => {
    for (const want of [[0, -2.3], [0, -2.1], [3.6, -2.1], [-3.3, -2.9]] as [number, number][]) {
      const ctx = contextFor([CRATE]);
      expect(bump(ctx, want), `${want}`).toEqual([]);
    }
    // At 50° a run is in hard enough.
    const ctx = contextFor([CRATE]);
    expect(bump(ctx, [4.2 * Math.cos((40 * Math.PI) / 180), -4.2 * Math.sin((50 * Math.PI) / 180)])).toHaveLength(1);
  });

  it('a graze that loses under blockedMin is no knock', () => {
    const ctx = contextFor([CRATE]);
    expect(bump(ctx, [0, -4.2], [0, -4.2 + (NOISE.blockedMin * 0.9) / DT])).toEqual([]);
    expect(bump(ctx, [0, -4.2], [0, -4.2 + (NOISE.blockedMin * 1.1) / DT])).toHaveLength(1);
  });

  it('a prop beyond touch of the body, or off the way the move was stopped, is not what was hit', () => {
    // A crate 0.1 m further off than touch allows.
    const far = block('crate', 0, 0.6, -1 - RADIUS - NOISE.touch - 0.1 - 0.6, 1.2, 1.2, 1.2);
    expect(bump(contextFor([far]), [0, -6.3])).toEqual([]);
    // A crate beside the body (to its right, touching), stopped going -z by a wall that isn't noisy.
    const beside = block('crate', RADIUS + 0.03 + 0.6, 0.6, -1, 1.2, 1.2, 1.2);
    expect(bump(contextFor([WALL, beside]), [0, -6.3])).toEqual([]);
    // Stopped going +x into it, it is.
    expect(bump(contextFor([WALL, beside]), [6.3, 0], [0, 0])).toHaveLength(1);
  });

  it('a prop underfoot, or wholly overhead, is not run into', () => {
    // Standing on a pallet load: its top 0.02 m under the feet' level counts as underfoot.
    const under = block('wrapped', 0, -0.25 + 0.02, -1.5, 3, 0.5, 3);
    expect(bump(contextFor([under]), [0, -6.3])).toEqual([]);
    // A rack's shelf above head height.
    const over = block('rack', 0, HEIGHT + 0.5, -1.4, 2, 0.4, 0.6);
    expect(bump(contextFor([over]), [0, -6.3])).toEqual([]);
  });

  it('holds the noise within the prop: a low crate knocks from its top, never above it', () => {
    const low = block('crate', 0, 0.3, -1.32 - 0.6, 1.2, 0.6, 1.2);
    const [e] = bump(contextFor([low]), [0, -4.2]);
    expect(e!.type === 'propNoise' && e.position.y).toBeCloseTo(0.6, 9);
  });

  it('picks the nearest noisy prop facing the stop when two are close', () => {
    const near = CRATE;
    const behind = block('skip', 0, 0.7, -1.32 - 1.2 - 0.6 - 0.05, 3, 1.4, 1.2);
    const [e] = bump(contextFor([behind, near]), [0, -6.3]);
    expect(e!.type === 'propNoise' && e.kind).toBe('crate');
  });

  it('sounds a prop at most once per NOISE.quiet, whoever hits it, and each prop on its own', () => {
    const second = block('crate', 3, 0.6, -1.32 - 0.6, 1.2, 1.2, 1.2);
    const ctx = contextFor([CRATE, second]);
    expect(bump(ctx, [0, -4.2])).toHaveLength(1);
    ctx.time += NOISE.quiet - 0.01;
    expect(bump(ctx, [0, -4.2])).toEqual([]);
    expect(bump(ctx, [0, -4.2], [0, 0], [3, -1])).toHaveLength(1);
    ctx.time += 0.01;
    expect(bump(ctx, [0, -4.2])).toHaveLength(1);
  });
});

describe('a BB ringing off a prop (NP1, ringProp)', () => {
  const ring = (ctx: PropNoiseContext, x: number, y: number, z: number, speed: number): GameEvent[] => {
    const before = ctx.events.length;
    ringProp(vec3(x, y, z), speed, 7, ctx);
    return ctx.events.slice(before);
  };

  it('rings steel a BB lands on fast, from where it landed, as far as the prop rings', () => {
    const ctx = contextFor([CRATE, SKIP]);
    const [e] = ring(ctx, 0.4, 1, -5 + 0.6 + 0.02, 60);
    expect(e).toMatchObject({ type: 'propNoise', characterId: 7, prop: 1, kind: 'skip', range: NOISE.props.skip!.shot, shot: true });
    expectAt(e, 0.4, 1, -4.38);
    expect(ctx.quiet[1]).toBe(10 + NOISE.quiet);
    expect(ring(ctx, 0, 1, -4.4, 60)).toEqual([]);
  });

  it('lets a spent BB tick, and never rings timber, plastic or anything off its faces', () => {
    const ctx = contextFor([CRATE, SKIP]);
    expect(ring(ctx, 0, 1, -4.4, NOISE.shotMinSpeed - 0.1)).toEqual([]);
    expect(ring(ctx, 0, 0.6, -1.32, 80)).toEqual([]);
    expect(ring(ctx, 0, 1, -4.4 + NOISE.shotMargin + 0.05, 80)).toEqual([]);
    expect(ring(ctx, 0, 1, -4.4 + NOISE.shotMargin - 0.01, NOISE.shotMinSpeed)).toHaveLength(1);
  });

  it('shares its quiet with a knock: a skip run into is not rung again at once', () => {
    const skip = block('skip', 0, 0.7, -1.32 - 0.6, 3, 1.4, 1.2);
    const ctx = contextFor([skip]);
    expect(bump(ctx, [0, -6.3])).toHaveLength(1);
    expect(ring(ctx, 0, 1, -1.3, 80)).toEqual([]);
  });
});
