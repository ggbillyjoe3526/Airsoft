import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/** Guards on .github/workflows/check.yml by plain text parsing (IM6): a shard list that does not match its `/N` skips tests silently. */
const text = readFileSync(new URL('../.github/workflows/check.yml', import.meta.url), 'utf8');
const lines = text.split('\n').filter((l) => !/^\s*#/.test(l));

/** The jobs as { name, body }: a job starts at a two-space-indented key under `jobs:`. */
const jobs = (() => {
  const start = lines.findIndex((l) => l === 'jobs:');
  const out = [];
  for (const l of lines.slice(start + 1)) {
    const m = /^ {2}([\w-]+):\s*$/.exec(l);
    if (m) out.push({ name: m[1], body: [] });
    else if (out.length) out[out.length - 1].body.push(l);
  }
  return out.map((j) => ({ name: j.name, body: j.body.join('\n') }));
})();

describe('check.yml shards (IM6)', () => {
  it('finds the check, browser and slow jobs', () => {
    expect(jobs.map((j) => j.name)).toEqual(expect.arrayContaining(['check', 'browser', 'slow']));
  });

  it('every sharded run line has a matrix.shard list of exactly 1..N', () => {
    const sharded = jobs.filter((j) => /--shard \$\{\{ matrix\.shard \}\}\/\d+/.test(j.body));
    expect(sharded.map((j) => j.name).sort()).toEqual(['browser', 'slow']);
    for (const j of sharded) {
      const n = Number(/--shard \$\{\{ matrix\.shard \}\}\/(\d+)/.exec(j.body)[1]);
      const list = /^\s*shard:\s*\[([^\]]*)\]/m.exec(j.body);
      expect(list, `${j.name} has a shard list`).not.toBeNull();
      const shares = list[1].split(',').map((s) => Number(s.trim()));
      expect(shares, j.name).toEqual(Array.from({ length: n }, (_, i) => i + 1));
    }
  });

  it('every run line with --shard k/N uses the same N inside a job', () => {
    for (const j of jobs) {
      const ns = new Set([...j.body.matchAll(/--shard \S+\/(\d+)/g)].map((m) => m[1]));
      expect(ns.size, j.name).toBeLessThanOrEqual(1);
    }
  });
});

describe('check.yml runs the smoke test once (IM6)', () => {
  const runLines = lines.filter((l) => /node pipeline\/gate\.mjs/.test(l));

  it('the check job passes --no-smoke', () => {
    const check = jobs.find((j) => j.name === 'check');
    expect(check.body).toMatch(/gate\.mjs[^\n]*--no-smoke/);
  });

  it('exactly one job runs --only smoke in Chromium, one in Firefox (IN1), and no other gate run line can run the smoke test', () => {
    const smokeJobs = jobs.filter((j) => /gate\.mjs[^\n]*--only smoke/.test(j.body));
    // E2E_FIREFOX swaps the Chromium projects for the Firefox one (playwright.config.ts), so the two never overlap.
    const firefox = (j) => /E2E_FIREFOX: '1'/.test(j.body);
    expect(smokeJobs.filter((j) => !firefox(j)).map((j) => j.name)).toEqual(['browser']);
    expect(smokeJobs.filter(firefox).map((j) => j.name)).toEqual(['firefox']);
    for (const l of runLines) {
      expect(/--only smoke/.test(l) || /--no-smoke/.test(l) || /--only tests/.test(l), l).toBe(true);
    }
  });
});

describe('check.yml runs the review gate (owner, 2026-10-16)', () => {
  it('the check job passes the pull request\'s description and draft flag to the gate', () => {
    const check = jobs.find((j) => j.name === 'check');
    expect(check.body).toMatch(/GATE_PR_BODY: \$\{\{ github\.event\.pull_request\.body \}\}/);
    expect(check.body).toMatch(/GATE_PR_DRAFT: \$\{\{ github\.event\.pull_request\.draft \}\}/);
  });

  it('re-runs when the description is edited or a draft is marked ready', () => {
    expect(text).toMatch(/types: \[[^\]]*\bedited\b[^\]]*\bready_for_review\b[^\]]*\]/);
  });
});

describe('check.yml actions are on Node 24 majors (IM6)', () => {
  const minimum = { 'actions/checkout': 5, 'actions/setup-node': 5, 'actions/cache': 5, 'actions/upload-artifact': 6 };

  it('uses no action major below the Node-24 line', () => {
    const uses = [...text.matchAll(/^\s*(?:-\s+)?uses:\s*([\w./-]+)@v(\d+)/gm)];
    expect(uses.length).toBeGreaterThan(0);
    for (const [, action, major] of uses) {
      if (action in minimum) expect(Number(major), action).toBeGreaterThanOrEqual(minimum[action]);
    }
  });
});
