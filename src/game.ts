import { AudioEngine } from './audio/audioEngine';
import { loadVolumes } from './audio/audioMix';
import { PERF_SCRIPT } from './config/perfScript';
import { HUD_TEXT } from './config/hudText';
import { CRASH_TEXT } from './config/crash';
import { BROWSER_NOTES } from './config/menus';
import { MOVEMENT } from './config/movement';
import { GRAPHICS_TEXT } from './config/graphics';
import { FRAME_TIMING, type FrameRateCap, QUALITY, QUALITY_CHOICES, QUALITY_STEP_DOWN, type QualityChoice, type QualityPreset, type QualitySettings } from './config/render';
import { FramePacer } from './core/framePacer';
import { SIM } from './config/sim';
import { applyTeamCss, TEAM_COLOUR_SETS } from './config/teams';
import type { ErrorLog } from './core/errorLog';
import { FrameWindow } from './core/frameWindow';
import { KeyBindings } from './input/keyBindings';
import { Keyboard } from './input/keyboard';
import { browserKeyboardMap, watchKeyboardLayout } from './input/keyboardLayout';
import { PlayerInput } from './input/playerInput';
import { PointerLock } from './input/pointerLock';
import { initPhysics } from './physics/physicsWorld';
import { awayWatch } from './core/awayWatch';
import { loadBakedLight } from './render/light/bakedLight';
import { ModelFiles } from './render/figures/modelFiles';
import { powerSourceLoader } from './render/replicas/powerSourceModels';
import { FrameTimeWatch, presetBelow, slowFrameMs } from './render/qualityStepDown';
import { Renderer } from './render/renderer';
import type { RendererBoot } from './render/rendererStart';
import { debugLines, diagnosticsText, type GameReadout, reportInfo } from './gameReport';
import { devMapsAtStart, GameDev } from './gameDev';
import { type Loaded, PlayFlow, playMenus } from './playFlow';
import { PlayResults } from './playResults';
import { PlaySetup } from './playSetup';
import type { GameState } from './sim/state';
import { CrashScreen } from './ui/crashScreen';
import { DebugOverlay } from './ui/debugOverlay';
import { onFullscreenChange } from './ui/fullscreen';
import { GraphicsNotice } from './ui/graphicsNotice';
import { HudLook } from './ui/hudLook';
import { PlayPrompt } from './ui/playPrompt';
import { browserStorage, flushSettings } from './settings/storage';
import type { SaveManager } from './save/saveManager';
import { SAVE_TEXT } from './config/save';
import { Menus } from './ui/menus/menus';
import { followingPictureTarget, ItemPictures, nodePictureTarget } from './render/replicas/itemPictures';
import { loadControls, loadFov, loadFrameRateCap, loadRawInput, loadRendererChoice, loadShowFps } from './settings/savedChoices';
import { type HudPrefKey, type HudPrefs, loadHudPrefs } from './settings/hudPrefs';

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
 * What Play, Resume, pause and leaving do is the play flow's (playFlow.ts); what the next Play builds from, the setup's
 * (playSetup.ts); a decided match's records and XP, the results' (playResults.ts); the Dev tab, gameDev.ts's.
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
  /** Play, enter, resume, pause and leave (playFlow.ts): the session loaded is its. */
  private readonly flow: PlayFlow;
  /** What the next Play builds from: New game's picks, the Look settings, the Loadout and the level progress (playSetup.ts). */
  private readonly setup: PlaySetup;
  /** A decided match's records, XP and adaptive line, and the range's timed challenge best (playResults.ts). */
  private readonly results: PlayResults;
  /** The Dev settings in force, the Retro look and Settings › Dev's buttons (gameDev.ts). */
  private readonly dev: GameDev;
  private rafId = 0;
  private lastTime = 0;
  private ticksThisSecond = 0;
  private tickRate = 0;
  private tickRateTimer = 0;
  /**
   * The audio context, volume buses and synthesised sounds, kept across matches (each match's Sfx plays through
   * them). Made suspended at start; the sounds render in the title screen's spare time (audit M-09).
   */
  private readonly audio = new AudioEngine(loadVolumes());
  /** Every HUD and accessibility preference (settings/hudPrefs.ts): the menus change it, the sessions read it by reference. */
  private readonly prefs: HudPrefs = loadHudPrefs();
  /** The HUD's size, opacity, sound cues and motion classes on the container, from `prefs` (ui/hudLook.ts). */
  private readonly hudLook: HudLook;
  /** Stop following the page's fullscreen state and the keyboard layout. */
  private readonly unwatchFullscreen: () => void;
  private readonly unwatchLayout: () => void;
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
  /** What the debug overlay and the reports read off the game (gameReport.ts), each when asked. */
  private readonly readout: GameReadout;
  /** Set by dispose(): work still in flight (the dev maps' fetch) then does nothing. */
  private disposed = false;
  /** Up once the game has stopped on an error (crash); the loop never runs again. */
  private crashScreen: CrashScreen | null = null;

  static async create(container: HTMLElement, options: GameOptions): Promise<Game> {
    // The model files (the Blender replicas, parts and figures; BD1) load alongside the physics. With Dev content on, so
    // do the dev maps (M50), so New game can show a dev map picked last time. The maps' baked light (G6) too.
    const devMaps = devMapsAtStart();
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
    this.renderer = new Renderer(container, this.quality, rendering.node);
    this.readout = {
      session: () => this.flow.session,
      seed: () => (this.flow.session?.kind === 'range' ? options.seed : this.flow.matchSeed),
      mapPick: () => this.setup.playedPicks().map,
      ruleset: () => this.setup.picks.ruleset,
      inPlay: () => this.flow.inPlay,
      menuScreen: () => this.menus.screen,
      tickRate: () => this.tickRate,
      simMs: () => this.simMs,
      drawMs: () => this.drawMs,
      frames: () => this.frameWindow.summary(),
      quality: () => ({ choice: this.qualityChoice, automatic: this.autoQuality, settings: this.quality }),
      retro: () => this.dev.retroLook(),
      audioLatencyMs: () => this.audio.latencyMs(),
      readyAt: () => this.readyAt,
      dev: () => this.dev.shown,
      renderer: this.renderer,
      adapterName: rendering.adapterName,
      errors: options.errors,
    };
    this.renderer.setFov(loadFov());
    // The menus show the team colours of the saved set (the Match screen's Your team), as each match sets them again.
    applyTeamCss(container, TEAM_COLOUR_SETS[this.prefs.teamColours]);
    this.hudLook = new HudLook(container, this.prefs);
    this.setup = new PlaySetup(this.audio, () => this.dev.inForce);

    this.bindings = new KeyBindings(browserStorage());
    this.keyboard = new Keyboard(window, this.bindings);
    // The lock is on the game's container, not the canvas: turning antialiasing on or off replaces the canvas (REN-04).
    this.pointer = new PointerLock(container, this.keyboard);
    this.pointer.rawInput = loadRawInput();
    // Key names on screen follow the player's keyboard layout where the browser tells it (audit UI-01).
    this.unwatchLayout = watchKeyboardLayout(browserKeyboardMap(), window, (layout) => this.bindings.setLayout(layout));
    this.input = new PlayerInput(this.keyboard, this.pointer, MOVEMENT);
    if (options.scriptedPlayer) this.input.script = PERF_SCRIPT;
    Object.assign(this.input, loadControls());

    this.debug = new DebugOverlay(container, () => debugLines(this.readout));
    // The Retro look shows from here (renderer.setRetro); the Dev tab's reactions reach the parts built below as they run.
    this.dev = new GameDev(
      {
        renderer: this.renderer,
        debug: this.debug,
        setup: this.setup,
        readout: this.readout,
        save: options.save,
        session: () => this.flow.session,
        menus: () => this.menus,
        disposed: () => this.disposed,
      },
      options.scriptedPlayer === true,
    );

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
      bindings: this.bindings,
      // The play flow is built below, with the menus it shows.
      ...playMenus(() => this.flow),
      ...this.setup.menuOptions(),
      // Settings › Controls change the input and the pointer lock that hold them.
      controls: { input: this.input, pointer: this.pointer },
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
        renderer: (row) => this.rendering.fillRow(row, this.renderer),
      },
      audio: { initial: this.audio.volumes, onChange: (channel, v) => this.audio.setVolume(channel, v), onRelease: (channel) => this.audio.preview(channel) },
      prefs: { values: this.prefs, onChange: (key) => this.prefChanged(key), followMotion: this.hudLook.follow },
      dev: this.dev.menuOptions(),
      save: options.save,
    });
    this.results = new PlayResults(this.setup, () => this.dev.inForce, this.menus);
    this.menus.showTitle();
    this.debug.setVisible(this.dev.inForce.showDebug);
    this.debug.setFpsReadout(loadShowFps());
    this.showTitleWarning();
    this.unwatchSave = options.save.onChange(() => this.showTitleWarning());
    this.flow = new PlayFlow({
      container,
      renderer: this.renderer,
      input: this.input,
      keyboard: this.keyboard,
      pointer: this.pointer,
      menus: this.menus,
      audio: this.audio,
      prefs: this.prefs,
      setup: this.setup,
      results: this.results,
      graphicsNotice: new GraphicsNotice(container, BROWSER_NOTES.graphicsLost),
      playPrompt: new PlayPrompt(container, HUD_TEXT.playPrompt),
      seed: options.seed,
      allowUnlocked: options.allowUnlocked,
      perfLog: options.perfLog === true,
      dev: () => this.dev.inForce,
      quality: () => this.quality,
      crashed: () => this.crashScreen !== null,
      built: () => (this.steppedDown = false),
      resumed: () => this.frameWatch.reset(),
    });
    container.addEventListener('mousedown', this.flow.clickToPlay);
    window.addEventListener('keydown', this.flow.escSkipKey);
    this.renderer.onContextChange((lost) => this.flow.contextChanged(lost));
    this.stopWatchingAway = awayWatch({ doc: document, win: window }, this.goneAway);
    this.audio.onBlocked = () => this.flow.audioRefused();
    this.pointer.onChange((locked, released) => this.flow.lockChanged(locked, released));
    this.unwatchFullscreen = onFullscreenChange(() => this.flow.fullscreen.takeAgain());
    // Slider changes wait a moment before they are written (settings/storage.ts saveSettingSoon): write them as the page goes.
    window.addEventListener('pagehide', this.flushSettings);
    this.pointer.onError(() => this.flow.lockRefused());
    this.audio.warmUp();
    this.setup.prefetchFieldSounds();
    this.renderer.warmUp();
  }

  /** The tab hidden or the window's focus lost (M18b, audit CORE-20) stops play, as Esc would; this stops watching. */
  private readonly stopWatchingAway: () => void;
  private readonly unwatchSave: () => void;

  /** The player went away (tab hidden, focus lost): the match pauses and pending settings are written (FA5, UI-11). */
  private readonly goneAway = (): void => {
    this.flow.stopPlay();
    flushSettings();
  };

  private readonly flushSettings = (): void => flushSettings();

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
    this.flow.yieldToOtherTab();
  }

  /**
   * A HUD or accessibility preference changed (the session reads it as play runs again): the HUD's look, or the team
   * colours, built into the figures, so from the next match (the range's Resume); the menus' swatches follow at once.
   */
  private prefChanged(key: HudPrefKey): void {
    if (key !== 'teamColours') return this.hudLook.show();
    this.setup.kitChanged();
    if (!this.flow.session) applyTeamCss(this.container, TEAM_COLOUR_SETS[this.prefs.teamColours]);
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
    this.renderer.setQuality(settings);
    this.flow.session?.setQuality(settings);
  }

  /**
   * `?perf` (PF1): names a frame of play that built pipelines, which the warm-up should have built before the round
   * (a quality change mid-round builds its own, as it says).
   */
  private logBuilds(s: Loaded, built: number, drawMs: number): void {
    if (built > 0 && s.state.tick > 0) console.info(`perf: ${built} pipeline${built === 1 ? '' : 's'} built mid-play at tick ${s.state.tick} (draw ${drawMs.toFixed(1)} ms)`);
  }

  /**
   * The automatic step-down (REN-03), after each frame drawn in play: frame times go to the watch while the game's own
   * pick is in force; a step decided mid-round waits for the round to end (a new preset compiles new pipelines, a
   * hitch nobody wants mid-fight), then applies, unsaved, with a line on the HUD.
   */
  private watchFrameTimes(s: Loaded, frameSeconds: number): void {
    if (!this.autoQuality || this.steppedDown) return;
    // A skipped round (M83) spends each frame simulating on purpose, and the warm-up's (PF1) compiling: their frames say
    // nothing about the graphics.
    if (s.kind === 'match' && (s.skipping || s.warmingUp)) return this.frameWatch.reset();
    if (this.stepDownTo === null) {
      const below = presetBelow(this.qualityChoice);
      if (below && this.frameWatch.add(frameSeconds * 1000, slowFrameMs(this.frameRateCap))) this.stepDownTo = below;
    }
    if (this.stepDownTo === null || (s.kind === 'match' && s.state.round.phase === 'live')) return;
    const preset = this.stepDownTo;
    this.stepDownTo = null;
    this.steppedDown = true;
    this.changeQuality(preset, QUALITY[preset], true);
    this.menus.showQuality(preset, QUALITY[preset]);
    const label = QUALITY_CHOICES.find((c) => c.id === preset)!.label;
    s.combat.showNotice(GRAPHICS_TEXT.steppedDown(label), QUALITY_STEP_DOWN.noticeSeconds);
  }

  /** The session loaded (the play flow's): a match or the range, null with none. For the console in dev builds. */
  get session(): Loaded | null {
    return this.flow.session;
  }

  /** The simulation state of the match in play (null with no match loaded). For the console in dev builds. */
  get state(): GameState | null {
    return this.flow.session?.state ?? null;
  }

  start(): void {
    this.lastTime = this.readyAt = performance.now();
    this.rafId = requestAnimationFrame(this.frame);
    // The title is up: what it opens later is fetched in the background meanwhile (IM1).
    this.menus.preloadScreens();
    this.flow.preloadRange();
  }

  dispose(): void {
    this.disposed = true;
    cancelAnimationFrame(this.rafId);
    this.stopWatchingAway();
    this.unwatchSave();
    // The audio engine's single blocked-context slot; the pointer's, the renderer's and the keyboard's own dispose() below clear theirs.
    this.audio.onBlocked = null;
    this.hudLook.dispose();
    window.removeEventListener('pagehide', this.flushSettings);
    this.unwatchFullscreen();
    this.unwatchLayout();
    flushSettings();
    this.container.removeEventListener('mousedown', this.flow.clickToPlay);
    window.removeEventListener('keydown', this.flow.escSkipKey);
    // The play prompt and the graphics notice go with it, then the session.
    this.flow.dispose();
    this.audio.dispose();
    this.keyboard.dispose();
    this.pointer.dispose();
    this.debug.dispose();
    this.menus.dispose();
    // Its render target belongs to the renderer, so it goes first.
    this.pictures.dispose();
    this.renderer.dispose();
  }

  /** The diagnostics report as text (Settings → Dev → Diagnostics; audit CORE-32): the crash report's, with no error. */
  diagnostics(): string {
    return diagnosticsText(this.readout);
  }

  /**
   * The game stopped on an error (audit CORE-04, UI-02): from the loop, or an uncaught error or rejection (main.ts). The
   * loop stops for good, the mouse and keys are given back, the sound stops, and the crash pane shows what happened with
   * a report to copy. Each step is guarded: whatever broke may break them too. A later error only adds to the report.
   */
  crash(error: unknown): void {
    // The report first, so its recent errors are the ones before this.
    const report = reportInfo(this.readout, 'Airsoft crash report', error);
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
      () => this.flow.endEscSkip(),
      () => this.pointer.release(),
      () => this.flow.session?.setPlaying(false),
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
    this.flow.unlockedPlay = false;
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

    const flow = this.flow;
    const s = flow.session;
    // Held for fullscreen and the lock never came back: the pause menu, as for any other drop.
    if (flow.fullscreen.holdRanOut(performance.now())) flow.pause();
    const running = flow.inPlay && s !== null;
    if (running) {
      // Only while playing: on the pause screen F3 belongs to the browser (find bar).
      if (this.keyboard.wasPressed('debugOverlay')) this.debug.toggle();
      if (this.keyboard.wasPressed('debugBbPaths')) s.combat.toggleBbPaths();
      // Still within the key press's user activation, which the browser needs for fullscreen (and to take the mouse again).
      if (this.keyboard.wasPressed('fullscreen')) flow.fullscreen.key(now);
      // The Dev settings' Game speed (M24) runs the simulation slower or faster than the clock.
      const simStart = performance.now();
      // Esc skipped the round without the mouse (core/escSkip.ts): once the next round is up it waits for the click that
      // takes the mouse again, or it would start without you; a match decided plays on to its result screen.
      const held = flow.escSkip && s.kind === 'match' && !s.skipping && s.state.round.phase !== 'matchOver';
      if (!held) this.ticksThisSecond += s.advance(dt * this.dev.inForce.gameSpeed);
      this.simMs += (performance.now() - simStart - this.simMs) * FRAME_TIMING.smoothing;
      if (s.kind === 'match') this.results.settle(s);
      if (s.kind === 'range') flow.takeTutorialFinished(s);
      // A little after the match is decided (or the tutorial's end on the range), play stops for the result screen.
      if (s.takeResultDue()) {
        flow.stopPlay();
      } else if (s.kind === 'range' && this.keyboard.wasPressed('loadout')) {
        // Practice only (M95): the Loadout straight from play. In a match the key does nothing, as the loadout changes
        // only between matches (owner, 2026-10-03).
        flow.openPracticeLoadout();
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
      const built = this.options.perfLog ? this.renderer.pipelinesBuilt : 0;
      s.draw(frameSeconds, this.keyboard.isDown('scoreboard'));
      const drawn = performance.now() - drawStart;
      this.drawMs += (drawn - this.drawMs) * FRAME_TIMING.smoothing;
      if (this.options.perfLog) this.logBuilds(s, this.renderer.pipelinesBuilt - built, drawn);
      // The warm-up's frames (PF1) are not play: `?perf`'s worst frame is play's.
      if (!(s.kind === 'match' && s.warmingUp)) this.frameWindow.add(frameSeconds * 1000);
      this.watchFrameTimes(s, frameSeconds);
    }
    this.debug.frame(frameSeconds);
  }
}
