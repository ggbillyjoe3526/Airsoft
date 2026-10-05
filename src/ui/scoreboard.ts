import { HUD } from '../config/render';
import { TEAMS, teamCss } from '../config/teams';
import type { Character } from '../sim/character';
import { isInPlay } from '../sim/elimination';
import type { RoundState } from '../sim/round';
import type { ExtractionRules } from '../config/extraction';
import { respawnNote, runLine } from './runStatus';
import { flagLine } from './flagStatus';

/**
 * Top-centre scoreboard: rounds won per team either side of the round clock, with a pip per player
 * (filled while still in play). In flag mode each team is tagged ATK or DEF and a strip underneath shows
 * how far up the attackers' flag is and what that means for you. In Extraction (M43) there are no scores: the clock is
 * the run's, and the strip says where you can get out, or how the count is going, beside whether your respawn is spent.
 * The DOM is only touched when a shown value changes.
 */
export class Scoreboard {
  private readonly root: HTMLDivElement;
  private readonly scores: HTMLSpanElement[];
  private readonly roles: HTMLSpanElement[];
  private readonly clock: HTMLSpanElement;
  private readonly pips: HTMLElement[][];
  private readonly flag: HTMLDivElement;
  private readonly flagFill: HTMLElement;
  private readonly flagText: HTMLSpanElement;
  private shownScore = [-1, -1];
  private shownSeconds = -1;
  private shownLow = false;
  private shownOvertime = false;
  private shownAlive = -1;
  private shownAttackers = -2;
  private shownPercent = -1;
  private shownStatus = '';
  private shownLive = false;
  private shownUrgent = false;
  /** Extraction: what the strip was last built from (see updateRun). */
  private readonly shownRun = { status: '', second: -1, open: -1, warned: false, outcome: '', respawns: -1 };
  private readonly respawn: HTMLSpanElement;

  /** `teamSizes`: players per team (Extraction's sides differ). `playerTeam` is marked "you" so it's obvious which score is yours. */
  constructor(
    parent: HTMLElement,
    teamSizes: readonly number[],
    private readonly playerTeam: number,
  ) {
    this.root = document.createElement('div');
    this.root.className = 'scoreboard';
    this.root.hidden = true;
    const side = (team: number) => `
      <div class="sb-team sb-team-${team}" style="--team:${teamCss(team)}">
        <span class="sb-name">${TEAMS[team]!.name}${team === playerTeam ? ' <em>you</em>' : ''}<span class="sb-role"></span></span>
        <span class="sb-pips">${'<i></i>'.repeat(teamSizes[team] ?? 0)}</span>
        <span class="sb-score">0</span>
      </div>`;
    this.root.innerHTML = `
      <div class="sb-row">${side(0)}<span class="sb-clock">0:00</span>${side(1)}</div>
      <div class="sb-flag" hidden><span class="sb-flag-bar"><b></b></span><span class="sb-flag-text"></span><span class="sb-respawn" hidden></span></div>`;
    parent.appendChild(this.root);
    this.scores = [0, 1].map((t) => this.root.querySelector(`.sb-team-${t} .sb-score`) as HTMLSpanElement);
    this.roles = [0, 1].map((t) => this.root.querySelector(`.sb-team-${t} .sb-role`) as HTMLSpanElement);
    this.pips = [0, 1].map((t) => Array.from(this.root.querySelectorAll(`.sb-team-${t} .sb-pips i`)) as HTMLElement[]);
    this.clock = this.root.querySelector('.sb-clock') as HTMLSpanElement;
    this.flag = this.root.querySelector('.sb-flag') as HTMLDivElement;
    this.flagFill = this.root.querySelector('.sb-flag-bar b') as HTMLElement;
    this.flagText = this.root.querySelector('.sb-flag-text') as HTMLSpanElement;
    this.respawn = this.root.querySelector('.sb-respawn') as HTMLSpanElement;
  }

  setVisible(visible: boolean): void {
    this.root.hidden = !visible;
  }

