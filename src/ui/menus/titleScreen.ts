import { BUILD_LABEL } from '../../config/menus';
import { el, hintLine, menuButton, setHint, wordmark } from './menuParts';

/**
 * The first thing a player sees: "AIRSOFT." in the middle over the field, Start at the bottom left, then the tutorial
 * (M16; tagged for new players until it's been played through) and the practice range (M21).
 */
export class TitleScreen {
  readonly root: HTMLDivElement;
  private readonly warning: HTMLParagraphElement;
  private readonly tutorialTag: HTMLElement;
  /** Over the buttons: e.g. the browser refused the mouse lock for the range or the tutorial (audit L-29). */
  private readonly hint = hintLine();

  constructor(onStart: () => void, onRange: () => void, onTutorial: () => void, tutorialDone: boolean) {
    this.root = el('div', 'menu-screen menu-title');
    this.root.hidden = true;
    const centre = el('div', 'menu-title-centre');
    centre.append(wordmark('menu-title-wordmark', 'h1'), el('p', 'menu-title-tagline', "One BB, you're hit. Call it, walk off, go again."));
    const start = menuButton('Start', 'primary', onStart, true);
    start.classList.add('menu-title-start');
    start.dataset.autofocus = '';
    const actions = el('div', 'menu-title-actions');
    const tutorial = menuButton('Tutorial', 'secondary', onTutorial, true);
    this.tutorialTag = el('span', 'menu-title-new', 'New? Start here');
    // The tag is a visual nudge; the button's name stays "Tutorial" (and Start stays the only "Start").
    this.tutorialTag.setAttribute('aria-hidden', 'true');
    tutorial.prepend(this.tutorialTag);
    actions.append(this.hint, start, tutorial, menuButton('Practice range', 'secondary', onRange, true));
    this.setTutorialDone(tutorialDone);
    this.warning = el('p', 'menu-title-warning');
    this.warning.setAttribute('role', 'alert');
    this.warning.hidden = true;
    this.root.append(centre, this.warning, actions, el('p', 'menu-title-build', BUILD_LABEL));
  }

  /** A warning over the field, e.g. that the browser runs without hardware acceleration ('' hides it). */
  setWarning(text: string): void {
    this.warning.textContent = text;
    this.warning.hidden = text === '';
  }

  /** A short message over the buttons ('' hides it). */
  showHint(text: string): void {
    setHint(this.hint, text);
  }

  /** Once the tutorial has been played through, it stops calling for new players. */
  setTutorialDone(done: boolean): void {
    this.tutorialTag.hidden = done;
  }
}
