import { AudioEngine } from './audio/audioEngine';
import { loadVolumes } from './audio/audioMix';
import { soundscapeOf } from './audio/soundscape';
import { motionScale, type SoundCueColour, soundCueCss } from './config/accessibility';
import type { VolumeChannel } from './config/audio';
import { type LookSettings, type RetroSettings, retroLookOf } from './config/look';
import type { Difficulty } from './config/bots';
import { activeDev, DEV_ACTION_TEXT, DEV_GIFTS, type DevActionId, type DevSettings, devCheating } from './config/dev';
import { PERF_SCRIPT } from './config/perfScript';
import { ROUNDS } from './config/hits';
import type { MatchRules, RulesetId } from './config/matchRules';
import { type CrosshairSettings, type FeedCorner, type HitFeedMode, hudInsetX, hudScale, scoreboardScale, type WhatGotYouMode } from './config/matchInfo';
import { MINIMAP, minimapScale } from './config/minimap';
import { FULLSCREEN_RELOCK_MS, PAUSE_ESC_GUARD_MS } from './config/controls';
import { HUD_TEXT } from './config/hudText';
import { escOpensMenu, escSkips } from './core/escSkip';
import { CRASH_TEXT } from './config/crash';
import { LOADING } from './config/loading';
import { ARMORY_TEXT, BROWSER_NOTES, MENU_TEXT } from './config/menus';
import type { MatchMode } from './config/modes';
import { MOVEMENT } from './config/movement';
import { GRAPHICS_TEXT } from './config/graphics';
import { FRAME_TIMING, type FrameRateCap, type LightingPresetId, QUALITY, QUALITY_CHOICES, QUALITY_STEP_DOWN, type QualityChoice, type QualityPreset, type QualitySettings } from './config/render';
import { RANGE_CHALLENGE } from './config/range';
import { FramePacer } from './core/framePacer';
import { SIM } from './config/sim';
import { applyTeamCss, DEFAULT_TEAM_PICK, TEAM_COLOUR_SETS, type TeamColourSetId, teamOfPick, type TeamPickId } from './config/teams';
import { crashReport, type ReportField, type ReportInfo } from './core/crashReport';
import type { ErrorLog } from './core/errorLog';
import { FrameWindow } from './core/frameWindow';
import { clockText, framesLine, loadLine, memoryLine, playerLine, qualityLine, runReportLine } from './core/reportFields';
import { KeyBindings } from './input/keyBindings';
import { Keyboard } from './input/keyboard';
import { browserKeyboardMap, watchKeyboardLayout } from './input/keyboardLayout';
import { PlayerInput } from './input/playerInput';
import { PointerLock } from './input/pointerLock';
import { lightingPicked, mapUnderLighting, mapUnderPreset, playsAtNight } from './map/lightingChoice';
import { allMapsLoaded, loadDevMaps, type MapId, mapData } from './map/maps';
import type { MapData } from './map/mapTypes';
import { type PracticePlaceId, practiceMapId } from './map/practicePlaces';
import { initPhysics } from './physics/physicsWorld';
import { awayWatch } from './core/awayWatch';
import { loadBakedLight } from './render/bakedLight';
import { ModelFiles } from './render/modelFiles';
import { powerSourceLoader } from './render/powerSourceModels';
import { FrameTimeWatch, presetBelow, slowFrameMs } from './render/qualityStepDown';
import { rendererName } from './render/gpuCheck';
import { Renderer } from './render/renderer';
import type { RendererBoot } from './render/rendererStart';
import { matchSeed } from './matchFlow';
import { OnDemand } from './core/onDemand';
import { nextSessionAction, type SessionAction } from './core/sessionPlan';
import { MatchSession } from './matchSession';
import type { RangePose, RangeSession } from './rangeSession';
import type { GameState } from './sim/state';
import { addChallengeRun, loadRecords, noNews, type RecordNews, type Records, saveRecords } from './stats/records';
import { type NoXp, settleMatch } from './stats/settleMatch';
import { adaptedPicks, adaptiveNote, adaptiveSetup, settleAdaptive } from './adaptivePicks';
import { loadCrosshair } from './ui/crosshair';
import { loadHitMarker } from './ui/hitMarkerLook';
import { loadAmmoCounter, loadCallouts, loadFeedCorner, loadMagPrompts, loadMinimapTurn, loadPingMarkers } from './ui/hudSettings';
import { CrashScreen } from './ui/crashScreen';
import { DebugOverlay } from './ui/debugOverlay';
import { onFullscreenChange, relockAfterFullscreen, toggleFullscreen } from './ui/fullscreen';
import { GraphicsNotice } from './ui/graphicsNotice';
import { PlayPrompt } from './ui/playPrompt';
import { loadoutTile } from './ui/loadoutChoice';
import type { ItemRef } from './pool/item';
import { GAME_LEVELS } from './progress/gameLevels';
import { standing } from './progress/levels';
import { addXp, loadProgress, type Progress, resetProgress, saveProgress, syncProgress, xpToNext } from './progress/progress';
import { contentPool } from './pool/contentPool';
import { GAME_POOL } from './pool/gamePool';
import { matchUsesDev, type NewGamePicks, playedPicks, playedTeamSize } from './newGamePicks';
import { gameOwnership, type GearSlot, LoadoutModel } from './pool/loadoutModel';
import { activeSupplyEvent, supplyLine } from './pool/supplyEvents';
import { haulSummary, type XpSummary, xpSummary } from './ui/menus/summaryScreen';
import type { MenuLevel } from './ui/menus/menusOptions';
import { loadDevEnabled, loadDevSettings } from './settings/dev';
import { carryOverDevRetro, loadRetroSettings } from './settings/retroLook';
import { browserStorage, flushSettings, SETTINGS_KEY, saveSetting } from './settings/storage';
import type { SaveManager } from './save/saveManager';
import { SAVE_TEXT } from './config/save';
import { screenWhenStopped } from './ui/menus/menuNav';
import { Menus } from './ui/menus/menus';
import { followingPictureTarget, ItemPictures, nodePictureTarget } from './render/itemPictures';
import { kitSubjects } from './ui/menus/menuPictures';
import { recordsView } from './ui/recordsView';
import {
  effectiveReducedMotion,
  hasSavedTeammateDifficulty,
  loadAimMode,
  loadAimSensitivity,
  loadCrouchMode,
  loadDifficulty,
  loadFov,
  loadFrameRateCap,
  loadInvertMouse,
  loadLightingPicks,
  loadMap,
  loadPracticePlace,
  loadMatchRules,
  loadMode,
  loadMouseDpi,
  loadRuleset,
  loadReducedMotion,
  loadRendererChoice,
  loadSensitivity,
  loadShowFps,
  loadToneMapping,
  loadHitFeedMode,
  loadHudOpacity,
  loadHudSize,
  loadRawInput,
  loadScoreboardSize,
  loadSoundCueColour,
  loadLook,
  loadSoundCues,
  loadSoundCueSize,
  loadSprintMode,
  loadTeammateDifficulty,
  loadTeamColours,
  loadTeamPick,
  loadPracticeChallenge,
  loadTutorialDone,
  loadTutorialStep,
  loadWheelSelect,
  loadWhatGotYouMode,
  motionClass,
  systemReducedMotionQuery,
} from './ui/menus/savedChoices';

/** Where Practice plays (M94): a map, and the course its timed challenge's best is kept under. */
interface PracticeAt {
  map: MapData;
  course: string;
}

const LOCK_REFUSED_HINT = 'The browser needs a moment before re-capturing the mouse. Click again.';

