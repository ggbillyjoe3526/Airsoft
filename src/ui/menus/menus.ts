import { PAUSE_ESC_GUARD_MS } from '../../config/controls';
import type { QualityChoice, QualitySettings } from '../../config/render';
import type { NewGamePicks } from '../../newGamePicks';
import { saveSetting } from '../../settings/storage';
import { ArmoryScreen } from './armoryScreen';
import { Backdrop, type MenuHint, type NavPlace, TopBar } from './chrome';
import type { PictureContext } from './kitStrip';
import { LoadoutScreen } from './loadoutScreen';
import { backTarget, escResumes, type MenuScreen, type SettingsOrigin } from './menuNav';
import { el, watchScroll } from './menuParts';
import { PauseScreen } from './pauseScreen';
import { PlayPicks } from './playModel';
import { loadMatchStarted } from './savedChoices';
import { ResultScreen } from './resultScreen';
import { playView } from './playView';
import { SettingsScreen } from './settingsScreen';
import { type PlayView, SetupScreen } from './setupScreen';
import { type MatchSummary, SummaryScreen } from './summaryScreen';
import type { MenusOptions } from './menusOptions';
import { TitleScreen, tutorialOffered } from './titleScreen';

export type { FixedRulesText, MenusOptions, MenuWallet } from './menusOptions';

/** A screen as the menus hold it: its page and the keys it answers to. */
interface Screen {
  readonly root: HTMLElement;
  readonly hints?: readonly MenuHint[];
}

/** The screens with the top bar over them, each as the place it marks. */
const TOP_BAR_PLACES: Partial<Record<MenuScreen, NavPlace>> = { setup: 'setup', loadout: 'loadout', armory: 'armory', settings: 'settings' };

/** The screens whose backdrop is darkened all over: dense pages read better on an even ground. */
const EVEN_BACKDROP: ReadonlySet<MenuScreen> = new Set(['loadout', 'armory', 'settings', 'summary']);

/**
 * The game's menus (M15, M15b; G3 look): the title, the Play screen (New game: map, mode and match on one page), the
 * Loadout, the Armory and Settings under a shared top bar, the pause menu, and the match's end: the summary (M19) and the
 * result. One screen shows at a time over one backdrop picture; the game says which when play stops (showTitle /
 * showPause / showResult) and the buttons and the top bar move between the rest. Each screen is built the first time it
 * opens; nothing here runs per frame.
 */
export class Menus {
  private readonly root: HTMLDivElement;
  private readonly backdrop = new Backdrop();
  private readonly topBar: TopBar;
  private readonly context: PictureContext;
  private readonly built: Partial<Record<MenuScreen, Screen>> = {};
  /** Stops each built screen's scroll watch (menuParts.watchScroll); run by dispose (audit CORE-07). */
  private readonly stopScrollWatches: Array<() => void> = [];
  private title?: TitleScreen;
  private setup?: SetupScreen;
  private loadout?: LoadoutScreen;
  private armory?: ArmoryScreen;
  private settings?: SettingsScreen;
  private pause?: PauseScreen;
  private summary?: SummaryScreen;
  private result?: ResultScreen;
  /** The Match screen's picks as made (a dev pick stays; playedPicks says how they play), each change saved and reported. */
  private readonly model: PlayPicks;
  private realistic: boolean;
  private tutorialDone: boolean;
  /** A first match was started, or the save already holds records: the title stops offering the Tutorial (M100). */
  private matchStarted: boolean;
  /** Set before the screens they belong on are built: shown as each is. */
  private titleWarning = '';
  private shownQuality: { choice: QualityChoice; settings: QualitySettings } | null = null;
  private hint = '';
  private current: MenuScreen = 'title';
  /** Where Settings, the Loadout and the Armory were opened from, so Back returns there. */
  private readonly origins: Record<'settings' | 'loadout' | 'armory', SettingsOrigin> = { settings: 'title', loadout: 'title', armory: 'title' };
  /** What had the focus on each screen when it was left, so Back puts the keyboard where it was. */
  private readonly lastFocus = new Map<MenuScreen, HTMLElement>();
  /** When the pause menu last came up (performance.now()), so the Esc that brought it doesn't resume too. */
  private pauseShownAt = 0;

