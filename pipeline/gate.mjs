#!/usr/bin/env node
/**
 * The pipeline's gates (pipeline/README.md): a plain script, no model, that runs the project's checks and writes
 * pipeline/out/gate-report.json with pass / fail per gate and the evidence paths, plus pipeline/out/metrics-row.md, the
 * attempt row for the task's record (pipeline/records.mjs). A failed gate means the task goes back to the worker with
 * this report; the critic runs only on a report where every gate passed.
 *
 *   node pipeline/gate.mjs [--task M27[,M28]] [--quick] [--no-smoke] [--perf] [--env container|laptop|ci] [--base origin/main] [--ci]
 *                          [--tests auto|all|fast|slow] [--shard k/n] [--only tests]
 *
 * Gates: build (tsc + vite build with the chunk budgets), tests (vitest), smoke (playwright), perf (one perf-run.mjs
 * run per map, mode and preset of perf-budget.json's matrix that the diff reaches, pipeline/perfMatrix.mjs; --perf runs
 * the whole matrix), scope (the diff stays inside the task's `touches`, QA commits touch only tests) and changelog
 * (CHANGELOG.md names the task under Unreleased).
 * --quick runs build and tests only, and builds without the .br/.gz copies (AIRSOFT_PRECOMPRESS=0, audit CORE-11).
 * Every run writes the failures-only summary, pipeline/out/failures.md (pipeline/failures.mjs: each failure's test,
 * error, file and line, the same lines the gate prints as it goes), and every run but CI's the review packet the critic
 * and QA read first, pipeline/out/review-packet.md (pipeline/packet.mjs; token-efficiency plan, items 15 and 19).
 * --ci is what the workflow runs: build, tests, smoke (no perf: a runner has no baseline); without --task it takes
 * the task ids from the pull request's title in GATE_PR_TITLE (audit CORE-08).
 * With no task, scope and changelog are skipped. Exit code 1 when any gate fails.
 * CI splits the work across jobs (audit CORE-04): `--tests fast` runs the unit tests' fast project only, `--tests slow
 * --shard k/n` one share of the headless bot-match guards (vitest's own sharding, by file), and `--only tests` runs
 * the tests gate alone (no build, smoke, perf, scope or changelog). Off CI the default, `--tests auto`, runs the slow
 * project only when the diff reaches one of its files (pipeline/testReach.mjs, token plan item 21); `--tests all` runs
 * both regardless. CI always runs every test.
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { allowedFile, findTaskBlock, parseTaskList, qaAllowedFile, taskIdsFromTitle, tasksVersions } from './scope.mjs';
import { baselineFileName, baselineLag, baselineLagWarning, budgetFor, judgeRun, runFileName, runName, selectPerfRuns } from './perfMatrix.mjs';
import { smokeFailures } from './smokeReport.mjs';
import { metricsRow } from './records.mjs';
import { MAX_FAILURES, buildFailures, failureLines, failuresSummary, vitestFailures } from './failures.mjs';
import { writePacket } from './packet.mjs';
import { reachNote, slowGuardsReached } from './testReach.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'pipeline', 'out');
const ARTIFACTS = join(OUT, 'qa-artifacts');
const REPORT = join(OUT, 'gate-report.json');
/** The attempt row for the task's record (docs/records/README.md), filled from this report (token-efficiency item 4). */
const METRICS_ROW = join(OUT, 'metrics-row.md');
/** The failures-only summary (token-efficiency item 19), read instead of a raw log. */
const FAILURES = join(OUT, 'failures.md');
const TASKS = join(ROOT, 'docs', 'TASKS.md');


