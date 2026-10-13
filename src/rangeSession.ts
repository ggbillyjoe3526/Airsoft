import type { SfxSetup } from './audio/sfx';
import { FULL_MOTION, type MotionScale } from './config/accessibility';
import { BALLISTICS, WIND } from './config/ballistics';
import { FOOTSTEPS } from './config/footsteps';
import { HITS, ROUNDS } from './config/hits';
import type { CrosshairSettings } from './config/matchInfo';
import { BODY, MOVEMENT } from './config/movement';
import { NAV } from './config/nav';
import { PHYSICS } from './config/physics';
import { PRACTICE_SPOTS } from './config/practice';
import { RANGE } from './config/range';
import type { QualitySettings } from './config/render';
import type { ReplicaConfig } from './config/replicas';
import { SIM, SIM_DT } from './config/sim';
import { cssColor, teamCss } from './config/teams';
import type { MinimapTurn } from './config/minimap';
import { EventLog } from './core/eventLog';
import { advanceStepper, createStepper, stepperAlpha } from './core/fixedStepper';
import type { PlayerInput } from './input/playerInput';
import type { MatchSetup } from './matchSession';
import type { MapData } from './map/mapTypes';
import { practiceSpots } from './map/practiceSpots';
import { RANGE_MAP } from './map/range';
import { buildNavGrid } from './nav/navGrid';
import { PhysicsWorld } from './physics/physicsWorld';
import { bbGlowFor, kitPaint } from './pool/loadoutModel';
import { figureCrowd, playerArms } from './render/figureMix';
import { updateFirstPersonCamera } from './render/cameraRig';
import { CombatPresentation } from './render/combatPresentation';
import { bakedLightFor } from './render/bakedLight';
import { addLighting, type Daylight } from './render/lighting';
import { resolveLighting } from './render/lightingPreset';
import { mapLookOf } from './render/mapMeshes';
import type { ProbeGrid } from './render/probeGrid';
import { RangeTargetsRenderer } from './render/rangeTargetsRenderer';
import { TorchBeams } from './render/torchBeams';
import type { Renderer } from './render/renderer';
import { canAimDownSights } from './sim/aiming';
import { fitOptics, fitParts, setBbWeights, setHopUps } from './sim/armament';
import { type Character, createCharacter, respawnCharacter } from './sim/character';
import { createCommand, type PlayerCommand } from './sim/commands';
import { createRangeTargets, targetsAtSpots } from './sim/rangeTargets';
import { createSimContext, type SimContext, stepSimulation } from './sim/simulation';
import { partsUnder } from './sim/torch';
import { createWind } from './sim/wind';
import { createGameState, type GameState } from './sim/state';
import { vec3 } from './sim/vec';
import type { DevSettings } from './config/dev';
import { tutorialSteps } from './config/tutorial';
import { TutorialTracker, type TutorialView } from './tutorial/tutorial';
import { CoachPanel } from './ui/coachPanel';
import { Minimap, type MinimapFrame } from './ui/minimap';
import type { HeardPlayer } from './ui/minimapView';
import { TutorialShowcase } from './ui/tutorialShowcase';
import { type LastShot, lastShotText, RangeReadout } from './ui/rangeReadout';

const PLAYER_ID = 0;

/** Practice has nobody to hear (M94): the minimap's heard players, always none. */
const NOBODY_HEARD: readonly HeardPlayer[] = [];

/** What the range needs from New game's choices: the loadout (the match rules don't apply). */
export type RangeSetup = Pick<MatchSetup, 'kit' | 'teamColours' | 'look'> & {
  /** Whether the Armory is on (M83: off, the tutorial never names it); on when left out. */
  armory?: boolean;
  /**
   * The map to practise on (M94), under the light it plays in: targets where the other team's bots would play
   * (map/practiceSpots.ts) and no bots. Left out: the range (the tutorial's always).
   */
  map?: MapData;
};

