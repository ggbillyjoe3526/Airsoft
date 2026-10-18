import { MENU_TEXT, TITLE_TEXT } from '../../config/menus';
import { THIRD_PARTY_LICENCES } from '../../config/thirdPartyLicences';
import { isFullscreen, onFullscreenChange, toggleFullscreen } from '../fullscreen';
import type { MenuHint } from './chrome';
import { FULLSCREEN_ICONS, MENU_ICONS, NAV_ICONS, WARNING_ICON } from './icons';
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
 * The first thing a player sees (M100): the wordmark on a plain background (no picture: the owner, 2026-10-08), the tagline, START, and under it the Tutorial on
 * a clean save; a Fullscreen button at the bottom left (Exit fullscreen while in it, MR1) and the build's version small at
 * the bottom right, with the third-party licences' link over it (LC1). Nothing else. START opens the Match screen, whose top bar leads to the Loadout, the Armory and
 * Settings.
 */
export class TitleScreen {
  readonly root: HTMLDivElement;
  readonly hints: readonly MenuHint[];
  private readonly warning: HTMLParagraphElement;
  private readonly warningText: HTMLSpanElement;
  private readonly tutorial: HTMLButtonElement;
  private readonly fullscreen: HTMLButtonElement;
  private readonly fullscreenSign = el('span', 'title-fullscreen-sign');
  private readonly fullscreenLabel = el('span');
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
    // The licences of the code and font the game ships (config/thirdPartyLicences.ts), the build's file beside the page,
    // in a new tab so the title stays as it was.
    const licences = el('a', 'title-licences', TITLE_TEXT.licences);
    licences.href = THIRD_PARTY_LICENCES.fileName;
    licences.target = '_blank';
    licences.rel = 'noopener';

    // Fullscreen in one click (MR1), the label and sign following the page however it got there (F11, Settings, Esc).
    // Hidden where the browser offers no fullscreen (a page in a frame without permission).
    this.fullscreen = el('button', 'menu-button menu-button-secondary title-fullscreen');
    this.fullscreen.type = 'button';
    this.fullscreenSign.setAttribute('aria-hidden', 'true');
    this.fullscreen.append(this.fullscreenSign, this.fullscreenLabel);
    this.fullscreen.addEventListener('click', () => toggleFullscreen());
    this.fullscreen.hidden = document.fullscreenEnabled === false;
    this.showFullscreen(isFullscreen());
    onFullscreenChange((on) => this.showFullscreen(on));

    // The keys the title answers to: Enter presses START (it has the focus), T the Tutorial, Esc opens Settings.
    this.hints = [
      { keys: ['Enter'], label: MENU_TEXT.hints.start, run: actions.onStart },
      { keys: ['T'], label: MENU_TEXT.hints.tutorial, run: () => (this.tutorialShown() ? actions.onTutorial() : undefined), code: 'KeyT' },
      { keys: ['Esc'], label: MENU_TEXT.hints.settings, run: actions.onSettings },
    ];
    const body = el('div', 'title-body');
    // The warning sits in the title's own column (the wordmark's left edge), with the column's gap above the wordmark.
    body.append(this.warning, hero, buttons);
    this.root.append(body, this.fullscreen, licences, version);
  }

  private showFullscreen(on: boolean): void {
    this.fullscreenSign.innerHTML = on ? FULLSCREEN_ICONS.exit : FULLSCREEN_ICONS.enter;
    this.fullscreenLabel.textContent = on ? MENU_TEXT.exitFullscreen : MENU_TEXT.fullscreen;
    this.fullscreen.setAttribute('aria-pressed', String(on));
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
