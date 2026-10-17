import { adaptedPicks, adaptiveSetup } from './adaptivePicks';
import type { AudioEngine } from './audio/audioEngine';
import { FULLSCREEN_RELOCK_MS, PAUSE_ESC_GUARD_MS } from './config/controls';
import type { DevSettings } from './config/dev';
import { LOADING } from './config/loading';
import { BROWSER_NOTES, MENU_TEXT } from './config/menus';
import { RANGE_CHALLENGE } from './config/range';
import type { QualitySettings } from './config/render';
import { DEFAULT_TEAM_PICK, TEAM_COLOUR_SETS, applyTeamCss, teamOfPick } from './config/teams';
import { escOpensMenu, escSkips } from './core/escSkip';
import { OnDemand } from './core/onDemand';
import { nextSessionAction, type SessionAction } from './core/sessionPlan';
import type { Keyboard } from './input/keyboard';
import type { PlayerInput } from './input/playerInput';
import type { PointerLock } from './input/pointerLock';
import { matchSeed } from './matchFlow';
import { MatchSession } from './matchSession';
import { playedTeamSize } from './newGamePicks';
import type { PlayResults } from './playResults';
import type { PlaySetup, PracticeAt } from './playSetup';
import type { GearSlot } from './pool/loadoutModel';
import type { RangePose, RangeSession } from './rangeSession';
import type { Renderer } from './render/renderer';
import type { Session } from './session';
import type { HudPrefs } from './settings/hudPrefs';
import { loadPracticeChallenge, loadTutorialDone, loadTutorialStep } from './settings/savedChoices';
import { saveSetting } from './settings/storage';
import { FullscreenPlay } from './ui/fullscreenPlay';
import type { GraphicsNotice } from './ui/graphicsNotice';
import { screenWhenStopped } from './ui/menus/menuNav';
import type { Menus } from './ui/menus/menus';
import type { MenusOptions } from './ui/menus/menusOptions';
import type { PlayPrompt } from './ui/playPrompt';

/** The session loaded: both are a Session (session.ts); `kind` tells them apart where only one has the answer. */
export type Loaded = MatchSession | RangeSession;

/** What the play flow works with: the app's parts (Game builds them and wires the flow to the page's events). */
export interface PlayParts {
  readonly container: HTMLElement;
  readonly renderer: Renderer;
  readonly input: PlayerInput;
  readonly keyboard: Keyboard;
  readonly pointer: PointerLock;
  readonly menus: Menus;
  readonly audio: AudioEngine;
  readonly prefs: HudPrefs;
  readonly setup: PlaySetup;
  readonly results: PlayResults;
  /** Esc skipped the round (core/escSkip.ts): click to play on, Esc for the menu. Disposed with the flow. */
  readonly playPrompt: PlayPrompt;
  /** Over everything while the graphics context is lost (M18b). Disposed with the flow. */
  readonly graphicsNotice: GraphicsNotice;
  /** The visit's seed (core/seed.ts), play without the mouse lock (`?nolock`) and `?perf`'s build log (GameOptions). */
  readonly seed: number;
  readonly allowUnlocked: boolean;
  readonly perfLog: boolean;
  /** The Dev settings in force (M24) and the render quality in use. */
  dev(): DevSettings;
  quality(): QualitySettings;
  /** The game stopped on an error (Game.crash): nothing resumes, and the mouse is not taken again. */
  crashed(): boolean;
  /** A session was just built: the automatic quality step-down may run once in it (REN-03). */
  built(): void;
  /** Play resumed: time on the menus isn't a frame time. */
  resumed(): void;
}

/** The menus' buttons that start, stop and steer play. */
export type PlayMenus = Pick<
  MenusOptions,
  'onPlay' | 'onFullscreenPlay' | 'onLeaveMatch' | 'onRange' | 'onTutorial' | 'tutorialDone' | 'onReplayTutorial' | 'onSkipRound' | 'onToggleChallenge' | 'onSkipTutorialStep' | 'onSkipTutorial'
>;

