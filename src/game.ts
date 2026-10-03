import type * as THREE from 'three';
import { BotController } from './ai/botController';
import { lowCoverBlocks, tallCoverBlocks } from './ai/cover';
import { createDifficultyChoice, type DifficultyChoice, difficultyNote, difficultyRoundStarted, pickDifficulty } from './ai/difficultyChoice';
import { loadVolumes } from './audio/audioMix';
import { BALLISTICS } from './config/ballistics';
import { BOT_BEHAVIOUR, botConfig, type Difficulty } from './config/bots';
import { HITS, ROUNDS } from './config/hits';
import type { MatchMode } from './config/modes';
import { NAV } from './config/nav';
import { type OpticChoice, opticOf } from './config/optics';
import { matchOverScreenDelay, QUALITY, type QualityPreset } from './config/render';
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
import { type Character, createCharacter, respawnCharacter } from './sim/character';
import { createCommand, type PlayerCommand } from './sim/commands';
import { fitOptic, setHopUps } from './sim/armament';
import { attackersInRound, placeTeams, restartMatch } from './sim/round';
import { createSimContext, type SimContext, stepSimulation } from './sim/simulation';
import { createGameState, type GameState } from './sim/state';
import { vec3 } from './sim/vec';
import { DebugOverlay } from './ui/debugOverlay';
import { modeNote, modeTakesEffect, modeToDescribe } from './ui/modeChoice';
import { loadHopUps, loadoutTakesEffect, opticNote } from './ui/loadoutChoice';
import { browserStorage } from './settings/storage';
import { screenWhenStopped } from './ui/menus/menuNav';
import { Menus } from './ui/menus/menus';
import { loadAimSensitivity, loadCrouchMode, loadDifficulty, loadMode, loadOptic, loadQuality, loadSensitivity } from './ui/menus/savedChoices';

const PLAYER_ID = 0;

/** Reloads the page so a quality preset picked in Settings applies, dropping a one-visit `?quality=` so the saved one is used. */
function reloadWithSavedQuality(): void {
  const url = new URL(window.location.href);
  url.searchParams.delete('quality');
  window.location.replace(url.toString());
}
const LOCK_REFUSED_HINT = 'The browser needs a moment before re-capturing the mouse. Click again.';

export interface GameOptions {
  /**
   * Dev/testing only: run without pointer lock (automated browsers can't lock the pointer).
   * Mouse look is unavailable in this mode; keyboard still works.
   */
  allowUnlocked: boolean;
  /** Seeds the simulation and the bots (core/seed.ts): the same seed replays the same bot decisions for the same inputs. */
  seed: number;
  /** Render quality preset (config/render.ts) in use; fixed until the page reloads. */
  quality: QualityPreset;
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
  private readonly menus: Menus;
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
  /** The mode picked on New game: the next match is played in it (the one in play is state.round.mode). */
  private mode: MatchMode;
  /** The rifle optic picked on the Loadout screen, and the one fitted to the player's replica now (see ui/loadoutChoice.ts). */
  private optic: OpticChoice;
  private fittedOptic: OpticChoice;
  /** Each replica's hop-up dial as picked on the Loadout screen (fitted with the optic). */
  private readonly hopUps: number[];
  /** Simulation time the match was decided (NaN while it's on). */
  private matchOverAt = Number.NaN;

  static async create(container: HTMLElement, map: MapData, options: GameOptions): Promise<Game> {
    await initPhysics();
    return new Game(container, map, options);
  }

