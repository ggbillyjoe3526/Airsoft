import { DIFFICULTIES, type Difficulty } from '../config/bots';
import { MODE_PLAY_TEST } from '../config/contentRules';
import { squadSize } from '../config/extraction';
import { type MatchRules, offersRow, ROUND_TIME_SETTING, WINS_NEEDED_CHOICES, type RuleSwitch, rulesForMode, type RulesetId, rulesetOf, standardRulesOf } from '../config/matchRules';
import { type MatchMode, MODE_SHAPES } from '../config/modes';
import type { MapEntry } from '../map/maps';
import { type CheckResult, result } from './checks';
import { perfMapName, type PerfBudget } from './mapChecks';
import { gameModeContext, hostMaps, listWords, type ModeContext, type ModeEntry, modeItem, rowWords } from './modeCheckSupport';

import { modeRules, pinnedModes } from './modeRules';

/** A quality preset's name as Settings shows it ("low" is Low). */
const presetWords = (preset: string): string => preset.charAt(0).toUpperCase() + preset.slice(1);

/**
 * A mode's checks (CT3; the rulebook is docs/content/modes.md): levels 1 to 3 of the content toolkit for every mode in
 * config/modes.ts MATCH_MODES, pure over the mode's entry and the context (the game's own, or one with a fault in it in
 * the checks' tests). Level 1 is modeRules.ts; here is level 2's fit with the rulesets and the match rows, the spec
 * test's perf gate check and `checkMode`. Level 2's short matches and level 4 run in the report's runners
 * (src/content/report/mode.report.ts, mapBalance.report.ts) and, a pairing each, in modeChecks.test.ts.
 */

export * from './modeCheckSupport';
export * from './modeRules';

/**
 * The rulesets it offers (config/matchRules.ts MODE_FIT) are real ones, the standard one among them (New game starts
 * there), and the others are hidden while it is picked: the menu's greying out, said.
 */
export function rulesetFit(mode: ModeEntry, ctx: ModeContext): CheckResult {
  const item = modeItem(mode);
  const fit = ctx.fit[mode.id];
  if (!fit) return result('compatibility', 'mode.rulesets', item, 'fail', 'Nothing says which rulesets it offers (config/matchRules.ts MODE_FIT).');
  const unknown = fit.rulesets.filter((id) => !ctx.rulesets.some((r) => r.id === id));
  if (unknown.length > 0) return result('compatibility', 'mode.rulesets', item, 'fail', `It offers rulesets that don't exist: ${listWords(unknown)}.`);
  const label = (id: string) => ctx.rulesets.find((r) => r.id === id)?.label ?? id;
  if (!fit.rulesets.includes(ctx.defaultRuleset)) return result('compatibility', 'mode.rulesets', item, 'fail', `It doesn't offer ${label(ctx.defaultRuleset)}, the ruleset New game starts on.`);
  const hidden = ctx.rulesets.filter((r) => !fit.rulesets.includes(r.id)).map((r) => r.label);
  return result('compatibility', 'mode.rulesets', item, 'pass', `It offers ${listWords(fit.rulesets.map(label))}${hidden.length > 0 ? `; the Rules row hides ${listWords(hidden)} while it is picked` : ''}.`);
}

/** The match rows it plays no part in are real rows, hidden while it is picked (MODE_FIT ignores). */
export function rowFit(mode: ModeEntry, ctx: ModeContext): CheckResult {
  const item = modeItem(mode);
  const ignores = ctx.fit[mode.id]?.ignores ?? [];
  const unknown = ignores.filter((row) => !ctx.rows.includes(row));
  if (unknown.length > 0) return result('compatibility', 'mode.rows', item, 'fail', `It hides match rows that don't exist: ${listWords(unknown)}.`);
  return result('compatibility', 'mode.rows', item, 'pass', ignores.length > 0 ? `The Match pop-up hides ${listWords(ignores.map(rowWords))} while it is picked; every other row plays.` : 'Every Match pop-up row plays a part in it.');
}

/**
 * The perf gate measures it (pipeline/perf-budget.json's matrix, on the budget preset), or another mode's runs stand for
 * it with a reason (config/contentRules.ts MODE_PERF_STAND_INS). The spec test runs it on every map either way.
 */
export function modePerfCheck(mode: ModeEntry, budget: PerfBudget, ctx: ModeContext): CheckResult {
  const item = modeItem(mode);
  const maps = hostMaps(ctx, mode.id).filter((m) => budget.matrix.some((r) => r.map === perfMapName(budget, m.entry.id) && r.mode === mode.id && r.preset === budget.budgetPreset));
  if (maps.length > 0) return result('spec', 'mode.perfGate', item, 'pass', `The perf gate measures it on ${presetWords(budget.budgetPreset)} on ${listWords(maps.map((m) => m.entry.label))}.`);
  const stand = ctx.perfStandIns[mode.id];
  if (stand) {
    const by = ctx.modes.find((m) => m.id === stand.by)?.label ?? stand.by;
    return result('spec', 'mode.perfGate', item, 'pass', `The perf gate's ${by} runs stand for it: ${stand.reason}.`);
  }
  return result('spec', 'mode.perfGate', item, 'fail', `The perf gate never measures it: add {"map": "${perfMapName(budget, hostMaps(ctx, mode.id)[0]?.entry.id ?? 'depot')}", "mode": "${mode.id}", "preset": "${budget.budgetPreset}"} to pipeline/perf-budget.json's matrix (and its baseline), or a stand-in with a reason to config/contentRules.ts MODE_PERF_STAND_INS.`);
}

