import { DIFFICULTIES, type Difficulty, TEAMMATE_DIFFICULTIES } from '../../config/bots';
import {
  FIRE_MODE_CHOICES,
  formatRoundTime,
  FRIENDLY_FIRE_CHOICES,
  KIT_CHOICES,
  MAGAZINE_CHOICES,
  type MatchRules,
  MINIMAP_HEARD_CHOICES,
  offersRow,
  OVERTIME_CHOICES,
  rulesetOf,
  RICOCHETS_COUNT_CHOICES,
  ROUND_TIME_SETTING,
  type RuleSwitch,
  RULESETS,
  type RulesetId,
  rulesetFits,
  TEAM_SIZE_CHOICES,
  TIME_OUT_CHOICES,
  WINS_NEEDED_CHOICES,
} from '../../config/matchRules';
import { PLAY_TEXT } from '../../config/menus';
import { DEFAULT_TEAM_PICK, TEAM_PICKS, teamCss, teamOfPick, type TeamPickId } from '../../config/teams';
import { playedTeamSize, type NewGamePicks } from '../../newGamePicks';
import type { saveSetting } from '../../settings/storage';
import { OptionPicker } from '../optionPicker';
import { MENU_ICONS } from './icons';
import { el, menuRow, rangeControl } from './menuParts';

/** What the Match section changes: the picks are the menus', and each change is saved and reported there. */
export interface MatchModel {
  /** The picks as made (not as played: a dev pick stays). Its `rules` is the menus' own, which the rows change in place. */
  picks(): Readonly<NewGamePicks>;
  setRuleset(r: RulesetId): void;
  setRules(rules: MatchRules): void;
  setDifficulty(d: Difficulty): void;
  setTeammates(d: Difficulty): void;
  /** Your team (M98): Alpha or Beta. */
  setTeam(t: TeamPickId): void;
}

/** What the section shows as played (the menus work it out): picks with dev content and the ruleset applied. */
export interface MatchShown {
  played: NewGamePicks;
  devContent: boolean;
  /** An Extraction run on a map with its data (M43): no rounds to win or round time, a squad of three at most. */
  run: boolean;
  /** The most players a side the map (and an Extraction run) has room for. */
  sizeMax: number;
  /** The fewest players a side the map offers (Woodland 5, M88; 1 in an Extraction run). */
  sizeMin: number;
}

/** A rule's row: shown while the mode reads it; while the ruleset sets it, its value instead of its control, locked. */
interface RuleRow {
  field: keyof MatchRules;
  row: HTMLElement;
  /** The ruleset's value for the rule, in words ("Off", "First to 7", "2:00"). */
  value: (rules: MatchRules) => string;
  /** The locked value ("Off · set by Skirmish"), shown in place of the control while the ruleset sets the rule. */
  fixed: HTMLElement;
  fixedText: HTMLElement;
}

/** What the help line says for a row: its name, its explanation and (a picker's) the picked option's line. */
interface RowHelp {
  name: string;
  help: string;
  picked: () => string;
}

/**
 * The Match screen's rules (M20, M39; G3 brought it out of its pop-up; MR1 made it compact, owner 2026-10-16): the
 * ruleset across the top with what it does, then one line per rule in two columns: Match (rounds to win, round time,
 * team size) and Teams (your team and each side's bots) on the left, the house rules (friendly fire, ricochets, then
 * the switches) on the right. A rule the mode as played plays no part in is not shown (M89); one the ruleset sets
 * shows its value, locked, with the ruleset's name, so the rows don't jump as the ruleset changes. Every row's
 * explanation is in one help line at the foot, for the row under the pointer or the keyboard; else the ruleset's.
 */
