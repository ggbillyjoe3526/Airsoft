import type { KitSlot } from '../pool/kit';
import type { PlayerKit } from '../pool/loadoutModel';
import { factoryParts } from './attachments';
import { defaultTeammateDifficulty, type Difficulty, DIFFICULTIES } from './bots';
import type { Tagged } from './content';
import type { Switch } from './controls';
import { BOT_GLOW_BBS } from './glowBBs';
import { HITS, type HitConfig, ROUNDS } from './hits';
import { LOADOUT, REALCAP, replicaUnderRules } from './replicas';

/**
 * Custom matches (M20): the rules New game's Match pop-up sets, first guesses for the owner's playtest. Everything else
 * about a match (the pause between rounds, the flag, who starts where) stays in config/hits.ts ROUNDS.
 */
export interface MatchRules {
  /** Round wins needed to win the match. */
  winsNeeded: number;
  /** Round length (s). */
  roundTime: number;
  /** Players per team, the player included (1 is you alone against one bot). */
  teamSize: number;
  /** BBs knock out teammates too (as at a real site). */
  friendlyFire: boolean;
  /** A BB that has bounced off something hard still knocks out whoever it hits (fields set their own rule). */
  ricochetsCount: boolean;
  /**
   * The Rules picker's switches (M39). Each is off (heardOnMinimap: on) in Skirmish, the match the game always had;
   * Tournament and Pro CQB set them (RULESETS), and Custom lets the player set each one.
   */
  /** Win by two (overtime): a team needs `winsNeeded` round wins and a lead of WIN_BY_TWO rounds. */
  winByTwo: boolean;
  /** Elimination: a round that runs out of time goes to the side with more players left (a draw, replayed, if level). */
  timeOutToMorePlayers: boolean;
  /** The minimap shows the other team where you last heard them (M23); off, it shows your teammates only. */
  heardOnMinimap: boolean;
  /** Every replica's fire selector is held on semi, for everyone (bots included). */
  semiAutoOnly: boolean;
  /** Realcap: everyone's magazines hold at most REALCAP.magSize BBs and REALCAP.mags are carried. */
  realcap: boolean;
  /** Everyone carries the factory loadout (config/replicas.ts LOADOUT as it comes): no Armory gear, no rolled bot kits. */
  factoryKit: boolean;
  /**
   * Strict marshal: the overshooting rule counts double (one warning, then you sit the next round out). INERT: a
   * placeholder until the overshooting rule exists (v0.2); Tournament sets it so the rule applies there once built,
   * nothing reads it yet and Custom doesn't offer it (KNOWN_ISSUES).
   */
  strictMarshal: boolean;
}

/** The rules that are on or off (friendly fire, ricochets and the Rules picker's switches). */
export type RuleSwitch = { [K in keyof MatchRules]: MatchRules[K] extends boolean ? K : never }[keyof MatchRules];

/** Win by two: the lead a team needs to take the match once `winsNeeded` is reached (overtime). */
export const WIN_BY_TWO = 2;

/**
 * Custom rules pay no more than this multiple (M39; owner, 2026-10-04: "Custom pays like Hard"): Pro's ×2 (pool.md) is
 * for the named rulesets played as they are. Easy, Normal and Hard pay at or under it, so their custom matches pay as
 * before.
 */
export const CUSTOM_RULES_PAY_CAP = 1.5;

/** One of the Match pop-up's choices; a `dev` one (M35, config/content.ts) is offered only with Dev content on. */
export interface MatchChoice<T extends string = string> extends Tagged {
  id: T;
  label: string;
  blurb: string;
}

/** Rounds to win the match, as the Match pop-up offers them. */
export const WINS_NEEDED_CHOICES: readonly MatchChoice[] = [
  { id: '3', label: '3', blurb: 'A quick match: first to 3 round wins.' },
  { id: '5', label: '5', blurb: 'The standard match: first to 5 round wins.' },
  { id: '7', label: '7', blurb: 'A long match: first to 7 round wins.' },
  { id: '10', label: '10', blurb: 'A marathon: first to 10 round wins.' },
];

