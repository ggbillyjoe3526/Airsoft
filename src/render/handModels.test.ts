import type * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { buildHand, type FingerCurl, type GeometrySink, type HandPose } from './handModels';

/** Triangles in everything a sink was given. */
function triangles(build: (sink: GeometrySink) => void): number {
  let n = 0;
  build({
    addGeometry: (_key, geo: THREE.BufferGeometry) => {
      n += (geo.index ? geo.index.count : geo.getAttribute('position').count) / 3;
      geo.dispose();
    },
  });
  return n;
}

const WRAP: FingerCurl = [1.2, 1.3, 0.9];
const POSES: HandPose[] = [
  { side: 'right', palm: [0.034, -0.092, -0.074], across: [0, -1, 0], back: [1, 0, 0], fingers: [[0.1, 0.1, 0.1], WRAP, WRAP, WRAP], thumb: { swing: 0.9, curl: [0.3, 0.3] } },
  { side: 'left', palm: [-0.012, -0.018, 0.29], across: [0, 0, -1], back: [0, -1, 0], fingers: [WRAP, WRAP, WRAP, WRAP], thumb: { swing: 0.2, curl: [0.2, 0.2] } },
];

describe('buildHand (REN-10)', () => {
  it('a gloved hand is under 2,500 triangles (it was 7,012: invisible detail at viewmodel distance)', () => {
    for (const pose of POSES) {
      const n = triangles((sink) => buildHand(sink, pose));
      expect(n).toBeLessThan(2500);
      // Still a hand, not a mitten: the 15 capsules alone are over a thousand.
      expect(n).toBeGreaterThan(1000);
    }
  });
});
