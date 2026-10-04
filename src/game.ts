import { AudioEngine } from './audio/audioEngine';
import { loadVolumes } from './audio/audioMix';
import { motionScale, type SoundCueColour, soundCueCss } from './config/accessibility';
import type { VolumeChannel } from './config/audio';
import type { Difficulty } from './config/bots';
import { activeDev, type DevSettings, devCheating } from './config/dev';
import { PERF_SCRIPT } from './config/perfScript';
import { ROUNDS } from './config/hits';
import type { MatchRules } from './config/matchRules';
import { type CrosshairSettings, type HitFeedMode, hudScale, scoreboardScale } from './config/matchInfo';
import { FULLSCREEN_RELOCK_MS } from './config/controls';
import { CRASH_TEXT } from './config/crash';
import { ARMORY_TEXT, BROWSER_NOTES } from './config/menus';
import type { MatchMode } from './config/modes';
import { MOVEMENT } from './config/movement';
import { GRAPHICS_TEXT } from './config/graphics';
import { FRAME_TIMING, type FrameRateCap, QUALITY, QUALITY_CHOICES, QUALITY_STEP_DOWN, type QualityChoice, type QualityPreset, type QualitySettings } from './config/render';
import { FramePacer } from './core/framePacer';
import { SIM } from './config/sim';
import { applyTeamCss, TEAM_COLOUR_SETS, TEAMS, type TeamColourSetId } from './config/teams';
import { crashReport, type ReportField } from './core/crashReport';
import { KeyBindings } from './input/keyBindings';
import { Keyboard } from './input/keyboard';
import { browserKeyboardMap, watchKeyboardLayout } from './input/keyboardLayout';
import { PlayerInput } from './input/playerInput';
import { PointerLock } from './input/pointerLock';
import { type MapId, mapData } from './map/maps';
import { initPhysics } from './physics/physicsWorld';
import { awayWatch } from './core/awayWatch';
import { loadFigureModel } from './render/externalModels';
import { FrameTimeWatch, presetBelow, slowFrameMs } from './render/qualityStepDown';
import { rendererName } from './render/gpuCheck';
import { Renderer } from './render/renderer';
import { buildsNewMatch, matchSeed } from './matchFlow';
import { MatchSession } from './matchSession';
import { type RangePose, RangeSession } from './rangeSession';
import { attackersInRound, teamEnd } from './sim/round';
import type { GameState } from './sim/state';
import { loadRecords, type RecordNews, type Records, saveRecords } from './stats/records';
import { settleMatch } from './stats/settleMatch';
import { loadCrosshair } from './ui/crosshair';
import { CrashScreen } from './ui/crashScreen';
import { DebugOverlay } from './ui/debugOverlay';
import { onFullscreenChange, relockAfterFullscreen, toggleFullscreen } from './ui/fullscreen';
import { GraphicsNotice } from './ui/graphicsNotice';
import { loadoutTile } from './ui/loadoutChoice';
import { type Collection, loadCollection, saveCollection, syncCollection } from './pool/collection';
import { GAME_POOL } from './pool/gamePool';
import { collectionOwnership, gameOwnership, LoadoutModel } from './pool/loadoutModel';
import { carryOverOldPicks } from './pool/oldPicks';
import type { Earnings } from './pool/armory';
import type { Unpaid } from './ui/menus/summaryScreen';
import { fcText } from './ui/menus/armoryScreen';
import { loadDevEnabled, loadDevSettings } from './settings/dev';
import { browserStorage, flushSettings, SETTINGS_KEY, saveSetting } from './settings/storage';
import type { SaveManager } from './save/saveManager';
import { SAVE_TEXT } from './config/save';
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
  loadFrameRateCap,
  loadInvertMouse,
  loadMap,
  loadMatchRules,
  loadMode,
  loadMouseDpi,
  loadReducedMotion,
  loadSensitivity,
  loadShowFps,
  loadHitFeedMode,
  loadHudSize,
  loadRawInput,
  loadScoreboardSize,
  loadSoundCueColour,
  loadSoundCues,
  loadSoundCueSize,
  loadSprintMode,
  loadTeammateDifficulty,
  loadTeamColours,
  loadTutorialDone,
  loadTutorialStep,
  loadWheelSelect,
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
  /**
   * The render quality to start with (config/render.ts startingQuality): `?quality=` for a visit, the saved one, or else
   * the GPU's preset (Low in a browser drawing in software). Settings → Graphics changes it later.
   */
  quality: QualityChoice;
  /** What `quality` resolves to (a preset's row, or the saved Custom mix). */
  qualitySettings: QualitySettings;
  /** `quality` is the game's own pick for this visit (nothing saved or asked for): not saved, and it may step down by itself. */
  automaticQuality: boolean;
  /** The browser draws without hardware acceleration (render/gpuCheck.ts): the title screen warns. */
  softwareRendering: boolean;
  /**
   * The perf harness's scripted player (config/perfScript.ts, input/scriptedInput.ts): the player's command comes
   * from a table by tick, never from the keyboard or mouse. Dev server and the e2e build only (`?script=perf`).
   */
  scriptedPlayer?: boolean;
  /** The save (M31, save/saveManager.ts): Settings → Save, and the title screen's warning when saving doesn't work. */
  save: SaveManager;
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
  /** ... with the tutorial's coach (the title's Tutorial button, M16). */
  private tutorial = false;
  /** The loadout changed since the range was built: Resume rebuilds it with the new one. */
  private loadoutChanged = false;
  /**
   * New game's choices (or the team colours) changed since the match was built: Play builds it again. Unchanged, a Play
   * clicked again after a refused mouse lock reuses the match already built (audit L-33).
   */
  private setupChanged = false;
  /**
   * Matches played so far this visit: each gets its own seed (matchSeed), so the bots' plans differ match to match. A
   * match built but never played (a refused mouse lock, then a new setup) doesn't count, so `?seed=N` replays the first
   * match played.
   */
  private matchesPlayed = 0;
  /** The match loaded has started play (and counted in matchesPlayed). */
  private matchCounted = false;
  /** The seed of the match loaded (the URL's or the visit's for the first match; see play). */
  private matchSeed: number;
  /** The match session already recorded and paid (settleMatch runs once per session). */
  private settledSession: MatchSession | null = null;
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
  /** What the player owns from the asset pool (M26a), and their loadout built from it (M26b). */
  private readonly collection: Collection;
  private readonly loadout: LoadoutModel;
  /**
   * The audio context, volume buses and synthesised sounds, kept across matches (each match's Sfx plays through
   * them). Made suspended at start; the sounds render in the title screen's spare time (audit M-09).
   */
  private readonly audio = new AudioEngine(loadVolumes());
  /** The crosshair's look (Settings → Crosshair), kept across matches. */
  private crosshair: CrosshairSettings = loadCrosshair();
  /** The local records (M19), and what the last match finished changed in them. */
  private readonly records: Records = loadRecords(browserStorage());
  private recordNews: RecordNews = { bestAccuracy: false, bestStreak: false };
  /** What the last match paid in Field Credits (M26c), for its summary. */
  private lastEarnings: Earnings | null = null;
  /** Why the last match paid nothing, for the summary (audit POOL-22), or null when it paid. */
  private unpaidReason: Unpaid | null = null;
  /** Reduced motion (Settings → Accessibility), kept across matches. */
  private reducedMotion = loadReducedMotion();
  /** The team colours and the on-screen sound cues (Settings → Accessibility, M18b). Colours apply from the next match. */
  private teamColours: TeamColourSetId = loadTeamColours();
  private soundCues = loadSoundCues();
  /** The sound cues' size and colour (Settings → Accessibility) and the scoreboard's size and hit feed (Settings → HUD), M24. */
  private soundCueSize = loadSoundCueSize();
  private soundCueColour: SoundCueColour = loadSoundCueColour();
  private scoreboardSize = loadScoreboardSize();
  private hitFeedMode: HitFeedMode = loadHitFeedMode();
  /** The HUD's size as picked (Settings → HUD, audit UI-04); the screen's height scales it further (hudScale). */
  private hudSize = loadHudSize();
  /** When the Fullscreen key was last pressed in play (performance.now()), to take the mouse again (audit UI-19). */
  private fullscreenKeyAt = Number.NEGATIVE_INFINITY;
  /** Stop following the page's fullscreen state and the keyboard layout. */
  private readonly unwatchFullscreen: () => void;
  private readonly unwatchLayout: () => void;
  /**
   * The Dev settings (M24): whether their tab is shown, the values picked on it, and what applies (the picked values
   * while the tab is shown, else the defaults).
   */
  private devEnabled = loadDevEnabled();
  private readonly devPicked: DevSettings = loadDevSettings();
  private dev: DevSettings = activeDev(this.devEnabled, this.devPicked);
  /** The render quality in use (Settings → Graphics, M14; Custom since the final alpha audit) and what it resolves to. */
  private qualityChoice: QualityChoice;
  private quality: QualitySettings;
  /**
   * The game's own pick is in force (nothing saved or asked for, REN-03): frame times are watched, and once per match a
   * run of slow windows steps it down a preset, between rounds. A pick on Settings → Graphics ends it.
   */
  private autoQuality: boolean;
  private readonly frameWatch = new FrameTimeWatch();
  /** The preset to step down to at the next break in play; and whether this session has stepped down already. */
  private stepDownTo: QualityPreset | null = null;
  private steppedDown = false;
  /** The frame-rate cap (Settings → Graphics; 0 = none) and which frames it lets through (REN-16, CORE-25). */
  private frameRateCap: FrameRateCap = loadFrameRateCap();
  private readonly pacer = new FramePacer();
  /** Time since the last drawn frame (s): a capped frame's animations cover the frames skipped. */
  private sinceDrawn = 0;
  /** Smoothed milliseconds a frame in the simulation and in the draw (the CPU side), for the debug overlay (REN-17). */
  private simMs = 0;
  private drawMs = 0;
  /** Up once the game has stopped on an error (crash); the loop never runs again. */
  private crashScreen: CrashScreen | null = null;

  static async create(container: HTMLElement, options: GameOptions): Promise<Game> {
    // A figure model (M25a) loads alongside the physics; with none in the build this resolves at once.
    const [, figureModel] = await Promise.all([initPhysics(), loadFigureModel()]);
    const game = new Game(container, options);
    game.renderer.figureModel = figureModel;
    return game;
  }

  private constructor(
    private readonly container: HTMLElement,
    private readonly options: GameOptions,
  ) {
    this.qualityChoice = options.quality;
    this.quality = options.qualitySettings;
    this.autoQuality = options.automaticQuality;
    this.matchSeed = options.seed;
    this.renderer = new Renderer(container, this.quality);
    this.renderer.setFov(loadFov());
    this.map = loadMap();
    this.mode = loadMode();
    this.difficulty = loadDifficulty();
    this.teammateDifficulty = loadTeammateDifficulty();
    this.matchRules = loadMatchRules();
    this.collection = loadCollection(GAME_POOL, options.seed);
    this.loadout = new LoadoutModel(GAME_POOL, gameOwnership(GAME_POOL, () => this.collection, () => this.dev.unlockAllGear));
    // Against what is really owned, so the picks land in the real loadout even with Unlock all gear on (M26d).
    carryOverOldPicks(new LoadoutModel(GAME_POOL, collectionOwnership(() => this.collection)), this.collection, saveCollection);

    this.bindings = new KeyBindings(browserStorage());
    this.keyboard = new Keyboard(window, this.bindings);
    // The lock is on the game's container, not the canvas: turning antialiasing on or off replaces the canvas (REN-04).
    this.pointer = new PointerLock(container, this.keyboard);
    this.pointer.rawInput = loadRawInput();
    // Key names on screen follow the player's keyboard layout where the browser tells it (audit UI-01).
    this.unwatchLayout = watchKeyboardLayout(browserKeyboardMap(), window, (layout) => this.bindings.setLayout(layout));
    this.input = new PlayerInput(this.keyboard, this.pointer, MOVEMENT);
    if (options.scriptedPlayer) this.input.script = PERF_SCRIPT;
    this.input.crouchMode = loadCrouchMode();
    this.input.aimMode = loadAimMode();
    this.input.sprintMode = loadSprintMode();
    this.input.invertY = loadInvertMouse();
    this.input.sensitivity = loadSensitivity();
    this.input.aimSensitivity = loadAimSensitivity();
    this.input.wheelSelect = loadWheelSelect();

    this.debug = new DebugOverlay(container, () => {
      const s = this.session;
      const p = s?.player;
      return {
        seed: s instanceof RangeSession ? options.seed : this.matchSeed,
        map: s instanceof RangeSession ? 'range' : this.map,
        tick: s?.state.tick ?? '-',
        'sim ticks/s': this.tickRate,
        characters: s?.characterCount ?? 0,
        pos: p ? `${p.position.x.toFixed(2)}, ${p.position.y.toFixed(2)}, ${p.position.z.toFixed(2)}` : '-',
        speed: p ? Math.hypot(p.velocity.x, p.velocity.z).toFixed(2) : '-',
        grounded: String(p?.grounded ?? '-'),
        'BBs in flight': s?.combat.bbsInFlight ?? 0,
        'audio latency (ms)': this.audio.latencyMs()?.toFixed(1) ?? '-',
        quality: this.qualityText(),
        'pixel ratio': this.renderer.renderer.getPixelRatio(),
        'frame ms (sim / draw / GPU)': `${this.simMs.toFixed(1)} / ${this.drawMs.toFixed(1)} / ${Number.isNaN(this.renderer.gpuMs) ? 'n/a' : this.renderer.gpuMs.toFixed(1)}`,
        antialias: this.antialiasText(),
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
        eliminationStartEnd: teamEnd(PLAYER_TEAM, 'elimination', 1, ROUNDS),
        attackDefendStartEnd: teamEnd(PLAYER_TEAM, 'attackDefend', 1, ROUNDS),
      },
      bindings: this.bindings,
      loadout: {
        model: this.loadout,
        onChange: () => (this.loadoutChanged = this.setupChanged = true),
        summary: () => loadoutTile(this.loadout),
      },
      armory: {
        pool: GAME_POOL,
        // Another tab's save since this one read it is taken first, so a Shot here never undoes it (audit POOL-02).
        collection: () => (syncCollection(this.collection, GAME_POOL), this.collection),
        equipped: () => this.loadout.equipped().flatMap((r) => (r ? [r, ...Object.values(this.loadout.fitOf(r.asset))] : [])),
        onChange: () => {
          saveCollection(this.collection);
          this.loadoutChanged = this.setupChanged = true;
        },
        summary: () =>
          this.dev.disableArmory
            ? { value: 'Off', detail: ARMORY_TEXT.off, disabled: true }
            : { value: fcText(this.collection.fc), detail: `${this.collection.tokens} ${this.collection.tokens === 1 ? 'Token' : 'Tokens'}. ${ARMORY_TEXT.tileDetail}`, disabled: false },
      },
      onPlay: () => {
        // Before play begins this is New game's Play: a match, even after a Practice range whose mouse lock was refused.
        if (!this.started) this.practice = this.tutorial = false;
        this.play();
      },
      onLeaveMatch: () => this.leaveMatch(),
      onRange: () => {
        this.practice = true;
        this.tutorial = false;
        this.play();
      },
      onTutorial: () => {
        this.practice = true;
        this.tutorial = true;
        this.play();
      },
      tutorialDone: loadTutorialDone(),
      onSkipTutorialStep: () => this.skipTutorial(false),
      onSkipTutorial: () => this.skipTutorial(true),
      map: { initial: this.map, onChange: (m) => ((this.map = m), (this.setupChanged = true)) },
      mode: { initial: this.mode, onChange: (m) => ((this.mode = m), (this.setupChanged = true)) },
      difficulty: { initial: this.difficulty, onChange: (d) => ((this.difficulty = d), (this.setupChanged = true)) },
      teammateDifficulty: { initial: this.teammateDifficulty, follows: !hasSavedTeammateDifficulty(), onChange: (d) => ((this.teammateDifficulty = d), (this.setupChanged = true)) },
      matchRules: { initial: this.matchRules, onChange: (m) => ((this.matchRules = m), (this.setupChanged = true)) },
      controls: {
        sensitivity: { initial: this.input.sensitivity, onChange: (v) => (this.input.sensitivity = v) },
        aimSensitivity: { initial: this.input.aimSensitivity, onChange: (v) => (this.input.aimSensitivity = v) },
        dpi: { initial: loadMouseDpi() },
        invertMouse: { initial: this.input.invertY, onChange: (on) => (this.input.invertY = on) },
        rawInput: {
          initial: this.pointer.rawInput,
          onChange: (on) => (this.pointer.rawInput = on),
          status: () => this.pointer.rawStatus,
          watch: (fn) => this.pointer.onRawStatus(fn),
        },
        crouch: { initial: this.input.crouchMode, onChange: (m) => (this.input.crouchMode = m) },
        aim: { initial: this.input.aimMode, onChange: (m) => (this.input.aimMode = m) },
        sprint: { initial: this.input.sprintMode, onChange: (m) => (this.input.sprintMode = m) },
        wheelSelect: { initial: this.input.wheelSelect, onChange: (m) => (this.input.wheelSelect = m) },
      },
      fov: { initial: this.renderer.fov, onChange: (v) => this.renderer.setFov(v) },
      graphics: {
        quality: {
          initial: this.qualityChoice,
          settings: this.quality,
          onChange: (choice, q) => this.changeQuality(choice, q),
          status: () => ({ antialiased: this.renderer.antialiased, antialiasPending: this.renderer.antialiasPending, maxAnisotropy: this.renderer.maxAnisotropy }),
        },
        frameRateCap: { initial: this.frameRateCap, onChange: (cap) => (this.frameRateCap = cap) },
        showFps: { initial: loadShowFps(), onChange: (on) => this.debug.setFpsReadout(on) },
      },
      audio: { initial: this.audio.volumes, onChange: (channel, v) => this.changeVolume(channel, v), onRelease: (channel) => this.audio.preview(channel) },
      crosshair: { initial: this.crosshair, onChange: (c) => this.changeCrosshair(c) },
      accessibility: {
        reducedMotion: { initial: this.reducedMotion, onChange: (on) => this.changeReducedMotion(on) },
        // The figures are built with their colours, so a new set shows from the next match.
        // On the range they show from Resume (it's rebuilt where you stood, as after a loadout change).
        teamColours: { initial: this.teamColours, onChange: (set) => ((this.teamColours = set), (this.setupChanged = this.loadoutChanged = true)) },
        soundCues: { initial: this.soundCues, onChange: (on) => this.changeSoundCues(on) },
        soundCueSize: { initial: this.soundCueSize, onChange: (v) => ((this.soundCueSize = v), this.showHudLook()) },
        soundCueColour: { initial: this.soundCueColour, onChange: (c) => ((this.soundCueColour = c), this.showHudLook()) },
      },
      hud: {
        hudSize: { initial: this.hudSize, onChange: (v) => ((this.hudSize = v), this.showHudLook()) },
        scoreboardSize: { initial: this.scoreboardSize, onChange: (v) => ((this.scoreboardSize = v), this.showHudLook()) },
        hitFeed: { initial: this.hitFeedMode, onChange: (m) => this.changeHitFeed(m) },
      },
      dev: {
        initial: this.devPicked,
        enabled: this.devEnabled,
        onChange: (id, value) => {
          this.devPicked[id] = value;
          this.applyDev();
        },
        onEnabled: (on) => {
          this.devEnabled = on;
          this.applyDev();
        },
        cheating: () => devCheating(this.dev),
        diagnostics: () => this.diagnostics(),
      },
      save: options.save,
    });
    this.menus.showTitle();
    this.showHudLook();
    window.addEventListener('resize', this.showHudLook);
    this.debug.setVisible(this.dev.showDebug);
    this.debug.setFpsReadout(loadShowFps());
    this.showMotion();
    this.showTitleWarning();
    options.save.onChange(() => this.showTitleWarning());
    this.graphicsNotice = new GraphicsNotice(container, BROWSER_NOTES.graphicsLost);
    this.renderer.onContextChange((lost) => this.graphicsContextChanged(lost));
    this.stopWatchingAway = awayWatch({ doc: document, win: window }, this.goneAway);
    this.audio.onBlocked = () => {
      this.audioBlocked = true;
      this.menus.showHint(BROWSER_NOTES.audioBlocked);
    };
    this.pointer.onChange((locked) => {
      // Stopped on an error: the crash pane stays on top and nothing resumes; a lock granted late is given back.
      if (this.crashScreen) {
        if (locked) this.pointer.release();
        return;
      }
      if (locked) this.resume();
      else {
        this.pause();
        this.relockAfterFullscreen();
      }
    });
    this.unwatchFullscreen = onFullscreenChange(() => this.relockAfterFullscreen());
    // Slider changes wait a moment before they are written (settings/storage.ts saveSettingSoon): write them as the page goes.
    window.addEventListener('pagehide', this.flushSettings);
    this.pointer.onError(() => this.menus.showHint(LOCK_REFUSED_HINT));
    this.audio.warmUp();
    this.renderer.warmUp();
  }

  /** The tab hidden or the window's focus lost (M18b, audit CORE-20) stops play, as Esc would; this stops watching. */
  private readonly stopWatchingAway: () => void;
  /** The browser wouldn't let the sound start since play last resumed (audit CORE-21): the menus say so. */
  private audioBlocked = false;

  /** The player went away (tab hidden, focus lost): the match pauses and pending settings are written (FA5, UI-11). */
  private readonly goneAway = (): void => {
    this.stopPlay();
    flushSettings();
  };

  private readonly flushSettings = (): void => flushSettings();

  /**
   * The page entered or left fullscreen, or the mouse lock dropped: just after the Fullscreen key in play, the lock is
   * taken again, so the key doesn't stop the match on the pause menu (audit UI-19; Resume follows the lock as usual).
   */
  private relockAfterFullscreen(): void {
    const since = performance.now() - this.fullscreenKeyAt;
    const inMatch = this.started && this.session !== null && !this.crashScreen; // a crash gives the mouse back for good (FA1)
    if (!relockAfterFullscreen(since, FULLSCREEN_RELOCK_MS, inMatch, this.pointer.locked, this.unlockedPlay)) return;
    this.fullscreenKeyAt = Number.NEGATIVE_INFINITY;
    void this.pointer.request();
  }

  /**
   * The graphics context was lost (true) or is back (false) (M18b, audit W-01). While it's gone the match pauses
   * and a notice covers everything; once it's back the pause menu says so and Resume carries on (Three.js uploads
   * everything again on the next frame, except render targets, which the session renders again: contextRestored).
   */
  private graphicsContextChanged(lost: boolean): void {
    this.graphicsLost = lost;
    this.graphicsNotice.setVisible(lost);
    // The menus can't be used under the notice (not even Resume by Enter or Space on the focused button).
    this.menus.setBlocked(lost || this.yielded);
    if (lost) {
      this.stopPlay();
    } else {
      this.session?.contextRestored();
      // Only the pause menu has a Resume to point at (not the result screen).
      if (this.started && this.menus.screen === 'pause') this.menus.showHint(BROWSER_NOTES.graphicsBack);
    }
  }

  /**
   * The title screen's warning: the browser draws without hardware acceleration, and saving doesn't work (blocked or
   * full storage, a save from a newer build; M31).
   */
  private showTitleWarning(): void {
    const notes: string[] = [];
    if (this.options.softwareRendering) {
      notes.push(BROWSER_NOTES.noHardwareAcceleration);
      if (this.options.automaticQuality) notes.push(BROWSER_NOTES.qualitySetLow);
    }
    const save = this.options.save;
    if (save.newerBuild) notes.push(SAVE_TEXT.newer(save.newerBuild));
    else if (save.blocked) notes.push(SAVE_TEXT.blocked);
    this.menus.showTitleWarning(notes.join(' '));
  }

  /** Another tab took the save (M31, save/tabLock.ts): play stops and the menus can't be used under its notice. */
  yieldToOtherTab(): void {
    this.yielded = true;
    this.stopPlay();
    this.menus.setBlocked(true);
  }

  /** Another tab has the save (yieldToOtherTab): the menus stay blocked for the rest of the visit. */
  private yielded = false;

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

  /** A volume slider moved on Settings → Audio: the shared bus eases to it (the match loaded and every later one). */
  private changeVolume(channel: VolumeChannel, position: number): void {
    this.audio.setVolume(channel, position);
  }

  /** The crosshair changed on Settings → Crosshair: kept for the next match and applied to the one loaded. */
  private changeCrosshair(crosshair: CrosshairSettings): void {
    this.crosshair = crosshair;
    this.session?.combat.setCrosshair(crosshair);
  }

  /** Reduced motion turned on or off: kept for the next match and applied to the one loaded. */
  private changeReducedMotion(on: boolean): void {
    this.reducedMotion = on;
    this.session?.setMotion(motionScale(on));
    this.showMotion();
  }

  /**
   * Reduced motion for the HUD's CSS animations (style.css, audit M-03): `reduced-motion` calms them; `full-motion`
   * marks an explicit Off, so the stylesheet's `prefers-reduced-motion` fallback doesn't override the player's choice.
   */
  private showMotion(): void {
    this.container.classList.toggle('reduced-motion', this.reducedMotion);
    this.container.classList.toggle('full-motion', !this.reducedMotion);
  }

  /**
   * New quality settings (Settings → Graphics, or the game's own step-down when `automatic`): applied at once to the
   * renderer and the match loaded. A new WebGL context (antialiasing turned on or off) has the session render its render
   * targets again, as after a lost context.
   */
  private changeQuality(choice: QualityChoice, settings: QualitySettings, automatic = false): void {
    this.qualityChoice = choice;
    this.quality = settings;
    if (!automatic) {
      this.autoQuality = false;
      this.stepDownTo = null;
    }
    if (this.renderer.setQuality(settings)) this.session?.contextRestored();
    this.session?.setQuality(settings);
  }

  /**
   * The automatic step-down (REN-03), after each frame drawn in play: frame times go to the watch while the game's own
   * pick is in force; a step decided mid-round waits for the round to end (a new WebGL context compiles every shader,
   * a hitch nobody wants mid-fight), then applies, unsaved, with a line on the HUD.
   */
  private watchFrameTimes(s: MatchSession | RangeSession, frameSeconds: number): void {
    if (!this.autoQuality || this.steppedDown) return;
    if (this.stepDownTo === null) {
      const below = presetBelow(this.qualityChoice);
      if (below && this.frameWatch.add(frameSeconds * 1000, slowFrameMs(this.frameRateCap))) this.stepDownTo = below;
    }
    if (this.stepDownTo === null || (s instanceof MatchSession && s.state.round.phase === 'live')) return;
    const preset = this.stepDownTo;
    this.stepDownTo = null;
    this.steppedDown = true;
    this.changeQuality(preset, QUALITY[preset], true);
    this.menus.showQuality(preset, QUALITY[preset]);
    const label = QUALITY_CHOICES.find((c) => c.id === preset)!.label;
    s.combat.showNotice(GRAPHICS_TEXT.steppedDown(label), QUALITY_STEP_DOWN.noticeSeconds);
  }

  /** The debug overlay's quality line: the choice, and the render scale, pixel ratio and shadow map in force. */
  private qualityText(): string {
    const q = this.quality;
    return `${this.qualityChoice}${this.autoQuality ? ' (auto)' : ''} · scale ${q.renderScale} · shadow map ${q.shadows ? q.shadowMapSize : 'off'} · textures ${q.textureSize}`;
  }

  /** The debug overlay's antialiasing line (REN-21): asked for, given, and the samples per pixel. */
  private antialiasText(): string {
    const gl = this.renderer.renderer.getContext();
    return `${this.quality.antialias ? 'on' : 'off'} asked, ${this.renderer.antialiased ? 'on' : 'off'} given (${String(gl.getParameter(gl.SAMPLES))} samples)`;
  }

  /** On-screen sound cues turned on or off: kept for the next match and applied to the one loaded. */
  private changeSoundCues(on: boolean): void {
    this.soundCues = on;
    // The range has nobody else to hear, so only a match takes them.
    if (this.session instanceof MatchSession) this.session.setSoundCues(on);
  }

  /** Hit feed lines fade or stay (Settings → HUD, M24): kept for the next match and applied to the one loaded. */
  private changeHitFeed(mode: HitFeedMode): void {
    this.hitFeedMode = mode;
    if (this.session instanceof MatchSession) this.session.setHitFeedMode(mode);
  }

  /**
   * The HUD's look from the settings (M24), as CSS variables on the game's container (style.css): the HUD's size (audit
   * UI-04), the sound cues' size and colour, and the scoreboard's size (held back in a narrow window so the hit feed
   * keeps its room). Again on resize.
   */
  private readonly showHudLook = (): void => {
    const style = this.container.style;
    const hud = hudScale(this.hudSize, this.container.clientHeight || window.innerHeight);
    style.setProperty('--hud-scale', String(hud));
    style.setProperty('--cue-scale', String(this.soundCueSize));
    style.setProperty('--cue-colour', soundCueCss(this.soundCueColour));
    // The scoreboard grows with the HUD, still only as far as leaves the hit feed room.
    style.setProperty('--sb-scale', scoreboardScale(this.scoreboardSize * hud, this.container.clientWidth || window.innerWidth).toFixed(3));
  };

  /** A Dev setting changed, or the Dev tab was shown or hidden (M24): what applies now goes to the game and the session. */
  private applyDev(): void {
    const before = this.dev;
    this.dev = activeDev(this.devEnabled, this.devPicked);
    // Only on a change, so the debug keys (` / F3, ]) keep working as toggles.
    if (this.dev.showDebug !== before.showDebug) this.debug.setVisible(this.dev.showDebug);
    if (this.dev.showBbPaths !== before.showBbPaths) this.session?.combat.setBbPaths(this.dev.showBbPaths);
    this.session?.setDevCheats(this.dev);
    // Unlock all gear changes what the Loadout offers and carries; the next Play rebuilds the match with it.
    if (this.dev.unlockAllGear !== before.unlockAllGear) this.loadoutChanged = this.setupChanged = true;
  }

  /** A new session takes the Dev settings in force (M24). */
  private applyDevTo(session: MatchSession | RangeSession): void {
    session.combat.setBbPaths(this.dev.showBbPaths);
    session.setDevCheats(this.dev);
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
    this.stopWatchingAway();
    window.removeEventListener('resize', this.showHudLook);
    window.removeEventListener('pagehide', this.flushSettings);
    this.unwatchFullscreen();
    this.unwatchLayout();
    flushSettings();
    this.graphicsNotice.dispose();
    this.session?.dispose();
    this.session = null;
    this.audio.dispose();
    this.keyboard.dispose();
    this.pointer.dispose();
    this.debug.dispose();
    this.menus.dispose();
    this.renderer.dispose();
  }

  /**
   * Play on New game, Resume, Play Again. Before play has begun in a match, the match is built here from New game's
   * choices; a match left over from a lock request still pending (or refused) is reused if nothing changed since, and
   * replaced otherwise. Runs in the click, so audio can be unlocked.
   */
  private play(): void {
    if (this.graphicsLost) return;
    const s = this.session;
    if (!this.started && this.practice) {
      // The tutorial resumes at the step it was left at (audit POOL-14).
      this.openRange(undefined, this.tutorial ? loadTutorialStep() : undefined);
    } else if (this.started && s instanceof RangeSession && this.loadoutChanged) {
      // Back from the Loadout on the range's pause menu: the range again, with the new kit, where you stood (and at the
      // same tutorial step).
      this.openRange(s.pose, s.tutorialStep);
    } else if (
      buildsNewMatch({
        started: this.started,
        loaded: s instanceof MatchSession ? 'match' : s ? 'range' : null,
        matchOver: s instanceof MatchSession && s.state.round.phase === 'matchOver',
        setupChanged: this.setupChanged,
      })
    ) {
      this.session?.dispose();
      this.setupChanged = false;
      // The first match plays the visit's seed (?seed=N replays it); each later one its own, or every match in a visit
      // would open with the same bot plans, round by round (bug pass). Play Again is a new match too (audit SIM-08).
      this.matchSeed = matchSeed(this.options.seed, this.matchesPlayed);
      this.matchCounted = false;
      this.session = new MatchSession(this.renderer, this.container, this.input, {
        map: mapData(this.map),
        mode: this.mode,
        difficulty: this.difficulty,
        teammateDifficulty: this.teammateDifficulty,
        rules: { ...this.matchRules },
        kit: this.loadout.kit(),
        teamColours: TEAM_COLOUR_SETS[this.teamColours],
      }, this.matchSeed, this.quality, this.audio, this.crosshair);
      this.steppedDown = false;
      this.session.setMotion(motionScale(this.reducedMotion));
      this.session.setSoundCues(this.soundCues);
      this.session.setHitFeedMode(this.hitFeedMode);
      this.applyDevTo(this.session);
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

  /**
   * Builds the practice range (M21) with the picked loadout, at `pose` if given (else behind the firing line), with the
   * tutorial from step `tutorialFrom` if given (M16).
   */
  private openRange(pose?: RangePose, tutorialFrom?: number | string): void {
    this.session?.dispose();
    this.loadoutChanged = false;
    this.session = new RangeSession(this.renderer, this.container, this.input, {
      kit: this.loadout.kit(),
      teamColours: TEAM_COLOUR_SETS[this.teamColours],
    }, this.options.seed, this.quality, this.audio, this.crosshair, pose, tutorialFrom);
    this.session.onTutorialStep = (step) => saveSetting('tutorialStep', step);
    this.steppedDown = false;
    this.session.setMotion(motionScale(this.reducedMotion));
    this.applyDevTo(this.session);
    applyTeamCss(this.container, TEAM_COLOUR_SETS[this.teamColours]);
  }

  private resume(): void {
    const s = this.session;
    // A mouse lock granted after the graphics context was lost (the lock was still pending): nothing can be drawn.
    if (this.graphicsLost) {
      this.pointer.release();
      return;
    }
    if (!s) {
      // Nothing to play (should not happen: Play builds the match before asking for the lock); give the mouse back.
      this.pointer.release();
      return;
    }
    if (s instanceof MatchSession && !this.matchCounted) {
      this.matchCounted = true;
      this.matchesPlayed++;
    }
    this.started = true;
    // Time on the menus isn't a frame time.
    this.frameWatch.reset();
    this.keyboard.capturing = true;
    this.menus.hide();
    this.audioBlocked = false;
    s.setPlaying(true);
  }

  /**
   * The player left the match (Quit on the pause menu, New Game or Quit on the result), or
   * went Back from New game after a Play whose mouse lock was refused: the match is unloaded, and the next Play builds a
   * new one from New game, where everything can change again.
   */
  private leaveMatch(): void {
    this.started = false;
    this.practice = false;
    this.tutorial = false;
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
      this.menus.showPause(s.status, this.options.seed, true, s.coaching);
    } else if (!this.started || !(s instanceof MatchSession) || !r) {
      // Play never began (a lock that came late, after Back, and was given straight back): the menus are still up on
      // whichever screen the player went to, so they stay there.
    } else if (screen === 'result') {
      const mine = s.player.team;
      const theirs = 1 - mine;
      const draws = r.draws;
      const played = r.score[0] + r.score[1] + draws;
      const headline = r.matchWinner === mine ? 'You win!' : 'You lose';
      const score = `${TEAMS[mine]!.name} (you) ${r.score[mine]} – ${r.score[theirs]} ${TEAMS[theirs]!.name}`;
      // Settled the moment it was decided (frame); again here in case that frame never came (it does nothing twice).
      this.settleMatch(s);
      this.menus.showResult(headline, `${score} · ${played} rounds${draws > 0 ? `, ${draws} drawn` : ''}`, {
        result: `${headline} · ${score}`,
        blocks: s.summaryBlocks(),
        records: recordsView(this.records, this.recordNews, s.setup.difficulty, s.mode, s.notCountedReason),
        fieldCredits: this.lastEarnings,
        unpaid: this.unpaidReason,
      });
    } else {
      const mine = s.player.team;
      const theirs = 1 - mine;
      // Between rounds, the role you'll have next round (it swaps at half-time).
      const attackers = r.phase === 'over' ? attackersInRound(r.number + 1, s.rounds) : r.attackers;
      const role = r.mode === 'attackDefend' ? ` · attack / defend, you ${attackers === mine ? 'attack' : 'defend'}${r.phase === 'over' ? ' next' : ''}` : '';
      this.menus.showPause(
        `${r.phase === 'over' ? `After round ${r.number}` : `Round ${r.number}`}${role} · ${TEAMS[mine]!.name} (you) ${r.score[mine]} – ${r.score[theirs]} ${TEAMS[theirs]!.name} · first to ${s.rounds.winsNeeded}`,
        this.matchSeed,
      );
    }
    s?.setPlaying(false);
    // The screen just shown starts without a hint: say again why the match was silent.
    if (this.audioBlocked) this.menus.showHint(BROWSER_NOTES.audioBlocked);
  }

  /** The pause menu's Skip step or Skip tutorial (audit POOL-14): the range carries on, the pause menu says where. */
  private skipTutorial(all: boolean): void {
    const s = this.session;
    if (!(s instanceof RangeSession)) return;
    if (all) s.endTutorial();
    else s.skipTutorialStep();
    this.takeTutorialFinished(s);
    this.menus.showPause(s.status, this.options.seed, true, s.coaching);
  }

  /** The tutorial was played (or skipped) to its end: remembered, and the next one starts from the beginning. */
  private takeTutorialFinished(s: RangeSession): void {
    if (!s.takeTutorialFinished()) return;
    saveSetting('tutorialDone', true);
    saveSetting('tutorialStep', '');
    this.menus.markTutorialDone();
  }

  /**
   * A decided match goes into the records and pays its Field Credits as soon as it is decided (audit CORE-06), not when
   * the mouse is given back for the result screen: a tab closed in between, or a browser that never reports the lock's
   * release, lost it. Once per match (the session's take latches); the result screen only shows what this saved.
   */
  private settleMatch(s: MatchSession): void {
    // Once per session, on the first frame the match is over: nothing is built on the frames after (CLAUDE.md §9).
    if (s.state.round.phase !== 'matchOver' || this.settledSession === s) return;
    this.settledSession = s;
    syncCollection(this.collection, GAME_POOL);
    const settled = settleMatch(this.records, this.collection, s.takeMatchResult(), s.takeOutcome(), GAME_POOL.economy, this.dev.disableArmory);
    if (settled.news) {
      this.recordNews = settled.news;
      saveRecords(this.records, browserStorage());
    }
    if (settled.pay) {
      this.lastEarnings = settled.pay;
      this.unpaidReason = null;
      saveCollection(this.collection);
      this.menus.refresh();
    } else if (!s.paysFieldCredits || this.dev.disableArmory) {
      // Not paid (Dev settings, or the Armory off): the summary says why (audit POOL-22), not what an earlier match paid.
      this.lastEarnings = null;
      this.unpaidReason = this.dev.disableArmory ? 'off' : 'dev';
    }
  }

  /**
   * The game's state for a crash or diagnostics report (audit CORE-04, CORE-32), read defensively: it may run after an
   * error left things half-done, so each value falls back to '-' rather than throwing.
   */
  private reportFields(): ReportField[] {
    const read = <T>(f: () => T): T | '-' => {
      try {
        return f();
      } catch {
        return '-';
      }
    };
    const s = this.session;
    const range = s instanceof RangeSession;
    const match = s instanceof MatchSession ? s : null;
    const r = match?.state.round;
    const info = this.renderer.renderer.info;
    return [
      ['Seed', range ? this.options.seed : this.matchSeed],
      ['Map', read(() => (range ? 'range' : match ? match.setup.map.name : '-'))],
      ['Mode', read(() => (match ? `${match.mode}, ${match.setup.difficulty} (teammates ${match.setup.teammateDifficulty})` : range ? 'practice' : '-'))],
      ['Round', read(() => (r ? `${r.number} (${r.phase}), score ${r.score[0]}–${r.score[1]}, draws ${r.draws}` : '-'))],
      ['Tick', read(() => s?.state.tick ?? '-')],
      ['Screen', read(() => ((this.pointer.locked || this.unlockedPlay) && s ? 'in play' : `menus: ${this.menus.screen}`))],
      ['Quality', `${this.quality}${this.options.automaticQuality ? ' (automatic)' : ''}`],
      ['Pixel ratio', read(() => this.renderer.renderer.getPixelRatio())],
      ['GPU', read(() => rendererName(this.renderer.renderer.getContext()))],
      ['Window', `${window.innerWidth} × ${window.innerHeight} at ${window.devicePixelRatio}`],
      ['Sim ticks/s', this.tickRate],
      ['Draw calls / triangles', read(() => `${info.render.calls} / ${info.render.triangles}`)],
      ['Dev settings', this.devEnabled ? JSON.stringify(this.dev) : 'off'],
      // Pending slider writes (FA5's saveSettingSoon) go first, so the stored settings are the ones in use.
      ['Settings', read(() => {
        flushSettings();
        return browserStorage()?.getItem(SETTINGS_KEY) ?? '-';
      })],
    ];
  }

  /** The diagnostics report (Settings → Dev → Copy diagnostics; audit CORE-32): the crash report's fields, no error. */
  diagnostics(): string {
    return crashReport({ title: 'Airsoft diagnostics', build: __BUILD_VERSION__.label, userAgent: navigator.userAgent, fields: this.reportFields() });
  }

  /**
   * The game stopped on an error (audit CORE-04, UI-02): from the loop, or an uncaught error or rejection (main.ts). The
   * loop stops for good, the mouse and keys are given back, the sound stops, and the crash pane shows what happened with
   * a report to copy. Each step is guarded: whatever broke may break them too. A later error only adds to the report.
   */
  crash(error: unknown): void {
    console.error(error);
    let report: string;
    try {
      report = crashReport({ title: 'Airsoft crash report', build: __BUILD_VERSION__.label, userAgent: navigator.userAgent, fields: this.reportFields(), error });
    } catch {
      report = crashReport({ title: 'Airsoft crash report', build: __BUILD_VERSION__.label, userAgent: navigator.userAgent, fields: [], error });
    }
    if (this.crashScreen) {
      this.crashScreen.append(report);
      return;
    }
    const steps = [
      () => cancelAnimationFrame(this.rafId),
      () => (this.keyboard.capturing = false),
      () => this.keyboard.releaseAll(),
      () => this.pointer.setUnlockedButtons(false),
      () => this.pointer.release(),
      () => this.session?.setPlaying(false),
      () => this.audio.setRunning(false),
      () => this.menus.setBlocked(true),
    ];
    for (const step of steps) {
      try {
        step();
      } catch {
        // Keep going: the pane matters more than any one of these.
      }
    }
    this.unlockedPlay = false;
    this.crashScreen = new CrashScreen(this.container, { heading: CRASH_TEXT.heading, body: CRASH_TEXT.body, advice: '', report });
  }

  private readonly frame = (now: number): void => {
    if (this.crashScreen) return;
    this.rafId = requestAnimationFrame(this.frame);
    try {
      this.step(now);
    } catch (error) {
      // Once, then stop: an error here would otherwise repeat every frame with the mouse locked and no word on screen.
      this.crash(error);
    }
  };

  /** One frame of the loop: input, the simulation ticks due, and the drawing. */
  private step(now: number): void {
    // rAF timestamps can precede the performance.now() taken in start(); clamp to [0, MAX].
    const dt = Math.min(SIM.maxFrameDt, Math.max(0, (now - this.lastTime) / 1000));
    this.lastTime = now;

    const s = this.session;
    const running = (this.pointer.locked || this.unlockedPlay) && s !== null;
    if (running) {
      // Only while playing: on the pause screen F3 belongs to the browser (find bar).
      if (this.keyboard.wasPressed('debugOverlay')) this.debug.toggle();
      if (this.keyboard.wasPressed('debugBbPaths')) s.combat.toggleBbPaths();
      // Still within the key press's user activation, which the browser needs for fullscreen (and to take the mouse again).
      if (this.keyboard.wasPressed('fullscreen')) {
        this.fullscreenKeyAt = now;
        toggleFullscreen();
      }
      // The Dev settings' Game speed (M24) runs the simulation slower or faster than the clock.
      const simStart = performance.now();
      this.ticksThisSecond += s.advance(dt * this.dev.gameSpeed);
      this.simMs += (performance.now() - simStart - this.simMs) * FRAME_TIMING.smoothing;
      if (s instanceof MatchSession) this.settleMatch(s);
      if (s instanceof RangeSession) this.takeTutorialFinished(s);
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

    // The frame-rate cap (REN-16, CORE-25): a frame not drawn still ran the simulation above; the next one drawn animates
    // over the time since the last.
    this.sinceDrawn += dt;
    if (!this.pacer.shouldDraw(now, this.frameRateCap)) return;
    const frameSeconds = this.sinceDrawn;
    this.sinceDrawn = 0;
    // Only while playing: the menus are opaque, so drawing the paused field under them would be GPU work nobody sees.
    if (running) {
      this.renderer.gpuTiming = this.debug.visible;
      const drawStart = performance.now();
      s.draw(frameSeconds, this.keyboard.isDown('scoreboard'));
      this.drawMs += (performance.now() - drawStart - this.drawMs) * FRAME_TIMING.smoothing;
      this.watchFrameTimes(s, frameSeconds);
    }
    this.debug.frame(frameSeconds);
  }
}
