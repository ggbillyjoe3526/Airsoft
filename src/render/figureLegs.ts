import * as THREE from 'three';
import { FIGURE_RIG } from '../config/figureRig';
import { type FigureLegClip, type FigureLegs, HITS } from '../config/hits';
import { LEG_CLIPS, LEG_POINT, LEG_POINTS, LEG_SAMPLE, LEG_SLOT } from '../sim/figureLegs';
import type { PoseClipTable } from './figurePose';

/**
 * Reads a rigged figure's legs out of its clips as it loads (IM8), for the hit volume (HitConfig.figureLegs,
 * sim/figureLegs.ts): each leg clip posed on its own, sample by sample at the clips' 30 frames a second, and each leg's
 * hip, knee and ankle joints and the ends of its boot's capsule written down in the figure's own frame (x right, y up
 * from the feet, z forward-negative). The boot's ends are found on the figure's own boots, standing, and ride on the
 * foot and toe bones from there. The idles are read at their first frame (they barely move), as the hit volume holds them.
 * A clip the file lacks (an optional one, render/figurePose.ts OPTIONAL_CLIPS) has no samples.
 */

/** The clips' frame rate (the Blender bake, tools/blender/bot-figure/scripts/bot11.py FPS). */
const FPS = 30;
/** Clips held at their first frame (their own clock is the figure's, not the simulation's). */
const HELD: ReadonlySet<number> = new Set([LEG_SLOT.Idle, LEG_SLOT.CrouchIdle]);
const SIDES = ['L', 'R'] as const;

/** What figureLegsFrom reads: a figure's bone tree, skin and leg clips (render/figureRig.ts prepareFigureRig's). */
export interface FigureLegSource {
  rig: THREE.Object3D;
  boneNames: readonly string[];
  boneInverses: readonly THREE.Matrix4[];
  bindMatrix: THREE.Matrix4;
  /** The body's geometries (the boots are found in them by their bones). */
  bodies: readonly THREE.BufferGeometry[];
  /** The legs' clips by slot (null: the legs stay at rest) and the slots' lengths and paces. */
  lower: readonly (THREE.AnimationClip | null)[];
  table: PoseClipTable;
}