  constructor(
    parent: HTMLElement,
    private readonly opts: MenusOptions,
  ) {
    this.root = el('div', 'menus');
    const picked: NewGamePicks = {
      map: opts.map.initial,
      mode: opts.mode.initial,
      difficulty: opts.difficulty.initial,
      teammateDifficulty: opts.teammateDifficulty.initial,
      ruleset: opts.ruleset.initial,
      rules: { ...opts.matchRules.initial },
    };
    this.model = new PlayPicks(picked, { ...opts.lighting.initial }, opts.teammateDifficulty.follows, {
      onMap: (m) => opts.map.onChange(m),
      onLight: (m, light) => opts.lighting.onChange(m, light),
      onMode: (m) => opts.mode.onChange(m),
      onRuleset: (r) => opts.ruleset.onChange(r),
      onRules: (rules) => opts.matchRules.onChange(rules),
      onDifficulty: (d) => opts.difficulty.onChange(d),
      onTeammates: (d) => opts.teammateDifficulty.onChange(d),
      supply: opts.mode.supply,
      refresh: () => this.refreshViews(),
    });
    this.realistic = opts.look.initial.realisticColours;
    this.tutorialDone = opts.tutorialDone;
    this.matchStarted = loadMatchStarted();
    this.context = { pictures: opts.pictures, realistic: () => this.realistic };
    this.topBar = new TopBar(
      (place) => this.navigate(place),
      () => this.fromMark(),
    );
    this.topBar.root.hidden = true;
    this.root.append(this.backdrop.root, this.topBar.root);
    parent.appendChild(this.root);
    window.addEventListener('keydown', this.onKeyDown);
    this.refreshViews();
  }

  /** The screen on show (while the menus are). */
  get screen(): MenuScreen {
    return this.current;
  }

  showTitle(): void {
    this.go('title');
  }

  /**
   * The pause menu, with `status` (round and score) under the heading; `range`: on the practice range (M21);
   * `tutorial`: its coach is running there (Skip step, Skip tutorial).
   */
  showPause(status: string, seed: number, range = false, tutorial = false): void {
    const pause = this.pauseScreen();
    pause.setStatus(status);
    pause.setSeed(seed);
    pause.setRange(range, tutorial);
    this.pauseShownAt = performance.now();
    this.go('pause');
  }

  /** The match's end: the summary first, then (Continue) the result, "You win!" and the score line. */
  showResult(headline: string, detail: string, summary: MatchSummary): void {
    this.resultScreen().set(headline, detail);
    this.summaryScreen().set(summary);
    this.go('summary');
  }

  hide(): void {
    this.leave();
    this.root.hidden = true;
    this.showHint('');
  }

  /**
   * Blocked (true) while the game can't be played, e.g. under the "Graphics reset" notice: nothing on the menus can be
   * focused or pressed. Unblocked, the screen's main button takes the focus again.
   */
  setBlocked(blocked: boolean): void {
    this.root.inert = blocked;
    // A pop-up is a modal dialog, drawn above everything (the notice too) and closed by Esc even while inert (bug pass).
    if (blocked) this.closeDialogs();
    if (!blocked && !this.root.hidden) this.built[this.current]?.root.querySelector<HTMLElement>('[data-autofocus]')?.focus({ preventScroll: true });
  }

  /** A warning on the title screen ('' hides it): the browser runs without hardware acceleration. */
  showTitleWarning(text: string): void {
    this.titleWarning = text;
    this.title?.setWarning(text);
  }

  /** Shows a quality choice on Settings → Graphics without saving it (the game's own step-down, REN-03). */
  showQuality(choice: QualityChoice, settings: QualitySettings): void {
    this.shownQuality = { choice, settings };
    this.settings?.showQuality(choice, settings);
  }

  /** A short message by the play buttons, e.g. when the browser refuses the mouse lock (empty to clear). */
  showHint(text: string): void {
    this.hint = text;
    this.title?.showHint(text);
    this.setup?.showHint(text);
    this.pause?.showHint(text);
    this.result?.showHint(text);
  }

  dispose(): void {
    window.removeEventListener('keydown', this.onKeyDown);
    this.settings?.dispose();
    for (const stop of this.stopScrollWatches) stop();
    this.stopScrollWatches.length = 0;
    this.root.remove();
  }

