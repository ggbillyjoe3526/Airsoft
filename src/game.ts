import type * as THREE from 'three';
import { BotController } from './ai/botController';
import { lowCoverBlocks } from './ai/cover';
import { createDifficultyChoice, type DifficultyChoice, difficultyNote, difficultyRoundStarted, pickDifficulty } from './ai/difficultyChoice';
import { BALLISTICS } from './config/ballistics';
import { BOT_BEHAVIOUR, botConfig, type Difficulty } from './config/bots';
import { HITS, ROUNDS } from './config/hits';
import type { MatchMode } from './config/modes';
import { NAV } from './config/nav';
import { matchOverScreenDelay } from './config/render';
import { FOOTSTEPS } from './config/footsteps';
import { BODY, MOVEMENT } from './config/movement';
import { PHYSICS } from './config/physics';
import { LOADOUT } from './config/replicas';
import { SIM, SIM_DT } from './config/sim';
import { TEAMS } from './config/teams';
import { advanceStepper, createStepper, stepperAlpha } from './core/fixedStepper';
import { KeyBindings } from './input/keyBindings';
import { Keyboard } from './input/keyboard';
import { PlayerInput } from './input/playerInput';
import { PointerLock } from './input/pointerLock';
import type { MapData } from './map/mapTypes';
import { buildNavGrid, type NavGrid } from './nav/navGrid';
import { initPhysics, PhysicsWorld } from './physics/physicsWorld';
import { updateFirstPersonCamera } from './render/cameraRig';
import { addLighting } from './render/lighting';
import { buildMapMeshes, disposeMapMeshes } from './render/mapMeshes';
import { createSurfaceTextures, disposeSurfaceTextures, type SurfaceTextures } from './render/proceduralTextures';
import { CombatPresentation } from './render/combatPresentation';
import { MatchPresentation } from './render/matchPresentation';
import { Renderer } from './render/renderer';
import { type Character, createCharacter } from './sim/character';
import { createCommand, type PlayerCommand } from './sim/commands';
import { attackersInRound, restartMatch } from './sim/round';
import { createSimContext, type SimContext, stepSimulation } from './sim/simulation';
import { createGameState, type GameState } from './sim/state';
import { vec3 } from './sim/vec';
import { DebugOverlay } from './ui/debugOverlay';
import { modeNote, modeTakesEffect, modeToDescribe } from './ui/modeChoice';
import { loadDifficulty, loadMode, StartScreen } from './ui/startScreen';

const PLAYER_ID = 0;
const LOCK_REFUSED_HINT = 'The browser needs a moment before re-capturing the mouse. Click again.';