export class MatchPanel {
  readonly root: HTMLDivElement;
  private readonly ruleRows: RuleRow[] = [];
  private readonly helpOf = new Map<HTMLElement, RowHelp>();
  /** The pickers whose options may be dev content (M35), with the pick each shows as it plays. */
  private readonly tagged: { picker: OptionPicker<string>; played: (p: NewGamePicks) => string }[] = [];
  private readonly rules: OptionPicker<RulesetId>;
  private readonly teamSize: OptionPicker<string>;
  private readonly opponents: OptionPicker<Difficulty>;
  private readonly teammates: OptionPicker<Difficulty>;
  /** Your team (M98), hidden for an Extraction run (its squad is Alpha). */
  private readonly teamRow: HTMLElement;
  /** The teammates' bots, hidden in a 1v1 where there are none (MR1: only the rules that apply). */
  private readonly teammatesRow: HTMLElement;
  private readonly rulesetNote: HTMLParagraphElement;
  private readonly help: HTMLParagraphElement;
  /** The row whose explanation the help line shows, or null for the ruleset's. */
  private helpRow: HTMLElement | null = null;
  private rulesetLabel = '';

  constructor(private readonly model: MatchModel) {
    // The menus' own rules, changed in place: a map's pick sets its team size there too (M33), and the rows read it.
    const m = model.picks().rules;
    const changed = (): void => model.setRules({ ...m });
    const p = model.picks();
    const rules = this.tag(new OptionPicker('Rules', RULESETS, p.ruleset, 'ruleset', (r) => model.setRuleset(r)), (q) => q.ruleset);
    this.rules = rules;
    const label = <T extends string>(choices: readonly { id: T; label: string }[], id: T): string => choices.find((c) => c.id === id)?.label ?? id;
    /** A two-way switch row for rule `field` (M39). */
    const toggle = <T extends string>(field: RuleSwitch, name: string, help: string, choices: readonly { id: T; label: string; blurb: string }[], save: Parameters<typeof saveSetting>[0], on: T, off: T): HTMLElement =>
      this.ruleRow(
        field,
        this.row(
          name,
          help,
          new OptionPicker(name, choices, m[field] ? on : off, save, (v) => {
            m[field] = v === on;
            changed();
          }),
        ),
        (r) => label(choices, r[field] ? on : off),
      );
    const winsNeeded = this.tag(
      new OptionPicker('Rounds to win', WINS_NEEDED_CHOICES, String(m.winsNeeded), 'winsNeeded', (v) => {
        m.winsNeeded = Number(v);
        changed();
      }),
      (q) => String(q.rules.winsNeeded),
    );
    // The size played: no more than the map in force has room for (M33).
    this.teamSize = this.tag(
      new OptionPicker('Team size', TEAM_SIZE_CHOICES, String(m.teamSize), 'teamSize', (v) => {
        m.teamSize = Number(v);
        changed();
      }),
      (q) => String(playedTeamSize(q)),
    );
    this.opponents = this.tag(new OptionPicker('Opponents', DIFFICULTIES, p.difficulty, 'difficulty', (d) => model.setDifficulty(d)), (q) => q.difficulty);
    this.teammates = this.tag(new OptionPicker('Teammates', TEAMMATE_DIFFICULTIES, p.teammateDifficulty, 'teammateDifficulty', (d) => model.setTeammates(d)), (q) => q.teammateDifficulty);
    // Your team (M98): each button carries its team's swatch (the colour set in force) as well as the name.
    const team = new OptionPicker('Your team', TEAM_PICKS, p.team ?? DEFAULT_TEAM_PICK, 'playerTeam', (t) => model.setTeam(t));
    team.addSwatches(TEAM_PICKS.map((t) => ({ css: teamCss(teamOfPick(t.id)) })));
    this.teamRow = this.row('Your team', 'Alpha wears blue, Beta orange. Your match says where you start.', team);
    this.teammatesRow = this.row('Teammates', 'Your bot teammates.', this.teammates);

    const top = el('div', 'match-rules-top');
    this.rulesetNote = el('p', 'match-ruleset-note');
    top.append(rules.root, this.rulesetNote);
    const group = (title: string, ...rows: HTMLElement[]): HTMLElement => {
      const g = el('div', 'match-group');
      g.append(el('p', 'match-group-title', title), ...rows);
      return g;
    };
    const left = el('div', 'match-col');
    left.append(
      group(
        PLAY_TEXT.groups.match,
        this.ruleRow('winsNeeded', this.row('Rounds to win', 'The first team to win this many rounds wins the match.', winsNeeded), (r) => label(WINS_NEEDED_CHOICES, String(r.winsNeeded))),
        this.ruleRow(
          'roundTime',
          this.row(
            'Round time',
            "Out of time: the overtime flag in Elimination (unless Time-out gives the round), the defenders' round in Attack and Defend.",
            rangeControl('Round time', ROUND_TIME_SETTING, m.roundTime, formatRoundTime, 'roundTime', (v) => {
              m.roundTime = v;
              changed();
            }),
          ),
          (r) => formatRoundTime(r.roundTime),
        ),
        this.ruleRow('teamSize', this.row('Team size', 'Bigger teams come with bigger fields.', this.teamSize), (r) => label(TEAM_SIZE_CHOICES, String(r.teamSize))),
      ),
      group(PLAY_TEXT.groups.teams, this.teamRow, this.row('Opponents', "The other team's bots.", this.opponents), this.teammatesRow),
    );
    const right = el('div', 'match-col');
    right.append(
      group(
        PLAY_TEXT.groups.house,
        this.ruleRow(
          'friendlyFire',
          this.row(
            'Friendly fire',
            'Whether your BBs can hit your own team.',
            new OptionPicker('Friendly fire', FRIENDLY_FIRE_CHOICES, m.friendlyFire ? 'on' : 'off', 'friendlyFire', (v) => {
              m.friendlyFire = v === 'on';
              changed();
            }),
          ),
          (r) => label(FRIENDLY_FIRE_CHOICES, r.friendlyFire ? 'on' : 'off'),
        ),
        this.ruleRow(
          'ricochetsCount',
          this.row(
            'Ricochets count',
            'BBs bounce off concrete and steel either way.',
            new OptionPicker('Ricochets count', RICOCHETS_COUNT_CHOICES, m.ricochetsCount ? 'on' : 'off', 'ricochets', (v) => {
              m.ricochetsCount = v === 'on';
              changed();
            }),
          ),
          (r) => label(RICOCHETS_COUNT_CHOICES, r.ricochetsCount ? 'on' : 'off'),
        ),
        toggle('winByTwo', 'Win by two', 'Half-time stays one round short of the win.', OVERTIME_CHOICES, 'overtime', 'on', 'off'),
        toggle('timeOutToMorePlayers', 'Time-out', 'Elimination only: in Attack and Defend the defenders hold.', TIME_OUT_CHOICES, 'timeOut', 'morePlayers', 'draw'),
        toggle('heardOnMinimap', 'Minimap', 'The hit marker and the "you\'re hit" pointer stay either way.', MINIMAP_HEARD_CHOICES, 'minimapHeard', 'on', 'off'),
        toggle('semiAutoOnly', 'Fire modes', 'For everyone, bots included.', FIRE_MODE_CHOICES, 'fireModes', 'semi', 'any'),
        toggle('realcap', 'Magazines', 'For everyone, bots included.', MAGAZINE_CHOICES, 'magazines', 'realcap', 'carried'),
        toggle('factoryKit', 'Kit', 'Your Loadout is locked for the match either way.', KIT_CHOICES, 'matchKit', 'factory', 'own'),
      ),
    );
    const grid = el('div', 'match-grid');
    grid.append(left, right);
    this.help = el('p', 'match-help');
    this.help.setAttribute('aria-live', 'polite');
    this.root = el('div', 'match-panel');
    this.root.append(top, grid, this.help);
    this.help.append(el('b', '', ''), el('span', '', ''));
    grid.addEventListener('mouseleave', () => this.showHelp(null));
  }

