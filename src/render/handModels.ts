import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';

/**
 * Gloved hands and sleeved forearms for the first-person replicas. Stylised but anatomical: a padded
 * palm, four three-segment fingers with realistic proportions, a two-segment thumb with a thenar pad,
 * a glove cuff, and a forearm that tapers to the wrist and swells towards the elbow.
 *
 * Coordinates use the replica model's space: (across, up, forward) in metres.
 */
export type V3 = readonly [across: number, up: number, forward: number];

export interface GeometrySink {
  addGeometry(key: 'glove' | 'sleeve' | 'armband', geo: THREE.BufferGeometry): void;
}

/** Per-finger joint bends in radians (knuckle, middle joint, tip joint), bending towards the palm. */
export type FingerCurl = readonly [number, number, number];

export interface HandPose {
  side: 'right' | 'left';
  /** Palm centre. */
  palm: V3;
  /** Direction along the knuckle row, from the index finger towards the pinky. */
  across: V3;
  /** Direction the back of the hand faces. */
  back: V3;
  /** Index, middle, ring, pinky. */
  fingers: readonly [FingerCurl, FingerCurl, FingerCurl, FingerCurl];
  /** Thumb: how far it swings across the palm (0 = alongside, 1 = fully across) and its two bends. */
  thumb: { swing: number; curl: readonly [number, number] };
}

// Proportions (metres, gloved).
const PALM = { width: 0.078, length: 0.084, thickness: 0.028, radius: 0.013 };
/** Knuckle positions along the knuckle row and how far past the palm centre they sit. */
const KNUCKLES = [
  { across: 0.0, along: 0.04 },
  { across: 0.021, along: 0.043 },
  { across: 0.041, along: 0.04 },
  { across: 0.058, along: 0.033 },
];
const SEGMENTS = [
  [0.042, 0.026, 0.021],
  [0.046, 0.029, 0.022],
  [0.043, 0.027, 0.021],
  [0.034, 0.021, 0.018],
];
const FINGER_RADIUS = [0.0098, 0.0101, 0.0095, 0.0085];

const toVec = (p: V3): THREE.Vector3 => new THREE.Vector3(p[0], p[1], -p[2]);

