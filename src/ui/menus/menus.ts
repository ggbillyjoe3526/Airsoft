import { DIFFICULTIES, type Difficulty, TEAMMATE_DIFFICULTIES } from '../../config/bots';
import {
  countsForRecords,
  FRIENDLY_FIRE_CHOICES,
  formatRoundTime,
  type MatchRules,
  matchRulesSummary,
  RICOCHETS_COUNT_CHOICES,
  ROUND_TIME_SETTING,
  roundRulesFor,
  standardMatchText,
  TEAM_SIZE_CHOICES,
  WINS_NEEDED_CHOICES,
} from '../../config/matchRules';
import { MATCH_MODES, type MatchMode } from '../../config/modes';
import { PAUSE_ESC_GUARD_MS } from '../../config/controls';
import type { QualityPreset } from '../../config/render';
import type { KeyBindings } from '../../input/keyBindings';
import { MAPS, type MapId } from '../../map/maps';
import type { AccessibilitySettingsOptions } from '../accessibilitySettings';
import type { AudioSettingsOptions } from '../audioSettings';
import type { ControlsSettingsOptions } from '../controlsSettings';
import type { CrosshairSettingsOptions } from '../crosshairSettings';
import type { HudSettingsOptions } from '../hudSettings';
import { ChoiceDialog } from './choiceDialog';
import { type ArmoryOptions, ArmoryScreen } from './armoryScreen';
import { type LoadoutOptions, LoadoutScreen } from './loadoutScreen';
import { backTarget, escResumes, type MenuScreen, type SettingsOrigin } from './menuNav';
import { el, menuRow, rangeControl } from './menuParts';
import { OptionPicker } from '../optionPicker';
import { RowsDialog } from './rowsDialog';
import { PauseScreen } from './pauseScreen';
import { ResultScreen } from './resultScreen';
import { describeRules, type MatchRulesText } from './rulesText';
import { type SettingsOptions, SettingsScreen } from './settingsScreen';
import { SetupScreen } from './setupScreen';
import { type MatchSummary, SummaryScreen } from './summaryScreen';
import { TitleScreen } from './titleScreen';

/** The parts of the rules text that the Match pop-up doesn't change (team names, the flag, who attacks first). */
export type FixedRulesText = Omit<MatchRulesText, 'teamSize' | 'winsNeeded' | 'roundTime' | 'halfTimeAfter' | 'friendlyFire' | 'ricochetsCount'>;

/** What the menus show and what they report back to the game. */
export interface MenusOptions {
  rules: FixedRulesText;
  bindings: KeyBindings;
  /** The Loadout screen's model and change hook, and the summary New game's Loadout button shows. */
  loadout: Omit<LoadoutOptions, 'onBack'> & { summary: () => { replicas: string; detail: string } };
  /** The Armory (M26c): its pool and the collection it changes, and New game's Armory button (balance and line). */
  armory: Omit<ArmoryOptions, 'onBack'> & { summary: () => { value: string; detail: string; disabled: boolean } };
  /** Start (or resume) play: Play on New game, Resume, Play Again. */
  onPlay: () => void;
  /** The player leaves the match (Quit; New Game or Quit after it): it is unloaded. */
  onLeaveMatch: () => void;
  /** The title screen's Practice range (M21): open the range and play. */
  onRange: () => void;
  /** The title screen's Tutorial (M16): the range with the coach. `tutorialDone`: it was played through before. */
  onTutorial: () => void;
  tutorialDone: boolean;
  /** The pause menu during the tutorial (audit POOL-14): skip the step under way, or the rest of it. */
  onSkipTutorialStep: () => void;
  onSkipTutorial: () => void;
  map: { initial: MapId; onChange: (m: MapId) => void };
  mode: { initial: MatchMode; onChange: (m: MatchMode) => void };
  /** The opponents' bot difficulty and your bot teammates' (M20). */
  difficulty: { initial: Difficulty; onChange: (d: Difficulty) => void };
  /** `follows`: no teammate level is saved yet, so it follows the opponents' picks until one is chosen. */
  teammateDifficulty: { initial: Difficulty; follows: boolean; onChange: (d: Difficulty) => void };
  /** The Match pop-up's rules (M20). */
  matchRules: { initial: MatchRules; onChange: (m: MatchRules) => void };
  controls: ControlsSettingsOptions;
  fov: { initial: number; onChange: (v: number) => void };
  /** The render quality preset (Settings → Graphics). */
  quality: { initial: QualityPreset; onChange: (q: QualityPreset) => void };
  audio: AudioSettingsOptions;
  crosshair: CrosshairSettingsOptions;
  accessibility: AccessibilitySettingsOptions;
  hud: HudSettingsOptions;
  /** The Dev tab (M24); `cheating`: a Dev setting now in force keeps the next match out of the records. */
  dev: SettingsOptions['dev'] & { cheating: () => boolean };
  /** The save, for Settings → Save (M31). */
  save: SettingsOptions['save'];
}

