import { DEFAULT_DIFFICULTY, DIFFICULTIES, type Difficulty } from '../config/bots';

const DIFFICULTY_KEY = 'airsoft.difficulty';

/** The saved difficulty, or the default if nothing valid is saved (or storage is blocked). */
export function loadDifficulty(): Difficulty {
  try {
    const raw = localStorage.getItem(DIFFICULTY_KEY);
    const found = DIFFICULTIES.find((d) => d.id === raw);
    if (found) return found.id;
  } catch {
    // Storage unavailable (private mode etc.): fall back to the default.
  }
  return DEFAULT_DIFFICULTY;
}

function saveDifficulty(d: Difficulty): void {
  try {
    localStorage.setItem(DIFFICULTY_KEY, d);
  } catch {
    // Non-critical: the choice still applies for this session.
  }
}

/**
 * Bot difficulty: one button per level and a line describing the chosen one (plus an optional note,
 * e.g. that a change made mid-match starts with the next round). Saved in the browser. Lives inside
 * the start screen.
 */
export class DifficultyPicker {
  readonly root: HTMLDivElement;
  private readonly buttons = new Map<Difficulty, HTMLButtonElement>();
  private readonly blurb: HTMLParagraphElement;
  private current: Difficulty;
  private note = '';

  /** `initial`: the level shown as picked (normally loadDifficulty()). */
  constructor(initial: Difficulty, onChange: (d: Difficulty) => void) {
    this.current = initial;
    this.root = document.createElement('div');
    this.root.className = 'difficulty';
    const row = document.createElement('div');
    row.className = 'difficulty-row';
    row.setAttribute('role', 'group');
    row.setAttribute('aria-label', 'Bot difficulty');
    const label = document.createElement('span');
    label.className = 'difficulty-label';
    label.textContent = 'Bots';
    row.appendChild(label);
    for (const { id, label: text } of DIFFICULTIES) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'difficulty-button';
      button.textContent = text;
      button.addEventListener('click', () => {
        if (id === this.current) return;
        this.current = id;
        saveDifficulty(id);
        this.note = '';
        onChange(id);
        this.refresh();
      });
      row.appendChild(button);
      this.buttons.set(id, button);
    }
    this.blurb = document.createElement('p');
    this.blurb.className = 'difficulty-blurb';
    this.root.append(row, this.blurb);
    this.refresh();
  }

  /** A short note after the level's description (empty to clear). */
  setNote(text: string): void {
    this.note = text;
    this.refresh();
  }

  private refresh(): void {
    for (const [id, button] of this.buttons) {
      const on = id === this.current;
      button.classList.toggle('selected', on);
      button.setAttribute('aria-pressed', String(on));
    }
    const blurb = DIFFICULTIES.find((d) => d.id === this.current)?.blurb ?? '';
    this.blurb.textContent = this.note ? `${blurb} ${this.note}` : blurb;
  }
}
