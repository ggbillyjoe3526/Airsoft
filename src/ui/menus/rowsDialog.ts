import { closeButton, el } from './menuParts';

/**
 * A pop-up holding a few settings rows (New game's Match and Difficulty, M20): each row saves and reports its own change
 * as it is made, so the pop-up only opens and closes. Esc, × or a click outside closes it.
 */
export class RowsDialog {
  readonly root: HTMLDialogElement;
  private readonly body: HTMLDivElement;

  constructor(title: string, rows: readonly HTMLElement[]) {
    this.root = el('dialog', 'menu-dialog rows-dialog');
    this.root.setAttribute('aria-label', title);
    const head = el('div', 'menu-dialog-head');
    head.append(el('h2', 'menu-dialog-title', title), closeButton('Close', () => this.close()));
    this.body = el('div', 'rows-dialog-body');
    this.body.append(...rows);
    this.root.append(head, this.body);
    this.root.addEventListener('click', (e) => {
      const r = this.root.getBoundingClientRect();
      if (e.target === this.root && (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom)) this.close();
    });
  }

  /** Opens it with the keyboard on the first row's picked option (or its first control). */
  open(): void {
    if (!this.root.open) this.root.showModal();
    (this.body.querySelector<HTMLElement>('.picker-button.selected') ?? this.body.querySelector<HTMLElement>('button, input'))?.focus();
  }

  close(): void {
    if (this.root.open) this.root.close();
  }
}