/** localStorage, or null where the browser blocks it (settings then last for the session only). */
function browserStorage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

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
  private readonly nav: NavGrid;
  private readonly bots: BotController;
  private readonly bindings: KeyBindings;
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
  private readonly match: MatchPresentation;
  private rafId = 0;
  private lastTime = 0;
  private ticksThisSecond = 0;
  private tickRate = 0;
  private tickRateTimer = 0;
  private started = false;
  private unlockedPlay = false;
  /** The bot difficulty in play, and one picked mid-match that waits for the next round. */
  private readonly difficulty: DifficultyChoice;
  /** The mode picked on the start screen: the next match is played in it (the one in play is state.round.mode). */
  private mode: MatchMode;
  /** Simulation time the match was decided (NaN while it's on). */
  private matchOverAt = Number.NaN;

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
    this.nav = buildNavGrid(map, NAV);
    // Maps without flagpoles can only be played in elimination.
    this.mode = map.flags ? loadMode() : 'elimination';
    this.state = createGameState(SIM.seed, BALLISTICS.maxBBs, ROUNDS, this.mode, map.flags);
    this.player = this.spawnRoster(map);
    this.difficulty = createDifficultyChoice(loadDifficulty());
    this.commands.set(PLAYER_ID, this.playerCommand);
    this.bots = new BotController(
      this.state,
      this.state.characters.filter((c) => c !== this.player),
      this.commands,
      { query: this.physics, nav: this.nav, navSnap: NAV.snap, lanes: map.lanes, lowCover: lowCoverBlocks(map.blocks, BODY, BOT_BEHAVIOUR.lowCoverFloorGap), body: BODY, hits: HITS, loadout: LOADOUT, cfg: botConfig(this.difficulty.inPlay), seed: SIM.seed },
    );
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
      nav: this.nav,
      navSnap: NAV.snap,
      rounds: ROUNDS,
      flagSpots: map.flags,
    });

    this.bindings = new KeyBindings(browserStorage());
    this.keyboard = new Keyboard(window, this.bindings);
    this.pointer = new PointerLock(this.renderer.canvas);
    this.input = new PlayerInput(this.keyboard, this.pointer, MOVEMENT);
    this.input.yaw = this.player.spawnYaw;
    // Phase 1: the player is always on Blue.
    this.combat = new CombatPresentation(this.renderer, container, this.state, this.player, LOADOUT, MOVEMENT, this.physics, TEAMS[this.player.team]!.color, SIM_DT);
    this.match = new MatchPresentation(this.renderer.scene, container, this.renderer, this.state, this.player, BODY, HITS, this.physics, ROUNDS.teamSize, ROUNDS.flag);

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
      {
        teamSize: ROUNDS.teamSize,
        winsNeeded: ROUNDS.winsNeeded,
        roundTime: ROUNDS.roundTime,
        playerTeam: TEAMS[this.player.team]!.name,
        enemyTeam: TEAMS[1 - this.player.team]!.name,
        raiseTime: ROUNDS.flag.raiseTime,
        halfTimeAfter: ROUNDS.flag.halfTimeAfter,
        attackFirst: ROUNDS.flag.firstAttackers === this.player.team,
      },
      this.bindings,
      () => this.play(options.allowUnlocked),
      (v) => (this.input.sensitivity = v),
      { initial: this.difficulty.inPlay, onChange: (d) => this.changeDifficulty(d) },
      { initial: this.mode, onChange: (m) => this.changeMode(m) },
    );
    this.input.sensitivity = this.startScreen.sensitivity;
    this.pointer.onChange((locked) => {
      if (locked) this.resume();
      else this.pause();
    });
    this.pointer.onError(() => this.startScreen.showHint(LOCK_REFUSED_HINT));
  }

  /**
   * Creates both teams at the map's spawns: the local player plus bot teammates on Blue, and Orange
   * bots. Returns the player.
   */
  private spawnRoster(map: MapData): Character {
    let id = PLAYER_ID;
    for (let team = 0; team < TEAMS.length; team++) {
      const spawns = map.spawns[team] ?? [];
      if (spawns.length < ROUNDS.teamSize) throw new Error(`Map ${map.name} needs ${ROUNDS.teamSize} spawns for team ${team}`);
      for (let i = 0; i < ROUNDS.teamSize; i++) {
        const s = spawns[i]!;
        // Map spawns are floor points; characters stand the physics rest gap above the floor.
        const feet = vec3(s.position.x, s.position.y + PHYSICS.groundRestGap, s.position.z);
        const c = createCharacter(id++, feet, s.yaw, LOADOUT, team);
        this.state.characters.push(c);
        this.physics.addCharacter(c);
      }
    }
    return this.state.characters[0]!;
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
    this.match.dispose();
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
    // "Play again" on the result screen: the new match starts only once play really resumes.
    if (this.state.round.phase === 'matchOver') this.restartMatch();
    this.started = true;
    this.keyboard.capturing = true;
    this.startScreen.hide();
    this.combat.setPlaying(true);
    this.match.setPlaying(true);
  }

  /**
   * A fresh match from round 1 in the picked mode (after the result screen's "Play again", or a mode
   * picked before the first match). A direct sim-state change from the composition root.
   */
  private restartMatch(): void {
    this.state.events.length = 0;
    restartMatch(this.state.round, this.state.characters, this.state.bbs, this.ctx.round, this.state.events, this.mode);
    this.matchOverAt = Number.NaN;
    this.afterTick();
  }

  /**
   * The player picked a match mode on the start/pause/result screen. Before the first match it applies at
   * once; otherwise the next match is played in it (a match in progress keeps its mode).
   */
  private changeMode(m: MatchMode): void {
    this.mode = m;
    if (modeTakesEffect(this.started) === 'now') this.restartMatch();
    this.refreshModeText();
  }

  /**
   * The start screen's mode text: the rules of the match in progress (or of the next one when none is on),
   * and a note while a picked mode waits for the next match.
   */
  private refreshModeText(): void {
    const r = this.state.round;
    const matchOver = r.phase === 'matchOver';
    this.startScreen.setModeNote(modeNote(this.mode, r.mode, this.started, matchOver));
    this.startScreen.describeMode(modeToDescribe(this.mode, r.mode, this.started, matchOver));
  }

  /** Everything that reacts to a simulation tick's events. */
  private afterTick(): void {
    this.bots.observe(this.state);
    this.combat.afterTick();
    this.match.afterTick(this.input.yaw);
    for (const e of this.state.events) {
      if (e.type === 'roundStart') {
        this.input.resetView(this.player.spawnYaw);
        if (e.round === 1) this.refreshModeText();
        difficultyRoundStarted(this.difficulty); // the bots switched to a waiting level at this event too
        this.startScreen.setDifficultyNote(difficultyNote(this.difficulty, false));
      }
      if (e.type === 'matchOver') {
        this.matchOverAt = this.state.time;
        this.startScreen.setDifficultyNote(difficultyNote(this.difficulty, true));
        this.refreshModeText();
      }
    }
  }

  /** The player picked a bot difficulty on the start/pause/result screen (see ai/difficultyChoice.ts). */
  private changeDifficulty(d: Difficulty): void {
    const matchOver = this.state.round.phase === 'matchOver';
    this.bots.setConfig(botConfig(d), pickDifficulty(this.difficulty, d, this.started && !matchOver));
    this.startScreen.setDifficultyNote(difficultyNote(this.difficulty, matchOver));
  }

  private pause(): void {
    this.keyboard.capturing = false;
    this.keyboard.releaseAll();
    this.input.clearLatches();
    const r = this.state.round;
    if (r.phase === 'matchOver') {
      const mine = this.player.team;
      const theirs = 1 - mine;
      const draws = r.number - r.score[0] - r.score[1];
      this.startScreen.showResult(
        r.matchWinner === mine ? 'You win!' : 'You lose',
        `${TEAMS[mine]!.name} (you) ${r.score[mine]} – ${r.score[theirs]} ${TEAMS[theirs]!.name} · ${r.number} rounds${draws > 0 ? `, ${draws} drawn` : ''}`,
      );
    } else {
      const mine = this.player.team;
      const theirs = 1 - mine;
      // Between rounds, the role you'll have next round (it swaps at half-time).
      const attackers = r.phase === 'over' ? attackersInRound(r.number + 1, ROUNDS) : r.attackers;
      const role = r.mode === 'attackDefend' ? ` · attack / defend, you ${attackers === mine ? 'attack' : 'defend'}${r.phase === 'over' ? ' next' : ''}` : '';
      this.startScreen.show(
        this.started,
        `${r.phase === 'over' ? `After round ${r.number}` : `Round ${r.number}`}${role} · ${TEAMS[mine]!.name} (you) ${r.score[mine]} – ${r.score[theirs]} ${TEAMS[theirs]!.name} · first to ${ROUNDS.winsNeeded}`,
      );
    }
    this.combat.setPlaying(false);
    this.match.setPlaying(false);
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
      if (this.match.spectating && this.input.takeClick()) this.match.nextSpectateTarget();
      const ticks = advanceStepper(this.stepper, dt);
      for (let i = 0; i < ticks; i++) {
        this.input.fillCommand(this.playerCommand);
        this.bots.think(this.state, SIM_DT);
        stepSimulation(this.state, this.commands, this.ctx, SIM_DT);
        this.afterTick();
      }
      this.ticksThisSecond += ticks;
    }
    // A little after the match is decided, give the mouse back and show the result screen.
    if (running && this.state.time - this.matchOverAt >= matchOverScreenDelay()) {
      this.matchOverAt = Number.NaN;
      if (this.unlockedPlay) {
        this.unlockedPlay = false;
        this.pause();
      } else {
        this.pointer.release();
      }
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
    updateFirstPersonCamera(this.renderer.camera, this.player, BODY, HITS, alpha, this.input.yaw, pitch);
    const frameDt = running ? dt : 0; // presentation is frozen while paused
    const spectating = this.match.frame(this.renderer.camera, alpha, frameDt, this.input.yaw);
    this.combat.frame(frameDt, alpha, this.input.yaw, pitch);
    this.combat.render(!spectating);
    this.debug.frame(dt);
  };
}
