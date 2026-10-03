import { loadVolumes } from './audio/audioMix';
import type { SfxSetup } from './audio/sfx';
import { SoundLibrary } from './audio/soundBank';
import type { VolumeChannel } from './config/audio';
import type { Difficulty } from './config/bots';
import { ROUNDS } from './config/hits';
import type { MatchMode } from './config/modes';
import { MOVEMENT } from './config/movement';
import type { OpticChoice } from './config/optics';
import { QUALITY, type QualityPreset } from './config/render';
import { LOADOUT } from './config/replicas';
import { SIM } from './config/sim';
import { TEAMS } from './config/teams';
import { KeyBindings } from './input/keyBindings';
import { Keyboard } from './input/keyboard';
import { PlayerInput } from './input/playerInput';
import { PointerLock } from './input/pointerLock';
import { type MapId, mapData } from './map/maps';
import { initPhysics } from './physics/physicsWorld';
import { Renderer } from './render/renderer';
import { MatchSession } from './matchSession';
import { attackersInRound } from './sim/round';
import type { GameState } from './sim/state';
import { DebugOverlay } from './ui/debugOverlay';
import { loadHopUps } from './ui/loadoutChoice';
import { browserStorage } from './settings/storage';
import { screenWhenStopped } from './ui/menus/menuNav';
import { Menus } from './ui/menus/menus';
import { loadAimSensitivity, loadCrouchMode, loadDifficulty, loadFov, loadMap, loadMode, loadOptic, loadSensitivity } from './ui/menus/savedChoices';

/** The player is the first character, on Blue (see MatchSession). */
const PLAYER_TEAM = 0;
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

/**
 * Composition root: the app around the matches (renderer, input, menus, the loop). No map is loaded while the menus
 * are up before a match (M15b): Play builds a MatchSession from New game's choices, and leaving the match disposes it.
 */
export class Game {
  private readonly renderer: Renderer;
  private readonly bindings: KeyBindings;
  private readonly keyboard: Keyboard;
  private readonly pointer: PointerLock;
  private readonly input: PlayerInput;
  private readonly debug: DebugOverlay;
  private readonly menus: Menus;
  /** The match being played (or paused, or just decided); null on the title and New game screens. */
  private session: MatchSession | null = null;
  private rafId = 0;
  private lastTime = 0;
  private ticksThisSecond = 0;
  private tickRate = 0;
  private tickRateTimer = 0;
  /** True once play has begun in the current session (until the player leaves the match). */
  private started = false;
  private unlockedPlay = false;
  /** New game's choices: the next Play builds the match from them. */
  private map: MapId;
  private mode: MatchMode;
  private difficulty: Difficulty;
  private optic: OpticChoice;
  private readonly hopUps: number[];
  /** The volume sliders and the synthesised sounds, kept across matches (each match's Sfx plays from them). */
  private readonly audio: SfxSetup = { volumes: loadVolumes(), library: new SoundLibrary() };

  static async create(container: HTMLElement, options: GameOptions): Promise<Game> {
    await initPhysics();
    return new Game(container, options);
  }

