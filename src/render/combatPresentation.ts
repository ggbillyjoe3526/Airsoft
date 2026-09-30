import * as THREE from 'three';
import { Sfx } from '../audio/sfx';
import { BB_VISUALS } from '../config/render';
import type { MovementConfig } from '../config/movement';
import type { ReplicaConfig } from '../config/replicas';
import type { WorldQuery } from '../sim/armament';
import type { BB } from '../sim/ballistics';
import type { Character } from '../sim/character';
import type { GameState } from '../sim/state';
import { Hud } from '../ui/hud';
import { BBPathsDebug } from './bbPathsDebug';
import { BBRenderer } from './bbRenderer';
import { ImpactPuffs } from './impactPuffs';
import type { Renderer } from './renderer';
import { Viewmodel } from './viewmodel';

/**
 * Everything the player sees and hears about replicas and BBs: BBs in flight, impact puffs, the held
 * replica, the ammo HUD and sound. Reads simulation state and the events of each tick; never writes.
 */
export class CombatPresentation {
  private readonly bbs: BBRenderer;
  private readonly puffs = new ImpactPuffs();
  private readonly paths: BBPathsDebug;
  private readonly viewmodel: Viewmodel;
  private readonly hud: Hud;
  private readonly sfx: Sfx;
  private readonly forward = new THREE.Vector3();
  private readonly listenerPos = { x: 0, y: 0, z: 0 };
  private readonly muzzle = new THREE.Vector3();
  private readonly dir = { x: 0, y: 0, z: 0 };
  private lastOwnSerial = 0;
  private readonly overlay: { scene: THREE.Scene; camera: THREE.Camera };

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
  ) {
    this.sfx = new Sfx(loadout);
    this.bbs = new BBRenderer(state.bbs, tickSeconds);
    this.paths = new BBPathsDebug(state.bbs);
    renderer.scene.add(this.bbs.object, this.puffs.object, this.paths.object);
    this.viewmodel = new Viewmodel(renderer.camera.aspect, teamColor, loadout);
    this.overlay = { scene: this.viewmodel.scene, camera: this.viewmodel.camera };
    this.hud = new Hud(container);
  }

  /** Browsers only allow audio after a user gesture: call from the Play click. */
  unlockAudio(): void {
    this.sfx.unlock();
  }

  setPlaying(playing: boolean): void {
    this.hud.setVisible(playing);
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
      if (e.type === 'bbImpact') this.puffs.spawn(e.position);
      if (e.type === 'shot' && e.characterId === this.player.id) {
        this.viewmodel.onShot();
        this.drawFromMuzzle();
      }
      this.sfx.onEvent(e, this.player.id, this.positionOf);
    }
  }

  /** Once per rendered frame, after the camera has been placed. `alpha` interpolates ticks. */
  frame(dt: number, alpha: number, yaw: number, pitch: number): void {
    this.bbs.update(alpha, this.renderer.camera.position);
    this.puffs.update(dt, this.renderer.camera.position);
    this.paths.update();

    const p = this.player;
    const carried = p.sprinting || p.sprintLockout > 0;
    this.viewmodel.setAspect(this.renderer.camera.aspect);
    this.viewmodel.update(dt, yaw, pitch, Math.hypot(p.velocity.x, p.velocity.z), this.movement.walkSpeed, carried, p.armament, this.loadout);
    this.hud.update(p.armament, this.loadout);

    const cam = this.renderer.camera;
    cam.getWorldDirection(this.forward);
    this.listenerPos.x = cam.position.x;
    this.listenerPos.y = cam.position.y;
    this.listenerPos.z = cam.position.z;
    this.sfx.setListener(this.listenerPos, this.forward.x, this.forward.y, this.forward.z);
  }

  render(): void {
    this.renderer.render(this.overlay);
  }

  dispose(): void {
    this.bbs.dispose();
    this.puffs.dispose();
    this.paths.dispose();
    this.viewmodel.dispose();
    this.hud.dispose();
    this.sfx.dispose();
  }

  /** Starts the player's newest BB (if the shot spawned one) visually at the replica's muzzle. */
  private drawFromMuzzle(): void {
    let newest: BB | undefined;
    for (const bb of this.state.bbs.bbs) {
      if (bb.active && bb.ownerId === this.player.id && bb.serial > this.lastOwnSerial && (!newest || bb.serial > newest.serial)) newest = bb;
    }
    if (!newest) return; // blocked muzzle: the shot hit cover immediately
    this.lastOwnSerial = newest.serial;
    if (this.viewmodel.muzzleWorld(this.renderer.camera, this.muzzle)) {
      this.bbs.startFromMuzzle(newest, this.muzzle, this.estimateFlightTime(newest));
    }
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
