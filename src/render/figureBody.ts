import * as THREE from 'three';
import { FIGURE_RIG } from '../config/figureRig';
import type { FigureBody, FigureHitPoint, FigureHitShape } from '../config/hits';
import { BODY_POINT, BODY_POINTS, BODY_SAMPLE } from '../sim/figureBody';
import { LEG_CLIPS, LEG_SLOT } from '../sim/figureLegs';
import { type PoseClipTable, POSE_SLOT } from './figurePose';

/**
 * Reads a rigged figure's upper body out of its clips as it loads (HV1), for the hit volume (HitConfig.figureBodies,
 * sim/figureBody.ts): each leg clip posed on its own, sample by sample at the legs' rate (render/figureLegs.ts), and
 * the figure's hit shape's points (config/figureRig.ts FIGURE_HIT_SHAPES) written down on their bones in the figure's
 * own frame. Twice: with the clip's own upper body, and under the aim's (the Rifle_Aim clip held upright over the
 * clip's pelvis, as RiggedFigure.adjustSpine holds it in play).
 */

/** The clips' frame rate (the Blender bake), as the legs are sampled. */
const FPS = 30;
/** Clips held at their first frame, as the legs hold them. */
const HELD: ReadonlySet<number> = new Set([LEG_SLOT.Idle, LEG_SLOT.CrouchIdle]);

/** What figureBodyFrom reads: a figure's bone tree, its clips split as render/figureRig.ts splits them, and its shape. */
export interface FigureBodySource {
  rig: THREE.Object3D;
  lower: readonly (THREE.AnimationClip | null)[];
  upper: readonly (THREE.AnimationClip | null)[];
  table: PoseClipTable;
  /** The still pelvis the aim clips were posed over (FigureRig.hipsUnderAim). */
  hipsUnderAim: THREE.Quaternion;
  shape: FigureHitShape;
}

/** The shape's points in BODY_POINT's order: each a bone point, moved `across` metres along the bone's own x. */
function shapePoints(s: FigureHitShape): { point: FigureHitPoint; across: number }[] {
  const out: { point: FigureHitPoint; across: number }[] = new Array(BODY_POINTS);
  const P = BODY_POINT;
  out[P.head] = { point: s.head.centre, across: 0 };
  out[P.chestBottomL] = { point: s.chest.bottom, across: -s.chest.halfWidth };
  out[P.chestTopL] = { point: s.chest.top, across: -s.chest.halfWidth };
  out[P.chestBottomR] = { point: s.chest.bottom, across: s.chest.halfWidth };
  out[P.chestTopR] = { point: s.chest.top, across: s.chest.halfWidth };
  out[P.shoulderL] = { point: s.shoulders.left, across: 0 };
  out[P.shoulderR] = { point: s.shoulders.right, across: 0 };
  out[P.hipBottomL] = { point: s.hips.bottom, across: -s.hips.halfWidth };
  out[P.hipTopL] = { point: s.hips.top, across: -s.hips.halfWidth };
  out[P.hipBottomR] = { point: s.hips.bottom, across: s.hips.halfWidth };
  out[P.hipTopR] = { point: s.hips.top, across: s.hips.halfWidth };
  return out;
}

export function figureBodyFrom(src: FigureBodySource): FigureBody {
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
  const hips = bone(FIGURE_RIG.bones.hips);
  const spine = bone(FIGURE_RIG.bones.spine);
  const points = shapePoints(src.shape).map(({ point, across }) => ({ bone: bone(point.bone), local: new THREE.Vector3(point.at[0] + across, point.at[1], point.at[2]) }));

  const rest = [...byName.values()].map((b) => ({ b, p: b.position.clone(), q: b.quaternion.clone(), s: b.scale.clone() }));
  const mixer = new THREE.AnimationMixer(bones);
  const aim = src.upper[POSE_SLOT.Rifle_Aim] ?? null;
  const q = new THREE.Quaternion();
  const poseAt = (slot: number, time: number, aimed: boolean): void => {
    mixer.stopAllAction();
    for (const { b, p, q: r, s } of rest) {
      b.position.copy(p);
      b.quaternion.copy(r);
      b.scale.copy(s);
    }
    const lower = src.lower[slot] ?? null;
    const upper = aimed ? aim : (src.upper[slot] ?? null);
    const actions = [lower, upper].filter((c): c is THREE.AnimationClip => c !== null).map((c) => mixer.clipAction(c));
    for (const a of actions) a.play();
    if (lower) mixer.clipAction(lower).time = time;
    if (upper && !aimed) mixer.clipAction(upper).time = time;
    mixer.update(0);
    // Held upright as the aim clip was posed, over this pelvis (RiggedFigure.adjustSpine with the overlay full).
    if (aimed) spine.quaternion.premultiply(q.copy(hips.quaternion).invert().multiply(src.hipsUnderAim));
    root.updateMatrixWorld(true);
  };

  const v = new THREE.Vector3();
  const clips = LEG_CLIPS.map((_, slot) => {
    const seconds = src.table[slot]?.seconds ?? 0;
    const frames = seconds <= 0 ? 0 : HELD.has(slot) ? 1 : Math.max(1, Math.round(seconds * FPS)) + 1;
    const sets = [false, true].map((aimed) => {
      const out = new Float32Array(frames * BODY_SAMPLE);
      for (let f = 0; f < frames; f++) {
        poseAt(slot, frames > 1 ? (seconds * f) / (frames - 1) : 0, aimed);
        points.forEach((p, k) => v.copy(p.local).applyMatrix4(p.bone.matrixWorld).toArray(out, f * BODY_SAMPLE + k * 3));
      }
      return out;
    });
    return { frames, whole: sets[0]!, aimed: sets[1]! };
  });

  mixer.stopAllAction();
  mixer.uncacheRoot(bones);
  return { shape: src.shape, clips };
}