  private constructor(container: HTMLElement, map: MapData, options: GameOptions) {
    this.renderer = new Renderer(container, QUALITY[options.quality]);
    this.textures = createSurfaceTextures();
    this.mapGroup = buildMapMeshes(map, this.textures);
    this.renderer.scene.add(this.mapGroup);
    this.disposeLighting = addLighting(this.renderer.scene, map, QUALITY[options.quality]);

    this.physics = new PhysicsWorld(map, BODY, SIM_DT);
    this.nav = buildNavGrid(map, NAV);
    // Maps without a flagpole can only be played in elimination.
    this.mode = map.flag ? loadMode() : 'elimination';
    this.state = createGameState(options.seed, BALLISTICS.maxBBs, ROUNDS, this.mode, map.flag);
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
    this.optic = loadOptic();
    this.fittedOptic = this.optic;
    this.hopUps = loadHopUps(LOADOUT);
    this.fitPickedLoadout();
    this.difficulty = createDifficultyChoice(loadDifficulty());
    this.commands.set(PLAYER_ID, this.playerCommand);
    this.bots = new BotController(
      this.state,
      this.state.characters.filter((c) => c !== this.player),
      this.commands,
      { query: this.physics, nav: this.nav, navSnap: NAV.snap, lanes: map.lanes, lowCover: lowCoverBlocks(map.blocks, this.nav, BODY, BOT_BEHAVIOUR.lowCoverFloorGap), tallCover: tallCoverBlocks(map.blocks, this.nav, BODY, BOT_BEHAVIOUR.lowCoverFloorGap), body: BODY, hits: HITS, loadout: LOADOUT, cfg: botConfig(this.difficulty.inPlay), seed: options.seed },
    );

    this.bindings = new KeyBindings(browserStorage());
    this.keyboard = new Keyboard(window, this.bindings);
    this.pointer = new PointerLock(this.renderer.canvas);
    this.input = new PlayerInput(this.keyboard, this.pointer, MOVEMENT);
    this.input.crouchMode = loadCrouchMode();
    this.input.yaw = this.player.spawnYaw;
    // The player is always on Blue.
    const volumes = loadVolumes();
    this.combat = new CombatPresentation(this.renderer, container, this.state, this.player, LOADOUT, MOVEMENT, this.physics, TEAMS[this.player.team]!.color, SIM_DT, map.blocks, volumes);
    this.match = new MatchPresentation(this.renderer.scene, container, this.renderer, this.state, this.player, BODY, HITS, this.physics, ROUNDS.teamSize, ROUNDS);

    this.debug = new DebugOverlay(container, () => ({
      seed: options.seed,
      tick: this.state.tick,
      'sim ticks/s': this.tickRate,
      characters: this.state.characters.length,
      pos: `${this.player.position.x.toFixed(2)}, ${this.player.position.y.toFixed(2)}, ${this.player.position.z.toFixed(2)}`,
      speed: Math.hypot(this.player.velocity.x, this.player.velocity.z).toFixed(2),
      grounded: String(this.player.grounded),
      'BBs in flight': this.combat.bbsInFlight,
      quality: options.quality,
      'pixel ratio': this.renderer.renderer.getPixelRatio(),
      'draw calls': this.renderer.renderer.info.render.calls,
      triangles: this.renderer.renderer.info.render.triangles,
      'programs / geometries / textures': `${this.renderer.renderer.info.programs?.length ?? 0} / ${this.renderer.renderer.info.memory.geometries} / ${this.renderer.renderer.info.memory.textures}`,
    }));

    this.input.sensitivity = loadSensitivity();
    this.input.aimSensitivity = loadAimSensitivity();
    this.menus = new Menus(container, {
      rules: {
        teamSize: ROUNDS.teamSize,
        winsNeeded: ROUNDS.winsNeeded,
        roundTime: ROUNDS.roundTime,
        playerTeam: TEAMS[this.player.team]!.name,
        enemyTeam: TEAMS[1 - this.player.team]!.name,
        raiseTime: ROUNDS.flag.raiseTime,
        halfTimeAfter: ROUNDS.halfTimeAfter,
        attackFirst: ROUNDS.flag.firstAttackers === this.player.team,
      },
      bindings: this.bindings,
      loadout: LOADOUT,
      onPlay: () => this.play(options.allowUnlocked),
      onQuit: () => this.quitToTitle(),
      mode: { initial: this.mode, onChange: (m) => this.changeMode(m) },
      difficulty: { initial: this.difficulty.inPlay, onChange: (d) => this.changeDifficulty(d) },
      optic: { initial: this.optic, onChange: (o) => this.changeOptic(o) },
      hopUp: { initial: this.hopUps, onChange: (slot, dial) => this.changeHopUp(slot, dial) },
      sensitivity: { initial: this.input.sensitivity, onChange: (v) => (this.input.sensitivity = v) },
      aimSensitivity: { initial: this.input.aimSensitivity, onChange: (v) => (this.input.aimSensitivity = v) },
      crouch: { initial: this.input.crouchMode, onChange: (m) => (this.input.crouchMode = m) },
      quality: { inUse: options.quality, saved: loadQuality(), onReload: reloadWithSavedQuality },
      audio: { initial: volumes, onChange: (channel, v) => this.combat.setVolume(channel, v) },
    });
    this.menus.showTitle();
    this.pointer.onChange((locked) => {
      if (locked) this.resume();
      else this.pause();
    });
    this.pointer.onError(() => this.menus.showHint(LOCK_REFUSED_HINT));
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
    this.menus.dispose();
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
      this.pointer.setUnlockedButtons(true);
      this.resume();
      return;
    }
    void this.pointer.request();
  }

  private resume(): void {
    // "Play Again" (or Play after Change setup) on the result screen: the new match starts only once play really resumes.
    if (this.state.round.phase === 'matchOver') this.restartMatch();
    this.started = true;
    this.keyboard.capturing = true;
    this.menus.hide();
    this.combat.setPlaying(true);
    this.match.setPlaying(true);
  }

  /**
   * Quit to title screen from the pause menu: the match in progress ends, and the next one starts afresh from New
   * game, where the mode, difficulty and loadout can change again.
   */
  private quitToTitle(): void {
    this.started = false;
    this.restartMatch();
    this.refreshModeText();
    this.menus.showTitle();
  }

  /**
   * A fresh match from round 1 in the picked mode (after the result screen's "Play Again", a mode picked
   * before the first match, or quitting to the title screen). A direct sim-state change from the composition root.
   */
  private restartMatch(): void {
    this.state.events.length = 0;
    restartMatch(this.state.round, this.state.characters, this.state.bbs, this.ctx.round, this.state.events, this.mode);
    this.matchOverAt = Number.NaN;
    this.afterTick();
  }

  /**
   * The player picked a match mode on the menus. Before the first match it applies at
   * once; otherwise the next match is played in it (a match in progress keeps its mode).
   */
  private changeMode(m: MatchMode): void {
    this.mode = m;
    if (modeTakesEffect(this.started) === 'now') this.restartMatch();
    this.refreshModeText();
  }

  /**
   * New game's mode text: the rules of the match in progress (or of the next one when none is on),
   * and a note while a picked mode waits for the next match.
   */
  private refreshModeText(): void {
    const r = this.state.round;
    const matchOver = r.phase === 'matchOver';
    this.menus.setModeNote(modeNote(this.mode, r.mode, this.started, matchOver));
    this.menus.describeMode(modeToDescribe(this.mode, r.mode, this.started, matchOver));
  }

  /**
   * The player picked a rifle optic on the Loadout screen: fitted at once before the first match and
   * on the result screen, otherwise at the next round start (a round in progress is never changed).
   */
  private changeOptic(o: OpticChoice): void {
    this.optic = o;
    if (loadoutTakesEffect(this.started, this.state.round.phase === 'matchOver') === 'now') this.fitPickedLoadout();
    this.menus.setOpticNote(opticNote(this.optic, this.fittedOptic, this.state.round.phase === 'matchOver'));
  }

  /** The player turned a replica's hop-up dial on the Loadout screen: fitted like the optic. */
  private changeHopUp(slot: number, dial: number): void {
    this.hopUps[slot] = dial;
    if (loadoutTakesEffect(this.started, this.state.round.phase === 'matchOver') === 'now') this.fitPickedLoadout();
  }

  /**
   * Fits the picked optic and hop-up dials to the player's replicas. A direct sim-state change from the
   * composition root, between rounds.
   */
  private fitPickedLoadout(): void {
    this.fittedOptic = this.optic;
    fitOptic(this.player.armament, LOADOUT, opticOf(this.optic));
    setHopUps(this.player.armament, this.hopUps);
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
        this.menus.setOpticNote('');
        if (e.round === 1) this.refreshModeText();
        difficultyRoundStarted(this.difficulty); // the bots switched to a waiting level at this event too
        this.menus.setDifficultyNote(difficultyNote(this.difficulty, false));
      }
      if (e.type === 'matchOver') {
        this.matchOverAt = this.state.time;
        this.menus.setDifficultyNote(difficultyNote(this.difficulty, true));
        this.refreshModeText();
      }
    }
  }

  /** The player picked a bot difficulty on the menus (see ai/difficultyChoice.ts). */
  private changeDifficulty(d: Difficulty): void {
    const matchOver = this.state.round.phase === 'matchOver';
    this.bots.setConfig(botConfig(d), pickDifficulty(this.difficulty, d, this.started && !matchOver));
    this.menus.setDifficultyNote(difficultyNote(this.difficulty, matchOver));
  }

  private pause(): void {
    this.keyboard.capturing = false;
    this.keyboard.releaseAll();
    this.input.clearLatches();
    const r = this.state.round;
    const screen = screenWhenStopped(this.started, r.phase === 'matchOver');
    if (screen === 'title') {
      this.menus.showTitle();
    } else if (screen === 'result') {
      const mine = this.player.team;
      const theirs = 1 - mine;
      const draws = r.number - r.score[0] - r.score[1];
      this.menus.showResult(
        r.matchWinner === mine ? 'You win!' : 'You lose',
        `${TEAMS[mine]!.name} (you) ${r.score[mine]} – ${r.score[theirs]} ${TEAMS[theirs]!.name} · ${r.number} rounds${draws > 0 ? `, ${draws} drawn` : ''}`,
      );
    } else {
      const mine = this.player.team;
      const theirs = 1 - mine;
      // Between rounds, the role you'll have next round (it swaps at half-time).
      const attackers = r.phase === 'over' ? attackersInRound(r.number + 1, ROUNDS) : r.attackers;
      const role = r.mode === 'attackDefend' ? ` · attack / defend, you ${attackers === mine ? 'attack' : 'defend'}${r.phase === 'over' ? ' next' : ''}` : '';
      this.menus.showPause(
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
      this.input.update(this.player.armament.active, LOADOUT.length, this.combat.aimRaised);
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
        this.pointer.setUnlockedButtons(false);
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