/** Players per team. Each map offers as many as it has room for (map/maps.ts teamSize: Depot 3, Woodland 5, M33);
 * 4v4 and 5v5 are dev content until Woodland is public (owner, 2026-10-04). */
export const TEAM_SIZE_CHOICES: readonly MatchChoice[] = [
  { id: '1', label: '1v1', blurb: 'You against one bot: no teammates, nobody to cover you.' },
  { id: '2', label: '2v2', blurb: 'You and one bot teammate against two bots.' },
  { id: '3', label: '3v3', blurb: 'You and two bot teammates against three bots.' },
  { id: '4', label: '4v4', blurb: 'You and three bot teammates against four bots.', tag: 'dev' },
  { id: '5', label: '5v5', blurb: 'You and four bot teammates against five bots.', tag: 'dev' },
];

export const FRIENDLY_FIRE_CHOICES: readonly { id: Switch; label: string; blurb: string }[] = [
  { id: 'on', label: 'On', blurb: 'Your BBs knock out teammates too, as at a real site. Check your line.' },
  { id: 'off', label: 'Off', blurb: 'BBs pass your teammates by: only the other team can knock you out.' },
];

export const RICOCHETS_COUNT_CHOICES: readonly { id: Switch; label: string; blurb: string }[] = [
  { id: 'off', label: 'Off', blurb: "A BB that has bounced off a wall or the floor ticks you, but you're still in." },
  { id: 'on', label: 'On', blurb: 'A bounced BB still knocks out whoever it hits, as at fields that count ricochets.' },
];

/** The round-time slider: 1:30 to 5:00 in half-minute steps. */
export const ROUND_TIME_SETTING = { min: 90, max: 300, step: 30 } as const;

/** The Rules picker's switches as the game always played (M39): Skirmish holds them here. */
export const SKIRMISH_SWITCHES = {
  winByTwo: false,
  timeOutToMorePlayers: false,
  heardOnMinimap: true,
  semiAutoOnly: false,
  realcap: false,
  factoryKit: false,
  strictMarshal: false,
} as const satisfies Partial<MatchRules>;

/** The match the game always had: 3v3, first to 5, 2:30 rounds, friendly fire on, ricochets don't count (owner). */
export const DEFAULT_MATCH_RULES: MatchRules = {
  winsNeeded: ROUNDS.winsNeeded,
  roundTime: ROUNDS.roundTime,
  teamSize: ROUNDS.teamSize,
  friendlyFire: true,
  ricochetsCount: false,
  ...SKIRMISH_SWITCHES,
};

/** The Custom switches' choices (M39), each saved under its own setting (ui/menus/savedChoices.ts). */
export const OVERTIME_CHOICES: readonly MatchChoice<Switch>[] = [
  { id: 'off', label: 'Off', blurb: 'The first team to the rounds to win takes the match.' },
  { id: 'on', label: 'Win by two', blurb: 'Level one round short of the win, play on until one team is two rounds ahead.' },
];

export type TimeOutRule = 'draw' | 'morePlayers';
export const TIME_OUT_CHOICES: readonly MatchChoice<TimeOutRule>[] = [
  { id: 'draw', label: 'Draw', blurb: 'An Elimination round that runs out of time is a draw, played again.' },
  { id: 'morePlayers', label: 'More players left', blurb: 'An Elimination round that runs out of time goes to the team with more players left; level, it is a draw.' },
];

export const MINIMAP_HEARD_CHOICES: readonly MatchChoice<Switch>[] = [
  { id: 'on', label: 'Heard', blurb: 'The minimap shows the other team where you last heard them.' },
  { id: 'off', label: 'Teammates only', blurb: 'The minimap shows your teammates only: listen for the other team.' },
];

export type FireModeRule = 'any' | 'semi';
export const FIRE_MODE_CHOICES: readonly MatchChoice<FireModeRule>[] = [
  { id: 'any', label: 'Any', blurb: 'Every replica fires as its selector allows.' },
  { id: 'semi', label: 'Semi only', blurb: 'Every replica is held on semi, bots\' too: one BB per trigger pull.' },
];

