import { describe, expect, it } from 'vitest';
import { LEG_CLIPS, LEG_SAMPLE } from '../sim/figureLegs';
import type { FigureLegs } from '../config/hits';
import { legsWithSpares } from './figureLegs';

/** RM10: legsWithSpares on small made-up legs, the cases the shipped files do not reach. */

type Clip = FigureLegs['clips'][number];
const clip = (frames: number, tag: number): Clip => ({ seconds: frames > 1 ? (frames - 1) / 30 : 0, frames, stride: tag, points: new Float32Array(frames * LEG_SAMPLE) });
const legs = (frames: (n: number) => number, tag: number): FigureLegs => ({ clips: LEG_CLIPS.map((_, i) => clip(frames(i), tag)) });

describe('legsWithSpares', () => {
  it('returns the main legs clip for clip when none is missing, never the spare', () => {
    const main = legs(() => 5, 1);
    const out = legsWithSpares(main, legs(() => 9, 2));
    expect(out.clips).toHaveLength(LEG_CLIPS.length);
    out.clips.forEach((c, i) => expect(c).toBe(main.clips[i]));
  });

  it('takes only the missing clips from the spare, keeping the order of the slots', () => {
    const last = LEG_CLIPS.length - 1;
    const main = legs((i) => (i === last || i === 2 ? 0 : 5), 1);
    const spare = legs(() => 7, 2);
    const out = legsWithSpares(main, spare);
    out.clips.forEach((c, i) => expect(c).toBe(i === last || i === 2 ? spare.clips[i] : main.clips[i]));
  });

  it('stays empty in every slot when the spare lacks the clip too, and does not change either input', () => {
    const main = legs(() => 0, 1);
    const spare = legs(() => 0, 2);
    const before = main.clips.slice();
    const out = legsWithSpares(main, spare);
    out.clips.forEach((c) => expect(c.frames).toBe(0));
    expect(main.clips).toEqual(before);
    expect(out).not.toBe(main);
  });
});
