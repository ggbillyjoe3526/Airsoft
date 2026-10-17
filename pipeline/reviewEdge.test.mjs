import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { docsOnly, judgeReview, parseReviewLine } from './review.mjs';
import { reportFor } from './packet.mjs';

/** QA edge cases for the review gate (pipeline/review.mjs) and its wiring in gate.mjs, check.yml and packet.mjs. */
const CODE = new Set(['src/sim/step.ts']);
const GOOD = 'Review: critic Accept 8/8 · qa Pass · performance Pass';
const judge = (body, extra = {}) => judgeReview({ changed: CODE, body, draft: false, ...extra });

describe('docsOnly: the Markdown tables the build reads are not docs', () => {
  const buildCached = readFileSync(new URL('./build-cached.mjs', import.meta.url), 'utf8');
  const tables = ['levels.md', 'bots.md', 'bot-kits.md', 'callouts.md', 'pool.md', 'stats.md'];
  it('build-cached.mjs hashes data/, where the tables live (sanity, DX7)', () => {
    expect(buildCached).toMatch(/INPUT_DIRS = \[[^\]]*'data\/'/);
    for (const f of tables) expect(existsSync(new URL(`../data/${f}`, import.meta.url)), f).toBe(true);
  });
  it.each(tables)('data/%s needs the review line', (f) => {
    expect(docsOnly(new Set([`data/${f}`]))).toBe(false);
  });
  it('a root .md that is not a listed doc counts as code', () => {
    for (const f of tables) expect(docsOnly(new Set([f])), f).toBe(false);
  });
  it('nested README and docs files are docs; a docs/ file named like a build input is still docs', () => {
    expect(docsOnly(new Set(['src/ai/README.md', 'docs/foo.md', 'docs/pool.md']))).toBe(true);
  });
  it('is false for a non-Markdown file beside docs, and for .md lookalikes', () => {
    expect(docsOnly(new Set(['docs/a.md', 'docs/a.md.ts']))).toBe(false);
    expect(docsOnly(new Set(['docs/a.mdx']))).toBe(false);
    expect(docsOnly(new Set(['docs/img.png', 'docs/a.md']))).toBe(false);
  });
  it('accepts any iterable (an array) of changed files', () => {
    expect(docsOnly(['README.md'])).toBe(true);
  });
});

describe('parseReviewLine edge cases', () => {
  it('reads CRLF bodies and a bold label', () => {
    expect(parseReviewLine(`Intro\r\n**Review:** critic Accept · qa Pass · performance Pass\r\nMore\r\n`)).toEqual({ critic: 'accept', qa: 'pass', performance: 'pass' });
  });
  it('is case-insensitive and tolerates separators', () => {
    expect(parseReviewLine('review: Critic=ACCEPT, QA: PASS, Performance - pass')).toMatchObject({ critic: 'accept', qa: 'pass' });
  });
  it('does not take "qa" or "critic" inside other words', () => {
    expect(parseReviewLine('Review: critic Accept · aqa Pass · performance Pass').qa).toBeNull();
    expect(parseReviewLine('Review: critic Accept · qa Pass · nonperformance Pass').performance).toBeNull();
    expect(parseReviewLine('Review: criticism Accept · qa Pass · performance Pass').critic).toBeNull();
  });
  it('does not accept a verdict word that merely starts with a good one', () => {
    expect(parseReviewLine('Review: critic Acceptable · qa Passed · performance Passable')).toEqual({ critic: null, qa: null, performance: null });
  });
  it('only a line starting with "Review:" counts, not prose that contains it', () => {
    expect(parseReviewLine('See the Review: critic Accept · qa Pass · performance Pass above')).toBeNull();
  });
  it('first Review line wins when there are several (documented behaviour)', () => {
    const body = 'Review: critic Retry · qa Fail · performance Pass\nReview: critic Accept · qa Pass · performance Pass';
    expect(judge(body).pass).toBe(false);
    expect(judge(`${GOOD}\nReview: critic Retry · qa Fail · performance Fail`).pass).toBe(true);
  });
  it('a bare "critic Accept qa Pass performance Pass" with no Review label is no line', () => {
    expect(parseReviewLine('critic Accept · qa Pass · performance Pass')).toBeNull();
  });
});

describe('judgeReview: a description that was not filled in must not pass', () => {
  it('fails an empty, null or undefined description', () => {
    for (const body of ['', null, undefined]) expect(judge(body)).toMatchObject({ pass: false });
  });
  it('fails an unfilled template placeholder', () => {
    expect(judge('Review: critic … · qa … · performance …').pass).toBe(false);
    expect(judge('## Review:\n\n').pass).toBe(false);
    expect(judge('Review: critic <Accept n/8> · qa <Pass|Fail> · performance <Pass|Fail>').pass).toBe(false);
  });
  it('fails a template that lists the choices instead of choosing one (Accept/Retry, Pass/Fail)', () => {
    expect(judge('Review: critic Accept/Retry · qa Pass/Fail · performance Pass/Fail').pass).toBe(false);
  });
  it('fails when the template also lists the choices as "Pass or Fail"', () => {
    expect(judge('Review: critic Accept or Retry · qa Pass or Fail · performance Pass or Fail').pass).toBe(false);
  });
  it('reason names the missing agents and the failing ones, for failures.md', () => {
    const r = judge('Review: critic Retry · qa Pass');
    expect(r.pass).toBe(false);
    expect(r.reason).toMatch(/critic says retry/);
    expect(r.reason).toMatch(/no verdict for performance/);
  });
  it('a qa Fail or performance Fail fails even when the critic accepted', () => {
    expect(judge('Review: critic Accept · qa Fail · performance Pass').reason).toMatch(/qa says fail/);
    expect(judge('Review: critic Accept · qa Pass · performance Fail').reason).toMatch(/performance says fail/);
  });
  it('the critic must not be able to pass with a QA-style verdict', () => {
    expect(judge('Review: critic Pass · qa Accept · performance Accept').pass).toBe(false);
  });
});

