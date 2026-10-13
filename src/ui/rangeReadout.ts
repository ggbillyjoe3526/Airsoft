import { RANGE_CHALLENGE, RANGE_VISUALS } from '../config/range';
import type { ChallengeCue, RangeChallenge } from '../sim/rangeChallenge';

/** Before your first shot (M94: the range renamed Practice). */
const RANGE_INTRO = 'Practice · spare magazines refill · Esc for the Loadout';

/** What the practice range's readout shows about your last BB (M21). */
export interface LastShot {
  /** How far downrange of the firing line it landed (m), as the markers count; on a map (M94), how far from you. */
  distance: number;
  /** The target it hit ("Steel", "Figure" …) and that target's marked distance (on a map, how far from you), or null for a miss. */
  target: { label: string; distance: number } | null;
  /** It left the range (over a wall or the backstop; on a map, off its edge) without landing anywhere. */
  lost?: boolean;
}

/** "Last BB: 31 m · hit Steel 30 m", "Last BB: 44 m · miss" or that it flew out; before the first shot, how the range works. */
export function lastShotText(shot: LastShot | null): string {
  if (!shot) return RANGE_INTRO;
  if (shot.lost) return 'Last BB: flew out of bounds · aim lower or turn the hop-up down';
  const d = `${Math.round(shot.distance)} m`;
  return shot.target ? `Last BB: ${d} · hit ${shot.target.label} ${shot.target.distance} m` : `Last BB: ${d} · miss`;
}

/**
 * The practice range's readout (M21), top centre: where your last BB landed, and which target it hit. The same
 * text as before is never written twice, so it costs nothing per frame.
 */
export class RangeReadout {
  private readonly root: HTMLDivElement;
  private shown = '';

  constructor(parent: HTMLElement) {
    this.root = document.createElement('div');
    this.root.className = 'range-readout';
    this.root.hidden = true;
    parent.appendChild(this.root);
  }

  setVisible(visible: boolean): void {
    this.root.hidden = !visible;
  }

  set(text: string): void {
    if (text === this.shown) return;
    this.shown = text;
    this.root.textContent = text;
  }

  dispose(): void {
    this.root.remove();
  }
}

/** "1:00", "0:42": the minutes and seconds left, counted up to the next whole second. */
export function clockText(seconds: number): string {
  const s = Math.max(0, Math.ceil(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/** "1 hit", "12 hits". */
function hitsText(n: number): string {
  return `${n} hit${n === 1 ? '' : 's'}`;
}

/**
 * The readout's line while the timed challenge is on (M93), in place of the last BB's: what to do, the run under way
 * (time left, hits, the best), or the last run's score until the next starts. '' when it is off. `onMap` (M94): Practice
 * on a map, where a target lights only once you can see it, so the run is played moving up through the map.
 */
export function challengeText(c: RangeChallenge, onMap = false): string {
  const best = c.best > 0 ? `best ${c.best}` : 'no best yet';
  switch (c.phase) {
    case 'off':
      return '';
    case 'ready': {
      const last = c.last;
      if (!last) return onMap ? `Timed challenge · shoot START, then move up: targets light orange as you see them · ${best}` : `Timed challenge · shoot the START plate to begin · ${best}`;
      const accuracy = last.shots > 0 ? ` · ${Math.round((100 * last.hits) / last.shots)} % accuracy` : '';
      return `Time! ${hitsText(last.hits)}${accuracy} · ${last.best ? 'new best!' : best} · shoot START to go again`;
    }
    case 'countdown':
      return onMap ? `Timed challenge · move up: targets light orange as you see them · ${best}` : `Timed challenge · hit the orange targets · ${best}`;
    case 'running':
      return `${clockText(c.clock)} · ${hitsText(c.hits)} · ${best}`;
  }
}

/** The countdown's words, "1" to "3", made once. */
const COUNT = Array.from({ length: RANGE_CHALLENGE.countdown }, (_, i) => String(i + 1));

/**
 * The timed challenge's big word over the middle of the screen (M93), clear of the crosshair: the countdown's seconds,
 * "Go!" as the run starts and "Time!" (or "New best!") as it ends, each for a moment (RANGE_VISUALS.banner). The same
 * text is never written twice, so it costs nothing per frame.
 */
export class ChallengeBanner {
  private readonly root: HTMLDivElement;
  private shown = '';
  /** The word a cue put up, and how much longer it stays (s). */
  private word = '';
  private left = 0;

  constructor(parent: HTMLElement) {
    this.root = document.createElement('div');
    this.root.className = 'range-challenge';
    this.root.hidden = true;
    parent.appendChild(this.root);
  }

  /** A cue from the challenge's tick: the start and the end put their word up for a moment. */
  cue(cue: ChallengeCue, c: RangeChallenge): void {
    if (cue === 'go') this.say('Go!', RANGE_VISUALS.banner.go);
    else if (cue === 'time') this.say(c.last?.best ? 'New best!' : 'Time!', RANGE_VISUALS.banner.time);
  }

  /** Once per frame: the countdown's second, or the word a cue put up while it lasts. */
  frame(dt: number, c: RangeChallenge, visible: boolean): void {
    this.left = Math.max(0, this.left - dt);
    if (c.phase === 'off') this.left = 0;
    const text = c.phase === 'countdown' ? (COUNT[Math.max(1, Math.ceil(c.clock)) - 1] ?? '') : this.left > 0 ? this.word : '';
    const hidden = !visible || text === '';
    if (hidden !== this.root.hidden) this.root.hidden = hidden;
    if (text === this.shown) return;
    this.shown = text;
    this.root.textContent = text;
  }

  dispose(): void {
    this.root.remove();
  }

  private say(word: string, seconds: number): void {
    this.word = word;
    this.left = seconds;
  }
}
