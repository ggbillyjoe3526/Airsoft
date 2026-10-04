import { closeButton, el, menuButton } from './menuParts';

/**
 * A pop-up that asks before a big or irreversible step (audit POOL-03: ten Shots, scrapping every spare). The keyboard
 * starts on Cancel, so a held Enter that opened it can't also confirm it; Esc, × or a click outside cancels.
 */
export class ConfirmDialog {
  readonly root: HTMLDialogElement;
  private readonly title: HTMLHeadingElement;
  private readonly text: HTMLParagraphElement;
  private readonly yes: HTMLButtonElement;
  private readonly no: HTMLButtonElement;
  private onYes: (() => void) | null = null;

  constructor() {
    this.root = el('dialog', 'menu-dialog confirm-dialog');
    this.title = el('h2', 'menu-dialog-title');
    this.text = el('p', 'confirm-text');
    const head = el('div', 'menu-dialog-head');
    head.append(this.title, closeButton('Cancel', () => this.close()));
    this.yes = menuButton('', 'primary', () => {
      const go = this.onYes;
      this.close();
      go?.();
    });
    this.no = menuButton('Cancel', 'secondary', () => this.close());
    for (const b of [this.yes, this.no]) noKeyRepeat(b);
    const actions = el('div', 'confirm-actions');
    actions.append(this.yes, this.no);
    this.root.append(head, this.text, actions);
    this.root.addEventListener('close', () => (this.onYes = null));
    this.root.addEventListener('click', (e) => {
      const r = this.root.getBoundingClientRect();
      if (e.target === this.root && (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom)) this.close();
    });
  }

  /** Asks `question`; `onConfirm` runs only if the player picks `confirm`. */
  ask(title: string, question: string, confirm: string, onConfirm: () => void): void {
    this.title.textContent = title;
    this.root.setAttribute('aria-label', title);
    this.text.textContent = question;
    this.yes.textContent = confirm;
    this.onYes = onConfirm;
    if (!this.root.open) this.root.showModal();
    this.no.focus();
  }

  close(): void {
    if (this.root.open) this.root.close();
  }
}

/**
 * A held key repeats keydown, and a button clicks on every repeated Enter or Space: a spend button ignores the repeats
 * (audit POOL-03), so holding Enter takes one Shot, not every Shot the FC cover.
 */
export function noKeyRepeat(button: HTMLButtonElement): HTMLButtonElement {
  button.addEventListener('keydown', (e) => {
    if (e.repeat) e.preventDefault();
  });
  return button;
}
