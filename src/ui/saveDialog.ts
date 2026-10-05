import { SAVE_TEXT } from '../config/save';
import { type SaveData, summarize } from '../save/saveFile';
import { closeButton, el, menuButton } from './menus/menuParts';

/** What the pop-up asks (M31): a load, restore or Undo (with the two saves side by side), or the delete. */
export interface SaveQuestion {
  title: string;
  /** The two saves to compare (this browser's first), or none (the delete). */
  compare?: { current: SaveData; incoming: SaveData; from: 'file' | 'restore' | 'undo' };
  /** Lines of text under it: the checksum warning, the delete's explanation, the reload note. */
  notes: readonly { text: string; warn?: boolean }[];
  confirmLabel: string;
  /** A button beside Cancel that does something without closing (Download first). */
  extra?: { label: string; onClick: () => void };
}

/**
 * The Save tab's pop-up (M31): asks before a save is replaced or deleted. `ask` resolves true on the confirm button and
 * false on Cancel, Esc, × or a click outside. One question at a time.
 */
export class SaveDialog {
  readonly root: HTMLDialogElement;
  private answer: ((yes: boolean) => void) | null = null;

  constructor() {
    this.root = el('dialog', 'menu-dialog save-dialog');
    this.root.addEventListener('close', () => this.settle(false));
    this.root.addEventListener('click', (e) => {
      const r = this.root.getBoundingClientRect();
      if (e.target === this.root && (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom)) this.root.close();
    });
  }

  ask(q: SaveQuestion, now: Date): Promise<boolean> {
    this.settle(false);
    this.root.replaceChildren();
    this.root.setAttribute('aria-label', q.title);
    const head = el('div', 'menu-dialog-head');
    head.append(el('h2', 'menu-dialog-title', q.title), closeButton('Close', () => this.root.close()));
    this.root.append(head);
    if (q.compare) this.root.append(compareTable(q.compare, now));
    for (const note of q.notes) this.root.append(el('p', note.warn ? 'save-dialog-note warn' : 'save-dialog-note', note.text));
    const actions = el('div', 'save-dialog-actions');
    const confirm = menuButton(q.confirmLabel, 'primary', () => {
      this.settle(true);
      this.root.close();
    });
    const cancel = menuButton(SAVE_TEXT.cancelButton, 'secondary', () => this.root.close());
    actions.append(confirm);
    if (q.extra) actions.append(menuButton(q.extra.label, 'secondary', q.extra.onClick));
    actions.append(cancel);
    this.root.append(actions);
    const answered = new Promise<boolean>((resolve) => (this.answer = resolve));
    if (!this.root.open) this.root.showModal();
    // The safe choice has the focus, so Enter alone never replaces a save.
    cancel.focus();
    return answered;
  }

  private settle(yes: boolean): void {
    const answer = this.answer;
    this.answer = null;
    answer?.(yes);
  }
}

/** This browser's save beside the other one: when, which version, FC, Tokens, items and matches. */
function compareTable(c: NonNullable<SaveQuestion['compare']>, now: Date): HTMLTableElement {
  const table = el('table', 'save-compare');
  const head = el('tr');
  head.append(el('th'), el('th', '', SAVE_TEXT.current), el('th', '', SAVE_TEXT.incoming(c.from)));
  table.append(head);
  const a = summarize(c.current.stores);
  const b = summarize(c.incoming.stores);
  const t = SAVE_TEXT.compare;
  const rows: [string, string, string][] = [
    [t.savedAt, savedAtText(c.current.savedAt, now), savedAtText(c.incoming.savedAt, now)],
    [t.build, c.current.build, c.incoming.build || '?'],
    [t.fc, String(a.fc), String(b.fc)],
    [t.tokens, String(a.tokens), String(b.tokens)],
    [t.items, String(a.items), String(b.items)],
    [t.matches, String(a.matches), String(b.matches)],
  ];
  for (const [label, left, right] of rows) {
    const tr = el('tr');
    tr.append(el('th', '', label), el('td', '', left), el('td', '', right));
    table.append(tr);
  }
  return table;
}

/** A save's moment for the comparison ("4 Oct 2026, 16:40"), '?' when unknown. */
function savedAtText(iso: string, now: Date): string {
  const d = new Date(iso);
  if (!iso || Number.isNaN(d.getTime())) return '?';
  const sameYear = d.getFullYear() === now.getFullYear();
  return d.toLocaleString(undefined, { day: 'numeric', month: 'short', year: sameYear ? undefined : 'numeric', hour: '2-digit', minute: '2-digit' });
}
