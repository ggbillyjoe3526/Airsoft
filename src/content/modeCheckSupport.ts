import { MODE_PERF_STAND_INS, PUBLIC_MODES, SHIPPED_MODE_IDS } from '../config/contentRules';
import { ROUNDS } from '../config/hits';
import { DEFAULT_MATCH_RULES, DEFAULT_RULESET, MODE_FIT, type ModeFit, RULESETS, type RulesetId } from '../config/matchRules';
import { MATCH_MODES, type MatchMode, MODE_SHAPES, type ModeShape } from '../config/modes';
import { perfScriptFor } from '../config/perfScript';
import { TEAMS } from '../config/teams';
import { mapData, type MapEntry, MAPS } from '../map/maps';
import type { MapData } from '../map/mapTypes';
import { createRoundState, type RoundState, teamEnd } from '../sim/round';
import { describeRules, type MatchRulesText } from '../ui/menus/rulesText';
import { pauseText, resultText } from '../ui/matchStopText';
import { roundBanner } from '../ui/roundBanner';

/** What the mode checks share (CT3): their context, the places a mode is answered for, and how a mode reads in a result. */

/** A mode as MATCH_MODES lists it. */
export type ModeEntry = (typeof MATCH_MODES)[number];

/**
 * A place in the game that answers for each mode and says something of its own (CT3, docs/content/modes.md › Checks):
 * asked for a mode's answer at the start of a standard match. `own`: a mode other than Elimination must answer in its
 * own words here (the briefing says how a round is won, the banner your job); elsewhere it may share Elimination's.
 */
export interface WiringProbe {
  /** What it is, in words ("the briefing"), and where (`ui/menus/rulesText.ts describeRules`). */
  place: string;
  where: string;
  own: boolean;
  /** The mode's answer as text; throws for a mode it has no answer for. */
  answer(mode: MatchMode, map: MapData): string;
}

/** What the mode checks read besides the mode: the game's tables and registers, the maps and the probes. */
export interface ModeContext {
  /** Every mode listed (MATCH_MODES), so an id is never used twice. */
  modes: readonly ModeEntry[];
  /** Partial so a test can leave a mode out, as a mode the code doesn't know would be. */
  shapes: Readonly<Partial<Record<string, ModeShape>>>;
  fit: Readonly<Partial<Record<string, ModeFit>>>;
  rulesets: readonly { id: RulesetId; label: string }[];
  defaultRuleset: RulesetId;
  /** The match rows (MatchRules' fields) a mode may leave out (MODE_FIT ignores). */
  rows: readonly string[];
  maps: readonly { entry: MapEntry; data: MapData }[];
  publicModes: Readonly<Record<string, string>>;
  shipped: readonly string[];
  perfStandIns: Readonly<Record<string, { by: MatchMode; reason: string }>>;
  probes: readonly WiringProbe[];
}

/** The standard match's text for the briefing, as Game hands it to the menus (game.ts). */
const RULES_TEXT: MatchRulesText = {
  teamSize: ROUNDS.teamSize,
  winsNeeded: ROUNDS.winsNeeded,
  roundTime: ROUNDS.roundTime,
  playerTeam: TEAMS[0]!.name,
  enemyTeam: TEAMS[1]!.name,
  raiseTime: ROUNDS.flag.raiseTime,
  halfTimeAfter: ROUNDS.halfTimeAfter,
  attackFirst: ROUNDS.flag.firstAttackers === 0,
  eliminationStartEnd: teamEnd(0, 'elimination', 1, ROUNDS),
  attackDefendStartEnd: teamEnd(0, 'attackDefend', 1, ROUNDS),
  friendlyFire: true,
  ricochetsCount: false,
};

/** Round 1 of a standard match of `mode` on `map`, just started. */
const roundOne = (mode: MatchMode, map: MapData): RoundState => createRoundState(ROUNDS, mode, map.flag);

/** The same match decided: your team (0) won it 5 to 3, the last round by a knock-out. */
function decided(mode: MatchMode, map: MapData): RoundState {
  const r = roundOne(mode, map);
  return { ...r, phase: 'matchOver', matchWinner: 0, winner: 0, reason: 'eliminated', score: [ROUNDS.winsNeeded, ROUNDS.winsNeeded - 2], number: 2 * ROUNDS.winsNeeded - 2 };
}

