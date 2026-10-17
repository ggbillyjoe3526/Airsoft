import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import type { DetailLevel } from '../config/render';
import { buildHand, type GeometrySink, type HandPose, handSkeleton, type V3 } from './handModels';
import { prepareReplicaFile, type ReplicaFile } from './replicaFiles';
import { FILE_HANDS, type ReplicaHandPoses } from './replicaModels';
import { buildRobotHand } from './robotHands';
import { modelScene } from './testSupport';

/**
 * The first-person hands on the replicas drawn from their model files (playtest Dev 6, note 28: the thumbs looked
 * unnatural and went into the replicas), measured against each file's own triangles: its body, moving parts and
 * magazine (and the fitted vertical grip for the hand on it). A hand part's vertex is inside when the file's winding
 * number round it is over a half (the file's pieces overlap: the magazine in its grip); how deep is its distance to the
 * nearest triangle.
 */

type Id = keyof typeof FILE_HANDS;
const IDS: readonly Id[] = ['aeg', 'pistol', 'cyber'];
const fileOf = async (id: Id): Promise<ReplicaFile> => prepareReplicaFile(id, await modelScene(`replicas/${id}.glb`), await modelScene(`replicaParts/${id}.glb`));
const FILES = new Map<Id, ReplicaFile>(await Promise.all(IDS.map(async (id) => [id, await fileOf(id)] as const)));

/** How far (m) a gloved hand part may go into the replica: a glove pressed on it. */
const GLOVE_INTO = 0.002;
/** The robot's: its knuckle pins stand proud of the finger's sides and its plates' corners past the glove's round. */
const ROBOT_INTO = 0.003;
/** How far (m) a part that holds the replica may stand off it. */
const HOLDS_WITHIN = 0.005;
/** Vertices further than this from the replica are outside it: no grip is thick enough to bury a part this deep. */
const NEAR = 0.012;

/** A replica's triangles, 9 numbers each. */
function trianglesOf(geometries: readonly THREE.BufferGeometry[]): Float32Array {
  const out: number[] = [];
  for (const g of geometries) {
    const pos = g.getAttribute('position');
    const count = g.index ? g.index.count : pos.count;
    for (let i = 0; i < count; i++) {
      const k = g.index ? g.index.getX(i) : i;
      out.push(pos.getX(k), pos.getY(k), pos.getZ(k));
    }
  }
  return new Float32Array(out);
}

const a = new THREE.Vector3();
const b = new THREE.Vector3();
const c = new THREE.Vector3();
const triangle = new THREE.Triangle();
const closest = new THREE.Vector3();

/** The generalised winding number of the triangles round `p`: 1 inside a closed shape, 0 outside. */
function winding(tris: Float32Array, p: THREE.Vector3): number {
  let sum = 0;
  for (let i = 0; i < tris.length; i += 9) {
    a.fromArray(tris, i).sub(p);
    b.fromArray(tris, i + 3).sub(p);
    c.fromArray(tris, i + 6).sub(p);
    const la = a.length();
    const lb = b.length();
    const lc = c.length();
    const det = a.x * (b.y * c.z - b.z * c.y) - a.y * (b.x * c.z - b.z * c.x) + a.z * (b.x * c.y - b.y * c.x);
    sum += 2 * Math.atan2(det, la * lb * lc + a.dot(b) * lc + b.dot(c) * la + c.dot(a) * lb);
  }
  return sum / (4 * Math.PI);
}

