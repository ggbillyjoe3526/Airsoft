import { HUD_TEXT } from '../config/hudText';
import type { RoundState } from '../sim/round';

/** How a round (or the match) ended for you: the stamp's word, its tone and the line under it. */
export interface RoundResultWords {
  word: string;
  tone: 'won' | 'lost' | 'draw';
  caption: string;
}

/**
 * The words of the stamp at a round's end (Dev 6 playtest item 33), from your side: Won, Lost or Draw with the round
 * under it, or Won or Lost with "Match" once the match is decided. Null while the round is live, and in Extraction,
 * whose run has no rounds to win (its banner says how the run ended).
 */
export function roundResultWords(r: Readonly<RoundState>, playerTeam: number): RoundResultWords | null {
  if (r.mode === 'extraction') return null;
  const text = HUD_TEXT.result;
  if (r.phase === 'matchOver') {
    const won = r.matchWinner === playerTeam;
    return { word: won ? text.won : text.lost, tone: won ? 'won' : 'lost', caption: text.match };
  }
  if (r.phase !== 'over') return null;
  const caption = text.round(r.number);
  if (r.winner !== 0 && r.winner !== 1) return { word: text.draw, tone: 'draw', caption };
  const won = r.winner === playerTeam;
  return { word: won ? text.won : text.lost, tone: won ? 'won' : 'lost', caption };
}

/**
 * The stamp at a round's end (Dev 6 playtest item 33): WON, LOST or DRAW large over the field for a moment
 * (HUD.roundResultTime, set by MatchPresentation), with the round under it and, from HUD.roundResultContinueAfter, a
 * small line saying a click moves on (to the next round, or the results; the round's table carries that line after
 * the stamp). No panel behind the word, so the field stays in view; a screen reader hears the round banner's result
 * instead, so the stamp is hidden from it. The DOM is touched only on a change.
 */
export class RoundResult {
  private readonly stamp: HTMLDivElement;
  private readonly word: HTMLElement;
  private readonly caption: HTMLElement;
  private readonly hint: HTMLSpanElement;
  private shownWord: RoundResultWords | null = null;
  private shownHint = '';
  private visible = true;
  /** Whether the words held have been on screen yet (their settle-in played). */
  private played = false;

  constructor(parent: HTMLElement) {
    this.stamp = document.createElement('div');
    this.stamp.className = 'round-result';
    this.stamp.hidden = true;
    this.stamp.setAttribute('aria-hidden', 'true');
    this.word = document.createElement('b');
    this.word.className = 'round-result-word';
    this.caption = document.createElement('span');
    this.caption.className = 'round-result-caption';
    this.hint = document.createElement('span');
    this.hint.className = 'round-result-hint';
    this.hint.hidden = true;
    this.stamp.append(this.word, this.caption, this.hint);
    parent.append(this.stamp);
  }

  /** The stamp's words, or null to take it away. */
  setWords(words: RoundResultWords | null): void {
    const s = this.shownWord;
    if (s === words || (s && words && s.word === words.word && s.tone === words.tone && s.caption === words.caption)) return;
    this.shownWord = words;
    this.stamp.hidden = !this.visible || words === null;
    if (!words) return;
    // New words settle in again; the same words back after a pause don't (bug pass BP6a).
    this.stamp.classList.remove('settled');
    this.played = this.visible;
    this.word.textContent = words.word;
    this.caption.textContent = words.caption;
    this.stamp.setAttribute('data-tone', words.tone);
  }

  /** The line saying a click moves on, or '' for none. */
  setHint(text: string): void {
    if (text === this.shownHint) return;
    this.shownHint = text;
    this.hint.textContent = text;
    this.hint.hidden = text === '';
  }

  /** Off with the rest of the HUD (a menu up); what it shows comes back with it. */
  setVisible(visible: boolean): void {
    if (visible === this.visible) return;
    this.visible = visible;
    this.stamp.hidden = !visible || this.shownWord === null;
    if (!visible || !this.shownWord) return;
    // Words already seen come back as they were; words set while hidden settle in now.
    if (this.played) this.stamp.classList.add('settled');
    this.played = true;
  }

  clear(): void {
    this.setWords(null);
    this.setHint('');
  }

  dispose(): void {
    this.stamp.remove();
  }
}