describe('judgeReview: drafts and docs-only', () => {
  it('a draft is not judged, even with a failing line; a non-draft with the same line is', () => {
    const bad = 'Review: critic Retry · qa Fail · performance Fail';
    expect(judge(bad, { draft: true }).pass).toBeNull();
    expect(judge(bad, { draft: false }).pass).toBe(false);
  });
  it('docs-only wins over everything, including a failing line', () => {
    expect(judgeReview({ changed: new Set(['docs/a.md']), body: 'Review: critic Retry · qa Fail · performance Fail', draft: false }).pass).toBeNull();
  });
  it('an empty diff is judged (not docs only)', () => {
    expect(judgeReview({ changed: new Set(), body: '', draft: false }).pass).toBe(false);
  });
});

describe('wiring: gate.mjs, check.yml', () => {
  const gate = readFileSync(new URL('./gate.mjs', import.meta.url), 'utf8');
  const yml = readFileSync(new URL('../.github/workflows/check.yml', import.meta.url), 'utf8');
  it('only the literal "true"/"false" make a pull request (a push has an empty draft value)', () => {
    expect(gate).toMatch(/isPullRequest = prDraft === 'true' \|\| prDraft === 'false'/);
    expect(gate).toMatch(/draft: prDraft === 'true'/);
  });
  it('the review gate is skipped by --only tests and --only smoke (skipAllBut)', () => {
    expect(gate).toMatch(/if \(skipAllBut\('review'\)\)/);
  });
  it('check.yml triggers on ready_for_review and edited, and passes the body and draft flag', () => {
    expect(yml).toMatch(/types: \[[^\]]*ready_for_review/);
    expect(yml).toMatch(/types: \[[^\]]*\bedited\b/);
    expect(yml).toMatch(/GATE_PR_BODY: \$\{\{ github\.event\.pull_request\.body \}\}/);
    expect(yml).toMatch(/GATE_PR_DRAFT: \$\{\{ github\.event\.pull_request\.draft \}\}/);
  });
  it('the job that runs the full gate (with --ci and no --only) is the one given the env', () => {
    const idx = yml.indexOf('GATE_PR_BODY');
    const before = yml.slice(0, idx);
    const stepStart = before.lastIndexOf('- name:');
    const step = yml.slice(stepStart, yml.indexOf('\n      - ', idx) > 0 ? yml.indexOf('\n      - ', idx) : undefined);
    expect(step).toMatch(/--ci/);
    expect(step).not.toMatch(/--only/);
  });
});

describe('gate end to end (simulated CI, review gate only)', () => {
  const run = (env) => {
    try {
      const out = execFileSync(process.execPath, ['-e', `
        import('./pipeline/review.mjs').then(({ judgeReview }) => {
          const r = judgeReview({ changed: new Set(['src/a.ts']), body: process.env.GATE_PR_BODY ?? '', draft: process.env.GATE_PR_DRAFT === 'true' });
          console.log(JSON.stringify(r));
        });`], { cwd: new URL('..', import.meta.url), env: { ...process.env, ...env }, encoding: 'utf8' });
      return JSON.parse(out);
    } catch (e) {
      return { error: String(e) };
    }
  };
  it('reads the body from the environment', () => {
    expect(run({ GATE_PR_BODY: GOOD, GATE_PR_DRAFT: 'false' }).pass).toBe(true);
    expect(run({ GATE_PR_BODY: 'nothing', GATE_PR_DRAFT: 'false' }).pass).toBe(false);
  });
});

describe('reportFor (packet.mjs) with no task id', () => {
  it('quotes a "Task: none" report, case-insensitively, and nothing else', () => {
    expect(reportFor('task: NONE · QA commit abc · Verdict: Pass\nok', [])).toContain('Verdict');
    expect(reportFor('Task: nonexistent', [])).toBeNull();
    expect(reportFor('Task: M99 · QA', [])).toBeNull();
    expect(reportFor('', [])).toBeNull();
  });
  it('does not quote a "Task: none" report for a real task', () => {
    expect(reportFor('Task: none · QA', ['M99'])).toBeNull();
  });
  it('ignores a CRLF-ended first line safely', () => {
    expect(reportFor('Task: none · Verdict: Pass\r\nok', [])).not.toBeNull();
  });
});

describe('after the choice-list fix (7aab146)', () => {
  it('root docs are README, CHANGELOG, CLAUDE only; any other root .md is code', () => {
    expect(docsOnly(new Set(['README.md', 'CHANGELOG.md', 'CLAUDE.md']))).toBe(true);
    expect(docsOnly(new Set(['newmode.md']))).toBe(false);
  });
  it('the usual "8/8" score after a verdict does not read as a choice list', () => {
    expect(parseReviewLine('Review: critic Accept 8/8 · qa Pass · performance Pass')).toEqual({ critic: 'accept', qa: 'pass', performance: 'pass' });
  });
  it('comma, semicolon, dash and slash-free separators still work', () => {
    expect(judge('Review: critic Accept, qa Pass; performance Pass').pass).toBe(true);
    expect(judge('Review: critic Accept - qa Pass - performance Pass').pass).toBe(true);
  });
  it('reads "|" used as the separator between agents', () => {
    expect(judge('Review: critic Accept 8/8 | qa Pass | performance Pass').pass).toBe(true);
  });
});
