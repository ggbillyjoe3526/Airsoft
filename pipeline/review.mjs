/**
 * The review gate (pipeline/README.md › `gate.mjs`; owner, 2026-10-16): a pull request that changes more than docs is
 * ready only once the three review agents (critic, QA, performance; `.claude/agents/`) have run and passed, and its
 * description says so in one line:
 *
 *   Review: critic Accept 8/8 · qa Pass · performance Pass
 *
 * Pure functions here; the gate reads the description and the draft flag from CI (GATE_PR_BODY, GATE_PR_DRAFT).
 */

/** The review agents and the verdicts that let a pull request merge. The critic's auto-accept is the owner's 6/8 rule. */
export const REVIEW_AGENTS = {
  critic: ['accept', 'auto-accept'],
  qa: ['pass'],
  performance: ['pass'],
};
const VERDICTS = ['auto-accept', 'accept', 'retry', 'pass', 'fail'];

/** Markdown files the game's build reads (pipeline/build-cached.mjs hashes them): not docs. */
const BUILD_MARKDOWN = new Set(['pool.md', 'stats.md']);

/** True when every changed file is a Markdown doc (the README, CHANGELOG, `docs/`, the agents and skills). */
export function docsOnly(changed) {
  const files = [...changed];
  return files.length > 0 && files.every((f) => f.endsWith('.md') && !BUILD_MARKDOWN.has(f));
}

/**
 * The verdicts in a description's Review line, `{ critic, qa, performance }` (lower case, or null when an agent is not
 * named), or null when there is no Review line. The line may be bold (`**Review:**`) and its separators are free.
 */
export function parseReviewLine(body) {
  const line = String(body ?? '')
    .split(/\r?\n/)
    .map((l) => l.replaceAll('*', '').trim())
    .find((l) => /^review\s*:/i.test(l));
  if (line === undefined) return null;
  const verdicts = {};
  for (const agent of Object.keys(REVIEW_AGENTS)) {
    const m = new RegExp(`\\b${agent}\\b\\s*[:=]?\\s*(${VERDICTS.join('|')})\\b`, 'i').exec(line);
    verdicts[agent] = m ? m[1].toLowerCase() : null;
  }
  return verdicts;
}

/**
 * The review gate's result for a pull request: `{ pass, reason, verdicts? }`, pass null when the gate does not apply
 * (a docs-only change, or a draft: the line is due when the pull request is marked ready).
 */
export function judgeReview({ changed, body, draft }) {
  if (docsOnly(changed)) return { pass: null, reason: 'not required (docs-only change)' };
  if (draft) return { pass: null, reason: 'not yet (a draft; checked once the pull request is ready for review)' };
  const verdicts = parseReviewLine(body);
  if (verdicts === null) {
    return { pass: false, reason: 'no "Review: critic … · qa … · performance …" line in the pull request description; run the three review agents first' };
  }
  const missing = Object.keys(REVIEW_AGENTS).filter((a) => verdicts[a] === null);
  const failing = Object.keys(REVIEW_AGENTS).filter((a) => verdicts[a] !== null && !REVIEW_AGENTS[a].includes(verdicts[a]));
  const problems = [
    ...(missing.length ? [`no verdict for ${missing.join(', ')}`] : []),
    ...failing.map((a) => `${a} says ${verdicts[a]}`),
  ];
  if (problems.length) return { pass: false, reason: `Review line: ${problems.join('; ')}`, verdicts };
  return { pass: true, verdicts };
}