/**
 * The game's menus (M15, M15b): the title screen, New game with its Map, Mode and Difficulty pop-ups, the Loadout and
 * Settings screens, the pause menu, and the match's end: the summary (M19) and the result. One opaque screen shows at a time; the game says which one
 * when play stops (showTitle / showPause / showResult) and the buttons move between the rest.
 */
export class Menus {
  private readonly root: HTMLDivElement;
  private readonly title: TitleScreen;
  private readonly setup: SetupScreen;
  private readonly loadout: LoadoutScreen;
  private readonly armory: ArmoryScreen;
  private readonly settings: SettingsScreen;
  private readonly pause: PauseScreen;
  private readonly summary: SummaryScreen;
  private readonly result: ResultScreen;
  private readonly mapDialog: ChoiceDialog<MapId>;
  private readonly modeDialog: ChoiceDialog<MatchMode>;
  private readonly matchDialog: RowsDialog;
  private readonly difficultyDialog: RowsDialog;
  /** What the Match and Difficulty pop-ups have picked. */
  private readonly matchRules: MatchRules;
  private difficulty: Difficulty;
  private teammateDifficulty: Difficulty;
  private readonly screens: Record<MenuScreen, HTMLElement>;
  private current: MenuScreen = 'title';
  /** Where the Loadout was opened from: New game, or the practice range's pause menu (M21). */
  private loadoutFrom: SettingsOrigin = 'setup';
  /** What had the focus on each screen when it was left, so Back puts the keyboard where it was. */
  private readonly lastFocus = new Map<MenuScreen, HTMLElement>();
  /** When the pause menu last came up (performance.now()), so the Esc that brought it doesn't resume too. */
  private pauseShownAt = 0;

