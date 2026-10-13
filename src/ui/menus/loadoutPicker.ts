import { SAVED_TEXT } from '../../config/savedLoadouts';
import type { SavedLoadouts, SavedLoadoutView } from '../../pool/savedLoadouts';
import { type ContextChoice, ContextMenu } from './contextMenu';
import { el } from './menuParts';

const CARET = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg>';

/** A saved loadout's second line: the replicas it carries, and how many of its picks are locked now. */
export function carriesLine(view: SavedLoadoutView): string {
  const carries = SAVED_TEXT.carries(view.replicas.flatMap((a) => (a ? [a.name] : [])));
  return view.missing.length > 0 ? `${carries} · ${SAVED_TEXT.locked(view.missing.length)}` : carries;
}

/**
 * The Match screen's pick of a saved loadout (SL1; the roadmap's "picked from the Map pop-up", now the Match screen's
 * Your match): a button naming the loadout carried, which opens the saved ones as a list (the shared ContextMenu, so it
 * closes and moves with the keyboard as the Armory's does) and, last, the way to the Loadout to manage them. A pick
 * switches at once, as a tab on the Loadout does.
 */
export class LoadoutPicker {
  readonly root: HTMLButtonElement;
  /** The list: the screen puts it in its page (it is fixed in the window). */
  readonly menu = new ContextMenu();
  private readonly name: HTMLSpanElement;

  constructor(
    private readonly saved: SavedLoadouts,
    /** A saved loadout was picked: it is carried now. */
    private readonly onPick: () => void,
    private readonly onManage: () => void,
  ) {
    this.root = el('button', 'loadout-pick');
    this.root.type = 'button';
    this.root.setAttribute('aria-haspopup', 'true');
    this.name = el('span', 'loadout-pick-name');
    this.root.append(this.name);
    this.root.insertAdjacentHTML('beforeend', CARET);
    this.root.addEventListener('click', () => this.open());
    this.root.addEventListener('keydown', (e) => {
      if (e.key !== 'ArrowDown') return;
      e.preventDefault();
      this.open();
    });
  }

  /** Names the loadout carried (marked when some of its gear is locked now). */
  update(): void {
    const view = this.saved.view(this.saved.current());
    const name = view?.name ?? '';
    if (this.name.textContent !== name) this.name.textContent = name;
    this.root.classList.toggle('has-locked', (view?.missing.length ?? 0) > 0);
    this.root.title = view ? carriesLine(view) : '';
    this.root.setAttribute('aria-label', SAVED_TEXT.pickName(name));
  }

  private open(): void {
    const choices: ContextChoice[] = this.saved.views().flatMap((v) =>
      v
        ? [
            {
              label: v.name,
              detail: carriesLine(v),
              current: v.current,
              name: `${v.name}: ${carriesLine(v)}${v.current ? `, ${SAVED_TEXT.current}` : ''}`,
              run: () => {
                if (this.saved.use(v.slot)) this.onPick();
              },
            },
          ]
        : [],
    );
    choices.push({ label: SAVED_TEXT.manage, run: this.onManage });
    const box = this.root.getBoundingClientRect();
    this.menu.open(SAVED_TEXT.pickTitle, choices, box.left, box.bottom + 4, this.root, [box]);
  }
}
