import type { Difficulty } from '../config/bots';
import { RECORDS_KEY, STATS } from '../config/matchInfo';
import type { MatchMode } from '../config/modes';
import { overStored, storedIsNewer } from '../save/overStored';
import type { CaseFind } from '../sim/extraction';

/**
 * Local records, kept in the browser between sessions (M19): wins and losses per difficulty and mode, the best match
 * accuracy and the longest run of match wins. Records only: never levels or unlocks (design rules). Every read and
 * write tolerates blocked storage and garbage, like the settings store.
 */

export const RECORDS_VERSION = 1;

export interface WinLoss {
  wins: number;
  losses: number;
}

export interface Records {
  /**
   * Matches finished, by `${difficulty}.${mode}` (Skirmish, as before M39) and `${difficulty}.${mode}.${ruleset}` (a
   * named ruleset's own cells, M39; config/matchRules.ts RULESETS `records`). Saved apart (RULESET_RESULTS_FIELD), so a
   * build from before M39, which keeps only the first kind, leaves the second in place when it saves.
   */
  results: Partial<Record<string, WinLoss>>;
  /** Best share of BBs on an opponent in one match (0..1), over matches with enough BBs fired; null before one. */
  bestAccuracy: number | null;
  /** Match wins in a row right now, and the most ever (Extraction runs count apart, below). */
  streak: number;
  bestStreak: number;
  /**
   * Extraction (M47): the most FC got out with in one run (null before a run with any), extractions in a row right now
   * and the most ever, and the quickest extraction carrying at least one case's finds (seconds into the run; null before
   * one). Saved beside the rest; a save from before M47 has none and loads as empty ones.
   */
  bestHaul: number | null;
  extractionStreak: number;
  bestExtractionStreak: number;
  fastestExtraction: number | null;
}

/** A finished match, as the records see it. */
export interface MatchResult {
  difficulty: Difficulty;
  mode: MatchMode;
  /** The named ruleset's records name (M39, RULESETS `records`); absent or '' for Skirmish's plain cells. */
  ruleset?: string;
  won: boolean;
  /** Your BBs on an opponent, and BBs fired, over the match. */
  hits: number;
  bbsFired: number;
  /** An Extraction run (M47): `won` is whether you got out; what you got out with and how long it took. */
  run?: RunResult;
}

/** An Extraction run, as the records see it (M47). */
export interface RunResult {
  /** FC got out with (0 when out or caught out). */
  haulFc: number;
  /** Finds (FC or a part, a case's) you got out with. */
  finds: number;
  /** Seconds from the start of the run to its end. */
  seconds: number;
}

/** An Extraction run's record from what you got out with (`runHaul`) and how long the run took (seconds). Pure. */
export function runResultOf(haul: readonly CaseFind[], seconds: number): RunResult {
  let haulFc = 0;
  let finds = 0;
  for (const f of haul) {
    haulFc += f.fc;
    if (f.fc > 0 || f.item) finds++;
  }
  return { haulFc, finds, seconds };
}

/** What a match changed, for the "new record" tags on the summary. */
export interface RecordNews {
  bestAccuracy: boolean;
  bestStreak: boolean;
  /** Extraction's bests (M47). */
  bestHaul: boolean;
  bestExtractionStreak: boolean;
  fastestExtraction: boolean;
}

/** A match that beat no best. */
export function noNews(): RecordNews {
  return { bestAccuracy: false, bestStreak: false, bestHaul: false, bestExtractionStreak: false, fastestExtraction: false };
}

/** Minimal storage (localStorage in the game, a map in tests). */
export interface RecordStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export function emptyRecords(): Records {
  return { results: {}, bestAccuracy: null, streak: 0, bestStreak: 0, bestHaul: null, extractionStreak: 0, bestExtractionStreak: 0, fastestExtraction: null };
}

/** The records cell of a match: `${difficulty}.${mode}`, or with a named ruleset (M39) `${difficulty}.${mode}.${ruleset}`. */
export function resultKey(difficulty: Difficulty, mode: MatchMode, ruleset = ''): string {
  return ruleset ? `${difficulty}.${mode}.${ruleset}` : `${difficulty}.${mode}`;
}

/** "normal.elimination": a difficulty id and a mode id (camel case words). */
const RESULT_KEY = /^[a-z][a-zA-Z0-9]*\.[a-z][a-zA-Z0-9]*$/;
/** "pro.elimination.tournament": the same with a named ruleset's records name (M39). */
const RULESET_RESULT_KEY = /^[a-z][a-zA-Z0-9]*\.[a-z][a-zA-Z0-9]*\.[a-z][a-zA-Z0-9]*$/;
/** Where the named rulesets' cells are saved (M39): beside `results`, which builds before M39 rewrite with what they know. */
const RULESET_RESULTS_FIELD = 'rulesetResults';

const count = (v: unknown): number => (typeof v === 'number' && Number.isInteger(v) && v >= 0 ? v : 0);