  /** The rows as the picks play: the ones the mode reads, the ruleset's own locked, the sizes the map has room for, the dev options. */
  refresh(shown: MatchShown): void {
    const raw = this.model.picks();
    const played = shown.played;
    const ruleset = rulesetOf(played.ruleset);
    this.rulesetLabel = ruleset.label;
    this.rulesetNote.textContent = ruleset.blurb;
    // Only what fits the mode as played (M89): its rulesets, and the rows it reads.
    this.rules.limit((r) => rulesetFits(played.mode, r));
    for (const r of this.ruleRows) {
      r.row.hidden = !offersRow(played.ruleset, r.field, played.mode) && !(r.field in ruleset.fixed && offersRow('custom', r.field, played.mode));
      const fixed = r.field in ruleset.fixed;
      r.row.classList.toggle('is-fixed', fixed);
      r.fixed.hidden = !fixed;
      if (fixed) r.fixedText.textContent = PLAY_TEXT.setBy(r.value(played.rules), ruleset.label);
    }
    // An Extraction run has no pick: the squad is Alpha (M98).
    this.teamRow.hidden = shown.run;
    this.teammatesRow.hidden = playedTeamSize(played) === 1;
    this.teamSize.limit((id) => Number(id) >= shown.sizeMin && Number(id) <= shown.sizeMax);
    // The teammates may have followed the opponents' level (M20): shown, not saved.
    this.opponents.show(raw.difficulty);
    this.teammates.show(raw.teammateDifficulty);
    for (const t of this.tagged) t.picker.setDevContent(shown.devContent, t.played(shown.played));
    this.showHelp(this.helpRow && !this.helpRow.hidden ? this.helpRow : null);
  }

