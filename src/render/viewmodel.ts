import * as THREE from 'three';
import { VIEWMODEL } from '../config/render';
import type { ReplicaConfig } from '../config/replicas';
import type { Armament } from '../sim/armament';
import { buildReplicaModels, type ReplicaModels } from './replicaModels';

const smooth = (t: number): number => {
  const c = Math.max(0, Math.min(1, t));
  return c * c * (3 - 2 * c);
};

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
 * kick, reload dip and draw.
 */
export class Viewmodel {
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  private readonly rig = new THREE.Group();
  private readonly replicas: ReplicaModels;
  /** Per loadout slot: the model, its magazine part (if any) and hold pose. */
  private readonly slots: { model: THREE.Group; mag: THREE.Object3D | undefined; hold: ReplicaConfig['look']['hold'] }[] = [];
  private swayX = 0;
  private swayY = 0;
  private kick = 0;
  private sprintBlend = 0;
  private bobPhase = 0;
  private lastYaw = 0;
  private lastPitch = 0;
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
      this.slots.push({ model, mag: model.getObjectByName('magazine'), hold: r.look.hold });
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

  /** A shot from the player's replica: kick back and up. */
  onShot(): void {
    this.kick = Math.min(VIEWMODEL.kickMax, this.kick + 1);
  }

  /**
   * Called once per frame. `speed` is the player's horizontal speed and `runSpeed` its walk speed;
   * `carried` is true while sprinting or in the post-sprint lockout; `callingHit` lowers the replica
   * and raises your hand.
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
  ): void {
    const replica = loadout[armament.active]!;
    for (let i = 0; i < this.slots.length; i++) this.slots[i]!.model.visible = i === armament.active;
    const slot = this.slots[armament.active]!;

    // Sway: the replica lags behind the view a little, then springs back.
    let dYaw = yaw - this.lastYaw;
    if (dYaw > Math.PI) dYaw -= Math.PI * 2;
    else if (dYaw < -Math.PI) dYaw += Math.PI * 2;
    const dPitch = pitch - this.lastPitch;
    this.lastYaw = yaw;
    this.lastPitch = pitch;
    const settle = Math.exp(-VIEWMODEL.returnRate * dt);
    this.swayX = clampSway(this.swayX * settle + dYaw * VIEWMODEL.swayPerRadian);
    this.swayY = clampSway(this.swayY * settle - dPitch * VIEWMODEL.swayPerRadian);
    this.kick *= settle;

    const moving = Math.min(1, speed / runSpeed);
    this.bobPhase += dt * VIEWMODEL.bobFrequency * Math.PI * 2 * moving;
    this.sprintBlend += ((carried ? 1 : 0) - this.sprintBlend) * (1 - settle);

    const reloadP = armament.reload > 0 ? 1 - armament.reload / replica.reloadTime : 0;
    const reloadDip = Math.sin(Math.PI * reloadP);
    const R = VIEWMODEL.reload;
    slot.model.rotation.set(reloadDip * R.tilt, slot.hold.yaw + reloadDip * R.turn, reloadDip * R.roll);
    if (slot.mag) {
      const out = armament.reload > 0 ? magazineOut(reloadP) : 0;
      slot.mag.position.copy(slot.mag.userData.axis as THREE.Vector3).multiplyScalar(out * R.magTravel);
    }
    const drawP = replica.drawTime > 0 ? armament.draw / replica.drawTime : 0;

    const bob = VIEWMODEL.bobAmount * moving;
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
      this.kick * VIEWMODEL.kickBack,
    );
    this.rig.rotation.set(this.kick * VIEWMODEL.kickUp - drawP * VIEWMODEL.drawTilt, this.sprintBlend * VIEWMODEL.sprintTilt, 0);
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