export function figureLegsFrom(src: FigureLegSource): FigureLegs {
  const root = new THREE.Group();
  const model = new THREE.Group();
  model.rotation.y = FIGURE_RIG.yaw;
  root.add(model);
  const bones = src.rig.clone(true);
  model.add(bones);
  const byName = new Map<string, THREE.Bone>();
  bones.traverse((o) => {
    if (o instanceof THREE.Bone) byName.set(o.name, o);
  });
  const bone = (name: string): THREE.Bone => {
    const b = byName.get(name);
    if (!b) throw new Error(`the figure has no "${name}" bone`);
    return b;
  };
  const skeleton = new THREE.Skeleton(src.boneNames.map(bone), src.boneInverses as THREE.Matrix4[]);
  const meshes = src.bodies.map((g) => {
    const mesh = new THREE.SkinnedMesh(g);
    mesh.bind(skeleton, src.bindMatrix);
    bones.add(mesh);
    return mesh;
  });
  const legs = SIDES.map((sd) => ({ joints: ['Thigh', 'Shin', 'Foot'].map((b) => bone(`${b}_${sd}`)), foot: bone(`Foot_${sd}`), toe: bone(`Toe_${sd}`), heel: new THREE.Vector3(), tip: new THREE.Vector3() }));

  // Each clip on its own over the bones at rest (a clip leaves the bones it doesn't drive as they are).
  const rest = skeleton.bones.map((b) => ({ b, p: b.position.clone(), q: b.quaternion.clone(), s: b.scale.clone() }));
  const mixer = new THREE.AnimationMixer(bones);
  let action: THREE.AnimationAction | null = null;
  let played = -1;
  const poseAt = (slot: number, time: number): void => {
    if (slot !== played) {
      mixer.stopAllAction();
      for (const { b, p, q, s } of rest) {
        b.position.copy(p);
        b.quaternion.copy(q);
        b.scale.copy(s);
      }
      const clip = src.lower[slot] ?? null;
      action = clip ? mixer.clipAction(clip) : null;
      action?.play();
      played = slot;
    }
    if (action) action.time = time;
    mixer.update(0);
    root.updateMatrixWorld(true);
  };

  // The boots' capsules, found standing: each boot's vertices (mostly on the foot or toe bone), the capsule's axis a
  // radius in from its heel, toe and sole, kept on the foot bone (the heel) and the toe bone (the toe).
  poseAt(LEG_SLOT.Idle, 0);
  const r = HITS.legs.boot.radius;
  const v = new THREE.Vector3();
  const m = new THREE.Matrix4();
  legs.forEach((leg) => {
    const footIndex = src.boneNames.indexOf(leg.foot.name);
    const toeIndex = src.boneNames.indexOf(leg.toe.name);
    const box = new THREE.Box3();
    for (const mesh of meshes) {
      const skinIndex = mesh.geometry.getAttribute('skinIndex');
      const skinWeight = mesh.geometry.getAttribute('skinWeight');
      for (let i = 0; i < skinIndex.count; i++) {
        let w = 0;
        for (let k = 0; k < 4; k++) {
          const b = skinIndex.getComponent(i, k);
          if (b === footIndex || b === toeIndex) w += skinWeight.getComponent(i, k);
        }
        if (w > 0.5) box.expandByPoint(mesh.getVertexPosition(i, v).applyMatrix4(mesh.matrixWorld));
      }
    }
    if (box.isEmpty()) throw new Error(`the figure's ${leg.foot.name} carries no boot`);
    const x = (box.min.x + box.max.x) / 2;
    leg.heel.set(x, box.min.y + r, box.max.z - r).applyMatrix4(m.copy(leg.foot.matrixWorld).invert());
    leg.tip.set(x, box.min.y + r, box.min.z + r).applyMatrix4(m.copy(leg.toe.matrixWorld).invert());
  });

  const clips: FigureLegClip[] = LEG_CLIPS.map((_, slot) => {
    const info = src.table[slot];
    const seconds = info?.seconds ?? 0;
    const frames = seconds <= 0 ? 0 : HELD.has(slot) ? 1 : Math.max(1, Math.round(seconds * FPS)) + 1;
    const points = new Float32Array(frames * LEG_SAMPLE);
    for (let f = 0; f < frames; f++) {
      poseAt(slot, frames > 1 ? (seconds * f) / (frames - 1) : 0);
      legs.forEach((leg, side) => {
        const at = (point: number, p: THREE.Vector3): void => {
          p.toArray(points, f * LEG_SAMPLE + (side * LEG_POINTS + point) * 3);
        };
        leg.joints.forEach((j, k) => at(k === 0 ? LEG_POINT.hip : k === 1 ? LEG_POINT.knee : LEG_POINT.ankle, j.getWorldPosition(v)));
        at(LEG_POINT.heel, v.copy(leg.heel).applyMatrix4(leg.foot.matrixWorld));
        at(LEG_POINT.toe, v.copy(leg.tip).applyMatrix4(leg.toe.matrixWorld));
      });
    }
    return { seconds, stride: info?.speed ? info.speed * seconds : 0, frames, points };
  });

  mixer.stopAllAction();
  mixer.uncacheRoot(bones);
  skeleton.dispose();
  // Never drawn, so nothing reached the GPU: the meshes' default materials go with them (the geometry is the rig's).
  for (const mesh of meshes) (mesh.material as THREE.Material).dispose();
  return { clips };
}

/**
 * A match's legs for the hit volume from two figures' (the human's and the robot's, which share the rig and the leg
 * clips): `main`'s, each clip it lacks (an optional one, made with the figure redesign) taken from `spare`.
 */
export function legsWithSpares(main: FigureLegs, spare: FigureLegs): FigureLegs {
  return { clips: main.clips.map((clip, slot) => (clip.frames > 0 ? clip : (spare.clips[slot] ?? clip))) };
}