/** The menus' play buttons wired to the play flow, built after the menus (it shows them): `flow` reads it per press. */
export function playMenus(flow: () => PlayFlow): PlayMenus {
  return {
    onPlay: () => flow().newGamePlay(),
    onFullscreenPlay: () => flow().fullscreen.click(() => flow().play()),
    onLeaveMatch: () => flow().leaveMatch(),
    onRange: () => flow().practiceRange(),
    onTutorial: () => flow().startTutorial(),
    tutorialDone: loadTutorialDone(),
    onReplayTutorial: () => flow().replayTutorial(),
    onSkipRound: () => flow().skipRound(),
    onToggleChallenge: () => flow().toggleChallenge(),
    onSkipTutorialStep: () => flow().skipTutorial(false),
    onSkipTutorial: () => flow().skipTutorial(true),
  };
}

/**
 * The play flow (out of game.ts, DX8, audit A1): Play builds or reuses a session (core/sessionPlan.ts) and takes the
 * mouse; the lock taken resumes play, dropped it pauses (or, once you are out, skips the round: core/escSkip.ts); the
 * player leaves the match back to the menus. Also the range's pause menu's buttons and the graphics context's loss.
 */
export class PlayFlow {
  /** The match in play (or paused, or just decided), or the practice range (M21); null on the menus with nothing loaded. */
  session: Loaded | null = null;
  /** The practice range's code (the tutorial's with it), fetched in the background once the title is up (IM1). */
  private readonly rangeCode = new OnDemand<typeof import('./rangeSession')>(() => import('./rangeSession'));
  /** The next Play opens the practice range rather than a match (the title's Practice range button). */
  private practice = false;
  /** ... with the tutorial's coach (the title's Tutorial button, M16). */
  private tutorial = false;
  /** The Loadout key was pressed in Practice (M95): the pause that follows opens the Loadout over its pause menu. */
  private loadoutDue = false;
  /**
   * Matches played so far this visit: each gets its own seed (matchSeed), so the bots' plans differ match to match. A
   * match built but never played (a refused mouse lock, then a new setup) doesn't count, so `?seed=N` replays the first
   * match played.
   */
  private matchesPlayed = 0;
  /** The match loaded has started play (and counted in matchesPlayed). */
  private matchCounted = false;
  /** The seed of the match loaded (the URL's or the visit's for the first match; see play). */
  matchSeed: number;
  /** True once play has begun in the current session (until the player leaves the match). */
  private started = false;
  /** Play runs without the mouse lock (`?nolock`, the automated browsers). */
  unlockedPlay = false;
  /** True while the graphics context is lost: nothing can be drawn, so play can't start or resume. */
  private graphicsLost = false;
  /** Another tab has the save (yieldToOtherTab): the menus stay blocked for the rest of the visit. */
  private yielded = false;
  /** Play asked for the lock and waits for the browser's answer before building (play). */
  private askingLock = false;
  /** The browser wouldn't let the sound start since play last resumed (audit CORE-21): the menus say so. */
  private audioBlocked = false;
  /**
   * Esc skipped the round (core/escSkip.ts, the owner's 0.1 Dev 5 playtest, note 10): the browser took the mouse back and
   * the skip plays on without it, until a click takes it again (resume) or Esc again opens the menu. `escSkipAt`: when
   * it began (performance.now()).
   */
  escSkip = false;
  escSkipAt = 0;
  /** The Fullscreen key in play and the mouse lock across the change (audit UI-19, IN1). */
  readonly fullscreen: FullscreenPlay;
  /** Set by dispose(): a lock answered after it builds nothing. */
  private disposed = false;

  constructor(private readonly parts: PlayParts) {
    this.matchSeed = parts.seed;
    // A crash gives the mouse back for good (FA1).
    this.fullscreen = new FullscreenPlay(parts.pointer, () => this.started && this.session !== null && !parts.crashed(), () => this.unlockedPlay);
  }

  /** Play is running: the mouse is locked, play runs without it (`?nolock`), or a round skips without it. */
  get inPlay(): boolean {
    return this.parts.pointer.locked || this.unlockedPlay || this.escSkip;
  }

