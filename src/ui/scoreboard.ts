import { HUD } from '../config/render';
import { TEAMS } from '../config/teams';
import type { Character } from '../sim/character';
import { isInPlay } from '../sim/elimination';
import type { RoundState } from '../sim/round';

const hex = (c: number): string => `#${c.toString(16).padStart(6, '0')}`;

/**
 * Top-centre scoreboard: rounds won per team either side of the round clock, with a pip per player
 * (filled while still in play). The DOM is only touched when a shown value changes.
 */
export class Scoreboard {
  private readonly root: HTMLDivElement;
  private readonly scores: HTMLSpanElement[];
  private readonly clock: HTMLSpanElement;
  private readonly pips: HTMLElement[][];
  private shownScore = [-1, -1];
  private shownSeconds = -1;
  private shownLow = false;
  private shownAlive = -1;

  /** `playerTeam` is marked "you" so it's obvious which score is yours. */
  constructor(parent: HTMLElement, teamSize: number, playerTeam: number) {
    this.root = document.createElement('div');
    this.root.className = 'scoreboard';
    this.root.hidden = true;
    const side = (team: number) => `
      <div class="sb-team sb-team-${team}" style="--team:${hex(TEAMS[team]!.color)}">
        <span class="sb-name">${TEAMS[team]!.name}${team === playerTeam ? ' <em>you</em>' : ''}</span>
        <span class="sb-pips">${'<i></i>'.repeat(teamSize)}</span>
        <span class="sb-score">0</span>
      </div>`;
    this.root.innerHTML = `${side(0)}<span class="sb-clock">0:00</span>${side(1)}`;
    parent.appendChild(this.root);
    this.scores = [0, 1].map((t) => this.root.querySelector(`.sb-team-${t} .sb-score`) as HTMLSpanElement);
    this.pips = [0, 1].map((t) => Array.from(this.root.querySelectorAll(`.sb-team-${t} .sb-pips i`)) as HTMLElement[]);
    this.clock = this.root.querySelector('.sb-clock') as HTMLSpanElement;
  }

  setVisible(visible: boolean): void {
    this.root.hidden = !visible;
  }

  update(round: RoundState, characters: readonly Character[]): void {
    for (let t = 0; t < 2; t++) {
      const s = round.score[t]!;
      if (s !== this.shownScore[t]) this.scores[t]!.textContent = String((this.shownScore[t] = s));
    }
    const seconds = Math.ceil(round.clock);
    if (seconds !== this.shownSeconds) {
      this.shownSeconds = seconds;
      this.clock.textContent = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
    }
    // Red while time is running out, and at 0:00 after a time-out; not during a pause after a wipe-out.
    const low = seconds <= HUD.lowClockSeconds && (round.phase === 'live' || seconds === 0);
    if (low !== this.shownLow) this.clock.classList.toggle('low', (this.shownLow = low));
    // Pips: which players are still in play (one bit each), so the DOM is only touched on a change.
    let mask = 0;
    for (let i = 0; i < characters.length; i++) if (isInPlay(characters[i]!)) mask |= 1 << i;
    if (mask === this.shownAlive) return;
    this.shownAlive = mask;
    const n = [0, 0];
    for (const c of characters) {
      const pip = this.pips[c.team]?.[n[c.team]!++];
      pip?.classList.toggle('out', !isInPlay(c));
    }
  }

  dispose(): void {
    this.root.remove();
  }
}
