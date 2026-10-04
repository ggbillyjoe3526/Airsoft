import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { RANGE, RANGE_VISUALS } from '../config/range';
import { lastShotText } from '../ui/rangeReadout';
import { figureRotation, figureTilt, plateRotation, plateSwing } from './rangeTargetsRenderer';

describe('practice range presentation (M21)', () => {
  it('drops a figure back quickly, keeps it down, and stands it up at the end of its time down', () => {
    expect(figureTilt(0)).toBe(0);
    expect(figureTilt(RANGE.figureDownTime)).toBe(0); // just hit
    expect(figureTilt(RANGE.figureDownTime - RANGE_VISUALS.fallTime / 2)).toBeCloseTo(RANGE_VISUALS.downAngle / 2, 6);
    expect(figureTilt(RANGE.figureDownTime / 2)).toBe(RANGE_VISUALS.downAngle);
    expect(figureTilt(RANGE_VISUALS.riseTime / 2)).toBeCloseTo(RANGE_VISUALS.downAngle / 2, 6);
  });

  it('swings a plate back when hit, and lets it settle', () => {
    expect(plateSwing(0)).toBe(0); // hanging straight when the BB lands
    const peak = Math.PI / 2 / RANGE_VISUALS.swingRate;
    expect(plateSwing(peak)).toBeGreaterThan(0.5 * RANGE_VISUALS.swingAngle); // then swings well out
    expect(plateSwing(1)).toBeLessThan(0.01 * RANGE_VISUALS.swingAngle);
    for (let t = 0; t < 1; t += 0.01) expect(plateSwing(t)).toBeGreaterThanOrEqual(0);
  });

  it('swings plates and drops figures away from the firing line (downrange is -z)', () => {
    const turned = (rotationX: number, y: number): THREE.Vector3 => {
      const pivot = new THREE.Group();
      const part = new THREE.Object3D();
      part.position.y = y;
      pivot.add(part);
      pivot.rotation.x = rotationX;
      pivot.updateMatrixWorld(true);
      return part.getWorldPosition(new THREE.Vector3());
    };
    expect(turned(plateRotation(Math.PI / 2 / RANGE_VISUALS.swingRate), -0.3).z).toBeLessThan(-0.05); // a plate hangs below its hanger
    expect(turned(figureRotation(RANGE.figureDownTime / 2), 1.5).z).toBeLessThan(-1); // a figure stands above its hinge
  });

  it('reads out where the last BB landed and what it hit', () => {
    expect(lastShotText(null)).toContain('Practice range');
    expect(lastShotText({ distance: 30.6, target: { label: 'Steel', distance: 30 } })).toBe('Last BB: 31 m · hit Steel 30 m');
    expect(lastShotText({ distance: 44.2, target: null })).toBe('Last BB: 44 m · miss');
    expect(lastShotText({ distance: 0, target: null, lost: true })).toContain('flew out of the range');
  });
});
