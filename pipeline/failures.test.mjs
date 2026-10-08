import { describe, expect, it } from 'vitest';
import { MAX_FAILURES, buildFailures, errorHead, failureLines, failureSections, failuresSummary, firstFrame, vitestFailures } from './failures.mjs';

/** The gate's failures-only summary (pipeline/failures.mjs, TE3: token-efficiency plan, item 19). */
const ROOT = '/repo';
const FRAMES = [
  '    at /repo/node_modules/vitest/dist/chunks/run.js:1628:35',
  '    at /repo/src/sim/bbs.ts:41:9',
  '    at /repo/src/sim/bbs.test.ts:12:30',
].join('\n');

describe('where a failure is (firstFrame)', () => {
  it('takes the first frame inside the repository, outside node_modules, relative to it', () => {
    expect(firstFrame(`AssertionError: nope\n${FRAMES}`, ROOT)).toBe('src/sim/bbs.ts:41');
    expect(firstFrame('    at file:///repo/pipeline/gate.test.mjs:7:3', ROOT)).toBe('pipeline/gate.test.mjs:7');
    expect(firstFrame(' ❯ src/ui/hud.test.ts:88:12', ROOT)).toBe('src/ui/hud.test.ts:88');
  });

  it('is null when every frame is outside the repository or in node_modules', () => {
    expect(firstFrame('    at /elsewhere/x.ts:1:1\n    at /repo/node_modules/a/b.js:2:2', ROOT)).toBeNull();
    expect(firstFrame('no stack at all', ROOT)).toBeNull();
  });
});

describe('an error\'s first lines (errorHead)', () => {
  it('keeps the first line and up to three more before the stack, without colours or blank lines', () => {
    const message = '\x1b[31mAssertionError: expected 3 to be 4\x1b[39m\n\n- Expected\n+ Received\n- 4\n+ 3\n    at /repo/src/a.test.ts:1:1';
    expect(errorHead(message)).toEqual(['AssertionError: expected 3 to be 4', '- Expected', '+ Received', '- 4']);
    expect(errorHead(`TypeError: boom\n${FRAMES}`)).toEqual(['TypeError: boom']);
    expect(errorHead('')).toEqual([]);
  });
});

describe('the unit tests\' failures (vitestFailures)', () => {
  const report = {
    testResults: [
      {
        name: '/repo/src/sim/bbs.test.ts',
        status: 'failed',
        assertionResults: [
          { status: 'passed', fullName: 'bbs fly', failureMessages: [] },
          { status: 'failed', fullName: 'bbs drop past the hop-up range', failureMessages: [`AssertionError: expected 1 to be 2\n${FRAMES}`] },
        ],
      },
      { name: '/repo/src/ui/menu.test.ts', status: 'failed', message: "Cannot find module './gone' imported from /repo/src/ui/menu.test.ts", assertionResults: [] },
      { name: '/repo/src/ui/ok.test.ts', status: 'passed', assertionResults: [{ status: 'passed', fullName: 'ok', failureMessages: [] }] },
    ],
  };

  it('lists each failed test with its file, error and first frame in the repository', () => {
    expect(vitestFailures(report, ROOT)[0]).toEqual({
      test: 'bbs drop past the hop-up range',
      file: 'src/sim/bbs.test.ts',
      at: 'src/sim/bbs.ts:41',
      message: 'AssertionError: expected 1 to be 2',
      detail: ['AssertionError: expected 1 to be 2'],
    });
  });

  it('lists a test file that failed to load, which the gate missed before (numFailedTests stays 0)', () => {
    const failures = vitestFailures(report, ROOT);
    expect(failures).toHaveLength(2);
    expect(failures[1]).toMatchObject({ test: '(the file did not load)', file: 'src/ui/menu.test.ts', message: "Cannot find module './gone' imported from /repo/src/ui/menu.test.ts" });
  });

  it('is empty for a passing report or none', () => {
    expect(vitestFailures({ testResults: [report.testResults[2]] }, ROOT)).toEqual([]);
    expect(vitestFailures(null, ROOT)).toEqual([]);
  });
});

describe('the build\'s failures (buildFailures)', () => {
  it('lists each TypeScript error with its file and line', () => {
    const output = "> tsc --noEmit\nsrc/sim/bbs.ts(12,5): error TS2322: Type 'string' is not assignable to type 'number'.\n/repo/src/ui/hud.ts(3,1): error TS2304: Cannot find name 'foo'.\n";
    expect(buildFailures(output, ROOT)).toEqual([
      { test: 'error TS2322', file: 'src/sim/bbs.ts', at: 'src/sim/bbs.ts:12', message: "Type 'string' is not assignable to type 'number'.", detail: ["Type 'string' is not assignable to type 'number'."] },
      { test: 'error TS2304', file: 'src/ui/hud.ts', at: 'src/ui/hud.ts:3', message: "Cannot find name 'foo'.", detail: ["Cannot find name 'foo'."] },
    ]);
  });

  it('reads Vite\'s error block, placed when it names a file and line', () => {
    const placed = buildFailures('vite v8\nerror during build:\nsrc/main.ts (4:9): "x" is not exported by "src/a.ts"\n    at getRollupError (file:///repo/node_modules/rollup/x.js:1:1)\n', ROOT);
    expect(placed).toEqual([{ test: 'vite build', at: 'src/main.ts:4', message: 'src/main.ts (4:9): "x" is not exported by "src/a.ts"', detail: ['src/main.ts (4:9): "x" is not exported by "src/a.ts"'] }]);
    const budget = buildFailures('error during build:\n[airsoft-chunk-budget] game chunk 412 KB is over its 400 KB budget\n', ROOT);
    expect(budget).toEqual([{ test: 'vite build', at: null, message: '[airsoft-chunk-budget] game chunk 412 KB is over its 400 KB budget', detail: ['[airsoft-chunk-budget] game chunk 412 KB is over its 400 KB budget'], unplaced: true }]);
  });

  it('falls back to the lines that mention an error, else the last lines, unplaced', () => {
    expect(buildFailures('a\nb\nSomething: Error happened\nc\n', ROOT)).toEqual([{ test: 'build', at: null, message: 'Something: Error happened', detail: ['Something: Error happened'], unplaced: true }]);
    const quiet = buildFailures(Array.from({ length: 15 }, (_, i) => `line ${i}`).join('\n'), ROOT);
    expect(quiet[0].detail).toEqual(Array.from({ length: 10 }, (_, i) => `line ${i + 5}`));
    expect(buildFailures('', ROOT)).toEqual([]);
  });
});

