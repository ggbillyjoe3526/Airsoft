/**
 * What the gate (pipeline/gate.mjs) reports of a failed browser smoke test: for each failing test its full title, its
 * project, where it failed, and the few lines of Playwright's error that say what was looked for and what happened (the
 * locator, the expectation, the timeout, the start of the call log). The first line alone ("Error: expect(locator)
 * .toBeVisible() failed") hid the failing locator twice on CI.
 */

/** Lines of a Playwright error worth printing besides the first. */
const KEY_LINE = /^(Locator|Expected|Received|Timeout|Error|TimeoutError|Call log)\b/;
/** Call log entries kept (the first say what was waited for). */
const CALL_LOG_ENTRIES = 3;
/** Most lines kept from one error. */
const MAX_LINES = 8;

const stripAnsi = (text) => String(text ?? '').replace(/\x1b\[[0-9;]*m/g, '');

/**
 * The lines of a Playwright error message worth printing: the first, then the locator, expected, received, timeout and
 * error lines, and the call log's first entries; at most `max`.
 */
export function errorLines(message, max = MAX_LINES) {
  const lines = stripAnsi(message).split('\n').map((l) => l.trimEnd()).filter((l) => l.trim() !== '');
  if (lines.length === 0) return [];
  const out = [lines[0].trim()];
  let callLog = -1;
  for (const raw of lines.slice(1)) {
    const line = raw.trim();
    if (callLog >= 0 && /^- /.test(line)) {
      if (callLog++ < CALL_LOG_ENTRIES) out.push(`  ${line}`);
      continue;
    }
    if (!KEY_LINE.test(line)) continue;
    if (line.startsWith('Call log')) callLog = 0;
    out.push(line);
  }
  return out.slice(0, max);
}

/**
 * Every test of a Playwright JSON report that did not pass as expected, plus errors outside any test (a web server that
 * didn't start): `{ test, project, file, status, message, detail }`, `test` the titles from the outermost describe
 * down, `message` the error's first line, `detail` errorLines.
 */
export function smokeFailures(report) {
  const failures = [];
  const walk = (suite, path) => {
    const here = suite.title && suite.title !== suite.file ? [...path, suite.title] : path;
    for (const spec of suite.specs ?? []) {
      for (const t of spec.tests ?? []) {
        if (t.status === 'expected') continue;
        const result = t.results?.at(-1);
        const error = result?.error ?? result?.errors?.[0];
        const at = error?.location ? `${error.location.file.split(/[\\/]/).slice(-2).join('/')}:${error.location.line}` : `${spec.file}:${spec.line}`;
        const detail = errorLines(error?.message ?? '');
        failures.push({ test: [...here, spec.title].join(' › '), project: t.projectName, file: at, status: t.status, message: detail[0] ?? '', detail });
      }
    }
    for (const s of suite.suites ?? []) walk(s, here);
  };
  for (const s of report.suites ?? []) walk(s, []);
  for (const e of report.errors ?? []) {
    const detail = errorLines(e.message ?? '');
    failures.push({ test: '(outside any test)', status: 'error', message: detail[0] ?? '', detail });
  }
  return failures;
}