  constructor(
    parent: HTMLElement,
    private readonly opts: MenusOptions,
  ) {
    this.root = el('div', 'menus');
    this.matchRules = { ...opts.matchRules.initial };
    this.difficulty = opts.difficulty.initial;
    this.teammateDifficulty = opts.teammateDifficulty.initial;
    this.title = new TitleScreen(() => this.go('setup'), () => this.openRange(this.opts.onRange), () => this.openRange(this.opts.onTutorial), opts.tutorialDone);
    this.setup = new SetupScreen({
      onMap: () => this.mapDialog.open(),
      onMode: () => this.modeDialog.open(),
      onMatch: () => this.matchDialog.open(),
      onDifficulty: () => this.difficultyDialog.open(),
      onLoadout: () => this.openLoadout('setup'),
      onArmory: () => this.openArmory(),
      onSettings: () => this.openSettings('setup'),
      onBack: () => this.back(),
      onPlay: () => this.play(),
    });
    this.mapDialog = new ChoiceDialog('Map', MAPS, opts.map.initial, 'map', (m) => {
      opts.map.onChange(m);
      this.refreshSetup();
    });
    this.modeDialog = new ChoiceDialog('Game mode', MATCH_MODES, opts.mode.initial, 'mode', (m) => {
      opts.mode.onChange(m);
      this.refreshSetup();
    });
    this.matchDialog = new RowsDialog('Match', this.matchRows());
    // Until a teammate level is picked (and saved), teammates follow the opponents' level, as every bot did before M20.
    let teammatesFollow = opts.teammateDifficulty.follows;
    const teammates = new OptionPicker('Teammates', TEAMMATE_DIFFICULTIES, this.teammateDifficulty, 'teammateDifficulty', (d) => {
      teammatesFollow = false;
      this.teammateDifficulty = d;
      opts.teammateDifficulty.onChange(d);
      this.refreshSetup();
    });
    this.difficultyDialog = new RowsDialog('Bot difficulty', [
      menuRow(
        'Opponents',
        'The other team\'s bots.',
        new OptionPicker('Opponents', DIFFICULTIES, this.difficulty, 'difficulty', (d) => {
          this.difficulty = d;
          opts.difficulty.onChange(d);
          if (teammatesFollow) {
            this.teammateDifficulty = d;
            teammates.show(d);
            opts.teammateDifficulty.onChange(d);
          }
          this.refreshSetup();
        }).root,
      ),
      menuRow('Teammates', 'Your bot teammates (none in a 1v1).', teammates.root),
    ]);
    // Every loadout change also refreshes New game's Loadout button.
    const lo = opts.loadout;
    this.loadout = new LoadoutScreen({
      model: lo.model,
      onChange: () => (lo.onChange(), this.refreshSetup()),
      onBack: () => this.back(),
    });
    // What the Armory gives can change the Loadout's picks and New game's buttons.
    this.armory = new ArmoryScreen({
      pool: opts.armory.pool,
      collection: opts.armory.collection,
      equipped: opts.armory.equipped,
      onChange: () => (opts.armory.onChange(), this.refreshSetup()),
      onBack: () => this.back(),
    });
    this.settings = new SettingsScreen({
      bindings: opts.bindings,
      controls: opts.controls,
      fov: opts.fov,
      quality: opts.quality,
      audio: opts.audio,
      crosshair: opts.crosshair,
      accessibility: opts.accessibility,
      hud: opts.hud,
      // New game's note on the records follows the Dev settings.
      dev: {
        ...opts.dev,
        onChange: (id, value) => (opts.dev.onChange(id, value), this.refreshSetup()),
        onEnabled: (on) => (opts.dev.onEnabled(on), this.refreshSetup()),
      },
      save: opts.save,
      onBack: () => this.back(),
    });
    this.pause = new PauseScreen({
      onResume: () => this.play(),
      onLoadout: () => this.openLoadout('pause'),
      onSettings: () => this.openSettings('pause'),
      onQuit: () => this.leaveMatch('title'),
      onSkipStep: () => opts.onSkipTutorialStep(),
      onSkipTutorial: () => opts.onSkipTutorial(),
    });
    this.summary = new SummaryScreen(() => this.go('result'));
    this.result = new ResultScreen({
      onPlayAgain: () => this.play(),
      onSummary: () => this.go('summary'),
      onChangeSetup: () => this.leaveMatch('setup'),
      onTitle: () => this.leaveMatch('title'),
    });
    this.screens = {
      title: this.title.root,
      setup: this.setup.root,
      loadout: this.loadout.root,
      armory: this.armory.root,
      settings: this.settings.root,
      pause: this.pause.root,
      summary: this.summary.root,
      result: this.result.root,
    };
    this.root.append(...Object.values(this.screens), this.mapDialog.root, this.modeDialog.root, this.matchDialog.root, this.difficultyDialog.root);
    parent.appendChild(this.root);
    window.addEventListener('keydown', this.onKeyDown);
    this.refreshSetup();
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
    this.pause.setStatus(status);
    this.pause.setSeed(seed);
    this.pause.setRange(range, tutorial);
    this.pauseShownAt = performance.now();
    this.go('pause');
  }

  /** The match's end: the summary first, then (Continue) the result, "You win!" and the score line. */
  showResult(headline: string, detail: string, summary: MatchSummary): void {
    this.result.set(headline, detail);
    this.summary.set(summary);
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
    if (!blocked && !this.root.hidden) this.screens[this.current].querySelector<HTMLElement>('[data-autofocus]')?.focus({ preventScroll: true });
  }

  /** A warning on the title screen ('' hides it): the browser runs without hardware acceleration. */
  showTitleWarning(text: string): void {
    this.title.setWarning(text);
  }