/** Realcap in words: "30 BBs at most, 3 carried". */
export const REALCAP_TEXT = `${REALCAP.magSize} BBs at most, ${REALCAP.mags} carried`;

export type MagazineRule = 'carried' | 'realcap';
export const MAGAZINE_CHOICES: readonly MatchChoice<MagazineRule>[] = [
  { id: 'carried', label: 'As carried', blurb: 'Magazines as each replica carries them.' },
  { id: 'realcap', label: 'Realcap', blurb: `Everyone's magazines: ${REALCAP_TEXT}.` },
];

export type KitRule = 'own' | 'factory';
export const KIT_CHOICES: readonly MatchChoice<KitRule>[] = [
  { id: 'own', label: 'Your kit', blurb: 'You carry your Loadout, Armory gear and all; Hard and Pro opponents roll their own.' },
  { id: 'factory', label: 'Factory', blurb: 'Everyone carries the factory rifle and pistol as they come: only skill counts.' },
];

/** The Rules picker's rulesets (M39). */
export type RulesetId = 'skirmish' | 'tournament' | 'proCqb' | 'custom';

/**
 * One ruleset: the Rules picker's choice (a `dev` one, M35, is offered only with Dev content on), the switches it sets
 * (`fixed`; every other one is the Match pop-up's pick, which the pop-up offers) and where its matches go in the records
 * (`records`: '' the plain `<difficulty>.<mode>` cells, a name its own `<difficulty>.<mode>.<name>` ones, null never). A
 * match counts only played as its ruleset's standard (standardRules). Adding a ruleset (the field rules presets, v0.3)
 * is one entry here.
 */
export interface Ruleset extends MatchChoice<RulesetId> {
  fixed: Partial<MatchRules>;
  records: string | null;
}

const TOURNAMENT_RULES = {
  winsNeeded: 7,
  roundTime: 120,
  friendlyFire: true,
  ricochetsCount: true,
  winByTwo: true,
  timeOutToMorePlayers: true,
  heardOnMinimap: false,
  semiAutoOnly: false,
  realcap: false,
  factoryKit: false,
  strictMarshal: true,
} as const satisfies Partial<MatchRules>;

export const RULESETS: readonly Ruleset[] = [
  {
    id: 'skirmish',
    label: 'Skirmish',
    blurb: 'The match as you know it: set the rounds, time, team size, friendly fire and ricochets yourself.',
    fixed: SKIRMISH_SWITCHES,
    records: '',
  },
  {
    id: 'tournament',
    label: 'Tournament',
    blurb: 'First to 7 with half-time, win by two; 2:00 rounds; time-outs go to the team with more players left; teammates only on the minimap; ricochets count.',
    tag: 'dev',
    fixed: TOURNAMENT_RULES,
    records: 'tournament',
  },
  {
    id: 'proCqb',
    label: 'Pro CQB',
    blurb: `Tournament, with every replica on semi and realcap magazines (${REALCAP.magSize} BBs, ${REALCAP.mags} carried) for everyone.`,
    tag: 'dev',
    fixed: { ...TOURNAMENT_RULES, semiAutoOnly: true, realcap: true },
    records: 'proCqb',
  },
  {
    id: 'custom',
    label: 'Custom',
    blurb: `Every switch is yours. Custom matches never go into the records, and pay no more than ×${CUSTOM_RULES_PAY_CAP}.`,
    fixed: {},
    records: null,
  },
];

export const DEFAULT_RULESET: RulesetId = 'skirmish';

/** Ruleset `id` (Skirmish for an id no ruleset has). */
export function rulesetOf(id: RulesetId): Ruleset {
  return RULESETS.find((r) => r.id === id) ?? RULESETS[0]!;
}

/** The rules a match of `ruleset` plays: the Match pop-up's picks (`picked`) with the ruleset's own switches over them. */
export function rulesUnder(ruleset: RulesetId, picked: MatchRules): MatchRules {
  return { ...picked, ...rulesetOf(ruleset).fixed };
}

/** Whether the Match pop-up offers switch `field` under `ruleset` (one the ruleset doesn't set; strictMarshal never, it's inert). */
export function offersSwitch(ruleset: RulesetId, field: keyof MatchRules): boolean {
  return field !== 'strictMarshal' && !(field in rulesetOf(ruleset).fixed);
}