/** Capsule from a to b (world vectors). */
function capsule(a: THREE.Vector3, b: THREE.Vector3, radius: number): THREE.BufferGeometry {
  const dir = b.clone().sub(a);
  const len = Math.max(1e-4, dir.length());
  const geo = new THREE.CapsuleGeometry(radius, len, 6, 14);
  geo.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize()));
  geo.translate((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
  return geo;
}

/** Builds one gloved hand in the given pose and returns its wrist point (where the forearm starts). */
export function buildHand(sink: GeometrySink, pose: HandPose): V3 {
  const a = toVec(pose.across).normalize();
  const n = toVec(pose.back).normalize();
  // Right hand: fingers = back × across; the left hand is its mirror image.
  const d = pose.side === 'right' ? n.clone().cross(a) : a.clone().cross(n);
  d.normalize();
  // Re-orthogonalise the back normal so the frame is exact.
  const nn = pose.side === 'right' ? a.clone().cross(d) : d.clone().cross(a);
  const centre = toVec(pose.palm);
  const midAcross = (KNUCKLES[0]!.across + KNUCKLES[3]!.across) / 2;
  const local = (u: number, v: number, w: number): THREE.Vector3 =>
    centre
      .clone()
      .addScaledVector(a, u - midAcross)
      .addScaledVector(d, v)
      .addScaledVector(nn, w);

  // Palm: a padded, slightly thicker pad towards the heel of the hand.
  const palm = new RoundedBoxGeometry(PALM.width, PALM.length, PALM.thickness, 4, PALM.radius);
  const basis = new THREE.Matrix4().makeBasis(a, d, nn);
  palm.applyMatrix4(basis);
  palm.translate(centre.x, centre.y, centre.z);
  sink.addGeometry('glove', palm);

  // Fingers: chains of capsules, each joint bending towards the palm about the knuckle-row axis.
  for (let f = 0; f < 4; f++) {
    const k = KNUCKLES[f]!;
    let p = local(k.across, k.along - 0.006, 0.002);
    const dir = d.clone();
    const up = nn.clone();
    const radius = FINGER_RADIUS[f]!;
    for (let s = 0; s < 3; s++) {
      const bend = pose.fingers[f]![s]!;
      // Rotate the segment direction (and the local "back" vector) towards the palm side.
      const q = new THREE.Quaternion().setFromAxisAngle(pose.side === 'right' ? a : a.clone().negate(), -bend);
      dir.applyQuaternion(q);
      up.applyQuaternion(q);
      const len = SEGMENTS[f]![s]!;
      const q2 = p.clone().addScaledVector(dir, len);
      sink.addGeometry('glove', capsule(p, q2, radius * (1 - s * 0.07)));
      p = q2;
    }
  }

  // Thumb: from the heel of the hand on the index side, a fleshy pad, then two segments.
  const thenar = new THREE.SphereGeometry(0.02, 12, 10);
  thenar.scale(1, 1.4, 0.75);
  thenar.applyMatrix4(basis);
  const tp = local(-0.03, -0.012, -0.006);
  thenar.translate(tp.x, tp.y, tp.z);
  sink.addGeometry('glove', thenar);

  const swing = pose.thumb.swing;
  const tDir = a
    .clone()
    .multiplyScalar(-0.55 * (1 - swing))
    .addScaledVector(d, 0.65)
    .addScaledVector(nn, -0.5 - 0.4 * swing)
    .normalize();
  let tpos = local(-0.034, 0.004, -0.01);
  const tAxis = tDir.clone().cross(nn).normalize();
  for (let s = 0; s < 2; s++) {
    tDir.applyQuaternion(new THREE.Quaternion().setFromAxisAngle(tAxis, pose.thumb.curl[s]!));
    const len = s === 0 ? 0.034 : 0.028;
    const next = tpos.clone().addScaledVector(tDir, len);
    sink.addGeometry('glove', capsule(tpos, next, s === 0 ? 0.0115 : 0.0105));
    tpos = next;
  }

  // Wrist and glove cuff with a strap across the back.
  const wristA = local(midAcross, -PALM.length / 2 + 0.006, 0);
  const wristB = local(midAcross, -PALM.length / 2 - 0.03, 0);
  sink.addGeometry('glove', capsule(wristA, wristB, 0.025));
  const cuff = new THREE.CylinderGeometry(0.03, 0.028, 0.03, 16);
  cuff.applyMatrix4(new THREE.Matrix4().makeBasis(a, d, nn));
  const cuffAt = local(midAcross, -PALM.length / 2 - 0.022, 0);
  cuff.translate(cuffAt.x, cuffAt.y, cuffAt.z);
  sink.addGeometry('glove', cuff);
  const strap = new RoundedBoxGeometry(0.034, 0.016, 0.008, 2, 0.003);
  strap.applyMatrix4(basis);
  const strapAt = local(midAcross, -PALM.length / 2 - 0.02, 0.028);
  strap.translate(strapAt.x, strapAt.y, strapAt.z);
  sink.addGeometry('glove', strap);
  return [wristB.x, wristB.y, -wristB.z];
}

/** Radius profile of a forearm from wrist (t = 0) to elbow (t = 1), as fractions of the elbow radius. */
const FOREARM_PROFILE: readonly [number, number][] = [
  [0, 0.62],
  [0.15, 0.68],
  [0.45, 0.9],
  [0.7, 1.0],
  [1, 0.96],
];

/**
 * A sleeved forearm from the wrist back to the elbow (usually out of view): a tapered, slightly oval
 * sleeve shaped like the arm inside it, a rolled cuff at the wrist end, and the team armband.
 */
export function buildForearm(sink: GeometrySink, wrist: V3, elbow: V3, elbowRadius = 0.046): void {
  const a = toVec(wrist);
  const b = toVec(elbow);
  const axis = b.clone().sub(a);
  const length = axis.length();
  const start = 0.01; // starts just inside the glove cuff (which ends at the wrist point) so there is no gap
  const points = FOREARM_PROFILE.map(([t, r]) => new THREE.Vector2(r * elbowRadius, start + t * (length - start)));
  const sleeve = new THREE.LatheGeometry(points, 18);
  sleeve.scale(1, 1, 0.82); // forearms are wider than they are deep
  const orient = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), axis.clone().normalize());
  sleeve.applyQuaternion(orient);
  sleeve.translate(a.x, a.y, a.z);
  sink.addGeometry('sleeve', sleeve);

  // Rolled cuff where the sleeve ends near the wrist.
  const cuff = new THREE.TorusGeometry(FOREARM_PROFILE[1]![1] * elbowRadius * 1.02, 0.007, 8, 18);
  cuff.rotateX(Math.PI / 2);
  cuff.scale(1, 1, 0.82);
  cuff.translate(0, start + 0.015, 0);
  cuff.applyQuaternion(orient);
  cuff.translate(a.x, a.y, a.z);
  sink.addGeometry('sleeve', cuff);

  // Team armband around the upper forearm.
  const bandAt = start + 0.62 * (length - start);
  const band = new THREE.CylinderGeometry(elbowRadius * 1.05, elbowRadius * 1.03, 0.045, 18, 1, true);
  band.scale(1, 1, 0.84);
  band.translate(0, bandAt, 0);
  band.applyQuaternion(orient);
  band.translate(a.x, a.y, a.z);
  sink.addGeometry('armband', band);
}
