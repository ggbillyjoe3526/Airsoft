import { SAVE_TEXT } from '../config/save';
import { el, menuButton } from './menus/menuParts';

/**
 * Over everything while another tab of the game has the save (M31, save/tabLock.ts): why this tab is waiting, and
 * Play here, which moves the game to this tab. Styled as the crash pane, a menu screen's look.
 */
export class OtherTabNotice {
  private readonly root: HTMLDivElement;

  constructor(parent: HTMLElement, onPlayHere: () => void) {
    this.root = el('div', 'crash-screen other-tab-notice');
    this.root.setAttribute('role', 'alertdialog');
    this.root.setAttribute('aria-modal', 'true');
    const panel = el('div', 'crash-panel');
    const heading = el('h1', 'menu-heading', SAVE_TEXT.otherTabTitle);
    heading.id = 'other-tab-heading';
    this.root.setAttribute('aria-labelledby', heading.id);
    const button = menuButton(SAVE_TEXT.otherTabButton, 'primary', () => {
      button.disabled = true;
      onPlayHere();
    }, true);
    const actions = el('div', 'crash-actions');
    actions.append(button);
    panel.append(heading, el('p', 'crash-body', SAVE_TEXT.otherTabBody), actions);
    this.root.append(panel);
    parent.appendChild(this.root);
    button.focus();
  }

  dispose(): void {
    this.root.remove();
  }
}
