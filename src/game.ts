import type * as THREE from 'three';
import { BALLISTICS } from './config/ballistics';
import { BODY, MOVEMENT } from './config/movement';
import { PHYSICS } from './config/physics';
import { LOADOUT } from './config/replicas';
import { SIM, SIM_DT } from './config/sim';
import { TEAMS } from './config/teams';
import { advanceStepper, createStepper, stepperAlpha } from './core/fixedStepper';
import { Keyboard } from './input/keyboard';
import { PlayerInput } from './input/playerInput';
import { PointerLock } from './input/pointerLock';
import type { MapData } from './map/mapTypes';
import { initPhysics, PhysicsWorld } from './physics/physicsWorld';
import { updateFirstPersonCamera } from './render/cameraRig';
import { addLighting } from './render/lighting';
import { buildMapMeshes, disposeMapMeshes } from './render/mapMeshes';
import { createSurfaceTextures, disposeSurfaceTextures, type SurfaceTextures } from './render/proceduralTextures';
import { CombatPresentation } from './render/combatPresentation';
import { Renderer } from './render/renderer';
import { type Character, createCharacter } from './sim/character';
import { createCommand, type PlayerCommand } from './sim/commands';
import { createSimContext, type SimContext, stepSimulation } from './sim/simulation';
import { createGameState, type GameState } from './sim/state';
import { vec3 } from './sim/vec';
import { DebugOverlay } from './ui/debugOverlay';
import { StartScreen } from './ui/startScreen';

const PLAYER_ID = 0;
const LOCK_REFUSED_HINT = 'The browser needs a moment before re-capturing the mouse. Click again.';

export interface GameOptions {
  /**
   * Dev/testing only: run without pointer lock (automated browsers can't lock the pointer).
   * Mouse look is unavailable in this mode; keyboard still works.
   */
  allowUnlocked: boolean;
}

/** Composition root: wires simulation, physics, input and presentation together and runs the loop. */
export class Game {
  readonly state: GameState;
  private readonly renderer: Renderer;
  private readonly physics: PhysicsWorld;
  private readonly keyboard: Keyboard;
  private readonly pointer: PointerLock;
  private readonly input: PlayerInput;
  private readonly debug: DebugOverlay;
  private readonly startScreen: StartScreen;
  private readonly textures: SurfaceTextures;
  private readonly mapGroup: THREE.Group;
  private readonly disposeLighting: () => void;
  private readonly stepper = createStepper(SIM_DT, SIM.maxTicksPerFrame);
  private readonly commands = new Map<number, PlayerCommand>();
  private readonly playerCommand = createCommand();
  private readonly ctx: SimContext;
  private readonly player: Character;
  private readonly combat: CombatPresentation;
  private rafId = 0;
  private lastTime = 0;
  private ticksThisSecond = 0;
  private tickRate = 0;
  private tickRateTimer = 0;
  private started = false;
  private unlockedPlay = false;

  static async create(container: HTMLElement, map: MapData, options: GameOptions): Promise<Game> {
    await initPhysics();
    return new Game(container, map, options);
  }