/** How a part sits on the replica: its deepest vertex inside (m, 0 when none is) and its nearest outside (m, NEAR at most). */
function fit(tris: Float32Array, geo: THREE.BufferGeometry): { depth: number; gap: number } {
  geo.computeBoundingBox();
  const box = geo.boundingBox!.clone().expandByScalar(NEAR);
  const tb = new THREE.Box3();
  const near: number[] = [];
  for (let i = 0; i < tris.length; i += 9) {
    tb.makeEmpty();
    for (let k = 0; k < 9; k += 3) tb.expandByPoint(a.fromArray(tris, i + k));
    if (tb.intersectsBox(box)) near.push(i);
  }
  const pos = geo.getAttribute('position');
  const p = new THREE.Vector3();
  let depth = 0;
  let gap = NEAR;
  for (let v = 0; v < pos.count; v++) {
    p.fromBufferAttribute(pos, v);
    let d2 = NEAR * NEAR;
    for (const i of near) {
      triangle.set(a.fromArray(tris, i), b.fromArray(tris, i + 3), c.fromArray(tris, i + 6)).closestPointToPoint(p, closest);
      d2 = Math.min(d2, closest.distanceToSquared(p));
    }
    const d = Math.sqrt(d2);
    if (d < NEAR && winding(tris, p) > 0.5) depth = Math.max(depth, d);
    else gap = Math.min(gap, d);
  }
  return { depth, gap };
}

type Build = (sink: GeometrySink, pose: HandPose, detail: DetailLevel) => V3;
/** Every part `build` makes for a hand in `pose`, in its order. */
function partsOf(build: Build, pose: HandPose, detail: DetailLevel): THREE.BufferGeometry[] {
  const parts: THREE.BufferGeometry[] = [];
  build({ addGeometry: (_key, geo) => parts.push(geo) }, pose, detail);
  return parts;
}
/** The gloved hand's parts (buildHand's order): the palm, the fingers' 12 segments (index first), the thenar pad, the thumb's 2. */
const PALM = 0;
const FINGERTIPS = [3, 6, 9, 12];
const THENAR = 13;
const THUMB = [14, 15];

/** Each hold of a file's replica: its pose and the triangles it holds. */
function holdsOf(id: Id): { hold: keyof ReplicaHandPoses; pose: HandPose; tris: Float32Array }[] {
  const file = FILES.get(id)!;
  const own = [...file.body, ...(file.rig?.pieces ?? []), ...file.magazine];
  const tris = trianglesOf(own.map((p) => p.geometry));
  const poses = FILE_HANDS[id];
  const grip = file.parts.get('grip:vertical') ?? [];
  return [
    { hold: 'grip' as const, pose: poses.grip, tris },
    { hold: 'support' as const, pose: poses.support, tris },
    ...(poses.verticalGrip ? [{ hold: 'verticalGrip' as const, pose: poses.verticalGrip, tris: trianglesOf([...own, ...grip].map((p) => p.geometry)) }] : []),
  ];
}
const HOLDS = new Map(IDS.map((id) => [id, holdsOf(id)] as const));

