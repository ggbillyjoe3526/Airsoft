import { describe, expect, it } from 'vitest';
import { HITS } from '../config/hits';
import { MOVEMENT } from '../config/movement';
import { LEG_CLIPS, LEG_POINT, LEG_POINTS, LEG_SAMPLE, LEG_SLOT } from '../sim/figureLegs';
import { figureFilesForTests } from './testSupport';

/**
 * The legs the hit volume takes from the rigged figures' files (IM8, render/figureLegs.ts): read the way the game
 * reads them, from the files it ships.
 */
const { rigs } = await figureFilesForTests();

/** Point `point` of leg `side` (0 left, 1 right) at sample `f` of a clip's points: [x, y, z]. */
const at = (points: Float32Array, f: number, side: number, point: number): number[] => {
  const k = f * LEG_SAMPLE + (side * LEG_POINTS + point) * 3;
  return [points[k]!, points[k + 1]!, points[k + 2]!];
};
/** The hips' height (the two hip joints' mean) at each sample of a clip. */
const hipHeights = (points: Float32Array, frames: number): number[] =>
  Array.from({ length: frames }, (_, f) => (at(points, f, 0, LEG_POINT.hip)[1]! + at(points, f, 1, LEG_POINT.hip)[1]!) / 2);
const mean = (xs: number[]): number => xs.reduce((s, x) => s + x, 0) / xs.length;

describe.each(['human', 'robot'] as const)('the %s figure legs, for the hit volume (IM8)', (kind) => {
  const { clips } = rigs[kind].legs;

  it('has every leg clip: the idles held at one sample, the rest sampled 30 times a second end to end', () => {
    expect(clips).toHaveLength(LEG_CLIPS.length);
    expect(clips[LEG_SLOT.Idle]!.frames).toBe(1);
    expect(clips[LEG_SLOT.CrouchIdle]!.frames).toBe(1);
    const walk = clips[LEG_SLOT.CrouchWalk]!;
    expect(walk.frames).toBe(Math.round(walk.seconds * 30) + 1);
    expect(walk.points).toHaveLength(walk.frames * LEG_SAMPLE);
    // A cycle's stride is its pace times its length: the crouch walk's at the game's crouching pace.
    expect(walk.stride).toBeCloseTo(MOVEMENT.crouchSpeed * walk.seconds, 6);
    expect(clips[LEG_SLOT.HitCall]!.stride).toBe(0);
  });

  it('stands on its feet: hips at the hit volume pivot, left leg on the left, boots on the floor toes forward', () => {
    const p = clips[LEG_SLOT.Idle]!.points;
    for (const side of [0, 1]) {
      const [hx, hy] = at(p, 0, side, LEG_POINT.hip);
      expect(hy).toBeGreaterThan(HITS.lean.pivotHeight - 0.05);
      expect(hy).toBeLessThan(HITS.lean.pivotHeight + 0.05);
      expect(Math.sign(hx!)).toBe(side === 0 ? -1 : 1);
      const heel = at(p, 0, side, LEG_POINT.heel);
      const toe = at(p, 0, side, LEG_POINT.toe);
      // The boot capsule's ends a radius over the sole, heel behind the toe (z forward-negative).
      expect(heel[1]).toBeCloseTo(HITS.legs.boot.radius, 1);
      expect(toe[1]).toBeCloseTo(HITS.legs.boot.radius, 1);
      expect(toe[2]!).toBeLessThan(heel[2]! - 0.1);
    }
  });

  it('crouches its hips as far as the hit volume crouches the upper body, still and walking', () => {
    const stand = mean(hipHeights(clips[LEG_SLOT.Idle]!.points, 1));
    const kneel = mean(hipHeights(clips[LEG_SLOT.CrouchIdle]!.points, 1));
    const walk = clips[LEG_SLOT.CrouchWalk]!;
    const walking = hipHeights(walk.points, walk.frames);
    expect(stand - kneel).toBeCloseTo(HITS.crouchDrop, 1);
    expect(stand - mean(walking)).toBeCloseTo(HITS.crouchDrop, 1);
    expect(Math.max(...walking) - Math.min(...walking)).toBeLessThan(0.03);
  });
});
