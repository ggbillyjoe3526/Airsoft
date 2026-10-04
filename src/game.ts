import { AudioEngine } from './audio/audioEngine';
import { loadVolumes } from './audio/audioMix';
import { motionScale } from './config/accessibility';
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
import { deriveSeed } from './core/seed';
import { loadFigureModel } from './render/externalModels';
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
import { browserStorage, saveSetting } from './settings/storage';
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
  loadTutorialDone,
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
   * The render quality preset to start with (config/render.ts startingQuality): `?quality=` for a visit, the saved one,
   * or else the default (Low in a browser drawing in software). Settings → Graphics changes it later (all but
   * antialiasing, which keeps the starting preset's until the next load).
   */
  quality: QualityPreset;
  /** `quality` was picked for this visit because the browser draws in software (not saved; config/render.ts startingQuality). */
  automaticQuality: boolean;
  /** The browser draws without hardware acceleration (render/gpuCheck.ts): the title screen warns. */
  softwareRendering: boolean;
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
  /** Each replica's grip and magazine as picked (M17b), by replica id. */
  private readonly parts = new Map<string, ReplicaParts>();
  /** Reduced motion (Settings → Accessibility), kept across matches. */
  private reducedMotion = loadReducedMotion();
  /** The team colours and the on-screen sound cues (Settings → Accessibility, M18b). Colours apply from the next match. */
  private teamColours: TeamColourSetId = loadTeamColours();
  private soundCues = loadSoundCues();
  /** The render quality preset in use (Settings → Graphics, M14). */
  private quality: QualityPreset;

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
    this.quality = options.quality;
    this.matchSeed = options.seed;
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
        seed: s instanceof RangeSession ? options.seed : this.matchSeed,
        map: s instanceof RangeSession ? 'range' : this.map,
        tick: s?.state.tick ?? '-',
        'sim ticks/s': this.tickRate,
        characters: s?.characterCount ?? 0,
        pos: p ? `${p.position.x.toFixed(2)}, ${p.position.y.toFixed(2)}, ${p.position.z.toFixed(2)}` : '-',
        speed: p ? Math.hypot(p.velocity.x, p.velocity.z).toFixed(2) : '-',
        grounded: String(p?.grounded ?? '-'),
        'BBs in flight': s?.combat.bbsInFlight ?? 0,
        quality: this.quality,
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
        picked: { initial: this.picked, onChange: (slot, r) => ((this.picked[slot] = r), (this.loadoutChanged = this.setupChanged = true)) },
        optic: { initial: this.optic, onChange: (o) => ((this.optic = o), (this.loadoutChanged = this.setupChanged = true)) },
        hopUp: { initial: (r) => this.hopUpOf(r), onChange: (r, dial) => (this.hopUps.set(r.id, dial), (this.loadoutChanged = this.setupChanged = true)) },
        bbWeight: { initial: (r) => this.bbWeightOf(r), onChange: (r, grams) => (this.bbWeights.set(r.id, grams), (this.loadoutChanged = this.setupChanged = true)) },
        parts: { initial: (r) => this.partsOf(r), onChange: (r, parts) => (this.parts.set(r.id, parts), (this.loadoutChanged = this.setupChanged = true)) },
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
        crouch: { initial: this.input.crouchMode, onChange: (m) => (this.input.crouchMode = m) },
        aim: { initial: this.input.aimMode, onChange: (m) => (this.input.aimMode = m) },
        sprint: { initial: this.input.sprintMode, onChange: (m) => (this.input.sprintMode = m) },
      },
      fov: { initial: this.renderer.fov, onChange: (v) => this.renderer.setFov(v) },
      quality: { initial: this.quality, onChange: (q) => this.changeQuality(q) },
      audio: { initial: this.audio.volumes, onChange: (channel, v) => this.changeVolume(channel, v), onRelease: (channel) => this.audio.preview(channel) },
      crosshair: { initial: this.crosshair, onChange: (c) => this.changeCrosshair(c) },
      accessibility: {
        reducedMotion: { initial: this.reducedMotion, onChange: (on) => this.changeReducedMotion(on) },
        // The figures are built with their colours, so a new set shows from the next match.
        // On the range they show from Resume (it's rebuilt where you stood, as after a loadout change).
        teamColours: { initial: this.teamColours, onChange: (set) => ((this.teamColours = set), (this.setupChanged = this.loadoutChanged = true)) },
        soundCues: { initial: this.soundCues, onChange: (on) => this.changeSoundCues(on) },
      },
    });
    this.menus.showTitle();
    this.showMotion();
    if (options.softwareRendering) {
      const note = BROWSER_NOTES.noHardwareAcceleration;
      this.menus.showTitleWarning(options.automaticQuality ? `${note} ${BROWSER_NOTES.qualitySetLow}` : note);
    }
    this.graphicsNotice = new GraphicsNotice(container, BROWSER_NOTES.graphicsLost);
    this.renderer.onContextChange((lost) => this.graphicsContextChanged(lost));
    document.addEventListener('visibilitychange', this.visibilityChanged);
    this.pointer.onChange((locked) => {
      if (locked) this.resume();
      else this.pause();
    });
    this.pointer.onError(() => this.menus.showHint(LOCK_REFUSED_HINT));
    this.audio.warmUp();
  }

  /** The tab was hidden (another tab, the window minimised): the match pauses, as Esc would (M18b). */
  private readonly visibilityChanged = (): void => {
    if (document.hidden) this.stopPlay();
  };

  /**
   * The graphics context was lost (true) or is back (false) (M18b, audit W-01). While it's gone the match pauses
   * and a notice covers everything; once it's back the pause menu says so and Resume carries on (Three.js uploads
   * everything again on the next frame, except render targets, which the session renders again: contextRestored).
   */
  private graphicsContextChanged(lost: boolean): void {
    this.graphicsLost = lost;
    this.graphicsNotice.setVisible(lost);
    // The menus can't be used under the notice (not even Resume by Enter or Space on the focused button).
    this.menus.setBlocked(lost);
    if (lost) {
      this.stopPlay();
    } else {
      this.session?.contextRestored();
      // Only the pause menu has a Resume to point at (not the result screen).
      if (this.started && this.menus.screen === 'pause') this.menus.showHint(BROWSER_NOTES.graphicsBack);
    }
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

  /** A volume slider moved on Settings → Audio: the shared bus eases to it (the match loaded and every later one). */
  private changeVolume(channel: VolumeChannel, position: number): void {
    this.audio.setVolume(channel, position);
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

  /** A quality preset picked on Settings → Graphics: applied at once to the renderer and the match loaded. */
  private changeQuality(preset: QualityPreset): void {
    this.quality = preset;
    this.renderer.setQuality(QUALITY[preset]);
    this.session?.setQuality(QUALITY[preset]);
  }

  /** On-screen sound cues turned on or off: kept for the next match and applied to the one loaded. */
  private changeSoundCues(on: boolean): void {
    this.soundCues = on;
    // The range has nobody else to hear, so only a match takes them.
    if (this.session instanceof MatchSession) this.session.setSoundCues(on);
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
      this.openRange(undefined, this.tutorial ? 0 : undefined);
    } else if (this.started && s instanceof RangeSession && this.loadoutChanged) {
      // Back from the Loadout on the range's pause menu: the range again, with the new kit, where you stood (and at the
      // same tutorial step).
      this.openRange(s.pose, s.tutorialStep);
    } else if (
      (!this.started && (this.setupChanged || !(s instanceof MatchSession))) ||
      // Play Again after something that shows only in a new build changed mid-match (the team colours).
      (this.started && s instanceof MatchSession && s.state.round.phase === 'matchOver' && this.setupChanged)
    ) {
      this.session?.dispose();
      this.setupChanged = false;
      // The first match plays the visit's seed (?seed=N replays it); each later one its own, or every match in a visit
      // would open with the same bot plans, round by round (bug pass).
      this.matchSeed = deriveSeed(this.options.seed, 1, this.matchesPlayed);
      this.matchCounted = false;
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
      }, this.matchSeed, QUALITY[this.quality], this.audio, this.crosshair);
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

  /**
   * Builds the practice range (M21) with the picked loadout, at `pose` if given (else behind the firing line), with the
   * tutorial from step `tutorialFrom` if given (M16).
   */
  private openRange(pose?: RangePose, tutorialFrom?: number): void {
    this.session?.dispose();
    this.loadoutChanged = false;
    this.session = new RangeSession(this.renderer, this.container, this.input, {
      loadout: [...this.picked],
      optic: this.optic,
      hopUps: this.picked.map((r) => this.hopUpOf(r)),
      bbWeights: this.picked.map((r) => this.bbWeightOf(r)),
      parts: this.picked.map((r) => this.partsOf(r)),
      teamColours: TEAM_COLOUR_SETS[this.teamColours],
    }, this.options.seed, QUALITY[this.quality], this.audio, this.crosshair, pose, tutorialFrom);
    this.session.setMotion(motionScale(this.reducedMotion));
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
    // "Play Again" on the result screen: the new match starts only once play really resumes.
    if (s instanceof MatchSession && s.state.round.phase === 'matchOver') s.restart();
    if (s instanceof MatchSession && !this.matchCounted) {
      this.matchCounted = true;
      this.matchesPlayed++;
    }
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
      this.menus.showPause(s.status, true);
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
      if (s instanceof RangeSession && s.takeTutorialFinished()) {
        saveSetting('tutorialDone', true);
        this.menus.markTutorialDone();
      }
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
