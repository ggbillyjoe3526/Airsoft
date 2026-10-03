import * as THREE from 'three';
import { Sfx } from '../audio/sfx';
import type { Action } from '../config/controls';
import { BB_VISUALS, HIT_PUFFS, HUD, IMPACT_PUFFS } from '../config/render';
import type { MovementConfig } from '../config/movement';
import { AIMING, OPTICS } from '../config/optics';
import type { ReplicaConfig } from '../config/replicas';
import type { WorldQuery } from '../sim/armament';
import type { BB } from '../sim/ballistics';
import type { Character } from '../sim/character';
import type { GameState } from '../sim/state';
import { Hud } from '../ui/hud';
import { BBPathsDebug } from './bbPathsDebug';
import { BBRenderer } from './bbRenderer';
import { figureMuzzle } from './characterModels';
import { ImpactPuffs } from './impactPuffs';
import type { Renderer } from './renderer';
import { sprintCarry, Viewmodel } from './viewmodel';

/**
 * Everything the player sees and hears about replicas and BBs: BBs in flight, impact puffs, the held
 * replica, the ammo HUD and sound. Reads simulation state and the events of each tick; never writes.
 */
export class CombatPresentation {
  private readonly bbs: BBRenderer;
  private readonly puffs = new ImpactPuffs(IMPACT_PUFFS);
  /** Bigger puffs where BBs land on players: hit confirmation at range. */
  private readonly hitPuffs = new ImpactPuffs(HIT_PUFFS);
  private readonly paths: BBPathsDebug;
  private readonly viewmodel: Viewmodel;
  private readonly hud: Hud;
  private readonly sfx: Sfx;
  private readonly forward = new THREE.Vector3();
  private readonly listenerPos = { x: 0, y: 0, z: 0 };
  private readonly muzzle = new THREE.Vector3();
  private readonly dir = { x: 0, y: 0, z: 0 };
  /** Newest BB serial already given a muzzle start, per shooter. */
  private readonly lastSerialByOwner = new Map<number, number>();
  private readonly overlay: { scene: THREE.Scene; camera: THREE.Camera };
  private playing = false;
  /** The round in play started behind a screen (round 1 of a match, set up before play): whistle on Play. */
  private startWhistleOwed = true;
  /** How far the player's optic is raised to their eye (0..1): eases over AIMING.raiseTime. */
  private aimBlend = 0;
  /** The zoom of the optic the sight was last raised on: switching away eases out of it rather than snapping. */
  private aimZoom = 1;

  /** How far the player's optic is raised to their eye (0..1); the aiming sensitivity blends in with it. */
  get aimRaised(): number {
    return this.aimBlend;
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
    keyName: (action: Action) => string,
  ) {
    this.sfx = new Sfx(loadout);
    this.bbs = new BBRenderer(state.bbs, tickSeconds);
    this.paths = new BBPathsDebug(state.bbs);
    renderer.scene.add(this.bbs.object, this.puffs.object, this.hitPuffs.object, this.paths.object);
    this.viewmodel = new Viewmodel(renderer.camera.aspect, teamColor, loadout);
    this.overlay = { scene: this.viewmodel.scene, camera: this.viewmodel.camera };
    this.hud = new Hud(container, keyName);
  }