  /**
   * Once per frame. `run`: in Extraction, the rules and your respawns left (the strip shows the run instead of the
   * flag, and the scores are hidden); omitted in the other modes.
   */
  update(round: RoundState, characters: readonly Character[], run?: { rules: ExtractionRules; respawnsLeft: number }): void {
    if (run) this.updateRun(round, run.rules, run.respawnsLeft);
    for (let t = 0; t < 2; t++) {
      const s = round.score[t]!;
      if (s !== this.shownScore[t]) this.scores[t]!.textContent = String((this.shownScore[t] = s));
    }
    const seconds = Math.ceil(round.clock);
    // Attack / Defend overtime (time's up but the attackers are still at the rope): "OT" instead of 0:00.
    const overtime = round.phase === 'live' && round.overtime > 0;
    if (seconds !== this.shownSeconds || overtime !== this.shownOvertime) {
      this.shownSeconds = seconds;
      this.shownOvertime = overtime;
      this.clock.textContent = overtime ? 'OT' : `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
    }
    // Red while time is running out, and at 0:00 after a time-out; not during a pause after a wipe-out.
    const low = seconds <= HUD.lowClockSeconds && (round.phase === 'live' || seconds === 0);
    if (low !== this.shownLow) this.clock.classList.toggle('low', (this.shownLow = low));
    if (!run) this.updateFlag(round);
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

  /** Extraction: the run's strip and respawn note, rebuilt only when the count's second, an exit or the outcome changes. */
  private updateRun(round: RoundState, rules: ExtractionRules, respawnsLeft: number): void {
    const r = round.run;
    const shown = this.shownRun;
    if (shown.status === '') {
      this.flag.hidden = false;
      this.root.classList.add('sb-run');
      this.respawn.hidden = false;
      this.flag.style.setProperty('--flag', teamCss(this.playerTeam));
    }
    let open = 0;
    for (let i = 0; i < r.exits.length; i++) if (r.exits[i]!.open) open |= 1 << i;
    const second = r.countStatus === 'counting' ? Math.ceil(rules.extractTime - r.count) : -1;
    const warned = round.clock <= rules.warnAt;
    if (shown.status !== r.countStatus || shown.second !== second || shown.open !== open || shown.warned !== warned || shown.outcome !== r.outcome) {
      shown.status = r.countStatus;
      shown.second = second;
      shown.open = open;
      shown.warned = warned;
      shown.outcome = r.outcome;
      const line = runLine(r, round.clock, rules);
      this.setRunFill(line.progress);
      this.flagText.textContent = line.text;
      if (line.urgent !== this.shownUrgent) this.flag.classList.toggle('urgent', (this.shownUrgent = line.urgent));
    } else if (r.countStatus === 'counting') {
      // The bar fills smoothly between the seconds.
      this.setRunFill(r.count / rules.extractTime);
    }
    if (respawnsLeft !== shown.respawns) {
      shown.respawns = respawnsLeft;
      this.respawn.textContent = respawnNote(respawnsLeft);
      this.respawn.classList.toggle('spent', respawnsLeft <= 0);
    }
  }

  /** The count's bar, touched only when its whole percent changes. */
  private setRunFill(progress: number): void {
    const percent = Math.floor(progress * 100);
    if (percent === this.shownPercent) return;
    this.shownPercent = percent;
    this.flagFill.style.width = `${percent}%`;
  }

  /** Flag mode: ATK / DEF tags and the strip showing the flag's height, from your side. */
  private updateFlag(round: RoundState): void {
    const attackers = round.mode === 'attackDefend' ? round.attackers : -1;
    if (attackers !== this.shownAttackers) {
      this.shownAttackers = attackers;
      this.shownPercent = -1; // your side changed: rebuild the line
      this.flag.hidden = attackers < 0;
      for (let t = 0; t < 2; t++) this.roles[t]!.textContent = attackers < 0 ? '' : t === attackers ? 'ATK' : 'DEF';
      if (attackers >= 0) this.flag.style.setProperty('--flag', teamCss(attackers));
    }
    if (attackers < 0) return;
    const percent = Math.floor(round.flag.progress * 100);
    const status = round.flag.status;
    const live = round.phase === 'live';
    if (percent === this.shownPercent && status === this.shownStatus && live === this.shownLive) return;
    this.shownPercent = percent;
    this.shownStatus = status;
    this.shownLive = live;
    this.flagFill.style.width = `${percent}%`;
    const line = flagLine(attackers === this.playerTeam, status, round.flag.progress, live);
    this.flagText.textContent = line.text;
    if (line.urgent !== this.shownUrgent) this.flag.classList.toggle('urgent', (this.shownUrgent = line.urgent));
  }
}