  /** The title is up: the range's code is fetched in the background meanwhile (IM1). */
  preloadRange(): void {
    this.rangeCode.preloadWhenIdle(LOADING.preloadWithinMs);
  }

  /** The prompt and the notice it was given go with it, then the session. */
  dispose(): void {
    this.disposed = true;
    this.rangeCode.cancelPreload();
    this.parts.playPrompt.dispose();
    this.parts.graphicsNotice.dispose();
    this.session?.dispose();
    this.session = null;
  }

  /** New game's Play, and the pause menu's Resume and the result's Play Again (the same button in the menus). */
  newGamePlay(): void {
    // Before play begins this is New game's Play: a match, even after a Practice range whose mouse lock was refused.
    if (!this.started) this.practice = this.tutorial = false;
    this.play();
  }

  /** The title's Practice range. */
  practiceRange(): void {
    this.practice = true;
    this.tutorial = false;
    this.play();
  }

  /** The title's Tutorial (M16). */
  startTutorial(): void {
    this.practice = true;
    this.tutorial = true;
    this.play();
  }

  /** Replay tutorial (M97): from its first step, finished or not; from the pause menu it leaves what was under way. */
  replayTutorial(): void {
    const fromPause = this.started;
    if (fromPause) this.leaveMatch();
    saveSetting('tutorialStep', '');
    this.practice = true;
    this.tutorial = true;
    // From the pause menu with the mouse lock refused, the tutorial's own pause menu replaces the one it left (BP3:
    // the match's stayed up, Skip to next round and all).
    this.play(fromPause ? () => this.showRangePause() : undefined);
  }

  /**
   * Skip to next round (M83): the skip runs from the next frame of play, so Resume takes the mouse as usual. A skip
   * already begun whose play the browser refused (the mouse lock, just after Esc) is taken up by the next click (BP3).
   */
  skipRound(): void {
    if (this.session?.kind === 'match' && (this.session.skipping || this.session.beginSkip())) this.play();
  }

  /**
   * Play on New game, Resume, Play Again. Before play has begun in a match, the match is built here from New game's
   * choices; a match left over from a lock request still pending (or refused) is reused if nothing changed since, and
   * replaced otherwise. Runs in the click: the lock is asked for first, and the session built once the browser has
   * answered (`enter`).
   */
  play(onRefused?: () => void): void {
    if (this.askingLock) return;
    const s = this.session;
    // What Play does is decided from these flags alone (core/sessionPlan.ts, audit CORE-05).
    const action = nextSessionAction({
      graphicsLost: this.graphicsLost,
      started: this.started,
      practice: this.practice,
      loaded: s?.kind ?? null,
      matchOver: s?.kind === 'match' && s.state.round.phase === 'matchOver',
      setupChanged: this.parts.setup.setupChanged,
      loadoutChanged: this.parts.setup.loadoutChanged,
    });
    if (action === 'none') return;
    // The range's code arrives with the start of play when the background fetch hasn't brought it yet (IM1).
    const code = action === 'buildRange' && !this.rangeCode.get() ? this.rangeCode.load().then(() => true, () => false) : null;
    if (this.parts.allowUnlocked && !code) {
      this.enter(action, s);
      return;
    }
    // The lock is asked for before anything is built: the build and the first frames' compile can hold the page for
    // seconds (the node renderer in software, W6a), and a first try refused (raw input not offered) would retry only
    // once the page is free, past the click's user activation, and be refused. A lock granted meanwhile resumes nothing:
    // the session it would resume is the one being replaced; `enter` resumes once it is built.
    this.askingLock = true;
    const lock = this.parts.allowUnlocked ? null : this.parts.pointer.request();
    void Promise.all([lock, code]).then(([, fetched]) => {
      this.askingLock = false;
      if (this.disposed) return;
      if (fetched === false) {
        // Nothing to play: the mouse goes back and the menus say why, Play trying the fetch again.
        this.parts.pointer.release();
        this.parts.menus.showHint(MENU_TEXT.rangeFailed);
        return;
      }
      this.enter(action, s);
      if (this.parts.allowUnlocked) return;
      if (this.parts.pointer.locked) this.resume();
      else onRefused?.();
    });
  }