const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const value = (name, fallback) => (args.includes(name) ? args[args.indexOf(name) + 1] : fallback);
const prTitle = flag('--ci') ? process.env.GATE_PR_TITLE ?? '' : '';
/** CI, and a run that names a shard, run every test they are given; a local run judges whether the slow guards matter. */
const testsDefault = flag('--ci') || args.includes('--shard') ? 'all' : 'auto';
const options = {
  // One task id or several ("FA5,FA9"); on CI, else the ids the pull request's title starts with.
  tasks: args.includes('--task') ? parseTaskList(value('--task', '')) : taskIdsFromTitle(prTitle),
  quick: flag('--quick'),
  ci: flag('--ci'),
  smoke: !flag('--no-smoke') && !flag('--quick'),
  perf: flag('--perf'),
  env: value('--env', flag('--ci') ? 'ci' : 'container'),
  base: value('--base', 'origin/main'),
  /**
   * Which vitest project(s) the tests gate runs, and which share of their files (CI's jobs, audit CORE-04). `auto`: the
   * fast project, plus the slow one when the diff reaches it (token plan item 21).
   */
  tests: value('--tests', testsDefault),
  shard: value('--shard', null),
  /** `--only tests`: just the tests gate (CI's slow-guard jobs); every other gate is skipped. */
  only: value('--only', null),
};
if (!['auto', 'all', 'fast', 'slow'].includes(options.tests)) throw new Error(`gate: --tests takes auto, all, fast or slow, not ${options.tests}`);
const shardOk = (s) => { const m = /^(\d+)\/(\d+)$/.exec(s); return m !== null && Number(m[1]) >= 1 && Number(m[1]) <= Number(m[2]); };
if (options.shard !== null && !shardOk(options.shard)) throw new Error(`gate: --shard takes k/n with 1 ≤ k ≤ n, not ${options.shard}`);
if (options.only !== null && options.only !== 'tests') throw new Error(`gate: --only takes tests, not ${options.only}`);
const skipAllBut = (gate) => options.only !== null && options.only !== gate;

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
/** The perf runs this diff needs (perf-budget.json › matrix, perfMatrix.mjs): --perf runs them all. */
const budgets = JSON.parse(readFileSync(join(ROOT, 'pipeline', 'perf-budget.json'), 'utf8'));
const perfRuns = selectPerfRuns(changed, budgets.matrix ?? [], { force: options.perf });
const perfRequired = perfRuns.length > 0;

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
  perfRuns: perfRuns.map(runName),
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
  console.log(`gate ${name.padEnd(9)} ${mark}${gate.ms !== undefined ? ` (${(gate.ms / 1000).toFixed(0)} s)` : ''}${gate.reason ? ` · ${gate.reason}` : ''}${gate.note ? ` · ${gate.note}` : ''}`);
  // A failed gate names what failed in the log too, so a CI run can be read without downloading its artifact: the
  // test, the error's first lines (a smoke failure's locator, expectation and call log) and the file and line.
  for (const f of gate.pass === false ? (gate.failures ?? []) : []) {
    for (const line of failureLines(f)) console.log(`  ${line}`);
  }
}

// 1. build: type check and the production build with its chunk budgets (vite.config.ts fails over budget on CI). Always
// built; the stamp it leaves lets the smoke test's release server reuse dist/ (pipeline/build-cached.mjs). --quick
// leaves out the .br/.gz copies (owner decision 3 of audit 2, CORE-11): only the release smoke test and a host read
// them, and Brotli is most of the build's plugin time. The full gate and CI say so explicitly, so a shell's leftover
// AIRSOFT_PRECOMPRESS=0 can't reach them.
const PRECOMPRESS_ENV = { AIRSOFT_PRECOMPRESS: options.quick ? '0' : '1' };
if (skipAllBut('build')) record('build', { pass: null, reason: `skipped (--only ${options.only})` });
else {
  const r = run('build', 'node', ['pipeline/build-cached.mjs', '--mode', 'production', '--force'], { ...PRECOMPRESS_ENV, ...(options.ci ? { CI: '1' } : {}) });
  record('build', { pass: r.ok, ms: r.ms, log: r.log, precompressed: !options.quick, ...(r.ok ? {} : { evidence: tail(r.output), failures: buildFailures(r.output, ROOT).slice(0, MAX_FAILURES) }) });
}

/**
 * The vitest project(s) the tests gate runs: `options.tests`, or for `auto` the fast project plus the slow one when the
 * diff reaches a file the slow guards load (token plan item 21), with the note the gate prints.
 */
