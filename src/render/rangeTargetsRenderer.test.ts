import { describe, expect, it } from 'vitest';
import { RANGE, RANGE_VISUALS } from '../config/range';
import { lastShotText } from '../ui/rangeReadout';
import { figureTilt, plateSwing } from './rangeTargetsRenderer';

describe('practice range presentation (M21)', () => {
  it('drops a figure back quickly, keeps it down, and stands it up at the end of its time down', () => {
    expect(figureTilt(0)).toBe(0);
    expect(figureTilt(RANGE.figureDownTime)).toBe(0); // just hit
    expect(figureTilt(RANGE.figureDownTime - RANGE_VISUALS.fallTime / 2)).toBeCloseTo(RANGE_VISUALS.downAngle / 2, 6);
    expect(figureTilt(RANGE.figureDownTime / 2)).toBe(RANGE_VISUALS.downAngle);
    expect(figureTilt(RANGE_VISUALS.riseTime / 2)).toBeCloseTo(RANGE_VISUALS.downAngle / 2, 6);
  });

  it('swings a plate back when hit, and lets it settle', () => {
    expect(plateSwing(0)).toBeCloseTo(RANGE_VISUALS.swingAngle, 6);
    expect(plateSwing(1)).toBeLessThan(0.01 * RANGE_VISUALS.swingAngle);
    for (let t = 0; t < 1; t += 0.01) expect(plateSwing(t)).toBeGreaterThanOrEqual(0);
  });

  it('reads out where the last BB landed and what it hit', () => {
    expect(lastShotText(null)).toContain('Practice range');
    expect(lastShotText({ distance: 30.6, target: { label: 'Steel', distance: 30 } })).toBe('Last BB: 31 m · hit Steel 30 m');
    expect(lastShotText({ distance: 44.2, target: null })).toBe('Last BB: 44 m · miss');
  });
});
