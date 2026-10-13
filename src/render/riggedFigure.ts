import * as THREE from 'three';
import type { ReplicaParts } from '../config/attachments';
import { FIGURE } from '../config/characters';
import { FIGURE_RIG } from '../config/figureRig';
import type { DetailLevel } from '../config/renderQuality';
import type { ReplicaConfig } from '../config/replicas';
import type { Character } from '../sim/character';
import { lerpAngle } from '../sim/vec';
import { PartBuilder } from './figureParts';
import { createFigurePose, createPoseState, type FigurePose, hasRest, type MagazineShow, magazinesAt, POSE_CLIPS, type PoseHold, type PoseInput, type PoseState, poseRestartCall, poseShot, releasedBetween, stepPose } from './figurePose';
import { addShape, type FigureReplicaColours, type FigureReplicaShape } from './figureReplicas';
import type { FigureMagazines, FigureRig } from './figureRig';
import type { ReplicaFiles } from './replicaFiles';
import type { ThrownMagazines } from './thrownMagazines';

/**
 * One rigged figure (BF1): a figure kind's bones cloned and its merged meshes skinned to them, at three levels of
 * detail, played by an AnimationMixer from render/figurePose.ts's weights. It holds its replica on the grip bone where
 * the sidecar puts it (the file's whole model near, its small figure version far), and in a reload shows the
 * magazines the sidecar times: the old one pulled out and thrown (render/thrownMagazines.ts), the fresh one drawn from
 * the pouch and seated. As your own first-person body it is drawn without its head and arms, a little behind the eyes.
 * Reads simulation state only; render/characterRenderer.ts places and fades it.
 */

/** What a rigged figure is built from. */
export interface RiggedFigureSetup {
  rig: FigureRig;
  /** The character it draws: its loadout picks the replica models (read again whenever they are built). */
  character: Character;
  /** The character's id: picks its looks (the human's pack and radio, the robot's head). */
  id: number;
  teamColour: number;
  /** The figure's own vertex-coloured material, which its replicas and magazines are drawn in (and fade with). */
  replicaMaterial: THREE.Material;
  /** Its rifle's and pistol's colours on a figure (render/figureMix.ts figureDress). */
  rifleColours: FigureReplicaColours;
  pistolColours: FigureReplicaColours;
  /** The replica model files (gear is always in when these figures are). */
  files: ReplicaFiles;
  detail: DetailLevel;
  /** The human's kit this figure carries (FIGURE.looks). */
  pack: boolean;
  radio: boolean;
  thrown: ThrownMagazines;
  calloutMaterial: THREE.SpriteMaterial;
}

/** What a frame of drawing needs beyond the character. */
export interface RiggedFrame {
  alpha: number;
  dt: number;
  /** Where the camera is (for the level of detail), and whether this is your own body seen from the eyes. */
  eyeX: number;
  eyeY: number;
  eyeZ: number;
  firstPerson: boolean;
  /** The upper body's lean (the flinch and the peek), radians about the figure's own X and Z (it faces -Z). */
  leanX: number;
  leanZ: number;
  /**
   * The peek's share of `leanZ` and the height above the feet it rolls about: the hit volume's upper body rolls about
   * the hips' pivot (sim/hitbox.ts, HITS.lean), lower than the model's spine joint, so the figure's does too (IM8).
   */
  peek: number;
  peekPivot: number;
  /** The simulation's walk cycle (cycles, interpolated) when the hit volume's legs follow the figures' (IM8), else null. */
  cycle: number | null;
  castShadow: boolean;
}

/** A replica in the fist and its magazines. */
interface Held {
  holder: THREE.Group;
  near: THREE.Mesh | null;
  far: THREE.Mesh | null;
  magazine: THREE.Mesh | null;
  /** The magazine in its bone's frame, for the copies on the hand and the thrown one. */
  handMagazine: THREE.BufferGeometry | null;
  fresh: THREE.Mesh | null;
  old: THREE.Mesh | null;
  /** The replica's own Reload clip's slide of the magazine, and that clip's length. */
  slide: THREE.Interpolant | null;
  slideSeconds: number;
  magazines: FigureMagazines | null;
  /** Geometries it made (freed with it). */
  made: THREE.BufferGeometry[];
}

