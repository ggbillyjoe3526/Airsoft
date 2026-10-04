import { defaultTeammateDifficulty, type Difficulty, DIFFICULTIES } from './bots';
import type { Tagged } from './content';
import type { Switch } from './controls';
import { HITS, type HitConfig, ROUNDS } from './hits';

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
}

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

/** Players per team. Depot has room for three a side; bigger teams wait for bigger fields (v0.2). */
export const TEAM_SIZE_CHOICES: readonly MatchChoice[] = [
  { id: '1', label: '1v1', blurb: 'You against one bot: no teammates, nobody to cover you.' },
  { id: '2', label: '2v2', blurb: 'You and one bot teammate against two bots.' },
  { id: '3', label: '3v3', blurb: 'You and two bot teammates against three bots.' },
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

/** The match the game always had: 3v3, first to 5, 2:30 rounds, friendly fire on, ricochets don't count (owner). */
export const DEFAULT_MATCH_RULES: MatchRules = {
  winsNeeded: ROUNDS.winsNeeded,
  roundTime: ROUNDS.roundTime,
  teamSize: ROUNDS.teamSize,
  friendlyFire: true,
  ricochetsCount: false,
};

/**
 * The match flow for `m` (ROUNDS with the picked numbers). Half-time comes after `winsNeeded - 1` rounds (first to 5:
 * after 4, as before), so the decider of a full-length match is always played in the second half.
 */
export function roundRulesFor(m: MatchRules) {
  return { ...ROUNDS, teamSize: m.teamSize, winsNeeded: m.winsNeeded, roundTime: m.roundTime, halfTimeAfter: Math.max(1, m.winsNeeded - 1) };
}

/** The hit rules for `m` (friendly fire and ricochets; the hit volumes and walk-off stay as they are). */
export function hitRulesFor(m: MatchRules): HitConfig {
  return { ...HITS, friendlyFire: m.friendlyFire, ricochetsCount: m.ricochetsCount };
}

/**
 * Whether a match counts towards the records (M20): the standard match (DEFAULT_MATCH_RULES) with your bot teammates at
 * the opponents' level, as every match was before M20, or at the level the game gives them by default
 * (defaultTeammateDifficulty: Normal against Easy, audit AI-03), so a player who changed nothing is always counted. The
 * records grid is per opponents' difficulty and mode, so a 1v1 first to 3, or Hard opponents with Easy teammates at
 * your side, would mix easier or shorter matches into the same cell.
 */
export function countsForRecords(rules: MatchRules, opponents: Difficulty, teammates: Difficulty): boolean {
  const d = DEFAULT_MATCH_RULES;
  return (
    (teammates === opponents || teammates === defaultTeammateDifficulty(opponents)) &&
    rules.winsNeeded === d.winsNeeded &&
    rules.roundTime === d.roundTime &&
    rules.teamSize === d.teamSize &&
    rules.friendlyFire === d.friendlyFire &&
    rules.ricochetsCount === d.ricochetsCount
  );
}

/**
 * The match the records count, in words (countsForRecords): "3v3 · first to 5, 2:30 rounds. Friendly fire on;
 * ricochets don't count. Your teammates at the opponents' level, or Normal against Easy." One text for New game's note
 * and the summary's.
 */
export function standardMatchText(): string {
  const std = matchRulesSummary(DEFAULT_MATCH_RULES);
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

/** New game's Match button: "3v3 · first to 5", and a line with the rest. */
export function matchRulesSummary(m: MatchRules): { value: string; detail: string } {
  return {
    value: `${m.teamSize}v${m.teamSize} · first to ${m.winsNeeded}`,
    detail: `${formatRoundTime(m.roundTime)} rounds. Friendly fire ${m.friendlyFire ? 'on' : 'off'}; ricochets ${m.ricochetsCount ? 'count' : "don't count"}.`,
  };
}

/**
 * New game's Match button in Extraction (M43): the squad against the map's home team, and the run's time, since a run
 * is one long round (the wins and round time picked don't apply).
 */
export function runRulesSummary(m: MatchRules, run: { baseOpponents: number; runTime: number }): { value: string; detail: string } {
  return {
    value: `Squad of ${m.teamSize} · ${run.baseOpponents + m.teamSize} in the home team`,
    detail: `One ${formatRoundTime(run.runTime)} run. Friendly fire ${m.friendlyFire ? 'on' : 'off'}; ricochets ${m.ricochetsCount ? 'count' : "don't count"}.`,
  };
}
