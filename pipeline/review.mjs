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

/**
 * The Markdown files at the repository's root that are docs. Every other root `.md` counts as code until it is listed
 * here, and so does all of `data/`: the hand-edited tables the build reads (`pool.md`, `stats.md`, `levels.md`,
 * `bots.md`, `bot-kits.md`, `callouts.md`: pipeline/build-cached.mjs › INPUT_DIRS, DX7).
 */
const ROOT_DOCS = new Set(['README.md', 'CHANGELOG.md', 'CLAUDE.md']);
const DATA_DIR = 'data/';

/** True when every changed file is a Markdown doc (the root docs above, `docs/`, the agents, skills and folder READMEs). */
export function docsOnly(changed) {
  const files = [...changed];
  return files.length > 0 && files.every((f) => f.endsWith('.md') && !f.startsWith(DATA_DIR) && (f.includes('/') || ROOT_DOCS.has(f)));
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
    // A verdict followed by "/", "|" or "or" and another verdict is a template's list of choices ("Accept/Retry",
    // "Pass or Fail"), not one; "Accept 8/8" and "|" between agents still read.
    const choice = `(?!\\s*(?:/|\\||or\\b)\\s*(?:${VERDICTS.join('|')})\\b)`;
    const m = new RegExp(`\\b${agent}\\b\\s*[:=]?\\s*(${VERDICTS.join('|')})\\b${choice}`, 'i').exec(line);
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