/**
 * The Match pop-up's rows an Extraction run ignores (M53, audit UI-01): a run is one round of the map's own run time
 * (MatchSession: `winsNeeded: 1`, `winBy: 1`), and ends on its own clock rather than by a time-out rule.
 */
export const RUN_IGNORES: readonly (keyof MatchRules)[] = ['winsNeeded', 'roundTime', 'winByTwo', 'timeOutToMorePlayers'];

/**
 * Whether the Match pop-up offers row `field` for the match as played (M53, audit UI-01): one `ruleset` leaves to you
 * (offersSwitch), and in an Extraction run (`run`) one the run reads.
 */
export function offersRow(ruleset: RulesetId, field: keyof MatchRules, run: boolean): boolean {
  return offersSwitch(ruleset, field) && !(run && RUN_IGNORES.includes(field));
}

/** The standard match of `ruleset` (DEFAULT_MATCH_RULES under its switches): what its records count. */
export function standardRulesOf(ruleset: RulesetId): MatchRules {
  return rulesUnder(ruleset, DEFAULT_MATCH_RULES);
}

/**
 * Whether `rules` are `ruleset`'s standard match (M39): a ruleset with records, every rule as its standard has it.
 * Anything else is custom rules: never in the records, and paid no more than CUSTOM_RULES_PAY_CAP.
 */
export function standardRules(ruleset: RulesetId, rules: MatchRules): boolean {
  if (rulesetOf(ruleset).records === null) return false;
  const std = standardRulesOf(ruleset);
  return (Object.keys(std) as (keyof MatchRules)[]).every((k) => rules[k] === std[k]);
}

/** Where a match of `ruleset` goes in the records: '' for the plain cells (Skirmish), its name, or null (Custom). */
export function recordsKeyOf(ruleset: RulesetId): string | null {
  return rulesetOf(ruleset).records;
}

/**
 * The player's kit under `rules` (M39): the factory loadout (LOADOUT as it comes, Glowing BBs the bots' way) with
 * factoryKit, then every replica under the semi-only and realcap rules (realcap fits the standard magazine, so a hi-cap
 * can't lift it). The same kit, unchanged, under rules that set none of them.
 */
export function kitUnderRules(kit: PlayerKit, rules: MatchRules): PlayerKit {
  const base: PlayerKit = rules.factoryKit
    ? {
        slots: LOADOUT.map((r): KitSlot => ({ replica: r, optic: null, parts: factoryParts(r) })),
        hopUps: LOADOUT.map((r) => r.hopUpDial),
        bbWeights: LOADOUT.map((r) => r.bbWeight),
        glowBBs: LOADOUT.map(() => BOT_GLOW_BBS),
      }
    : kit;
  if (!rules.semiAutoOnly && !rules.realcap) return base;
  return {
    ...base,
    slots: base.slots.map((s) => ({
      ...s,
      replica: replicaUnderRules(s.replica, rules),
      parts: rules.realcap ? { ...s.parts, magazine: REALCAP.magazine } : s.parts,
    })),
  };
}

/**
 * The match flow for `m` (ROUNDS with the picked numbers). Half-time comes after `winsNeeded - 1` rounds (first to 5:
 * after 4, as before), so the decider of a full-length match is always played in the second half. Win by two (M39)
 * plays on past it with no further swap.
 */
export function roundRulesFor(m: MatchRules) {
  return {
    ...ROUNDS,
    teamSize: m.teamSize,
    winsNeeded: m.winsNeeded,
    roundTime: m.roundTime,
    halfTimeAfter: Math.max(1, m.winsNeeded - 1),
    winBy: m.winByTwo ? WIN_BY_TWO : ROUNDS.winBy,
    timeOutToMorePlayers: m.timeOutToMorePlayers,
  };
}

/** The hit rules for `m` (friendly fire and ricochets; the hit volumes and walk-off stay as they are). */
export function hitRulesFor(m: MatchRules): HitConfig {
  return { ...HITS, friendlyFire: m.friendlyFire, ricochetsCount: m.ricochetsCount };
}

