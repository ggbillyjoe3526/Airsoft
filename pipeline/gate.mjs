#!/usr/bin/env node
/**
 * The pipeline's gates (pipeline/README.md): a plain script, no model, that runs the project's checks and writes
 * pipeline/out/gate-report.json with pass / fail per gate and the evidence paths. A failed gate means the task goes
 * back to the worker with this report; the critic runs only on a report where every gate passed.
 *
 *   node pipeline/gate.mjs [--task M27] [--quick] [--no-smoke] [--perf] [--env container|laptop|ci] [--base origin/main] [--ci]
 *
 * Gates: build (tsc + vite build with the chunk budgets), tests (vitest), smoke (playwright), perf (only when the diff
 * touches a perf-relevant path, or --perf; needs pipeline/perf-run.mjs), scope (the diff stays inside the task's
 * `touches`, QA commits touch only tests) and changelog (CHANGELOG.md names the task under Unreleased).
 * --quick runs build and tests only. --ci is what the workflow runs: build, tests, smoke (no perf: a runner has no
 * baseline). Without --task, scope and changelog are skipped. Exit code 1 when any gate fails.
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'pipeline', 'out');
const ARTIFACTS = join(OUT, 'qa-artifacts');
const REPORT = join(OUT, 'gate-report.json');

/** Paths whose change makes the perf gate required (the proposal's "render loop, physics, entities, assets"). */
const PERF_PATHS = ['src/sim/', 'src/physics/', 'src/render/', 'src/ai/', 'src/nav/', 'src/audio/', 'src/core/', 'src/map/', 'src/assets/', 'vite.config.ts'];
/** What any task may touch besides its `touches` list. */
const ALWAYS_ALLOWED = [/\.test\.ts$/, /^e2e\//, /^docs\//, /^CHANGELOG\.md$/, /^README\.md$/, /^pool\.md$/, /^CLAUDE\.md$/];
/** What a QA commit (trailer `Agent: qa`) may touch: tests and their support only. */
const QA_ALLOWED = [/\.test\.ts$/, /^e2e\//, /^src\/.*\/testSupport\.ts$/, /^src\/ai\/depotMatchSupport\.ts$/, /^src\/pool\/testStorage\.ts$/];
/** Perf metrics compared with the baseline; frame times only where the budget file says they are gated. */
const RELATIVE_METRICS = ['drawCalls', 'triangles', 'gpuMemoryMB'];
const FRAME_METRICS = ['p95Ms', 'p99Ms'];
const RELATIVE_TOLERANCE = 0.1;

const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const value = (name, fallback) => (args.includes(name) ? args[args.indexOf(name) + 1] : fallback);
const options = {
  task: value('--task', null),
  quick: flag('--quick'),
  ci: flag('--ci'),
  smoke: !flag('--no-smoke') && !flag('--quick'),
  perf: flag('--perf'),
  env: value('--env', flag('--ci') ? 'ci' : 'container'),
  base: value('--base', 'origin/main'),
};

mkdirSync(ARTIFACTS, { recursive: true });

const git = (...a) => execFileSync('git', a, { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
const head = git('rev-parse', 'HEAD');
let mergeBase = head;
try {
  mergeBase = git('merge-base', options.base, 'HEAD');
} catch {
  console.warn(`gate: ${options.base} is unknown here; comparing with HEAD only`);
}
/** Changed files: committed since the merge base plus the working tree, so an unpushed attempt is judged as it is. */
const changed = new Set(
  [...git('diff', '--name-only', mergeBase).split('\n'), ...git('ls-files', '--others', '--exclude-standard').split('\n')].filter(Boolean),
);
const perfRequired = options.perf || [...changed].some((f) => PERF_PATHS.some((p) => f.startsWith(p)));

const report = {
  task: options.task,
  head,
  base: `${options.base}@${mergeBase.slice(0, 7)}`,
  env: options.env,
  when: new Date().toISOString(),
  mode: options.quick ? 'quick' : options.ci ? 'ci' : 'full',
  changedFiles: changed.size,
  perfRequired,
  pass: true,
  gates: {},
};

/** Runs a command, keeps its output in an artifact, returns { ok, ms, log }. */
function run(name, cmd, cmdArgs, env = {}) {
  const started = Date.now();
  const r = spawnSync(cmd, cmdArgs, { cwd: ROOT, encoding: 'utf8', env: { ...process.env, ...env }, shell: process.platform === 'win32', maxBuffer: 64 * 1024 * 1024 });
  const log = join(ARTIFACTS, `${name}.log`);
  writeFileSync(log, `${r.stdout ?? ''}\n${r.stderr ?? ''}`);
  return { ok: r.status === 0, ms: Date.now() - started, log: relative(ROOT, log), output: `${r.stdout ?? ''}\n${r.stderr ?? ''}` };
}

const tail = (text, n = 40) => text.trim().split('\n').slice(-n).join('\n');

function record(name, gate) {
  report.gates[name] = gate;
  if (gate.pass === false) report.pass = false;
  const mark = gate.pass === true ? 'pass' : gate.pass === false ? 'FAIL' : 'skip';
  console.log(`gate ${name.padEnd(9)} ${mark}${gate.ms !== undefined ? ` (${(gate.ms / 1000).toFixed(0)} s)` : ''}${gate.reason ? ` · ${gate.reason}` : ''}`);
}

// 1. build: type check and the production build with its chunk budgets (vite.config.ts fails over budget on CI).
{
  const r = run('build', 'npm', ['run', 'build'], options.ci ? { CI: '1' } : {});
  record('build', { pass: r.ok, ms: r.ms, log: r.log, ...(r.ok ? {} : { evidence: tail(r.output) }) });
}

// 2. tests: the unit suite, with its JSON report as the artifact.
{
  const json = join(ARTIFACTS, 'vitest.json');
  const r = run('tests', 'npx', ['vitest', 'run', '--reporter=json', `--outputFile=${json}`]);
  let summary = { pass: r.ok, ms: r.ms, log: r.log };
  try {
    const data = JSON.parse(readFileSync(json, 'utf8'));
    const failed = [];
    for (const file of data.testResults ?? []) {
      for (const t of file.assertionResults ?? []) {
        if (t.status === 'failed') failed.push({ test: t.fullName, file: relative(ROOT, file.name), message: (t.failureMessages?.[0] ?? '').split('\n')[0] });
      }
    }
    summary = { ...summary, total: data.numTotalTests, failed: data.numFailedTests, pass: r.ok && data.numFailedTests === 0 && data.numTotalTests > 0, report: relative(ROOT, json), ...(failed.length ? { failures: failed.slice(0, 20) } : {}) };
  } catch (e) {
    summary = { ...summary, pass: false, reason: `no readable vitest report (${e.message})`, evidence: tail(r.output) };
  }
  record('tests', summary);
}

// 3. smoke: the Playwright browser test of the e2e build; the spec itself asserts zero console errors and page errors.
if (!options.smoke) {
  record('smoke', { pass: null, reason: options.quick ? 'skipped (--quick)' : 'skipped (--no-smoke)' });
} else {
  const json = join(ARTIFACTS, 'playwright.json');
  const r = run('smoke', 'npx', ['playwright', 'test']); // playwright.config.ts writes the JSON report into qa-artifacts
  let summary = { pass: r.ok, ms: r.ms, log: r.log };
  try {
    const data = JSON.parse(readFileSync(json, 'utf8'));
    const failures = [];
    const walk = (suite) => {
      for (const spec of suite.specs ?? []) {
        for (const t of spec.tests ?? []) {
          if (t.status !== 'expected') failures.push({ test: spec.title, file: spec.file, status: t.status, message: (t.results?.at(-1)?.error?.message ?? '').split('\n')[0] });
        }
      }
      for (const s of suite.suites ?? []) walk(s);
    };
    for (const s of data.suites ?? []) walk(s);
    const expected = data.stats?.expected ?? 0;
    summary = { ...summary, expected, unexpected: data.stats?.unexpected ?? 0, pass: r.ok && failures.length === 0 && expected > 0, report: relative(ROOT, json), html: 'playwright-report/index.html', ...(failures.length ? { failures } : {}) };
  } catch (e) {
    summary = { ...summary, pass: false, reason: `no readable playwright report (${e.message})`, evidence: tail(r.output) };
  }
  record('smoke', summary);
}

// 4. perf: the harness (pipeline/perf-run.mjs) against the budget and this environment's baseline.
if (!perfRequired) {
  record('perf', { pass: null, reason: 'not required (no perf-relevant path changed)' });
} else if (options.quick || options.ci) {
  record('perf', { pass: null, reason: `required but skipped (${options.quick ? '--quick' : '--ci: no baseline on a runner'})` });
} else if (!existsSync(join(ROOT, 'pipeline', 'perf-run.mjs'))) {
  record('perf', { pass: null, reason: 'required but the harness (pipeline/perf-run.mjs) is not installed yet' });
} else {
  const r = run('perf', 'node', ['pipeline/perf-run.mjs', '--env', options.env]);
  const runFile = join(OUT, `perf-${options.env}.json`);
  let summary = { pass: r.ok, ms: r.ms, log: r.log };
  try {
    const result = JSON.parse(readFileSync(runFile, 'utf8'));
    const budgets = JSON.parse(readFileSync(join(ROOT, 'pipeline', 'perf-budget.json'), 'utf8'));
    const budget = budgets.presets[result.preset] ?? {};
    const frameTimesGated = (budgets.frameTimeGatedEnvs ?? []).includes(options.env);
    const over = [];
    for (const [metric, limit] of Object.entries(budget)) {
      if (FRAME_METRICS.includes(metric) && !frameTimesGated) continue;
      if (typeof result.metrics[metric] === 'number' && result.metrics[metric] > limit) over.push({ metric, limit, now: result.metrics[metric] });
    }
    const baselinePath = join(ROOT, 'pipeline', 'baseline', `${options.env}.json`);
    const worse = [];
    let baselineNote;
    if (existsSync(baselinePath)) {
      const baseline = JSON.parse(readFileSync(baselinePath, 'utf8'));
      if (baseline.preset !== result.preset) baselineNote = `baseline preset ${baseline.preset} differs from ${result.preset}; relative check skipped`;
      else {
        for (const metric of [...RELATIVE_METRICS, ...(frameTimesGated ? FRAME_METRICS : [])]) {
          const was = baseline.metrics[metric];
          const now = result.metrics[metric];
          if (typeof was !== 'number' || typeof now !== 'number' || was <= 0) continue;
          const pct = ((now - was) / was) * 100;
          if (pct > RELATIVE_TOLERANCE * 100) worse.push({ metric, baseline: was, now, pct: Math.round(pct) });
        }
      }
    } else baselineNote = `no baseline for ${options.env} (pipeline/baseline/${options.env}.json); relative check skipped`;
    summary = { ...summary, pass: r.ok && over.length === 0 && worse.length === 0, preset: result.preset, run: relative(ROOT, runFile), metrics: result.metrics, frameTimesGated, ...(over.length ? { overBudget: over } : {}), ...(worse.length ? { worse } : {}), ...(baselineNote ? { reason: baselineNote } : {}) };
  } catch (e) {
    summary = { ...summary, pass: false, reason: `no readable perf run (${e.message})`, evidence: tail(r.output) };
  }
  record('perf', summary);
}

// 5. scope: the diff stays inside the task's `touches` (plus tests and docs), and QA commits touch only tests.
function taskBlock(id) {
  const tasks = join(ROOT, 'docs', 'TASKS.md');
  if (!existsSync(tasks)) return null;
  const text = readFileSync(tasks, 'utf8');
  const m = text.match(new RegExp(`^## ${id.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\$&')}\\b[^\\n]*\\n([\\s\\S]*?)(?=^## |(?![\\s\\S]))`, 'm'));
  if (!m) return null;
  const field = (key) => m[1].match(new RegExp(`^${key}:\\s*(.*)$`, 'm'))?.[1]?.trim() ?? '';
  return { touches: field('touches').split(',').map((s) => s.trim()).filter(Boolean), tier: field('tier'), perf: field('perf') };
}
if (!options.task) {
  record('scope', { pass: null, reason: 'skipped (no --task)' });
} else {
  const task = taskBlock(options.task);
  if (!task) record('scope', { pass: false, reason: `no block "## ${options.task}" in docs/TASKS.md` });
  else {
    const allowed = (f) => ALWAYS_ALLOWED.some((re) => re.test(f)) || task.touches.some((t) => (t.endsWith('/') ? f.startsWith(t) : f === t)) || f.startsWith('pipeline/out/');
    const outside = [...changed].filter((f) => !allowed(f));
    const qaOutside = [];
    const log = git('log', '--format=%H%x00%B%x01', `${mergeBase}..HEAD`);
    for (const entry of log.split('\x01')) {
      const [sha, body] = entry.trim().split('\x00');
      if (!sha || !/^Agent:\s*qa\s*$/mi.test(body ?? '')) continue;
      for (const f of git('show', '--name-only', '--format=', sha).split('\n').filter(Boolean)) {
        if (!QA_ALLOWED.some((re) => re.test(f))) qaOutside.push({ commit: sha.slice(0, 7), file: f });
      }
    }
    record('scope', { pass: outside.length === 0 && qaOutside.length === 0, touches: task.touches, ...(outside.length ? { outsideTouches: outside } : {}), ...(qaOutside.length ? { qaCommitsOutsideTests: qaOutside } : {}) });
  }
}

// 6. changelog: CHANGELOG.md names the task under Unreleased (the changelog agent writes that line).
if (!options.task) {
  record('changelog', { pass: null, reason: 'skipped (no --task)' });
} else {
  const path = join(ROOT, 'CHANGELOG.md');
  if (!existsSync(path)) record('changelog', { pass: false, reason: 'no CHANGELOG.md' });
  else {
    const text = readFileSync(path, 'utf8');
    const unreleased = text.match(/^## Unreleased[^\n]*\n([\s\S]*?)(?=^## |(?![\s\S]))/m)?.[1] ?? '';
    const line = unreleased.split('\n').find((l) => l.includes(`**${options.task}**`));
    record('changelog', { pass: Boolean(line), ...(line ? { line: line.trim() } : { reason: `no line naming **${options.task}** under Unreleased` }) });
  }
}

writeFileSync(REPORT, `${JSON.stringify(report, null, 2)}\n`);
console.log(`${report.pass ? 'ALL GATES PASS' : 'GATES FAILED'} · ${relative(ROOT, REPORT)}`);
process.exit(report.pass ? 0 : 1);