  /** The tutorial was just played through (M16). */
  markTutorialDone(): void {
    this.tutorialDone = true;
    this.title?.setTutorialShown(this.tutorialOffered());
  }

  /** The screens again, after something outside the menus changed what they show (a match paid Field Credits). */
  refresh(): void {
    this.refreshViews();
  }

  // The screens, each built the first time it is needed.

  private titleScreen(): TitleScreen {
    if (!this.title) {
      const t = (this.title = new TitleScreen(
        {
          onStart: () => this.openSetup(),
          onTutorial: () => this.openRange(this.opts.onTutorial),
          onSettings: () => this.openSettings('title'),
        },
        this.tutorialOffered(),
      ));
      t.setWarning(this.titleWarning);
      this.add('title', t);
    }
    return this.title;
  }

  private setupScreen(): SetupScreen {
    if (!this.setup) {
      this.setup = new SetupScreen(this.model, this.opts.loadout.model, this.context, {
        onLoadout: () => this.openLoadout('setup'),
        onBack: () => this.back(),
        onPlay: () => this.startMatch(),
        onPractice: () => this.openRange(this.opts.onRange),
      });
      this.add('setup', this.setup);
    }
    return this.setup;
  }

  private loadoutScreen(): LoadoutScreen {
    if (!this.loadout) {
      const lo = this.opts.loadout;
      // Every loadout change also shows on the title's and the Play screen's kit.
      this.loadout = new LoadoutScreen({ model: lo.model, context: this.context, onChange: () => (lo.onChange(), this.refreshViews()) });
      this.add('loadout', this.loadout);
    }
    return this.loadout;
  }

  private armoryScreen(): ArmoryScreen {
    if (!this.armory) {
      const a = this.opts.armory;
      this.armory = new ArmoryScreen({
        pool: a.pool,
        collection: a.collection,
        equipped: a.equipped,
        context: this.context,
        // What the Armory gives can change the Loadout's picks and the wallet.
        onChange: () => {
          const reloaded = a.onChange();
          this.refreshViews();
          return reloaded;
        },
      });
      this.add('armory', this.armory);
    }
    return this.armory;
  }

  private settingsScreen(): SettingsScreen {
    if (!this.settings) {
      const o = this.opts;
      const s = (this.settings = new SettingsScreen({
        bindings: o.bindings,
        controls: o.controls,
        fov: o.fov,
        graphics: o.graphics,
        audio: o.audio,
        crosshair: o.crosshair,
        accessibility: o.accessibility,
        hud: o.hud,
        // Realistic colours also changes how the menus draw the replicas.
        look: { ...o.look, onChange: (look) => ((this.realistic = look.realisticColours), o.look.onChange(look), this.refreshViews()) },
        // The Play screen's note on the records follows the Dev settings.
        dev: {
          ...o.dev,
          onChange: (id, value) => (o.dev.onChange(id, value), this.refreshViews()),
          onEnabled: (on) => (o.dev.onEnabled(on), this.refreshViews()),
        },
        save: o.save,
      }));
      if (this.shownQuality) s.showQuality(this.shownQuality.choice, this.shownQuality.settings);
      this.add('settings', s);
    }
    return this.settings;
  }

  private pauseScreen(): PauseScreen {
    if (!this.pause) {
      this.pause = new PauseScreen({
        onResume: () => this.play(),
        onLoadout: () => this.openLoadout('pause'),
        onSettings: () => this.openSettings('pause'),
        onQuit: () => this.leaveMatch('title'),
        onSkipStep: () => this.opts.onSkipTutorialStep(),
        onSkipTutorial: () => this.opts.onSkipTutorial(),
      });
      this.add('pause', this.pause);
    }
    return this.pause;
  }

  private summaryScreen(): SummaryScreen {
    if (!this.summary) {
      this.summary = new SummaryScreen(() => this.go('result'));
      this.add('summary', this.summary);
    }
    return this.summary;
  }

  private resultScreen(): ResultScreen {
    if (!this.result) {
      this.result = new ResultScreen({
        onPlayAgain: () => this.play(),
        onSummary: () => this.go('summary'),
        onChangeSetup: () => this.leaveMatch('setup'),
        onTitle: () => this.leaveMatch('title'),
      });
      this.add('result', this.result);
    }
    return this.result;
  }

