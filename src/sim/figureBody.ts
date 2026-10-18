import type { FigureBody, FigureLegs } from '../config/hits';
import type { Character } from './character';
import { characterLegWeights, LEG_CLIPS, LEG_MODE, legClipShare, legMode, legsHaveVault } from './figureLegs';

/**
 * The rigged figures' upper bodies in the simulation (HV1; owner, 2026-10-16: "fit to each figure"). As the legs' hit
 * volumes sit on the drawn legs (IM8, sim/figureLegs.ts), the head, chest, shoulders and hips sit where each figure
 * draws them: its hit shape's points (config/figureRig.ts FIGURE_HIT_SHAPES), read on the figure's bones from its clips
 * as it loads (render/figures/figureBody.ts), blended by the same weights as the legs. In play the figure's upper body is the
 * aim's over the clip's legs, so it stays upright over a bobbing or crouched pelvis; sprinting, vaulting, calling the
 * hit, walking off and out it is the clip's own, so it leans into the sprint and tucks over the vault (FigurePose's
 * overlay, render/figures/figurePose.ts). The peek's roll is put on afterwards (sim/hitbox.ts), as the figure's is.
 */

/** The points of a figure's hit shape, in FigureBody's samples. */
export const BODY_POINT = {
  head: 0,
  chestBottomL: 1,
  chestTopL: 2,
  chestBottomR: 3,
  chestTopR: 4,
  shoulderL: 5,
  shoulderR: 6,
  hipBottomL: 7,
  hipTopL: 8,
  hipBottomR: 9,
  hipTopR: 10,
} as const;
export const BODY_POINTS = 11;
/** Numbers in one sample: BODY_POINTS points of three. */
export const BODY_SAMPLE = BODY_POINTS * 3;
/** The points the peek rolls (the hips' don't: the figure's peek turns its spine, not its pelvis). */
export const BODY_ROLLED = BODY_POINT.hipBottomL;

const weights = new Float32Array(LEG_CLIPS.length);

/**
 * Whether `c`'s figure shows the aim's upper body (FigurePose's overlay): in play, walking, running or standing (not
 * sprinting or vaulting). The hit volume takes it at once, as the legs' weights (the figure eases into it).
 */
export function aimedUpperBody(c: Character): boolean {
  return c.status === 'alive' && !c.vault.active && legMode(c.status, c.sprinting, Math.hypot(c.velocity.x, c.velocity.z)) === LEG_MODE.gait;
}

/**
 * Writes `c`'s upper body (one sample: BODY_SAMPLE numbers, in the figure's own frame) into `out`: every leg clip with
 * weight, each at its place in the clip, blended by weight, from the aimed or the whole set. Allocation-free.
 */
export function figureBodyPose(c: Character, legs: FigureLegs, body: FigureBody, out: Float32Array): void {
  characterLegWeights(c, weights, legsHaveVault(legs));
  const aimed = aimedUpperBody(c);
  out.fill(0, 0, BODY_SAMPLE);
  let total = 0;
  for (let slot = 0; slot < LEG_CLIPS.length; slot++) {
    const w = weights[slot]!;
    const clip = body.clips[slot];
    const timing = legs.clips[slot];
    if (w <= 1e-6 || !clip || !timing || clip.frames < 1) continue;
    total += w;
    const at = legClipShare(c, slot, timing.seconds) * (clip.frames - 1);
    const i0 = Math.min(clip.frames - 1, Math.max(0, Math.floor(at)));
    const i1 = Math.min(clip.frames - 1, i0 + 1);
    const u = at - i0;
    const p = aimed ? clip.aimed : clip.whole;
    for (let k = 0; k < BODY_SAMPLE; k++) out[k]! += w * (p[i0 * BODY_SAMPLE + k]! * (1 - u) + p[i1 * BODY_SAMPLE + k]! * u);
  }
  if (total > 0) for (let k = 0; k < BODY_SAMPLE; k++) out[k]! /= total;
}
