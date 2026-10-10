import * as THREE from 'three';
import { FULL_MOTION, type MotionScale } from '../config/accessibility';
import { type InspectCue, type InspectKey, type InspectPose, LIGHTING_PRESETS, type LightingPreset, VIEWMODEL } from '../config/render';
import type { FireMode, ReplicaConfig } from '../config/replicas';
import type { ReplicaPaint } from '../config/schemes';
import type { Armament } from '../sim/armament';
import { type ArmStyle, buildReplicaModels, fitMuzzle, fitSupportHand, HUMAN_ARMS, LOW_DETAIL, type MagazinePart, type MuzzleMount, type ReplicaDetail, type ReplicaModels, type SupportHandPart } from './replicaModels';
import { NO_REPLICA_FILES, type ReplicaFiles } from './replicaFiles';
import type { ReplicaRig } from './replicaRig';

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

/** An inspect's pose at one moment (VIEWMODEL.inspect): InspectKey without its `at`. */
export type InspectOffset = Omit<InspectKey, 'at'>;

/** A pose at rest: nothing added to the hold. */
export const NO_INSPECT: Readonly<InspectOffset> = { tilt: 0, turn: 0, roll: 0, lift: 0, inward: 0, back: 0 };

/**
 * The pose `keys` give `share` (0..1) of the way through an inspect, eased between the keys around it and scaled by
 * `weight` (an inspect cut short eases back to the hold), into `out`.
 */
export function inspectPose(keys: readonly InspectKey[], share: number, weight: number, out: InspectOffset): InspectOffset {
  let i = 0;
  while (i < keys.length - 2 && share > keys[i + 1]!.at) i++;
  const a = keys[i];
  const b = keys[i + 1] ?? a;
  if (!a || !b) return Object.assign(out, NO_INSPECT);
  const f = b.at > a.at ? smooth((share - a.at) / (b.at - a.at)) : 1;
  out.tilt = (a.tilt + (b.tilt - a.tilt) * f) * weight;
  out.turn = (a.turn + (b.turn - a.turn) * f) * weight;
  out.roll = (a.roll + (b.roll - a.roll) * f) * weight;
  out.lift = (a.lift + (b.lift - a.lift) * f) * weight;
  out.inward = (a.inward + (b.inward - a.inward) * f) * weight;
  out.back = (a.back + (b.back - a.back) * f) * weight;
  return out;
}

type PartKind = 'optic' | 'grip' | 'magazine' | 'laser' | 'barrel' | 'muzzle' | 'light';
const PART_KINDS: readonly string[] = ['optic', 'grip', 'magazine', 'laser', 'barrel', 'muzzle', 'light'];

/**
 * The parts a model can be fitted with: its objects named 'optic:<id>', 'grip:<id>', 'magazine:<id>', 'laser:<id>',
 * 'barrel:<id>', 'muzzle:<id>' ('muzzle:none' is the bare muzzle's own device, shown with nothing fitted) or
 * 'light:<id>' (a weapon torch, M33h).
 */
