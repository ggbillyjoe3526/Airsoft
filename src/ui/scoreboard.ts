import { FLAG_VISUALS, HUD } from '../config/render';
import { HUD_TEXT } from '../config/hudText';
import { TEAMS, teamCss } from '../config/teams';
import type { Character } from '../sim/character';
import { isInPlay } from '../sim/elimination';
import type { RoundState } from '../sim/round';
import type { ExtractionRules } from '../config/extraction';
import { unknownMode } from '../config/modes';
import { carriedNote, respawnNote, runLine } from './runStatus';
import { flagLine, overtimeLine } from './flagStatus';
import { TimedFill } from './timedFill';

/**
 * Top-centre score bar (G4 look): each team's name and a slanted pip per player (lit while still in play), its rounds
 * won on a block in its colour, and the round clock between them with what wins the match under it. In flag mode each
 * team is tagged ATK or DEF and a strip underneath shows how far up the attackers' flag is and what that means for you.
 * In Extraction (M43) there are no scores: the clock is the run's, and the strip says where you can get out, or how the
 * count is going, beside whether your respawn is spent. In Elimination's overtime (Dev 6 item 45) the clock counts the
 * overtime down, in red, with "Overtime" under it, and the strip says what wins it, its bar filling as its time runs out.
 * The DOM is only touched when a shown value changes.
 */
export class Scoreboard {
  private readonly root: HTMLDivElement;
  private readonly scores: HTMLSpanElement[];
  private readonly roles: HTMLSpanElement[];
  private readonly clock: HTMLSpanElement;
  private readonly pips: HTMLElement[][];
  private readonly flag: HTMLDivElement;
  /** The strip's bar: the flag's height, or the exit count on one CSS transition (M64, audit UI-11). */
  private readonly flagFill: TimedFill;
  private readonly flagText: HTMLSpanElement;
  private shownScore = [-1, -1];
  private shownSeconds = -1;
  private shownLow = false;
  private shownOvertime = false;
  private shownAlive = -1;
  private shownReserve = -1;
  private shownAttackers = -2;
  private shownPercent = -1;
  private shownStatus = '';
  private shownLive = false;
  private shownUrgent = false;
  /** Elimination's overtime flag (Dev 6 item 45): whether the board shows it, and its strip's state as last built. */
  private shownFlagUp = false;
  private shownOvertimeStatus = '';
  /** What wins the match (setAim), shown under the clock but in overtime; and the overtime's full time (setOvertime). */
  private aimText = '';
  private overtimeTime = 0;
  /** Extraction: what the strip was last built from (see updateRun). */
  private readonly shownRun = { status: '', second: -1, open: -1, warned: false, outcome: '', respawns: -1, carried: -1 };
  private readonly respawn: HTMLSpanElement;
  private readonly aim: HTMLSpanElement;
  /** Publishes half the bar's width as it changes, so the hit feed keeps clear of the bar as it is, not its widest form. */
  private readonly sizeWatch: ResizeObserver | null;

