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
import type { QualityPreset } from '../../config/render';
import type { KeyBindings } from '../../input/keyBindings';
import { MAPS, type MapId } from '../../map/maps';
import type { AccessibilitySettingsOptions } from '../accessibilitySettings';
import type { AudioSettingsOptions } from '../audioSettings';
import type { ControlsSettingsOptions } from '../controlsSettings';
import type { CrosshairSettingsOptions } from '../crosshairSettings';
import { ChoiceDialog } from './choiceDialog';
import { type LoadoutOptions, LoadoutScreen } from './loadoutScreen';
import { backTarget, type MenuScreen, type SettingsOrigin } from './menuNav';
import { el, menuRow, rangeControl } from './menuParts';
import { OptionPicker } from '../optionPicker';
import { RowsDialog } from './rowsDialog';
import { PauseScreen } from './pauseScreen';
import { ResultScreen } from './resultScreen';
import { describeRules, type MatchRulesText } from './rulesText';
import { SettingsScreen } from './settingsScreen';
import { SetupScreen } from './setupScreen';
import { type MatchSummary, SummaryScreen } from './summaryScreen';
import { TitleScreen } from './titleScreen';

/** The parts of the rules text that the Match pop-up doesn't change (team names, the flag, who attacks first). */
export type FixedRulesText = Omit<MatchRulesText, 'teamSize' | 'winsNeeded' | 'roundTime' | 'halfTimeAfter' | 'friendlyFire' | 'ricochetsCount'>;

/** What the menus show and what they report back to the game. */
export interface MenusOptions {
  rules: FixedRulesText;
  bindings: KeyBindings;
  /** The Loadout screen's slots and choices, and the summary New game's Loadout button shows. */
  loadout: Omit<LoadoutOptions, 'onBack'> & { summary: () => { replicas: string; detail: string } };
  /** Start (or resume) play: Play on New game, Resume, Play Again. */
  onPlay: () => void;
  /** The player leaves the match (Quit to title screen; Change setup or Title screen after it): it is unloaded. */
  onLeaveMatch: () => void;
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
  /** The render preset in use, shown on the greyed Quality row. */
  quality: QualityPreset;
  audio: AudioSettingsOptions;
  crosshair: CrosshairSettingsOptions;
  accessibility: AccessibilitySettingsOptions;
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
  /** What had the focus on each screen when it was left, so Back puts the keyboard where it was. */
  private readonly lastFocus = new Map<MenuScreen, HTMLElement>();

  constructor(
    parent: HTMLElement,
    private readonly opts: MenusOptions,
  ) {
    this.root = el('div', 'menus');
    this.matchRules = { ...opts.matchRules.initial };
    this.difficulty = opts.difficulty.initial;
    this.teammateDifficulty = opts.teammateDifficulty.initial;
    this.title = new TitleScreen(() => this.go('setup'));
    this.setup = new SetupScreen({
      onMap: () => this.mapDialog.open(),
      onMode: () => this.modeDialog.open(),
      onMatch: () => this.matchDialog.open(),
      onDifficulty: () => this.difficultyDialog.open(),
      onLoadout: () => this.go('loadout'),
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
      slots: lo.slots,
      picked: { initial: lo.picked.initial, onChange: (slot, r) => (lo.picked.onChange(slot, r), this.refreshSetup()) },
      optic: { initial: lo.optic.initial, onChange: (o) => (lo.optic.onChange(o), this.refreshSetup()) },
      hopUp: { initial: lo.hopUp.initial, onChange: (r, dial) => (lo.hopUp.onChange(r, dial), this.refreshSetup()) },
      bbWeight: { initial: lo.bbWeight.initial, onChange: (r, grams) => (lo.bbWeight.onChange(r, grams), this.refreshSetup()) },
      parts: { initial: lo.parts.initial, onChange: (r, parts) => (lo.parts.onChange(r, parts), this.refreshSetup()) },
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
      onBack: () => this.back(),
    });
    this.pause = new PauseScreen({ onResume: () => this.play(), onSettings: () => this.openSettings('pause'), onQuit: () => this.leaveMatch('title') });
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

  /** The pause menu, with `status` (round and score) under the heading. */
  showPause(status: string): void {
    this.pause.setStatus(status);
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
    if (!blocked && !this.root.hidden) this.screens[this.current].querySelector<HTMLElement>('[data-autofocus]')?.focus({ preventScroll: true });
  }

  /** A warning on the title screen ('' hides it): the browser runs without hardware acceleration. */
  showTitleWarning(text: string): void {
    this.title.setWarning(text);
  }

  /** A short message under the play buttons, e.g. when the browser refuses the mouse lock (empty to clear). */
  showHint(text: string): void {
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

  private openSettings(from: SettingsOrigin): void {
    this.settings.openFrom(from);
    this.go('settings');
  }

  private back(): void {
    const target = backTarget(this.current, this.settings.openedFrom);
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
   * Esc on Loadout, Settings or New game acts as Back. A pop-up closes itself on Esc, and Settings swallows the Esc
   * that cancels a key binding before it gets here.
   */
  private readonly onKeyDown = (e: KeyboardEvent): void => {
    if (e.code !== 'Escape' || this.root.hidden || this.dialogOpen()) return;
    if (backTarget(this.current, this.settings.openedFrom) === null) return;
    e.preventDefault();
    this.back();
  };

  private dialogOpen(): boolean {
    return this.mapDialog.root.open || this.modeDialog.root.open || this.matchDialog.root.open || this.difficultyDialog.root.open;
  }

  /** Tidies up the screen being left: closes a pop-up, stops waiting for a key press. */
  private leave(): void {
    this.mapDialog.close();
    this.modeDialog.close();
    this.matchDialog.close();
    this.difficultyDialog.close();
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
    // Said before the match, not only on its summary: custom rules don't go into the records (M20).
    this.setup.setRules(recorded ? rules : `${rules} ${NOT_RECORDED_NOTE}`);
    const loadout = this.opts.loadout.summary();
    this.setup.loadout.set(loadout.replicas, loadout.detail);
  }
}

/** Under New game's rules when the setup isn't the standard match. */
export const NOT_RECORDED_NOTE = `This match won't go into your records, which count only the standard match: ${standardMatchText()}`;

function difficultyLabel(d: Difficulty): string {
  return DIFFICULTIES.find((o) => o.id === d)?.label ?? d;
}