const IDENTITY = new THREE.Matrix4();
const UP = new THREE.Vector3(0, 1, 0);
const q1 = new THREE.Quaternion();
const q2 = new THREE.Quaternion();
const q3 = new THREE.Quaternion();
const lean = new THREE.Quaternion();
const euler = new THREE.Euler();
const v1 = new THREE.Vector3();
const v2 = new THREE.Vector3();
const v3 = new THREE.Vector3();
const HOLDS: readonly PoseHold[] = ['rifle', 'pistol'];
const shown: MagazineShow = { fresh: false, old: false, replicaHidden: false };
/** A rough sphere round a figure in any pose (its arms up, a rifle out): the skinned meshes' frustum test, never recomputed. */
const BOUNDS = new THREE.Sphere(new THREE.Vector3(0, 0.95, 0), 1.45);

export class RiggedFigure {
  readonly root = new THREE.Group();
  readonly callout: THREE.Sprite;
  /** This figure's own copies of the kind's materials (they fade with it, and carry its team colour). */
  readonly materials: THREE.Material[];
  private readonly model = new THREE.Group();
  private readonly bones: THREE.Object3D;
  private readonly skeleton: THREE.Skeleton;
  private readonly mixer: THREE.AnimationMixer;
  private readonly lowerActions: (THREE.AnimationAction | null)[] = [];
  private readonly upperActions: (THREE.AnimationAction | null)[] = [];
  private readonly lods: THREE.SkinnedMesh[] = [];
  private firstPersonMesh: THREE.SkinnedMesh | null = null;
  private readonly hips: THREE.Object3D;
  private readonly spine: THREE.Object3D;
  /** The spine as the mixer last left it (it writes a bone only when its value changes, so the lean is undone first). */
  private readonly spineMixed = new THREE.Quaternion();
  /** The spine joint's place at rest (no clip moves it; the peek shifts it, IM8). */
  private readonly spineRest = new THREE.Vector3();
  private readonly arms: THREE.Object3D[];
  private readonly grip: THREE.Object3D;
  private readonly hand: THREE.Object3D;
  private held: Record<PoseHold, Held>;
  private readonly state: PoseState = createPoseState();
  private readonly pose: FigurePose = createFigurePose();
  private readonly input: PoseInput = {
    status: 'alive',
    statusTime: 0,
    forward: 0,
    side: 0,
    crouch: 0,
    sprinting: false,
    airborne: false,
    airTime: 0,
    pitch: 0,
    hold: 'rifle',
    reload: null,
    draw: null,
    firstPerson: false,
    rest: 0,
    cycle: null,
  };
  private readonly draw = { progress: 0, from: 'rifle' as PoseHold };
  private lastActive = -1;
  private drawFrom: PoseHold | null = null;
  private lastStatus: Character['status'] | null = null;
  private lastReloadAt = 0;
  private lod = 0;
  private firstPerson = false;
  private parts: readonly string[];
  private readonly detail: DetailLevel;
  private receiveShadows = false;
  /** Each material's authored colour and glow (the light scales and adds to them). */
  private readonly base: { color: THREE.Color; emissive: THREE.Color }[];