  /** Builds or reuses the session `action` asks for (`s`, the session when Play was pressed) and unlocks its audio. */
  private enter(action: Exclude<SessionAction, 'none'>, s: Loaded | null): void {
    const { setup } = this.parts;
    if (action === 'buildRange') {
      // The tutorial resumes at the step it was left at (audit POOL-14), always on the range; Practice on its place (M94).
      if (this.tutorial) this.openRange(undefined, loadTutorialStep());
      else this.openRange(undefined, undefined, setup.practiceAt());
    } else if (action === 'rebuildRange' && s?.kind === 'range') {
      // Back from the Loadout on the range's pause menu: the range (or the map, M94) again, with the new kit, where you
      // stood (and at the same tutorial step).
      this.openRange(s.pose, s.tutorialStep, { map: s.practiceMap, course: s.course });
    } else if (action === 'buildMatch') {
      this.session?.dispose();
      setup.setupChanged = false;
      // The first match plays the visit's seed (?seed=N replays it); each later one its own, or every match in a visit
      // would open with the same bot plans, round by round (bug pass). Play Again is a new match too (audit SIM-08).
      this.matchSeed = matchSeed(this.parts.seed, this.matchesPlayed);
      this.matchCounted = false;
      const dev = this.parts.dev();
      const asPicked = setup.playedPicks();
      // Adaptive difficulty (AD1, the Dev tab): the other team starts at its saved rating, as the level nearest it.
      const adaptive = adaptiveSetup(dev.adaptiveDifficulty, asPicked, dev.devContent);
      const picks = adaptedPicks(asPicked, adaptive);
      this.session = new MatchSession(this.parts.renderer, this.parts.container, this.parts.input, {
        // Under the map's Day or Night pick (M34d): the one lighting path, night sight and glowing BBs follow it.
        map: setup.playedMap(picks.map),
        mode: picks.mode,
        difficulty: picks.difficulty,
        teammateDifficulty: picks.teammateDifficulty,
        ruleset: picks.ruleset,
        rules: { ...picks.rules, teamSize: playedTeamSize(picks) },
        kit: setup.loadout.kit(),
        devContent: dev.devContent,
        devContentUsed: setup.devContentUsed(picks),
        teamColours: TEAM_COLOUR_SETS[this.parts.prefs.teamColours],
        playerTeam: teamOfPick(picks.team ?? DEFAULT_TEAM_PICK),
        look: setup.look,
        ...(adaptive ? { adaptive } : {}),
      }, this.matchSeed, this.parts.quality(), this.parts.audio, this.parts.prefs);
      if (this.parts.perfLog) console.info(this.session.build.line());
      this.setUp(this.session);
    }
    this.session!.combat.unlockAudio();
    if (this.parts.allowUnlocked) {
      this.unlockedPlay = true;
      this.parts.pointer.setUnlockedButtons(true);
      this.resume();
    }
  }

  /**
   * Builds Practice (M21) with the picked loadout at `place` (M94; the range when left out), at `pose` if given (else at
   * the start), with the tutorial from step `tutorialFrom` if given (M16).
   */
  private openRange(pose?: RangePose, tutorialFrom?: number | string, place?: PracticeAt): void {
    const { setup, results } = this.parts;
    const course = place?.course ?? RANGE_CHALLENGE.course;
    const code = this.rangeCode.get();
    if (!code) throw new Error('The practice range was built before its code arrived (play fetches it)');
    this.session?.dispose();
    setup.loadoutChanged = false;
    this.session = new code.RangeSession(this.parts.renderer, this.parts.container, this.parts.input, {
      kit: setup.loadout.kit(),
      teamColours: TEAM_COLOUR_SETS[this.parts.prefs.teamColours],
      look: setup.look,
      levelling: !this.parts.dev().unlockAllGear,
      ...(place ? { map: place.map, course: place.course } : {}),
      challenge: loadPracticeChallenge(),
      challengeBest: results.challengeBest(course),
    }, this.parts.seed, this.parts.quality(), this.parts.audio, this.parts.prefs, pose, tutorialFrom);
    this.session.onTutorialStep = (step) => saveSetting('tutorialStep', step);
    // A timed challenge run that beats the best is kept at once (M93), like a match's records, and as with a match's,
    // never one played with Dev help (BP5).
    this.session.onChallengeRun = (run) => {
      if (!run.helped) results.challengeRun(course, run.hits);
    };
    this.setUp(this.session);
  }

