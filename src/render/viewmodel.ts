import * as THREE from 'three';
import { FULL_MOTION, type MotionScale } from '../config/accessibility';
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

/**
 * How far the replica is still carried for a sprint (0..1) with `lockout` seconds of the post-sprint fire lockout
 * (`total`) left: it comes down over the lockout and is square to the view (0) a few ticks before firing unlocks, so
 * a shot straight out of a sprint leaves in line with the barrel.
 */
export function sprintCarry(lockout: number, total: number): number {
  if (!(total > 0) || lockout <= 0) return 0;
  const share = VIEWMODEL.carrySquareAt;
  return smooth((lockout / total - share) / (1 - share)); // eased, so the replica settles rather than stopping hard
}

const clampSway = (v: number, max: number): number => Math.max(-max, Math.min(max, v));

/** The parts a model can be fitted with: its objects named 'optic:<id>', 'grip:<id>' or 'magazine:<id>'. */
function fittableParts(model: THREE.Object3D): { kind: 'optic' | 'grip' | 'magazine'; id: string; object: THREE.Object3D }[] {
  const parts: { kind: 'optic' | 'grip' | 'magazine'; id: string; object: THREE.Object3D }[] = [];
  model.traverse((o) => {
    const [kind, id] = o.name.split(':');
    if (id && (kind === 'optic' || kind === 'grip' || kind === 'magazine')) parts.push({ kind, id, object: o });
  });
  return parts;
}

/**
 * The replica in your hands. Rendered in its own scene on top of the world (so it never clips into
 * walls) and animated purely from presentation state: mouse sway, walk bob, sprint carry, recoil
 * kick, reload dip, draw and raising a fitted optic to your eye. The fitted optic, grip and magazine show on the
 * model (simple shapes until the art pass), and an optic folds the iron sights down. Reduced motion (`setMotion`)
 * scales the bob, sway and kick down.
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
    /** The optics, grips and magazines it can be fitted with ('optic:<id>' …), each shown only while fitted. */
    parts: { kind: 'optic' | 'grip' | 'magazine'; id: string; object: THREE.Object3D }[];
    /** The fitted magazine's base plate against the standard one's (replicaModels.ts), where the support hand reaches. */
    magBase: THREE.Vector3 | undefined;
    /** The iron sights standing up / folded (replicas with an optic mount). */
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
  /** What's left of the bob, sway and kick (Settings → Accessibility → Reduced motion). */
  private motionScale: MotionScale = FULL_MOTION;

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
        parts: fittableParts(model),
        magBase: undefined,
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

  /**
   * The replica's sheen (M14): a soft environment reflected in its plastic at VIEWMODEL.sheenIntensity, or none (null).
   * The caller owns the texture.
   */
  setEnvironment(texture: THREE.Texture | null): void {
    this.scene.environment = texture;
    this.scene.environmentIntensity = VIEWMODEL.sheenIntensity;
  }

  /** Reduced motion on or off: how much of the bob, sway and kick to show. */
  setMotion(scale: MotionScale): void {
    this.motionScale = scale;
  }

  /**
   * Looking through a scope's eyepiece (M17b): the replica isn't drawn, as its own tube would fill the eyepiece; the
   * HUD draws the eyepiece and reticle.
   */
  setScoped(scoped: boolean): void {
    this.rig.visible = !scoped;
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
   * `carry` is how far the replica is carried for a sprint (1 while sprinting, falling to 0 over the post-sprint
   * lockout, so it is square to the view again the moment it can fire); `callingHit` lowers the replica
   * and raises your hand. `aim` is how far a fitted optic is raised to your eye (0..1).
   */
  update(
    dt: number,
    yaw: number,
    pitch: number,
    speed: number,
    runSpeed: number,
    carry: number,
    armament: Armament,
    callingHit: boolean,
    aim: number,
  ): void {
    for (let i = 0; i < this.slots.length; i++) {
      const s = this.slots[i]!;
      s.model.visible = i === armament.active;
      const optic = armament.optics[i] ?? null;
      const parts = armament.parts[i];
      for (const p of s.parts) {
        const fitted = p.kind === 'optic' ? optic : p.kind === 'grip' ? parts?.grip : parts?.magazine;
        p.object.visible = p.id === fitted;
        if (p.kind === 'magazine' && p.object.visible) s.magBase = p.object.userData.toBase as THREE.Vector3 | undefined;
      }
      const fitted = optic != null;
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
    const m = this.motionScale;
    const kick = this.kick * (1 - (1 - VIEWMODEL.aimKick) * raised) * m.kick;

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
    // Aimed, the sway is capped well inside the glass's radius, so even a hard flick keeps the dot in it.
    const sway = motion * m.sway;
    const swayMax = VIEWMODEL.swayMax * sway;
    this.swayX = clampSway(this.swayX * settle + dYaw * VIEWMODEL.swayPerRadian * sway, swayMax);
    this.swayY = clampSway(this.swayY * settle - dPitch * VIEWMODEL.swayPerRadian * sway, swayMax);
    this.kick *= settle;

    const moving = Math.min(1, speed / runSpeed);
    this.bobPhase += dt * VIEWMODEL.bobFrequency * Math.PI * 2 * moving;
    // Eases into the carry, but comes back no later than `carry` does: a shot fired straight out of a sprint leaves a
    // replica pointing straight ahead, in line with its BBs.
    this.sprintBlend = Math.min(carry, this.sprintBlend + (carry - this.sprintBlend) * (1 - settle));

    const handling = armament.handling[armament.active]!;
    const reloadP = armament.reload > 0 ? 1 - armament.reload / handling.reloadTime : 0;
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
      slot.hand.position.copy(slot.hand.userData.toMag as THREE.Vector3);
      if (slot.magBase) slot.hand.position.add(slot.magBase);
      slot.hand.position.multiplyScalar(grab);
      if (magAxis) slot.hand.position.addScaledVector(magAxis, magDistance * grab);
    }
    const drawP = handling.drawTime > 0 ? armament.draw / handling.drawTime : 0;

    const bob = VIEWMODEL.bobAmount * moving * motion * m.bob;
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
        raise * VIEWMODEL.hitDrop +
        kick * VIEWMODEL.kickLift,
      kick * VIEWMODEL.kickBack,
    );
    // No pitch from the kick: the barrel stays parallel to the view (see VIEWMODEL.kickLift).
    this.rig.rotation.set(-drawP * VIEWMODEL.drawTilt, this.sprintBlend * VIEWMODEL.sprintTilt, 0);
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