/** Where you stand and which way you face: kept when the range is rebuilt for a new loadout. */
export interface RangePose {
  x: number;
  /** The floor's height you stood over (M94: a map's upper storey); the start's when left out. */
  y?: number;
  z: number;
  yaw: number;
  pitch: number;
}

/**
 * Practice (M21; M94 renamed it from the practice range): you alone on the range map with the targets, no rounds, the
 * spare magazines always full, and a readout of where your last BB landed. On a map (M94) the targets stand where the
 * other team's bots would play, you start at your team's end, your torch lights the night and the minimap shows the
 * field. The tutorial (M16) runs on the range, its coach in the readout's place until the last step, then free
 * practice. Built from the Match screen's Practice and disposed when you leave it; changing the loadout (from the pause
 * menu) rebuilds it where you stood. The app around it (renderer, input, menus) outlives it, as it does a match (see
 * MatchSession, whose pieces it shares).
 */
export class RangeSession {
  readonly state: GameState;
  readonly player: Character;
  readonly combat: CombatPresentation;
  private readonly loadout: readonly ReplicaConfig[];
  private readonly physics: PhysicsWorld;
  /** The range, or the map practised on (M94, RangeSetup.map). */
  private readonly map: MapData;
  private readonly targets: RangeTargetsRenderer;
  /** The weapon torches drawn (M33h; M94: yours, on a night map). */
  private readonly torches: TorchBeams;
  /** The map's minimap (M94), as in a match; null on the range, a corridor you see whole. */
  private readonly minimap: Minimap | null;
  private readonly minimapFrame: MinimapFrame = { x: 0, y: 0, z: 0, yaw: 0, mates: [], count: 0, hold: null, flag: null, exits: [], exitCount: 0, time: 0 };
  private readonly readout: RangeReadout;
  private readonly daylight: Daylight;
  /** The range's baked bounce light (M81, as Depot's: render/bakedLight.ts), or null before it loads. */
  private readonly probes: ProbeGrid | null;
  /** Whether the range is lit by a night preset (M33h: the weapon light is fitted only then). */
  private readonly night: boolean;
  private readonly stepper = createStepper(SIM_DT, SIM.maxTicksPerFrame);
  private readonly commands = new Map<number, PlayerCommand>();
  private readonly playerCommand = createCommand();
  private motion: MotionScale = FULL_MOTION;
  private readonly ctx: SimContext;
  private lastShot: LastShot | null = null;
  /** The tutorial (M16), when the range was opened for it, and its coach. */
  private tutorial: TutorialTracker | null = null;
  private coach: CoachPanel | null = null;
  /** What a step opens on screen (M80): the scoreboard or the order wheel, while that step shows. */
  private showcase: TutorialShowcase | null = null;
  /**
   * The tutorial's last step was just played to its end (M80): the mouse is given back (takeResultDue) and the pause
   * shows the "Tutorial complete" pop-up instead of the pause menu (takeTutorialComplete). Not after Skip tutorial.
   */
  private completeDue = false;
  private completePopup = false;
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
    const map = setup.map ?? RANGE_MAP;
    const onRange = map === RANGE_MAP;
    this.map = map;
    this.loadout = setup.kit.slots.map((s) => s.replica);
    // The surface textures are the renderer's, shared by every session (audit L-04), and so are the last map's meshes,
    // kept between sessions (audit CORE-33): the same map again takes them back rather than building them.
    // M81: the range in the new look, baked light and set dressing as Depot's (map/rangeDressing.ts).
    this.probes = bakedLightFor(map);
    const group = renderer.mapMeshes.take(map, renderer.surfaceTexturesFor(map), mapLookOf(quality, this.probes));
    renderer.scene.add(group);
    // The map's light (M33f): its haze, exposure and environment on the renderer, set by every session so none keeps the
    // last map's; its lights, sky and light pools in the scene.
    const lighting = resolveLighting(map);
    this.night = lighting.night;
    renderer.setLighting(lighting);
    this.daylight = addLighting(renderer.scene, map, quality, lighting, () => renderer.clusteredLights);