  constructor(private readonly setup: RiggedFigureSetup) {
    const { rig } = setup;
    this.detail = setup.detail;
    this.root.name = `riggedFigure:${rig.kind}`;
    this.model.rotation.y = FIGURE_RIG.yaw;
    this.root.add(this.model);
    this.bones = rig.rig.clone(true);
    this.model.add(this.bones);
    const byName = new Map<string, THREE.Bone>();
    this.bones.traverse((o) => {
      if (o instanceof THREE.Bone) byName.set(o.name, o);
    });
    const bone = (name: string): THREE.Bone => {
      const b = byName.get(name);
      if (!b) throw new Error(`the ${rig.kind} figure has no "${name}" bone`);
      return b;
    };
    this.skeleton = new THREE.Skeleton(rig.boneNames.map(bone), rig.boneInverses as THREE.Matrix4[]);
    this.hips = bone(FIGURE_RIG.bones.hips);
    this.spine = bone(FIGURE_RIG.bones.spine);
    this.spineMixed.copy(this.spine.quaternion);
    this.spineRest.copy(this.spine.position);
    this.arms = FIGURE_RIG.bones.arms.map(bone);
    this.grip = bone(FIGURE_RIG.bones.grip);
    this.hand = bone(FIGURE_RIG.bones.hand);

    // Its own materials, in its team's colour.
    const prefix = FIGURE_RIG.teamMaterialPrefix;
    this.materials = rig.materials.map((m) => {
      const c = m.clone();
      c.userData.authored = { opacity: c.opacity, transparent: c.transparent };
      if (c.name.toLowerCase().startsWith(prefix)) {
        const s = c as THREE.MeshStandardMaterial;
        if (s.color) s.color.setHex(setup.teamColour);
        if (s.emissive && (s.emissive.r > 0 || s.emissive.g > 0 || s.emissive.b > 0)) s.emissive.setHex(setup.teamColour);
      }
      return c;
    });
    this.base = this.materials.map((m) => {
      const s = m as THREE.MeshStandardMaterial;
      return { color: s.color?.clone() ?? new THREE.Color(1, 1, 1), emissive: s.emissive?.clone() ?? new THREE.Color(0, 0, 0) };
    });

    this.parts = this.partsFor(false);
    for (let lod = 0; lod < 3; lod++) this.lods.push(this.skinned(rig.geometry(lod, this.parts)));

    this.mixer = new THREE.AnimationMixer(this.bones);
    POSE_CLIPS.forEach((_, slot) => {
      this.lowerActions.push(this.action(rig.lower[slot] ?? null));
      this.upperActions.push(this.action(rig.upper[slot] ?? null));
    });

    this.held = { rifle: this.buildHeld('rifle'), pistol: this.buildHeld('pistol') };

    this.callout = new THREE.Sprite(setup.calloutMaterial);
    this.callout.scale.set(FIGURE.callout.width, FIGURE.callout.width * FIGURE.callout.aspect, 1);
    this.callout.position.y = FIGURE.callout.height;
    this.callout.visible = false;
    this.root.add(this.callout);
  }

  /** A shot left this figure's replica: its trigger finger presses. */
  shot(pistol: boolean): void {
    poseShot(this.state, pistol ? 'pistol' : 'rifle');
  }

  /**
   * The light on it this frame (G6 baked light, M33h torch beams): its materials' authored colours scaled by `shade`, and
   * `glow` added to their own glow (the uniforms they have: no new shader). The replica material is the caller's.
   */
  light(shadeR: number, shadeG: number, shadeB: number, glow: THREE.Color): void {
    for (let i = 0; i < this.materials.length; i++) {
      const m = this.materials[i] as THREE.MeshStandardMaterial;
      const base = this.base[i]!;
      if (m.color) m.color.setRGB(base.color.r * shadeR, base.color.g * shadeG, base.color.b * shadeB);
      if (m.emissive) m.emissive.copy(base.emissive).add(glow);
    }
  }

  /** Its meshes are shaded by walls and containers, or lit as if in full sun (QualitySettings.figureShadows). */
  setReceiveShadows(on: boolean): void {
    this.receiveShadows = on;
    this.root.traverse((o) => {
      if (o instanceof THREE.Mesh) o.receiveShadow = on;
    });
  }

