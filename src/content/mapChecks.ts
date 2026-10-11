import type { MapEntry } from '../map/maps';
import type { MapData } from '../map/mapTypes';
import { type CheckResult, result } from './checks';
import { gameMapContext, type MapContext, mapItem } from './mapCheckSupport';
import { mapLayoutChecks } from './mapLayoutChecks';
import { mapRules } from './mapRules';

/**
 * A map's checks (CT2; the rulebook is docs/content/maps.md): levels 1 to 3 of the content toolkit for every map in
 * map/maps.ts MAPS, pure over the map's entry, its data and the context (the game's own rules, or one with a fault in it
 * in the checks' tests). Level 1 is mapRules.ts, level 2 (the layout, measured against Depot's) mapLayoutChecks.ts; here
 * is the spec test's fast part and `checkMap`, and every check is re-exported for the report and the tests.
 */

export * from './mapCheckSupport';
export * from './mapLayoutChecks';
export * from './mapRules';

/** What the map checks read of pipeline/perf-budget.json: the gate's matrix and the matrix's short map names. */
export interface PerfBudget {
  matrix: readonly { map: string; mode: string; preset: string }[];
  budgetPreset: string;
  mapIds?: Readonly<Record<string, string>>;
}

/** The name the perf matrix and run files give the map with game id `id` (its id unless `mapIds` gives a short one). */
export function perfMapName(budget: PerfBudget, id: string): string {
  return Object.entries(budget.mapIds ?? {}).find(([, game]) => game === id)?.[0] ?? id;
}

/**
 * The perf gate measures the map: perf-budget.json's matrix runs it on the budget preset in Elimination, and in
 * Extraction if it has the data, so a change that makes it slower fails a pull request. (The run itself is the content
 * check's spec test, `node pipeline/content-check.mjs map:<id>`.)
 */
export function mapPerfCheck(entry: MapEntry, map: MapData, budget: PerfBudget): CheckResult {
  const name = perfMapName(budget, entry.id);
  const modes = ['elimination', ...(map.extraction ? ['extraction'] : [])];
  const missing = modes.filter((mode) => !budget.matrix.some((r) => r.map === name && r.mode === mode && r.preset === budget.budgetPreset));
  const item = mapItem(entry);
  if (missing.length > 0) return result('spec', 'map.perfGate', item, 'fail', `The perf gate never measures it in ${missing.join(' or ')}: add {"map": "${name}", "mode": "${missing[0]}", "preset": "${budget.budgetPreset}"} to pipeline/perf-budget.json's matrix (and its baseline).`);
  return result('spec', 'map.perfGate', item, 'pass', `The perf gate measures it on ${budget.budgetPreset} in ${modes.join(' and ')} (as "${name}").`);
}

/** Levels 1 and 2 for one map, and the spec test's perf gate check. */
export function checkMap(entry: MapEntry, map: MapData, budget: PerfBudget, ctx: MapContext = gameMapContext()): CheckResult[] {
  return [...mapRules(entry, map, ctx), ...mapLayoutChecks(entry, map, ctx), mapPerfCheck(entry, map, budget)];
}