function testProjects() {
  if (options.tests !== 'auto') return { projects: options.tests };
  try {
    const listed = JSON.parse(execFileSync('npx', ['vitest', 'list', '--project', 'slow', '--filesOnly', '--json'], { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], shell: process.platform === 'win32' }));
    const guards = listed.map((t) => relative(ROOT, t.file).split('\\').join('/'));
    const read = (f) => readFileSync(join(ROOT, f), 'utf8');
    const isFile = (f) => existsSync(join(ROOT, f)) && statSync(join(ROOT, f)).isFile();
    const reach = slowGuardsReached(changed, guards, read, isFile);
    return { projects: reach.reached ? 'all' : 'fast', note: reachNote(reach) };
  } catch (e) {
    return { projects: 'all', note: `both projects: the slow guards' files could not be listed (${e.message.split('\n')[0]})` };
  }
}

// 2. tests: the unit suite, with its JSON report as the artifact.
{
  const json = join(ARTIFACTS, 'vitest.json');
  const chosen = testProjects();
  const projects = chosen.projects === 'all' ? [] : ['--project', chosen.projects];
  const shard = options.shard ? [`--shard=${options.shard}`] : [];
  const r = run('tests', 'npx', ['vitest', 'run', ...projects, ...shard, '--reporter=json', `--outputFile=${json}`]);
  let summary = { pass: r.ok, ms: r.ms, log: r.log };
  try {
    const data = JSON.parse(readFileSync(json, 'utf8'));
    // Each failed test, and each test file that failed to load, with its file and line (pipeline/failures.mjs).
    const failed = vitestFailures(data, ROOT);
    const pass = r.ok && data.numFailedTests === 0 && data.numTotalTests > 0 && failed.length === 0;
    summary = { ...summary, projects: chosen.projects, ...(chosen.note ? { note: chosen.note } : {}), ...(options.shard ? { shard: options.shard } : {}), total: data.numTotalTests, failed: data.numFailedTests, pass, report: relative(ROOT, json), ...(failed.length ? { failures: failed.slice(0, MAX_FAILURES) } : {}), ...(!pass && !failed.length ? { evidence: tail(r.output, 15) } : {}) };
  } catch (e) {
    summary = { ...summary, pass: false, reason: `no readable vitest report (${e.message})`, evidence: tail(r.output) };
  }
  record('tests', summary);
}

