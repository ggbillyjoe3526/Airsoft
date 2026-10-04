import { HIT_FEED } from '../config/matchInfo';
import { teamCss } from '../config/teams';

/** Someone in a hit feed line: their name (which carries the team, or is "You") and team. */
export interface FeedName {
  name: string;
  team: number;
}

interface Line {
  node: HTMLDivElement;
  /** Simulation time the line goes away, and whether it has started fading. */
  until: number;
  fading: boolean;
}

/**
 * The hit feed in the top-right corner, in airsoft words: "Orange 2 called HIT · Blue 1" (who called the hit, then
 * whose BB it was), newest at the top. Friendly hits say so. Each name is in its team's colour and its text carries
 * the team as well, so colour isn't the only cue. Lines live on simulation time, so a pause holds them.
 */
export class HitFeed {
  private readonly root: HTMLDivElement;
  private readonly lines: Line[] = [];

  constructor(parent: HTMLElement) {
    this.root = document.createElement('div');
    this.root.className = 'hit-feed';
    this.root.hidden = true;
    this.root.setAttribute('aria-live', 'polite');
    this.root.style.setProperty('--feed-fade', `${HIT_FEED.fadeTime}s`);
    parent.appendChild(this.root);
  }

  setVisible(visible: boolean): void {
    this.root.hidden = !visible;
  }

  /**
   * `victim` called a hit from `shooter`'s BB, at simulation time `time`. `you`: the line involves you. `ricochet`: the
   * BB had bounced first (in a match where ricochets count, M20).
   */
  add(victim: FeedName, shooter: FeedName, friendly: boolean, you: boolean, time: number, ricochet = false): void {
    const node = document.createElement('div');
    node.className = `hit-feed-line${you ? ' you' : ''}${friendly ? ' friendly' : ''}`;
    node.append(name(victim), document.createTextNode(' called HIT · '), name(shooter));
    for (const [on, text] of [
      [friendly, 'friendly'],
      [ricochet, 'ricochet'],
    ] as const) {
      if (!on) continue;
      const tag = document.createElement('em');
      tag.textContent = text;
      node.append(tag);
    }
    this.root.prepend(node);
    this.lines.unshift({ node, until: time + HIT_FEED.lineTime, fading: false });
    while (this.lines.length > HIT_FEED.maxLines) this.lines.pop()!.node.remove();
  }

  /** Once per frame with the simulation time: fades lines near their end and drops expired ones. */
  update(time: number): void {
    for (let i = this.lines.length - 1; i >= 0; i--) {
      const line = this.lines[i]!;
      if (time >= line.until) {
        line.node.remove();
        this.lines.splice(i, 1);
      } else if (!line.fading && time >= line.until - HIT_FEED.fadeTime) {
        line.fading = true;
        line.node.classList.add('fading');
      }
    }
  }

  clear(): void {
    for (const line of this.lines) line.node.remove();
    this.lines.length = 0;
  }

  dispose(): void {
    this.root.remove();
  }
}

function name(n: FeedName): HTMLSpanElement {
  const span = document.createElement('span');
  span.className = 'hit-feed-name';
  span.style.setProperty('--team', teamCss(n.team));
  span.textContent = n.name;
  return span;
}