  private constructor(
    private readonly container: HTMLElement,
    private readonly options: GameOptions,
  ) {
    this.renderer = new Renderer(container, QUALITY[options.quality]);
    this.renderer.setFov(loadFov());
    this.map = loadMap();
    this.mode = loadMode();
    this.difficulty = loadDifficulty();
    this.optic = loadOptic();
    this.hopUps = loadHopUps(LOADOUT);

    this.bindings = new KeyBindings(browserStorage());
    this.keyboard = new Keyboard(window, this.bindings);
    this.pointer = new PointerLock(this.renderer.canvas);
    this.input = new PlayerInput(this.keyboard, this.pointer, MOVEMENT);
    this.input.crouchMode = loadCrouchMode();
    this.input.sensitivity = loadSensitivity();
    this.input.aimSensitivity = loadAimSensitivity();

    this.debug = new DebugOverlay(container, () => {
      const s = this.session;
      const p = s?.player;
      return {
        seed: options.seed,
        map: this.map,
        tick: s?.state.tick ?? '-',
        'sim ticks/s': this.tickRate,
        characters: s?.characterCount ?? 0,
        pos: p ? `${p.position.x.toFixed(2)}, ${p.position.y.toFixed(2)}, ${p.position.z.toFixed(2)}` : '-',
        speed: p ? Math.hypot(p.velocity.x, p.velocity.z).toFixed(2) : '-',
        grounded: String(p?.grounded ?? '-'),
        'BBs in flight': s?.combat.bbsInFlight ?? 0,
        quality: options.quality,
        'pixel ratio': this.renderer.renderer.getPixelRatio(),
        'draw calls': this.renderer.renderer.info.render.calls,
        triangles: this.renderer.renderer.info.render.triangles,
        'programs / geometries / textures': `${this.renderer.renderer.info.programs?.length ?? 0} / ${this.renderer.renderer.info.memory.geometries} / ${this.renderer.renderer.info.memory.textures}`,
      };
    });

    this.menus = new Menus(container, {
      rules: {
        teamSize: ROUNDS.teamSize,
        winsNeeded: ROUNDS.winsNeeded,
        roundTime: ROUNDS.roundTime,
        playerTeam: TEAMS[PLAYER_TEAM]!.name,
        enemyTeam: TEAMS[1 - PLAYER_TEAM]!.name,
        raiseTime: ROUNDS.flag.raiseTime,
        halfTimeAfter: ROUNDS.halfTimeAfter,
        attackFirst: ROUNDS.flag.firstAttackers === PLAYER_TEAM,
      },
      bindings: this.bindings,
      loadout: LOADOUT,
      onPlay: () => this.play(),
      onLeaveMatch: () => this.leaveMatch(),
      map: { initial: this.map, onChange: (m) => (this.map = m) },
      mode: { initial: this.mode, onChange: (m) => (this.mode = m) },
      difficulty: { initial: this.difficulty, onChange: (d) => (this.difficulty = d) },
      optic: { initial: this.optic, onChange: (o) => (this.optic = o) },
      hopUp: { initial: this.hopUps, onChange: (slot, dial) => (this.hopUps[slot] = dial) },
      sensitivity: { initial: this.input.sensitivity, onChange: (v) => (this.input.sensitivity = v) },
      aimSensitivity: { initial: this.input.aimSensitivity, onChange: (v) => (this.input.aimSensitivity = v) },
      crouch: { initial: this.input.crouchMode, onChange: (m) => (this.input.crouchMode = m) },
      fov: { initial: this.renderer.fov, onChange: (v) => this.renderer.setFov(v) },
      quality: options.quality,
      audio: { initial: this.audio.volumes, onChange: (channel, v) => this.changeVolume(channel, v) },
    });
    this.menus.showTitle();
    this.pointer.onChange((locked) => {
      if (locked) this.resume();
      else this.pause();
    });
    this.pointer.onError(() => this.menus.showHint(LOCK_REFUSED_HINT));
  }

  /** A volume slider moved on Settings → Audio: kept for the next match and applied to the one loaded. */
  private changeVolume(channel: VolumeChannel, position: number): void {
    this.audio.volumes[channel] = position;
    this.session?.combat.setVolume(channel, position);
  }

  /** The simulation state of the match in play (null with no match loaded). For the console in dev builds. */
  get state(): GameState | null {
    return this.session?.state ?? null;
  }

  start(): void {
    this.lastTime = performance.now();
    this.rafId = requestAnimationFrame(this.frame);
  }

  dispose(): void {
    cancelAnimationFrame(this.rafId);
    this.session?.dispose();
    this.session = null;
    this.keyboard.dispose();
    this.pointer.dispose();
    this.debug.dispose();
    this.menus.dispose();
    this.renderer.dispose();
  }

  /**
   * Play on New game, Resume, Play Again. Before play has begun in a match, the match is built here from New game's
   * choices (a match left over from a lock request still pending is replaced). Runs in the click, so audio can be
   * unlocked.
   */
  private play(): void {
    if (!this.started) {
      this.session?.dispose();
      this.session = new MatchSession(this.renderer, this.container, this.input, {
        map: mapData(this.map),
        mode: this.mode,
        difficulty: this.difficulty,
        optic: this.optic,
        hopUps: this.hopUps,
      }, this.options.seed, QUALITY[this.options.quality], this.audio);
    }
    this.session!.combat.unlockAudio();
    if (this.options.allowUnlocked) {
      this.unlockedPlay = true;
      this.pointer.setUnlockedButtons(true);
      this.resume();
      return;
    }
    void this.pointer.request();
  }