// 3. smoke: the Playwright browser test of the e2e build; the spec itself asserts zero console errors and page errors.
if (skipAllBut('smoke')) record('smoke', { pass: null, reason: `skipped (--only ${options.only})` });
else if (!options.smoke) {
  record('smoke', { pass: null, reason: options.quick ? 'skipped (--quick)' : 'skipped (--no-smoke)' });
} else {
  const json = join(ARTIFACTS, 'playwright.json');
  // playwright.config.ts writes the JSON report into qa-artifacts; its release server reuses the build step's dist/.
  const r = run('smoke', 'npx', ['playwright', 'test'], PRECOMPRESS_ENV);
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

// 4. perf: the harness (pipeline/perf-run.mjs), once per combination of the matrix the diff reaches (perfMatrix.mjs,
// audit CORE-03), each against its map's budget and its own baseline. A baseline whose head is far behind HEAD is a
// warning, never a failure (CORE-12).
if (skipAllBut('perf')) record('perf', { pass: null, reason: `skipped (--only ${options.only})` });
else if (!perfRequired) {
  record('perf', { pass: null, reason: 'not required (no perf-relevant path changed)' });
} else if (options.quick || options.ci) {
  record('perf', { pass: null, reason: `required but skipped (${options.quick ? '--quick' : '--ci: no baseline on a runner'}); would run ${perfRuns.map(runName).join(', ')}` });
} else if (!existsSync(join(ROOT, 'pipeline', 'perf-run.mjs'))) {
  record('perf', { pass: null, reason: 'required but the harness (pipeline/perf-run.mjs) is not installed yet' });
} else {
  const started = Date.now();
  const frameTimesGated = (budgets.frameTimeGatedEnvs ?? []).includes(options.env);
  const runs = [];
  const warnings = [];
  const failures = [];
  for (const combo of perfRuns) {
    const name = runName(combo);
    // --expose-gc for the harness's own process too (the page gets gc() from its own flags).
    const r = run(`perf-${name.replaceAll(' ', '-')}`, 'node', ['--expose-gc', 'pipeline/perf-run.mjs', '--env', options.env, '--map', combo.map, '--mode', combo.mode, '--preset', combo.preset]);
    const runFile = join(OUT, runFileName(options.env, combo));
    let summary = { run: name, pass: r.ok, ms: r.ms, log: r.log };
    try {
      const result = JSON.parse(readFileSync(runFile, 'utf8'));
      if (result.head !== head) throw new Error(`${relative(ROOT, runFile)} is from ${String(result.head).slice(0, 7)}, not this head`);
      const baselineName = baselineFileName(options.env, combo, budgets.budgetPreset);
      const baselinePath = join(ROOT, 'pipeline', 'baseline', baselineName);
      const baseline = existsSync(baselinePath) ? JSON.parse(readFileSync(baselinePath, 'utf8')) : null;
      const { over, worse, note: baselineNote } = judgeRun({ run: combo, metrics: result.metrics, budget: budgetFor(budgets, combo.map, combo.preset), baseline, baselineName, frameTimesGated });
      if (baseline) {
        const warning = baselineLagWarning(baselineName, baseline.head, baselineLag(baseline.head, (h) => git('rev-list', '--count', `${h}..HEAD`)), budgets.baselineMaxLag ?? 20);
        if (warning) warnings.push(warning);
      }
      const { drawCalls, drawCallsMax, triangles, gpuMemoryMB, heapGrowthMB, p95Ms, p99Ms } = result.metrics;
      summary = { ...summary, pass: r.ok && over.length === 0 && worse.length === 0, file: relative(ROOT, runFile), metrics: { drawCalls, drawCallsMax, triangles, gpuMemoryMB, heapGrowthMB, p95Ms, p99Ms }, ...(over.length ? { overBudget: over } : {}), ...(worse.length ? { worse } : {}), ...(baselineNote ? { reason: baselineNote } : {}), ...(r.ok ? {} : { evidence: tail(r.output, 10) }) };
    } catch (e) {
      summary = { ...summary, pass: false, reason: `no readable perf run (${e.message})`, evidence: tail(r.output) };
    }
    runs.push(summary);
    if (!summary.pass) {
      const what = [...(summary.overBudget ?? []).map((o) => `${o.metric} ${o.now} over the budget ${o.limit}`), ...(summary.worse ?? []).map((w) => `${w.metric} ${w.now} is ${w.pct} % over the baseline's ${w.baseline}`)];
      failures.push({ test: name, message: what.length ? what.join('; ') : summary.reason ?? `perf-run.mjs failed (${summary.log})` });
    }
    console.log(`  perf ${name}: ${summary.pass ? 'pass' : 'FAIL'}${summary.metrics ? ` · ${summary.metrics.drawCalls} draw calls, ${Math.round(summary.metrics.triangles)} triangles, ${summary.metrics.gpuMemoryMB} MB` : ''}`);
  }
  for (const w of warnings) console.warn(`  perf warning: ${w}`);
  record('perf', { pass: runs.every((x) => x.pass), ms: Date.now() - started, frameTimesGated, runs, ...(warnings.length ? { warnings } : {}), ...(failures.length ? { failures } : {}) });
}

// 5. scope: the diff stays inside the task's `touches` (plus tests and docs), and QA commits touch only tests.
if (skipAllBut('scope')) record('scope', { pass: null, reason: `skipped (--only ${options.only})` });
else if (options.tasks.length === 0) {
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
if (skipAllBut('changelog')) record('changelog', { pass: null, reason: `skipped (--only ${options.only})` });
else if (options.tasks.length === 0) {
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
writeFileSync(METRICS_ROW, `${metricsRow(report)}\n`);
writeFileSync(FAILURES, failuresSummary(report));
// The review packet (pipeline/packet.mjs) for the critic and QA; not on CI, where no agent reads it. Never fails the gate.
let packet = null;
if (!options.ci && options.only === null) {
  try {
    packet = writePacket({ ids: options.tasks, base: options.base, mergeBase, report });
  } catch (e) {
    console.warn(`gate: no review packet (${e.message})`);
  }
}
console.log(`${report.pass ? 'ALL GATES PASS' : `GATES FAILED · failures in ${relative(ROOT, FAILURES)}`} · ${relative(ROOT, REPORT)} · attempt row in ${relative(ROOT, METRICS_ROW)}${packet ? ` · review packet in ${packet}` : ''}`);
process.exit(report.pass ? 0 : 1);