  /** A session just built: the Dev settings in force (M24), its team colours. */
  private setUp(session: Session): void {
    const dev = this.parts.dev();
    session.combat.setBbPaths(dev.showBbPaths);
    session.setDevCheats(dev);
    this.parts.built();
    applyTeamCss(this.parts.container, TEAM_COLOUR_SETS[this.parts.prefs.teamColours]);
  }

  resume(): void {
    this.endEscSkip();
    this.fullscreen.stopHolding();
    const s = this.session;
    const { keyboard, pointer } = this.parts;
    // A mouse lock granted after the graphics context was lost (the lock was still pending): nothing can be drawn.
    if (this.graphicsLost) {
      pointer.release();
      return;
    }
    if (!s) {
      // Nothing to play (should not happen: Play resumes once its session is built); give the mouse back.
      pointer.release();
      return;
    }
    if (s?.kind === 'match' && !this.matchCounted) {
      this.matchCounted = true;
      this.matchesPlayed++;
    }
    this.started = true;
    this.loadoutDue = false;
    // Time on the menus isn't a frame time.
    this.parts.resumed();
    // Keys pressed on the menus aren't presses in play: the Loadout key that went back to practice would open it
    // again (M95), Space on a focused Resume would jump.
    keyboard.endFrame();
    keyboard.capturing = true;
    this.parts.menus.hide();
    this.audioBlocked = false;
    s.setPlaying(true);
  }

  /**
   * The player left the match (Quit on the pause menu, New Game or Quit on the result), or
   * went Back from New game after a Play whose mouse lock was refused: the match is unloaded, and the next Play builds a
   * new one from New game, where everything can change again.
   */
  leaveMatch(): void {
    this.started = false;
    this.practice = false;
    this.tutorial = false;
    this.unlockedPlay = false;
    this.endEscSkip();
    this.parts.pointer.setUnlockedButtons(false);
    this.session?.dispose();
    this.session = null;
    // Team colours changed from the pause menu waited for the match to end; the menus' swatches take them now (BP3).
    applyTeamCss(this.parts.container, TEAM_COLOUR_SETS[this.parts.prefs.teamColours]);
  }

  pause(): void {
    this.fullscreen.stopHolding();
    const { keyboard, menus, seed } = this.parts;
    keyboard.capturing = false;
    keyboard.releaseAll();
    this.parts.input.clearLatches();
    const s = this.session;
    const r = s?.state.round;
    const screen = screenWhenStopped(this.started, r?.phase === 'matchOver');
    const loadout = this.loadoutDue;
    this.loadoutDue = false;
    if (this.started && s?.kind === 'range') {
      // The tutorial just played to its end (M80): its pop-up, practice on or go to the menu, over the pause menu.
      if (s.takeTutorialComplete()) menus.showTutorialComplete(s.status, seed);
      // The Loadout key (M95): the Loadout over the pause menu, the slot of the replica in hand picked.
      else if (loadout) menus.showPracticeLoadout(s.status, seed, s.coaching, this.inHand(s), s.challengeOffer);
      else menus.showPause(s.status, seed, true, s.coaching, null, s.challengeOffer, this.inHand(s));
    } else if (!this.started || s?.kind !== 'match' || !r) {
      // Play never began (a lock that came late, after Back, and was given straight back): the menus are still up on
      // whichever screen the player went to, so they stay there.
    } else if (screen === 'result') {
      const view = s.resultView();
      // Settled the moment it was decided (Game's frame); again here in case that frame never came (it does nothing twice).
      this.parts.results.settle(s);
      menus.showResult(view.headline, view.scoreLine, this.parts.results.summary(s, view));
    } else {
      menus.showPause(s.pauseLine(), this.matchSeed, false, false, s.skipOffer);
    }
    s?.setPlaying(false);
    // The screen just shown starts without a hint: say again why the match was silent.
    if (this.audioBlocked) menus.showHint(BROWSER_NOTES.audioBlocked);
  }

