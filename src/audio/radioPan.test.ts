import { describe, expect, it } from 'vitest';
import { radioPan } from './sfx';

/** CL1 criterion 6: a teammate's radio click is panned towards where they stand. three.js: y up, forward -z is right-handed, so facing -z has +x on the right. */
describe('radioPan', () => {
  const from = { x: 10, z: 10 };
  const north = { x: 0, z: -1 };

  it('is positive for a mate on your right and negative on your left', () => {
    expect(radioPan(from, north, { x: 15, z: 10 })).toBeCloseTo(1);
    expect(radioPan(from, north, { x: 5, z: 10 })).toBeCloseTo(-1);
  });

  it('turns with you: the same mate swaps sides when you face the other way', () => {
    const mate = { x: 15, z: 10 };
    expect(radioPan(from, { x: 0, z: 1 }, mate)).toBeCloseTo(-1);
    expect(radioPan(from, { x: 1, z: 0 }, mate)).toBeCloseTo(0);
  });

  it('is 0 straight ahead or behind, and 0 on top of the listener', () => {
    expect(radioPan(from, north, { x: 10, z: 0 })).toBeCloseTo(0);
    expect(radioPan(from, north, { x: 10, z: 20 })).toBeCloseTo(0);
    expect(radioPan(from, north, from)).toBe(0);
  });

  it('stays within [-1, 1] at any distance and angle, and does not depend on distance', () => {
    for (let a = 0; a < 360; a += 15) {
      const r = (a * Math.PI) / 180;
      for (const d of [0.01, 3, 500]) {
        const p = radioPan(from, north, { x: from.x + Math.cos(r) * d, z: from.z + Math.sin(r) * d });
        expect(p).toBeGreaterThanOrEqual(-1);
        expect(p).toBeLessThanOrEqual(1);
      }
    }
    expect(radioPan(from, north, { x: 11, z: 10 })).toBeCloseTo(radioPan(from, north, { x: 100, z: 10 }));
  });
});