  private resume(): void {
    const s = this.session;
    if (!s) {
      // Nothing to play (should not happen: Play builds the match before asking for the lock); give the mouse back.
      this.pointer.release();
      return;
    }
    // "Play Again" on the result screen: the new match starts only once play really resumes.
    if (s.state.round.phase === 'matchOver') s.restart();
    this.started = true;
    this.keyboard.capturing = true;
    this.menus.hide();
    s.setPlaying(true);
  }

  /**
   * The player left the match (Quit to title screen on the pause menu, Change setup or Title screen on the result), or
   * went Back from New game after a Play whose mouse lock was refused: the match is unloaded, and the next Play builds a
   * new one from New game, where everything can change again.
   */
  private leaveMatch(): void {
    this.started = false;
    this.unlockedPlay = false;
    this.pointer.setUnlockedButtons(false);
    this.session?.dispose();
    this.session = null;
  }

  private pause(): void {
    this.keyboard.capturing = false;
    this.keyboard.releaseAll();
    this.input.clearLatches();
    const s = this.session;
    const r = s?.state.round;
    const screen = screenWhenStopped(this.started, r?.phase === 'matchOver');
    if (!this.started || !s || !r) {
      // Play never began (a lock that came late, after Back, and was given straight back): the menus are still up on
      // whichever screen the player went to, so they stay there.
    } else if (screen === 'result') {
      const mine = s.player.team;
      const theirs = 1 - mine;
      const draws = r.number - r.score[0] - r.score[1];
      this.menus.showResult(
        r.matchWinner === mine ? 'You win!' : 'You lose',
        `${TEAMS[mine]!.name} (you) ${r.score[mine]} – ${r.score[theirs]} ${TEAMS[theirs]!.name} · ${r.number} rounds${draws > 0 ? `, ${draws} drawn` : ''}`,
      );
    } else {
      const mine = s.player.team;
      const theirs = 1 - mine;
      // Between rounds, the role you'll have next round (it swaps at half-time).
      const attackers = r.phase === 'over' ? attackersInRound(r.number + 1, ROUNDS) : r.attackers;
      const role = r.mode === 'attackDefend' ? ` · attack / defend, you ${attackers === mine ? 'attack' : 'defend'}${r.phase === 'over' ? ' next' : ''}` : '';
      this.menus.showPause(
        `${r.phase === 'over' ? `After round ${r.number}` : `Round ${r.number}`}${role} · ${TEAMS[mine]!.name} (you) ${r.score[mine]} – ${r.score[theirs]} ${TEAMS[theirs]!.name} · first to ${ROUNDS.winsNeeded}`,
      );
    }
    s?.setPlaying(false);
  }

  private readonly frame = (now: number): void => {
    this.rafId = requestAnimationFrame(this.frame);
    // rAF timestamps can precede the performance.now() taken in start(); clamp to [0, MAX].
    const dt = Math.min(SIM.maxFrameDt, Math.max(0, (now - this.lastTime) / 1000));
    this.lastTime = now;

    const s = this.session;
    const running = (this.pointer.locked || this.unlockedPlay) && s !== null;
    if (running) {
      // Only while playing: on the pause screen F3 belongs to the browser (find bar).
      if (this.keyboard.wasPressed('debugOverlay')) this.debug.toggle();
      if (this.keyboard.wasPressed('debugBbPaths')) s.combat.toggleBbPaths();
      this.ticksThisSecond += s.advance(dt);
      // A little after the match is decided, give the mouse back and show the result screen.
      if (s.takeResultDue()) {
        if (this.unlockedPlay) {
          this.unlockedPlay = false;
          this.pointer.setUnlockedButtons(false);
          this.pause();
        } else {
          this.pointer.release();
        }
      }
    }
    this.keyboard.endFrame();

    this.tickRateTimer += dt;
    if (this.tickRateTimer >= 1) {
      this.tickRate = this.ticksThisSecond;
      this.ticksThisSecond = 0;
      this.tickRateTimer -= 1;
    }

    // Only while playing: the menus are opaque, so drawing the paused field under them would be GPU work nobody sees.
    if (running) s.draw(dt);
    this.debug.frame(dt);
  };
}