  /** Poses the figure for `c` this frame. */
  update(c: Character, f: RiggedFrame): void {
    const a = f.alpha;
    const x = c.prevPosition.x + (c.position.x - c.prevPosition.x) * a;
    const y = c.prevPosition.y + (c.position.y - c.prevPosition.y) * a;
    const z = c.prevPosition.z + (c.position.z - c.prevPosition.z) * a;
    const yaw = lerpAngle(c.prevYaw, c.yaw, a);
    const sin = Math.sin(yaw);
    const cos = Math.cos(yaw);
    // Your own body sits a little behind the eyes, so the camera never looks out from inside the chest.
    const back = f.firstPerson ? FIGURE_RIG.firstPerson.back : 0;
    this.root.position.set(x + sin * back, y, z + cos * back);
    this.root.rotation.y = yaw;
    if (f.firstPerson !== this.firstPerson) this.setFirstPerson(f.firstPerson);

    const arm = c.armament;
    const active = arm.replicas[arm.active];
    const hold: PoseHold = active?.look.model === 'pistol' ? 'pistol' : 'rifle';
    if (arm.active !== this.lastActive) {
      const before = arm.replicas[this.lastActive];
      this.drawFrom = this.lastActive >= 0 && before && arm.draw > 0 ? (before.look.model === 'pistol' ? 'pistol' : 'rifle') : null;
      this.lastActive = arm.active;
    }
    if (arm.draw <= 0) this.drawFrom = null;
    if (c.status === 'calling' && this.lastStatus !== 'calling') poseRestartCall(this.state);
    this.lastStatus = c.status;

    const input = this.input;
    input.status = c.status;
    input.statusTime = c.statusTime;
    // The step in the figure's own frame: ahead is (-sin, -cos), its right (cos, -sin).
    input.forward = -c.velocity.x * sin - c.velocity.z * cos;
    input.side = c.velocity.x * cos - c.velocity.z * sin;
    input.crouch = c.prevCrouchAmount + (c.crouchAmount - c.prevCrouchAmount) * a;
    input.sprinting = c.sprinting;
    input.airborne = !c.grounded;
    input.airTime = c.airTime;
    // Resting on cover (M104): the Rest clips lean the aim in over it. A file without them leans by FIGURE_RIG.rest: the
    // aim posed `rest` higher and the spine leaned `rest` forward, so the bore stays on the shot. Not your own body.
    input.rest = f.firstPerson ? 0 : c.coverRest;
    const rest = hasRest(this.setup.rig.table, hold) ? 0 : input.rest * FIGURE_RIG.rest.lean;
    input.pitch = c.prevPitch + (c.pitch - c.prevPitch) * a + rest;
    input.hold = hold;
    const handling = arm.handling[arm.active];
    input.reload = arm.reload > 0 && handling && handling.reloadTime > 0 ? 1 - arm.reload / handling.reloadTime : null;
    // Out of the holster the draw takes longer (M92, Armament.drawTotal). No holstered pose yet: KNOWN_ISSUES.
    const drawTotal = arm.drawTotal > 0 ? arm.drawTotal : (handling?.drawTime ?? 0);
    if (this.drawFrom && drawTotal > 0) {
      this.draw.progress = 1 - arm.draw / drawTotal;
      this.draw.from = this.drawFrom;
      input.draw = this.draw;
    } else input.draw = null;
    input.firstPerson = f.firstPerson;
    input.cycle = f.cycle;
    const pose = stepPose(this.state, input, f.dt, this.setup.rig.table, this.pose);

    for (let i = 0; i < POSE_CLIPS.length; i++) {
      const lower = this.lowerActions[i];
      if (lower) {
        lower.setEffectiveWeight(pose.lower[i]!);
        lower.time = pose.time[i]!;
      }
      const upper = this.upperActions[i];
      if (upper) {
        upper.setEffectiveWeight(pose.upper[i]!);
        upper.time = pose.time[i]!;
      }
    }
    this.spine.quaternion.copy(this.spineMixed);
    this.mixer.update(0);
    this.spineMixed.copy(this.spine.quaternion);
    const twist = pose.rifleAim * this.setup.rig.aimYaw.rifle + pose.pistolAim * this.setup.rig.aimYaw.pistol;
    this.adjustSpine(pose.overlay, f.leanX + pose.pitchLean - rest, f.leanZ, twist);
    this.peekAbout(f.peek, f.peekPivot);
    if (f.firstPerson) for (const b of this.arms) b.scale.setScalar(FIGURE_RIG.firstPerson.armScale);

    // The level of detail by distance (a metre of give, so it doesn't flicker on the line).
    const dist = Math.hypot(x - f.eyeX, y + 1 - f.eyeY, z - f.eyeZ);
    const lod = FIGURE_RIG.lod[this.detail];
    const want = dist > lod[1] ? 2 : dist > lod[0] ? 1 : 0;
    if (want !== this.lod && Math.abs(dist - lod[Math.min(want, this.lod)]!) > 0.5) this.lod = want;
    for (let i = 0; i < 3; i++) {
      const m = this.lods[i]!;
      m.visible = !f.firstPerson && i === this.lod;
      m.castShadow = f.castShadow;
    }
    // Your own body casts no shadow (as before it was drawn: a headless, armless one would look wrong).
    if (this.firstPersonMesh) this.firstPersonMesh.visible = f.firstPerson;
    this.updateHeld(c, pose, dist, f, y, yaw);
  }

