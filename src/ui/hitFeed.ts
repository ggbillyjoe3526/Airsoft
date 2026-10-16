import { CALLOUTS } from '../config/callouts';
import { type FeedCorner, HIT_FEED, type HitFeedMode } from '../config/matchInfo';
import { teamCss } from '../config/teams';
import { FEED_ICONS } from './menus/icons';

/** Someone in a hit feed line: their name (which carries the team, or is "You") and team. */
export interface FeedName {
  name: string;
  team: number;
}

interface Line {
  node: HTMLDivElement;
  /** A hit, or a teammate's callout (CL1): each has its own time on screen, and Keep holds only hits. */
  callout: boolean;
  /** Simulation time the line came in, and whether it has started fading. */
  at: number;
  fading: boolean;
}

/**
 * The match feed (one feed since Dev 6 playtest item 32: the hit feed and the callout feed merged), top right by default
 * or bottom left (Settings → HUD → Feed position). A navy row per hit (G4 look) with whose BB it was, a BB, who called
 * the hit and a Hit tag, and a row per teammate's callout with the caller's name and what they said ("Rook  Contact,
 * Dock!"). A screen reader hears a hit in airsoft words, "Beta 2 called HIT · Alpha 1", and a callout as "Rook: Contact,
 * Dock!". Friendly hits say so. Each name is in its team's colour and its text carries the team as well, so colour isn't
 * the only cue; your own hit rows are edged in acid.
 * The friendly and ricochet tags carry a glyph beside the word. Lines live on simulation time, so a pause holds them.
 * Set to Keep (Settings → HUD, M24), the match's last few hits stay up instead, through every round; callouts still go.
 * The newest line is first in the DOM; the stylesheet stacks it on top in the top-right corner and at the bottom in the
 * bottom-left one.
 */
export class HitFeed {
  private readonly root: HTMLDivElement;
  private readonly lines: Line[] = [];
  private keep = false;
  private corner: FeedCorner | null = null;
  private covered = false;
  /** Simulation time at the last update, so lines kept until now start their fade from it when Keep goes. */
  private now = 0;

  constructor(parent: HTMLElement, corner: FeedCorner = 'topRight') {
    this.root = document.createElement('div');
    this.root.className = 'hit-feed';
    this.root.hidden = true;
    this.root.setAttribute('aria-live', 'polite');
    this.root.style.setProperty('--feed-fade', `${HIT_FEED.fadeTime}s`);
    this.root.style.setProperty('--callout-fade', `${CALLOUTS.fadeTime}s`);
    this.setCorner(corner);
    parent.appendChild(this.root);
  }

  setVisible(visible: boolean): void {
    this.root.hidden = !visible;
  }

  /** Settings → HUD → Feed position: top right (newest on top) or bottom left (newest at the bottom). */
  setCorner(corner: FeedCorner): void {
    if (corner === this.corner) return;
    this.corner = corner;
    this.root.classList.toggle('bottom-left', corner === 'bottomLeft');
    this.applyCover();
  }

  /**
   * While the scoreboard is up (between rounds, or Tab held) the feed steps out of sight in the bottom-left corner, as
   * the callout feed did there (BP5: in a small window the round's table covered its lines half-way); top right it
   * stays, clear of the table. Its lines keep their time meanwhile.
   */
  setCovered(covered: boolean): void {
    if (covered === this.covered) return;
    this.covered = covered;
    this.applyCover();
  }

  private applyCover(): void {
    this.root.classList.toggle('covered', this.covered && this.corner === 'bottomLeft');
  }

  /** Fade (lines go after a few seconds) or Keep (the last few hits stay for the match). */
  setMode(mode: HitFeedMode): void {
    // Lines kept until now don't all vanish at once when Keep goes: each gets its full time from here.
    if (this.keep && mode === 'fade') for (const line of this.lines) if (!line.callout) line.at = this.now;
    this.keep = mode === 'keep';
    this.trim();
  }

  /**
   * A round started: the feed starts empty, unless it keeps hits, which go only with the match (its round 1). A round's
   * callouts never carry over.
   */
  roundStarted(round: number): void {
    if (!this.keep || round <= 1) this.clear();
    else this.clearCallouts();
  }