function fittableParts(model: THREE.Object3D): { kind: PartKind; id: string; object: THREE.Object3D }[] {
  const parts: { kind: PartKind; id: string; object: THREE.Object3D }[] = [];
  model.traverse((o) => {
    const [kind, id] = o.name.split(':');
    if (id && kind && PART_KINDS.includes(kind)) parts.push({ kind: kind as PartKind, id, object: o });
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
  private replicas: ReplicaModels;
  /** Per loadout slot: the model, its magazine, support-hand and muzzle parts and hold pose. */
  private readonly slots: {
    model: THREE.Group;
    mag: MagazinePart;
    hand: SupportHandPart;
    muzzle: THREE.Object3D;
    hold: ReplicaConfig['look']['hold'];
    /** Where it sits aiming down a fitted optic (replicas with an optic mount). */
    aimHold: ReplicaConfig['look']['aimHold'];
    /** The optics, grips and magazines it can be fitted with ('optic:<id>' …), each shown only while fitted. */
    parts: { kind: PartKind; id: string; object: THREE.Object3D }[];
    /** The muzzle mount, moved to the fitted barrel's and device's end (M29b). */
    mount: MuzzleMount;
    /** The fitted magazine's base plate against the standard one's (replicaModels.ts), where the support hand reaches. */
    magBase: THREE.Vector3 | undefined;
    /** The iron sights standing up / folded (replicas with an optic mount). */
    sightsUp: THREE.Object3D | undefined;
    sightsDown: THREE.Object3D | undefined;
    /** Its moving parts, from its model file (RM1), and how far into each animation they are (s; -1: not yet posed). */
    parts3d: ReplicaRig | null;
    fire: number;
    selector: number;
    sights: number;
    /** How it is inspected (VIEWMODEL.inspect.poses by its first-person model), how long that takes, and its id. */
    inspect: InspectPose;
    inspectTime: number;
    id: string;
  }[] = [];
  /** The Inspect key was pressed (RM2): an inspect starts at the next update if nothing else is under way. */
  private inspectAsked = false;
  /** A hit since the last update: an inspect under way ends (a shot ends it at once, dropInspect). */
  private inspectCut = false;
  /** Seconds into the inspect under way (-1: none), and the slot inspected. */
  private inspectT = -1;
  private inspectSlot = -1;
  /** How far through the inspect the pose is (0..1): held where it was when an inspect is cut short. */
  private inspectShare = 0;
  /** How much of the inspect's pose is shown: 1 while it runs, easing to 0 over cancelTime once it is cut short. */
  private inspectWeight = 0;
  /** The inspect's sounds played so far. */
  private inspectSounds = 0;
  private readonly inspectOffset: InspectOffset = { ...NO_INSPECT };
  private readonly magazineSlide = new THREE.Vector3();
  /** Plays a sound of the parts through an inspect (the presentation wires it to the audio; null: silent). */
  onInspectSound: ((cue: InspectCue, replicaId: string) => void) | null = null;
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
  /** The fitted laser's beam is drawn (QualitySettings.laserBeam, FA8). */
  private beamOn = false;
  /** The laser beams, one per replica with a laser rail (found by name after each build). */
  private beams: THREE.Object3D[] = [];
  /** The replica's own three lights (a fill, a key, a rim): their colours follow the map's light (M33h), never their number. */
  private readonly hemi: THREE.HemisphereLight;
  private readonly key: THREE.DirectionalLight;
  private readonly rim: THREE.DirectionalLight;
  /** The map's light the replica is lit by (LightingPreset.viewmodel and .torch); the day's until setLighting. */
  private lighting: LightingPreset = LIGHTING_PRESETS.day;
  /** Your weapon torch is on (its lens glows, and its spill warms the key light at night). */
  private torchOn = false;
  private torchColour = 0xffffff;
  private readonly keyColour = new THREE.Color();
  private readonly torchTint = new THREE.Color();

  constructor(
    aspect: number,
    private readonly teamColor: number,
    private readonly loadout: readonly ReplicaConfig[],
    /** Replica and hand detail (QualitySettings.replicaDetail and handDetail, FA8); setDetail changes them. */
    detail: ReplicaDetail = LOW_DETAIL,
    /** Each replica's colour scheme by loadout slot, and Realistic colours (G1); null: the black and tan of before. */
    private readonly paint: ReplicaPaint | null = null,
    /** The player's own arms (G7): gloved, or a robot's when their slot is a robot (the Robots setting). */
    private readonly arms: ArmStyle = HUMAN_ARMS,
    /** Replica models from files (M101, render/replicaFiles.ts), owned by the renderer: a replica with one is drawn from it. */
    private readonly files: ReplicaFiles = NO_REPLICA_FILES,
  ) {
    this.camera = new THREE.PerspectiveCamera(VIEWMODEL.fov, aspect, VIEWMODEL.near, VIEWMODEL.far);
    // Soft sky fill, a warm key from above-right and a cool rim from behind to separate the silhouette.
    this.hemi = new THREE.HemisphereLight(...VIEWMODEL.light.hemi);
    const key = new THREE.DirectionalLight(VIEWMODEL.light.keyColor, VIEWMODEL.light.keyIntensity);
    key.position.set(...VIEWMODEL.light.keyPosition);
    const rim = new THREE.DirectionalLight(VIEWMODEL.light.rimColor, VIEWMODEL.light.rimIntensity);
    rim.position.set(...VIEWMODEL.light.rimPosition);
    this.key = key;
    this.rim = rim;
    this.scene.add(this.hemi, key, rim, this.rig);
    this.replicas = this.build(detail);
  }

  /** Builds every replica (and the raised hand) at `detail` and puts them in the rig. */
  private build(detail: ReplicaDetail): ReplicaModels {
    const replicas = buildReplicaModels(this.loadout, this.teamColor, VIEWMODEL.orangeTips, detail, this.paint, 'hands', this.arms, this.files);
    this.slots.length = 0;
    this.beams = [];
    this.inspectT = -1;
    this.inspectWeight = 0;
    for (const r of this.loadout) {
      const { group: model, magazine, supportHand, muzzle, mount, rig } = replicas.models.get(r.id)!;
      const inspect: InspectPose = VIEWMODEL.inspect.poses[r.look.viewmodel ?? r.look.model];
      model.position.set(...r.look.hold.position);
      model.rotation.y = r.look.hold.yaw;
      this.slots.push({
        model,
        mag: magazine,
        hand: supportHand,
        muzzle,
        hold: r.look.hold,
        aimHold: r.look.aimHold,
        parts: fittableParts(model),
        mount,
        magBase: undefined,
        sightsUp: model.getObjectByName('sightsUp'),
        sightsDown: model.getObjectByName('sightsDown'),
        parts3d: rig ?? null,
        fire: 0,
        selector: -1,
        sights: -1,
        inspect,
        // The file's own Inspect clip sets the length, so the pose and the parts move together.
        inspectTime: rig?.has('Inspect') ? rig.duration('Inspect') : inspect.duration,
        id: r.id,
      });
      model.visible = false;
      this.rig.add(model);
      model.traverse((o) => o.name === 'laserBeam' && this.beams.push(o));
    }
    for (const beam of this.beams) beam.visible = this.beamOn;
    replicas.raisedHand.visible = false;
    this.scene.add(replicas.raisedHand);
    replicas.setReflections(this.scene.environment !== null);
    replicas.setTorchLit(this.torchOn);
    return replicas;
  }

  /**
   * The map's light (M33h): the replica's fill, key and rim take the preset's `viewmodel` colours and strengths (the
   * day's are VIEWMODEL.light's), changed in place: the scene keeps its three lights.
   */
  setLighting(preset: LightingPreset): void {
    this.lighting = preset;
    const v = preset.viewmodel;
    this.hemi.color.setHex(v.hemi.sky);
    this.hemi.groundColor.setHex(v.hemi.ground);
    this.hemi.intensity = v.hemi.intensity;
    this.rim.color.setHex(v.rim.colour);
    this.rim.intensity = v.rim.intensity;
    this.applyKey();
  }

  /**
   * Your weapon torch on or off (M33h): its lens glows, and on a night preset the key light turns towards the torch's
   * `colour` and brightens (LightingPreset.torch.spill), as the beam's bounce would. Nothing happens if unchanged.
   */
  setTorch(on: boolean, colour: number): void {
    if (on === this.torchOn && colour === this.torchColour) return;
    this.torchOn = on;
    this.torchColour = colour;
    this.replicas.setTorchLit(on);
    this.applyKey();
  }

  private applyKey(): void {
    const v = this.lighting.viewmodel;
    const spill = this.torchOn ? this.lighting.torch.spill : 0;
    this.key.color.copy(this.keyColour.setHex(v.key.colour).lerp(this.torchTint.setHex(this.torchColour), spill));
    this.key.intensity = v.key.intensity * (1 + (this.torchOn ? this.lighting.torch.spillIntensity : 0));
  }

  /**
   * Replica and hand detail (QualitySettings.replicaDetail and handDetail, FA8): the replicas are built again at the new
   * levels (the next update shows the fitted parts and the active slot as before). Nothing happens if neither changed.
   */
  setDetail(detail: ReplicaDetail): void {
    const now = this.replicas.detail;
    if (now.replica === detail.replica && now.hands === detail.hands) return;
    for (const s of this.slots) s.model.removeFromParent();
    this.replicas.raisedHand.removeFromParent();
    this.replicas.dispose();
    this.shownSlot = -1;
    this.replicas = this.build({ ...detail });
  }

  /** The laser module's beam drawn or not (QualitySettings.laserBeam, FA8; it shows only while the laser is fitted). */
  setLaserBeam(on: boolean): void {
    this.beamOn = on;
    for (const beam of this.beams) beam.visible = on;
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
    this.replicas.setReflections(texture !== null);
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
    this.inspectCut = true;
  }

  /**
   * The Inspect key (RM2): at the next update the replica in hand is turned over to look at while its file's Inspect
   * clip works its parts, unless it is reloading, being drawn, carried for a sprint, aimed or lowered to call a hit. A
   * press during an inspect is ignored.
   */
  inspect(): void {
    this.inspectAsked = true;
  }

  /** An inspect is under way (its pose easing back after one is cut short counts too). */
  get inspecting(): boolean {
    return this.inspectT >= 0 || this.inspectWeight > 0;
  }

  /** A shot from the player's replica: kick back and up. */
  onShot(): void {
    this.kick = Math.min(VIEWMODEL.kickMax, this.kick + 1);
    this.dropInspect();
    // The trigger: pulled from the start, or held back at the peak for a shot while it is still moving (full auto).
    const s = this.slots[this.shownSlot];
    if (s?.parts3d) {
      const peak = VIEWMODEL.parts.firePeak * s.parts3d.duration('Fire');
      s.fire = s.fire <= 0 ? Number.EPSILON : Math.min(s.fire, peak);
    }
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
      const barrel = parts?.barrel ?? null;
      const muzzle = parts?.muzzle ?? null;
      for (const p of s.parts) {
        const fitted =
          p.kind === 'optic'
            ? optic
            : p.kind === 'grip'
              ? parts?.grip
              : p.kind === 'laser'
                ? parts?.laser
                : p.kind === 'light'
                  ? parts?.light
                  : p.kind === 'barrel'
                    ? barrel
                    : p.kind === 'muzzle'
                      ? (muzzle ?? 'none')
                      : parts?.magazine;
        p.object.visible = p.id === fitted;
        if (p.kind === 'magazine' && p.object.visible) s.magBase = s.mag.bases.get(p.object);
      }
      fitMuzzle(s.mount, barrel, muzzle);
      fitSupportHand(s.hand, parts?.grip ?? null);
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
    // Anything the hands are doing (or about to) keeps an inspect from starting and ends one under way.
    const busy = armament.reload > 0 || armament.draw > 0 || carry > 0 || callingHit || aim > 0;
    const ip = this.updateInspect(dt, armament.active, busy);
    for (let i = 0; i < this.slots.length; i++) {
      const s = this.slots[i]!;
      s.parts3d?.set('Inspect', i === this.inspectSlot ? this.inspectT : 0);
      if (s.parts3d) poseParts(s, s.parts3d, armament.modes[i], armament.optics[i] != null, s === slot ? reloadP : 0, dt);
    }
    const R = VIEWMODEL.reload;
    slot.model.rotation.set(reloadDip * R.tilt + ip.tilt, holdYaw + reloadDip * R.turn + ip.turn, reloadDip * R.roll + ip.roll);
    // Magazine swap: the support hand goes to the magazine, pulls it, stows it out of view, brings a
    // fresh one up and seats it, then returns to its grip once the reload is done.
    const reloading = armament.reload > 0;
    if (armament.active !== this.shownSlot) {
      this.shownSlot = armament.active;
      this.handBlend = 0;
    }
    this.handBlend = Math.max(0, Math.min(1, this.handBlend + (reloading ? dt : -dt) / R.handMoveTime));
    const magDistance = reloading ? magazineOut(reloadP) * R.magTravel + magazineSwap(reloadP) * R.swapTravel : 0;
    const magAxis = slot.mag.axis;
    slot.mag.group.position.copy(magAxis).multiplyScalar(magDistance);
    // The Cyber Pistol's battery check slides its magazine out a little and back (its file's Inspect clip).
    if (slot.parts3d && this.inspectT >= 0) slot.mag.group.position.add(slot.parts3d.magazineOffset('Inspect', this.magazineSlide));
    for (const s of this.slots) if (s !== slot) s.hand.group.position.set(0, 0, 0);
    const grab = smooth(this.handBlend);
    const handAt = slot.hand.group.position.copy(slot.hand.toMag);
    if (slot.magBase) handAt.add(slot.magBase);
    handAt.multiplyScalar(grab).addScaledVector(magAxis, magDistance * grab);
    const drawP = handling.drawTime > 0 ? armament.draw / handling.drawTime : 0;

    const bob = VIEWMODEL.bobAmount * moving * motion * m.bob;
    this.hitBlend = Math.max(0, Math.min(1, this.hitBlend + (callingHit ? dt : -dt) / VIEWMODEL.raiseTime));
    const raise = smooth(this.hitBlend);
    const hand = this.replicas.raisedHand;
    hand.visible = this.hitBlend > 0;
    const [hx, hy, hz] = VIEWMODEL.raisedHand;
    hand.position.set(hx, hy - (1 - raise) * VIEWMODEL.raiseFrom, hz);

    this.rig.position.set(
      this.swayX + Math.cos(this.bobPhase) * bob - reloadDip * R.inward - ip.inward,
      this.swayY +
        ip.lift -
        Math.abs(Math.sin(this.bobPhase)) * bob +
        reloadDip * R.lift -
        drawP * VIEWMODEL.drawDrop -
        this.sprintBlend * VIEWMODEL.sprintDrop -
        raise * VIEWMODEL.hitDrop +
        kick * VIEWMODEL.kickLift,
      kick * VIEWMODEL.kickBack + ip.back,
    );
    // No pitch from the kick: the barrel stays parallel to the view (see VIEWMODEL.kickLift).
    this.rig.rotation.set(-drawP * VIEWMODEL.drawTilt, this.sprintBlend * VIEWMODEL.sprintTilt, 0);
  }

  /**
   * Ends an inspect at once, its pose taken off the replica straight away (not eased back): a shot's BB is drawn from
   * the muzzle as it is now, so it must leave from the barrel's hold, in line with the view.
   */
  private dropInspect(): void {
    const ip = this.inspectOffset;
    const s = this.slots[this.inspectSlot];
    if (s) s.model.rotation.set(s.model.rotation.x - ip.tilt, s.model.rotation.y - ip.turn, s.model.rotation.z - ip.roll);
    this.rig.position.x += ip.inward;
    this.rig.position.y -= ip.lift;
    this.rig.position.z -= ip.back;
    Object.assign(ip, NO_INSPECT);
    this.inspectT = -1;
    this.inspectWeight = 0;
    this.inspectAsked = false;
  }

  /**
   * The inspect (RM2), once per update: starts one asked for if the hands are free (`busy` false), runs it on (its
   * parts' sounds as it passes them), and ends it at its end or as soon as the hands are busy, a shot or a hit comes,
   * or another replica is drawn. Returns the pose to add to the hold this frame.
   */
  private updateInspect(dt: number, active: number, busy: boolean): InspectOffset {
    const cut = busy || this.inspectCut;
    this.inspectCut = false;
    if (this.inspectAsked && this.inspectT < 0 && !cut) {
      this.inspectT = 0;
      this.inspectSlot = active;
      this.inspectShare = 0;
      this.inspectWeight = 1;
      this.inspectSounds = 0;
    }
    this.inspectAsked = false;
    const s = this.slots[this.inspectSlot];
    if (this.inspectT >= 0 && s) {
      if (cut || active !== this.inspectSlot) {
        this.inspectT = -1;
      } else {
        this.inspectT += dt;
        this.inspectShare = Math.min(1, this.inspectT / s.inspectTime);
        const sounds = s.inspect.sounds;
        while (this.inspectSounds < sounds.length && sounds[this.inspectSounds]!.at <= this.inspectShare) {
          this.onInspectSound?.(sounds[this.inspectSounds]!.cue, s.id);
          this.inspectSounds++;
        }
        if (this.inspectShare >= 1) {
          this.inspectT = -1;
          this.inspectWeight = 0;
        }
      }
    }
    if (this.inspectT < 0) this.inspectWeight = Math.max(0, this.inspectWeight - dt / VIEWMODEL.inspect.cancelTime);
    if (!s || this.inspectWeight <= 0 || active !== this.inspectSlot) return Object.assign(this.inspectOffset, NO_INSPECT);
    return inspectPose(s.inspect.keys, this.inspectShare, this.inspectWeight, this.inspectOffset);
  }

  /**
   * World position that appears on screen where the held replica's muzzle is drawn. The viewmodel has
   * its own camera and FOV, so the muzzle is projected to the screen with that camera and then placed
   * at the same distance along the main camera's ray through that screen point.
   */
  muzzleWorld(mainCamera: THREE.PerspectiveCamera, out: THREE.Vector3): boolean {
    let marker: THREE.Object3D | undefined;
    for (const s of this.slots) if (s.model.visible) marker = s.muzzle;
    if (!marker) return false;
    // getWorldPosition brings the marker's own chain (rig → model → marker) up to date, nothing else under the rig
    // (audit REN-11: a full rig update recomposed ~60 matrices on every shot).
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

/** Moves `value` towards `target` at one second a second (a part turned at its animation's own speed). */
function approach(value: number, target: number, dt: number): number {
  return value < target ? Math.min(target, value + dt) : Math.max(target, value - dt);
}

/**
 * Poses a replica's moving parts (RM1) from the game's state: the trigger after a shot, the fire selector at `mode`,
 * the iron sights folded while an optic is fitted, and the magazine release through the reload (`reloadP`, 0..1).
 * The selector and sights start where they belong, then turn when the setting changes.
 */
function poseParts(s: { fire: number; selector: number; sights: number }, rig: ReplicaRig, mode: FireMode | undefined, optic: boolean, reloadP: number, dt: number): void {
  if (s.fire > 0) {
    s.fire += dt;
    if (s.fire >= rig.duration('Fire')) s.fire = 0;
  }
  rig.set('Fire', s.fire);
  const selector = (mode ? VIEWMODEL.parts.selector[mode] : 0) * rig.duration('Selector');
  s.selector = s.selector < 0 ? selector : approach(s.selector, selector, dt);
  rig.set('Selector', s.selector);
  const sights = optic ? rig.duration('SightsFold') : 0;
  s.sights = s.sights < 0 ? sights : approach(s.sights, sights, dt);
  rig.set('SightsFold', s.sights);
  rig.set('Reload', reloadP * rig.duration('Reload'));
  rig.apply();
}
