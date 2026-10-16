import type { Bot, BotMode, RunRole } from '../ai/bot';

/**
 * Dev settings › Bot intentions (M90): a small label over each bot in play saying what its brain is doing, read from
 * its plain state (`Bot.mode` and the flags under it), never written back. Presentation only: MatchPresentation
 * projects the positions; the DOM is touched only when a label's place or words change, with no string made per move.
 */

/** What each brain mode reads as. Advancing has finer words from the bot's flags (botIntentText). */
const MODE_TEXT: Readonly<Record<BotMode, string>> = {
  advance: 'Advancing',
  fight: 'Fighting',
  cover: 'Taking cover',
  search: 'Searching',
  flag: 'Working the flag',
  order: 'Following an order',
  mag: 'Mag hand-off',
};

/** Extraction's jobs (M46), said before what the bot is doing; nothing for 'none' (the other modes, the squad). */
const ROLE_TEXT: Readonly<Record<RunRole, string>> = { none: '', guard: 'Guard', patrol: 'Patrol', hunter: 'Hunter' };

/** What the bot is doing, in a word or two ("Holding", "Fighting"). Pure; the same strings every time (no allocation). */
export function botIntentText(bot: Readonly<Bot>): string {
  if (bot.mode !== 'advance') return MODE_TEXT[bot.mode];
  if (bot.holding) return 'Holding';
  if (bot.waitForTeam) return 'Waiting for the team';
  if (bot.retake) return 'Retaking';
  if (bot.hunting) return 'Hunting';
  return MODE_TEXT.advance;
}

/** The bot's Extraction job, or '' outside Extraction. */
export function botRoleText(bot: Readonly<Bot>): string {
  return ROLE_TEXT[bot.role];
}

/** The pixel offsets' CSS texts, each made the first time it is needed (KI1: no string made per move after that). */
const PX_FROM = -2048;
const PX_TO = 8192;
const pxTexts: string[] = [];

/** `n` pixels as CSS ("12px"): kept for every on-screen value, so moving a label allocates nothing once warm. */
export function pxText(n: number): string {
  if (n < PX_FROM || n >= PX_TO) return `${n}px`;
  return (pxTexts[n - PX_FROM] ??= `${n}px`);
}

interface Label {
  root: HTMLDivElement;
  role: HTMLSpanElement;
  text: HTMLSpanElement;
  x: number;
  y: number;
  visible: boolean;
  shownRole: string;
  shownText: string;
}

/** The labels, one per bot, made the first time each is needed and kept for the match. */
export class BotIntentLabels {
  private readonly labels: Label[] = [];

  constructor(private readonly parent: HTMLElement) {}

  /** Label `i` at (x, y) pixels (its foot, just over the head), saying `role` (may be '') and `text`. */
  show(i: number, x: number, y: number, role: string, text: string): void {
    const l = this.labels[i] ?? this.make(i);
    if (!l.visible) l.root.hidden = !(l.visible = true);
    const rx = Math.round(x);
    const ry = Math.round(y);
    if (rx !== l.x || ry !== l.y) {
      l.x = rx;
      l.y = ry;
      // Two custom properties the style sheet's transform reads, each a kept string: nothing made per move (KI1).
      l.root.style.setProperty('--x', pxText(rx));
      l.root.style.setProperty('--y', pxText(ry));
    }
    if (role !== l.shownRole) {
      l.role.textContent = l.shownRole = role;
      l.role.hidden = role === '';
    }
    if (text !== l.shownText) l.text.textContent = l.shownText = text;
  }

  hide(i: number): void {
    const l = this.labels[i];
    if (l?.visible) l.root.hidden = !(l.visible = false);
  }

  /** Hides every label from `from` on (all of them by default). */
  hideFrom(from = 0): void {
    for (let i = from; i < this.labels.length; i++) this.hide(i);
  }

  dispose(): void {
    for (const l of this.labels) l.root.remove();
    this.labels.length = 0;
  }

  private make(i: number): Label {
    const root = document.createElement('div');
    root.className = 'bot-intent';
    root.hidden = true;
    root.setAttribute('aria-hidden', 'true');
    const role = document.createElement('span');
    role.className = 'bot-intent-role';
    role.hidden = true;
    const text = document.createElement('span');
    root.append(role, text);
    this.parent.appendChild(root);
    const l: Label = { root, role, text, x: Number.NaN, y: Number.NaN, visible: false, shownRole: '', shownText: '' };
    this.labels[i] = l;
    return l;
  }
}
