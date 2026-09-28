import * as THREE from 'three';
import { VIEWMODEL } from '../config/render';
import type { ReplicaConfig } from '../config/replicas';
import type { Armament } from '../sim/armament';
import { buildReplicaModels, type ReplicaModels } from './replicaModels';

const clampSway = (v: number): number => Math.max(-VIEWMODEL.swayMax, Math.min(VIEWMODEL.swayMax, v));

/** Where each replica sits in view (camera space, metres) and how much it's canted inward (radians). */
const HOLD: Record<string, { position: [number, number, number]; yaw: number }> = {
  aeg: { position: [0.16, -0.17, -0.48], yaw: 0.14 },
  pistol: { position: [0.075, -0.07, -0.36], yaw: 0.12 },
};

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
  private swayX = 0;
  private swayY = 0;
  private kick = 0;
  private sprintBlend = 0;
  private bobPhase = 0;
  private lastYaw = 0;
  private lastPitch = 0;
  private readonly muzzleView = new THREE.Vector3();

  constructor(aspect: number, teamColor: number) {
    this.camera = new THREE.PerspectiveCamera(VIEWMODEL.fov, aspect, 0.01, 5);
    // Soft sky fill, a warm key from above-right and a cool rim from behind to separate the silhouette.
    this.scene.add(new THREE.HemisphereLight(0xe8f0ff, 0x4a4438, 1.3));
    const key = new THREE.DirectionalLight(0xfff0d8, 2.2);
    key.position.set(0.6, 1, 0.4);
    const rim = new THREE.DirectionalLight(0xcfe0ff, 1.2);
    rim.position.set(-0.8, 0.4, -1);
    this.scene.add(key, rim, this.rig);

    this.replicas = buildReplicaModels(teamColor, VIEWMODEL.orangeTips);
    for (const [id, model] of this.replicas.models) {
      const hold = HOLD[id];
      if (hold) {
        model.position.set(...hold.position);
        model.rotation.y = hold.yaw;
      }
      model.visible = false;
      this.rig.add(model);
    }
  }

  setAspect(aspect: number): void {
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
  }

  /** A shot from the player's replica: kick back and up. */
  onShot(): void {
    this.kick = Math.min(1.5, this.kick + 1);
  }

  /**
   * Called once per frame. `speed` is the player's horizontal speed and `walkSpeed` its walk speed;
   * `carried` is true while sprinting or in the post-sprint lockout.
   */
  update(
    dt: number,
    yaw: number,
    pitch: number,
    speed: number,
    walkSpeed: number,
    carried: boolean,
    armament: Armament,
    loadout: readonly ReplicaConfig[],
  ): void {
    const replica = loadout[armament.active]!;
    for (const [id, m] of this.replicas.models) m.visible = id === replica.id;

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

    const moving = Math.min(1, speed / walkSpeed);
    this.bobPhase += dt * VIEWMODEL.bobFrequency * Math.PI * 2 * moving;
    this.sprintBlend += ((carried ? 1 : 0) - this.sprintBlend) * (1 - settle);

    const reloadP = armament.reload > 0 ? 1 - armament.reload / replica.reloadTime : 0;
    const reloadDip = Math.sin(Math.PI * reloadP);
    const drawP = replica.drawTime > 0 ? armament.draw / replica.drawTime : 0;

    const bob = VIEWMODEL.bobAmount * moving;
    this.rig.position.set(
      this.swayX + Math.cos(this.bobPhase) * bob,
      this.swayY -
        Math.abs(Math.sin(this.bobPhase)) * bob -
        reloadDip * VIEWMODEL.reloadDrop -
        drawP * VIEWMODEL.drawDrop -
        this.sprintBlend * VIEWMODEL.sprintDrop,
      this.kick * VIEWMODEL.kickBack,
    );
    this.rig.rotation.set(
      this.kick * VIEWMODEL.kickUp - reloadDip * 0.35 - drawP * 0.6,
      this.sprintBlend * VIEWMODEL.sprintTilt,
      -reloadDip * 0.4,
    );
  }

  /**
   * World position that appears on screen where the held replica's muzzle is drawn. The viewmodel has
   * its own camera and FOV, so the muzzle is projected to the screen with that camera and then placed
   * at the same distance along the main camera's ray through that screen point.
   */
  muzzleWorld(mainCamera: THREE.PerspectiveCamera, out: THREE.Vector3): boolean {
    let marker: THREE.Object3D | undefined;
    for (const m of this.replicas.models.values()) if (m.visible) marker = m.getObjectByName('muzzle');
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
