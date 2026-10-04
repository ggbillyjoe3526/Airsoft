import type * as THREE from 'three';
import type { SfxSetup } from './audio/sfx';
import { FULL_MOTION, type MotionScale } from './config/accessibility';
import { BALLISTICS } from './config/ballistics';
import { FOOTSTEPS } from './config/footsteps';
import { HITS, ROUNDS } from './config/hits';
import type { CrosshairSettings } from './config/matchInfo';
import { BODY, MOVEMENT } from './config/movement';
import { NAV } from './config/nav';
import { opticOf } from './config/optics';
import { PHYSICS } from './config/physics';
import { RANGE } from './config/range';
import type { QualitySettings } from './config/render';
import type { ReplicaConfig } from './config/replicas';
import { SIM, SIM_DT } from './config/sim';
import { advanceStepper, createStepper, stepperAlpha } from './core/fixedStepper';
import type { PlayerInput } from './input/playerInput';
import type { MatchSetup } from './matchSession';
import { RANGE_MAP } from './map/range';
import { buildNavGrid } from './nav/navGrid';
import { PhysicsWorld } from './physics/physicsWorld';
import { updateFirstPersonCamera } from './render/cameraRig';
import { CombatPresentation } from './render/combatPresentation';
import { addLighting } from './render/lighting';
import { buildMapMeshes, disposeMapMeshes } from './render/mapMeshes';
import { createSurfaceTextures, disposeSurfaceTextures, type SurfaceTextures } from './render/proceduralTextures';
import { RangeTargetsRenderer } from './render/rangeTargetsRenderer';
import type { Renderer } from './render/renderer';
import { canAimDownSights } from './sim/aiming';
import { fitOptic, fitParts, setBbWeights, setHopUps } from './sim/armament';
import { type Character, createCharacter, respawnCharacter } from './sim/character';
import { createCommand, type PlayerCommand } from './sim/commands';
import { createRangeTargets } from './sim/rangeTargets';
import { createSimContext, type SimContext, stepSimulation } from './sim/simulation';
import { createGameState, type GameState } from './sim/state';
import { vec3 } from './sim/vec';
import { type LastShot, lastShotText, RangeReadout } from './ui/rangeReadout';

const PLAYER_ID = 0;

/** What the range needs from New game's choices: the loadout (the match rules don't apply). */
export type RangeSetup = Pick<MatchSetup, 'loadout' | 'optic' | 'hopUps' | 'bbWeights' | 'parts' | 'teamColours'>;

/** Where you stand and which way you face: kept when the range is rebuilt for a new loadout. */
export interface RangePose {
  x: number;
  z: number;
  yaw: number;
  pitch: number;
}

/**
 * The practice range (M21): you alone on the range map with the targets, no rounds, the spare magazines always full,
 * and a readout of where your last BB landed. Built from the title screen's Practice range button and disposed when
 * you leave it; changing the loadout (from the pause menu) rebuilds it where you stood. The app around it (renderer,
 * input, menus) outlives it, as it does a match (see MatchSession, whose pieces it shares).
 */
export class RangeSession {
  readonly state: GameState;
  readonly player: Character;
  readonly combat: CombatPresentation;
  private readonly loadout: readonly ReplicaConfig[];
  private readonly physics: PhysicsWorld;
  private readonly textures: SurfaceTextures;
  private readonly mapGroup: THREE.Group;
  private readonly targets: RangeTargetsRenderer;
  private readonly readout: RangeReadout;
  private readonly disposeLighting: () => void;
  private readonly stepper = createStepper(SIM_DT, SIM.maxTicksPerFrame);
  private readonly commands = new Map<number, PlayerCommand>();
  private readonly playerCommand = createCommand();
  private motion: MotionScale = FULL_MOTION;
  private readonly ctx: SimContext;
  private lastShot: LastShot | null = null;

  constructor(
    private readonly renderer: Renderer,
    container: HTMLElement,
    private readonly input: PlayerInput,
    readonly setup: RangeSetup,
    seed: number,
    quality: QualitySettings,
    audio: SfxSetup,
    crosshair: CrosshairSettings,
    pose?: RangePose,
  ) {
    const map = RANGE_MAP;
    this.loadout = setup.loadout;
    this.textures = createSurfaceTextures();
    this.mapGroup = buildMapMeshes(map, this.textures);
    renderer.scene.add(this.mapGroup);
    this.disposeLighting = addLighting(renderer.scene, map, quality);

    this.physics = new PhysicsWorld(map, BODY, SIM_DT);
    const nav = buildNavGrid(map, NAV);
    this.state = createGameState(seed, BALLISTICS.maxBBs, ROUNDS);
    this.state.targets = createRangeTargets();
    this.ctx = createSimContext({
      mover: this.physics,
      query: this.physics,
      movement: MOVEMENT,
      footsteps: FOOTSTEPS,
      body: BODY,
      ballistics: BALLISTICS,
      loadout: this.loadout,
      killY: map.killY,
      hits: HITS,
      deadZones: map.deadZones,
      spawnLift: PHYSICS.groundRestGap,
      nav,
      navSnap: NAV.snap,
      rounds: ROUNDS,
      practice: true,
    });
    const spawn = map.spawns[0][0]!;
    const at = pose ? vec3(pose.x, spawn.position.y, pose.z) : spawn.position;
    this.player = createCharacter(PLAYER_ID, vec3(at.x, at.y + PHYSICS.groundRestGap, at.z), pose?.yaw ?? spawn.yaw, this.loadout, 0);
    respawnCharacter(this.player, this.loadout);
    this.state.characters.push(this.player);
    this.physics.addCharacter(this.player);
    this.fitPickedLoadout();
    this.commands.set(PLAYER_ID, this.playerCommand);
    input.resetView(pose?.yaw ?? spawn.yaw);
    if (pose) input.pitch = pose.pitch;

    this.combat = new CombatPresentation(renderer, container, this.state, this.player, this.loadout, MOVEMENT, this.physics, setup.teamColours.figures[this.player.team]!, SIM_DT, map.blocks, audio, (action) => input.keyName(action), crosshair);
    this.combat.skipStartWhistle();
    this.targets = new RangeTargetsRenderer(this.state.targets, HITS);
    renderer.scene.add(this.targets.object);
    this.readout = new RangeReadout(container);
    this.readout.set(lastShotText(null));
  }

