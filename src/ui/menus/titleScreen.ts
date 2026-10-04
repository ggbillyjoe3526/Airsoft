import { BUILD_LABEL } from '../../config/menus';
import { el, menuButton, wordmark } from './menuParts';

/** The first thing a player sees: "AIRSOFT." in the middle over the field, Start at the bottom left. */
export class TitleScreen {
  readonly root: HTMLDivElement;
  private readonly warning: HTMLParagraphElement;

  constructor(onStart: () => void) {
    this.root = el('div', 'menu-screen menu-title');
    this.root.hidden = true;
    const centre = el('div', 'menu-title-centre');
    centre.append(wordmark('menu-title-wordmark', 'h1'), el('p', 'menu-title-tagline', "One BB, you're hit. Call it, walk off, go again."));
    const start = menuButton('Start', 'primary', onStart, true);
    start.classList.add('menu-title-start');
    start.dataset.autofocus = '';
    this.warning = el('p', 'menu-title-warning');
    this.warning.setAttribute('role', 'alert');
    this.warning.hidden = true;
    this.root.append(centre, this.warning, start, el('p', 'menu-title-build', BUILD_LABEL));
  }

  /** A warning over the field, e.g. that the browser runs without hardware acceleration ('' hides it). */
  setWarning(text: string): void {
    this.warning.textContent = text;
    this.warning.hidden = text === '';
  }
}
