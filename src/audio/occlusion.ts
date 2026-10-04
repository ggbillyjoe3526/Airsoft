import { AUDIO } from '../config/audio';
import { blockedShare as raysBlocked, lineBlocked, type SoundPathQuery } from '../sim/soundPath';
import type { Vec3 } from '../sim/vec';

/** What muffling needs from the world: the distance to the first level surface along a ray, or -1 for none. */
export type OcclusionQuery = SoundPathQuery;

/** A sound's muffling: a low-pass corner (Hz) and a level (linear). */
export interface Muffle {
  hz: number;
  gain: number;
}

export { lineBlocked };

/**
 * The share (0..1) of the rays from `listener` to a character standing at `feet` that level geometry blocks, one
 * ray per AUDIO.occlusion.rayHeights: 0 in the open, 0.5 behind low cover, 1 behind a wall.
 */
export function blockedShare(query: OcclusionQuery, listener: Vec3, feet: Vec3): number {
  return raysBlocked(query, listener, feet, AUDIO.occlusion.rayHeights);
}

/**
 * How a sound is muffled when `share` of it is blocked: the low-pass corner glides from open to muffled on a
 * log scale (each step sounds about as big as the last) and the level falls linearly.
 */
export function muffleFor(share: number, out: Muffle = { hz: 0, gain: 0 }): Muffle {
  const o = AUDIO.occlusion;
  const s = Math.min(1, Math.max(0, share));
  out.hz = o.openHz * (o.muffledHz / o.openHz) ** s;
  out.gain = 1 - s * (1 - o.muffledGain);
  return out;
}
