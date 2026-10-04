import { loadVolumes } from './audio/audioMix';
import type { SfxSetup } from './audio/sfx';
import { motionScale } from './config/accessibility';
import { SoundLibrary } from './audio/soundBank';
import type { VolumeChannel } from './config/audio';
import type { Difficulty } from './config/bots';
import { ROUNDS } from './config/hits';
import type { MatchRules } from './config/matchRules';
import type { CrosshairSettings } from './config/matchInfo';
import { BROWSER_NOTES } from './config/menus';
import type { MatchMode } from './config/modes';
import { MOVEMENT } from './config/movement';
import type { ReplicaParts } from './config/attachments';
import type { OpticChoice } from './config/optics';
import { QUALITY, type QualityPreset } from './config/render';
import { LOADOUT_SLOTS, type ReplicaConfig } from './config/replicas';
import { SIM } from './config/sim';
import { applyTeamCss, TEAM_COLOUR_SETS, TEAMS, type TeamColourSetId } from './config/teams';
import { KeyBindings } from './input/keyBindings';
import { Keyboard } from './input/keyboard';
import { PlayerInput } from './input/playerInput';
import { PointerLock } from './input/pointerLock';
import { type MapId, mapData } from './map/maps';
import { initPhysics } from './physics/physicsWorld';
import { Renderer } from './render/renderer';
import { MatchSession } from './matchSession';
import { type RangePose, RangeSession } from './rangeSession';
import { attackersInRound } from './sim/round';
import type { GameState } from './sim/state';
import { addMatch, loadRecords, type RecordNews, type Records, saveRecords } from './stats/records';
import { loadCrosshair } from './ui/crosshair';
import { DebugOverlay } from './ui/debugOverlay';
import { toggleFullscreen } from './ui/fullscreen';
import { GraphicsNotice } from './ui/graphicsNotice';
import { loadBbWeight, loadHopUp, loadoutSummary, loadParts, loadSlotPick } from './ui/loadoutChoice';
import { browserStorage } from './settings/storage';
import { screenWhenStopped } from './ui/menus/menuNav';
import { Menus } from './ui/menus/menus';
import { recordsView } from './ui/recordsView';
import {
  hasSavedTeammateDifficulty,
  loadAimMode,
  loadAimSensitivity,
  loadCrouchMode,
  loadDifficulty,
  loadFov,
  loadInvertMouse,
  loadMap,
  loadMatchRules,
  loadMode,
  loadMouseDpi,
  loadOptic,
  loadReducedMotion,
  loadSensitivity,
  loadSoundCues,
  loadSprintMode,
  loadTeammateDifficulty,
  loadTeamColours,
} from './ui/menus/savedChoices';

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
  /** Over everything while the graphics context is lost (M18b). */
  private readonly graphicsNotice: GraphicsNotice;
  /** True while the graphics context is lost: nothing can be drawn, so play can't start or resume. */
  private graphicsLost = false;
  /** The match being played (or paused, or just decided); null on the title and New game screens. */
  /** The match in play, or the practice range (M21); null on the menus with nothing loaded. */
  private session: MatchSession | RangeSession | null = null;
  /** The next Play opens the practice range rather than a match (the title's Practice range button). */
  private practice = false;
  /** The loadout changed since the range was built: Resume rebuilds it with the new one. */
  private loadoutChanged = false;
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
  /** The opponents' bot difficulty and your bot teammates' (M20). */
  private difficulty: Difficulty;
  private teammateDifficulty: Difficulty;
  /** The Match pop-up's rules (M20). */
  private matchRules: MatchRules;
  private optic: OpticChoice;
  /** The replica picked for each loadout slot. */
  private readonly picked: ReplicaConfig[];
  /** Each replica's hop-up dial and BB weight as picked on the Loadout screen, by replica id (saved ones until changed). */
  private readonly hopUps = new Map<string, number>();
  private readonly bbWeights = new Map<string, number>();
  /** The volume sliders and the synthesised sounds, kept across matches (each match's Sfx plays from them). */
  private readonly audio: SfxSetup = { volumes: loadVolumes(), library: new SoundLibrary() };
  /** The crosshair's look (Settings → Crosshair), kept across matches. */
  private crosshair: CrosshairSettings = loadCrosshair();
  /** The local records (M19), and what the last match finished changed in them. */
  private readonly records: Records = loadRecords(browserStorage());
  private recordNews: RecordNews = { bestAccuracy: false, bestStreak: false };
  /** Each replica's grip and magazine as picked (M17b), by replica id. */
  private readonly parts = new Map<string, ReplicaParts>();
  /** Reduced motion (Settings → Accessibility), kept across matches. */
  private reducedMotion = loadReducedMotion();
  /** The team colours and the on-screen sound cues (Settings → Accessibility, M18b). Colours apply from the next match. */
  private teamColours: TeamColourSetId = loadTeamColours();
  private soundCues = loadSoundCues();

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
    this.teammateDifficulty = loadTeammateDifficulty();
    this.matchRules = loadMatchRules();
    this.optic = loadOptic();
    this.picked = LOADOUT_SLOTS.map(loadSlotPick);

    this.bindings = new KeyBindings(browserStorage());
    this.keyboard = new Keyboard(window, this.bindings);
    this.pointer = new PointerLock(this.renderer.canvas, this.keyboard);
    this.input = new PlayerInput(this.keyboard, this.pointer, MOVEMENT);
    this.input.crouchMode = loadCrouchMode();
    this.input.aimMode = loadAimMode();
    this.input.sprintMode = loadSprintMode();
    this.input.invertY = loadInvertMouse();
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
        playerTeam: TEAMS[PLAYER_TEAM]!.name,
        enemyTeam: TEAMS[1 - PLAYER_TEAM]!.name,
        raiseTime: ROUNDS.flag.raiseTime,
        attackFirst: ROUNDS.flag.firstAttackers === PLAYER_TEAM,
      },
      bindings: this.bindings,
      loadout: {
        slots: LOADOUT_SLOTS,
        picked: { initial: this.picked, onChange: (slot, r) => ((this.picked[slot] = r), (this.loadoutChanged = true)) },
        optic: { initial: this.optic, onChange: (o) => ((this.optic = o), (this.loadoutChanged = true)) },
        hopUp: { initial: (r) => this.hopUpOf(r), onChange: (r, dial) => (this.hopUps.set(r.id, dial), (this.loadoutChanged = true)) },
        bbWeight: { initial: (r) => this.bbWeightOf(r), onChange: (r, grams) => (this.bbWeights.set(r.id, grams), (this.loadoutChanged = true)) },
        parts: { initial: (r) => this.partsOf(r), onChange: (r, parts) => (this.parts.set(r.id, parts), (this.loadoutChanged = true)) },
        summary: () => ({
          replicas: this.picked.map((r) => r.name).join('\n'),
          detail: loadoutSummary(
            this.picked,
            this.optic,
            this.picked.map((r) => this.hopUpOf(r)),
            this.picked.map((r) => this.bbWeightOf(r)),
            this.picked.map((r) => this.partsOf(r)),
          ),
        }),
      },
      onPlay: () => {
        // Before play begins this is New game's Play: a match, even after a Practice range whose mouse lock was refused.
        if (!this.started) this.practice = false;
        this.play();
      },
      onLeaveMatch: () => this.leaveMatch(),
      onRange: () => {
        this.practice = true;
        this.play();
      },
      map: { initial: this.map, onChange: (m) => (this.map = m) },
      mode: { initial: this.mode, onChange: (m) => (this.mode = m) },
      difficulty: { initial: this.difficulty, onChange: (d) => (this.difficulty = d) },
      teammateDifficulty: { initial: this.teammateDifficulty, follows: !hasSavedTeammateDifficulty(), onChange: (d) => (this.teammateDifficulty = d) },
      matchRules: { initial: this.matchRules, onChange: (m) => (this.matchRules = m) },
      controls: {
        sensitivity: { initial: this.input.sensitivity, onChange: (v) => (this.input.sensitivity = v) },
        aimSensitivity: { initial: this.input.aimSensitivity, onChange: (v) => (this.input.aimSensitivity = v) },
        dpi: { initial: loadMouseDpi() },
        invertMouse: { initial: this.input.invertY, onChange: (on) => (this.input.invertY = on) },
        crouch: { initial: this.input.crouchMode, onChange: (m) => (this.input.crouchMode = m) },
        aim: { initial: this.input.aimMode, onChange: (m) => (this.input.aimMode = m) },
        sprint: { initial: this.input.sprintMode, onChange: (m) => (this.input.sprintMode = m) },
      },
      fov: { initial: this.renderer.fov, onChange: (v) => this.renderer.setFov(v) },
      quality: options.quality,
      audio: { initial: this.audio.volumes, onChange: (channel, v) => this.changeVolume(channel, v) },
      crosshair: { initial: this.crosshair, onChange: (c) => this.changeCrosshair(c) },
      accessibility: {
        reducedMotion: { initial: this.reducedMotion, onChange: (on) => this.changeReducedMotion(on) },
        // The figures are built with their colours, so a new set shows from the next match.
        teamColours: { initial: this.teamColours, onChange: (set) => (this.teamColours = set) },
        soundCues: { initial: this.soundCues, onChange: (on) => this.changeSoundCues(on) },
      },
    });
    this.menus.showTitle();
    if (this.renderer.softwareRendering) this.menus.showTitleWarning(BROWSER_NOTES.noHardwareAcceleration);
    this.graphicsNotice = new GraphicsNotice(container, BROWSER_NOTES.graphicsLost);
    this.renderer.onContextChange((lost) => this.graphicsContextChanged(lost));
    document.addEventListener('visibilitychange', this.visibilityChanged);
    this.pointer.onChange((locked) => {
      if (locked) this.resume();
      else this.pause();
    });
    this.pointer.onError(() => this.menus.showHint(LOCK_REFUSED_HINT));
  }

  /** The tab was hidden (another tab, the window minimised): the match pauses, as Esc would (M18b). */
  private readonly visibilityChanged = (): void => {
    if (document.hidden) this.stopPlay();
  };

  /**
   * The graphics context was lost (true) or is back (false) (M18b, audit W-01). While it's gone the match pauses
   * and a notice covers everything; once it's back the pause menu says so and Resume carries on (Three.js uploads
   * everything again on the next frame).
   */
  private graphicsContextChanged(lost: boolean): void {
    this.graphicsLost = lost;
    this.graphicsNotice.setVisible(lost);
    // The menus can't be used under the notice (not even Resume by Enter or Space on the focused button).
    this.menus.setBlocked(lost);
    if (lost) this.stopPlay();
    else if (this.started) this.menus.showHint(BROWSER_NOTES.graphicsBack);
  }

  /** Stops play as if the player had pressed Esc: the mouse is given back, and the pause menu comes up. */
  private stopPlay(): void {
    if (this.unlockedPlay) {
      this.unlockedPlay = false;
      this.pointer.setUnlockedButtons(false);
      this.pause();
    } else if (this.pointer.locked) {
      this.pointer.release();
    }
  }

  /** A volume slider moved on Settings → Audio: kept for the next match and applied to the one loaded. */
  private changeVolume(channel: VolumeChannel, position: number): void {
    this.audio.volumes[channel] = position;
    this.session?.combat.setVolume(channel, position);
  }

  private hopUpOf(r: ReplicaConfig): number {
    return this.hopUps.get(r.id) ?? loadHopUp(r);
  }

  private bbWeightOf(r: ReplicaConfig): number {
    return this.bbWeights.get(r.id) ?? loadBbWeight(r);
  }

  /** The crosshair changed on Settings → Crosshair: kept for the next match and applied to the one loaded. */
  private changeCrosshair(crosshair: CrosshairSettings): void {
    this.crosshair = crosshair;
    this.session?.combat.setCrosshair(crosshair);
  }

  private partsOf(r: ReplicaConfig): ReplicaParts {
    return this.parts.get(r.id) ?? loadParts(r);
  }

  /** Reduced motion turned on or off: kept for the next match and applied to the one loaded. */
  private changeReducedMotion(on: boolean): void {
    this.reducedMotion = on;
    this.session?.setMotion(motionScale(on));
  }

  /** On-screen sound cues turned on or off: kept for the next match and applied to the one loaded. */
  private changeSoundCues(on: boolean): void {
    this.soundCues = on;
    this.session?.setSoundCues(on);
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
    document.removeEventListener('visibilitychange', this.visibilityChanged);
    this.graphicsNotice.dispose();
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
    if (this.graphicsLost) return;
    const s = this.session;
    if (!this.started && this.practice) {
      this.openRange();
    } else if (this.started && s instanceof RangeSession && this.loadoutChanged) {
      // Back from the Loadout on the range's pause menu: the range again, with the new kit, where you stood.
      this.openRange(s.pose);
    } else if (!this.started) {
      this.session?.dispose();
      this.session = new MatchSession(this.renderer, this.container, this.input, {
        map: mapData(this.map),
        mode: this.mode,
        difficulty: this.difficulty,
        teammateDifficulty: this.teammateDifficulty,
        rules: { ...this.matchRules },
        loadout: [...this.picked],
        optic: this.optic,
        hopUps: this.picked.map((r) => this.hopUpOf(r)),
        bbWeights: this.picked.map((r) => this.bbWeightOf(r)),
        parts: this.picked.map((r) => this.partsOf(r)),
        teamColours: TEAM_COLOUR_SETS[this.teamColours],
      }, this.options.seed, QUALITY[this.options.quality], this.audio, this.crosshair);
      this.session.setMotion(motionScale(this.reducedMotion));
      this.session.setSoundCues(this.soundCues);
      applyTeamCss(this.container, TEAM_COLOUR_SETS[this.teamColours]);
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

  /** Builds the practice range (M21) with the picked loadout, at `pose` if given (else at the firing line). */
  private openRange(pose?: RangePose): void {
    this.session?.dispose();
    this.loadoutChanged = false;
    this.session = new RangeSession(this.renderer, this.container, this.input, {
      loadout: [...this.picked],
      optic: this.optic,
      hopUps: this.picked.map((r) => this.hopUpOf(r)),
      bbWeights: this.picked.map((r) => this.bbWeightOf(r)),
      parts: this.picked.map((r) => this.partsOf(r)),
    }, this.options.seed, QUALITY[this.options.quality], this.audio, this.crosshair, pose);
    this.session.setMotion(motionScale(this.reducedMotion));
  }

  private resume(): void {
    const s = this.session;
    if (!s) {
      // Nothing to play (should not happen: Play builds the match before asking for the lock); give the mouse back.
      this.pointer.release();
      return;
    }
    // "Play Again" on the result screen: the new match starts only once play really resumes.
    if (s instanceof MatchSession && s.state.round.phase === 'matchOver') s.restart();
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
    this.practice = false;
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
    if (this.started && s instanceof RangeSession) {
      this.menus.showPause('Practice range', true);
    } else if (!this.started || !(s instanceof MatchSession) || !r) {
      // Play never began (a lock that came late, after Back, and was given straight back): the menus are still up on
      // whichever screen the player went to, so they stay there.
    } else if (screen === 'result') {
      const mine = s.player.team;
      const theirs = 1 - mine;
      const draws = r.number - r.score[0] - r.score[1];
      const headline = r.matchWinner === mine ? 'You win!' : 'You lose';
      const score = `${TEAMS[mine]!.name} (you) ${r.score[mine]} – ${r.score[theirs]} ${TEAMS[theirs]!.name}`;
      // The finished match goes into the records once (a second stop on the same result shows the same news).
      const result = s.takeMatchResult();
      if (result) {
        this.recordNews = addMatch(this.records, result);
        saveRecords(this.records, browserStorage());
      }
      this.menus.showResult(headline, `${score} · ${r.number} rounds${draws > 0 ? `, ${draws} drawn` : ''}`, {
        result: `${headline} · ${score}`,
        blocks: s.summaryBlocks(),
        records: recordsView(this.records, this.recordNews, s.setup.difficulty, s.mode, s.countsForRecords),
      });
    } else {
      const mine = s.player.team;
      const theirs = 1 - mine;
      // Between rounds, the role you'll have next round (it swaps at half-time).
      const attackers = r.phase === 'over' ? attackersInRound(r.number + 1, s.rounds) : r.attackers;
      const role = r.mode === 'attackDefend' ? ` · attack / defend, you ${attackers === mine ? 'attack' : 'defend'}${r.phase === 'over' ? ' next' : ''}` : '';
      this.menus.showPause(
        `${r.phase === 'over' ? `After round ${r.number}` : `Round ${r.number}`}${role} · ${TEAMS[mine]!.name} (you) ${r.score[mine]} – ${r.score[theirs]} ${TEAMS[theirs]!.name} · first to ${s.rounds.winsNeeded}`,
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
      // Still within the key press's user activation, which the browser needs for fullscreen.
      if (this.keyboard.wasPressed('fullscreen')) toggleFullscreen();
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
    if (running) s.draw(dt, this.keyboard.isDown('scoreboard'));
    this.debug.frame(dt);
  };
}
