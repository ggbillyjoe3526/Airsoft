import { describe, expect, it } from 'vitest';
import { docsOnly, judgeReview, parseReviewLine } from './review.mjs';

const CODE = new Set(['src/sim/step.ts', 'docs/ROADMAP.md']);
const PASSING = 'Before: …\n\nReview: critic Accept 8/8 · qa Pass · performance Pass\n';

describe('docsOnly', () => {
  it('is true when every changed file is a Markdown doc', () => {
    expect(docsOnly(new Set(['docs/ROADMAP.md', 'README.md', '.claude/agents/qa.md']))).toBe(true);
  });
  it('is false for code, config or the Markdown the build reads', () => {
    expect(docsOnly(CODE)).toBe(false);
    expect(docsOnly(new Set(['pipeline/gate.mjs']))).toBe(false);
    expect(docsOnly(new Set(['pool.md']))).toBe(false);
    expect(docsOnly(new Set(['stats.md', 'docs/ROADMAP.md']))).toBe(false);
  });
  it('is false for an empty diff', () => {
    expect(docsOnly(new Set())).toBe(false);
  });
});

describe('parseReviewLine', () => {
  it('reads each agent\'s verdict, bold or not, in any order', () => {
    expect(parseReviewLine(PASSING)).toEqual({ critic: 'accept', qa: 'pass', performance: 'pass' });
    expect(parseReviewLine('**Review:** performance: fail, QA pass, critic Retry 6/8')).toEqual({ critic: 'retry', qa: 'pass', performance: 'fail' });
    expect(parseReviewLine('Review: critic auto-accept 6/8 · qa Pass · performance Pass').critic).toBe('auto-accept');
  });
  it('is null without a Review line, and names a missing agent null', () => {
    expect(parseReviewLine('Pipeline: attempts 1 · critic 8/8')).toBeNull();
    expect(parseReviewLine(null)).toBeNull();
    expect(parseReviewLine('Review: critic Accept 8/8 · qa Pass')).toEqual({ critic: 'accept', qa: 'pass', performance: null });
  });
});

describe('judgeReview', () => {
  it('passes a code change whose three agents passed', () => {
    expect(judgeReview({ changed: CODE, body: PASSING, draft: false })).toMatchObject({ pass: true });
    expect(judgeReview({ changed: CODE, body: 'Review: critic auto-accept 6/8 · qa Pass · performance Pass', draft: false }).pass).toBe(true);
  });
  it('fails a code change with no Review line, a missing agent or a failing verdict', () => {
    expect(judgeReview({ changed: CODE, body: 'Before: …', draft: false })).toMatchObject({ pass: false });
    expect(judgeReview({ changed: CODE, body: 'Review: critic Accept 8/8 · qa Pass', draft: false }).reason).toMatch(/no verdict for performance/);
    expect(judgeReview({ changed: CODE, body: 'Review: critic Retry 5/8 · qa Pass · performance Fail', draft: false }).reason).toMatch(/critic says retry; performance says fail/);
  });
  it('does not apply to a docs-only change or a draft', () => {
    expect(judgeReview({ changed: new Set(['docs/ROADMAP.md']), body: '', draft: false }).pass).toBeNull();
    expect(judgeReview({ changed: CODE, body: '', draft: true }).pass).toBeNull();
  });
});
