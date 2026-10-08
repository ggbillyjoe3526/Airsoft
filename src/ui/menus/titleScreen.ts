import { MENU_TEXT, TITLE_TEXT } from '../../config/menus';
import type { MenuHint } from './chrome';
import { MENU_ICONS, NAV_ICONS, WARNING_ICON } from './icons';
import { el, hintLine, menuButton, setHint, withIcon } from './menuParts';

export interface TitleActions {
  onStart: () => void;
  onTutorial: () => void;
  onSettings: () => void;
}

/**
 * Whether the title offers the Tutorial under START (M100, owner 2026-10-07): on a clean save only, until the tutorial
 * has been played through or a first match has been started. Pure.
 */
export function tutorialOffered(tutorialDone: boolean, matchStarted: boolean): boolean {
  return !tutorialDone && !matchStarted;
}

/**
 * The first thing a player sees (M100): the wordmark over the field, the tagline, START, and under it the Tutorial on
 * a clean save; the build's version small at the bottom left. Nothing else. START opens the Match screen, whose top
 * bar leads to the Loadout, the Armory and Settings.
 */
export class TitleScreen {
  readonly root: HTMLDivElement;
  readonly hints: readonly MenuHint[];
  private readonly warning: HTMLParagraphElement;
  private readonly warningText: HTMLSpanElement;
  private readonly tutorial: HTMLButtonElement;
  /** Over the buttons: e.g. the browser refused the mouse lock for the tutorial (audit L-29). */
  private readonly hint = hintLine();

  constructor(actions: TitleActions, tutorialShown: boolean) {
    this.root = el('div', 'menu-screen menu-title');
    this.root.hidden = true;

    const hero = el('div', 'title-hero');
    const wordmark = el('h1', 'menu-title-wordmark', MENU_TEXT.wordmark);
    hero.append(wordmark, el('p', 'menu-title-tagline', TITLE_TEXT.tagline));

    const start = menuButton(MENU_TEXT.hints.start, 'primary', actions.onStart);
    start.classList.add('menu-title-start', 'menu-button-big');
    start.insertAdjacentHTML('beforeend', MENU_ICONS.arrowRight);
    start.dataset.autofocus = '';
    this.tutorial = withIcon(menuButton(MENU_TEXT.hints.tutorial, 'secondary', actions.onTutorial), NAV_ICONS.tutorial);
    this.tutorial.classList.add('menu-title-tutorial');
    const buttons = el('div', 'title-actions');
    buttons.append(this.hint, start, this.tutorial);
    this.setTutorialShown(tutorialShown);

    this.warning = el('p', 'menu-title-warning');
    this.warning.setAttribute('role', 'alert');
    this.warning.hidden = true;
    // A slim banner with a warning sign (audit section 6, item 12); the text beside it is what's read out.
    this.warning.insertAdjacentHTML('afterbegin', WARNING_ICON);
    this.warningText = el('span');
    this.warning.append(this.warningText);

    // Which build this is, worked out from git as the game is built (config/buildVersion.ts).
    const version = el('p', 'title-version', __BUILD_VERSION__.label);
    version.title = __BUILD_VERSION__.title;

    // The keys the title answers to: Enter presses START (it has the focus), T the Tutorial, Esc opens Settings.
    this.hints = [
      { keys: ['Enter'], label: MENU_TEXT.hints.start, run: actions.onStart },
      { keys: ['T'], label: MENU_TEXT.hints.tutorial, run: () => (this.tutorialShown() ? actions.onTutorial() : undefined), code: 'KeyT' },
      { keys: ['Esc'], label: MENU_TEXT.hints.settings, run: actions.onSettings },
    ];
    const body = el('div', 'title-body');
    // The warning sits in the title's own column (the wordmark's left edge), with the column's gap above the wordmark.
    body.append(this.warning, hero, buttons);
    this.root.append(body, version);
  }

  /** Whether the Tutorial button is on show. */
  tutorialShown(): boolean {
    return !this.tutorial.hidden;
  }

  /** A warning over the field, e.g. that the browser runs without hardware acceleration ('' hides it). */
  setWarning(text: string): void {
    this.warningText.textContent = text;
    this.warning.hidden = text === '';
  }

  /** A short message over the buttons ('' hides it). */
  showHint(text: string): void {
    setHint(this.hint, text);
  }

  /** The Tutorial under START: on a clean save, then gone for good once the tutorial or a first match is done. */
  setTutorialShown(shown: boolean): void {
    this.tutorial.hidden = !shown;
  }
}