  /** A short message under the play buttons, e.g. when the browser refuses the mouse lock (empty to clear). */
  showHint(text: string): void {
    this.title.showHint(text);
    this.setup.showHint(text);
    this.pause.showHint(text);
    this.result.showHint(text);
  }

  dispose(): void {
    window.removeEventListener('keydown', this.onKeyDown);
    this.settings.dispose();
    this.root.remove();
  }

  /** The Match pop-up's rows: rounds to win, round time, team size, friendly fire and whether ricochets count. */
  private matchRows(): HTMLElement[] {
    const m = this.matchRules;
    const changed = (): void => {
      this.opts.matchRules.onChange({ ...m });
      this.refreshSetup();
    };
    return [
      menuRow(
        'Rounds to win',
        '',
        new OptionPicker('Rounds to win', WINS_NEEDED_CHOICES, String(m.winsNeeded), 'winsNeeded', (v) => {
          m.winsNeeded = Number(v);
          changed();
        }).root,
      ),
      menuRow(
        'Round time',
        'Out of time: a draw in Elimination, the defenders\' round in Attack and Defend.',
        rangeControl('Round time', ROUND_TIME_SETTING, m.roundTime, formatRoundTime, 'roundTime', (v) => {
          m.roundTime = v;
          changed();
        }),
      ),
      menuRow(
        'Team size',
        'Bigger teams come with bigger fields.',
        new OptionPicker('Team size', TEAM_SIZE_CHOICES, String(m.teamSize), 'teamSize', (v) => {
          m.teamSize = Number(v);
          changed();
        }).root,
      ),
      menuRow(
        'Friendly fire',
        '',
        new OptionPicker('Friendly fire', FRIENDLY_FIRE_CHOICES, m.friendlyFire ? 'on' : 'off', 'friendlyFire', (v) => {
          m.friendlyFire = v === 'on';
          changed();
        }).root,
      ),
      menuRow(
        'Ricochets count',
        'BBs bounce off concrete and steel either way.',
        new OptionPicker('Ricochets count', RICOCHETS_COUNT_CHOICES, m.ricochetsCount ? 'on' : 'off', 'ricochets', (v) => {
          m.ricochetsCount = v === 'on';
          changed();
        }).root,
      ),
    ];
  }

  /** Ends the match the player is leaving, then shows `screen`. */
  private leaveMatch(screen: 'title' | 'setup'): void {
    this.opts.onLeaveMatch();
    this.go(screen);
  }

  private play(): void {
    this.showHint('');
    this.opts.onPlay();
  }

  private openRange(open: () => void): void {
    this.showHint('');
    open();
  }

  /** The tutorial was just played through (M16). */
  markTutorialDone(): void {
    this.title.setTutorialDone(true);
  }

  private openLoadout(from: SettingsOrigin): void {
    this.loadoutFrom = from;
    // What you own may have changed since it was last open (the Armory, M26c).
    this.loadout.refresh();
    this.go('loadout');
  }

  private openArmory(): void {
    if (this.opts.armory.summary().disabled) return;
    this.armory.refresh();
    this.go('armory');
  }

  private openSettings(from: SettingsOrigin): void {
    this.settings.openFrom(from);
    this.go('settings');
  }

  private back(): void {
    const target = backTarget(this.current, this.settings.openedFrom, this.loadoutFrom);
    if (!target) return;
    // No match is ever under way on New game, but a Play whose mouse lock was refused leaves one built and unstarted:
    // leaving for the title unloads it, so no map stays loaded behind the title screen.
    if (this.current === 'setup') this.opts.onLeaveMatch();
    this.go(target, true);
  }

  /** Shows `screen`. Going back, the focus returns to where it was on that screen (the tile you opened, say). */
  private go(screen: MenuScreen, returning = false): void {
    const focused = document.activeElement;
    if (focused instanceof HTMLElement && this.screens[this.current].contains(focused)) this.lastFocus.set(this.current, focused);
    this.leave();
    this.showHint('');
    this.current = screen;
    for (const [id, node] of Object.entries(this.screens)) node.hidden = id !== screen;
    this.root.hidden = false;
    // The screen's main button takes the keyboard focus, so Enter does the obvious thing (Play, Resume …).
    const previous = returning ? this.lastFocus.get(screen) : undefined;
    (previous ?? this.screens[screen].querySelector<HTMLElement>('[data-autofocus]'))?.focus({ preventScroll: true });
  }