  /**
   * `victim` called a hit from `shooter`'s BB, at simulation time `time`. `you`: the line involves you. `ricochet`: the
   * BB had bounced first (in a match where ricochets count, M20).
   */
  add(victim: FeedName, shooter: FeedName, friendly: boolean, you: boolean, time: number, ricochet = false): void {
    const node = document.createElement('div');
    node.className = `hit-feed-line${you ? ' you' : ''}${friendly ? ' friendly' : ''}`;
    node.style.setProperty('--hitter', teamCss(shooter.team));
    // Seen as the concept draws it (G4): the shooter, a BB, who called it, and a Hit tag. Heard as the airsoft sentence,
    // "Beta 2 called HIT · Alpha 1", which the row's look leaves out of the accessibility tree.
    const said = document.createElement('span');
    said.className = 'sr-only';
    said.textContent = `${victim.name} called HIT · ${shooter.name}`;
    const seen = document.createElement('span');
    seen.className = 'hit-feed-row';
    seen.setAttribute('aria-hidden', 'true');
    const bb = document.createElement('i');
    bb.className = 'hit-feed-bb';
    bb.innerHTML = FEED_ICONS.bb;
    const tag = document.createElement('b');
    tag.className = 'hit-feed-tag';
    tag.textContent = HIT_FEED.tag;
    seen.append(name(shooter), bb, name(victim), tag);
    node.append(said, seen);
    for (const [on, text] of [
      [friendly, 'friendly'],
      [ricochet, 'ricochet'],
    ] as const) {
      if (!on) continue;
      const tag = document.createElement('em');
      tag.textContent = text;
      tag.insertAdjacentHTML('afterbegin', FEED_ICONS[text]);
      node.append(tag);
    }
    this.push(node, false, time);
  }

  /** A teammate's callout (CL1): `caller` (on `team`) said `text`, at simulation time `time`. */
  addCallout(caller: string, team: number, text: string, time: number): void {
    const node = document.createElement('div');
    node.className = 'hit-feed-line callout';
    node.style.setProperty('--hitter', teamCss(team));
    const who = document.createElement('b');
    who.className = 'hit-feed-name';
    who.style.setProperty('--team', teamCss(team));
    who.textContent = caller;
    // The colon is for a screen reader: the row's look is the name's colour and the gap.
    const colon = document.createElement('span');
    colon.className = 'sr-only';
    colon.textContent = ':';
    const said = document.createElement('span');
    said.className = 'hit-feed-said';
    said.textContent = ` ${text}`;
    node.append(who, colon, said);
    this.push(node, true, time);
  }

  private push(node: HTMLDivElement, callout: boolean, time: number): void {
    this.root.prepend(node);
    this.lines.unshift({ node, callout, at: time, fading: false });
    this.trim();
  }

  /** Once per frame with the simulation time: fades lines near their end and drops expired ones (no hits when kept). */
  update(time: number): void {
    this.now = time;
    for (let i = this.lines.length - 1; i >= 0; i--) {
      const line = this.lines[i]!;
      const lineTime = line.callout ? CALLOUTS.lineTime : HIT_FEED.lineTime;
      const fadeTime = line.callout ? CALLOUTS.fadeTime : HIT_FEED.fadeTime;
      const age = this.keep && !line.callout ? 0 : time - line.at;
      if (age >= lineTime) {
        line.node.remove();
        this.lines.splice(i, 1);
        continue;
      }
      const fading = age >= lineTime - fadeTime;
      if (fading !== line.fading) line.node.classList.toggle('fading', (line.fading = fading));
    }
  }

  /**
   * Drops the oldest lines beyond what the mode shows: HIT_FEED.maxLines in all when they fade; when hits are kept,
   * HIT_FEED.keptLines hits and CALLOUTS.feedLines callouts.
   */
  private trim(): void {
    let hits = 0;
    let callouts = 0;
    for (let i = 0; i < this.lines.length; i++) {
      const line = this.lines[i]!;
      const over = this.keep ? (line.callout ? ++callouts > CALLOUTS.feedLines : ++hits > HIT_FEED.keptLines) : i >= HIT_FEED.maxLines;
      if (!over) continue;
      line.node.remove();
      this.lines.splice(i--, 1);
    }
  }

  /** Callouts turned off (Settings › HUD), or a new round: the callouts up now go; hits stay. */
  clearCallouts(): void {
    for (let i = this.lines.length - 1; i >= 0; i--) {
      if (!this.lines[i]!.callout) continue;
      this.lines[i]!.node.remove();
      this.lines.splice(i, 1);
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