    this.physics = new PhysicsWorld(map, BODY, SIM_DT);
    const nav = buildNavGrid(map, NAV);
    this.state = createGameState(seed, BALLISTICS.maxBBs, ROUNDS);
    this.state.targets = onRange ? createRangeTargets() : targetsAtSpots(practiceSpots(map, nav, this.physics, PRACTICE_SPOTS));
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
    // Where Alpha starts round 1 (map/practiceSpots.ts practiceStart): the range's one spot, or a map's end 0.
    const spawn = map.spawns[0][0]!;
    const at = pose ? vec3(pose.x, pose.y ?? spawn.position.y, pose.z) : spawn.position;
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

    // Your torch on a night map (M94), as in a match (M33h); nothing by day.
    this.torches = new TorchBeams(this.state.characters, lighting, quality, this.physics, BODY, HITS);
    renderer.scene.add(this.torches.object);
    this.daylight.reserveLights(this.torches.reserved);
    // On the range you are alone: a robot half the time when Settings › Look › Robots is on (G7), from the seed.
    const crowd = figureCrowd(seed, this.state.characters, setup.look);
    this.combat = new CombatPresentation(renderer, container, this.state, this.player, this.loadout, MOVEMENT, this.physics, setup.teamColours.figures[this.player.team]!, SIM_DT, map, audio, (action) => input.keyName(action), crosshair, quality, HITS, bbGlowFor(setup.kit, map.night ?? false), seed, kitPaint(setup.kit, setup.look), playerArms(crowd, this.state.characters.indexOf(this.player), this.player.team));
    // The held replica's light and the range's sound, by day or at night (M33j: the sound follows the preset's flag).
    this.combat.setLighting(lighting);
    this.combat.setMapGroup(group);
    this.combat.skipStartWhistle();
    this.targets = new RangeTargetsRenderer(this.state.targets, HITS, onRange);
    this.targets.setReceiveShadows(quality.figureShadows);
    this.targets.setDetail(quality.mapDetail);
    renderer.scene.add(this.targets.object);
    const hud = setup.teamColours.hud;
    this.minimap = onRange ? null : new Minimap(container, map.blocks, cssColor(hud[this.player.team]!), cssColor(hud[1 - this.player.team]!), map.terrain ?? null, map.foliage ?? [], map.storeys);
    this.minimap?.setCaption(map.name);
    this.readout = new RangeReadout(container);
    this.readout.set(lastShotText(null));
    if (tutorialFrom !== undefined) {
      this.tutorial = new TutorialTracker(tutorialSteps(setup.armory !== false), canAimDownSights(this.player.armament), tutorialFrom, this.loadout.length);
      this.coach = new CoachPanel(container, (action) => input.keyName(action));
      this.coach.show(this.tutorial);
      this.showcase = new TutorialShowcase(container, this.player.team, teamCss(this.player.team), (action) => input.keyName(action), () => input.wheelSelect);
      this.showcase.set(this.tutorial.step?.shows ?? null);
    }
    // The scene is whole: its shaders are compiled now, as a match's are, not in the first frames (a map in Practice,
    // M94, holds as many materials as its match).
    this.combat.warmShaders();
  }

  /** The tutorial's step to rebuild the range at (undefined: free practice, or the tutorial is over). */
  get tutorialStep(): number | undefined {
    const t = this.tutorial;
    return t && t.goalIndex < t.steps.length ? t.goalIndex : undefined;
  }

  /** "Tutorial · step 3 of 10", or "Practice · Depot" (M94: "Practice · Range" on the range). */
  get status(): string {
    const t = this.tutorial;
    return t && !t.finished ? `Tutorial · step ${t.stepIndex + 1} of ${t.steps.length}: ${t.step!.title}` : `Practice · ${this.map.name}`;
  }

  /** The map practised on (M94): the range, or the map Practice was opened on; rebuilt on the same one. */
  get practiceMap(): MapData {
    return this.map;
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
    // Skipping the last step finishes the tutorial: the pause menu gives way to the pop-up.
    if (t.finished) this.completePopup = true;
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

  /** True once, as the pause menu comes up after the tutorial was finished: show the "Tutorial complete" pop-up. */
  takeTutorialComplete(): boolean {
    if (!this.completePopup) return false;
    // Shown (an Esc that came first opened it): the mouse needn't be given back for it again on Resume.
    this.completePopup = this.completeDue = false;
    return true;
  }

  /** Where you stand and look now, to rebuild the range there. */
  get pose(): RangePose {
    return { x: this.player.position.x, y: this.player.position.y, z: this.player.position.z, yaw: this.input.yaw, pitch: this.input.pitch };
  }

  /** Your last shots, target hits, reloads and draws, for a report (IM7). */
  readonly eventLog = new EventLog();

  get characterCount(): number {
    return this.state.characters.length;
  }

  /** One frame of practice: reads the input, then runs the ticks that are due. Returns how many ran. */
  advance(dt: number): number {
    const p = this.player;
    this.input.update(p.armament.active, this.loadout.length, this.combat.aimRaised, this.combat.aimSensitivityScale, canAimDownSights(p.armament));
    if (this.input.takeInspect() && p.status === 'alive') this.combat.inspect();
    const ticks = advanceStepper(this.stepper, dt);
    for (let i = 0; i < ticks; i++) {
      this.input.fillCommand(this.playerCommand);
      stepSimulation(this.state, this.commands, this.ctx, SIM_DT);
      this.afterTick();
    }
    return ticks;
  }

  /** The range never ends by itself; true once when the tutorial is played to its end, for its pop-up (M80). */
  takeResultDue(): boolean {
    if (!this.completeDue) return false;
    this.completeDue = false;
    return true;
  }

  draw(dt: number): void {
    const alpha = stepperAlpha(this.stepper);
    const pitch = this.input.pitch + this.player.armament.recoil;
    updateFirstPersonCamera(this.renderer.camera, this.player, BODY, HITS, alpha, this.input.yaw, pitch, this.motion.leanRoll);
    this.targets.update(dt);
    this.showcase?.frame(dt);
    this.combat.frame(dt, alpha, this.input.yaw, pitch);
    this.torches.update(this.renderer.camera, this.player, true, alpha);
    this.showMinimap();
    this.daylight.follow(this.renderer.camera, dt);
    this.combat.render(true);
  }

  /** Settings › HUD › Minimap (M83): turning with the view, or fixed north up (on a map, M94). */
  setMinimapTurn(turn: MinimapTurn): void {
    this.minimap?.setRotating(turn === 'rotating');
  }

  /** The minimap round where you stand, the way you look (M94): no teammates, no one heard. */
  private showMinimap(): void {
    if (!this.minimap || !this.playing) return;
    const f = this.minimapFrame;
    const eye = this.renderer.camera.position;
    f.x = eye.x;
    f.y = this.player.position.y;
    f.z = eye.z;
    f.yaw = this.input.yaw;
    f.time = this.state.time;
    this.minimap.update(f, NOBODY_HEARD);
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
    this.torches.setQuality(quality);
    this.daylight.reserveLights(this.torches.reserved);
    this.combat.setMapGroup(this.renderer.mapMeshes.restyle(this.renderer.surfaceTexturesFor(this.map), mapLookOf(quality, this.probes)));
    this.targets.setReceiveShadows(quality.figureShadows);
    this.targets.setDetail(quality.mapDetail);
    this.combat.setQuality(quality);
  }

  /** The graphics context is back after a loss: as MatchSession.contextRestored. */
  contextRestored(): void {
    this.combat.contextRestored();
    // A WebGL2 renderer after a lost WebGPU device draws no clustered lights: the pools drop their extra lamps (BP3),
    // keeping your torch's (a night map, M94).
    this.daylight.reserveLights(this.torches.reserved);
    this.torches.contextRestored();
  }

  setPlaying(playing: boolean): void {
    this.playing = playing;
    this.combat.setPlaying(playing);
    const coaching = this.tutorial !== null && !this.tutorial.finished;
    this.readout.setVisible(playing && !coaching);
    this.minimap?.setVisible(playing);
    this.coach?.setVisible(playing && coaching);
    this.showcase?.setVisible(playing && coaching);
    if (playing && coaching) this.coach!.show(this.tutorial!); // a key may have been rebound while paused
  }

  dispose(): void {
    this.combat.dispose();
    this.targets.dispose();
    this.torches.dispose();
    this.minimap?.dispose();
    this.readout.dispose();
    this.coach?.dispose();
    this.showcase?.dispose();
    // Out of the scene, kept by the renderer for the next session on this map (freed there, CORE-33).
    this.renderer.mapMeshes.release();
    this.daylight.dispose();
    this.physics.dispose();
    this.renderer.setZoom(1);
  }

  /**
   * Fits the picked optic, parts, hop-up dials and BB weights to your replicas (fresh magazines of the picked kind); the
   * weapon light only on a night preset, as in a match (M33h).
   */
  private fitPickedLoadout(): void {
    const kit = this.setup.kit;
    fitOptics(this.player.armament, kit.slots.map((s) => s.optic));
    fitParts(this.player.armament, kit.slots.map((s) => partsUnder(s.parts, this.night)));
    setHopUps(this.player.armament, kit.hopUps);
    setBbWeights(this.player.armament, kit.bbWeights);
  }

  /** The tutorial's step shown or still to do changed (a step done, or skipped). */
  private tutorialMoved(t: TutorialTracker): void {
    this.coach!.show(t);
    this.showcase?.set(t.step?.shows ?? null);
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

  /** How far a point is for the readout: downrange on the range, from where you stand on a map (M94). */
  private howFar(p: { x: number; z: number }): number {
    return this.map === RANGE_MAP ? downrange(p) : across(this.player.position, p);
  }

  /** Whether a lost BB was still over the field: in the range's walls, or above a map's floor of the world (M94). */
  private inside(p: { x: number; y: number; z: number }): boolean {
    return this.map === RANGE_MAP ? insideRange(p) : p.y >= this.map.killY;
  }

  private afterTick(): void {
    this.eventLog.record(this.state.tick, this.state.events, this.player.id);
    this.combat.afterTick();
    this.targets.afterTick(this.state.events);
    const t = this.tutorial;
    const v = this.tutorialView;
    v.player = this.player;
    v.events = this.state.events;
    v.targets = this.state.targets;
    if (t && !t.finished && t.observe(v)) {
      this.tutorialMoved(t);
      if (t.finished) this.completeDue = this.completePopup = true;
    }
    for (const e of this.state.events) {
      // Your BB came down (a ricochet's last stop wins), hit a target, or flew out over a wall. On the range distances
      // count downrange of the firing line, as its markers do; on a map (M94) from where you stand.
      if (e.type === 'bbImpact' && e.ownerId === PLAYER_ID) this.lastShot = { distance: this.howFar(e.position), target: null };
      else if (e.type === 'bbLost' && e.ownerId === PLAYER_ID) {
        // Out over a wall or the backstop (off a map: below it); one that just ran out of time in the air counts where it was.
        this.lastShot = this.inside(e.position) ? { distance: this.howFar(e.position), target: null } : { distance: 0, target: null, lost: true };
      }
      else if (e.type === 'targetHit' && e.shooterId === PLAYER_ID) {
        const t = this.state.targets.find((x) => x.id === e.targetId);
        const marked = this.map === RANGE_MAP;
        this.lastShot = { distance: this.howFar(e.position), target: t ? { label: t.label, distance: marked ? t.distance : Math.round(this.howFar(t.position)) } : null };
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

/** How far across the floor from you (m): Practice on a map (M94) has no firing line. */
function across(from: { x: number; z: number }, p: { x: number; z: number }): number {
  return Math.hypot(p.x - from.x, p.z - from.z);
}

/** Within the range's walls and backstop (at any height). */
function insideRange(p: { x: number; y: number; z: number }): boolean {
  return Math.abs(p.x) <= RANGE.halfWidth && p.z >= -RANGE.backstop && p.z <= RANGE.behindLine && p.y >= 0;
}
