import { MAG_SHARE } from '../config/magShare';

/** One of the Mag prompt's lines (config/magShare.ts MAG_SHARE.words). */
export type MagWords = keyof typeof MAG_SHARE.words;

/** What the Mag prompt shows this frame (src/magHandoff.ts MagHandoff.frame), reused frame to frame. */
export interface MagView {
  /** The line under the crosshair ('' none). */
  line: string;
  /** The line is a toss the Mag key makes now. */
  toss: boolean;
  /** The wheel's Mag item: Need a Mag, or Toss a Mag while a toss is in reach. */
  wheel: string;
  /** The teammates whose name tags show the mag tag (asking you, or bringing you one), by character id. */
  mates: number[];
}

/** What a line fills in: the teammate's name, the Mag key's, a distance in metres and how many BBs came. */
export interface MagFills {
  name?: string;
  key?: string;
  m?: number;
  bbs?: number;
}

/**
 * The Mag prompt's line `words` with its fills put in (MG1): "H · Toss Dash a mag", "Dash needs a mag · 12 m". With the
 * Mag key unbound, the toss and ask lines name the order wheel instead.
 */
export function magLine(words: MagWords, fills: MagFills = {}): string {
  const unbound = fills.key === '';
  const which: MagWords = unbound && words === 'toss' ? 'tossWheel' : unbound && words === 'ask' ? 'askWheel' : words;
  return MAG_SHARE.words[which]
    .replace('{name}', fills.name ?? '')
    .replace('{key}', fills.key ?? '')
    .replace('{m}', String(Math.max(0, Math.round(fills.m ?? 0))))
    .replace('{bbs}', String(fills.bbs ?? 0));
}

/**
 * The magazine hand-off's line under the crosshair (MG1, src/magHandoff.ts says what): a toss you can make now in the
 * team's colour, the rest plain. Under the vault prompt's place, in the HUD's size and panels; hidden with
 * Settings › HUD › Mag hand-off off, or with play stopped. Touches the page only when what it shows changes.
 */
export class MagPrompt {
  private readonly root: HTMLDivElement;
  private line = '';
  private toss = false;
  private shown = true;

  constructor(parent: HTMLElement, team: string) {
    this.root = document.createElement('div');
    this.root.className = 'mag-prompt';
    this.root.hidden = true;
    this.root.style.setProperty('--team', team);
    parent.appendChild(this.root);
  }

  /** Settings › HUD › Mag hand-off: false keeps the prompt hidden (the hand-off itself goes on). */
  setShown(on: boolean): void {
    this.shown = on;
    if (!on) this.show('', false);
  }

  get enabled(): boolean {
    return this.shown;
  }

  /** Once a frame: the line ('' none), and whether it is a toss a key press makes now. */
  show(line: string, toss: boolean): void {
    const text = this.shown ? line : '';
    if (text !== this.line) {
      if (text !== '') this.root.textContent = text;
      this.root.hidden = text === '';
      this.line = text;
    }
    if (toss !== this.toss) this.root.classList.toggle('toss', (this.toss = toss));
  }

  dispose(): void {
    this.root.remove();
  }
}
