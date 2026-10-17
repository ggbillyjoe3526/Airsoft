import { describe, expect, it } from 'vitest';
import { type FigureBody, type FigureHitShape, type FigureLegClip, HITS } from '../config/hits';
import { createCharacter, type LifeStatus } from './character';
import { BODY_POINTS, BODY_SAMPLE } from './figureBody';
import { LEG_CLIPS, LEG_POINTS, LEG_SAMPLE } from './figureLegs';
import { characterHitVolume, createHitVolume, inflateHitVolume, PART, rayCharacter } from './hitbox';
import { vec3 } from './vec';

// QA for HV1: the rigged upper body in the hit volume, its fallbacks and the built-in path.
const pt = { bone: 'Hips' as const, at: [0, 0, 0] as const };
const shape = (r: number): FigureHitShape => ({
  head: { centre: pt, radius: r },
  chest: { bottom: pt, top: pt, halfWidth: 0.1, radius: r + 0.01 },
  shoulders: { left: pt, right: pt, radius: r + 0.02 },
  hips: { bottom: pt, top: pt, halfWidth: 0.1, radius: r + 0.03 },
  legs: { thigh: r + 0.04, shin: r + 0.05, boot: r + 0.06 },
});
/** Points: head 1.7, chest 1.1..1.4 (left x -0.1, right +0.1), shoulders across 1.4, hips 0.8..1.0. */
const SAMPLE = [
  [0, 1.7, 0],
  [-0.1, 1.1, 0], [-0.1, 1.4, 0], [0.1, 1.1, 0], [0.1, 1.4, 0],
  [-0.2, 1.4, 0], [0.2, 1.4, 0],
  [-0.1, 0.8, 0], [-0.1, 1.0, 0], [0.1, 0.8, 0], [0.1, 1.0, 0],
];
const body = (r: number): FigureBody => {
  const s = new Float32Array(BODY_SAMPLE);
  SAMPLE.forEach((p, k) => s.set(p, k * 3));
  expect(SAMPLE.length).toBe(BODY_POINTS);
  return { shape: shape(r), clips: LEG_CLIPS.map(() => ({ frames: 1, whole: s, aimed: s })) };
};
const legClip = (): FigureLegClip => {
  const points = new Float32Array(LEG_SAMPLE);
  for (let k = 0; k < LEG_POINTS * 2; k++) points.set([k < LEG_POINTS ? -0.1 : 0.1, 0.9 - 0.2 * (k % LEG_POINTS), 0], k * 3);
  return { seconds: 0.5, stride: 0.9, frames: 1, points };
};
const legs = { clips: LEG_CLIPS.map(() => legClip()) };
const rigged = { ...HITS, figureLegs: legs, figureBodies: [body(0.1), body(0.2)] };

describe('the built-in hit volume is unchanged by HV1', () => {
  it('has the two new parts at radius 0, kept out of the bound, hits and inflate', () => {
    const c = createCharacter(0, vec3(100, 0, 100), 0);
    const v = createHitVolume();
    characterHitVolume(c, HITS, v);
    expect(v.parts[PART.chestR]!.r).toBe(0);
    expect(v.parts[PART.shoulders]!.r).toBe(0);
    expect(Math.hypot(v.bound.x - 100, v.bound.z - 100)).toBeLessThan(1);
    const before = v.parts.map((p) => p.r);
    inflateHitVolume(v, 0.1);
    expect(v.parts[PART.chestR]!.r).toBe(0);
    expect(v.parts[PART.shoulders]!.r).toBe(0);
    expect(v.parts[PART.chest]!.r).toBeCloseTo(before[PART.chest]! + 0.1, 9);
    // a ray through the stale origin point of the zero parts finds nothing
    expect(rayCharacter(vec3(0, 1, 10), vec3(0, 0, -1), 20, v)).toBe(-1);
  });

  it('ignores figure bodies when the match has no figure legs, and a character figure index', () => {
    const c = createCharacter(0, vec3(1, 0, 2), 0.7);
    c.figure = 1;
    const a = createHitVolume();
    const b = createHitVolume();
    characterHitVolume(c, HITS, a);
    characterHitVolume(c, { ...HITS, figureBodies: [body(0.1)] }, b);
    expect(b).toEqual(a);
  });

  it('gives the legs only the base radii with legs but no bodies', () => {
    const v = createHitVolume();
    characterHitVolume(createCharacter(0, vec3(), 0), { ...HITS, figureLegs: legs }, v);
    expect(v.parts[PART.thighL]!.r).toBe(HITS.legs.thighRadius);
    expect(v.parts[PART.chestR]!.r).toBe(0);
  });
});