  dispose(): void {
    for (const h of Object.values(this.held)) this.freeHeld(h);
    this.mixer.stopAllAction();
    this.mixer.uncacheRoot(this.bones);
    for (const m of this.materials) m.dispose();
    this.skeleton.dispose();
    this.root.removeFromParent();
  }

  /** The parts this figure wears (its looks), with or without the head. */
  private partsFor(firstPerson: boolean): readonly string[] {
    const { rig } = this.setup;
    const roles = FIGURE_RIG.parts[rig.kind] as { body: readonly string[]; head: readonly string[]; pack?: string; radio?: string };
    const heads = roles.head.filter((h) => rig.parts.includes(h));
    const head = heads[Math.abs(Math.floor(this.setup.id)) % Math.max(1, heads.length)];
    return [
      ...roles.body,
      ...(firstPerson || !head ? [] : [head]),
      ...(roles.pack && this.setup.pack && rig.parts.includes(roles.pack) ? [roles.pack] : []),
      ...(roles.radio && this.setup.radio && rig.parts.includes(roles.radio) ? [roles.radio] : []),
    ];
  }

  /** A mesh of `geometry` skinned to this figure's bones, in its materials. */
  private skinned(geometry: THREE.BufferGeometry): THREE.SkinnedMesh {
    const mesh = new THREE.SkinnedMesh(geometry, this.materials);
    mesh.bind(this.skeleton, this.setup.rig.bindMatrix);
    mesh.boundingSphere = BOUNDS.clone();
    mesh.castShadow = false;
    mesh.receiveShadow = this.receiveShadows;
    mesh.userData.sharedGeometry = true;
    mesh.visible = false;
    this.bones.add(mesh);
    return mesh;
  }

  private action(clip: THREE.AnimationClip | null): THREE.AnimationAction | null {
    if (!clip) return null;
    const action = this.mixer.clipAction(clip);
    action.setEffectiveWeight(0);
    action.play();
    return action;
  }

  /** Switches your own first-person body on or off: no head (its own merged mesh, made once) and no arms. */
  private setFirstPerson(on: boolean): void {
    this.firstPerson = on;
    if (on && !this.firstPersonMesh) this.firstPersonMesh = this.skinned(this.setup.rig.geometry(0, this.partsFor(true)));
    if (!on) for (const b of this.arms) b.scale.set(1, 1, 1);
  }

  /**
   * The upper body after the mixer: held upright as its clips were posed (they were made over a still pelvis, so a
   * bobbing or crouched pelvis doesn't tip the aim), twisted by `twist` (radians about the model's up) so the bore points
   * ahead, then leaned (the flinch, the peek and the aim's pitch past the clips) about the figure's own axes: a peek
   * rolls the twisted upper body as a whole (IM8), as the hit volume rolls, and a level bore stays on the shot.
   */
  private adjustSpine(overlay: number, leanX: number, leanZ: number, twist: number): void {
    const { rig } = this.setup;
    const hips = this.hips.quaternion;
    if (overlay > 1e-3) {
      q1.copy(hips).invert().multiply(rig.hipsUnderAim);
      q2.identity().slerp(q1, overlay);
      this.spine.quaternion.premultiply(q2);
    }
    if (leanX !== 0 || leanZ !== 0 || twist !== 0) {
      // The model faces +Z (turned half round in the figure): the figure's X and Z lean are its -X and -Z.
      // Euler 'ZXY': the twist first, then the pitch, then the roll.
      lean.setFromEuler(euler.set(-leanX, twist, -leanZ, 'ZXY'));
      q3.copy(rig.aboveHips).multiply(hips);
      q1.copy(q3).invert().multiply(lean).multiply(q3);
      this.spine.quaternion.premultiply(q1);
    }
  }

