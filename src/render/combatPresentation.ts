import * as THREE from 'three';
import { Sfx, type SfxSetup } from '../audio/sfx';
import { soundscapeOf } from '../audio/soundscape';
import type { MotionScale } from '../config/accessibility';
import { FIGURE } from '../config/characters';
import { impactMaterialAt } from '../audio/soundMaterials';
import type { Action } from '../config/controls';
import type { HitConfig } from '../config/hits';
import type { CrosshairSettings } from '../config/matchInfo';
import { BB_VISUALS, DUST_MOTES, GAS_PUFFS, HIT_PUFFS, HUD, IMPACT_DUST, IMPACT_PUFFS, IMPACT_RINGS, type LightingPreset, type QualitySettings } from '../config/render';
import type { ImpactMaterial } from '../config/sounds';
import type { MovementConfig } from '../config/movement';
import { AIMING, type OpticId, OPTICS } from '../config/optics';
import type { ReplicaConfig } from '../config/replicas';
import { TORCHES } from '../config/torches';
import type { MapData } from '../map/mapTypes';
import type { WorldQuery } from '../sim/armament';
import type { BB } from '../sim/ballistics';
import type { Character } from '../sim/character';
import type { GameState } from '../sim/state';
import { lightInHand, torchLit } from '../sim/torch';
import { Hud } from '../ui/hud';
import { BBPathsDebug } from './bbPathsDebug';
import { BBRenderer } from './bbRenderer';
import { figureMuzzle, type FigureHold } from './characterModels';
import { holdsPistol } from './characterRenderer';
import { DustMotes } from './dustMotes';
import { ImpactGrit, shooterSide } from './impactGrit';
import { ImpactPuffs } from './impactPuffs';
import type { Renderer } from './renderer';
import { sprintCarry, Viewmodel } from './viewmodel';

/** Whose BBs are drawn glowing (M33b): the player's by gear slot, and every other shooter's. */
export interface BBGlow {
  player: readonly boolean[];
  others: boolean;
}

const NO_GLOW: BBGlow = { player: [], others: false };

/**
 * Where the camera looks and its own up, in the world (M53, audit AUD-05): the ears' axes. The up tilts with the view's
 * pitch and lean, so it stays perpendicular to where the camera looks, however steeply.
 */
export function listenerAxes(camera: THREE.Camera, forward: THREE.Vector3, up: THREE.Vector3): void {
  camera.getWorldDirection(forward);
  // getWorldDirection has brought the camera's world matrix up to date: its second column is the camera's up.
  up.setFromMatrixColumn(camera.matrixWorld, 1).normalize();
}

/**
 * Every replica whose sounds the match needs: yours first (as you carry them), then any other a character carries. Bots
 * needn't carry what you do (you may leave the AEG at home, M32), and a replica without sounds would shoot silently.
 */
export function heardReplicas(loadout: readonly ReplicaConfig[], characters: readonly Character[]): ReplicaConfig[] {
  const out = [...loadout];
  for (const c of characters) for (const r of c.armament.replicas) if (!out.some((o) => o.id === r.id)) out.push(r);
  return out;
}

/**
 * Everything the player sees and hears about replicas and BBs: BBs in flight, impact puffs, the held
 * replica, the ammo HUD and sound. Reads simulation state and the events of each tick; never writes.
 */