describe('the hands on the replica model files (playtest Dev 6, note 28)', () => {
  const styles: readonly [string, Build, DetailLevel, number][] = [
    ['gloved', buildHand, 'high', GLOVE_INTO],
    ['robot', buildRobotHand, 'low', ROBOT_INTO],
    ['robot', buildRobotHand, 'high', ROBOT_INTO],
  ];
  for (const id of IDS) {
    it(`go into the ${id} file's replica no more than a glove pressed on it, gloved or robot`, () => {
      for (const { hold, pose, tris } of HOLDS.get(id)!) {
        for (const [style, build, detail, into] of styles) {
          for (const [i, part] of partsOf(build, pose, detail).entries()) expect(fit(tris, part).depth, `${hold} ${style} ${detail} part ${i}`).toBeLessThanOrEqual(into);
        }
      }
    });
  }

  it('hold on: each palm, the firing hand\'s fingertips and every thumb against the replica, not off it', () => {
    for (const id of IDS) {
      for (const { hold, pose, tris } of HOLDS.get(id)!) {
        if (hold === 'verticalGrip') continue; // the built-in pose, measured against the built-in grip (handPoses.test.ts)
        const parts = partsOf(buildHand, pose, 'low');
        const holding = [PALM, ...THUMB, ...(hold === 'grip' ? FINGERTIPS.slice(1) : [])];
        for (const i of holding) expect(fit(tris, parts[i]!).gap, `${id} ${hold} part ${i}`).toBeLessThanOrEqual(HOLDS_WITHIN);
      }
    }
  });

  it("wrap the firing hand's thumb round the grip from the web behind it, to lie forward along the far (left) side", () => {
    for (const id of IDS) {
      const [first, tip] = handSkeleton(FILE_HANDS[id].grip).thumb;
      const along = tip!.to.clone().sub(tip!.from).normalize();
      // From behind the grip (its root on the bore's line, not on the right of the frame) round to the left of it.
      expect(Math.abs(first!.from.x), id).toBeLessThan(0.005);
      expect(first!.to.x, id).toBeLessThan(-0.025);
      expect(tip!.to.x, id).toBeLessThan(-0.025);
      expect(-along.z, id).toBeGreaterThan(0.9);
    }
  });

  it("lay a pistol's support thumb forward along the frame under the slide, and nothing of either thumb in the slide's path", () => {
    for (const id of ['pistol', 'cyber'] as const) {
      const file = FILES.get(id)!;
      const [, tip] = handSkeleton(FILE_HANDS[id].support).thumb;
      const along = tip!.to.clone().sub(tip!.from).normalize();
      expect(tip!.to.x, id).toBeLessThan(-0.02);
      expect(-along.z, id).toBeGreaterThan(0.95);
      // The slide runs back and forth along the bore: no thumb or thenar pad above its bottom within its width.
      const slideBone = file.rig!.bones.findIndex((bone) => bone.name === 'slide');
      const slide = new THREE.Box3();
      for (const p of file.rig!.pieces.filter((piece) => piece.bone === slideBone)) slide.union((p.geometry.computeBoundingBox(), p.geometry.boundingBox!));
      for (const pose of [FILE_HANDS[id].grip, FILE_HANDS[id].support]) {
        const parts = partsOf(buildHand, pose, 'low');
        for (const i of [THENAR, ...THUMB]) {
          const pos = parts[i]!.getAttribute('position');
          for (let v = 0; v < pos.count; v++) {
            if (Math.abs(pos.getX(v)) < slide.max.x) expect(pos.getY(v), `${id} ${pose.side} part ${i}`).toBeLessThan(slide.min.y);
          }
        }
      }
    }
  });

  it("lay the rifle's support thumb along the handguard's near side", () => {
    const [, tip] = handSkeleton(FILE_HANDS.aeg.support).thumb;
    expect(tip!.to.x).toBeLessThan(-0.029);
    expect(-tip!.to.clone().sub(tip!.from).normalize().z).toBeGreaterThan(0.9);
  });

  it("hold the firing hand's wrist low behind the grip, bent a little up from a forearm that runs back about level (MV2)", () => {
    const deg = (rad: number) => (rad * 180) / Math.PI;
    for (const id of IDS) {
      const { grip, gripElbow } = FILE_HANDS[id];
      const hand = handSkeleton(grip);
      // Pitch up from level, heel to fingers and elbow to wrist (three.js: +y up, -z ahead).
      const along = hand.wristA.clone().sub(hand.wristB).normalize();
      const elbow = new THREE.Vector3(gripElbow![0], gripElbow![1], -gripElbow![2]);
      const forearm = hand.wristB.clone().sub(elbow).normalize();
      const handPitch = deg(Math.asin(along.y));
      const armPitch = deg(Math.asin(forearm.y));
      expect(armPitch, id).toBeGreaterThanOrEqual(-1);
      expect(armPitch, id).toBeLessThan(6);
      // Playtest item 21: bent up, never down, and only slightly.
      expect(handPitch - armPitch, id).toBeGreaterThan(3);
      expect(handPitch - armPitch, id).toBeLessThan(12);
      // The wrist below the replica's bore line by most of the grip's top, not tucked up under the receiver.
      expect(hand.wristB.y, id).toBeLessThan(id === 'aeg' ? -0.08 : -0.05);
    }
  });
});
