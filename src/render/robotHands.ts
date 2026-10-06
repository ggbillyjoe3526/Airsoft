import * as THREE from 'three';
import type { DetailLevel } from '../config/render';
import { REPLICA_FINISH } from '../config/replicaFinish';
import { chamferBox } from './figureShapes';
import { type GeometrySink, handSkeleton, type HandPose, type HandSegment, inPalm, PALM_SIZE, toV3, type V3 } from './handModels';

/**
 * A robot's hands and forearms for the first-person replicas (G7): when the player's slot is a robot (the Robots setting),
 * their arms are the figure's, in its shell. Built on the gloved hand's skeleton (handModels.ts handSkeleton), so every
 * grip pose closes the same way: each finger segment a plate along its bone with a dark joint at its root, a plated palm
 * with the team's stripe across its back, a dark wrist joint. The parts go to the same three materials as the gloved arms
 * (the plates to 'sleeve', the joints to 'glove', the stripe to 'armband'), so a robot's arms cost no draw call more, and
 * they are far fewer triangles. Hand detail `high` chamfers the plates and adds a steel pin at each knuckle and pistons
 * along the forearm.
 */

const ROBOT_HAND = {
  /** A finger plate's width and depth against the gloved finger's diameter, and its length against its bone's. */
  plateWidth: 1.8,
  plateDepth: 1.6,
  plateLength: 0.86,
  /** The thumb's square plates against its diameter. */
  thumbPlate: 0.6,
  /** A joint block's size against the finger's diameter. */
  joint: 1.5,
  /** The plates' chamfer on High (metres). */
  chamfer: 0.0025,
  /** The forearm shell's sides: faceted, as the figure's. */
  forearmSides: 8,
  forearmSidesHigh: 12,
} as const;

const UP = new THREE.Vector3(0, 1, 0);

/** A block of w × len × t along `seg` (its length along the bone), its back facing `back`. */
function plate(seg: { from: THREE.Vector3; to: THREE.Vector3 }, w: number, len: number, t: number, back: THREE.Vector3, high: boolean): THREE.BufferGeometry {
  const y = seg.to.clone().sub(seg.from).normalize();
  const z = back.clone().addScaledVector(y, -back.dot(y)).normalize();
  const x = y.clone().cross(z);
  const geo = high ? chamferBox(w, len, t, ROBOT_HAND.chamfer) : new THREE.BoxGeometry(w, len, t);
  if (high) geo.computeVertexNormals();
  geo.applyMatrix4(new THREE.Matrix4().makeBasis(x, y, z));
  const mid = seg.from.clone().add(seg.to).multiplyScalar(0.5);
  return geo.translate(mid.x, mid.y, mid.z);
}

/** A small block (a joint) at `at`, turned with the palm. */
function joint(size: number, at: THREE.Vector3, basis: THREE.Matrix4): THREE.BufferGeometry {
  return new THREE.BoxGeometry(size, size, size).applyMatrix4(basis).translate(at.x, at.y, at.z);
}

/**
 * One robot hand in `pose` (as buildHand takes it); returns its wrist point, where the forearm starts. Every segment of
 * the gloved hand is here as a plate, so the grip tests that measure the fingers hold for both.
 */
