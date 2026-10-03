import type * as THREE from 'three';
import { BotController } from './ai/botController';
import { lowCoverBlocks, tallCoverBlocks } from './ai/cover';
import { BALLISTICS } from './config/ballistics';
import { BOT_BEHAVIOUR, botConfig, type Difficulty } from './config/bots';
import { FOOTSTEPS } from './config/footsteps';
import { HITS, ROUNDS } from './config/hits';
import type { MatchMode } from './config/modes';
import { BODY, MOVEMENT } from './config/movement';
import { NAV } from './config/nav';
import { type OpticChoice, opticOf } from './config/optics';
import { PHYSICS } from './config/physics';
import { matchOverScreenDelay, type QualitySettings } from './config/render';
import { LOADOUT } from './config/replicas';
import { SIM, SIM_DT } from './config/sim';
import { TEAMS } from './config/teams';
import { advanceStepper, createStepper, stepperAlpha } from './core/fixedStepper';
import type { PlayerInput } from './input/playerInput';
import type { MapData } from './map/mapTypes';
import { buildNavGrid, type NavGrid } from './nav/navGrid';
import { PhysicsWorld } from './physics/physicsWorld';
import { updateFirstPersonCamera } from './render/cameraRig';
import { CombatPresentation } from './render/combatPresentation';
import { addLighting } from './render/lighting';
import { buildMapMeshes, disposeMapMeshes } from './render/mapMeshes';
import { MatchPresentation } from './render/matchPresentation';
import { createSurfaceTextures, disposeSurfaceTextures, type SurfaceTextures } from './render/proceduralTextures';
import type { Renderer } from './render/renderer';
import { fitOptic, setHopUps } from './sim/armament';
import { type Character, createCharacter, respawnCharacter } from './sim/character';
import { createCommand, type PlayerCommand } from './sim/commands';
import { placeTeams, restartMatch } from './sim/round';
import { createSimContext, type SimContext, stepSimulation } from './sim/simulation';
import { createGameState, type GameState } from './sim/state';
import { vec3 } from './sim/vec';

const PLAYER_ID = 0;

/** What New game sets up, read when Play is pressed (M15b: nothing is loaded before that). */
export interface MatchSetup {
  map: MapData;
  mode: MatchMode;
  difficulty: Difficulty;
  /** The optic for the replica with a rail, and each replica's hop-up dial, from the Loadout screen. */
  optic: OpticChoice;
  hopUps: readonly number[];
}

/**
 * One match on one map: the field's meshes and lighting, physics, the bots' navigation, the simulation and
 * everything drawn and heard in it. Built when Play is pressed and disposed when the player leaves the match
 * (Quit to title screen, Change setup, Title screen), so the next Play can load another map with another setup.
 * The app around it (renderer, input, menus) outlives it; see Game.
 */
export class MatchSession {
  readonly state: GameState;
  readonly player: Character;
  readonly combat: CombatPresentation;
  readonly match: MatchPresentation;
  readonly mode: MatchMode;
  private readonly physics: PhysicsWorld;
  private readonly nav: NavGrid;
  private readonly bots: BotController;
  private readonly textures: SurfaceTextures;
  private readonly mapGroup: THREE.Group;
  private readonly disposeLighting: () => void;
  private readonly stepper = createStepper(SIM_DT, SIM.maxTicksPerFrame);
  private readonly commands = new Map<number, PlayerCommand>();
  private readonly playerCommand = createCommand();
  private readonly ctx: SimContext;
  /** Simulation time the match was decided (NaN while it's on, and once the result screen is due). */
  private matchOverAt = Number.NaN;

  constructor(
    private readonly renderer: Renderer,
    container: HTMLElement,
    private readonly input: PlayerInput,
    private readonly setup: MatchSetup,
    seed: number,
    quality: QualitySettings,
  ) {
    const map = setup.map;
    this.textures = createSurfaceTextures();
    this.mapGroup = buildMapMeshes(map, this.textures);
    renderer.scene.add(this.mapGroup);
    this.disposeLighting = addLighting(renderer.scene, map, quality);

    this.physics = new PhysicsWorld(map, BODY, SIM_DT);
    this.nav = buildNavGrid(map, NAV);
    // Maps without a flagpole can only be played in elimination.
    this.mode = map.flag ? setup.mode : 'elimination';
    this.state = createGameState(seed, BALLISTICS.maxBBs, ROUNDS, this.mode, map.flag);
    this.ctx = createSimContext({
      mover: this.physics,
      query: this.physics,
      movement: MOVEMENT,
      footsteps: FOOTSTEPS,
      body: BODY,
      ballistics: BALLISTICS,
      loadout: LOADOUT,
      killY: map.killY,
      hits: HITS,
      deadZones: map.deadZones,
      spawns: map.spawns,
      spawnLift: PHYSICS.groundRestGap,
      nav: this.nav,
      navSnap: NAV.snap,
      rounds: ROUNDS,
      pole: map.flag,
    });
    this.player = this.spawnRoster(map);
    this.fitPickedLoadout();
    this.commands.set(PLAYER_ID, this.playerCommand);
    this.bots = new BotController(
      this.state,
      this.state.characters.filter((c) => c !== this.player),
      this.commands,
      { query: this.physics, nav: this.nav, navSnap: NAV.snap, lanes: map.lanes, lowCover: lowCoverBlocks(map.blocks, this.nav, BODY, BOT_BEHAVIOUR.lowCoverFloorGap), tallCover: tallCoverBlocks(map.blocks, this.nav, BODY, BOT_BEHAVIOUR.lowCoverFloorGap), body: BODY, hits: HITS, loadout: LOADOUT, cfg: botConfig(setup.difficulty), seed },
    );
    input.resetView(this.player.spawnYaw);
    // The player is always on Blue.
    this.combat = new CombatPresentation(renderer, container, this.state, this.player, LOADOUT, MOVEMENT, this.physics, TEAMS[this.player.team]!.color, SIM_DT, (action) => input.keyName(action));
    this.match = new MatchPresentation(renderer.scene, container, renderer, this.state, this.player, BODY, HITS, this.physics, ROUNDS.teamSize, ROUNDS);
  }