  /** Stops play as if the player had pressed Esc: the mouse is given back, and the pause menu comes up. */
  stopPlay(): void {
    if (this.escSkip) {
      this.endEscSkip();
      this.pause();
    } else if (this.unlockedPlay) {
      this.unlockedPlay = false;
      this.parts.pointer.setUnlockedButtons(false);
      this.pause();
    } else if (this.parts.pointer.locked) {
      this.parts.pointer.release();
    } else if (this.fullscreen.holding) {
      this.pause();
    }
  }

  /** The mouse lock was taken (`locked`) or dropped (`released`: by the game's own release). */
  lockChanged(locked: boolean, released: boolean): void {
    // Stopped on an error: the crash pane stays on top and nothing resumes; a lock granted late is given back.
    if (this.parts.crashed()) {
      if (locked) this.parts.pointer.release();
      return;
    }
    if (locked) {
      if (!this.askingLock) this.resume();
    } else if (this.escSkipDrop(released)) {
      this.startEscSkip();
    } else if (!released && this.fullscreen.relock() !== 'none') {
      // The lock dropped as fullscreen changes (Firefox): play holds, without the pause menu, while it is taken again.
      this.fullscreen.hold();
    } else {
      this.pause();
      if (this.fullscreen.takeByClick() && released) this.parts.menus.askFullscreenClick();
      this.fullscreen.takeAgain();
    }
  }

  /**
   * The browser refused the mouse lock. While the round skips without the mouse the prompt over the field says so, not
   * the hidden menus; while play held for fullscreen, the pause menu, asking for the click (IN1).
   */
  lockRefused(): void {
    if (this.escSkip) return this.parts.playPrompt.show(MENU_TEXT.lockRefused);
    if (this.fullscreen.holding) this.pause();
    this.parts.menus.lockRefused();
  }

  /** The browser wouldn't let the sound start (audit CORE-21): the menus say so, and again on the next screen stopped on. */
  audioRefused(): void {
    this.audioBlocked = true;
    this.parts.menus.showHint(BROWSER_NOTES.audioBlocked);
  }

  /**
   * The graphics context was lost (true) or is back (false) (M18b, audit W-01). While it's gone the match pauses
   * and a notice covers everything; once it's back the pause menu says so and Resume carries on (Three.js uploads
   * everything again on the next frame, except render targets, which the session renders again: contextRestored).
   */
  contextChanged(lost: boolean): void {
    this.graphicsLost = lost;
    this.parts.graphicsNotice.setVisible(lost);
    // The menus can't be used under the notice (not even Resume by Enter or Space on the focused button).
    this.parts.menus.setBlocked(lost || this.yielded);
    if (lost) {
      this.stopPlay();
    } else {
      this.session?.contextRestored();
      // Only the pause menu has a Resume to point at (not the result screen).
      if (this.started && this.parts.menus.screen === 'pause') this.parts.menus.showHint(BROWSER_NOTES.graphicsBack);
    }
  }

  /** Another tab took the save (M31, save/tabLock.ts): play stops and the menus can't be used under its notice. */
  yieldToOtherTab(): void {
    this.yielded = true;
    this.stopPlay();
    this.parts.menus.setBlocked(true);
  }