export function buildRobotHand(sink: GeometrySink, pose: HandPose, detail: DetailLevel = 'low'): V3 {
  const high = detail === 'high';
  const R = ROBOT_HAND;
  const hand = handSkeleton(pose);
  const { local, midAcross, basis } = hand;
  const back = new THREE.Vector3().setFromMatrixColumn(basis, 2);
  // Plated palm and the back of the hand, the team stripe across the knuckles.
  sink.addGeometry('sleeve', plate({ from: local(midAcross, -PALM_SIZE.length / 2, 0), to: local(midAcross, PALM_SIZE.length / 2, 0) }, PALM_SIZE.width, PALM_SIZE.length, PALM_SIZE.thickness, back, high));
  sink.addGeometry('armband', inPalm(new THREE.BoxGeometry(PALM_SIZE.width * 0.9, 0.012, 0.004), hand, local(midAcross, PALM_SIZE.length / 2 - 0.016, PALM_SIZE.thickness / 2 + 0.001)));
  const segments: HandSegment[] = [...hand.fingers, ...hand.thumb];
  segments.forEach((s, i) => {
    const d = s.radius * 2;
    const len = s.from.distanceTo(s.to);
    // The plate sits a touch towards the tip, leaving its root joint showing. The thumb's plates are square and no wider
    // than the gloved thumb: it lies against the replica, turned across the palm's frame.
    const from = s.from.clone().lerp(s.to, 1 - R.plateLength);
    const thumb = i >= hand.fingers.length;
    const [w, t] = thumb ? [d * R.thumbPlate, d * R.thumbPlate] : [d * R.plateWidth * 0.5, d * R.plateDepth * 0.5];
    sink.addGeometry('sleeve', plate({ from, to: s.to }, w, len * R.plateLength, t, back, high));
    sink.addGeometry('glove', joint(d * R.joint * 0.5, s.from, basis));
    if (high) {
      // A steel pin through the knuckle, across the finger.
      const pin = new THREE.CylinderGeometry(s.radius * 0.35, s.radius * 0.35, d * 1.25, 6).rotateZ(Math.PI / 2);
      sink.addGeometry('metal', pin.applyMatrix4(basis).translate(s.from.x, s.from.y, s.from.z));
    }
  });
  // The thenar block and the wrist joint.
  sink.addGeometry('sleeve', inPalm(new THREE.BoxGeometry(0.026, 0.04, 0.02), hand, hand.thenar));
  const wrist = new THREE.CylinderGeometry(0.022, 0.022, hand.wristA.distanceTo(hand.wristB), high ? 12 : 8);
  wrist.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(UP, hand.wristB.clone().sub(hand.wristA).normalize()));
  const mid = hand.wristA.clone().add(hand.wristB).multiplyScalar(0.5);
  sink.addGeometry('glove', wrist.translate(mid.x, mid.y, mid.z));
  return toV3(hand.wristB);
}

/** Radius profile of the robot's forearm shell from wrist (t = 0) to elbow (t = 1), against the elbow radius: a hard taper. */
const SHELL_PROFILE: readonly [number, number][] = [
  [0, 0.66],
  [0.1, 0.74],
  [0.55, 1.0],
  [0.85, 1.0],
  [1, 0.9],
];

/**
 * A robot's forearm from the wrist back to the elbow: a faceted shell (its 'sleeve'), a team panel round its upper half
 * where the gloved arm wears its armband, and a dark collar at the wrist. High: two steel pistons along its sides, and
 * the shell's inner side shaded as the sleeve's fold.
 */
export function buildRobotForearm(sink: GeometrySink, wrist: V3, elbow: V3, elbowRadius = 0.046, detail: DetailLevel = 'low'): void {
  const high = detail === 'high';
  const a = new THREE.Vector3(wrist[0], wrist[1], -wrist[2]);
  const b = new THREE.Vector3(elbow[0], elbow[1], -elbow[2]);
  const axis = b.clone().sub(a);
  const length = axis.length();
  const orient = new THREE.Quaternion().setFromUnitVectors(UP, axis.clone().normalize());
  const place = (geo: THREE.BufferGeometry): THREE.BufferGeometry => geo.applyQuaternion(orient).translate(a.x, a.y, a.z);
  const sides = high ? ROBOT_HAND.forearmSidesHigh : ROBOT_HAND.forearmSides;
  const start = 0.012;
  const shell = new THREE.LatheGeometry(
    SHELL_PROFILE.map(([t, r]) => new THREE.Vector2(r * elbowRadius, start + t * (length - start))),
    sides,
  );
  shell.scale(1, 1, 0.84);
  if (high) {
    const fold = REPLICA_FINISH.hands.foldShade;
    const pos = shell.getAttribute('position');
    const colors = new Float32Array(pos.count * 3);
    for (let i = 0; i < pos.count; i++) colors.fill(1 - (1 - fold) * Math.max(0, -pos.getX(i) / elbowRadius) ** 2, i * 3, i * 3 + 3);
    shell.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  }
  sink.addGeometry('sleeve', place(shell));
  // The wrist collar: dark, where the glove's cuff would be.
  sink.addGeometry('glove', place(new THREE.CylinderGeometry(elbowRadius * 0.7, elbowRadius * 0.62, 0.03, sides).translate(0, start + 0.012, 0)));
  // The team panel round the upper forearm, as the armband.
  const bandAt = start + 0.62 * (length - start);
  const band = new THREE.CylinderGeometry(elbowRadius * 1.04, elbowRadius * 1.04, 0.05, sides, 1, true);
  band.scale(1, 1, 0.86);
  sink.addGeometry('armband', place(band.translate(0, bandAt, 0)));
  if (!high) return;
  for (const side of [-1, 1]) {
    const piston = new THREE.CylinderGeometry(0.005, 0.005, length * 0.5, 6);
    sink.addGeometry('metal', place(piston.translate(side * elbowRadius * 0.92, start + 0.32 * length, 0)));
  }
}
