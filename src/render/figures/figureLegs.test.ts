import { describe, expect, it } from 'vitest';
import { FIGURE_RIG } from '../../config/figureRig';
import { HITS } from '../../config/hits';
import { MOVEMENT } from '../../config/movement';
import { LEG_CLIPS, LEG_POINT, LEG_POINTS, LEG_SAMPLE, LEG_SLOT } from '../../sim/figureLegs';
import { legsWithSpares } from './figureLegs';
import { figureFilesForTests } from '../testSupport';

/**
 * The legs the hit volume takes from the rigged figures' files (IM8, render/figures/figureLegs.ts): read the way the game
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

  it('has the Vault clip sampled end to end where the file has it (the robot since its redesign), else no samples', () => {
    const vault = clips[LEG_SLOT.Vault]!;
    if (kind === 'robot') expect(vault.seconds).toBeGreaterThan(0);
    expect(vault.frames).toBe(vault.seconds > 0 ? Math.round(vault.seconds * 30) + 1 : 0);
    expect(vault.points).toHaveLength(vault.frames * LEG_SAMPLE);
    expect(vault.stride).toBe(0);
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

describe('the robot figure legs over low cover (M102)', () => {
  const { clips } = rigs.robot.legs;
  const vault = clips[LEG_SLOT.Vault]!;
  const stand = mean(hipHeights(clips[LEG_SLOT.Idle]!.points, 1));
  const hips = hipHeights(vault.points, vault.frames);
  const sample = (share: number): number => Math.round(share * (vault.frames - 1));

  it('keeps its boots off the floor line the game lifts the feet to, all the way over', () => {
    for (let f = 0; f < vault.frames; f++) {
      for (const side of [0, 1]) {
        expect(at(vault.points, f, side, LEG_POINT.heel)[1]).toBeGreaterThan(HITS.legs.boot.radius);
        expect(at(vault.points, f, side, LEG_POINT.toe)[1]).toBeGreaterThan(HITS.legs.boot.radius);
      }
    }
  });

  it('tucks its hips down near the tucked hit volume across the top, and ends near standing, feet tucked as the jump', () => {
    const tucked = MOVEMENT.vault.tuck * HITS.crouchDrop;
    for (let f = sample(0.45); f <= sample(0.75); f++) {
      expect(stand - hips[f]!).toBeGreaterThan(tucked - 0.1);
      expect(stand - hips[f]!).toBeLessThan(tucked + 0.02);
    }
    const last = vault.frames - 1;
    expect(stand - hips[last]!).toBeLessThan(0.1);
    // The fall plays the jump from its tuck (FIGURE_RIG.jump.to): the boots about as high.
    const jump = clips[LEG_SLOT.Jump]!;
    const tuck = Math.round((FIGURE_RIG.jump.to / jump.seconds) * (jump.frames - 1));
    for (const side of [0, 1]) expect(at(vault.points, last, side, LEG_POINT.heel)[1]! - at(jump.points, tuck, side, LEG_POINT.heel)[1]!).toBeGreaterThan(-0.1);
  });
});

describe("a match's legs for the hit volume (FigureRigs.legs)", () => {
  it("are the human's, any clip its file lacks taken from the robot's", () => {
    const legs = legsWithSpares(rigs.human.legs, rigs.robot.legs);
    LEG_CLIPS.forEach((_, slot) => {
      const own = rigs.human.legs.clips[slot]!;
      expect(legs.clips[slot]).toBe(own.frames > 0 ? own : rigs.robot.legs.clips[slot]);
    });
    expect(legs.clips[LEG_SLOT.Vault]!.frames).toBeGreaterThan(0);
  });
});