  /**
   * `teamSizes`: characters per team (Extraction's sides differ, its reserve included). `playerTeam` is told to a screen
   * reader only: on screen the YOU tag went (Dev 6 playtest item 31), as the HUD's team colours already say it.
   */
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
        <span class="sb-name">${TEAMS[team]!.name}${team === playerTeam ? ' <span class="sr-only">(your team)</span>' : ''}<span class="sb-role"></span></span>
        <span class="sb-pips">${'<i></i>'.repeat(teamSizes[team] ?? 0)}</span>
        <span class="sb-score">0</span>
      </div>`;
    this.root.innerHTML = `
      <div class="sb-row">${side(0)}<span class="sb-mid"><span class="sb-clock">0:00</span><span class="sb-aim"></span></span>${side(1)}</div>
      <div class="sb-flag" hidden><span class="sb-flag-bar"><b></b></span><span class="sb-flag-text"></span><span class="sb-respawn" hidden></span></div>`;
    parent.appendChild(this.root);
    this.scores = [0, 1].map((t) => this.root.querySelector(`.sb-team-${t} .sb-score`) as HTMLSpanElement);
    this.roles = [0, 1].map((t) => this.root.querySelector(`.sb-team-${t} .sb-role`) as HTMLSpanElement);
    this.pips = [0, 1].map((t) => Array.from(this.root.querySelectorAll(`.sb-team-${t} .sb-pips i`)) as HTMLElement[]);
    this.clock = this.root.querySelector('.sb-clock') as HTMLSpanElement;
    this.flag = this.root.querySelector('.sb-flag') as HTMLDivElement;
    this.flagFill = new TimedFill(this.root.querySelector('.sb-flag-bar b') as HTMLElement);
    this.flagText = this.root.querySelector('.sb-flag-text') as HTMLSpanElement;
    this.respawn = this.root.querySelector('.sb-respawn') as HTMLSpanElement;
    this.aim = this.root.querySelector('.sb-aim') as HTMLSpanElement;
    // BP3: the feed kept clear of Attack and Defend's bar in every mode, so at 1366 px its lines wrapped onto three rows.
    // Only on a change of size (no layout read per frame); the bar's own scale is applied in the feed's CSS.
    this.sizeWatch = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(() => {
      const width = this.root.offsetWidth;
      if (width > 0) parent.style.setProperty('--sb-half', `${width / 2}px`);
    });
    this.sizeWatch?.observe(this.root);
  }

  /** The line under the clock (G4): what wins the match ("First to 5"), or the run's aim in Extraction. Set once. */
  setAim(text: string): void {
    this.aimText = text;
    if (!this.shownFlagUp) this.aim.textContent = text;
  }

  /** Elimination's overtime flag's full time (RoundRules.overtime.time, s): the strip's bar fills over it. Set once. */
  setOvertime(seconds: number): void {
    this.overtimeTime = seconds;
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
    // Elimination's overtime flag up (Dev 6 item 45): the clock is the overtime's, "Overtime" under it.
    const flagUp = round.overtimeFlag.up;
    const seconds = Math.ceil(flagUp ? round.overtimeFlag.left : round.clock);
    // Attack / Defend overtime (time's up but the attackers are still at the rope): "OT" instead of 0:00.
    const overtime = round.phase === 'live' && round.overtime > 0;
    if (seconds !== this.shownSeconds || overtime !== this.shownOvertime) {
      this.shownSeconds = seconds;
      this.shownOvertime = overtime;
      this.clock.textContent = overtime ? 'OT' : `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
    }
    if (flagUp !== this.shownFlagUp) this.aim.textContent = (this.shownFlagUp = flagUp) ? HUD_TEXT.overtime : this.aimText;
    // Red while time is running out (all through the overtime flag's), and at 0:00 after a time-out; not during a pause
    // after a wipe-out or a touch.
    const low = (flagUp || seconds <= HUD.lowClockSeconds) && (round.phase === 'live' || seconds === 0);
    if (low !== this.shownLow) this.clock.classList.toggle('low', (this.shownLow = low));
    if (!run) this.updateFlag(round);
    // Pips: which players are still in play (one bit each) and which wait as Extraction's reserve (hidden until they
    // join, BP3), so the DOM is only touched on a change.
    const reserve = round.run.reserve;
    let mask = 0;
    let waiting = 0;
    for (let i = 0; i < characters.length; i++) {
      if (isInPlay(characters[i]!)) mask |= 1 << i;
      if (reserve[characters[i]!.id]) waiting |= 1 << i;
    }
    if (mask === this.shownAlive && waiting === this.shownReserve) return;
    this.shownAlive = mask;
    this.shownReserve = waiting;
    const n = [0, 0];
    for (const c of characters) {
      const pip = this.pips[c.team]?.[n[c.team]!++];
      pip?.classList.toggle('out', !isInPlay(c));
      pip?.classList.toggle('reserve', reserve[c.id] === true);
    }
  }

  dispose(): void {
    this.sizeWatch?.disconnect();
    this.root.parentElement?.style.removeProperty('--sb-half');
    this.root.remove();
  }

  /**
   * Extraction: the run's strip and respawn note (with what you carry, M44), rebuilt only when the count's second, an
   * exit, the outcome or what you carry changes.
   */
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
      this.setRunFill(line.progress, r.countStatus === 'counting' && r.outcome === 'none' ? rules.extractTime - r.count : -1);
      this.flagText.textContent = line.text;
      if (line.urgent !== this.shownUrgent) this.flag.classList.toggle('urgent', (this.shownUrgent = line.urgent));
    } else if (r.countStatus === 'counting') {
      // The bar fills smoothly between the seconds.
      this.setRunFill(r.count / rules.extractTime, rules.extractTime - r.count);
    }
    // What you carry (M44) changes only as a case is opened, dropped or picked up again.
    if (respawnsLeft !== shown.respawns || r.carried.length !== shown.carried) {
      shown.respawns = respawnsLeft;
      shown.carried = r.carried.length;
      const carrying = carriedNote(r.carried);
      this.respawn.textContent = carrying ? `${respawnNote(respawnsLeft)} · ${carrying}` : respawnNote(respawnsLeft);
      this.respawn.classList.toggle('spent', respawnsLeft <= 0);
    }
  }

  /** The count's bar: running on one transition while it counts (`secondsLeft` to full, else -1), otherwise standing at `progress`. */
  private setRunFill(progress: number, secondsLeft: number): void {
    if (secondsLeft >= 0) this.flagFill.follow(progress, secondsLeft);
    else this.flagFill.hold(progress);
  }

  /** Flag mode: ATK / DEF tags and the strip showing the flag's height, from your side. */
  private updateFlag(round: RoundState): void {
    const attackers = flagAttackers(round);
    if (attackers !== this.shownAttackers) {
      this.shownAttackers = attackers;
      this.shownPercent = -1; // your side changed: rebuild the line
      this.flag.hidden = attackers < 0;
      for (let t = 0; t < 2; t++) this.roles[t]!.textContent = attackers < 0 ? '' : t === attackers ? 'ATK' : 'DEF';
      if (attackers >= 0) this.flag.style.setProperty('--flag', teamCss(attackers));
    }
    if (attackers < 0) {
      if (round.mode === 'elimination') this.updateOvertime(round);
      return;
    }
    const percent = Math.floor(round.flag.progress * 100);
    const status = round.flag.status;
    const live = round.phase === 'live';
    if (percent === this.shownPercent && status === this.shownStatus && live === this.shownLive) return;
    this.shownPercent = percent;
    this.shownStatus = status;
    this.shownLive = live;
    this.flagFill.hold(round.flag.progress);
    const line = flagLine(attackers === this.playerTeam, status, round.flag.progress, live);
    this.flagText.textContent = line.text;
    if (line.urgent !== this.shownUrgent) this.flag.classList.toggle('urgent', (this.shownUrgent = line.urgent));
  }

  /**
   * Elimination (Dev 6 item 45): the strip while the overtime flag is up, its bar filling to full as the overtime's time
   * runs out (one transition, TimedFill), its line rebuilt only when the flag's state or the round's phase changes.
   */
  private updateOvertime(round: RoundState): void {
    const flag = round.overtimeFlag;
    if (flag.up === this.flag.hidden) {
      this.flag.hidden = !flag.up;
      this.shownOvertimeStatus = '';
      if (flag.up) this.flag.style.setProperty('--flag', FLAG_VISUALS.overtimeCss);
    }
    if (!flag.up) return;
    const live = round.phase === 'live';
    const gone = this.overtimeTime > 0 ? 1 - flag.left / this.overtimeTime : 1;
    if (live) this.flagFill.follow(gone, flag.left);
    else this.flagFill.hold(gone);
    const status = live ? flag.status : 'over';
    if (status === this.shownOvertimeStatus) return;
    this.shownOvertimeStatus = status;
    const line = overtimeLine(flag.status, live);
    this.flagText.textContent = line.text;
    if (line.urgent !== this.shownUrgent) this.flag.classList.toggle('urgent', (this.shownUrgent = line.urgent));
  }
}

/** The team attacking the flag this round, or -1 in a mode without one (the strip and the ATK / DEF tags hide). */
function flagAttackers(round: RoundState): number {
  switch (round.mode) {
    case 'attackDefend':
      return round.attackers;
    case 'elimination':
    case 'extraction':
      return -1;
    default:
      return unknownMode(round.mode);
  }
}