  private add(id: MenuScreen, screen: Screen): void {
    screen.root.hidden = true;
    this.built[id] = screen;
    this.root.append(screen.root);
    this.stopScrollWatches.push(watchScroll(screen.root));
    this.refreshViews();
    if (this.hint) this.showHint(this.hint);
  }

  private screenOf(id: MenuScreen): Screen {
    switch (id) {
      case 'title':
        return this.titleScreen();
      case 'setup':
        return this.setupScreen();
      case 'loadout':
        return this.loadoutScreen();
      case 'armory':
        return this.armoryScreen();
      case 'settings':
        return this.settingsScreen();
      case 'pause':
        return this.pauseScreen();
      case 'summary':
        return this.summaryScreen();
      case 'result':
        return this.resultScreen();
    }
  }

  // Moving between the screens.

  /** A place on the top bar: the screens it opens return to the title on Back. */
  private navigate(place: NavPlace): void {
    // The place on show (the only one on the bar when opened from the pause menu) stays as it is.
    if (TOP_BAR_PLACES[this.current] === place) return;
    // Back returns to the Play screen when the bar was used from there, else to the title (the places are its own).
    const from: SettingsOrigin = this.current === 'setup' ? 'setup' : 'title';
    if (place === 'setup') this.openSetup();
    else if (place === 'loadout') this.openLoadout(from);
    else if (place === 'armory') this.openArmory(from);
    else this.openSettings(from);
  }

  /** Ends the match the player is leaving, then shows `screen`. */
  private leaveMatch(screen: 'title' | 'setup'): void {
    this.opts.onLeaveMatch();
    if (screen === 'setup') this.openSetup();
    else this.go(screen);
  }

  private play(): void {
    this.showHint('');
    this.opts.onPlay();
  }

  /** Start match on the Match screen: the first one ends the title's Tutorial offer for good (M100). */
  private startMatch(): void {
    this.noteMatchStarted();
    this.play();
  }

  private noteMatchStarted(): void {
    if (this.matchStarted) return;
    this.matchStarted = true;
    saveSetting('matchStarted', true);
    this.title?.setTutorialShown(this.tutorialOffered());
  }

  private tutorialOffered(): boolean {
    return tutorialOffered(this.tutorialDone, this.matchStarted);
  }

  /** The top bar's wordmark: back to the title, or Back to the pause menu when Settings or the Loadout came from there. */
  private fromMark(): void {
    const from = this.current === 'settings' ? this.origins.settings : this.current === 'loadout' ? this.origins.loadout : 'title';
    if (from === 'pause') return this.back();
    // A Start match whose mouse lock was refused leaves a match built and unstarted: leaving for the title unloads it.
    this.opts.onLeaveMatch();
    this.go('title');
  }

  private openRange(open: () => void): void {
    this.showHint('');
    open();
  }

  private openSetup(): void {
    this.setupScreen().opened();
    this.go('setup');
  }

  private openLoadout(from: SettingsOrigin): void {
    this.origins.loadout = from;
    // What you own may have changed since it was last open (the Armory, M26c).
    this.loadoutScreen().refresh();
    this.go('loadout');
  }

  private openArmory(from: SettingsOrigin): void {
    if (this.opts.armory.wallet() === null) return;
    this.origins.armory = from;
    this.armoryScreen().refresh();
    this.go('armory');
  }

  private openSettings(from: SettingsOrigin): void {
    this.origins.settings = from;
    this.settingsScreen().openFrom(from);
    this.go('settings');
  }

  private target(): MenuScreen | null {
    return backTarget(this.current, this.origins.settings, this.origins.loadout, this.origins.armory);
  }

  private back(): void {
    const target = this.target();
    if (!target) return;
    // No match is ever under way on New game, but a Play whose mouse lock was refused leaves one built and unstarted:
    // leaving for the title unloads it, so no map stays loaded behind the title screen.
    if (this.current === 'setup') this.opts.onLeaveMatch();
    this.go(target, true);
  }

