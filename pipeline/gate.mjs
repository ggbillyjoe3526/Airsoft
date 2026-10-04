#!/usr/bin/env node
/**
 * The pipeline's gates (pipeline/README.md): a plain script, no model, that runs the project's checks and writes
 * pipeline/out/gate-report.json with pass / fail per gate and the evidence paths. A failed gate means the task goes
 * back to the worker with this report; the critic runs only on a report where every gate passed.
 *
 *   node pipeline/gate.mjs [--task M27[,M28]] [--quick] [--no-smoke] [--perf] [--env container|laptop|ci] [--base origin/main] [--ci]
 *
 * Gates: build (tsc + vite build with the chunk budgets), tests (vitest), smoke (playwright), perf (only when the diff
 * touches a perf-relevant path, or --perf; needs pipeline/perf-run.mjs), scope (the diff stays inside the task's
 * `touches`, QA commits touch only tests) and changelog (CHANGELOG.md names the task under Unreleased).
 * --quick runs build and tests only. --ci is what the workflow runs: build, tests, smoke (no perf: a runner has no
 * baseline); without --task it takes the task ids from the pull request's title in GATE_PR_TITLE (audit CORE-08).
 * With no task, scope and changelog are skipped. Exit code 1 when any gate fails.
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { allowedFile, findTaskBlock, parseTaskList, qaAllowedFile, taskIdsFromTitle, tasksVersions } from './scope.mjs';
import { smokeFailures } from './smokeReport.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'pipeline', 'out');
const ARTIFACTS = join(OUT, 'qa-artifacts');
const REPORT = join(OUT, 'gate-report.json');
const TASKS = join(ROOT, 'docs', 'TASKS.md');

/** Paths whose change makes the perf gate required (the proposal's "render loop, physics, entities, assets"). */
const PERF_PATHS = ['src/sim/', 'src/physics/', 'src/render/', 'src/ai/', 'src/nav/', 'src/audio/', 'src/core/', 'src/map/', 'src/assets/', 'vite.config.ts'];
/** Perf metrics compared with the baseline; frame times only where the budget file says they are gated. */
const RELATIVE_METRICS = ['drawCalls', 'triangles', 'gpuMemoryMB'];
const FRAME_METRICS = ['p95Ms', 'p99Ms'];
const RELATIVE_TOLERANCE = 0.1;

const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const value = (name, fallback) => (args.includes(name) ? args[args.indexOf(name) + 1] : fallback);
const prTitle = flag('--ci') ? process.env.GATE_PR_TITLE ?? '' : '';
const options = {
  // One task id or several ("FA5,FA9"); on CI, else the ids the pull request's title starts with.
  tasks: args.includes('--task') ? parseTaskList(value('--task', '')) : taskIdsFromTitle(prTitle),
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
  task: options.tasks.length > 0 ? options.tasks.join(',') : null,
  ...(prTitle && !args.includes('--task') ? { taskFrom: 'pull request title' } : {}),
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
  // A failed gate names what failed in the log too, so a CI run can be read without downloading its artifact.
  for (const f of gate.pass === false ? (gate.failures ?? []) : []) {
    console.log(`  ✗ ${f.project ? `[${f.project}] ` : ''}${f.file ? `${f.file} › ` : ''}${f.test ?? f.title ?? ''}: ${String(f.message ?? '').replace(/\x1b\[[0-9;]*m/g, '').split('\n')[0].slice(0, 300)}`);
    // The smoke test's failures carry the lines after the first: the locator, what was expected, the call log's start.
    for (const line of (f.detail ?? []).slice(1)) console.log(`      ${line.slice(0, 300)}`);
  }
}