describe('a figure with no body falls back sanely', () => {
  const radiusOf = (cfg: typeof rigged, figure: number): number => {
    const c = createCharacter(0, vec3(), 0);
    c.figure = figure;
    const v = createHitVolume();
    characterHitVolume(c, cfg, v);
    expect(Number.isFinite(v.bound.r)).toBe(true);
    return v.head.r;
  };
  it('takes each figure its own shape', () => {
    expect(radiusOf(rigged, 0)).toBeCloseTo(0.1, 6);
    expect(radiusOf(rigged, 1)).toBeCloseTo(0.2, 6);
  });
  it('takes the first body when the figure index is out of range or the list holds one', () => {
    expect(radiusOf(rigged, 7)).toBeCloseTo(0.1, 6);
    expect(radiusOf(rigged, -1)).toBeCloseTo(0.1, 6);
    expect(radiusOf({ ...rigged, figureBodies: [body(0.3)] }, 1)).toBeCloseTo(0.3, 6);
  });
  it('is the built-in volume for an empty list of bodies', () => {
    const c = createCharacter(0, vec3(), 0);
    const a = createHitVolume();
    const b = createHitVolume();
    characterHitVolume(c, { ...HITS, figureLegs: legs }, a);
    characterHitVolume(c, { ...rigged, figureBodies: [] }, b);
    expect(b).toEqual(a);
  });
});

describe('the rigged body in poses', () => {
  const vol = (mut: (c: ReturnType<typeof createCharacter>) => void) => {
    const c = createCharacter(0, vec3(), 0);
    mut(c);
    const v = createHitVolume();
    characterHitVolume(c, rigged, v);
    return v;
  };
  it('puts the head, chest, shoulders and hips on the sampled points, the legs on the figure radii', () => {
    const v = vol(() => {});
    expect(v.head).toMatchObject({ x: 0, y0: Math.fround(1.7), y1: Math.fround(1.7), r: 0.1 });
    expect(v.parts[PART.chest]).toMatchObject({ ax: Math.fround(-0.1), ay: Math.fround(1.1), by: Math.fround(1.4) });
    expect(v.parts[PART.chest]!.r).toBeCloseTo(0.11, 6);
    expect(v.parts[PART.chestR]).toMatchObject({ ax: Math.fround(0.1) });
    expect(v.parts[PART.shoulders]).toMatchObject({ ax: Math.fround(-0.2), bx: Math.fround(0.2) });
    expect(v.parts[PART.shoulders]!.r).toBeCloseTo(0.12, 6);
    expect(v.parts[PART.hipL]!.r).toBeCloseTo(0.13, 6);
    expect(v.parts[PART.thighL]!.r).toBeCloseTo(0.14, 6);
    expect(v.parts[PART.bootR]!.r).toBeCloseTo(0.16, 6);
  });
  it('rolls the head, chest and shoulders with a peek but leaves the hips', () => {
    const up = vol(() => {});
    const lean = vol((c) => (c.lean = 1));
    expect(lean.head.x).not.toBeCloseTo(up.head.x, 3);
    expect(lean.parts[PART.chest]!.bx).not.toBeCloseTo(up.parts[PART.chest]!.bx, 3);
    expect(lean.parts[PART.shoulders]!.bx).not.toBeCloseTo(up.parts[PART.shoulders]!.bx, 3);
    for (const p of [PART.hipL, PART.hipR]) expect(lean.parts[p]).toEqual(up.parts[p]);
  });
  it('stays finite in every life state, sprinting, crouched and vaulting', () => {
    const states: ((c: ReturnType<typeof createCharacter>) => void)[] = [
      ...(['alive', 'calling', 'walkingOff', 'leaving', 'out'] as LifeStatus[]).map((s) => (c: ReturnType<typeof createCharacter>) => (c.status = s)),
      (c) => ((c.sprinting = true), (c.velocity.z = -5)),
      (c) => (c.crouchAmount = 1),
      (c) => ((c.vault.active = true), (c.vault.time = 0.3)),
      (c) => ((c.vault.active = true), (c.vault.time = 99)),
    ];
    for (const mut of states) {
      const v = vol(mut);
      const nums = [v.head.x, v.head.y0, v.head.z, v.bound.x, v.bound.r, ...v.parts.flatMap((p) => [p.ax, p.ay, p.az, p.bx, p.by, p.bz, p.r])];
      for (const n of nums) expect(Number.isFinite(n)).toBe(true);
    }
  });
});