/** The game's own places (each a `switch` over the mode with config/modes.ts unknownMode's never-check). */
export const GAME_PROBES: readonly WiringProbe[] = [
  { place: 'the briefing', where: 'ui/menus/rulesText.ts describeRules', own: true, answer: (mode, map) => describeRules(RULES_TEXT, mode, map.extraction) },
  { place: 'the round banner', where: 'ui/roundBanner.ts', own: true, answer: (mode, map) => roundBanner(roundOne(mode, map), 0, true, 0, ROUNDS) },
  { place: 'the pause line', where: 'ui/matchStopText.ts pauseText', own: false, answer: (mode, map) => pauseText(roundOne(mode, map), 0, ROUNDS) },
  { place: 'the end screen', where: 'ui/matchStopText.ts resultText', own: false, answer: (mode, map) => JSON.stringify(resultText(decided(mode, map), 0, ROUNDS.roundTime)) },
  { place: 'the perf run’s script', where: 'config/perfScript.ts perfScriptFor', own: false, answer: (mode) => JSON.stringify(perfScriptFor(mode)) },
];

/**
 * The places answered for at compile time (each a `switch` with the never-check, or a `Record` over every mode), and the
 * three that go by the mode's id with nothing to wire (pay, records, the menus): the report lists them, so the owner sees
 * what a new mode had to answer.
 */
export const COMPILED_PLACES: readonly string[] = [
  'the round rules (sim/round.ts)',
  "the bots' plan (ai/roundPlanner.ts RoundPlanner.plan)",
  'the scoreboard (ui/scoreboard.ts)',
  'what each mode is and needs (config/modes.ts MODE_SHAPES)',
  'the rulesets and rows it offers (config/matchRules.ts MODE_FIT)',
  "the bot-match guards (ai/depotMatchSupport.ts forRoundsMode) and the mode checks' matches (content/modePlay.ts)",
  'pay, by its rounds won and hits (pool/armory.ts matchEarnings), the same for every mode played in rounds',
  "records, by its id (stats/records.ts resultKey)",
  'the menus: its Mode button, from MATCH_MODES, offered where a map hosts it (map/playableMode.ts modeOffered)',
];

/** The game's own context. */
export function gameModeContext(): ModeContext {
  return {
    modes: MATCH_MODES,
    shapes: MODE_SHAPES,
    fit: MODE_FIT,
    rulesets: RULESETS,
    defaultRuleset: DEFAULT_RULESET,
    rows: Object.keys(DEFAULT_MATCH_RULES),
    maps: MAPS.map((entry) => ({ entry, data: mapData(entry.id) })),
    publicModes: PUBLIC_MODES,
    shipped: SHIPPED_MODE_IDS,
    perfStandIns: MODE_PERF_STAND_INS,
    probes: GAME_PROBES,
  };
}

/** A mode's name in a result: its label and id. */
export const modeItem = (mode: Pick<ModeEntry, 'id' | 'label'>): string => `${mode.label} (${mode.id})`;

/** The maps in `ctx` that host `mode`: they have what its shape says it needs. */
export function hostMaps(ctx: ModeContext, mode: string): ModeContext['maps'] {
  const need = ctx.shapes[mode]?.needs;
  if (need === undefined) return [];
  return ctx.maps.filter((m) => need === null || m.data[need] !== undefined);
}

/** What each match row is called in the Match pop-up, for a result (a row this doesn't name reads as its field). */
const ROW_WORDS: Readonly<Record<string, string>> = {
  winsNeeded: 'Rounds to win',
  roundTime: 'Round time',
  teamSize: 'Team size',
  friendlyFire: 'Friendly fire',
  ricochetsCount: 'Ricochets',
  winByTwo: 'Win by two',
  timeOutToMorePlayers: 'Time-out',
  heardOnMinimap: 'Minimap',
  semiAutoOnly: 'Fire mode',
  realcap: 'Magazines',
  factoryKit: 'Kit',
  strictMarshal: 'Strict marshal',
};

export const rowWords = (row: string): string => ROW_WORDS[row] ?? row;

/** A list in words: "a, b and c". */
export function listWords(items: readonly string[]): string {
  return items.length <= 1 ? (items[0] ?? '') : `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}
