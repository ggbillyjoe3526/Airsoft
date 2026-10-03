import * as THREE from 'three';
import { VIEWMODEL } from '../config/render';
import type { ReplicaConfig } from '../config/replicas';
import type { Armament } from '../sim/armament';
import { buildReplicaModels, type ReplicaModels } from './replicaModels';

const smooth = (t: number): number => {
  const c = Math.max(0, Math.min(1, t));
  return c * c * (3 - 2 * c);
};

/**
 * While the magazine is out: how far it has gone to fetch a fresh one (0 at the magwell, 1 out of view
 * and back) at reload progress `p` (0..1).
 */
export function magazineSwap(p: number): number {
  const R = VIEWMODEL.reload;
  if (p <= R.magOutEnd || p >= R.magInStart) return 0;
  return Math.sin((Math.PI * (p - R.magOutEnd)) / (R.magInStart - R.magOutEnd));
}

/** How far the magazine is out of the magwell (0 seated, 1 fully out) at reload progress `p` (0..1). */
export function magazineOut(p: number): number {
  const R = VIEWMODEL.reload;
  if (p < R.magOutEnd) return smooth(p / R.magOutEnd);
  if (p < R.magInStart) return 1;
  return 1 - smooth((p - R.magInStart) / (R.magSeated - R.magInStart));
}

const clampSway = (v: number): number => Math.max(-VIEWMODEL.swayMax, Math.min(VIEWMODEL.swayMax, v));

/**
 * The replica in your hands. Rendered in its own scene on top of the world (so it never clips into
 * walls) and animated purely from presentation state: mouse sway, walk bob, sprint carry, recoil
 * kick, reload dip, draw and raising a fitted optic to your eye. A fitted optic shows on the model and
 * folds the iron sights down.
 */
export class Viewmodel {
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  private readonly rig = new THREE.Group();
  private readonly replicas: ReplicaModels;
  /** Per loadout slot: the model, its magazine and support-hand parts (if any) and hold pose. */
  private readonly slots: {
    model: THREE.Group;
    mag: THREE.Object3D | undefined;
    hand: THREE.Object3D | undefined;
    hold: ReplicaConfig['look']['hold'];
    /** Where it sits aiming down a fitted optic (replicas with an optic mount). */
    aimHold: ReplicaConfig['look']['aimHold'];
    /** The optic part and the iron sights standing up / folded (replicas with an optic mount). */
    optic: THREE.Object3D | undefined;
    sightsUp: THREE.Object3D | undefined;
    sightsDown: THREE.Object3D | undefined;
  }[] = [];
  /** 0 = support hand on its grip, 1 = on the magazine (reloading). */
  private handBlend = 0;
  /** Loadout slot shown last frame: a newly drawn replica starts with its hand on the grip. */
  private shownSlot = -1;
  private swayX = 0;
  private swayY = 0;
  private kick = 0;
  private sprintBlend = 0;
  private bobPhase = 0;
  private lastYaw = 0;
  private lastPitch = 0;
  /** The view was set rather than turned (first frame, a new round's spawn yaw): no sway from that jump. */
  private snapView = true;
  private readonly muzzleView = new THREE.Vector3();
  /** 0 = playing, 1 = hand fully raised calling a hit. */
  private hitBlend = 0;

  constructor(aspect: number, teamColor: number, loadout: readonly ReplicaConfig[]) {
    this.camera = new THREE.PerspectiveCamera(VIEWMODEL.fov, aspect, VIEWMODEL.near, VIEWMODEL.far);
    // Soft sky fill, a warm key from above-right and a cool rim from behind to separate the silhouette.
    this.scene.add(new THREE.HemisphereLight(...VIEWMODEL.light.hemi));
    const key = new THREE.DirectionalLight(VIEWMODEL.light.keyColor, VIEWMODEL.light.keyIntensity);
    key.position.set(...VIEWMODEL.light.keyPosition);
    const rim = new THREE.DirectionalLight(VIEWMODEL.light.rimColor, VIEWMODEL.light.rimIntensity);
    rim.position.set(...VIEWMODEL.light.rimPosition);
    this.scene.add(key, rim, this.rig);

    this.replicas = buildReplicaModels(loadout, teamColor, VIEWMODEL.orangeTips);
    for (const r of loadout) {
      const model = this.replicas.models.get(r.id)!;
      model.position.set(...r.look.hold.position);
      model.rotation.y = r.look.hold.yaw;
      this.slots.push({
        model,
        mag: model.getObjectByName('magazine'),
        hand: model.getObjectByName('supportHand'),
        hold: r.look.hold,
        aimHold: r.look.aimHold,
        optic: model.getObjectByName('optic'),
        sightsUp: model.getObjectByName('sightsUp'),
        sightsDown: model.getObjectByName('sightsDown'),
      });
      model.visible = false;
      this.rig.add(model);
    }
    this.replicas.raisedHand.visible = false;
    this.scene.add(this.replicas.raisedHand);
  }