  private constructor(container: HTMLElement, map: MapData, options: GameOptions) {
    this.renderer = new Renderer(container);
    this.textures = createSurfaceTextures();
    this.mapGroup = buildMapMeshes(map, this.textures);
    this.renderer.scene.add(this.mapGroup);
    this.disposeLighting = addLighting(this.renderer.scene, map);

    this.physics = new PhysicsWorld(map, BODY, SIM_DT);
    this.state = createGameState(SIM.seed, BALLISTICS.maxBBs);
    const spawn = map.spawns[0][0];
    if (!spawn) throw new Error(`Map ${map.name} has no spawn for team 0`);
    // Map spawns are floor points; characters stand the physics rest gap above the floor.
    const feet = vec3(spawn.position.x, spawn.position.y + PHYSICS.groundRestGap, spawn.position.z);
    this.player = createCharacter(PLAYER_ID, feet, spawn.yaw);
    this.state.characters.push(this.player);
    this.physics.addCharacter(this.player);
    this.commands.set(PLAYER_ID, this.playerCommand);
    this.ctx = createSimContext({
      mover: this.physics,
      query: this.physics,
      movement: MOVEMENT,
      body: BODY,
      ballistics: BALLISTICS,
      loadout: LOADOUT,
      killY: map.killY,
    });

    this.keyboard = new Keyboard(window);
    this.pointer = new PointerLock(this.renderer.canvas);
    this.input = new PlayerInput(this.keyboard, this.pointer, MOVEMENT);
    this.input.yaw = spawn.yaw;
    // Phase 1: the player is always on Blue.
    this.combat = new CombatPresentation(this.renderer, container, this.state, this.player, LOADOUT, MOVEMENT, TEAMS[0].color, SIM_DT);

    this.debug = new DebugOverlay(container, () => ({
      tick: this.state.tick,
      'sim ticks/s': this.tickRate,
      characters: this.state.characters.length,
      pos: `${this.player.position.x.toFixed(2)}, ${this.player.position.y.toFixed(2)}, ${this.player.position.z.toFixed(2)}`,
      speed: Math.hypot(this.player.velocity.x, this.player.velocity.z).toFixed(2),
      grounded: String(this.player.grounded),
      'BBs in flight': this.combat.bbsInFlight,
      'draw calls': this.renderer.renderer.info.render.calls,
      triangles: this.renderer.renderer.info.render.triangles,
    }));

    this.startScreen = new StartScreen(
      container,
      () => this.play(options.allowUnlocked),
      (v) => (this.input.sensitivity = v),
    );
    this.input.sensitivity = this.startScreen.sensitivity;
    this.pointer.onChange((locked) => {
      if (locked) this.resume();
      else this.pause();
    });
    this.pointer.onError(() => this.startScreen.showHint(LOCK_REFUSED_HINT));
  }

  start(): void {
    this.lastTime = performance.now();
    this.rafId = requestAnimationFrame(this.frame);
  }

  dispose(): void {
    cancelAnimationFrame(this.rafId);
    this.keyboard.dispose();
    this.pointer.dispose();
    this.debug.dispose();
    this.combat.dispose();
    this.startScreen.dispose();
    disposeMapMeshes(this.mapGroup);
    disposeSurfaceTextures(this.textures);
    this.disposeLighting();
    this.physics.dispose();
    this.renderer.dispose();
  }

  private play(allowUnlocked: boolean): void {
    this.combat.unlockAudio();
    if (allowUnlocked) {
      this.unlockedPlay = true;
      this.resume();
      return;
    }
    void this.pointer.request();
  }

  private resume(): void {
    this.started = true;
    this.keyboard.capturing = true;
    this.startScreen.hide();
    this.combat.setPlaying(true);
  }

  private pause(): void {
    this.keyboard.capturing = false;
    this.keyboard.releaseAll();
    this.input.clearLatches();
    this.startScreen.show(this.started);
    this.combat.setPlaying(false);
  }

  private readonly frame = (now: number): void => {
    this.rafId = requestAnimationFrame(this.frame);
    // rAF timestamps can precede the performance.now() taken in start(); clamp to [0, MAX].
    const dt = Math.min(SIM.maxFrameDt, Math.max(0, (now - this.lastTime) / 1000));
    this.lastTime = now;

    const running = this.pointer.locked || this.unlockedPlay;
    if (running) {
      // Only while playing: on the pause screen F3 belongs to the browser (find bar).
      if (this.keyboard.wasPressed('debugOverlay')) this.debug.toggle();
      if (this.keyboard.wasPressed('debugBbPaths')) this.combat.toggleBbPaths();
      this.input.update(this.player.armament.active, LOADOUT.length);
      const ticks = advanceStepper(this.stepper, dt);
      for (let i = 0; i < ticks; i++) {
        this.input.fillCommand(this.playerCommand);
        stepSimulation(this.state, this.commands, this.ctx, SIM_DT);
        this.combat.afterTick();
      }
      this.ticksThisSecond += ticks;
    }
    this.keyboard.endFrame();

    this.tickRateTimer += dt;
    if (this.tickRateTimer >= 1) {
      this.tickRate = this.ticksThisSecond;
      this.ticksThisSecond = 0;
      this.tickRateTimer -= 1;
    }

    const alpha = stepperAlpha(this.stepper); // frozen while paused, so the view holds still
    // The camera shows where BBs actually go: view pitch plus the replica's recoil kick.
    const pitch = this.input.pitch + this.player.armament.recoil;
    updateFirstPersonCamera(this.renderer.camera, this.player, BODY, alpha, this.input.yaw, pitch);
    this.combat.frame(dt, alpha, this.input.yaw, pitch);
    this.combat.render();
    this.debug.frame(dt);
  };
}