export class CombatPresentation {
  private readonly bbs: BBRenderer;
  private readonly puffs = new ImpactPuffs(IMPACT_PUFFS);
  /**
   * Impact grit (QualitySettings.impactGrit, FA8): a faint ring of dust round each impact puff (made the first time grit
   * is turned on, so Low never draws its texture), and chips of the surface.
   */
  private rings: ImpactPuffs | null = null;
  private readonly grit = new ImpactGrit();
  /** Where a landed BB's shooter is, for its grit (reused). */
  private readonly gritFrom = { x: 0, y: 0, z: 0 };
  /** Bigger puffs where BBs land on players: hit confirmation at range. */
  private readonly hitPuffs = new ImpactPuffs(HIT_PUFFS);
  /** A gas replica's breath at the muzzle and ejection port on each shot (M14). */
  private readonly gasPuffs = new ImpactPuffs(GAS_PUFFS);
  /** Dust drifting in the sunlight round the camera (M14); how much is the quality settings' (at most the Custom row's top). */
  private readonly motes = new DustMotes(DUST_MOTES.max);
  /** The impact dust's tint per material (linear colours, made once). */
  private readonly dustTints = new Map<ImpactMaterial, THREE.Color>();
  /** The settings in use, to light the replica again after a lost or replaced graphics context (contextRestored). */
  private quality: QualitySettings;
  private readonly paths: BBPathsDebug;
  private readonly viewmodel: Viewmodel;
  private readonly hud: Hud;
  private readonly sfx: Sfx;
  private readonly forward = new THREE.Vector3();
  private readonly up = new THREE.Vector3();
  private readonly listenerPos = { x: 0, y: 0, z: 0 };
  private readonly muzzle = new THREE.Vector3();
  private readonly dir = { x: 0, y: 0, z: 0 };
  private readonly puffVelocity = { x: 0, y: 0, z: 0 };
  private readonly puffAt = new THREE.Vector3();
  private readonly viewRight = new THREE.Vector3();
  /** Newest BB serial already given a muzzle start, per shooter. */
  private readonly lastSerialByOwner = new Map<number, number>();
  private readonly overlay: { scene: THREE.Scene; camera: THREE.Camera };
  private playing = false;
  /** The round in play started behind a screen (round 1 of a match, set up before play): whistle on Play. */
  private startWhistleOwed = true;
  /** How far the player's optic is raised to their eye (0..1): eases over AIMING.raiseTime (× the optic's and grip's scale). */
  private aimBlend = 0;
  /** The optic the sight was last raised on: switching away eases out of its zoom rather than snapping. */
  private aimOptic: OpticId = 'redDot';

  /** How far the player's optic is raised to their eye (0..1); the aiming sensitivity blends in with it. */
  get aimRaised(): number {
    return this.aimBlend;
  }

  /** The aiming sensitivity's scale for the optic in use: a stronger zoom turns slower (AIMING.sensitivityZoom). */
  get aimSensitivityScale(): number {
    return AIMING.sensitivityZoom / OPTICS[this.aimOptic].zoom;
  }

  constructor(
    private readonly renderer: Renderer,
    container: HTMLElement,
    private readonly state: GameState,
    private readonly player: Character,
    private readonly loadout: readonly ReplicaConfig[],
    private readonly movement: MovementConfig,
    private readonly query: WorldQuery,
    teamColor: number,
    tickSeconds: number,
    /**
     * The map: its blocks and sloping ground (M33c), what a BB's impact sounds and puffs like; and what it sounds like
     * (M33j: its ambience, its ground underfoot and its fires).
     */
    private readonly field: MapData,
    audio: SfxSetup,
    keyName: (action: Action) => string,
    crosshair: CrosshairSettings,
    quality: QualitySettings,
    /** The match's hit rules: a leaning figure's muzzle tilts by their lean angle. */
    private readonly hits: HitConfig,
    /** Whose BBs glow (M33b): yours by gear slot (your Loadout's choice on this field), and everyone else's. */
    private readonly glow: BBGlow = NO_GLOW,
    /** The match's seed: the ambience's calls are timed from it (M53, audit AUD-07; Sfx). */
    seed = 0,
  ) {
    this.sfx = new Sfx(heardReplicas(loadout, state.characters), field.blocks, query, audio, seed);
    this.bbs = new BBRenderer(state.bbs, tickSeconds);
    this.paths = new BBPathsDebug(state.bbs);
    renderer.scene.add(this.bbs.object, this.puffs.object, this.grit.object, this.hitPuffs.object, this.gasPuffs.object, this.motes.object, this.paths.object);
    for (const [material, dust] of Object.entries(IMPACT_DUST)) this.dustTints.set(material as ImpactMaterial, new THREE.Color(dust.tint));
    this.viewmodel = new Viewmodel(renderer.camera.aspect, teamColor, loadout, { replica: quality.replicaDetail, hands: quality.handDetail });
    this.overlay = { scene: this.viewmodel.scene, camera: this.viewmodel.camera };
    this.hud = new Hud(container, keyName, crosshair);
    this.quality = quality;
    this.setQuality(quality);
  }

  /**
   * A quality preset (Settings → Graphics, M14): how much dust drifts in the air, the held replica's sheen, and the
   * visual overhaul's rows (FA8): replica and hand detail, the laser beam, the BBs' glow and impact grit.
   */
  setQuality(quality: QualitySettings): void {
    this.quality = quality;
    this.motes.setCount(quality.dustMotes);
    this.viewmodel.setDetail({ replica: quality.replicaDetail, hands: quality.handDetail });
    this.viewmodel.setLaserBeam(quality.laserBeam);
    this.bbs.setGlow(quality.bbGlow);
    this.grit.setEnabled(quality.impactGrit);
    if (quality.impactGrit && !this.rings) {
      this.rings = new ImpactPuffs(IMPACT_RINGS);
      this.renderer.scene.add(this.rings.object);
    }
    if (this.rings) this.rings.object.visible = quality.impactGrit;
    // The Renderer owns the sheen (REN-06): made once per context, freed while the setting is off.
    this.viewmodel.setEnvironment(quality.replicaSheen ? this.renderer.replicaSheen : null);
  }

