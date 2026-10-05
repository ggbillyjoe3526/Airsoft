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
  RICOCHETS_COUNT_CHOICES,
  ROUND_TIME_SETTING,
  type RuleSwitch,
  RULESETS,
  type RulesetId,
  TEAM_SIZE_CHOICES,
  TIME_OUT_CHOICES,
  WINS_NEEDED_CHOICES,
} from '../../config/matchRules';
import { playedTeamSize, type NewGamePicks } from '../../newGamePicks';
import type { saveSetting } from '../../settings/storage';
import { OptionPicker } from '../optionPicker';
import { el, menuRow, rangeControl } from './menuParts';

/** What the Match section changes: the picks are the menus', and each change is saved and reported there. */
export interface MatchModel {
  /** The picks as made (not as played: a dev pick stays). Its `rules` is the menus' own, which the rows change in place. */
  picks(): Readonly<NewGamePicks>;
  setRuleset(r: RulesetId): void;
  setRules(rules: MatchRules): void;
  setDifficulty(d: Difficulty): void;
  setTeammates(d: Difficulty): void;
}

/** What the section shows as played (the menus work it out): picks with dev content and the ruleset applied. */
export interface MatchShown {
  played: NewGamePicks;
  devContent: boolean;
  /** An Extraction run on a map with its data (M43): no rounds to win or round time, a squad of three at most. */
  run: boolean;
  /** The most players a side the map (and an Extraction run) has room for. */
  sizeMax: number;
}

/**
 * The Play screen's Match section (M20, M39; G3 brought it out of its pop-up): the Rules row, then the rules the
 * ruleset leaves to you (rounds to win, round time, team size, friendly fire, ricochets, then the switches), then the
 * bots' difficulty for each side. A row shows only while the ruleset as played leaves its rule to you.
 */
export class MatchPanel {
  readonly root: HTMLDivElement;
  private readonly switchRows: { field: keyof MatchRules; row: HTMLElement }[] = [];
  /** The pickers whose options may be dev content (M35), with the pick each shows as it plays. */
  private readonly tagged: { picker: OptionPicker<string>; played: (p: NewGamePicks) => string }[] = [];
  private readonly teamSize: OptionPicker<string>;
  private readonly opponents: OptionPicker<Difficulty>;
  private readonly teammates: OptionPicker<Difficulty>;

  constructor(private readonly model: MatchModel) {
    // The menus' own rules, changed in place: a map's pick sets its team size there too (M33), and the rows read it.
    const m = model.picks().rules;
    const changed = (): void => model.setRules({ ...m });
    const p = model.picks();
    const rules = this.tag(new OptionPicker('Rules', RULESETS, p.ruleset, 'ruleset', (r) => model.setRuleset(r)), (q) => q.ruleset);
    /** A two-way switch row for rule `field` (M39). */
    const toggle = <T extends string>(field: RuleSwitch, label: string, help: string, choices: readonly { id: T; label: string; blurb: string }[], save: Parameters<typeof saveSetting>[0], on: T, off: T): HTMLElement =>
      this.switchRow(
        field,
        menuRow(
          label,
          help,
          new OptionPicker(label, choices, m[field] ? on : off, save, (v) => {
            m[field] = v === on;
            changed();
          }).root,
        ),
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
    const rulesRow = menuRow('Rules', 'Named rulesets keep their own records; Custom never counts.', rules.root);
    rulesRow.classList.add('match-rules-row');
    const grid = el('div', 'match-grid');
    grid.append(
      this.switchRow('winsNeeded', menuRow('Rounds to win', 'The first team to win this many rounds wins the match.', winsNeeded.root)),
      this.switchRow(
        'roundTime',
        menuRow(
          'Round time',
          'Out of time: a draw in Elimination, the defenders\' round in Attack and Defend.',
          rangeControl('Round time', ROUND_TIME_SETTING, m.roundTime, formatRoundTime, 'roundTime', (v) => {
            m.roundTime = v;
            changed();
          }),
        ),
      ),
      this.switchRow('teamSize', menuRow('Team size', 'Bigger teams come with bigger fields.', this.teamSize.root)),
      menuRow('Opponents', 'The other team\'s bots.', this.opponents.root),
      menuRow('Teammates', 'Your bot teammates (none in a 1v1).', this.teammates.root),
      this.switchRow(
        'friendlyFire',
        menuRow(
          'Friendly fire',
          'Whether your BBs can hit your own team.',
          new OptionPicker('Friendly fire', FRIENDLY_FIRE_CHOICES, m.friendlyFire ? 'on' : 'off', 'friendlyFire', (v) => {
            m.friendlyFire = v === 'on';
            changed();
          }).root,
        ),
      ),
      this.switchRow(
        'ricochetsCount',
        menuRow(
          'Ricochets count',
          'BBs bounce off concrete and steel either way.',
          new OptionPicker('Ricochets count', RICOCHETS_COUNT_CHOICES, m.ricochetsCount ? 'on' : 'off', 'ricochets', (v) => {
            m.ricochetsCount = v === 'on';
            changed();
          }).root,
        ),
      ),
      toggle('winByTwo', 'Overtime', 'Half-time stays one round short of the win.', OVERTIME_CHOICES, 'overtime', 'on', 'off'),
      toggle('timeOutToMorePlayers', 'Time-out', 'Elimination only: in Attack and Defend the defenders hold.', TIME_OUT_CHOICES, 'timeOut', 'morePlayers', 'draw'),
      toggle('heardOnMinimap', 'Minimap', 'The hit marker and the "you\'re hit" pointer stay either way.', MINIMAP_HEARD_CHOICES, 'minimapHeard', 'on', 'off'),
      toggle('semiAutoOnly', 'Fire modes', 'For everyone, bots included.', FIRE_MODE_CHOICES, 'fireModes', 'semi', 'any'),
      toggle('realcap', 'Magazines', 'For everyone, bots included.', MAGAZINE_CHOICES, 'magazines', 'realcap', 'carried'),
      toggle('factoryKit', 'Kit', 'Your Loadout is locked for the match either way.', KIT_CHOICES, 'matchKit', 'factory', 'own'),
    );
    this.root = el('div', 'match-panel');
    this.root.append(rulesRow, grid);
  }

  /** The rows as the picks play: the ones the ruleset leaves to you, the sizes the map has room for, the dev options. */
  refresh(shown: MatchShown): void {
    const raw = this.model.picks();
    for (const s of this.switchRows) s.row.hidden = !offersRow(shown.played.ruleset, s.field, shown.run);
    this.teamSize.limit((id) => Number(id) <= shown.sizeMax);
    // The teammates may have followed the opponents' level (M20): shown, not saved.
    this.opponents.show(raw.difficulty);
    this.teammates.show(raw.teammateDifficulty);
    for (const t of this.tagged) t.picker.setDevContent(shown.devContent, t.played(shown.played));
  }

  private tag<T extends string>(picker: OptionPicker<T>, played: (p: NewGamePicks) => T): OptionPicker<T> {
    this.tagged.push({ picker: picker as unknown as OptionPicker<string>, played });
    return picker;
  }

  /** `row`, shown only while the ruleset in force leaves rule `field` to the player (M39). */
  private switchRow(field: keyof MatchRules, row: HTMLElement): HTMLElement {
    this.switchRows.push({ field, row });
    return row;
  }
}