  /**
   * The peek rolls the upper body about the hit volume's pivot (`pivot` metres above the feet, on the figure's axis), as
   * the volume's does, not about the model's spine joint above it: the spine joint goes where that roll takes it.
   */
  private peekAbout(peek: number, pivot: number): void {
    const spine = this.spine;
    spine.position.copy(this.spineRest);
    if (peek === 0) return;
    const parent = spine.parent!;
    parent.updateWorldMatrix(true, false);
    v1.copy(spine.position).applyMatrix4(parent.matrixWorld);
    v2.set(0, pivot, 0).applyMatrix4(this.root.matrixWorld);
    v3.set(0, 0, 1).transformDirection(this.root.matrixWorld);
    q1.setFromAxisAngle(v3, peek);
    // Where the joint goes (the pivot plus the roll of the joint's offset from it), less where it is: in the parent's frame.
    v3.copy(v1).sub(v2).applyQuaternion(q1).add(v2).sub(v1);
    parent.getWorldQuaternion(q1).invert();
    spine.position.add(v3.applyQuaternion(q1));
  }

  /** The replica held as `hold`, built on the grip bone with its magazines on the hand. */
  private buildHeld(hold: PoseHold): Held {
    const s = this.setup;
    const holder = new THREE.Group();
    holder.name = `held:${hold}`;
    holder.matrixAutoUpdate = false;
    holder.matrix.copy(s.rig.replicaOnGrip[hold]);
    holder.visible = false;
    this.grip.add(holder);
    const held: Held = { holder, near: null, far: null, magazine: null, handMagazine: null, fresh: null, old: null, slide: null, slideSeconds: 0, magazines: s.rig.magazines[hold], made: [] };
    const slot = this.slotOf(hold);
    const replica = slot >= 0 ? this.replicaAt(slot) : undefined;
    const file = replica ? s.files.get(replica.id) : undefined;
    if (!file) return held;
    const parts = this.partsOf(slot);
    const colours = hold === 'pistol' ? s.pistolColours : s.rifleColours;
    const detail = FIGURE.detail[s.detail];
    const make = (shapes: readonly FigureReplicaShape[], frame: THREE.Matrix4 = IDENTITY): THREE.Mesh | null => {
      const b = new PartBuilder(detail);
      let any = false;
      for (const shape of shapes) {
        if (shape.length === 0) continue;
        addShape(b, frame, colours, shape);
        any = true;
      }
      if (!any) return null;
      const mesh = b.build(s.replicaMaterial);
      held.made.push(mesh.geometry);
      return mesh;
    };
    // Near: the whole model (its moving parts at rest), the fitted muzzle device or the bare flash hider, a fitted torch.
    const muzzle = parts?.muzzle ? file.parts.get(`muzzle:${parts.muzzle}`) : undefined;
    const light = parts?.light ? file.parts.get(`light:${parts.light}`) : undefined;
    const magazinePart = parts?.magazine ? file.parts.get(`magazine:${parts.magazine}`) : undefined;
    held.near = make([file.body, file.rig?.pieces ?? [], muzzle ?? file.flashHider, light ?? []]);
    held.far = make([file.figureHeld]);
    const magazine = magazinePart ?? file.magazine;
    held.magazine = make([magazine]);
    for (const m of [held.near, held.far, held.magazine]) if (m) holder.add(m);
    // The magazine in its bone's frame, as the sidecar places it on the hand.
    if (held.magazines && file.magazineFrame && magazine.length > 0) {
      const toBone = file.magazineFrame.clone().invert();
      const copy = make([magazine], toBone);
      if (copy) {
        held.handMagazine = copy.geometry;
        copy.matrixAutoUpdate = false;
        copy.matrix.copy(held.magazines.fresh);
        held.fresh = copy;
        const old = new THREE.Mesh(copy.geometry, s.replicaMaterial);
        old.castShadow = true;
        old.matrixAutoUpdate = false;
        old.matrix.copy(held.magazines.old);
        held.old = old;
        for (const m of [held.fresh, held.old]) {
          m.visible = false;
          this.hand.add(m);
        }
      }
    }
    const slide = file.rig?.magazine.get('Reload');
    if (slide && slide.times.length > 0) {
      held.slide = slide.InterpolantFactoryMethodLinear(new Float32Array(3));
      held.slideSeconds = file.rig?.clips.get('Reload')?.duration ?? slide.times[slide.times.length - 1]!;
    }
    return held;
  }