  /** Where you stand and look now, to rebuild the range there. */
  get pose(): RangePose {
    return { x: this.player.position.x, z: this.player.position.z, yaw: this.input.yaw, pitch: this.input.pitch };
  }

  get characterCount(): number {
    return this.state.characters.length;
  }

  /** One frame of practice: reads the input, then runs the ticks that are due. Returns how many ran. */
  advance(dt: number): number {
    const p = this.player;
    this.input.update(p.armament.active, this.loadout.length, this.combat.aimRaised, this.combat.aimSensitivityScale, canAimDownSights(p.armament, this.loadout));
    const ticks = advanceStepper(this.stepper, dt);
    for (let i = 0; i < ticks; i++) {
      this.input.fillCommand(this.playerCommand);
      stepSimulation(this.state, this.commands, this.ctx, SIM_DT);
      this.afterTick();
    }
    return ticks;
  }

  /** The range never ends by itself. */
  takeResultDue(): boolean {
    return false;
  }

  draw(dt: number): void {
    const alpha = stepperAlpha(this.stepper);
    const pitch = this.input.pitch + this.player.armament.recoil;
    updateFirstPersonCamera(this.renderer.camera, this.player, BODY, HITS, alpha, this.input.yaw, pitch, this.motion.leanRoll);
    this.targets.update(dt);
    this.combat.frame(dt, alpha, this.input.yaw, pitch);
    this.combat.render(true);
  }

  setMotion(scale: MotionScale): void {
    this.motion = scale;
    this.combat.setMotion(scale);
  }

  setPlaying(playing: boolean): void {
    this.combat.setPlaying(playing);
    this.readout.setVisible(playing);
  }

  dispose(): void {
    this.combat.dispose();
    this.targets.dispose();
    this.readout.dispose();
    this.renderer.scene.remove(this.mapGroup);
    disposeMapMeshes(this.mapGroup);
    disposeSurfaceTextures(this.textures);
    this.disposeLighting();
    this.physics.dispose();
    this.renderer.setZoom(1);
  }

  /** Fits the picked optic, parts, hop-up dials and BB weights to your replicas (fresh magazines of the picked kind). */
  private fitPickedLoadout(): void {
    fitOptic(this.player.armament, this.loadout, opticOf(this.setup.optic));
    fitParts(this.player.armament, this.loadout, this.setup.parts);
    setHopUps(this.player.armament, this.setup.hopUps);
    setBbWeights(this.player.armament, this.setup.bbWeights);
  }

  private afterTick(): void {
    this.combat.afterTick();
    this.targets.afterTick(this.state.events);
    for (const e of this.state.events) {
      // Your BB came down (a ricochet's last stop wins), hit a target, or flew out over a wall.
      if (e.type === 'bbImpact' && e.ownerId === PLAYER_ID) this.lastShot = { distance: downrange(e.position), target: null };
      else if (e.type === 'bbLost' && e.ownerId === PLAYER_ID) {
        // Out over a wall or the backstop; one that just ran out of time inside the range counts where it was.
        this.lastShot = insideRange(e.position) ? { distance: downrange(e.position), target: null } : { distance: 0, target: null, lost: true };
      }
      else if (e.type === 'targetHit' && e.shooterId === PLAYER_ID) {
        const t = this.state.targets.find((x) => x.id === e.targetId);
        this.lastShot = { distance: downrange(e.position), target: t ? { label: t.label, distance: t.distance } : null };
      } else continue;
      this.readout.set(lastShotText(this.lastShot));
    }
  }
}

/** How far downrange of the firing line (m), the way the markers and target labels count. */
function downrange(p: { z: number }): number {
  return Math.max(0, -p.z);
}

/** Within the range's walls and backstop (at any height). */
function insideRange(p: { x: number; y: number; z: number }): boolean {
  return Math.abs(p.x) <= RANGE.halfWidth && p.z >= -RANGE.backstop && p.z <= RANGE.behindLine && p.y >= 0;
}