  /** The help line: row `row`'s name, explanation and the picked option's line, or with none the ruleset's line. */
  private showHelp(row: HTMLElement | null): void {
    this.helpRow = row;
    const about = row ? this.helpOf.get(row) : undefined;
    const picked = about && !row!.classList.contains('is-fixed') ? about.picked() : '';
    const lead = about ? about.name : this.rulesetLabel;
    const text = about ? [about.help, picked].filter((t) => t !== '').join(' ') : (this.rulesetNote.textContent ?? '');
    (this.help.children[0] as HTMLElement).textContent = lead ? `${lead}.` : '';
    (this.help.children[1] as HTMLElement).textContent = text;
  }

  /** A row of the panel: its help goes to the help line while the pointer or the keyboard is on it. */
  private row<T extends string>(name: string, help: string, control: OptionPicker<T> | HTMLElement): HTMLElement {
    const picker = control instanceof OptionPicker ? control : null;
    const row = menuRow(name, help, picker ? picker.root : (control as HTMLElement));
    this.helpOf.set(row, { name, help, picked: () => picker?.blurbText ?? '' });
    row.addEventListener('mouseenter', () => this.showHelp(row));
    row.addEventListener('focusin', () => this.showHelp(row));
    return row;
  }

  private tag<T extends string>(picker: OptionPicker<T>, played: (p: NewGamePicks) => T): OptionPicker<T> {
    this.tagged.push({ picker: picker as unknown as OptionPicker<string>, played });
    return picker;
  }

  /** `row` for rule `field`: shown while the mode reads it, with its value locked while the ruleset sets it (M39, MR1). */
  private ruleRow(field: keyof MatchRules, row: HTMLElement, value: (rules: MatchRules) => string): HTMLElement {
    const fixed = el('span', 'match-fixed');
    fixed.hidden = true;
    fixed.insertAdjacentHTML('afterbegin', MENU_ICONS.lock);
    const fixedText = el('span', '', '');
    fixed.append(fixedText);
    row.append(fixed);
    this.ruleRows.push({ field, row, value, fixed, fixedText });
    return row;
  }
}