  /** The loadout slot of the character's first replica of kind `hold`, or -1. */
  private slotOf(hold: PoseHold): number {
    return this.replicas().findIndex((r) => (r.look.model === 'pistol') === (hold === 'pistol'));
  }

  private replicas(): readonly ReplicaConfig[] {
    return this.setup.character.armament.replicas;
  }

  private replicaAt(slot: number): ReplicaConfig | undefined {
    return this.replicas()[slot];
  }

  private partsOf(slot: number): ReplicaParts | undefined {
    return this.setup.character.armament.parts[slot];
  }

  private freeHeld(h: Held): void {
    this.setup.thrown.forget(h.handMagazine, null);
    h.holder.removeFromParent();
    h.fresh?.removeFromParent();
    h.old?.removeFromParent();
    for (const g of h.made) g.dispose();
    h.made.length = 0;
  }

  /** The replica in the fist this frame, near or far, and the reload's magazines (one thrown as it is let go). */
  private updateHeld(c: Character, pose: FigurePose, dist: number, f: RiggedFrame, y: number, yaw: number): void {
    const reloading = pose.reload > 0.5;
    for (const hold of HOLDS) {
      const h = this.held[hold];
      const on = !f.firstPerson && hold === pose.hold;
      h.holder.visible = on;
      const mine = on && reloading && pose.reloadHold === hold && h.magazines !== null;
      const near = !h.far || mine || dist <= FIGURE_RIG.fullReplica[this.detail];
      if (h.near) h.near.visible = near;
      if (h.far) h.far.visible = !near;
      if (h.near) h.near.castShadow = f.castShadow;
      if (h.far) h.far.castShadow = f.castShadow;
      if (mine) {
        const times = h.magazines!.times;
        const u = pose.reloadAt;
        magazinesAt(times, u, shown);
        if (h.fresh) h.fresh.visible = shown.fresh;
        if (h.old) h.old.visible = shown.old;
        if (h.magazine) {
          h.magazine.visible = near && !shown.replicaHidden;
          if (h.slide) h.magazine.position.fromArray(h.slide.evaluate(u * h.slideSeconds));
        }
        if (h.old && h.handMagazine && releasedBetween(times, this.lastReloadAt, u)) this.throwOld(c, h, y, yaw, f.castShadow);
        this.lastReloadAt = u;
      } else {
        if (h.fresh) h.fresh.visible = false;
        if (h.old) h.old.visible = false;
        if (h.magazine) {
          h.magazine.visible = near;
          h.magazine.position.set(0, 0, 0);
        }
        if (hold === pose.hold) this.lastReloadAt = 0;
      }
    }
  }

  /** Lets go of the old magazine where the hand holds it now, with the sidecar's throw on top of the figure's own move. */
  private throwOld(c: Character, h: Held, groundY: number, yaw: number, castShadow: boolean): void {
    const m = h.magazines!;
    h.old!.updateWorldMatrix(true, false);
    q1.setFromAxisAngle(UP, yaw + FIGURE_RIG.yaw);
    v1.copy(m.velocity).applyQuaternion(q1);
    v1.x += c.velocity.x;
    v1.z += c.velocity.z;
    v2.copy(m.spin).applyQuaternion(q1);
    this.setup.thrown.throw(h.handMagazine!, this.setup.replicaMaterial, h.old!.matrixWorld, v1, v2, m.gravity, groundY, m.lifetime, castShadow);
  }
}
