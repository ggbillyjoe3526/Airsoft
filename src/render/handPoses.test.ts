import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import type { DetailLevel } from '../config/render';
import { buildHand, type HandPose } from './handModels';
import { AEG_HANDGUARD, AEG_SUPPORT_POSE, RAISED_HAND_POSE } from './replicaModels';

const DETAILS: readonly DetailLevel[] = ['low', 'high'];

/** Every part buildHand makes for `pose`, in its order: the palm, the fingers' 12 segments (index first), the thenar pad, the thumb's 2 segments, then the wrist. */
function handParts(pose: HandPose, detail: DetailLevel): THREE.BufferGeometry[] {
  const parts: THREE.BufferGeometry[] = [];
  buildHand({ addGeometry: (_key, geo) => parts.push(geo) }, pose, detail);
  return parts;
}
const FINGERTIPS = [3, 6, 9, 12];
const THUMB_TIP = 15;

/** Signed distance (m) from a point in the model's three.js space (forward is -Z) to the AEG's handguard block; negative inside. */
function handguardDistance(p: THREE.Vector3): number {
  const H = AEG_HANDGUARD;
  const q = [Math.abs(p.x) - H.halfWidth, Math.abs(p.y - (H.top + H.bottom) / 2) - (H.top - H.bottom) / 2, Math.abs(-p.z - (H.from + H.to) / 2) - (H.to - H.from) / 2];
  return Math.hypot(Math.max(q[0]!, 0), Math.max(q[1]!, 0), Math.max(q[2]!, 0)) + Math.min(Math.max(q[0]!, q[1]!, q[2]!), 0);
}

function nearest(geo: THREE.BufferGeometry): number {
  const pos = geo.getAttribute('position');
  const v = new THREE.Vector3();
  let min = Infinity;
  for (let i = 0; i < pos.count; i++) min = Math.min(min, handguardDistance(v.fromBufferAttribute(pos, i)));
  return min;
}

function centre(geo: THREE.BufferGeometry): THREE.Vector3 {
  geo.computeBoundingBox();
  return geo.boundingBox!.getCenter(new THREE.Vector3());
}

/** The share of a part's triangles wound the way their normals face (a part drawn inside out has none). */
function outsideOut(geo: THREE.BufferGeometry): number {
  const g = geo.index ? geo.toNonIndexed() : geo;
  const pos = g.getAttribute('position');
  const nor = g.getAttribute('normal');
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  const n = new THREE.Vector3();
  const m = new THREE.Vector3();
  const face = new THREE.Vector3();
  let good = 0;
  let all = 0;
  for (let i = 0; i < pos.count; i += 3) {
    a.fromBufferAttribute(pos, i);
    b.fromBufferAttribute(pos, i + 1).sub(a);
    c.fromBufferAttribute(pos, i + 2).sub(a);
    face.crossVectors(b, c);
    if (face.lengthSq() < 1e-14) continue; // a degenerate triangle at a pole
    n.fromBufferAttribute(nor, i).add(m.fromBufferAttribute(nor, i + 1)).add(m.fromBufferAttribute(nor, i + 2));
    all++;
    if (face.dot(n) > 0) good++;
  }
  return good / all;
}

describe('first-person hands (FA13)', () => {
  it('are drawn outside out, the left hands too (their palms showed inside out: grey-blue, the fingers seen through them)', () => {
    for (const detail of DETAILS) {
      for (const pose of [AEG_SUPPORT_POSE, RAISED_HAND_POSE, { ...RAISED_HAND_POSE, side: 'right' as const }]) {
        for (const part of handParts(pose, detail)) expect(outsideOut(part)).toBeGreaterThan(0.99);
      }
    }
  });

  it("the rifle's support hand holds the handguard: palm under it, fingers up its far side, thumb up its near side, nothing through it", () => {
    const H = AEG_HANDGUARD;
    for (const detail of DETAILS) {
      const parts = handParts(AEG_SUPPORT_POSE, detail);
      // Nothing goes into the handguard more than a glove pressed on it would (the old pose's fingertips went 19 mm in).
      for (const part of parts) expect(nearest(part)).toBeGreaterThan(-0.003);
      // The palm against its underside.
      expect(nearest(parts[0]!)).toBeLessThan(0.003);
      expect(centre(parts[0]!).y).toBeLessThan(H.bottom);
      // Each fingertip on the far (right) side.
      for (const tip of FINGERTIPS) {
        expect(nearest(parts[tip]!)).toBeLessThan(0.003);
        expect(centre(parts[tip]!).x).toBeGreaterThan(H.halfWidth);
      }
      // The thumb on the near (left) side, up off the bottom where the view sees it (it was under the handguard, its tip
      // on the far side).
      const thumb = centre(parts[THUMB_TIP]!);
      expect(nearest(parts[THUMB_TIP]!)).toBeLessThan(0.003);
      expect(thumb.x).toBeLessThan(-H.halfWidth);
      expect(thumb.y).toBeGreaterThan(H.bottom + (H.top - H.bottom) / 4);
      expect(thumb.y).toBeLessThan(H.top);
    }
  });
});
