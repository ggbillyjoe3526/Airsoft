import type * as THREE from 'three';
import { REPLICA_FINISH } from '../config/replicaFinish';
import { describe, expect, it } from 'vitest';
import { buildForearm, buildHand, type FingerCurl, type GeometrySink, type HandPose } from './handModels';

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

describe('buildForearm (G11)', () => {
  it('wears the team armband near the wrist, where the support arm shows it in view, hugging the sleeve', () => {
    const wrist: [number, number, number] = [0, 0, 0];
    const elbow: [number, number, number] = [0, -0.4, 0];
    const parts: Partial<Record<string, THREE.BufferGeometry>> = {};
    buildForearm({ addGeometry: (key, geo) => void (parts[key] ??= geo) }, wrist, elbow, 0.046, 'high');
    const band = parts.armband!;
    const sleeve = parts.sleeve!;
    band.computeBoundingBox();
    // The wrist is at y 0 and the elbow at -0.4: the band's middle sits REPLICA_FINISH.armband.at of the way down.
    const mid = -(band.boundingBox!.min.y + band.boundingBox!.max.y) / 2;
    expect(mid / 0.4).toBeCloseTo(REPLICA_FINISH.armband.at, 1);
    expect(mid / 0.4).toBeLessThan(0.5);
    // Between the sleeve's rings either side of it, a little proud (a loose ring would float off the arm, as at 1.05 of
    // the elbow's width it did here).
    const pos = sleeve.getAttribute('position');
    const rings = new Map<number, number>();
    for (let i = 0; i < pos.count; i++) {
      const y = Math.round(-pos.getY(i) * 1000) / 1000;
      rings.set(y, Math.max(rings.get(y) ?? 0, Math.abs(pos.getX(i))));
    }
    const ys = [...rings.keys()].sort((a, b) => a - b);
    const below = rings.get(ys.filter((y) => y <= mid).at(-1)!)!;
    const above = rings.get(ys.find((y) => y > mid)!)!;
    expect(band.boundingBox!.max.x).toBeGreaterThan(Math.min(below, above));
    expect(band.boundingBox!.max.x).toBeLessThan(Math.max(below, above) * REPLICA_FINISH.armband.proud);
  });
});