/** The saved records, or empty ones if nothing valid is saved (or storage is blocked). Bad fields are dropped one by one. */
export function loadRecords(store: RecordStore | null): Records {
  const records = emptyRecords();
  if (!store) return records;
  try {
    const raw: unknown = JSON.parse(store.getItem(RECORDS_KEY) ?? 'null');
    if (!raw || typeof raw !== 'object' || (raw as { version?: unknown }).version !== RECORDS_VERSION) return records;
    const r = raw as Record<string, unknown>;
    // Only keys shaped like resultKey's (audit POOL-21); a difficulty, mode or ruleset this build doesn't know is kept,
    // so a save from a newer build keeps its records when an older one writes it back.
    readResults(records, r.results, RESULT_KEY);
    readResults(records, r[RULESET_RESULTS_FIELD], RULESET_RESULT_KEY);
    const best = r.bestAccuracy;
    if (typeof best === 'number' && best >= 0 && best <= 1) records.bestAccuracy = best;
    records.streak = count(r.streak);
    records.bestStreak = Math.max(count(r.bestStreak), records.streak);
    // Extraction's (M47): absent from older saves, which load as empty ones.
    const haul = r.bestHaul;
    if (typeof haul === 'number' && Number.isInteger(haul) && haul > 0) records.bestHaul = haul;
    records.extractionStreak = count(r.extractionStreak);
    records.bestExtractionStreak = Math.max(count(r.bestExtractionStreak), records.extractionStreak);
    const fastest = r.fastestExtraction;
    if (typeof fastest === 'number' && Number.isFinite(fastest) && fastest > 0) records.fastestExtraction = fastest;
  } catch {
    // Unreadable: treated as nothing saved.
  }
  return records;
}

/** Adds the win and loss counts saved in `raw` under keys `shape` accepts to `records`. */
function readResults(records: Records, raw: unknown, shape: RegExp): void {
  if (!raw || typeof raw !== 'object') return;
  for (const [key, v] of Object.entries(raw as Record<string, unknown>)) {
    if (!shape.test(key) || !v || typeof v !== 'object') continue;
    const wl = v as Record<string, unknown>;
    records.results[key] = { wins: count(wl.wins), losses: count(wl.losses) };
  }
}

/**
 * Saves the records. Non-critical: if storage is blocked they last for the session only, as they do over records from
 * a newer version of the store (M56, audit POOL-01: loadRecords doesn't read those, so writing would wipe them).
 */
export function saveRecords(records: Records, store: RecordStore | null): void {
  if (!store) return;
  try {
    if (storedIsNewer(store, RECORDS_KEY, RECORDS_VERSION)) return;
    // The named rulesets' cells (M39) go beside the plain ones (RULESET_RESULTS_FIELD).
    const results: Partial<Record<string, WinLoss>> = {};
    const rulesetResults: Partial<Record<string, WinLoss>> = {};
    for (const [key, wl] of Object.entries(records.results)) (RULESET_RESULT_KEY.test(key) ? rulesetResults : results)[key] = wl;
    const fresh = { version: RECORDS_VERSION, ...records, results, ...(Object.keys(rulesetResults).length > 0 ? { [RULESET_RESULTS_FIELD]: rulesetResults } : {}) };
    // Fields a newer build added stay (M31).
    store.setItem(RECORDS_KEY, JSON.stringify(overStored(store, RECORDS_KEY, fresh)));
  } catch {
    // Non-critical.
  }
}

/**
 * Adds a finished match to `records` (in place) and says which bests it beat. An Extraction run (M47, `m.run`) counts
 * as a run and an extraction in its cell and keeps its own streak and bests; it leaves the match-win streak alone.
 */
export function addMatch(records: Records, m: MatchResult): RecordNews {
  const news = noNews();
  const key = resultKey(m.difficulty, m.mode, m.ruleset);
  const wl = (records.results[key] ??= { wins: 0, losses: 0 });
  if (m.won) wl.wins++;
  else wl.losses++;

  if (m.run) addRun(records, m.run, m.won, news);
  else {
    records.streak = m.won ? records.streak + 1 : 0;
    news.bestStreak = records.streak > records.bestStreak;
    if (news.bestStreak) records.bestStreak = records.streak;
  }

  if (m.bbsFired >= STATS.minBBsForAccuracyRecord) {
    const acc = m.hits / m.bbsFired;
    if (records.bestAccuracy === null || acc > records.bestAccuracy) {
      records.bestAccuracy = acc;
      news.bestAccuracy = true;
    }
  }
  return news;
}

/** An Extraction run's streak and bests (M47): a run you got out of extends the streak, any other ends it. */
function addRun(records: Records, run: RunResult, extracted: boolean, news: RecordNews): void {
  records.extractionStreak = extracted ? records.extractionStreak + 1 : 0;
  news.bestExtractionStreak = records.extractionStreak > records.bestExtractionStreak;
  if (news.bestExtractionStreak) records.bestExtractionStreak = records.extractionStreak;
  if (!extracted) return;
  if (run.haulFc > 0 && (records.bestHaul === null || run.haulFc > records.bestHaul)) {
    records.bestHaul = run.haulFc;
    news.bestHaul = true;
  }
  if (run.finds > 0 && (records.fastestExtraction === null || run.seconds < records.fastestExtraction)) {
    records.fastestExtraction = run.seconds;
    news.fastestExtraction = true;
  }
}