// 1. build: type check and the production build with its chunk budgets (vite.config.ts fails over budget on CI). Always
// built; the stamp it leaves lets the smoke test's release server reuse dist/ (pipeline/build-cached.mjs).
{
  const r = run('build', 'node', ['pipeline/build-cached.mjs', '--mode', 'production', '--force'], options.ci ? { CI: '1' } : {});
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
    // Each failing test's full title, project, place and the error's locator / expectation lines (smokeReport.mjs).
    const failures = smokeFailures(data);
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
    // The budget preset's baseline is <env>.json; the others' <env>-<preset>.json (perf-run.mjs --preset all --baseline).
    const baselineName = result.preset === budgets.budgetPreset ? `${options.env}.json` : `${options.env}-${result.preset}.json`;
    const baselinePath = join(ROOT, 'pipeline', 'baseline', baselineName);
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
    } else baselineNote = `no baseline for ${options.env} (pipeline/baseline/${baselineName}); relative check skipped`;
    summary = { ...summary, pass: r.ok && over.length === 0 && worse.length === 0, preset: result.preset, run: relative(ROOT, runFile), metrics: result.metrics, frameTimesGated, ...(over.length ? { overBudget: over } : {}), ...(worse.length ? { worse } : {}), ...(baselineNote ? { reason: baselineNote } : {}) };
  } catch (e) {
    summary = { ...summary, pass: false, reason: `no readable perf run (${e.message})`, evidence: tail(r.output) };
  }
  record('perf', summary);
}

// 5. scope: the diff stays inside the task's `touches` (plus tests and docs), and QA commits touch only tests.
if (options.tasks.length === 0) {
  record('scope', { pass: null, reason: 'skipped (no --task)' });
} else {
  const blocks = options.tasks.map((id) => ({ id, block: findTaskBlock(tasksVersions(git, mergeBase, existsSync(TASKS) ? readFileSync(TASKS, 'utf8') : null), id) }));
  const missing = blocks.filter((b) => !b.block).map((b) => b.id);
  if (missing.length > 0) record('scope', { pass: false, reason: `no block ${missing.map((id) => `"## ${id}"`).join(', ')} in docs/TASKS.md or its history since ${mergeBase.slice(0, 7)}` });
  else {
    const touches = blocks.flatMap((b) => b.block.touches);
    const outside = [...changed].filter((f) => !allowedFile(f, touches));
    const qaOutside = [];
    const log = git('log', '--format=%H%x00%B%x01', `${mergeBase}..HEAD`);
    for (const entry of log.split('\x01')) {
      const [sha, body] = entry.trim().split('\x00');
      if (!sha || !/^Agent:\s*qa\s*$/mi.test(body ?? '')) continue;
      for (const f of git('show', '--name-only', '--format=', sha).split('\n').filter(Boolean)) {
        if (!qaAllowedFile(f)) qaOutside.push({ commit: sha.slice(0, 7), file: f });
      }
    }
    const foundIn = blocks.filter((b) => b.block.where !== 'working tree').map((b) => `${b.id} from ${b.block.where}`);
    record('scope', { pass: outside.length === 0 && qaOutside.length === 0, touches, ...(foundIn.length ? { blocksFrom: foundIn } : {}), ...(outside.length ? { outsideTouches: outside } : {}), ...(qaOutside.length ? { qaCommitsOutsideTests: qaOutside } : {}) });
  }
}

// 6. changelog: CHANGELOG.md names each task under Unreleased (the changelog agent writes that line).
if (options.tasks.length === 0) {
  record('changelog', { pass: null, reason: 'skipped (no --task)' });
} else {
  const path = join(ROOT, 'CHANGELOG.md');
  if (!existsSync(path)) record('changelog', { pass: false, reason: 'no CHANGELOG.md' });
  else {
    const text = readFileSync(path, 'utf8');
    const unreleased = text.match(/^## Unreleased[^\n]*\n([\s\S]*?)(?=^## |(?![\s\S]))/m)?.[1] ?? '';
    const lines = options.tasks.map((id) => ({ id, line: unreleased.split('\n').find((l) => l.includes(`**${id}**`)) }));
    const missing = lines.filter((l) => !l.line).map((l) => `**${l.id}**`);
    record('changelog', { pass: missing.length === 0, ...(missing.length ? { reason: `no line naming ${missing.join(', ')} under Unreleased` } : { lines: lines.map((l) => l.line.trim()) }) });
  }
}

writeFileSync(REPORT, `${JSON.stringify(report, null, 2)}\n`);
console.log(`${report.pass ? 'ALL GATES PASS' : 'GATES FAILED'} · ${relative(ROOT, REPORT)}`);
process.exit(report.pass ? 0 : 1);