  /**
   * The graphics context is back after a loss, or was replaced (audit L-02, REN-04). Three.js uploads geometry and
   * textures again from their copies, but a render target comes back empty: the Renderer has dropped its sheen, and
   * asking for it again here prefilters it on the new context.
   */
  contextRestored(): void {
    this.setQuality(this.quality);
  }

  /** Browsers only allow audio after a user gesture: call from the Play click. */
  unlockAudio(): void {
    this.sfx.unlock();
  }

  /**
   * The map's light (M33h, LightingPreset): the held replica is lit by its `viewmodel` group, the day's or the night's,
   * and the field sounds as it does by day or at night (M33j: its ambience, its fires; the map's own sounds are rendered
   * now, as the match loads).
   */
  setLighting(preset: LightingPreset): void {
    this.viewmodel.setLighting(preset);
    this.sfx.setScene(soundscapeOf(this.field, preset.night));
  }

  /** Reduced motion changed on Settings → Accessibility: the held replica's bob, sway and kick. */
  setMotion(scale: MotionScale): void {
    this.viewmodel.setMotion(scale);
    this.motes.setMotion(scale.dust > 0);
  }

  /** The crosshair changed on Settings → Crosshair. */
  setCrosshair(crosshair: CrosshairSettings): void {
    this.hud.setCrosshair(crosshair);
  }

  /** A short line on the HUD (the game's own quality step-down says so, REN-03). */
  showNotice(text: string, seconds: number): void {
    this.hud.showNotice(text, seconds);
  }

  /** No rounds here (the practice range, M21): no start whistle when play starts. */
  skipStartWhistle(): void {
    this.startWhistleOwed = false;
  }

  setPlaying(playing: boolean): void {
    this.hud.setVisible(playing);
    this.sfx.setPaused(!playing);
    this.playing = playing;
    if (playing && this.startWhistleOwed) this.startWhistleOwed = !this.sfx.roundStartWhistle();
  }

  toggleBbPaths(): void {
    this.paths.toggle();
  }

  /** BB paths drawn or not (the Dev settings' BB paths, M24). */
  setBbPaths(on: boolean): void {
    if (this.paths.enabled !== on) this.paths.toggle();
  }

  get bbsInFlight(): number {
    return this.bbs.visibleCount;
  }

  /** A teammate's radio answers a squad order (M22). */
  orderHeard(): void {
    this.sfx.orderHeard();
  }

  /** Call after every simulation tick, while that tick's events are still in the state. */
  afterTick(): void {
    this.paths.recordTick();
    this.sfx.afterTick(this.state.characters, this.player.id);
    for (const e of this.state.events) {
      if (e.type === 'roundStart') {
        this.viewmodel.resetSway(); // the view snaps to the spawn yaw
        this.aimBlend = 0; // a new round starts with the sight down
        this.renderer.setZoom(1);
        // A round set up behind the start or result screen gets its whistle when play starts.
        if (!this.playing) {
          this.startWhistleOwed = true;
          continue;
        }
      } else if (e.type === 'bbImpact') {
        // Dust by what the BB hit, and its tick: one lookup for both (audit L-15).
        const material = impactMaterialAt(this.field.blocks, e.position, this.field.terrain ?? null);
        const tint = this.dustTints.get(material);
        this.puffs.spawn(e.position, tint, IMPACT_DUST[material].scale);
        if (this.grit.active && tint) {
          this.rings?.spawn(e.position, tint, IMPACT_DUST[material].scale);
          this.grit.spawn(e.position, tint, shooterSide(this.state.characters, e.ownerId, this.renderer.camera.position, this.gritFrom));
        }
        this.sfx.impact(e.position, material);
      } else if (e.type === 'targetHit') this.puffs.spawn(e.position);
      else if (e.type === 'characterHit') {
        // Your own hit: the replica jolts in your hands (the puff would fill your view).
        if (e.victimId === this.player.id) this.viewmodel.onHit();
        else this.hitPuffs.spawn(e.position);
      } else if (e.type === 'ricochetTick') {
        // A ricochet that doesn't count (M20): you feel the tick and play on. On anyone else it's the plain impact puff,
        // not the bigger hit puff, so it never reads as a hit nobody called; your own BB's ricochet says so.
        if (e.victimId === this.player.id) this.hud.showNotice(HUD.ricochetNotice, HUD.noticeTime);
        else {
          this.puffs.spawn(e.position);
          if (e.shooterId === this.player.id) this.hud.showNotice(HUD.ricochetShooterNotice, HUD.noticeTime);
        }
      } else if (e.type === 'reloadRefused' && e.characterId === this.player.id) {
        this.hud.showNotice('No fuller magazine', HUD.noticeTime);
      }
      if (e.type === 'shot') {
        if (e.characterId === this.player.id) this.viewmodel.onShot();
        const shooter = this.characterOf(e.characterId);
        // The drawn muzzle once per shot, for the BB and the gas breath both (audit REN-11).
        if (shooter && this.shooterMuzzle(shooter, this.muzzle)) {
          this.drawFromMuzzle(shooter, this.muzzle);
          this.gasBreath(shooter, this.muzzle);
        }
      }
      this.sfx.onEvent(e, this.player.id, this.characterOf);
    }
  }