  /** Browsers only allow audio after a user gesture: call from the Play click. */
  unlockAudio(): void {
    this.sfx.unlock();
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

  get bbsInFlight(): number {
    return this.bbs.visibleCount;
  }

  /** Call after every simulation tick, while that tick's events are still in the state. */
  afterTick(): void {
    this.paths.recordTick();
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
      } else if (e.type === 'bbImpact') this.puffs.spawn(e.position);
      else if (e.type === 'characterHit') {
        // Your own hit: the replica jolts in your hands (the puff would fill your view).
        if (e.victimId === this.player.id) this.viewmodel.onHit();
        else this.hitPuffs.spawn(e.position);
      } else if (e.type === 'reloadRefused' && e.characterId === this.player.id) {
        this.hud.showNotice('No fuller magazine', HUD.noticeTime);
      }
      if (e.type === 'shot') {
        if (e.characterId === this.player.id) this.viewmodel.onShot();
        this.drawFromMuzzle(e.characterId);
      }
      this.sfx.onEvent(e, this.player.id, this.positionOf);
    }
  }

  /** Once per rendered frame, after the camera has been placed. `alpha` interpolates ticks. */
  frame(dt: number, alpha: number, yaw: number, pitch: number): void {
    this.bbs.update(alpha, this.renderer.camera.position);
    this.puffs.update(dt, this.renderer.camera.position);
    this.hitPuffs.update(dt, this.renderer.camera.position);
    this.paths.update();

    const p = this.player;
    const carried = p.sprinting || p.sprintLockout > 0;
    // Aiming down sights: the sight comes up to your eye and the view narrows by the optic's zoom. Straight out of a
    // sprint the replica is still carried (firing is locked out too), so it rises once that ends.
    const aiming = p.aiming && p.status === 'alive' && !carried;
    this.aimBlend = Math.max(0, Math.min(1, this.aimBlend + (aiming ? dt : -dt) / AIMING.raiseTime));
    const optic = p.armament.optics[p.armament.active];
    if (aiming && optic) this.aimZoom = OPTICS[optic].zoom;
    this.renderer.setZoom(1 + (this.aimZoom - 1) * this.aimBlend);
    this.viewmodel.setAspect(this.renderer.camera.aspect);
    const carry = p.sprinting ? 1 : sprintCarry(p.sprintLockout, this.movement.sprintFireLockout);
    this.viewmodel.update(dt, yaw, pitch, Math.hypot(p.velocity.x, p.velocity.z), this.movement.runSpeed, carry, p.armament, this.loadout, p.status === 'calling', this.aimBlend);
    // The shot spread right now (replica × stance and movement), as pixels on screen at the centre.
    const cam = this.renderer.camera;
    const spread = THREE.MathUtils.degToRad(this.loadout[p.armament.active]!.spreadDeg * p.spreadScale);
    const focalPx = this.renderer.height / 2 / Math.tan(THREE.MathUtils.degToRad(cam.fov) / 2);
    this.hud.update(p.armament, this.loadout, p.status === 'alive', Math.tan(spread) * focalPx, optic != null && this.aimBlend >= AIMING.reticleFrom, dt);

    cam.getWorldDirection(this.forward);
    this.listenerPos.x = cam.position.x;
    this.listenerPos.y = cam.position.y;
    this.listenerPos.z = cam.position.z;
    this.sfx.setListener(this.listenerPos, this.forward.x, this.forward.y, this.forward.z);
  }

  /** Draws the frame; the held replica only when the camera is in first person. */
  render(firstPerson: boolean): void {
    this.renderer.render(firstPerson ? this.overlay : undefined);
  }

  dispose(): void {
    this.bbs.dispose();
    this.puffs.dispose();
    this.hitPuffs.dispose();
    this.paths.dispose();
    this.viewmodel.dispose();
    this.hud.dispose();
    this.sfx.dispose();
  }

  /**
   * Starts a shooter's newest BB (if the shot spawned one) visually at their replica's muzzle: the
   * held replica for you, the third-person figure's rifle for everyone else (BBs really leave from the
   * eyes, which would look like they come out of faces).
   */
  private drawFromMuzzle(shooterId: number): void {
    const last = this.lastSerialByOwner.get(shooterId) ?? 0;
    let newest: BB | undefined;
    for (const bb of this.state.bbs.bbs) {
      if (bb.active && bb.ownerId === shooterId && bb.serial > last && (!newest || bb.serial > newest.serial)) newest = bb;
    }
    if (!newest) return; // blocked muzzle: the shot hit cover immediately
    this.lastSerialByOwner.set(shooterId, newest.serial);
    let ok: boolean;
    if (shooterId === this.player.id) {
      ok = this.viewmodel.muzzleWorld(this.renderer.camera, this.muzzle);
    } else {
      const shooter = this.state.characters.find((c) => c.id === shooterId);
      ok = shooter !== undefined;
      if (shooter) figureMuzzle(shooter, this.muzzle);
    }
    if (ok) this.bbs.startFromMuzzle(newest, this.muzzle, this.estimateFlightTime(newest));
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

  private readonly positionOf = (id: number): { x: number; y: number; z: number } | undefined =>
    this.state.characters.find((c) => c.id === id)?.position;
}