  /** Shows `screen`. Going back, the focus returns to where it was on that screen (the tile you opened, say). */
  private go(screen: MenuScreen, returning = false): void {
    const focused = document.activeElement;
    const was = this.built[this.current];
    if (focused instanceof HTMLElement && was?.root.contains(focused)) this.lastFocus.set(this.current, focused);
    this.leave();
    this.showHint('');
    const shown = this.screenOf(screen);
    this.current = screen;
    for (const [id, s] of Object.entries(this.built)) s.root.hidden = id !== screen;
    this.root.hidden = false;
    const place = TOP_BAR_PLACES[screen] ?? null;
    this.topBar.root.hidden = place === null;
    this.root.classList.toggle('has-topbar', place !== null);
    // Opened from the pause menu (a match is under way), only the screen itself shows on the bar.
    const fromPause = (screen === 'settings' && this.origins.settings === 'pause') || (screen === 'loadout' && this.origins.loadout === 'pause');
    this.topBar.show(place, fromPause);
    this.backdrop.show(screen === 'title' ? 'title' : 'blurred', EVEN_BACKDROP.has(screen));
    // The screen's main button takes the keyboard focus, so Enter does the obvious thing (Play, Resume …).
    const previous = returning ? this.lastFocus.get(screen) : undefined;
    (previous ?? shown.root.querySelector<HTMLElement>('[data-autofocus]'))?.focus({ preventScroll: true });
  }

  /**
   * Esc on the Play screen, the Loadout, the Armory or Settings acts as Back, on the title opens Settings, and on the
   * pause menu resumes like its Resume button (audit UI-09; a refused mouse lock shows the usual "click again" hint). A
   * pop-up closes itself on Esc, and Settings swallows the Esc that cancels a key binding or clears its search before it
   * gets here. Any other key a screen's hints name (T Tutorial, C Customise, / Search, Space 1 Shot) does what they say.
   */
  private readonly onKeyDown = (e: KeyboardEvent): void => {
    if (this.root.hidden || this.root.inert || this.dialogOpen()) return;
    if (e.code !== 'Escape') {
      this.hintKey(e);
      return;
    }
    if (escResumes(this.current, performance.now() - this.pauseShownAt, e.repeat, PAUSE_ESC_GUARD_MS)) {
      e.preventDefault();
      this.play();
      return;
    }
    // On the Loadout, Esc first closes a replica's Customise view (M26b).
    if (this.current === 'loadout' && this.loadout?.handleEscape()) {
      e.preventDefault();
      return;
    }
    if (this.current === 'title' && !e.repeat) {
      e.preventDefault();
      this.openSettings('title');
      return;
    }
    if (this.target() === null) return;
    e.preventDefault();
    this.back();
  };

  /** A key one of the screen's hints names: not while typing, with a modifier held, or as a held key repeats. */
  private hintKey(e: KeyboardEvent): void {
    if (e.repeat || e.ctrlKey || e.metaKey || e.altKey || typing(e.target)) return;
    const hint = this.built[this.current]?.hints?.find((h) => h.code === e.code && h.run);
    if (!hint) return;
    // An idle key (Space) presses a focused button instead while a control has the keyboard.
    const active = document.activeElement;
    if (hint.idle && active instanceof HTMLElement && active !== document.body && this.root.contains(active)) return;
    e.preventDefault();
    hint.run!();
  }

  /** Any pop-up open (a confirm, the Save tab's, M31): Esc is its own. */
  private dialogOpen(): boolean {
    return this.root.querySelector('dialog[open]') !== null;
  }

  private closeDialogs(): void {
    for (const d of this.root.querySelectorAll('dialog[open]')) (d as HTMLDialogElement).close();
  }

  /** Tidies up the screen being left: closes a pop-up, stops waiting for a key press. */
  private leave(): void {
    this.closeDialogs();
    if (this.current === 'settings') this.settings?.closed();
  }

  /** The Play screen, the title's next match and the wallet show what is picked and owned now. */
  private refreshViews(): void {
    const wallet = this.opts.armory.wallet();
    this.topBar.setWallet(wallet, wallet === null);
    this.setup?.refresh(this.playView());
  }

  /** The match as it will play (playView.ts). */
  private playView(): PlayView {
    return playView(this.model.picks(), this.opts, (id) => this.model.lightingOf(id));
  }
}

/** Whether a key goes into a text box (Settings' search, a number box), so no hint key acts on it. */
function typing(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement) return true;
  return target instanceof HTMLInputElement && !['checkbox', 'radio', 'range', 'button'].includes(target.type);
}