/** Whether `s` is the practice range: the one session that isn't a match (its class arrives on first use, IM1). */
function isRange(s: MatchSession | RangeSession | null): s is RangeSession {
  return s !== null && !(s instanceof MatchSession);
}

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
  /** `?perf`: each match build logs how long its parts took (audit CORE-33, MatchSession.build), in any build. */
  perfLog?: boolean;
  /**
   * `?forceWebGL` (dev server and the e2e build only): when the node renderer is wanted (Renderer on Auto or WebGPU,
   * WebGPU overhaul W1), it draws on its WebGL2 back end without asking for an adapter, so a container can run it.
   */
  forceWebGL?: boolean;
  /** The console's recent errors and warnings since start-up (core/errorLog.ts, IM7), for the reports. */
  errors: ErrorLog;
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
  /** The menus' replica and part pictures (G3): drawn on demand with the game's renderer, one per frame. */
  private readonly pictures: ItemPictures;
  /** Over everything while the graphics context is lost (M18b). */
  private readonly graphicsNotice: GraphicsNotice;
  /** Esc skipped the round (core/escSkip.ts): click to play on, Esc for the menu. */
  private readonly playPrompt: PlayPrompt;
  /** True while the graphics context is lost: nothing can be drawn, so play can't start or resume. */
  private graphicsLost = false;
  /** The match being played (or paused, or just decided); null on the title and New game screens. */
  /** The match in play, or the practice range (M21); null on the menus with nothing loaded. */
  private session: MatchSession | RangeSession | null = null;
  /** The practice range's code (the tutorial's with it), fetched in the background once the title is up (IM1). */
  private readonly rangeCode = new OnDemand<typeof import('./rangeSession')>(() => import('./rangeSession'));
  /** The next Play opens the practice range rather than a match (the title's Practice range button). */
  private practice = false;
  /** ... with the tutorial's coach (the title's Tutorial button, M16). */
  private tutorial = false;
  /** The Loadout key was pressed in Practice (M95): the pause that follows opens the Loadout over its pause menu. */
  private loadoutDue = false;
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
  /** The match session already recorded and given its XP (settleMatch runs once per session). */
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
  /** Where Practice is played (M94): the range or a map, its own pick on the Match screen. */
  private practicePlace: PracticePlaceId = loadPracticePlace();
  /** Each map's Day or Night pick (M34d). */
  private readonly lighting: Partial<Record<MapId, LightingPresetId>>;
  private mode: MatchMode;
  /** The opponents' bot difficulty and your bot teammates' (M20). */
  private difficulty: Difficulty;
  private teammateDifficulty: Difficulty;
  /** The Match screen's "Your team" (M98): Alpha or Beta. */
  private team: TeamPickId;
  /** The Match pop-up's rules (M20), and its Rules row's ruleset (M39). */
  private matchRules: MatchRules;
  private ruleset: RulesetId;
  /** The player's level progress (LV1): XP and what it unlocked; and their loadout built from it (M26b). */
  private readonly progress: Progress;
  private readonly loadout: LoadoutModel;
  /**
   * The audio context, volume buses and synthesised sounds, kept across matches (each match's Sfx plays through
   * them). Made suspended at start; the sounds render in the title screen's spare time (audit M-09).
   */
  private readonly audio = new AudioEngine(loadVolumes());
  /** The crosshair's look (Settings → Crosshair), kept across matches. */
  private crosshair: CrosshairSettings = loadCrosshair();
  /** Settings › Gameplay › Hit marker (M97): off unless the player turned it on. */
  private hitMarker = loadHitMarker();
  /** Settings › HUD › Minimap (M83): rotating, or fixed north up. */
  private minimapTurn = loadMinimapTurn();
  /** Settings › HUD › Callouts (CL1): your bot teammates' calls in a match. */
  private callouts = loadCallouts();
  /** Settings › HUD › Ping markers (PG1): your pings and your teammates' marks shown in a match. */
  private pingMarkers = loadPingMarkers();
  /** Settings › HUD › Mag hand-off (MG1): its line and tags shown in a match. */
  private magPrompts = loadMagPrompts();
  /** Settings › HUD › Ammo counter (AC1): the replica panel's BB counts, in a match and in Practice. */
  private ammoCounter = loadAmmoCounter();
  /** The local records (M19), and what the last match finished changed in them. */
  private readonly records: Records = loadRecords(browserStorage());
  private recordNews: RecordNews = noNews();
  /** What the last match gave in XP and where it left the player's level (LV1), for its summary. */
  private lastXp: XpSummary | null = null;
  /** Why the last match gave no XP, for the summary (audit POOL-22), or null when it gave some. */
  private noXpReason: NoXp | null = null;
  /** What the last match did to adaptive difficulty (AD1), for its summary, or null when it played a fixed level. */
  private adaptiveLine: string | null = null;
  /** Reduced motion (Settings → Accessibility), kept across matches; null until the player picks (audit UI-07). */
  private reducedMotion = loadReducedMotion();
  /** The system's "reduce motion" setting, watched while the player has not picked (audit UI-07). */
  private readonly systemMotion = systemReducedMotionQuery();
  /** The team colours and the on-screen sound cues (Settings → Accessibility, M18b). Colours apply from the next match. */
  private teamColours: TeamColourSetId = loadTeamColours();
  private soundCues = loadSoundCues();
  /** Settings › Look (G1): robots and Realistic colours, for the next match or range visit. */
  private look: LookSettings = loadLook();
  /** Settings › Dev › Retro look (M96, back on the Dev tab since the Dev 6 playtest; applies while the Dev tab is shown). */
  private retro: RetroSettings;
  /** The sound cues' size and colour (Settings → Accessibility) and the scoreboard's size and hit feed (Settings → HUD), M24. */
  private soundCueSize = loadSoundCueSize();
  private soundCueColour: SoundCueColour = loadSoundCueColour();
  private scoreboardSize = loadScoreboardSize();
  private hitFeedMode: HitFeedMode = loadHitFeedMode();
  /** Settings → HUD → Feed position (Dev 6 playtest item 32). */
  private feedCorner: FeedCorner = loadFeedCorner();
  /** Settings → HUD → What got you (M41): the card after a hit; Auto turns it on against Pro opponents only. */
  private whatGotYouMode: WhatGotYouMode = loadWhatGotYouMode();
  /** The HUD's size as picked (Settings → HUD, audit UI-04); the screen's height scales it further (hudScale). */
  private hudSize = loadHudSize();
  /** How opaque the HUD's panels are (Settings → HUD, G4). */
  private hudOpacity = loadHudOpacity();
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
  private dev: DevSettings = this.devInForce();
  /** The perf harness drives the player (`?script=perf`): the retro filter stays off so its budgets compare (M42). */
  private readonly scripted: boolean;
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
  /** The frame times of the last seconds of play, for the reports (IM7). */
  private readonly frameWindow = new FrameWindow();
  /** When the loop started (performance.now()): the game was ready to play. */
  private readyAt = 0;
  /** Set by dispose(): work still in flight (the dev maps' fetch) then does nothing. */
  private disposed = false;
  /** Play asked for the lock and waits for the browser's answer before building (play). */
  private askingLock = false;
  /**
   * Esc skipped the round (core/escSkip.ts, the owner's 0.1 Dev 5 playtest, note 10): the browser took the mouse back and
   * the skip plays on without it, until a click takes it again (resume) or Esc again opens the menu. `escSkipAt`: when
   * it began (performance.now()).
   */
  private escSkip = false;
  private escSkipAt = 0;
  /** Up once the game has stopped on an error (crash); the loop never runs again. */
  private crashScreen: CrashScreen | null = null;

  static async create(container: HTMLElement, options: GameOptions): Promise<Game> {
    // The model files (the Blender replicas, parts and figures; BD1) load alongside the physics. With Dev content on, so
    // do the dev maps (M50), so New game can show a dev map picked last time. The maps' baked light (G6) too.
    const dev = activeDev(loadDevEnabled(), loadDevSettings());
    const devMaps = dev.devContent ? loadDevMaps() : null;
    const models = new ModelFiles();
    // The renderer (W1, W6): its start (render/rendererStart.ts, a small chunk of its own with the Renderer row) loads
    // alongside the physics with `three/webgpu`; on Auto or WebGPU it asks for an adapter first, and draws on WebGPU when
    // one is given, else on WebGL2. A browser with neither can't play: the start-up pane says so.
    const choice = loadRendererChoice();
    const starting = import('./render/rendererStart').then((m) => m.bootRenderer(choice, options.forceWebGL === true, options.qualitySettings.antialias));
    const [, , , , start] = await Promise.all([initPhysics(), models.load(), devMaps, loadBakedLight(), starting]);
    const game = new Game(container, options, start);
    game.renderer.models = models;
    return game;
  }

  private constructor(
    private readonly container: HTMLElement,
    private readonly options: GameOptions,
    /** What this visit draws with (render/rendererStart.ts): the node renderer, the adapter's name and the Renderer row's builder. */
    private readonly rendering: RendererBoot,
  ) {
    this.qualityChoice = options.quality;
    this.quality = options.qualitySettings;
    this.autoQuality = options.automaticQuality;
    this.matchSeed = options.seed;
    this.renderer = new Renderer(container, this.quality, rendering.node);
    this.renderer.setFov(loadFov());
    this.renderer.setToneMapping(loadToneMapping());
    this.map = loadMap();
    this.lighting = loadLightingPicks();
    this.mode = loadMode();
    this.difficulty = loadDifficulty();
    this.teammateDifficulty = loadTeammateDifficulty();
    this.team = loadTeamPick();
    // The menus show the team colours of the saved set (the Match screen's Your team), as each match sets them again.
    applyTeamCss(container, TEAM_COLOUR_SETS[this.teamColours]);
    this.matchRules = loadMatchRules();
    this.ruleset = loadRuleset();
    this.progress = loadProgress(GAME_LEVELS);
    const unlocks = { unlocked: () => this.progress.unlocked, levelOf: (id: string) => GAME_LEVELS.unlockLevel.get(id) };
    this.loadout = new LoadoutModel(GAME_POOL, gameOwnership(GAME_POOL, unlocks, () => this.dev.unlockAllGear, () => this.dev.devContent));

    this.bindings = new KeyBindings(browserStorage());
    this.keyboard = new Keyboard(window, this.bindings);
    // The lock is on the game's container, not the canvas: turning antialiasing on or off replaces the canvas (REN-04).
    this.pointer = new PointerLock(container, this.keyboard);
    this.pointer.rawInput = loadRawInput();
    // Key names on screen follow the player's keyboard layout where the browser tells it (audit UI-01).
    this.unwatchLayout = watchKeyboardLayout(browserKeyboardMap(), window, (layout) => this.bindings.setLayout(layout));
    this.input = new PlayerInput(this.keyboard, this.pointer, MOVEMENT);
    if (options.scriptedPlayer) this.input.script = PERF_SCRIPT;
    this.scripted = options.scriptedPlayer === true;
    carryOverDevRetro();
    this.retro = loadRetroSettings();
    this.showRetro();
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
      const drawn = this.renderer.stats;
      return {
        seed: isRange(s) ? options.seed : this.matchSeed,
        map: isRange(s) ? 'range' : this.playedPicks().map,
        tick: s?.state.tick ?? '-',
        'sim ticks/s': this.tickRate,
        characters: s?.characterCount ?? 0,
        pos: p ? `${p.position.x.toFixed(2)}, ${p.position.y.toFixed(2)}, ${p.position.z.toFixed(2)}` : '-',
        speed: p ? Math.hypot(p.velocity.x, p.velocity.z).toFixed(2) : '-',
        grounded: String(p?.grounded ?? '-'),
        'BBs in flight': s?.combat.bbsInFlight ?? 0,
        'audio latency (ms)': this.audio.latencyMs()?.toFixed(1) ?? '-',
        quality: this.qualityText(),
        renderer: this.renderer.backend,
        'pixel ratio': this.renderer.renderer.getPixelRatio(),
        'frame ms (sim / draw / GPU)': `${this.simMs.toFixed(1)} / ${this.drawMs.toFixed(1)} / ${Number.isNaN(this.renderer.gpuMs) ? 'n/a' : this.renderer.gpuMs.toFixed(1)}`,
        antialias: this.antialiasText(),
        // G5: the post stack's passes in force (none on Low).
        post: this.renderer.postPasses.join(' ') || 'none',
        'draw calls': drawn.calls,
        triangles: drawn.triangles,
        'programs / geometries / textures': `${drawn.programs} / ${drawn.geometries} / ${drawn.textures}`,
      };
    });

    // The menus' pictures of replicas and parts (G3), drawn by the game's renderer (W6; a new one after a lost device),
    // once a match's warm-up compile is done. The power sources' models are Blender files too (RM3), loaded the first time
    // one is pictured; one that can't be loaded keeps its line drawing.
    const powerSources = powerSourceLoader();
    this.pictures = new ItemPictures(
      followingPictureTarget(() => this.renderer.renderer, nodePictureTarget),
      undefined,
      () => this.renderer.replicaFiles,
      powerSources,
      () => this.renderer.afterCompiles(),
    );
    this.menus = new Menus(container, {
      pictures: this.pictures,
      rules: {
        raiseTime: ROUNDS.flag.raiseTime,
      },
      bindings: this.bindings,
      loadout: {
        model: this.loadout,
        onChange: () => (this.loadoutChanged = this.setupChanged = true),
        summary: () => loadoutTile(this.loadout),
      },
      armory: {
        // Dev gear shows on the level track only with Dev content on (M35).
        pool: () => contentPool(GAME_POOL, this.dev.devContent),
        levels: GAME_LEVELS,
        // Another tab's XP since this one read it is taken first (audit POOL-02).
        progress: () => this.syncedProgress(),
        levellingOff: () => this.dev.unlockAllGear,
        devContent: () => this.dev.devContent,
        level: () => this.menuLevel(),
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
      // Replay tutorial (M97): from its first step, finished or not; from the pause menu it leaves what was under way.
      onReplayTutorial: () => {
        const fromPause = this.started;
        if (fromPause) this.leaveMatch();
        saveSetting('tutorialStep', '');
        this.practice = true;
        this.tutorial = true;
        // From the pause menu with the mouse lock refused, the tutorial's own pause menu replaces the one it left (BP3:
        // the match's stayed up, Skip to next round and all).
        this.play(fromPause ? () => this.showRangePause() : undefined);
      },
      // Skip to next round (M83): the skip runs from the next frame of play, so Resume takes the mouse as usual. A skip
      // already begun whose play the browser refused (the mouse lock, just after Esc) is taken up by the next click (BP3).
      onSkipRound: () => {
        if (this.session instanceof MatchSession && (this.session.skipping || this.session.beginSkip())) this.play();
      },
      onToggleChallenge: () => this.toggleChallenge(),
      onSkipTutorialStep: () => this.skipTutorial(false),
      onSkipTutorial: () => this.skipTutorial(true),
      map: { initial: this.map, onChange: (m) => ((this.map = m), (this.setupChanged = true), this.prefetchFieldSounds()) },
      practicePlace: { initial: this.practicePlace, onChange: (p) => (this.practicePlace = p) },
      lighting: { initial: this.lighting, onChange: (m, light) => ((this.lighting[m] = light), (this.setupChanged = true), this.prefetchFieldSounds()) },
      mode: {
        initial: this.mode,
        onChange: (m) => ((this.mode = m), (this.setupChanged = true)),
        // The supply event on by the device's clock as the Mode pop-up opens (M49).
        supply: () => {
          const event = activeSupplyEvent(GAME_POOL.supplyEvents, new Date());
          return event ? supplyLine(event) : null;
        },
      },
      difficulty: { initial: this.difficulty, onChange: (d) => ((this.difficulty = d), (this.setupChanged = true)) },
      teammateDifficulty: { initial: this.teammateDifficulty, follows: !hasSavedTeammateDifficulty(), onChange: (d) => ((this.teammateDifficulty = d), (this.setupChanged = true)) },
      team: { initial: this.team, onChange: (t) => ((this.team = t), (this.setupChanged = true)) },
      matchRules: { initial: this.matchRules, onChange: (m) => ((this.matchRules = m), (this.setupChanged = true)) },
      ruleset: { initial: this.ruleset, onChange: (r) => ((this.ruleset = r), (this.setupChanged = true)) },
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
        toneMapping: { initial: this.renderer.toneMappingId, onChange: (id) => this.renderer.setToneMapping(id) },
        renderer: (row) => this.rendering.fillRow(row, this.renderer),
      },
      audio: { initial: this.audio.volumes, onChange: (channel, v) => this.changeVolume(channel, v), onRelease: (channel) => this.audio.preview(channel) },
      crosshair: {
        initial: this.crosshair,
        onChange: (c) => this.changeCrosshair(c),
        hitMarker: { initial: this.hitMarker, onChange: (m) => ((this.hitMarker = m), this.session instanceof MatchSession && this.session.setHitMarker(m)) },
      },
      accessibility: {
        reducedMotion: { initial: this.motionReduced(), onChange: (on) => this.changeReducedMotion(on), follow: (show) => (this.showSystemMotion = show) },
        // The figures are built with their colours, so a new set shows from the next match.
        // On the range they show from Resume (it's rebuilt where you stood, as after a loadout change).
        teamColours: {
          initial: this.teamColours,
          onChange: (set) => {
            this.teamColours = set;
            this.setupChanged = this.loadoutChanged = true;
            // The menus' team swatches (the Match screen's Your team) follow at once; a match loaded keeps its own until the next.
            if (!this.session) applyTeamCss(this.container, TEAM_COLOUR_SETS[set]);
          },
        },
        soundCues: { initial: this.soundCues, onChange: (on) => this.changeSoundCues(on) },
        soundCueSize: { initial: this.soundCueSize, onChange: (v) => ((this.soundCueSize = v), this.showHudLook()) },
        soundCueColour: { initial: this.soundCueColour, onChange: (c) => ((this.soundCueColour = c), this.showHudLook()) },
      },
      // Built into the figures and replicas, so a change shows from the next match (on the range, from Resume).
      look: {
        initial: this.look,
        onChange: (look) => ((this.look = look), (this.setupChanged = this.loadoutChanged = true)),
      },
      hud: {
        hudSize: { initial: this.hudSize, onChange: (v) => ((this.hudSize = v), this.showHudLook()) },
        scoreboardSize: { initial: this.scoreboardSize, onChange: (v) => ((this.scoreboardSize = v), this.showHudLook()) },
        hudOpacity: { initial: this.hudOpacity, onChange: (v) => ((this.hudOpacity = v), this.showHudLook()) },
        hitFeed: { initial: this.hitFeedMode, onChange: (m) => this.changeHitFeed(m) },
        feedCorner: { initial: this.feedCorner, onChange: (c) => ((this.feedCorner = c), this.session instanceof MatchSession && this.session.setFeedCorner(c)) },
        whatGotYou: { initial: this.whatGotYouMode, onChange: (m) => this.changeWhatGotYou(m) },
        minimapTurn: { initial: this.minimapTurn, onChange: (t) => ((this.minimapTurn = t), this.session?.setMinimapTurn(t)) },
        callouts: { initial: this.callouts, onChange: (m) => ((this.callouts = m), this.session instanceof MatchSession && this.session.setCallouts(m === 'on')) },
        pingMarkers: { initial: this.pingMarkers, onChange: (m) => ((this.pingMarkers = m), this.session instanceof MatchSession && this.session.setPingMarkers(m === 'on')) },
        magPrompts: { initial: this.magPrompts, onChange: (m) => ((this.magPrompts = m), this.session instanceof MatchSession && this.session.setMagPrompts(m === 'on')) },
        ammoCounter: { initial: this.ammoCounter, onChange: (m) => ((this.ammoCounter = m), this.session?.setAmmoCounter(m === 'on')) },
      },
      dev: {
        initial: this.devPicked,
        enabled: this.devEnabled,
        // The filter is a screen effect: on, off and its sliders show at once.
        retro: { initial: this.retro, onChange: (r) => ((this.retro = r), this.showRetro()) },
        onChange: (id, value) => {
          this.devPicked[id] = value;
          this.applyDev();
        },
        onEnabled: (on) => {
          this.devEnabled = on;
          this.applyDev();
          // Only a Retro look that is on changes the picture; setRetro rebuilds the post stack, so skip it otherwise.
          if (this.retro.on) this.showRetro();
        },
        cheating: () => devCheating(this.dev),
        devContent: () => this.dev.devContent,
        devContentUsed: () => this.devContentUsed(this.playedPicks()),
        adaptive: () => adaptiveNote(this.dev.adaptiveDifficulty, this.playedPicks(), this.dev.devContent),
        diagnostics: () => this.reportInfo('Airsoft diagnostics'),
        actions: (id) => this.devAction(id),
      },
      save: options.save,
    });
    this.menus.showTitle();
    this.showHudLook();
    window.addEventListener('resize', this.showHudLook);
    this.debug.setVisible(this.dev.showDebug);
    this.debug.setFpsReadout(loadShowFps());
    this.showMotion();
    this.systemMotion?.addEventListener('change', this.systemMotionChanged);
    this.showTitleWarning();
    this.unwatchSave = options.save.onChange(() => this.showTitleWarning());
    this.graphicsNotice = new GraphicsNotice(container, BROWSER_NOTES.graphicsLost);
    this.playPrompt = new PlayPrompt(container, HUD_TEXT.playPrompt);
    container.addEventListener('mousedown', this.clickToPlay);
    window.addEventListener('keydown', this.escSkipKey);
    this.renderer.onContextChange((lost) => this.graphicsContextChanged(lost));
    this.stopWatchingAway = awayWatch({ doc: document, win: window }, this.goneAway);
    this.audio.onBlocked = () => {
      this.audioBlocked = true;
      this.menus.showHint(BROWSER_NOTES.audioBlocked);
    };
    this.pointer.onChange((locked, released) => {
      // Stopped on an error: the crash pane stays on top and nothing resumes; a lock granted late is given back.
      if (this.crashScreen) {
        if (locked) this.pointer.release();
        return;
      }
      if (locked) {
        if (!this.askingLock) this.resume();
      } else if (this.escSkipDrop(released)) {
        this.startEscSkip();
      } else {
        this.pause();
        this.relockAfterFullscreen();
      }
    });
    this.unwatchFullscreen = onFullscreenChange(() => this.relockAfterFullscreen());
    // Slider changes wait a moment before they are written (settings/storage.ts saveSettingSoon): write them as the page goes.
    window.addEventListener('pagehide', this.flushSettings);
    // Refused while the round skips without the mouse: the prompt over the field says so, not the hidden menus.
    this.pointer.onError(() => (this.escSkip ? this.playPrompt.show(LOCK_REFUSED_HINT) : this.menus.showHint(LOCK_REFUSED_HINT)));
    this.audio.warmUp();
    this.prefetchFieldSounds();
    this.renderer.warmUp();
  }

  /**
   * The field New game would play now, under its Day/Night pick, has its own sounds rendered in the spare time after the
   * title screen's (M65, audit AUD-01), so Play doesn't. Again on every map, lighting or Dev content change; a dev map
   * only while Dev content is on and it is the pick (playedPicks).
   */
  private prefetchFieldSounds(): void {
    const id = this.playedPicks().map;
    // The same map object (and so the same soundscape) the match is built with (play).
    const map = this.playedMap(id);
    this.audio.prefetch(() => soundscapeOf(map, playsAtNight(map)));
  }

  /**
   * The map a match on `id` is built with: under its Day or Night pick (M34d), or under Dev settings › Time of day
   * (M90) on any map. The same object for the same choice, so the sounds prefetched and the meshes kept are its.
   */
  private playedMap(id: MapId): MapData {
    const base = mapData(id);
    return this.dev.timeOfDay === 'map' ? mapUnderLighting(base, this.lighting[id]) : mapUnderPreset(base, this.dev.timeOfDay);
  }

  /** The tab hidden or the window's focus lost (M18b, audit CORE-20) stops play, as Esc would; this stops watching. */
  private readonly stopWatchingAway: () => void;
  private readonly unwatchSave: () => void;
  /** The browser wouldn't let the sound start since play last resumed (audit CORE-21): the menus say so. */
  private audioBlocked = false;

  /** The player went away (tab hidden, focus lost): the match pauses and pending settings are written (FA5, UI-11). */
  private readonly goneAway = (): void => {
    this.stopPlay();
    flushSettings();
  };

  private readonly flushSettings = (): void => flushSettings();

  /** The mouse lock dropped (not the game's own release): whether it was Esc to skip the round (core/escSkip.ts). */
  private escSkipDrop(released: boolean): boolean {
    const s = this.session;
    if (!this.started || !(s instanceof MatchSession) || this.graphicsLost || this.yielded || this.askingLock) return false;
    return escSkips({
      released,
      skippable: s.skipping || s.skipOffer !== null,
      focused: document.visibilityState === 'visible' && document.hasFocus(),
      msSinceFullscreenKey: performance.now() - this.fullscreenKeyAt,
      fullscreenWindowMs: FULLSCREEN_RELOCK_MS,
    });
  }

  /**
   * Esc skipped the round (core/escSkip.ts): the skip begins, or the one running carries on, without the mouse. Keys
   * wait for play, as on the pause menu, and the prompt says how to play on.
   */
  private startEscSkip(): void {
    const s = this.session;
    if (s instanceof MatchSession && !s.skipping) s.beginSkip();
    this.escSkip = true;
    this.escSkipAt = performance.now();
    this.keyboard.capturing = false;
    this.keyboard.releaseAll();
    this.input.clearLatches();
    this.playPrompt.show();
  }

  /** The skip without the mouse is over: the mouse was taken again, play stopped, or the match was left. */
  private endEscSkip(): void {
    this.escSkip = false;
    this.playPrompt.hide();
  }

  /** A click on the field while the round skips without the mouse takes the mouse again, and play goes on (resume). */
  private readonly clickToPlay = (e: MouseEvent): void => {
    if (!this.escSkip || e.button !== 0) return;
    e.preventDefault();
    void this.pointer.request();
  };

  /** Esc again while the round skips without the mouse opens the pause menu (Resume carries on with the skip). */
  private readonly escSkipKey = (e: KeyboardEvent): void => {
    if (!this.escSkip || !escOpensMenu(e.code, e.repeat, performance.now() - this.escSkipAt, PAUSE_ESC_GUARD_MS)) return;
    e.preventDefault();
    this.endEscSkip();
    this.pause();
  };

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
    if (this.escSkip) {
      this.endEscSkip();
      this.pause();
    } else if (this.unlockedPlay) {
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

  /** Whether motion is reduced now: the player's pick, else the system's setting (audit UI-07). */
  private motionReduced(): boolean {
    return effectiveReducedMotion(this.reducedMotion, this.systemMotion?.matches ?? false);
  }

  /**
   * Reduced motion for the HUD's CSS animations (style.css, audit M-03): `reduced-motion` calms them; `full-motion`
   * marks an explicit Off, so the stylesheet's `prefers-reduced-motion` fallback doesn't override the player's choice.
   * Neither class before the player picks (audit UI-07), so that fallback follows the system live.
   */
  private showMotion(): void {
    const cls = motionClass(this.reducedMotion);
    this.container.classList.toggle('reduced-motion', cls === 'reduced-motion');
    this.container.classList.toggle('full-motion', cls === 'full-motion');
  }

  /** Shows a value on Settings › Accessibility's Reduced motion picker without saving it (BP2). */
  private showSystemMotion: ((on: boolean) => void) | null = null;

  /** The system's setting changed while the page is open: the 3D motion and the picker follow it, until the player picks. */
  private readonly systemMotionChanged = (): void => {
    if (this.reducedMotion !== null) return;
    this.session?.setMotion(motionScale(this.motionReduced()));
    this.showSystemMotion?.(this.motionReduced());
  };

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
    this.renderer.setQuality(settings);
    this.session?.setQuality(settings);
  }

  /**
   * The automatic step-down (REN-03), after each frame drawn in play: frame times go to the watch while the game's own
   * pick is in force; a step decided mid-round waits for the round to end (a new preset compiles new pipelines, a
   * hitch nobody wants mid-fight), then applies, unsaved, with a line on the HUD.
   */
  private watchFrameTimes(s: MatchSession | RangeSession, frameSeconds: number): void {
    if (!this.autoQuality || this.steppedDown) return;
    // A skipped round (M83) spends each frame simulating on purpose: its frames say nothing about the graphics.
    if (s instanceof MatchSession && s.skipping) return this.frameWatch.reset();
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
    return qualityLine(this.qualityChoice, this.autoQuality, this.quality);
  }

  /** The debug overlay's antialiasing line (REN-21): asked for, given, and the samples per pixel. */
  private antialiasText(): string {
    return `${this.quality.antialias ? 'on' : 'off'} asked, ${this.renderer.antialiased ? 'on' : 'off'} given (${this.renderer.samples} samples)`;
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

  /** The "what got you" card on, off or by difficulty (Settings → HUD, M41): kept for the next match and applied to the one loaded. */
  private changeWhatGotYou(mode: WhatGotYouMode): void {
    this.whatGotYouMode = mode;
    if (this.session instanceof MatchSession) this.session.setWhatGotYouMode(mode);
  }

  /**
   * The HUD's look from the settings (M24), as CSS variables on the game's container (style.css): the HUD's size (audit
   * UI-04) and the minimap's (held back in a narrow window to clear the score bar, UX1), its panels' opacity (G4), the
   * sound cues' size and colour, and the scoreboard's size (held back in a narrow window so the hit feed and the minimap
   * keep their room). Again on resize.
   */
  private readonly showHudLook = (): void => {
    const style = this.container.style;
    const width = this.container.clientWidth || window.innerWidth;
    const height = this.container.clientHeight || window.innerHeight;
    const hud = hudScale(this.hudSize, height);
    const minimap = minimapScale(hud, width, height);
    style.setProperty('--hud-scale', String(hud));
    style.setProperty('--minimap-scale', minimap.toFixed(3));
    style.setProperty('--hud-opacity', String(this.hudOpacity));
    style.setProperty('--cue-scale', String(this.soundCueSize));
    style.setProperty('--cue-colour', soundCueCss(this.soundCueColour));
    // The scoreboard grows with the HUD, still only as far as leaves the hit feed its room and clears the minimap.
    const minimapEdge = hudInsetX(width, height) + MINIMAP.size * minimap;
    style.setProperty('--sb-scale', scoreboardScale(this.scoreboardSize * hud, width, minimapEdge).toFixed(3));
  };

  /** A Dev setting changed, or the Dev tab was shown or hidden (M24): what applies now goes to the game and the session. */
  private applyDev(): void {
    const before = this.dev;
    this.dev = this.devInForce();
    // Only on a change, so the debug keys (` / F3, ]) keep working as toggles.
    if (this.dev.showDebug !== before.showDebug) this.debug.setVisible(this.dev.showDebug);
    if (this.dev.showBbPaths !== before.showBbPaths) this.session?.combat.setBbPaths(this.dev.showBbPaths);
    this.session?.setDevCheats(this.dev);
    // Disable levelling and Dev content (M35) change what the Loadout offers and carries, and Dev content what New game
    // plays; the next Play rebuilds the match with it.
    if (this.dev.unlockAllGear !== before.unlockAllGear || this.dev.devContent !== before.devContent) this.loadoutChanged = this.setupChanged = true;
    if (this.dev.devContent !== before.devContent) this.prefetchFieldSounds();
    // Time of day (M90) changes the light the next match is built under, and its sounds.
    if (this.dev.timeOfDay !== before.timeOfDay) {
      this.setupChanged = true;
      this.prefetchFieldSounds();
    }
  }

  /** The Retro look (Settings › Dev) on screen as saved while the Dev tab is shown, else off. */
  private showRetro(): void {
    this.renderer.setRetro(retroLookOf(this.retro, this.scripted, this.devEnabled));
  }

  /**
   * A Dev button (M90): XP, a level or a reset go into the progress (another tab's newer save read first, LV1), End the
   * round now runs the loaded match's clock out (that match then stays out of the records), Reset the save deletes it
   * (kept for Undo) and reloads. Returns what the button says for a moment.
   */
  private devAction(id: DevActionId): string {
    if (id === 'giveXp' || id === 'levelUp' || id === 'resetLevel') {
      const p = this.syncedProgress();
      const left = xpToNext(p, GAME_LEVELS);
      if (id === 'levelUp' && left === 0) return DEV_ACTION_TEXT.topLevel;
      if (id === 'resetLevel') resetProgress(p, GAME_LEVELS);
      else addXp(p, GAME_LEVELS, id === 'giveXp' ? DEV_GIFTS.xp : left);
      saveProgress(p);
      this.loadoutChanged = this.setupChanged = true;
      this.menus.refresh();
      return DEV_ACTION_TEXT.done;
    }
    if (id === 'endRound') return this.session instanceof MatchSession && this.session.endRoundNow() ? DEV_ACTION_TEXT.done : DEV_ACTION_TEXT.noRound;
    this.options.save.deleteSave();
    return DEV_ACTION_TEXT.done;
  }

  /**
   * The Dev settings that apply now (M24). Dev content (M35) waits for the dev maps' data (M50, map/maps.ts): turned on,
   * it fetches them and applies once they are in, so a dev map is never listed or played before its data is here.
   */
  private devInForce(): DevSettings {
    const dev = activeDev(this.devEnabled, this.devPicked);
    if (!dev.devContent || allMapsLoaded()) return dev;
    void loadDevMaps().then((loaded) => {
      if (this.disposed) return;
      // Not here (a failed download): say so by the play buttons, not only in the console (BP2).
      if (!loaded) return this.menus.showHint(BROWSER_NOTES.devMapsFailed);
      this.applyDev();
      this.menus.refresh();
    });
    return { ...dev, devContent: false };
  }

  /** New game's picks as they play now (M35: a dev pick plays as its list's default while Dev content is off). */
  private playedPicks(): NewGamePicks {
    return playedPicks(
      { map: this.map, mode: this.mode, difficulty: this.difficulty, teammateDifficulty: this.teammateDifficulty, team: this.team, ruleset: this.ruleset, rules: this.matchRules },
      this.dev.devContent,
    );
  }

  /** Every item in the Loadout: each gear slot's replica and what is fitted to it (null for an empty slot). */
  private equippedItems(): (ItemRef | null)[] {
    return this.loadout.equipped().flatMap((r) => (r ? [r, ...Object.values(this.loadout.fitOf(r.asset))] : []));
  }

  /** Whether a match of `picks` with the Loadout as it is uses dev content (M35): it then won't count or give XP. */
  private devContentUsed(picks: NewGamePicks): boolean {
    return matchUsesDev(picks, this.equippedItems(), GAME_POOL, this.dev.devContent, this.lighting[picks.map]);
  }

  /** The progress, with another tab's newer save taken first (it is shared, so it changes in place). */
  private syncedProgress(): Progress {
    // Another tab's level may have unlocked something: the Loadout and the next match follow it.
    if (syncProgress(this.progress, GAME_LEVELS)) this.loadoutChanged = this.setupChanged = true;
    return this.progress;
  }

  /** The level badge on the top bar (LV1); none while levelling is off. */
  private menuLevel(): MenuLevel {
    if (this.dev.unlockAllGear) return null;
    const s = standing(GAME_LEVELS, this.progress.xp);
    return { level: s.level, into: s.into, next: s.next, toNext: s.next === null ? '' : ARMORY_TEXT.toNext(s.next - s.into, s.level + 1) };
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
    this.lastTime = this.readyAt = performance.now();
    this.rafId = requestAnimationFrame(this.frame);
    // The title is up: what it opens later is fetched in the background meanwhile (IM1).
    this.menus.preloadScreens();
    this.rangeCode.preloadWhenIdle(LOADING.preloadWithinMs);
  }

  dispose(): void {
    this.disposed = true;
    cancelAnimationFrame(this.rafId);
    this.rangeCode.cancelPreload();
    this.stopWatchingAway();
    this.unwatchSave();
    // The audio engine's single blocked-context slot; the pointer's, the renderer's and the keyboard's own dispose() below clear theirs.
    this.audio.onBlocked = null;
    window.removeEventListener('resize', this.showHudLook);
    this.systemMotion?.removeEventListener('change', this.systemMotionChanged);
    window.removeEventListener('pagehide', this.flushSettings);
    this.unwatchFullscreen();
    this.unwatchLayout();
    flushSettings();
    this.container.removeEventListener('mousedown', this.clickToPlay);
    window.removeEventListener('keydown', this.escSkipKey);
    this.playPrompt.dispose();
    this.graphicsNotice.dispose();
    this.session?.dispose();
    this.session = null;
    this.audio.dispose();
    this.keyboard.dispose();
    this.pointer.dispose();
    this.debug.dispose();
    this.menus.dispose();
    // Its render target belongs to the renderer, so it goes first.
    this.pictures.dispose();
    this.renderer.dispose();
  }

  /**
   * Play on New game, Resume, Play Again. Before play has begun in a match, the match is built here from New game's
   * choices; a match left over from a lock request still pending (or refused) is reused if nothing changed since, and
   * replaced otherwise. Runs in the click: the lock is asked for first, and the session built once the browser has
   * answered (`enter`).
   */
  private play(onRefused?: () => void): void {
    if (this.askingLock) return;
    const s = this.session;
    // What Play does is decided from these flags alone (core/sessionPlan.ts, audit CORE-05).
    const action = nextSessionAction({
      graphicsLost: this.graphicsLost,
      started: this.started,
      practice: this.practice,
      loaded: s instanceof MatchSession ? 'match' : s ? 'range' : null,
      matchOver: s instanceof MatchSession && s.state.round.phase === 'matchOver',
      setupChanged: this.setupChanged,
      loadoutChanged: this.loadoutChanged,
    });
    if (action === 'none') return;
    // The range's code arrives with the start of play when the background fetch hasn't brought it yet (IM1).
    const code = action === 'buildRange' && !this.rangeCode.get() ? this.rangeCode.load().then(() => true, () => false) : null;
    if (this.options.allowUnlocked && !code) {
      this.enter(action, s);
      return;
    }
    // The lock is asked for before anything is built: the build and the first frames' compile can hold the page for
    // seconds (the node renderer in software, W6a), and a first try refused (raw input not offered) would retry only
    // once the page is free, past the click's user activation, and be refused. A lock granted meanwhile resumes nothing:
    // the session it would resume is the one being replaced; `enter` resumes once it is built.
    this.askingLock = true;
    const lock = this.options.allowUnlocked ? null : this.pointer.request();
    void Promise.all([lock, code]).then(([, fetched]) => {
      this.askingLock = false;
      if (this.disposed) return;
      if (fetched === false) {
        // Nothing to play: the mouse goes back and the menus say why, Play trying the fetch again.
        this.pointer.release();
        this.menus.showHint(MENU_TEXT.rangeFailed);
        return;
      }
      this.enter(action, s);
      if (this.options.allowUnlocked) return;
      if (this.pointer.locked) this.resume();
      else onRefused?.();
    });
  }

  /** Builds or reuses the session `action` asks for (`s`, the session when Play was pressed) and unlocks its audio. */
  private enter(action: Exclude<SessionAction, 'none'>, s: MatchSession | RangeSession | null): void {
    if (action === 'buildRange') {
      // The tutorial resumes at the step it was left at (audit POOL-14), always on the range; Practice on its place (M94).
      if (this.tutorial) this.openRange(undefined, loadTutorialStep());
      else this.openRange(undefined, undefined, this.practicePlaceToPlay());
    } else if (action === 'rebuildRange' && isRange(s)) {
      // Back from the Loadout on the range's pause menu: the range (or the map, M94) again, with the new kit, where you
      // stood (and at the same tutorial step).
      this.openRange(s.pose, s.tutorialStep, { map: s.practiceMap, course: s.course });
    } else if (action === 'buildMatch') {
      this.session?.dispose();
      this.setupChanged = false;
      // The first match plays the visit's seed (?seed=N replays it); each later one its own, or every match in a visit
      // would open with the same bot plans, round by round (bug pass). Play Again is a new match too (audit SIM-08).
      this.matchSeed = matchSeed(this.options.seed, this.matchesPlayed);
      this.matchCounted = false;
      const asPicked = this.playedPicks();
      // Adaptive difficulty (AD1, the Dev tab): the other team starts at its saved rating, as the level nearest it.
      const adaptive = adaptiveSetup(this.dev.adaptiveDifficulty, asPicked, this.dev.devContent);
      const picks = adaptedPicks(asPicked, adaptive);
      this.session = new MatchSession(this.renderer, this.container, this.input, {
        // Under the map's Day or Night pick (M34d): the one lighting path, night sight and glowing BBs follow it.
        map: this.playedMap(picks.map),
        mode: picks.mode,
        difficulty: picks.difficulty,
        teammateDifficulty: picks.teammateDifficulty,
        ruleset: picks.ruleset,
        rules: { ...picks.rules, teamSize: playedTeamSize(picks) },
        kit: this.loadout.kit(),
        // The supply event on by the device's clock as Play is pressed (M49): the run keeps it to the end.
        supply: activeSupplyEvent(GAME_POOL.supplyEvents, new Date()),
        devContent: this.dev.devContent,
        devContentUsed: this.devContentUsed(picks),
        teamColours: TEAM_COLOUR_SETS[this.teamColours],
        playerTeam: teamOfPick(picks.team ?? DEFAULT_TEAM_PICK),
        look: this.look,
        ...(adaptive ? { adaptive } : {}),
      }, this.matchSeed, this.quality, this.audio, this.crosshair);
      if (this.options.perfLog) console.info(this.session.build.line());
      this.steppedDown = false;
      this.session.setMotion(motionScale(this.motionReduced()));
      this.session.setSoundCues(this.soundCues);
      this.session.setHitFeedMode(this.hitFeedMode);
      this.session.setFeedCorner(this.feedCorner);
      this.session.setWhatGotYouMode(this.whatGotYouMode);
      this.session.setHitMarker(this.hitMarker);
      this.session.setMinimapTurn(this.minimapTurn);
      this.session.setCallouts(this.callouts === 'on');
      this.session.setPingMarkers(this.pingMarkers === 'on');
      this.session.setMagPrompts(this.magPrompts === 'on');
      this.session.setAmmoCounter(this.ammoCounter === 'on');
      // The kit the match plays (a ruleset's factory kit, say), not the Loadout's (BP3).
      this.session.combat.setReplicaPictures(this.pictures, kitSubjects(this.session.kit, this.look.realisticColours));
      this.applyDevTo(this.session);
      applyTeamCss(this.container, TEAM_COLOUR_SETS[this.teamColours]);
    }
    this.session!.combat.unlockAudio();
    if (this.options.allowUnlocked) {
      this.unlockedPlay = true;
      this.pointer.setUnlockedButtons(true);
      this.resume();
    }
  }

  /**
   * Where Practice plays (M94): its picked map under the map's Day or Night pick (as a match's, playedMap), with the
   * map's id as its timed challenge's course; undefined for the range (also for a dev map while Dev content is off).
   */
  private practicePlaceToPlay(): PracticeAt | undefined {
    const id = practiceMapId(this.practicePlace, this.dev.devContent);
    return id ? { map: this.playedMap(id), course: id } : undefined;
  }

  /**
   * Builds Practice (M21) with the picked loadout at `place` (M94; the range when left out), at `pose` if given (else at
   * the start), with the tutorial from step `tutorialFrom` if given (M16).
   */
  private openRange(pose?: RangePose, tutorialFrom?: number | string, place?: PracticeAt): void {
    const course = place?.course ?? RANGE_CHALLENGE.course;
    const code = this.rangeCode.get();
    if (!code) throw new Error('The practice range was built before its code arrived (play fetches it)');
    this.session?.dispose();
    this.loadoutChanged = false;
    this.session = new code.RangeSession(this.renderer, this.container, this.input, {
      kit: this.loadout.kit(),
      teamColours: TEAM_COLOUR_SETS[this.teamColours],
      look: this.look,
      levelling: !this.dev.unlockAllGear,
      ...(place ? { map: place.map, course: place.course } : {}),
      challenge: loadPracticeChallenge(),
      challengeBest: this.records.bestChallenge[course] ?? 0,
    }, this.options.seed, this.quality, this.audio, this.crosshair, pose, tutorialFrom);
    this.session.setMinimapTurn(this.minimapTurn);
    this.session.setAmmoCounter(this.ammoCounter === 'on');
    this.session.onTutorialStep = (step) => saveSetting('tutorialStep', step);
    // A timed challenge run that beats the best is kept at once (M93), like a match's records, and as with a match's,
    // never one played with Dev help (BP5).
    this.session.onChallengeRun = (run) => {
      if (!run.helped && addChallengeRun(this.records, course, run.hits)) saveRecords(this.records, browserStorage());
    };
    this.session.combat.setReplicaPictures(this.pictures, kitSubjects(this.loadout.kit(), this.look.realisticColours));
    this.steppedDown = false;
    this.session.setMotion(motionScale(this.motionReduced()));
    this.applyDevTo(this.session);
    applyTeamCss(this.container, TEAM_COLOUR_SETS[this.teamColours]);
  }

  private resume(): void {
    this.endEscSkip();
    const s = this.session;
    // A mouse lock granted after the graphics context was lost (the lock was still pending): nothing can be drawn.
    if (this.graphicsLost) {
      this.pointer.release();
      return;
    }
    if (!s) {
      // Nothing to play (should not happen: Play resumes once its session is built); give the mouse back.
      this.pointer.release();
      return;
    }
    if (s instanceof MatchSession && !this.matchCounted) {
      this.matchCounted = true;
      this.matchesPlayed++;
    }
    this.started = true;
    this.loadoutDue = false;
    // Time on the menus isn't a frame time.
    this.frameWatch.reset();
    // Keys pressed on the menus aren't presses in play: the Loadout key that went back to practice would open it
    // again (M95), Space on a focused Resume would jump.
    this.keyboard.endFrame();
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
    this.endEscSkip();
    this.pointer.setUnlockedButtons(false);
    this.session?.dispose();
    this.session = null;
    // Team colours changed from the pause menu waited for the match to end; the menus' swatches take them now (BP3).
    applyTeamCss(this.container, TEAM_COLOUR_SETS[this.teamColours]);
  }

  private pause(): void {
    this.keyboard.capturing = false;
    this.keyboard.releaseAll();
    this.input.clearLatches();
    const s = this.session;
    const r = s?.state.round;
    const screen = screenWhenStopped(this.started, r?.phase === 'matchOver');
    const loadout = this.loadoutDue;
    this.loadoutDue = false;
    if (this.started && isRange(s)) {
      // The tutorial just played to its end (M80): its pop-up, practice on or go to the menu, over the pause menu.
      if (s.takeTutorialComplete()) this.menus.showTutorialComplete(s.status, this.options.seed);
      // The Loadout key (M95): the Loadout over the pause menu, the slot of the replica in hand picked.
      else if (loadout) this.menus.showPracticeLoadout(s.status, this.options.seed, s.coaching, this.inHand(s), s.challengeOffer);
      else this.menus.showPause(s.status, this.options.seed, true, s.coaching, null, s.challengeOffer, this.inHand(s));
    } else if (!this.started || !(s instanceof MatchSession) || !r) {
      // Play never began (a lock that came late, after Back, and was given straight back): the menus are still up on
      // whichever screen the player went to, so they stay there.
    } else if (screen === 'result') {
      const view = s.resultView();
      // Settled the moment it was decided (frame); again here in case that frame never came (it does nothing twice).
      this.settleMatch(s);
      this.menus.showResult(view.headline, view.scoreLine, {
        result: view.result,
        blocks: view.summaryBlocks,
        records: recordsView(this.records, this.recordNews, s.setup.difficulty, s.mode, s.notCountedReason, s.setup.ruleset),
        xp: this.lastXp,
        noXp: this.noXpReason,
        haul: haulSummary(s.runFinds(), this.lastXp !== null),
        adaptive: this.adaptiveLine,
      });
    } else {
      this.menus.showPause(s.pauseLine(), this.matchSeed, false, false, s.skipOffer);
    }
    s?.setPlaying(false);
    // The screen just shown starts without a hint: say again why the match was silent.
    if (this.audioBlocked) this.menus.showHint(BROWSER_NOTES.audioBlocked);
  }

  /** The range's pause menu (the tutorial's, with its coaching), when the range is what's loaded. */
  private showRangePause(): void {
    const s = this.session;
    if (isRange(s)) this.menus.showPause(s.status, this.options.seed, true, s.coaching, null, s.challengeOffer, this.inHand(s));
  }

  /** The gear slot of the replica in your hands on the range (M95): its Loadout picks that slot. */
  private inHand(s: RangeSession): GearSlot {
    return this.loadout.gearSlotOf(s.player.armament.active);
  }

  /** The Loadout key in Practice (M95): play stops as on Esc, and the pause that follows opens the Loadout. */
  private openPracticeLoadout(): void {
    if (!this.unlockedPlay && !this.pointer.locked) return;
    this.loadoutDue = true;
    this.stopPlay();
  }

  /** The range's pause menu's Timed challenge (M93): switched, remembered for the next visit, and the menu says so. */
  private toggleChallenge(): void {
    const s = this.session;
    if (!isRange(s) || s.challengeOffer === null) return;
    const on = !s.challengeOffer;
    s.setChallenge(on);
    saveSetting('practiceChallenge', on);
    this.menus.updatePause(s.status, s.challengeOffer);
  }

  /** The pause menu's Skip step or Skip tutorial (audit POOL-14): the range carries on, the pause menu says where. */
  private skipTutorial(all: boolean): void {
    const s = this.session;
    if (!isRange(s)) return;
    if (all) s.endTutorial();
    else s.skipTutorialStep();
    this.takeTutorialFinished(s);
    if (s.takeTutorialComplete()) this.menus.showTutorialComplete(s.status, this.options.seed);
    else this.menus.showPause(s.status, this.options.seed, true, s.coaching, null, s.challengeOffer, this.inHand(s));
  }

  /** The tutorial was played (or skipped) to its end: remembered, and the next one starts from the beginning. */
  private takeTutorialFinished(s: RangeSession): void {
    if (!s.takeTutorialFinished()) return;
    saveSetting('tutorialDone', true);
    saveSetting('tutorialStep', '');
    this.menus.markTutorialDone();
  }

  /**
   * A decided match goes into the records and gives its XP as soon as it is decided (audit CORE-06; LV1), not when the
   * mouse is given back for the result screen: a tab closed in between, or a browser that never reports the lock's
   * release, lost it. Once per match (the session's take latches); the result screen only shows what this saved.
   */
  private settleMatch(s: MatchSession): void {
    // Once per session, on the first frame the match is over: nothing is built on the frames after (CLAUDE.md §9).
    if (s.state.round.phase !== 'matchOver' || this.settledSession === s) return;
    this.settledSession = s;
    // Adaptive difficulty (AD1) learns from the match, unless it was switched off since: the summary says how.
    const adaptive = s.adaptiveResult();
    this.adaptiveLine = adaptive && s.setup.adaptive && this.dev.adaptiveDifficulty ? settleAdaptive(adaptive, s.setup.adaptive.from) : null;
    // The Match screen's note reads the new rating.
    if (this.adaptiveLine) this.menus.refresh();
    const settled = settleMatch(this.records, this.syncedProgress(), GAME_LEVELS, s.takeMatchResult(), s.takeOutcome());
    if (settled.news) {
      this.recordNews = settled.news;
      saveRecords(this.records, browserStorage());
    }
    if (settled.xp) {
      // What a level gave is named as the menus offer it: an item still being built stays unnamed with Dev content off.
      const offered = contentPool(GAME_POOL, this.dev.devContent);
      const up = settled.levelUp && { ...settled.levelUp, unlocked: settled.levelUp.unlocked.filter((id) => offered.byId.has(id)) };
      this.lastXp = xpSummary(settled.xp, up, standing(GAME_LEVELS, this.progress.xp), (id) => offered.byId.get(id)!.name);
      this.noXpReason = null;
      saveProgress(this.progress);
      // What the levels unlocked is in the Loadout from the next look at it, and in the next match's kit choices.
      if (settled.levelUp && settled.levelUp.unlocked.length > 0) this.loadoutChanged = this.setupChanged = true;
      this.menus.refresh();
    } else if (!s.givesXp) {
      // No XP (Dev settings, dev content): the summary says why (audit POOL-22), not what an earlier match gave.
      this.lastXp = null;
      this.noXpReason = s.noXpReason ?? 'dev';
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
    const range = isRange(s);
    const match = s instanceof MatchSession ? s : null;
    const r = match?.state.round;
    const stats = this.renderer.stats;
    return [
      // When, in what language, and how long the page has been open (IM7).
      ['Time', read(() => `${new Date().toISOString()}, page open ${clockText(performance.now() / 1000)}`)],
      ['Language', read(() => navigator.language)],
      ['Seed', range ? this.options.seed : this.matchSeed],
      ['Map', read(() => (range ? 'range' : match ? match.setup.map.name : '-'))],
      ['Mode', read(() => (match ? `${match.mode}, ${match.setup.difficulty} (teammates ${match.setup.teammateDifficulty})` : range ? 'practice' : '-'))],
      // The ruleset, the light the map plays under and the run's state (audit CORE-02): where most new crashes come from.
      ['Rules', read(() => (match ? match.setup.ruleset : this.ruleset))],
      ['Lighting', read(() => (match ? lightingPicked(match.setup.map) : '-'))],
      ['Round', read(() => (r ? `${r.number} (${r.phase}), score ${r.score[0]}–${r.score[1]}, draws ${r.draws}` : '-'))],
      ...(match?.mode === 'extraction' && r ? [['Run', read(() => runReportLine(r.run))] as const] : []),
      ['Tick', read(() => s?.state.tick ?? '-')],
      ['Match time', read(() => (s ? clockText(s.state.time) : '-'))],
      ['Screen', read(() => ((this.pointer.locked || this.unlockedPlay || this.escSkip) && s ? 'in play' : `menus: ${this.menus.screen}`))],
      // Where the player is, looks and what they're doing (IM7): a thread can go to the spot.
      ['Player', read(() => (s ? playerLine(s.player) : '-'))],
      ['Frames', read(() => framesLine(this.frameWindow.summary(), this.simMs, this.drawMs))],
      ['Quality', read(() => this.qualityText())],
      ['Retro pixels', read(() => {
        const look = retroLookOf(this.retro, this.scripted, this.devEnabled);
        return look ? `${look.pixelSize} px, ${look.levels} levels` : 'off';
      })],
      ['Post', read(() => this.renderer.postPasses.join(' ') || 'none')],
      ['Pixel ratio', read(() => this.renderer.renderer.getPixelRatio())],
      ['Renderer', this.renderer.backend],
      ['GPU', read(() => {
        const gl = this.renderer.webglContext;
        return gl ? rendererName(gl) : this.rendering.adapterName || '-';
      })],
      ['Window', `${window.innerWidth} × ${window.innerHeight} at ${window.devicePixelRatio}`],
      ['Sim ticks/s', this.tickRate],
      ['Draw calls / triangles', read(() => `${stats.calls} / ${stats.triangles}`)],
      ['Memory', read(() => memoryLine((performance as Performance & { memory?: { usedJSHeapSize: number; jsHeapSizeLimit: number } }).memory, stats))],
      ['Load', read(() => loadLine(performance.getEntriesByType('resource') as PerformanceResourceTiming[], mainScriptUrl(), pageLoadedAt(), this.readyAt))],
      ['Dev settings', this.devEnabled ? JSON.stringify(this.dev) : 'off'],
      // Pending slider writes (FA5's saveSettingSoon) go first, so the stored settings are the ones in use.
      ['Settings', read(() => {
        flushSettings();
        return browserStorage()?.getItem(SETTINGS_KEY) ?? '-';
      })],
    ];
  }

  /**
   * A report (audit CORE-04, CORE-32, IM7): the build and browser, the game's state, `error` for a crash, and the console's
   * recent errors and the session's recent events. Never throws: whatever can't be read is left out.
   */
  private reportInfo(title: string, error?: unknown): ReportInfo {
    const guarded = <T>(f: () => T, none: T): T => {
      try {
        return f();
      } catch {
        return none;
      }
    };
    const s = this.session;
    return {
      title,
      build: __BUILD_VERSION__.label,
      userAgent: navigator.userAgent,
      fields: guarded(() => this.reportFields(), []),
      error,
      lists: [
        { label: 'Recent errors', entries: guarded(() => this.options.errors.lines(), []) },
        { label: 'Recent events', entries: guarded(() => (s ? s.eventLog.lines(s.state.tick, s.state.characters, s.player.id) : []), []) },
      ],
    };
  }

  /** The diagnostics report as text (Settings → Dev → Diagnostics; audit CORE-32): the crash report's, with no error. */
  diagnostics(): string {
    return crashReport(this.reportInfo('Airsoft diagnostics'));
  }

  /**
   * The game stopped on an error (audit CORE-04, UI-02): from the loop, or an uncaught error or rejection (main.ts). The
   * loop stops for good, the mouse and keys are given back, the sound stops, and the crash pane shows what happened with
   * a report to copy. Each step is guarded: whatever broke may break them too. A later error only adds to the report.
   */
  crash(error: unknown): void {
    // The report first, so its recent errors are the ones before this.
    const report = this.reportInfo('Airsoft crash report', error);
    console.error(error);
    if (this.crashScreen) {
      this.crashScreen.append(report);
      return;
    }
    const steps = [
      () => cancelAnimationFrame(this.rafId),
      () => (this.keyboard.capturing = false),
      () => this.keyboard.releaseAll(),
      () => this.pointer.setUnlockedButtons(false),
      () => this.endEscSkip(),
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
    const running = (this.pointer.locked || this.unlockedPlay || this.escSkip) && s !== null;
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
      // Esc skipped the round without the mouse (core/escSkip.ts): once the next round is up it waits for the click that
      // takes the mouse again, or it would start without you; a match decided plays on to its result screen.
      const held = this.escSkip && s instanceof MatchSession && !s.skipping && s.state.round.phase !== 'matchOver';
      if (!held) this.ticksThisSecond += s.advance(dt * this.dev.gameSpeed);
      this.simMs += (performance.now() - simStart - this.simMs) * FRAME_TIMING.smoothing;
      if (s instanceof MatchSession) this.settleMatch(s);
      if (isRange(s)) this.takeTutorialFinished(s);
      // A little after the match is decided, give the mouse back and show the result screen.
      if (s.takeResultDue()) {
        if (this.unlockedPlay) {
          this.unlockedPlay = false;
          this.pointer.setUnlockedButtons(false);
          this.pause();
        } else if (this.escSkip) {
          this.endEscSkip();
          this.pause();
        } else {
          this.pointer.release();
        }
      } else if (isRange(s) && this.keyboard.wasPressed('loadout')) {
        // Practice only (M95): the Loadout straight from play. In a match the key does nothing, as the loadout changes
        // only between matches (owner, 2026-10-03).
        this.openPracticeLoadout();
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
      this.frameWindow.add(frameSeconds * 1000);
      this.watchFrameTimes(s, frameSeconds);
    }
    this.debug.frame(frameSeconds);
  }
}

/** The page's own script (index.html's module), as Resource Timing names it: the main file of a load line (IM7). */
function mainScriptUrl(): string {
  return document.querySelector<HTMLScriptElement>('script[type="module"][src]')?.src ?? '';
}

/** When the page finished loading (ms after it opened), or 0 if the browser doesn't say. */
function pageLoadedAt(): number {
  const nav = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined;
  return nav?.loadEventEnd ?? 0;
}