  /** Characters in the match (for the debug overlay). */
  get characterCount(): number {
    return this.state.characters.length;
  }

  /**
   * One frame of play: reads the player's input, then runs the simulation ticks that are due, with the bots
   * thinking before each. Returns how many ticks ran.
   */
  advance(dt: number): number {
    this.input.update(this.player.armament.active, LOADOUT.length, this.combat.aimRaised);
    if (this.match.spectating && this.input.takeClick()) this.match.nextSpectateTarget();
    const ticks = advanceStepper(this.stepper, dt);
    for (let i = 0; i < ticks; i++) {
      this.input.fillCommand(this.playerCommand);
      this.bots.think(this.state, SIM_DT);
      stepSimulation(this.state, this.commands, this.ctx, SIM_DT);
      this.afterTick();
    }
    return ticks;
  }

  /** True once, a little after the match is decided: time to give the mouse back and show the result screen. */
  takeResultDue(): boolean {
    if (!(this.state.time - this.matchOverAt >= matchOverScreenDelay())) return false;
    this.matchOverAt = Number.NaN;
    return true;
  }

  /** Places the camera and draws the frame; `dt` is 0 while paused, so presentation holds still. */
  draw(dt: number): void {
    const alpha = stepperAlpha(this.stepper); // frozen while paused, so the view holds still
    // The camera shows where BBs actually go: view pitch plus the replica's recoil kick.
    const pitch = this.input.pitch + this.player.armament.recoil;
    updateFirstPersonCamera(this.renderer.camera, this.player, BODY, HITS, alpha, this.input.yaw, pitch);
    const spectating = this.match.frame(this.renderer.camera, alpha, dt, this.input.yaw);
    this.combat.frame(dt, alpha, this.input.yaw, pitch);
    this.combat.render(!spectating);
  }

  setPlaying(playing: boolean): void {
    this.combat.setPlaying(playing);
    this.match.setPlaying(playing);
  }

  /** A fresh match from round 1 with the same setup ("Play Again" on the result screen). A direct sim-state change. */
  restart(): void {
    this.state.events.length = 0;
    restartMatch(this.state.round, this.state.characters, this.state.bbs, this.ctx.round, this.state.events, this.mode);
    this.matchOverAt = Number.NaN;
    this.afterTick();
  }

  dispose(): void {
    this.combat.dispose();
    this.match.dispose();
    this.renderer.scene.remove(this.mapGroup);
    disposeMapMeshes(this.mapGroup);
    disposeSurfaceTextures(this.textures);
    this.disposeLighting();
    this.physics.dispose();
    this.renderer.setZoom(1);
  }

  /**
   * Creates both teams at the map's spawns for round 1 (each team at its end, see placeTeams): the local player
   * plus bot teammates on Blue, and Orange bots. Returns the player.
   */
  private spawnRoster(map: MapData): Character {
    for (const [end, spawns] of map.spawns.entries()) {
      if (spawns.length < ROUNDS.teamSize) throw new Error(`Map ${map.name} needs ${ROUNDS.teamSize} spawns at end ${end}`);
    }
    let id = PLAYER_ID;
    for (let team = 0; team < TEAMS.length; team++) {
      for (let i = 0; i < ROUNDS.teamSize; i++) this.state.characters.push(createCharacter(id++, vec3(), 0, LOADOUT, team));
    }
    placeTeams(this.state.round, this.state.characters, this.ctx.round);
    for (const c of this.state.characters) {
      respawnCharacter(c, LOADOUT);
      this.physics.addCharacter(c);
    }
    return this.state.characters[0]!;
  }

  /** Fits the picked optic and hop-up dials to the player's replicas. A direct sim-state change, between rounds. */
  private fitPickedLoadout(): void {
    fitOptic(this.player.armament, LOADOUT, opticOf(this.setup.optic));
    setHopUps(this.player.armament, this.setup.hopUps);
  }

  /** Everything that reacts to a simulation tick's events. */
  private afterTick(): void {
    this.bots.observe(this.state);
    this.combat.afterTick();
    this.match.afterTick(this.input.yaw);
    for (const e of this.state.events) {
      if (e.type === 'roundStart') {
        this.input.resetView(this.player.spawnYaw);
        this.fitPickedLoadout();
      }
      if (e.type === 'matchOver') this.matchOverAt = this.state.time;
    }
  }
}