  /**
   * Esc on Loadout, Settings or New game acts as Back, and on the pause menu resumes like its Resume button (audit
   * UI-09; a refused mouse lock shows the usual "click again" hint). A pop-up closes itself on Esc, and Settings swallows
   * the Esc that cancels a key binding before it gets here.
   */
  private readonly onKeyDown = (e: KeyboardEvent): void => {
    if (e.code !== 'Escape' || this.root.hidden || this.dialogOpen()) return;
    if (escResumes(this.current, performance.now() - this.pauseShownAt, e.repeat, PAUSE_ESC_GUARD_MS)) {
      e.preventDefault();
      this.play();
      return;
    }
    // On the Loadout, Esc first closes a replica's Customise view (M26b).
    if (this.current === 'loadout' && this.loadout.handleEscape()) {
      e.preventDefault();
      return;
    }
    if (backTarget(this.current, this.settings.openedFrom, this.loadoutFrom) === null) return;
    e.preventDefault();
    this.back();
  };

  /** Any pop-up open (New game's, or the Save tab's, M31): Esc is its own. */
  private dialogOpen(): boolean {
    return this.root.querySelector('dialog[open]') !== null;
  }

  private closeDialogs(): void {
    this.mapDialog.close();
    this.modeDialog.close();
    this.matchDialog.close();
    this.difficultyDialog.close();
    for (const d of this.root.querySelectorAll('dialog[open]')) (d as HTMLDialogElement).close();
  }

  /** Tidies up the screen being left: closes a pop-up, stops waiting for a key press. */
  private leave(): void {
    this.closeDialogs();
    if (this.current === 'settings') this.settings.closed();
  }

  /** The New game buttons and the rules under them show what is picked now. */
  private refreshSetup(): void {
    const m = this.matchRules;
    this.setup.map.set(this.mapDialog.label, this.mapDialog.blurb);
    this.setup.mode.set(this.modeDialog.label, this.modeDialog.blurb);
    const match = matchRulesSummary(m);
    this.setup.match.set(match.value, match.detail);
    const opponents = difficultyLabel(this.difficulty);
    const mates = difficultyLabel(this.teammateDifficulty);
    this.setup.difficulty.set(
      m.teamSize === 1 || this.difficulty === this.teammateDifficulty ? opponents : `${opponents} / ${mates}`,
      m.teamSize === 1 ? `Your opponent: ${opponents}. No teammates in a 1v1.` : `Opponents ${opponents}, teammates ${mates}.`,
    );
    const halfTimeAfter = roundRulesFor(m).halfTimeAfter;
    const recorded = countsForRecords(m, this.difficulty, this.teammateDifficulty);
    const rules = describeRules({ ...this.opts.rules, ...m, halfTimeAfter }, this.modeDialog.value);
    // Said before the match, not only on its summary: custom rules don't go into the records (M20), nor does a match
    // played with Dev settings that change play (M24).
    const notes = [rules];
    if (!recorded) notes.push(NOT_RECORDED_NOTE);
    else if (this.opts.dev.cheating()) notes.push(DEV_NOT_RECORDED_NOTE);
    this.setup.setRules(notes.join(' '));
    const loadout = this.opts.loadout.summary();
    this.setup.loadout.set(loadout.replicas, loadout.detail);
    const armory = this.opts.armory.summary();
    this.setup.armory.set(armory.value, armory.detail);
    this.setup.armory.setDisabled(armory.disabled);
  }

  /** New game's buttons again, after something outside the menus changed them (a match paid Field Credits). */
  refresh(): void {
    this.refreshSetup();
  }
}

/** Under New game's rules while Dev settings that change play are on (M24). */
export const DEV_NOT_RECORDED_NOTE = "Dev settings are on, so this match won't go into your records.";

/** Under New game's rules when the setup isn't the standard match. */
export const NOT_RECORDED_NOTE = `This match won't go into your records, which count only the standard match: ${standardMatchText()}`;

function difficultyLabel(d: Difficulty): string {
  return DIFFICULTIES.find((o) => o.id === d)?.label ?? d;
}