  /** The mouse lock dropped (not the game's own release): whether it was Esc to skip the round (core/escSkip.ts). */
  private escSkipDrop(released: boolean): boolean {
    const s = this.session;
    if (!this.started || s?.kind !== 'match' || this.graphicsLost || this.yielded || this.askingLock) return false;
    return escSkips({
      released,
      skippable: s.skipping || s.skipOffer !== null,
      focused: document.visibilityState === 'visible' && document.hasFocus(),
      msSinceFullscreenKey: this.fullscreen.sinceKey(performance.now()),
      fullscreenWindowMs: FULLSCREEN_RELOCK_MS,
    });
  }

  /**
   * Esc skipped the round (core/escSkip.ts): the skip begins, or the one running carries on, without the mouse. Keys
   * wait for play, as on the pause menu, and the prompt says how to play on.
   */
  private startEscSkip(): void {
    const s = this.session;
    if (s?.kind === 'match' && !s.skipping) s.beginSkip();
    this.escSkip = true;
    this.escSkipAt = performance.now();
    this.parts.keyboard.capturing = false;
    this.parts.keyboard.releaseAll();
    this.parts.input.clearLatches();
    this.parts.playPrompt.show();
  }

  /** The skip without the mouse is over: the mouse was taken again, play stopped, or the match was left. */
  endEscSkip(): void {
    this.escSkip = false;
    this.parts.playPrompt.hide();
  }

  /** A click on the field while the round skips without the mouse takes the mouse again, and play goes on (resume). */
  readonly clickToPlay = (e: MouseEvent): void => {
    if (!this.escSkip || e.button !== 0) return;
    e.preventDefault();
    void this.parts.pointer.request();
  };

  /** Esc again while the round skips without the mouse opens the pause menu (Resume carries on with the skip). */
  readonly escSkipKey = (e: KeyboardEvent): void => {
    if (!this.escSkip || !escOpensMenu(e.code, e.repeat, performance.now() - this.escSkipAt, PAUSE_ESC_GUARD_MS)) return;
    e.preventDefault();
    this.endEscSkip();
    this.pause();
  };

  /** The range's pause menu (the tutorial's, with its coaching), when the range is what's loaded. */
  private showRangePause(): void {
    const s = this.session;
    if (s?.kind === 'range') this.parts.menus.showPause(s.status, this.parts.seed, true, s.coaching, null, s.challengeOffer, this.inHand(s));
  }

  /** The gear slot of the replica in your hands on the range (M95): its Loadout picks that slot. */
  private inHand(s: RangeSession): GearSlot {
    return this.parts.setup.loadout.gearSlotOf(s.player.armament.active);
  }

  /** The Loadout key in Practice (M95): play stops as on Esc, and the pause that follows opens the Loadout. */
  openPracticeLoadout(): void {
    if (!this.unlockedPlay && !this.parts.pointer.locked) return;
    this.loadoutDue = true;
    this.stopPlay();
  }

  /** The range's pause menu's Timed challenge (M93): switched, remembered for the next visit, and the menu says so. */
  toggleChallenge(): void {
    const s = this.session;
    if (s?.kind !== 'range' || s.challengeOffer === null) return;
    const on = !s.challengeOffer;
    s.setChallenge(on);
    saveSetting('practiceChallenge', on);
    this.parts.menus.updatePause(s.status, s.challengeOffer);
  }

  /** The pause menu's Skip step or Skip tutorial (audit POOL-14): the range carries on, the pause menu says where. */
  skipTutorial(all: boolean): void {
    const s = this.session;
    if (s?.kind !== 'range') return;
    if (all) s.endTutorial();
    else s.skipTutorialStep();
    this.takeTutorialFinished(s);
    if (s.takeTutorialComplete()) this.parts.menus.showTutorialComplete(s.status, this.parts.seed);
    else this.parts.menus.showPause(s.status, this.parts.seed, true, s.coaching, null, s.challengeOffer, this.inHand(s));
  }

  /** The tutorial was played (or skipped) to its end: remembered, and the next one starts from the beginning. */
  takeTutorialFinished(s: RangeSession): void {
    if (!s.takeTutorialFinished()) return;
    saveSetting('tutorialDone', true);
    saveSetting('tutorialStep', '');
    this.parts.menus.markTutorialDone();
  }
}
