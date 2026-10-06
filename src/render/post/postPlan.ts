import type { QualitySettings } from '../../config/render';

/** The post stack's passes (G5), in the order they draw. */
export type PostPassId = 'ao' | 'reflections' | 'lightShafts' | 'taa' | 'bloom' | 'output' | 'lens';

/** The quality fields the post stack reads (a change to any of them rebuilds it). */
export type PostQuality = Pick<QualitySettings, 'ambientOcclusion' | 'bloom' | 'temporalAA' | 'lightShafts' | 'reflections' | 'lensFinish' | 'antialias'>;

/**
 * The passes a quality draws, in order (G5). Shade, reflections and shafts work on the lit scene before the temporal
 * blend, so it smooths them too; bloom glows from the smoothed picture; `output` tone-maps it for the screen; the lens
 * finish's grain comes last, so no blend smears it. Nothing on (Low): no passes, and the renderer draws straight to the
 * screen as it always has.
 */
export function postPlan(q: PostQuality): PostPassId[] {
  const plan: PostPassId[] = [];
  if (q.ambientOcclusion > 0) plan.push('ao');
  if (q.reflections) plan.push('reflections');
  if (q.lightShafts) plan.push('lightShafts');
  if (q.temporalAA) plan.push('taa');
  if (q.bloom) plan.push('bloom');
  if (plan.length === 0 && !q.lensFinish) return plan;
  plan.push('output');
  if (q.lensFinish) plan.push('lens');
  return plan;
}

/** Whether a plan reads the scene's depth (shade, reflections, shafts and the temporal blend do). */
export function planNeedsDepth(plan: readonly PostPassId[]): boolean {
  return plan.some((p) => p === 'ao' || p === 'reflections' || p === 'lightShafts' || p === 'taa');
}

/**
 * Multisamples for the scene's target: Edge smoothing's 4× unless the temporal blend smooths instead (it needs one sample
 * a pixel to jitter, and does the job better).
 */
export function sceneSamples(q: PostQuality): number {
  return q.antialias && !q.temporalAA ? 4 : 0;
}