  setAspect(aspect: number): void {
    if (this.camera.aspect === aspect) return;
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
  }

  /** The view is about to be set, not turned (a new round): the next update takes it without swaying. */
  resetSway(): void {
    this.snapView = true;
  }

  /** You've been hit: the replica jolts in your hands before you lower it to call the hit. */
  onHit(): void {
    this.kick = VIEWMODEL.kickMax * VIEWMODEL.hitJolt;
  }

  /** A shot from the player's replica: kick back and up. */
  onShot(): void {
    this.kick = Math.min(VIEWMODEL.kickMax, this.kick + 1);
  }

  /**
   * Called once per frame. `speed` is the player's horizontal speed and `runSpeed` its normal (run) speed;
   * `carried` is true while sprinting or in the post-sprint lockout; `callingHit` lowers the replica
   * and raises your hand. `aim` is how far a fitted optic is raised to your eye (0..1).
   */
  update(
    dt: number,
    yaw: number,
    pitch: number,
    speed: number,
    runSpeed: number,
    carried: boolean,
    armament: Armament,
    loadout: readonly ReplicaConfig[],
    callingHit: boolean,
    aim: number,
  ): void {
    const replica = loadout[armament.active]!;
    for (let i = 0; i < this.slots.length; i++) {
      const s = this.slots[i]!;
      s.model.visible = i === armament.active;
      const fitted = armament.optics[i] != null;
      if (s.optic) s.optic.visible = fitted;
      if (s.sightsUp) s.sightsUp.visible = !fitted;
      if (s.sightsDown) s.sightsDown.visible = fitted;
    }
    const slot = this.slots[armament.active]!;
    // Raising the sight: the replica comes in from its hip hold to the aiming hold, square to the view.
    const raised = slot.aimHold ? smooth(aim) : 0;
    const h = slot.hold.position;
    const t = slot.aimHold ?? h;
    slot.model.position.set(h[0] + (t[0] - h[0]) * raised, h[1] + (t[1] - h[1]) * raised, h[2] + (t[2] - h[2]) * raised);
    const holdYaw = slot.hold.yaw * (1 - raised);
    // Steadier on the shoulder: sway and bob shrink while aiming, and the kick only nudges the sight (the dot stays in the glass).
    const motion = 1 - VIEWMODEL.aimSteady * raised;
    const kick = this.kick * (1 - (1 - VIEWMODEL.aimKick) * raised);

    // Sway: the replica lags behind the view a little, then springs back.
    if (this.snapView) {
      this.snapView = false;
      this.lastYaw = yaw;
      this.lastPitch = pitch;
      this.swayX = 0;
      this.swayY = 0;
    }
    let dYaw = yaw - this.lastYaw;
    if (dYaw > Math.PI) dYaw -= Math.PI * 2;
    else if (dYaw < -Math.PI) dYaw += Math.PI * 2;
    const dPitch = pitch - this.lastPitch;
    this.lastYaw = yaw;
    this.lastPitch = pitch;
    const settle = Math.exp(-VIEWMODEL.returnRate * dt);
    this.swayX = clampSway(this.swayX * settle + dYaw * VIEWMODEL.swayPerRadian * motion);
    this.swayY = clampSway(this.swayY * settle - dPitch * VIEWMODEL.swayPerRadian * motion);
    this.kick *= settle;

    const moving = Math.min(1, speed / runSpeed);
    this.bobPhase += dt * VIEWMODEL.bobFrequency * Math.PI * 2 * moving;
    this.sprintBlend += ((carried ? 1 : 0) - this.sprintBlend) * (1 - settle);

    const reloadP = armament.reload > 0 ? 1 - armament.reload / replica.reloadTime : 0;
    const reloadDip = Math.sin(Math.PI * reloadP);
    const R = VIEWMODEL.reload;
    slot.model.rotation.set(reloadDip * R.tilt, holdYaw + reloadDip * R.turn, reloadDip * R.roll);
    // Magazine swap: the support hand goes to the magazine, pulls it, stows it out of view, brings a
    // fresh one up and seats it, then returns to its grip once the reload is done.
    const reloading = armament.reload > 0;
    if (armament.active !== this.shownSlot) {
      this.shownSlot = armament.active;
      this.handBlend = 0;
    }
    this.handBlend = Math.max(0, Math.min(1, this.handBlend + (reloading ? dt : -dt) / R.handMoveTime));
    const magDistance = reloading ? magazineOut(reloadP) * R.magTravel + magazineSwap(reloadP) * R.swapTravel : 0;
    const magAxis = slot.mag?.userData.axis as THREE.Vector3 | undefined;
    if (slot.mag && magAxis) slot.mag.position.copy(magAxis).multiplyScalar(magDistance);
    for (const s of this.slots) if (s !== slot && s.hand) s.hand.position.set(0, 0, 0);
    if (slot.hand) {
      const grab = smooth(this.handBlend);
      slot.hand.position.copy(slot.hand.userData.toMag as THREE.Vector3).multiplyScalar(grab);
      if (magAxis) slot.hand.position.addScaledVector(magAxis, magDistance * grab);
    }
    const drawP = replica.drawTime > 0 ? armament.draw / replica.drawTime : 0;

    const bob = VIEWMODEL.bobAmount * moving * motion;
    this.hitBlend = Math.max(0, Math.min(1, this.hitBlend + (callingHit ? dt : -dt) / VIEWMODEL.raiseTime));
    const raise = smooth(this.hitBlend);
    const hand = this.replicas.raisedHand;
    hand.visible = this.hitBlend > 0;
    const [hx, hy, hz] = VIEWMODEL.raisedHand;
    hand.position.set(hx, hy - (1 - raise) * VIEWMODEL.raiseFrom, hz);

    this.rig.position.set(
      this.swayX + Math.cos(this.bobPhase) * bob - reloadDip * R.inward,
      this.swayY -
        Math.abs(Math.sin(this.bobPhase)) * bob +
        reloadDip * R.lift -
        drawP * VIEWMODEL.drawDrop -
        this.sprintBlend * VIEWMODEL.sprintDrop -
        raise * VIEWMODEL.hitDrop,
      kick * VIEWMODEL.kickBack,
    );
    this.rig.rotation.set(kick * VIEWMODEL.kickUp - drawP * VIEWMODEL.drawTilt, this.sprintBlend * VIEWMODEL.sprintTilt, 0);
  }

  /**
   * World position that appears on screen where the held replica's muzzle is drawn. The viewmodel has
   * its own camera and FOV, so the muzzle is projected to the screen with that camera and then placed
   * at the same distance along the main camera's ray through that screen point.
   */
  muzzleWorld(mainCamera: THREE.PerspectiveCamera, out: THREE.Vector3): boolean {
    let marker: THREE.Object3D | undefined;
    for (const s of this.slots) if (s.model.visible) marker = s.model.getObjectByName('muzzle');
    if (!marker) return false;
    this.rig.updateMatrixWorld(true);
    marker.getWorldPosition(this.muzzleView); // viewmodel camera sits at the origin, so this is camera space
    const distance = this.muzzleView.length();
    this.muzzleView.project(this.camera);
    out.set(this.muzzleView.x, this.muzzleView.y, 0.5).unproject(mainCamera);
    out.sub(mainCamera.position).normalize().multiplyScalar(distance).add(mainCamera.position);
    return true;
  }

  dispose(): void {
    this.replicas.dispose();
  }
}