/** One pairing of the compatibility check's grid: a short match of the mode under these picks. */
export interface ModePairing {
  /** What differs from the standard match, in words ("Tournament", "Hard", "1v1", "Custom, ricochets count"). */
  label: string;
  ruleset: RulesetId;
  level: Difficulty;
  rules: MatchRules;
}

/** The Custom switches a match plays differently under (the minimap's is the HUD's alone; strict marshal is inert). */
const PLAYED_SWITCHES: readonly { field: RuleSwitch; on: string; off: string }[] = [
  { field: 'friendlyFire', on: 'friendly fire on', off: 'friendly fire off' },
  { field: 'ricochetsCount', on: 'ricochets count', off: "ricochets don't count" },
  { field: 'winByTwo', on: 'win by two', off: 'no win by two' },
  { field: 'timeOutToMorePlayers', on: 'a time-out goes to more players left', off: 'a time-out is a draw' },
  { field: 'semiAutoOnly', on: 'semi only', off: 'any fire mode' },
  { field: 'realcap', on: 'realcap magazines', off: 'own magazines' },
  { field: 'factoryKit', on: 'factory kit', off: 'own kit' },
];

/**
 * The compatibility check's grid for `mode` on `map` (CT3): the standard match (the default ruleset, Normal, the map's
 * standard team size), then one thing changed at a time: every other ruleset it offers, every other level, every other
 * team size the map offers, every other Rounds to win, every Custom switch it plays flipped and the shortest round time.
 * One at a time keeps it to a short match each (MODE_PLAY_TEST.seconds); a pairing the Match pop-up hides (MODE_FIT) is
 * not played.
 */
export function modePairings(mode: MatchMode, map: Pick<MapEntry, 'teamSize'>, defaultRuleset: RulesetId, rulesets: readonly RulesetId[]): ModePairing[] {
  const size = map.teamSize.standard;
  const under = (ruleset: RulesetId, change: Partial<MatchRules> = {}): MatchRules => rulesForMode(mode, ruleset, { ...standardRulesOf(ruleset), teamSize: size, ...change });
  const standard: ModePairing = { label: 'the standard match', ruleset: defaultRuleset, level: 'normal', rules: under(defaultRuleset) };
  const out: ModePairing[] = [standard];
  for (const r of rulesets.filter((r) => r !== defaultRuleset && r !== 'custom')) out.push({ ...standard, label: rulesetOf(r).label, ruleset: r, rules: under(r) });
  for (const d of DIFFICULTIES.filter((d) => d.id !== standard.level)) out.push({ ...standard, label: d.label, level: d.id });
  // Every team size the map offers (from its smallest: BP3, Woodland's 5 to 6 played 1v1 to 4v4 here, which the game
  // never allows); a run ignores the smallest, as New game does (playedTeamSize), and its squad is squadSize of the
  // pick, so one pick per squad it makes.
  const run = MODE_SHAPES[mode].play === 'run';
  const from = run ? 1 : map.teamSize.min;
  const picks = Array.from({ length: map.teamSize.max - from + 1 }, (_, i) => i + from).filter((n) => n !== size);
  const sizes = run ? picks.filter((n, i) => squadSize(n) !== squadSize(size) && picks.findIndex((m) => squadSize(m) === squadSize(n)) === i) : picks;
  if (offersRow(defaultRuleset, 'teamSize', mode)) for (const n of sizes) out.push({ ...standard, label: `${n}v${n}`, rules: under(defaultRuleset, { teamSize: n }) });
  // Every Rounds to win choice (the ruleset New game starts on offers the row, or Custom does).
  const winsRuleset = offersRow(defaultRuleset, 'winsNeeded', mode) ? defaultRuleset : offersRow('custom', 'winsNeeded', mode) && rulesets.includes('custom') ? 'custom' : null;
  if (winsRuleset) {
    for (const c of WINS_NEEDED_CHOICES.map((c) => Number(c.id)).filter((n) => n !== standard.rules.winsNeeded)) {
      out.push({ ...standard, label: `${winsRuleset === 'custom' ? 'Custom, ' : ''}first to ${c}`, ruleset: winsRuleset, rules: under(winsRuleset, { winsNeeded: c }) });
    }
  }
  if (rulesets.includes('custom')) {
    const custom = standardRulesOf('custom');
    for (const s of PLAYED_SWITCHES.filter((s) => offersRow('custom', s.field, mode))) out.push({ ...standard, label: `Custom, ${custom[s.field] ? s.off : s.on}`, ruleset: 'custom', rules: under('custom', { [s.field]: !custom[s.field] }) });
    if (offersRow('custom', 'roundTime', mode)) out.push({ ...standard, label: `Custom, ${ROUND_TIME_SETTING.min} s rounds`, ruleset: 'custom', rules: under('custom', { roundTime: ROUND_TIME_SETTING.min }) });
  }
  return out;
}

/** The seconds each pairing plays. */
export const PAIRING_SECONDS = MODE_PLAY_TEST.seconds;

/** Levels 1 and 2 (their fast part) and the spec test's perf gate check for one mode. */
export function checkMode(mode: ModeEntry, budget: PerfBudget, ctx: ModeContext = gameModeContext()): CheckResult[] {
  return [...modeRules(mode, ctx), rulesetFit(mode, ctx), rowFit(mode, ctx), modePerfCheck(mode, budget, ctx)];
}

/** Every mode's checks, and the one over the list (every pinned id still a mode). */
export function checkModes(budget: PerfBudget, ctx: ModeContext = gameModeContext()): CheckResult[] {
  return [pinnedModes(ctx), ...ctx.modes.flatMap((m) => checkMode(m, budget, ctx))];
}