  /** Once per rendered frame, after the camera has been placed. `alpha` interpolates ticks. */
  frame(dt: number, alpha: number, yaw: number, pitch: number): void {
    this.bbs.setPixelAngle(this.renderer.retroPixelAngle);
    this.bbs.update(alpha, this.renderer.camera.position, this.renderer.camera.quaternion);
    this.puffs.update(dt, this.renderer.camera);
    this.rings?.update(dt, this.renderer.camera);
    this.grit.update(dt, this.renderer.camera);
    this.hitPuffs.update(dt, this.renderer.camera);
    this.gasPuffs.update(dt, this.renderer.camera);
    this.motes.setPixelRatio(this.renderer.renderer.getPixelRatio());
    this.motes.update(dt, this.renderer.camera.position, this.state.wind);
    this.paths.update();

    const p = this.player;
    const carried = p.sprinting || p.sprintLockout > 0;
    // Aiming down sights: the sight comes up to your eye and the view narrows by the optic's zoom. Straight out of a
    // sprint the replica is still carried (firing is locked out too), so it rises once that ends.
    const aiming = p.aiming && p.status === 'alive' && !carried;
    const optic = p.armament.optics[p.armament.active];
    if (aiming && optic) this.aimOptic = optic;
    const raiseTime = AIMING.raiseTime * OPTICS[this.aimOptic].raiseScale * p.armament.handling[p.armament.active]!.raiseScale;
    this.aimBlend = Math.max(0, Math.min(1, this.aimBlend + (aiming ? dt : -dt) / raiseTime));
    this.renderer.setZoom(1 + (OPTICS[this.aimOptic].zoom - 1) * this.aimBlend);
    this.viewmodel.setAspect(this.renderer.camera.aspect);
    const carry = p.sprinting ? 1 : sprintCarry(p.sprintLockout, this.movement.sprintFireLockout);
    const light = lightInHand(p);
    this.viewmodel.setTorch(torchLit(p), light ? TORCHES[light].colour : TORCHES.weaponTorch.colour);
    this.viewmodel.update(dt, yaw, pitch, Math.hypot(p.velocity.x, p.velocity.z), this.movement.runSpeed, carry, p.armament, p.status === 'calling', this.aimBlend);
    // The shot spread right now (replica × stance and movement), as pixels on screen at the centre.
    const cam = this.renderer.camera;
    const spread = THREE.MathUtils.degToRad(p.armament.replicas[p.armament.active]!.spreadDeg * p.spreadScale);
    const focalPx = this.renderer.height / 2 / Math.tan(THREE.MathUtils.degToRad(cam.fov) / 2);
    const sight = optic != null && this.aimBlend >= AIMING.reticleFrom ? optic : null;
    this.viewmodel.setScoped(sight !== null && OPTICS[sight].scope);
    this.hud.update(p.armament, this.loadout, p.status === 'alive', Math.tan(spread) * focalPx, sight, dt);

    listenerAxes(cam, this.forward, this.up);
    this.listenerPos.x = cam.position.x;
    this.listenerPos.y = cam.position.y;
    this.listenerPos.z = cam.position.z;
    this.sfx.setListener(this.listenerPos, this.forward.x, this.forward.y, this.forward.z, this.up.x, this.up.y, this.up.z);
    this.sfx.placeSources(this.state.characters, this.player.id);
  }

  /** Draws the frame; the held replica only when the camera is in first person. */
  render(firstPerson: boolean): void {
    this.renderer.render(firstPerson ? this.overlay : undefined);
  }

