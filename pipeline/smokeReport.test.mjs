import { describe, expect, it } from 'vitest';
import { errorLines, smokeFailures } from './smokeReport.mjs';

/** A failed `expect(locator).toBeVisible()` as Playwright's JSON report writes it (colours included). */
const VISIBLE = [
  'Error: \x1b[2mexpect(\x1b[22m\x1b[31mlocator\x1b[39m\x1b[2m).\x1b[22mtoBeVisible\x1b[2m()\x1b[22m failed',
  '',
  "Locator:  getByRole('button', { name: 'Resume' })",
  'Expected: visible',
  'Timeout:  5000ms',
  'Error: element(s) not found',
  '',
  'Call log:',
  '\x1b[2m  - Expect "toBeVisible" with timeout 5000ms\x1b[22m',
  "\x1b[2m  - waiting for getByRole('button', { name: 'Resume' })\x1b[22m",
  '\x1b[2m  - waiting for something else\x1b[22m',
  '\x1b[2m  - and again\x1b[22m',
].join('\n');

const report = {
  suites: [
    {
      title: 'boot.spec.ts',
      file: 'boot.spec.ts',
      specs: [{ title: 'boots to the title screen', file: 'boot.spec.ts', line: 10, tests: [{ projectName: 'chromium', status: 'expected', results: [{ status: 'passed' }] }] }],
      suites: [
        {
          title: 'a match',
          file: 'boot.spec.ts',
          specs: [
            {
              title: 'pauses and resumes',
              file: 'boot.spec.ts',
              line: 42,
              tests: [{ projectName: 'chromium', status: 'unexpected', results: [{ status: 'failed', error: { message: VISIBLE, location: { file: '/repo/e2e/boot.spec.ts', line: 57, column: 5 } } }] }],
            },
          ],
        },
      ],
    },
  ],
  errors: [{ message: 'Error: Timed out waiting 120000ms from config.webServer.' }],
};

describe('the smoke gate\'s failure summary (pipeline/gate.mjs)', () => {
  it('keeps the locator, the expectation, the timeout and the start of the call log, not only the first line', () => {
    expect(errorLines(VISIBLE)).toEqual([
      'Error: expect(locator).toBeVisible() failed',
      "Locator:  getByRole('button', { name: 'Resume' })",
      'Expected: visible',
      'Timeout:  5000ms',
      'Error: element(s) not found',
      'Call log:',
      '  - Expect "toBeVisible" with timeout 5000ms',
      "  - waiting for getByRole('button', { name: 'Resume' })",
    ]);
    expect(errorLines(VISIBLE, 3)).toHaveLength(3);
    expect(errorLines('')).toEqual([]);
  });

  it('names each failing test by its describe titles, project and the line it failed on, and errors outside any test', () => {
    const failures = smokeFailures(report);
    expect(failures).toHaveLength(2);
    expect(failures[0]).toMatchObject({ test: 'a match › pauses and resumes', project: 'chromium', file: 'e2e/boot.spec.ts:57', status: 'unexpected', message: 'Error: expect(locator).toBeVisible() failed' });
    expect(failures[0].detail).toContain("Locator:  getByRole('button', { name: 'Resume' })");
    expect(failures[1]).toMatchObject({ test: '(outside any test)', message: 'Error: Timed out waiting 120000ms from config.webServer.' });
  });

  it('finds nothing in a report where every test passed', () => {
    expect(smokeFailures({ suites: [{ ...report.suites[0], suites: [] }] })).toEqual([]);
  });
});
