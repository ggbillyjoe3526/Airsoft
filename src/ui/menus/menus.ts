import { DIFFICULTIES, type Difficulty } from '../../config/bots';
import type { CrouchMode } from '../../config/controls';
import { MATCH_MODES, type MatchMode } from '../../config/modes';
import type { QualityPreset } from '../../config/render';
import type { OpticChoice } from '../../config/optics';
import type { ReplicaConfig } from '../../config/replicas';
import type { KeyBindings } from '../../input/keyBindings';
import { MAPS, type MapId } from '../../map/maps';
import { loadoutSummary } from '../loadoutChoice';
import type { AudioSettingsOptions } from '../audioSettings';
import { ChoiceDialog } from './choiceDialog';
import { LoadoutScreen } from './loadoutScreen';
import { backTarget, type MenuScreen, type SettingsOrigin } from './menuNav';
import { el } from './menuParts';
import { PauseScreen } from './pauseScreen';
import { ResultScreen } from './resultScreen';
import { describeRules, type MatchRulesText } from './rulesText';
import { SettingsScreen } from './settingsScreen';
import { SetupScreen } from './setupScreen';
import { TitleScreen } from './titleScreen';

/** What the menus show and what they report back to the game. */
export interface MenusOptions {
  rules: MatchRulesText;
  bindings: KeyBindings;
  loadout: readonly ReplicaConfig[];
  /** Start (or resume) play: Play on New game, Resume, Play Again. */
  onPlay: () => void;
  /** The player leaves the match (Quit to title screen; Change setup or Title screen after it): it is unloaded. */
  onLeaveMatch: () => void;
  map: { initial: MapId; onChange: (m: MapId) => void };
  mode: { initial: MatchMode; onChange: (m: MatchMode) => void };
  difficulty: { initial: Difficulty; onChange: (d: Difficulty) => void };
  optic: { initial: OpticChoice; onChange: (o: OpticChoice) => void };
  hopUp: { initial: readonly number[]; onChange: (slot: number, dial: number) => void };
  sensitivity: { initial: number; onChange: (v: number) => void };
  aimSensitivity: { initial: number; onChange: (v: number) => void };
  crouch: { initial: CrouchMode; onChange: (m: CrouchMode) => void };
  fov: { initial: number; onChange: (v: number) => void };
  /** The render preset in use, shown on the greyed Quality row. */
  quality: QualityPreset;
  audio: AudioSettingsOptions;
}

/**
 * The game's menus (M15, M15b): the title screen, New game with its Map, Mode and Difficulty pop-ups, the Loadout and
 * Settings screens, the pause menu and the match result. One opaque screen shows at a time; the game says which one
 * when play stops (showTitle / showPause / showResult) and the buttons move between the rest.
 */
export class Menus {
  private readonly root: HTMLDivElement;
  private readonly title: TitleScreen;
  private readonly setup: SetupScreen;
  private readonly loadout: LoadoutScreen;
  private readonly settings: SettingsScreen;
  private readonly pause: PauseScreen;
  private readonly result: ResultScreen;
  private readonly mapDialog: ChoiceDialog<MapId>;
  private readonly modeDialog: ChoiceDialog<MatchMode>;
  private readonly difficultyDialog: ChoiceDialog<Difficulty>;
  private readonly screens: Record<MenuScreen, HTMLElement>;
  private optic: OpticChoice;
  private readonly dials: number[];
  private current: MenuScreen = 'title';
  /** What had the focus on each screen when it was left, so Back puts the keyboard where it was. */
  private readonly lastFocus = new Map<MenuScreen, HTMLElement>();

  constructor(
    parent: HTMLElement,
    private readonly opts: MenusOptions,
  ) {
    this.root = el('div', 'menus');
    this.optic = opts.optic.initial;
    this.dials = [...opts.hopUp.initial];
    this.title = new TitleScreen(() => this.go('setup'));
    this.setup = new SetupScreen({
      onMap: () => this.mapDialog.open(),
      onMode: () => this.modeDialog.open(),
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
      this.describeMode(m);
      this.refreshSetup();
    });
    this.difficultyDialog = new ChoiceDialog('Bot difficulty', DIFFICULTIES, opts.difficulty.initial, 'difficulty', (d) => {
      opts.difficulty.onChange(d);
      this.refreshSetup();
    });
    this.loadout = new LoadoutScreen({
      loadout: opts.loadout,
      optic: {
        initial: opts.optic.initial,
        onChange: (o) => {
          this.optic = o;
          opts.optic.onChange(o);
          this.refreshSetup();
        },
      },
      hopUp: {
        initial: opts.hopUp.initial,
        onChange: (slot, dial) => {
          this.dials[slot] = dial;
          opts.hopUp.onChange(slot, dial);
          this.refreshSetup();
        },
      },
      onBack: () => this.back(),
    });
    this.settings = new SettingsScreen({
      bindings: opts.bindings,
      sensitivity: opts.sensitivity,
      aimSensitivity: opts.aimSensitivity,
      crouch: opts.crouch,
      fov: opts.fov,
      quality: opts.quality,
      audio: opts.audio,
      onBack: () => this.back(),
    });
    this.pause = new PauseScreen({ onResume: () => this.play(), onSettings: () => this.openSettings('pause'), onQuit: () => this.leaveMatch('title') });
    this.result = new ResultScreen({ onPlayAgain: () => this.play(), onChangeSetup: () => this.leaveMatch('setup'), onTitle: () => this.leaveMatch('title') });
    this.screens = {
      title: this.title.root,
      setup: this.setup.root,
      loadout: this.loadout.root,
      settings: this.settings.root,
      pause: this.pause.root,
      result: this.result.root,
    };
    this.root.append(...Object.values(this.screens), this.mapDialog.root, this.modeDialog.root, this.difficultyDialog.root);
    parent.appendChild(this.root);
    window.addEventListener('keydown', this.onKeyDown);
    this.describeMode(opts.mode.initial);
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

  /** The match result ("You win!" and the score line). */
  showResult(headline: string, detail: string): void {
    this.result.set(headline, detail);
    this.go('result');
  }

  hide(): void {
    this.leave();
    this.root.hidden = true;
    this.showHint('');
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

  /** Explains the rules of `mode`, the next match's, on New game. */
  private describeMode(mode: MatchMode): void {
    this.setup.setRules(describeRules(this.opts.rules, mode));
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
    if (e.code !== 'Escape' || this.root.hidden || this.mapDialog.root.open || this.modeDialog.root.open || this.difficultyDialog.root.open) return;
    if (backTarget(this.current, this.settings.openedFrom) === null) return;
    e.preventDefault();
    this.back();
  };

  /** Tidies up the screen being left: closes a pop-up, stops waiting for a key press. */
  private leave(): void {
    this.mapDialog.close();
    this.modeDialog.close();
    this.difficultyDialog.close();
    if (this.current === 'settings') this.settings.closed();
  }

  /** The New game buttons show what is picked now. */
  private refreshSetup(): void {
    this.setup.map.set(this.mapDialog.label, this.mapDialog.blurb);
    this.setup.mode.set(this.modeDialog.label, this.modeDialog.blurb);
    this.setup.difficulty.set(this.difficultyDialog.label, this.difficultyDialog.blurb);
    this.setup.loadout.set(this.opts.loadout.map((r) => r.name).join('\n'), loadoutSummary(this.opts.loadout, this.optic, this.dials));
  }
}