/**
 * Whether a match counts towards the records (M20): its ruleset's standard match (standardRules; Skirmish's is
 * DEFAULT_MATCH_RULES, M39) with your bot teammates at the opponents' level, as every match was before M20, or at the
 * level the game gives them by default (defaultTeammateDifficulty: Normal against Easy, audit AI-03), so a player who
 * changed nothing is always counted. The records grid is per opponents' difficulty and mode (and named ruleset), so a
 * 1v1 first to 3, or Hard opponents with Easy teammates at your side, would mix easier or shorter matches into the same
 * cell.
 */
export function countsForRecords(rules: MatchRules, opponents: Difficulty, teammates: Difficulty, ruleset: RulesetId = DEFAULT_RULESET): boolean {
  return (teammates === opponents || teammates === defaultTeammateDifficulty(opponents)) && standardRules(ruleset, rules);
}

/**
 * The match the records count, in words (countsForRecords): "3v3 · first to 5, 2:30 rounds. Friendly fire on;
 * ricochets don't count. Your teammates at the opponents' level, or Normal against Easy." One text for New game's note
 * and the summary's; `ruleset`'s standard match (M39), Skirmish's by default.
 */
export function standardMatchText(ruleset: RulesetId = DEFAULT_RULESET): string {
  const std = matchRulesSummary(standardRulesOf(ruleset));
  const label = (id: Difficulty) => DIFFICULTIES.find((d) => d.id === id)?.label ?? id;
  const defaults = DIFFICULTIES.filter((d) => defaultTeammateDifficulty(d.id) !== d.id).map(
    (d) => `, or ${label(defaultTeammateDifficulty(d.id))} against ${d.label}`,
  );
  return `${std.value}, ${std.detail} Your teammates at the opponents' level${defaults.join('')}.`;
}

/** "2:30". */
export function formatRoundTime(seconds: number): string {
  return `${Math.floor(seconds / 60)}:${String(Math.round(seconds % 60)).padStart(2, '0')}`;
}

/**
 * New game's Match button: "3v3 · first to 5", and a line with the rest; the Rules picker's switches (M39) only when
 * they differ from Skirmish's, so the standard match reads as it always did.
 */
export function matchRulesSummary(m: MatchRules): { value: string; detail: string } {
  const extra: string[] = [];
  if (m.winByTwo) extra.push('Win by two.');
  if (m.timeOutToMorePlayers) extra.push('Time-out: more players left wins.');
  return {
    value: `${m.teamSize}v${m.teamSize} · first to ${m.winsNeeded}`,
    detail: [`${formatRoundTime(m.roundTime)} rounds. Friendly fire ${m.friendlyFire ? 'on' : 'off'}; ricochets ${m.ricochetsCount ? 'count' : "don't count"}.`, ...extra, ...kitNotes(m)].join(' '),
  };
}

/** The switches every mode plays (the minimap and the kit, M39), as the Match button's short notes. */
function kitNotes(m: MatchRules): string[] {
  const notes: string[] = [];
  if (!m.heardOnMinimap) notes.push('Minimap: teammates only.');
  if (m.semiAutoOnly) notes.push('Semi only.');
  if (m.realcap) notes.push(`Realcap ${REALCAP.magSize} × ${REALCAP.mags}.`);
  if (m.factoryKit) notes.push('Factory kit for everyone.');
  return notes;
}

/**
 * New game's Match button in Extraction (M43): the squad against the map's home team, and the run's time, since a run
 * is one long round (the wins and round time picked don't apply), then the switches a run plays (M53, audit UI-01).
 */
export function runRulesSummary(m: MatchRules, run: { baseOpponents: number; runTime: number }): { value: string; detail: string } {
  return {
    value: `Squad of ${m.teamSize} · ${run.baseOpponents + m.teamSize} in the home team`,
    detail: [`One ${formatRoundTime(run.runTime)} run. Friendly fire ${m.friendlyFire ? 'on' : 'off'}; ricochets ${m.ricochetsCount ? 'count' : "don't count"}.`, ...kitNotes(m)].join(' '),
  };
}
