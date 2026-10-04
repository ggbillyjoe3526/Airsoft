import type * as THREE from 'three';
import type { SfxSetup } from './audio/sfx';
import { FULL_MOTION, type MotionScale } from './config/accessibility';
import { BALLISTICS, WIND } from './config/ballistics';
import { FOOTSTEPS } from './config/footsteps';
import { HITS, ROUNDS } from './config/hits';
import type { CrosshairSettings } from './config/matchInfo';
import { BODY, MOVEMENT } from './config/movement';
import { NAV } from './config/nav';
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
import { bbGlowFor } from './pool/loadoutModel';
import { updateFirstPersonCamera } from './render/cameraRig';
import { CombatPresentation } from './render/combatPresentation';
import { addLighting, type Daylight } from './render/lighting';
import { buildMapMeshes, disposeMapMeshes, setMapRelief, setMapTextures } from './render/mapMeshes';
import { RangeTargetsRenderer } from './render/rangeTargetsRenderer';
import type { Renderer } from './render/renderer';
import { canAimDownSights } from './sim/aiming';
import { fitOptics, fitParts, setBbWeights, setHopUps } from './sim/armament';
import { type Character, createCharacter, respawnCharacter } from './sim/character';
import { createCommand, type PlayerCommand } from './sim/commands';
import { createRangeTargets } from './sim/rangeTargets';
import { createSimContext, type SimContext, stepSimulation } from './sim/simulation';
import { createWind } from './sim/wind';
import { createGameState, type GameState } from './sim/state';
import { vec3 } from './sim/vec';
import type { DevSettings } from './config/dev';
import { TUTORIAL_STEPS } from './config/tutorial';
import { TutorialTracker, type TutorialView } from './tutorial/tutorial';
import { CoachPanel } from './ui/coachPanel';
import { type LastShot, lastShotText, RangeReadout } from './ui/rangeReadout';

const PLAYER_ID = 0;

/** What the range needs from New game's choices: the loadout (the match rules don't apply). */
export type RangeSetup = Pick<MatchSetup, 'kit' | 'teamColours'>;

/** Where you stand and which way you face: kept when the range is rebuilt for a new loadout. */
export interface RangePose {
  x: number;
  z: number;
  yaw: number;
  pitch: number;
}

/**
 * The practice range (M21): you alone on the range map with the targets, no rounds, the spare magazines always full,
 * and a readout of where your last BB landed. The tutorial (M16) runs here too, its coach in the readout's place
 * until the last step, then free practice. Built from the title screen's Practice range button and disposed when
 * you leave it; changing the loadout (from the pause menu) rebuilds it where you stood. The app around it (renderer,
 * input, menus) outlives it, as it does a match (see MatchSession, whose pieces it shares).
 */
