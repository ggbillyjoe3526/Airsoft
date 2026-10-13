import { CALLOUTS } from '../config/callouts';
import { teamCss } from '../config/teams';

interface Line {
  node: HTMLDivElement;
  /** Simulation time the line came in, and whether it has started fading. */
  at: number;
  fading: boolean;
}

/**
 * The callout feed (CL1), bottom left: your bot teammates' calls, newest at the bottom as in a chat, each a navy row with
 * the caller's name in their team's colour and what they said ("Rook  Contact, Dock!"). A screen reader hears each as
 * "Rook: Contact, Dock!". Lines live on simulation time, so a pause holds them; a new round starts it empty.
 */
export class CalloutFeed {
  private readonly root: HTMLDivElement;
  private readonly lines: Line[] = [];

  constructor(parent: HTMLElement) {
    this.root = document.createElement('div');
    this.root.className = 'callout-feed';
    this.root.hidden = true;
    this.root.setAttribute('aria-live', 'polite');
    this.root.style.setProperty('--feed-fade', `${CALLOUTS.fadeTime}s`);
    parent.appendChild(this.root);
  }

  setVisible(visible: boolean): void {
    this.root.hidden = !visible;
  }

  /** `name` (on `team`) said `text`, at simulation time `time`. */
  add(name: string, team: number, text: string, time: number): void {
    const node = document.createElement('div');
    node.className = 'callout-line';
    node.style.setProperty('--team', teamCss(team));
    const who = document.createElement('b');
    who.className = 'callout-name';
    who.textContent = name;
    // The colon is for a screen reader: the row's look is the name's colour and the gap.
    const colon = document.createElement('span');
    colon.className = 'sr-only';
    colon.textContent = ':';
    node.append(who, colon, ` ${text}`);
    this.root.append(node);
    this.lines.push({ node, at: time, fading: false });
    while (this.lines.length > CALLOUTS.feedLines) this.lines.shift()!.node.remove();
  }

  /** Once per frame with the simulation time: fades lines near their end and drops expired ones. */
  update(time: number): void {
    for (let i = this.lines.length - 1; i >= 0; i--) {
      const line = this.lines[i]!;
      const age = time - line.at;
      if (age >= CALLOUTS.lineTime) {
        line.node.remove();
        this.lines.splice(i, 1);
        continue;
      }
      const fading = age >= CALLOUTS.lineTime - CALLOUTS.fadeTime;
      if (fading !== line.fading) line.node.classList.toggle('fading', (line.fading = fading));
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
