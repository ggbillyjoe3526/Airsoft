/**
 * What every content check hands back (CT1, the content toolkit): one result per check and item, in plain words, at one
 * of the four levels. Pure data, so the tests, the report runner and the report's page all read the same thing.
 */

/** The four levels, quickest first (docs/content/README.md): rules, compatibility, the spec test, the balance run. */
export type CheckLevel = 'rules' | 'compatibility' | 'spec' | 'balance';

export const CHECK_LEVELS: readonly CheckLevel[] = ['rules', 'compatibility', 'spec', 'balance'];

/** What the levels are called in a report. */
export const LEVEL_WORDS: Readonly<Record<CheckLevel, string>> = {
  rules: 'Rules',
  compatibility: 'Compatibility',
  spec: 'Spec test',
  balance: 'Balance run',
};

/**
 * A check's verdict. `fail` stops an item going public; `warn` is shown to the owner, who decides; `pass` is fine.
 * `info` is a figure with no verdict (a dev map's balance, a table row).
 */
export type Verdict = 'pass' | 'warn' | 'fail' | 'info';

export interface CheckResult {
  level: CheckLevel;
  /** A short stable id, `<kind>.<check>` (`replica.siteLimit`), so a report and a test can name it. */
  check: string;
  /** The item checked: its pool ID and name ("000002 AEG Rifle"), or what else it is about. */
  item: string;
  verdict: Verdict;
  /** What was found, in plain words a player would follow. */
  says: string;
}

/** A result. */
export function result(level: CheckLevel, check: string, item: string, verdict: Verdict, says: string): CheckResult {
  return { level, check, item, verdict, says };
}

/** The verdicts, worst first. */
const ORDER: readonly Verdict[] = ['fail', 'warn', 'pass', 'info'];

/** The worst verdict among `results` (`pass` for none; `info` never outranks `pass`). */
export function worstVerdict(results: readonly CheckResult[]): Verdict {
  let worst: Verdict = 'pass';
  for (const r of results) if (ORDER.indexOf(r.verdict) < ORDER.indexOf(worst)) worst = r.verdict;
  return worst;
}

/** The results that fail. */
export const failures = (results: readonly CheckResult[]): CheckResult[] => results.filter((r) => r.verdict === 'fail');

/** How an item is named in a result: its ID and name. */
export const itemName = (asset: { id: string; name: string }): string => `${asset.id} ${asset.name}`;

/** A number for a report: at most `digits` decimals, trailing zeros dropped. */
export function num(x: number, digits = 2): string {
  if (!Number.isFinite(x)) return String(x);
  return String(Number(x.toFixed(digits)));
}