  dispose(): void {
    this.bbs.dispose();
    this.puffs.dispose();
    this.rings?.dispose();
    this.grit.dispose();
    this.hitPuffs.dispose();
    this.gasPuffs.dispose();
    this.motes.dispose();
    this.viewmodel.setEnvironment(null);
    this.paths.dispose();
    this.viewmodel.dispose();
    this.hud.dispose();
    this.sfx.dispose();
  }

  /**
   * Where `shooter`'s replica muzzle is drawn: the held replica for you, the third-person figure's rifle or pistol for
   * everyone else. False if it can't be placed (no replica shown).
   */
  private shooterMuzzle(shooter: Character, out: THREE.Vector3): boolean {
    if (shooter === this.player) return this.viewmodel.muzzleWorld(this.renderer.camera, out);
    figureMuzzle(shooter, out, this.holdOf(shooter), this.hits);
    return true;
  }

  /**
   * Starts a shooter's newest BB (if the shot spawned one) visually at their replica's drawn muzzle `at` (BBs really
   * leave from the eyes, which would look like they come out of faces).
   */
  private drawFromMuzzle(shooter: Character, at: THREE.Vector3): void {
    const shooterId = shooter.id;
    const last = this.lastSerialByOwner.get(shooterId) ?? 0;
    let newest: BB | undefined;
    for (const bb of this.state.bbs.bbs) {
      if (bb.active && bb.ownerId === shooterId && bb.serial > last && (!newest || bb.serial > newest.serial)) newest = bb;
    }
    if (!newest) return; // blocked muzzle: the shot hit cover immediately
    this.lastSerialByOwner.set(shooterId, newest.serial);
    this.bbs.setGlowInDark(newest, shooter === this.player ? (this.glow.player[shooter.armament.active] ?? false) : this.glow.others);
    this.bbs.startFromMuzzle(newest, at, this.estimateFlightTime(newest));
  }

  /**
   * A gas replica's breath on a shot (M14): a puff pushed forward out of the muzzle `muzzle`, and for your own pistol a
   * smaller one out of the ejection port to the right. Electric replicas only whirr.
   */
  private gasBreath(shooter: Character, muzzle: THREE.Vector3): void {
    if (shooter.armament.replicas[shooter.armament.active]?.power !== 'gas') return;
    const cam = this.renderer.camera;
    const at = this.puffAt.copy(muzzle);
    // Forward along the shooter's view (yaw and pitch: the replica points where they look).
    const v = this.puffVelocity;
    const cp = Math.cos(shooter.pitch);
    v.x = -Math.sin(shooter.yaw) * cp * GAS_PUFFS.muzzleSpeed;
    v.y = Math.sin(shooter.pitch) * GAS_PUFFS.muzzleSpeed;
    v.z = -Math.cos(shooter.yaw) * cp * GAS_PUFFS.muzzleSpeed;
    this.gasPuffs.spawn(at, undefined, 1, v);
    if (shooter !== this.player) return;
    this.viewRight.set(1, 0, 0).applyQuaternion(cam.quaternion);
    v.x = this.viewRight.x * GAS_PUFFS.portSpeed;
    v.y = GAS_PUFFS.portSpeed * 0.5;
    v.z = this.viewRight.z * GAS_PUFFS.portSpeed;
    this.gasPuffs.spawn(at.lerp(cam.position, GAS_PUFFS.portBack), undefined, GAS_PUFFS.portScale, v);
  }

  /** Rough seconds until `bb` hits level geometry (straight line at its launch speed); Infinity if nothing is near. */
  private estimateFlightTime(bb: BB): number {
    const v = bb.velocity;
    const speed = Math.hypot(v.x, v.y, v.z);
    if (speed <= 0) return Number.POSITIVE_INFINITY;
    this.dir.x = v.x / speed;
    this.dir.y = v.y / speed;
    this.dir.z = v.z / speed;
    const reach = speed * BB_VISUALS.muzzleConvergeTime;
    const d = this.query.raycastStatic(bb.prevPosition, this.dir, reach);
    return d < 0 ? Number.POSITIVE_INFINITY : d / speed;
  }

  /** The third-person figure's hold for `c`'s active replica: where its muzzle is. */
  private holdOf(c: Character): FigureHold {
    return holdsPistol(c) ? FIGURE.pistol : FIGURE.rifle;
  }

  /** The character with `id` (a plain loop: no closure per call on the shot and sound paths, audit REN-11). */
  private readonly characterOf = (id: number): Character | undefined => {
    for (const c of this.state.characters) if (c.id === id) return c;
    return undefined;
  };
}