export class RangeSession {
  readonly state: GameState;
  readonly player: Character;
  readonly combat: CombatPresentation;
  private readonly loadout: readonly ReplicaConfig[];
  private readonly physics: PhysicsWorld;
  private readonly mapGroup: THREE.Group;
  private readonly targets: RangeTargetsRenderer;
  private readonly readout: RangeReadout;
  private readonly daylight: Daylight;
  private readonly stepper = createStepper(SIM_DT, SIM.maxTicksPerFrame);
  private readonly commands = new Map<number, PlayerCommand>();
  private readonly playerCommand = createCommand();
  private motion: MotionScale = FULL_MOTION;
  private readonly ctx: SimContext;
  private lastShot: LastShot | null = null;
  /** The tutorial (M16), when the range was opened for it, and its coach. */
  private tutorial: TutorialTracker | null = null;
  private coach: CoachPanel | null = null;
  private tutorialFinishedOwed = false;
  private tutorialFinishedSeen = false;
  /**
   * Told the id of the tutorial's step still to do ('' once all are done) whenever it moves on (audit POOL-14: the game
   * saves it, to resume there).
   */
  onTutorialStep: ((stepId: string) => void) | null = null;
  /** Play is running (not paused). */
  private playing = false;
  /** The step still to do last reported to onTutorialStep. */
  private savedStep: string | null = null;
  /** What the tutorial reads after each tick, reused rather than made anew. */
  private readonly tutorialView: TutorialView;

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
    /** Run the tutorial (M16) from this step, by index or id (0: the start); leave out for free practice. */
    tutorialFrom?: number | string,
  ) {
    const map = RANGE_MAP;
    this.loadout = setup.kit.slots.map((s) => s.replica);
    // The surface textures are the renderer's, shared by every session (audit L-04).
    this.mapGroup = buildMapMeshes(map, renderer.surfaceTextures, quality.surfaceRelief);
    renderer.scene.add(this.mapGroup);
    this.daylight = addLighting(renderer.scene, map, quality);

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
      wind: createWind(seed, WIND),
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
    this.tutorialView = { dt: SIM_DT, player: this.player, events: this.state.events, targets: this.state.targets };
    respawnCharacter(this.player);
    this.state.characters.push(this.player);
    this.physics.addCharacter(this.player);
    this.fitPickedLoadout();
    this.commands.set(PLAYER_ID, this.playerCommand);
    input.resetView(pose?.yaw ?? spawn.yaw);
    // Nobody to order on the range: the order wheel's key does nothing.
    input.ordersEnabled = false;
    if (pose) input.pitch = pose.pitch;

    this.combat = new CombatPresentation(renderer, container, this.state, this.player, this.loadout, MOVEMENT, this.physics, setup.teamColours.figures[this.player.team]!, SIM_DT, map.blocks, audio, (action) => input.keyName(action), crosshair, quality, HITS, bbGlowFor(setup.kit, map.night ?? false));
    this.combat.skipStartWhistle();
    this.targets = new RangeTargetsRenderer(this.state.targets, HITS);
    this.targets.setReceiveShadows(quality.figureShadows);
    renderer.scene.add(this.targets.object);
    this.readout = new RangeReadout(container);
    this.readout.set(lastShotText(null));
    if (tutorialFrom !== undefined) {
      this.tutorial = new TutorialTracker(TUTORIAL_STEPS, canAimDownSights(this.player.armament), tutorialFrom, this.loadout.length);
      this.coach = new CoachPanel(container, (action) => input.keyName(action));
      this.coach.show(this.tutorial);
    }
  }

  /** The tutorial's step to rebuild the range at (undefined: free practice, or the tutorial is over). */
  get tutorialStep(): number | undefined {
    const t = this.tutorial;
    return t && t.goalIndex < t.steps.length ? t.goalIndex : undefined;
  }

  /** "Tutorial · step 3 of 10", or "Practice range". */
  get status(): string {
    const t = this.tutorial;
    return t && !t.finished ? `Tutorial · step ${t.stepIndex + 1} of ${t.steps.length}: ${t.step!.title}` : 'Practice range';
  }

  /** The tutorial is running (its coach up): the pause menu offers Skip step and Skip tutorial (audit POOL-14). */
  get coaching(): boolean {
    return this.tutorial !== null && !this.tutorial.finished;
  }

  /** The pause menu's Skip step: the next step starts (the last skipped ends the tutorial). */
  skipTutorialStep(): void {
    const t = this.tutorial;
    if (!t || t.finished) return;
    t.skip();
    this.tutorialMoved(t);
  }

  /** The pause menu's Skip tutorial: free practice from here, and the tutorial counts as done. */
  endTutorial(): void {
    const t = this.tutorial;
    if (!t || t.finished) return;
    while (!t.finished) t.skip();
    this.tutorialMoved(t);
  }

  /** True once, when the tutorial's last step is done (so the game can remember it was finished). */
  takeTutorialFinished(): boolean {
    if (!this.tutorialFinishedOwed) return false;
    this.tutorialFinishedOwed = false;
    return true;
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
    this.input.update(p.armament.active, this.loadout.length, this.combat.aimRaised, this.combat.aimSensitivityScale, canAimDownSights(p.armament));
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
    this.daylight.follow(this.renderer.camera);
    this.combat.render(true);
  }

  setMotion(scale: MotionScale): void {
    this.motion = scale;
    this.combat.setMotion(scale);
  }

  /**
   * The Dev settings that change play (M24). Nobody shoots at you here, so only Bottomless magazines applies, and not
   * in the tutorial: its reload steps need a magazine to run down.
   */
  setDevCheats(cheats: DevSettings): void {
    this.player.armament.bottomless = cheats.bottomlessMags && !this.tutorial;
  }

  /** New quality settings (Settings → Graphics): as MatchSession.setQuality. */
  setQuality(quality: QualitySettings): void {
    this.daylight.setQuality(quality);
    setMapTextures(this.mapGroup, this.renderer.surfaceTextures);
    setMapRelief(this.mapGroup, quality.surfaceRelief);
    this.targets.setReceiveShadows(quality.figureShadows);
    this.combat.setQuality(quality);
  }

  /** The graphics context is back after a loss: as MatchSession.contextRestored. */
  contextRestored(): void {
    this.combat.contextRestored();
  }

  setPlaying(playing: boolean): void {
    this.playing = playing;
    this.combat.setPlaying(playing);
    const coaching = this.tutorial !== null && !this.tutorial.finished;
    this.readout.setVisible(playing && !coaching);
    this.coach?.setVisible(playing && coaching);
    if (playing && coaching) this.coach!.show(this.tutorial!); // a key may have been rebound while paused
  }

  dispose(): void {
    this.combat.dispose();
    this.targets.dispose();
    this.readout.dispose();
    this.coach?.dispose();
    this.renderer.scene.remove(this.mapGroup);
    disposeMapMeshes(this.mapGroup);
    this.daylight.dispose();
    this.physics.dispose();
    this.renderer.setZoom(1);
  }

  /** Fits the picked optic, parts, hop-up dials and BB weights to your replicas (fresh magazines of the picked kind). */
  private fitPickedLoadout(): void {
    const kit = this.setup.kit;
    fitOptics(this.player.armament, kit.slots.map((s) => s.optic));
    fitParts(this.player.armament, kit.slots.map((s) => s.parts));
    setHopUps(this.player.armament, kit.hopUps);
    setBbWeights(this.player.armament, kit.bbWeights);
  }

  /** The tutorial's step shown or still to do changed (a step done, or skipped). */
  private tutorialMoved(t: TutorialTracker): void {
    this.coach!.show(t);
    if (t.goalId !== this.savedStep) {
      this.savedStep = t.goalId;
      this.onTutorialStep?.(t.goalId);
    }
    // Done as soon as the last step is (its tick still shows), so a rebuild in that moment can't lose it.
    if (t.goalIndex >= t.steps.length && !this.tutorialFinishedSeen) this.tutorialFinishedOwed = this.tutorialFinishedSeen = true;
    if (t.finished && this.playing) {
      // Free practice from here: the readout takes the coach's place (on Resume, after a skip from the pause menu).
      this.coach!.setVisible(false);
      this.readout.setVisible(true);
    }
  }

  private afterTick(): void {
    this.combat.afterTick();
    this.targets.afterTick(this.state.events);
    const t = this.tutorial;
    const v = this.tutorialView;
    v.player = this.player;
    v.events = this.state.events;
    v.targets = this.state.targets;
    if (t && !t.finished && t.observe(v)) this.tutorialMoved(t);
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
      this.coach?.setShot(lastShotText(this.lastShot));
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