describe('one failure as printed (failureLines)', () => {
  it('names the test, then its error lines, then where it is', () => {
    expect(failureLines({ test: 'bbs drop', file: 'src/sim/bbs.test.ts', at: 'src/sim/bbs.ts:41', message: 'AssertionError: x', detail: ['AssertionError: x', '- Expected'] })).toEqual([
      '✗ src/sim/bbs.test.ts › bbs drop',
      '    AssertionError: x',
      '    - Expected',
      '    at src/sim/bbs.ts:41',
    ]);
  });

  it('takes a smoke failure\'s place from its file (pipeline/smokeReport.mjs) and names its project', () => {
    expect(failureLines({ test: 'menu › opens', project: 'chromium', file: 'e2e/menu.spec.ts:12', message: 'Error: boom', detail: ['Error: boom', 'Locator: x'] })).toEqual([
      '✗ [chromium] menu › opens',
      '    Error: boom',
      '    Locator: x',
      '    at e2e/menu.spec.ts:12',
    ]);
  });

  it('says so when a failure could not be placed, and stays quiet for a perf run that needs no place', () => {
    expect(failureLines({ test: 'build', at: null, message: 'boom', detail: ['boom'], unplaced: true }).at(-1)).toContain('no file and line');
    expect(failureLines({ test: 'Depot Elimination Low', message: 'drawCalls 160 over the budget 150' })).toEqual(['✗ Depot Elimination Low', '    drawCalls 160 over the budget 150']);
  });
});

describe('the summary (failuresSummary, failureSections)', () => {
  const passing = { task: 'TE3', head: 'abcdef1234', pass: true, gates: { build: { pass: true }, smoke: { pass: null, reason: 'skipped (--quick)' } } };

  it('says in one line that nothing failed', () => {
    expect(failuresSummary(passing)).toBe('# Gate failures · TE3 · head abcdef1\n\nNone: every gate passed or was skipped.\n');
    expect(failureSections(passing)).toEqual([]);
  });

  it('gives each failed gate a heading with its log and lists only the failed gates', () => {
    const report = {
      task: 'TE3',
      head: 'abcdef1234',
      pass: false,
      gates: {
        build: { pass: true, ms: 1000 },
        tests: { pass: false, log: 'pipeline/out/qa-artifacts/tests.log', total: 10, failed: 1, failures: [{ test: 'a b', file: 'src/a.test.ts', at: 'src/a.test.ts:3', message: 'boom', detail: ['boom'] }] },
        smoke: { pass: null, reason: 'skipped (--quick)' },
      },
    };
    const text = failuresSummary(report);
    expect(text).toContain('Failed: tests.');
    expect(text).toContain('## tests · 1 failed of 10 (pipeline/out/qa-artifacts/tests.log)');
    expect(text).toContain('✗ src/a.test.ts › a b');
    expect(text).not.toContain('## build');
    expect(text).not.toContain('## smoke');
  });

  it('counts the failures past the list\'s limit', () => {
    const failures = Array.from({ length: MAX_FAILURES }, (_, i) => ({ test: `t${i}`, file: 'src/a.test.ts', message: 'x' }));
    const text = failuresSummary({ task: 'M1', head: 'abc', pass: false, gates: { tests: { pass: false, total: 100, failed: 30, failures, report: 'pipeline/out/qa-artifacts/vitest.json' } } });
    expect(text).toContain('… and 10 more (pipeline/out/qa-artifacts/vitest.json)');
  });

  it('prints a gate with no failure list by its reason, stray files and output', () => {
    const lines = failureSections({
      pass: false,
      gates: {
        scope: { pass: false, outsideTouches: ['src/x.ts'], qaCommitsOutsideTests: [{ commit: 'abc1234', file: 'src/y.ts' }] },
        changelog: { pass: false, reason: 'no line naming **M1** under Unreleased' },
        smoke: { pass: false, reason: 'no readable playwright report (ENOENT)', evidence: 'one\ntwo' },
        perf: { pass: false },
      },
    });
    expect(lines).toContain('✗ outside the task\'s touches: src/x.ts');
    expect(lines).toContain('✗ QA commit abc1234 touches src/y.ts');
    expect(lines).toContain('✗ no line naming **M1** under Unreleased');
    expect(lines).toContain('✗ no readable playwright report (ENOENT)');
    expect(lines).toContain('    two');
    expect(lines.at(-1)).toContain('no reason or output');
  });
});
