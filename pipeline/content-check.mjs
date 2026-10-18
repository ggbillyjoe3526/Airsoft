#!/usr/bin/env node
/**
 * The content check (CT1, the content toolkit): every check for one replica or part, in four levels, and a report in
 * plain words with pictures. docs/content/README.md says when to run it; the new-content skill runs it for you.
 *
 *   node pipeline/content-check.mjs <item|all> [options]      the item by pool ID, name or Key ("000007", "Red Dot")
 *   node pipeline/content-check.mjs map:<id|all> [options]    a map by its id or name (CT2: "map:depot", "map:Woodland")
 *   node pipeline/content-check.mjs mode:<id|all> [options]   a mode by its id or name (CT3: "mode:attackDefend")
 *   node pipeline/content-check.mjs skin:<id|all> [options]   a skin (a replica colour scheme) by its id or name (CT4: "skin:cobalt")
 *
 *   --balance        also run level 4, the balance run (bot matches; minutes per map, one process per map in parallel)
 *   --public         the public gate: all four levels at full length, every warning listed for the owner's OK
 *   --levels a,b     only these levels (rules, compatibility, spec, balance)
 *   --maps a,b       the balance run on these maps only (by id: depot, woodland, neon); a skin: its map colours on these only
 *   --seeds n        seeds per pairing (default config/contentRules.ts CONTENT_BALANCE_RUN)
 *   --seconds n      match length in seconds (the same default's)
 *   --no-pictures    skip the pictures (they need a browser and the e2e build)
 *   --url u          draw the pictures from a running e2e build instead of building and serving one
 *   --no-perf        a map or mode: skip the spec test's perf runs (a map: Elimination on Low, Medium and High, about ten
 *                    minutes; a mode: Low on each map that hosts it, about a minute and a half each)
 *   --env e          a map or mode: the perf runs' environment (perf-run.mjs --env; default container)
 *   --no-browser     a mode: skip the spec test's short match in the browser (e2e/modeMatch.spec.ts, about a minute);
 *                    a skin: skip measuring each map's colours in the browser (about a minute a map)
 *
 * A map's levels are its rules, its layout (shown as level 2), the spec test (the perf runs and pictures) and the balance
 * run: every lighting and mode it offers at every level, one process per lighting and mode in parallel. Every
 * map's layout is in the report beside this one's; "map:all" checks levels 1 to 3 of every map without perf or pictures.
 * A mode's (CT3) are its rules, its fit (rulesets, match rows and a short headless match of each pairing, and its bots'
 * own plan, on every map that hosts it), the spec test (a short match in the browser, the perf runs) and the balance
 * run on every map and lighting that hosts it at every level, with Elimination beside a round mode for its pay. Every
 * mode is in the report beside this one; "mode:all" checks levels 1 and 2 of every mode on its first public map.
 * A skin's (CT4) are its rules, its fit (drawn on every replica it claims at Low and High, from the model files too; the
 * orange tip; Realistic colours; the same numbers with it and without), the spec test (the team colours, texture memory,
 * each map's colours measured in the browser, pictures on each replica) and no balance run (looks only). Every skin is
 * in the report beside this one; "skin:all" checks levels 1 to 3 of every skin without the browser.
 *
 * Writes pipeline/out/content/<id>/report.md, report.html (one file, pictures inside), report.json and pictures/
 * (<id> is the item's, map-<id> for a map, maps for every map, mode-<id> for a mode, modes for every mode, skin-<id> for
 * a skin, skins for every skin).
 * Exits 1 when a check fails or a runner could not run, else 0 (warnings are for the owner, not the exit code).
 */
import { execFileSync, spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { measuresFrom, measuresNotRun } from './balanceReport.mjs';
import { drawMapPictures, drawPictures, mapShotPictures, measureMapPalettes } from './content-pictures.mjs';
import { balanceResults, LEVELS, mapReportMarkdown, modeReportMarkdown, payResults, perfResult, reportHtml, reportMarkdown, runOrderResults, skinReportMarkdown, worst } from './contentReport.mjs';
import { baselineFileName, budgetFor, frameTimesGatedFor, judgeRun, runFileName } from './perfMatrix.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const ARTIFACTS = join(ROOT, 'pipeline', 'out', 'qa-artifacts');

/** The command line as options; throws with a usage line on a mistake. */
export function parseArgs(argv) {
  const o = { item: '', levels: ['rules', 'compatibility', 'spec'], balance: false, publicGate: false, maps: [], seeds: undefined, seconds: undefined, pictures: true, url: '', perf: true, env: 'container', browser: true };
  let levelsGiven = false;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const value = () => {
      const v = argv[++i];
      if (v === undefined) throw new Error(`${a} needs a value`);
      return v;
    };
    if (a === '--balance') o.balance = true;
    else if (a === '--public') o.publicGate = true;
    else if (a === '--no-pictures') o.pictures = false;
    else if (a === '--levels') {
      o.levels = value().split(',').filter(Boolean);
      levelsGiven = true;
    } else if (a === '--maps') o.maps = value().split(',').filter(Boolean);
    else if (a === '--seeds') o.seeds = Number(value());
    else if (a === '--seconds') o.seconds = Number(value());
    else if (a === '--url') o.url = value();
    else if (a === '--no-perf') o.perf = false;
    else if (a === '--no-browser') o.browser = false;
    else if (a === '--env') o.env = value();
    else if (a.startsWith('--')) throw new Error(`unknown option ${a}`);
    else o.item = o.item ? `${o.item} ${a}` : a;
  }
  if (!o.item) throw new Error('name an item (its pool ID, name or Key) or "all"');
  if (o.publicGate) o.levels = [...LEVELS];
  else if (o.balance && !levelsGiven) o.levels = [...o.levels, 'balance'];
  const bad = o.levels.filter((l) => !LEVELS.includes(l));
  if (bad.length > 0) throw new Error(`unknown level ${bad.join(', ')} (levels: ${LEVELS.join(', ')})`);
  for (const [name, n] of [['--seeds', o.seeds], ['--seconds', o.seconds]]) if (n !== undefined && !(Number.isInteger(n) && n > 0)) throw new Error(`${name} needs a whole number above 0`);
  const every = o.item === 'all' || /^(map|mode|skin):all$/i.test(o.item);
  if (every && o.levels.includes('balance')) throw new Error(`the balance run takes one item, not "${o.item}"`);
  if (every) o.pictures = false;
  o.isMap = /^map:/i.test(o.item);
  o.isMode = /^mode:/i.test(o.item);
  o.isSkin = /^skin:/i.test(o.item);
  if (!o.isMap && !o.isMode && (!o.perf || o.env !== 'container')) throw new Error('--no-perf and --env are for a map or mode (map:<id>, mode:<id>)');
  if (!o.isMode && !o.isSkin && !o.browser) throw new Error('--no-browser is for a mode or skin (mode:<id>, skin:<id>)');
  if ((o.isMap || o.isMode) && o.maps.length > 0) throw new Error(`--maps is for a replica or part; a ${o.isMap ? 'map plays on itself' : 'mode plays on every map that hosts it'}`);
  if (every || !o.levels.includes('spec')) {
    o.perf = false;
    o.browser = false;
  }
  return o;
}

/** Runs one content report file through vitest; resolves to its JSON report (or `{ error }`). */
function runReport(file, env, tag) {
  const json = join(ARTIFACTS, `content-${tag}.json`);
  const log = join(ARTIFACTS, `content-${tag}.log`);
  rmSync(json, { force: true });
  return new Promise((resolve) => {
    // AIRSOFT_CONTENT adds the `content` project to vite.config.ts, which `vitest run` otherwise never sees.
    const child = spawn('npx', ['vitest', 'run', '--project', 'content', '--reporter=json', `--outputFile=${json}`, file], {
      cwd: ROOT,
      env: { ...process.env, AIRSOFT_CONTENT: '1', ...env },
      shell: process.platform === 'win32',
    });
    let out = '';
    child.stdout.on('data', (d) => (out += d));
    child.stderr.on('data', (d) => (out += d));
    child.on('close', () => {
      writeFileSync(log, out);
      try {
        resolve(JSON.parse(readFileSync(json, 'utf8')));
      } catch (e) {
        resolve({ error: `no readable vitest report (${e.message}); the log is ${relative(ROOT, log)}` });
      }
    });
  });
}

/** The `content` meta the item report put on its test. */
function contentOf(data) {
  for (const file of data?.testResults ?? []) for (const t of file.assertionResults ?? []) if (t.meta?.content) return t.meta.content;
  return null;
}

function commitOf() {
  try {
    return execFileSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    return '?';
  }
}

async function main() {
  let o;
  try {
    o = parseArgs(process.argv.slice(2));
  } catch (e) {
    console.error(`content-check: ${e.message}\n  usage: node pipeline/content-check.mjs <item|all|map:<id>|map:all|mode:<id>|mode:all|skin:<id>|skin:all> [--balance] [--public] [--levels a,b] [--maps a,b] [--seeds n] [--seconds n] [--no-pictures] [--url u] [--no-perf] [--env e] [--no-browser]`);
    process.exit(2);
  }
  mkdirSync(ARTIFACTS, { recursive: true });
  const started = Date.now();
  const env = { AIRSOFT_CONTENT_ITEM: o.item, ...(o.seeds ? { AIRSOFT_CONTENT_SEEDS: String(o.seeds) } : {}), ...(o.seconds ? { AIRSOFT_CONTENT_SECONDS: String(o.seconds) } : {}) };
  if (o.isMap) return finish(await checkMapItem(o, env), started);
  if (o.isMode) return finish(await checkModeItem(o, env), started);
  if (o.isSkin) return finish(await checkSkinItem(o, env), started);

  console.log(`content-check: ${o.item}: rules, compatibility and the spec test…`);
  const itemData = await runReport('src/content/report/item.report.ts', env, 'item');
  const content = contentOf(itemData);
  if (!content) {
    const why = itemData.error ?? measuresNotRun(itemData, ROOT)[0]?.message ?? 'the item report found nothing';
    console.error(`content-check: ${why}`);
    process.exit(1);
  }
  const item = o.item === 'all' ? { id: 'all', name: 'Every item', category: 'all', tag: 'mixed' } : content.items[0];
  const results = content.results.filter((r) => o.levels.includes(r.level));
  const problems = [];

  let pictures = [];
  const outDir = join(ROOT, 'pipeline', 'out', 'content', item.id);
  rmSync(outDir, { recursive: true, force: true });
  const pictureDir = join(outDir, 'pictures');
  const balanceRun = o.levels.includes('balance')
    ? (() => {
        const maps = content.plan.maps.filter((m) => o.maps.length === 0 || o.maps.includes(m.id));
        if (maps.length === 0) problems.push(`no map is called ${o.maps.join(', ')} (maps: ${content.plan.maps.map((m) => m.id).join(', ')})`);
        console.log(`content-check: the balance run on ${maps.map((m) => m.label).join(', ')} (one process each)…`);
        return Promise.all(maps.map((m) => runReport('src/content/report/balance.report.ts', { ...env, AIRSOFT_CONTENT_MAP: m.id }, `balance-${m.id}`)));
      })()
    : Promise.resolve([]);
  const pictureRun = o.pictures && o.levels.includes('spec') ? drawPictures(content.pictures, { outDir: pictureDir, url: o.url }) : Promise.resolve([]);
  if (o.pictures && o.levels.includes('spec')) console.log(`content-check: drawing ${content.pictures.length} pictures…`);

  const [balanceData, drawn] = await Promise.all([balanceRun, pictureRun]);
  pictures = drawn;
  balanceFrom(balanceData, results, problems);
  for (const p of pictures.filter((x) => !x.ok)) results.push({ level: 'spec', check: 'spec.picture', item: p.title, verdict: 'warn', says: `not drawn (${p.error}); look at it in the game instead.` });

  const meta = { commit: commitOf(), when: `${new Date().toISOString().slice(0, 16).replace('T', ' ')} UTC`, levels: o.levels, publicGate: o.publicGate };
  writeReport({ outDir, pictureDir, item, results, pictures, problems, meta, md: reportMarkdown({ content, item, results, pictures, meta }) });
  return finish({ item, results, problems, outDir }, started);
}

/** Says the outcome and exits: 1 when a check fails or a runner could not run, else 0. */
function finish({ item, results, problems, outDir }, started) {
  const verdict = worst(results);
  const counts = ['fail', 'warn', 'pass', 'info'].map((v) => `${results.filter((r) => r.verdict === v).length} ${v}`).join(', ');
  console.log(`content-check: ${item.name}: ${verdict === 'fail' ? 'FAILS' : verdict === 'warn' ? 'passes, with things to look at' : 'passes'} (${counts}; ${Math.round((Date.now() - started) / 1000)} s) · ${relative(ROOT, join(outDir, 'report.md'))}`);
  for (const r of results.filter((x) => x.verdict === 'fail' || x.verdict === 'warn')) console.log(`  ${r.verdict}: ${r.check} · ${r.item}: ${r.says}`);
  for (const p of problems) console.log(`  could not run: ${p}`);
  process.exit(verdict === 'fail' || problems.length > 0 ? 1 : 0);
}

/** Every value its tests put in their meta under `key` (vitest's JSON report). */
function metasFrom(data, key) {
  const out = [];
  for (const file of data?.testResults ?? []) for (const t of file.assertionResults ?? []) if (t.meta?.[key]) out.push(t.meta[key]);
  return out;
}

/**
 * The balance run's results from its vitest reports, and any runner that could not run into `problems`: the figures,
 * then (CT3) each mode's pay beside Elimination's and a run mode's levels in order, across the reports.
 */
function balanceFrom(balanceData, results, problems) {
  const pays = [];
  const runs = [];
  for (const data of balanceData) {
    if (data.error) {
      problems.push(data.error);
      continue;
    }
    results.push(...balanceResults(measuresFrom(data, ROOT)));
    pays.push(...metasFrom(data, 'pay'));
    runs.push(...metasFrom(data, 'runs'));
    for (const n of measuresNotRun(data, ROOT)) results.push({ level: 'balance', check: 'balance.run', item: n.test, verdict: 'fail', says: `did not run: ${n.message}` });
  }
  results.push(...payResults(pays), ...runOrderResults(runs));
}

/** Runs a script under node; resolves to `{ ok, output }`. */
function runNode(args) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, args, { cwd: ROOT });
    let output = '';
    child.stdout.on('data', (d) => (output += d));
    child.stderr.on('data', (d) => (output += d));
    child.on('close', (code) => resolve({ ok: code === 0, output }));
  });
}

/**
 * The spec test's perf runs for a map (pipeline/perf-run.mjs, one preset after another), each judged as the gate judges
 * one (perfMatrix.mjs: the map's budget, its own baseline when there is one).
 */
async function mapPerf(perf, label, o, problems, check = 'map.perf') {
  const budgets = JSON.parse(readFileSync(join(ROOT, 'pipeline', 'perf-budget.json'), 'utf8'));
  const out = [];
  for (const preset of perf.presets) {
    console.log(`content-check: the perf run, ${label}, ${perf.mode}, ${preset}…`);
    const combo = { map: perf.map, mode: perf.mode, preset };
    // Port 4185: beside the gate's (4181) and the pictures' (4184).
    // The run file is removed first, so what is read after is this run's (perf-run.mjs writes it even with page errors).
    const file = join(ROOT, 'pipeline', 'out', runFileName(o.env, combo));
    rmSync(file, { force: true });
    const r = await runNode(['--expose-gc', 'pipeline/perf-run.mjs', '--env', o.env, '--map', perf.map, '--mode', perf.mode, '--preset', preset, '--port', '4185']);
    const log = join(ARTIFACTS, `content-perf-${perf.map}-${perf.mode}-${preset}.log`);
    writeFileSync(log, r.output);
    let result = null;
    try {
      result = JSON.parse(readFileSync(file, 'utf8'));
    } catch {
      result = null;
    }
    if (!result) {
      problems.push(`the perf run on ${preset} did not finish; its log is ${relative(ROOT, log)}`);
      continue;
    }
    const run = { ...combo, backend: result.backend };
    const baselineName = baselineFileName(o.env, run, budgets.budgetPreset);
    const baselinePath = join(ROOT, 'pipeline', 'baseline', baselineName);
    const baseline = existsSync(baselinePath) ? JSON.parse(readFileSync(baselinePath, 'utf8')) : null;
    const judged = judgeRun({ run: combo, metrics: result.metrics, budget: budgetFor(budgets, perf.map, preset, result.backend ?? 'webgl', o.env), baseline, baselineName, frameTimesGated: frameTimesGatedFor(budgets, o.env, preset) });
    out.push(perfResult(label, { ...run, metrics: result.metrics, errors: result.errors }, judged, check));
  }
  return out;
}

/** A map's content check (CT2): levels 1 to 3 from map.report.ts, then the balance run, pictures and perf runs. */
async function checkMapItem(o, env) {
  console.log(`content-check: ${o.item}: rules, layout and the spec test…`);
  const mapData = await runReport('src/content/report/map.report.ts', env, 'map');
  const content = contentOf(mapData);
  if (!content) {
    const why = mapData.error ?? measuresNotRun(mapData, ROOT)[0]?.message ?? 'the map report found nothing';
    console.error(`content-check: ${why}`);
    process.exit(1);
  }
  const item = content.items.length === 1 ? content.items[0] : { id: 'maps', name: 'Every map', category: 'map', tag: 'mixed', key: '' };
  const results = content.results.filter((r) => o.levels.includes(r.level));
  const problems = [];
  const outDir = join(ROOT, 'pipeline', 'out', 'content', item.id);
  rmSync(outDir, { recursive: true, force: true });
  const pictureDir = join(outDir, 'pictures');

  // The balance run: one process per lighting and round mode, in parallel.
  const plan = content.plan[0];
  const sweeps = o.levels.includes('balance') ? plan.lightings.flatMap((light) => plan.modes.map((mode) => ({ light, mode }))) : [];
  if (sweeps.length > 0) console.log(`content-check: the balance run on ${plan.label}: ${sweeps.map((s) => `${s.light} ${s.mode}`).join(', ')} (one process each)…`);
  const balanceRun = Promise.all(sweeps.map((s) => runReport('src/content/report/mapBalance.report.ts', { ...env, AIRSOFT_CONTENT_LIGHTING: s.light, AIRSOFT_CONTENT_MODE: s.mode }, `map-balance-${plan.id}-${s.light}-${s.mode}`)));
  const drawing = o.pictures && o.levels.includes('spec') && content.pictures.length > 0;
  if (drawing) console.log(`content-check: drawing ${content.pictures.length * 4} pictures…`);
  const pictureRun = drawing
    ? drawMapPictures(content.pictures, { outDir: pictureDir, url: o.url }).catch((e) => content.pictures.flatMap((s) => mapShotPictures(s).map((p) => ({ ...p, ok: false, error: String(e?.message ?? e).split('\n')[0] }))))
    : Promise.resolve([]);
  const [balanceData, pictures] = await Promise.all([balanceRun, pictureRun]);
  balanceFrom(balanceData, results, problems);
  for (const p of pictures.filter((x) => !x.ok)) results.push({ level: 'spec', check: 'spec.picture', item: p.title, verdict: 'warn', says: `not drawn (${p.error}); look at it in the game instead.` });
  // The perf runs last, on their own: frame counts and heap read cleaner without bot matches beside them.
  if (o.perf && content.perf) results.push(...(await mapPerf(content.perf, item.name, o, problems)));

  const meta = { commit: commitOf(), when: `${new Date().toISOString().slice(0, 16).replace('T', ' ')} UTC`, levels: o.levels, publicGate: o.publicGate };
  writeReport({ outDir, pictureDir, item, results, pictures, problems, meta, md: mapReportMarkdown({ content, item, results, pictures, meta }) });
  return { item, results, problems, outDir };
}

/**
 * The spec test's short match in the browser (CT3, e2e/modeMatch.spec.ts) for `browser` (the mode and the map it plays
 * on), through Playwright on the e2e build; resolves to its check result.
 */
function browserMatch(browser, label) {
  const json = join(ARTIFACTS, `content-browser-${browser.mode}.json`);
  const log = join(ARTIFACTS, `content-browser-${browser.mode}.log`);
  rmSync(json, { force: true });
  const item = `${label} on ${browser.mapLabel}, in the browser`;
  return new Promise((resolve) => {
    const child = spawn('npx', ['playwright', 'test', 'e2e/modeMatch.spec.ts', '--project', 'chromium', '--reporter=json'], {
      cwd: ROOT,
      env: { ...process.env, AIRSOFT_CONTENT_MODE: browser.mode, AIRSOFT_CONTENT_MAP_LABEL: browser.mapLabel, PLAYWRIGHT_JSON_OUTPUT_NAME: json },
      shell: process.platform === 'win32',
    });
    let out = '';
    child.stdout.on('data', (d) => (out += d));
    child.stderr.on('data', (d) => (out += d));
    child.on('close', () => {
      writeFileSync(log, out);
      let data = null;
      try {
        data = JSON.parse(readFileSync(json, 'utf8'));
      } catch {
        data = null;
      }
      const tests = (data?.suites ?? []).flatMap(function specs(s) {
        return [...(s.specs ?? []), ...(s.suites ?? []).flatMap(specs)];
      });
      const failed = tests.filter((t) => !t.ok);
      if (!data || tests.length === 0) resolve({ level: 'spec', check: 'mode.browser', item, verdict: 'fail', says: `did not run; its log is ${relative(ROOT, log)}.` });
      else if (failed.length > 0) {
        const error = failed[0].tests?.[0]?.results?.[0]?.error?.message ?? 'it failed';
        resolve({ level: 'spec', check: 'mode.browser', item, verdict: 'fail', says: `${String(error).replace(/\x1b\[[0-9;]*m/g, '').split('\n')[0]} (log: ${relative(ROOT, log)}).` });
      } else resolve({ level: 'spec', check: 'mode.browser', item, verdict: 'pass', says: `It started, a round ended each way, the end screen showed and nothing errored (${browser.play === 'run' ? 'a run lost on time, then one got out of' : 'a round won, a round lost, then the match'}).` });
    });
  });
}

/**
 * A mode's content check (CT3): levels 1 and 2 (with their short headless matches) from mode.report.ts, then the balance
 * run on every map and lighting that hosts it (Elimination beside a round mode, for its pay), the browser match and the
 * perf runs.
 */
async function checkModeItem(o, env) {
  console.log(`content-check: ${o.item}: rules, fit and the spec test…`);
  const modeData = await runReport('src/content/report/mode.report.ts', env, 'mode');
  const content = contentOf(modeData);
  if (!content) {
    const why = modeData.error ?? measuresNotRun(modeData, ROOT)[0]?.message ?? 'the mode report found nothing';
    console.error(`content-check: ${why}`);
    process.exit(1);
  }
  const item = content.items.length === 1 ? content.items[0] : { id: 'modes', name: 'Every mode', category: 'mode', tag: 'mixed', key: '' };
  const results = content.results.filter((r) => o.levels.includes(r.level));
  const problems = [];
  const outDir = join(ROOT, 'pipeline', 'out', 'content', item.id);
  rmSync(outDir, { recursive: true, force: true });

  // The balance run: one process per map, lighting and mode (the mode, and Elimination beside a round mode), in parallel.
  const plan = content.plan;
  const modes = plan ? [plan.mode, ...(plan.reference ? [plan.reference] : [])] : [];
  const sweeps = o.levels.includes('balance') && plan ? plan.maps.flatMap((m) => m.lightings.flatMap((light) => modes.map((mode) => ({ map: m.id, light, mode })))) : [];
  if (sweeps.length > 0) console.log(`content-check: the balance run for ${plan.label}: ${sweeps.map((s) => `${s.map} ${s.light} ${s.mode}`).join(', ')} (one process each)…`);
  const balanceRun = Promise.all(sweeps.map((s) => runReport('src/content/report/mapBalance.report.ts', { ...env, AIRSOFT_CONTENT_MAP: s.map, AIRSOFT_CONTENT_LIGHTING: s.light, AIRSOFT_CONTENT_MODE: s.mode }, `mode-balance-${s.map}-${s.light}-${s.mode}`)));
  if (o.browser && content.browser) console.log(`content-check: a short match in the browser, ${item.name} on ${content.browser.mapLabel}…`);
  const browserRun = o.browser && content.browser ? browserMatch(content.browser, item.name) : Promise.resolve(null);
  const [balanceData, browser] = await Promise.all([balanceRun, browserRun]);
  balanceFrom(balanceData, results, problems);
  if (browser) results.push(browser);
  // The perf runs last, on their own: frame counts and heap read cleaner without bot matches beside them.
  if (o.perf) for (const p of content.perf) results.push(...(await mapPerf({ map: p.map, mode: p.mode, presets: [p.preset] }, `${item.name} on ${p.label}`, o, problems, 'mode.perf')));

  const meta = { commit: commitOf(), when: `${new Date().toISOString().slice(0, 16).replace('T', ' ')} UTC`, levels: o.levels, publicGate: o.publicGate };
  writeReport({ outDir, pictureDir: join(outDir, 'pictures'), item, results, pictures: [], problems, meta, md: modeReportMarkdown({ content, item, results, meta }) });
  return { item, results, problems, outDir };
}

/**
 * A skin's content check (CT4): levels 1 to 3 from skin.report.ts, then the pictures and each map's colours in the
 * browser (one after the other: they serve the build on the same port), judged by skinMaps.report.ts. Level 4 is none.
 */
async function checkSkinItem(o, env) {
  console.log(`content-check: ${o.item}: rules, fit and the spec test…`);
  const skinData = await runReport('src/content/report/skin.report.ts', env, 'skin');
  const content = contentOf(skinData);
  if (!content) {
    const why = skinData.error ?? measuresNotRun(skinData, ROOT)[0]?.message ?? 'the skin report found nothing';
    console.error(`content-check: ${why}`);
    process.exit(1);
  }
  const item = content.items.length === 1 ? content.items[0] : { id: 'skins', name: 'Every skin', category: 'skin', tag: 'mixed', key: '' };
  const results = content.results.filter((r) => o.levels.includes(r.level));
  const problems = [];
  const outDir = join(ROOT, 'pipeline', 'out', 'content', item.id);
  rmSync(outDir, { recursive: true, force: true });
  const pictureDir = join(outDir, 'pictures');
  const spec = o.levels.includes('spec');

  let pictures = [];
  if (o.pictures && spec && content.pictures.length > 0) {
    console.log(`content-check: drawing ${content.pictures.length} pictures…`);
    pictures = await drawPictures(content.pictures, { outDir: pictureDir, url: o.url });
    for (const p of pictures.filter((x) => !x.ok)) results.push({ level: 'spec', check: 'spec.picture', item: p.title, verdict: 'warn', says: `not drawn (${p.error}); look at it in the game instead.` });
  }
  let palettes = [];
  if (o.browser && spec && content.items.length === 1) {
    const maps = content.maps.filter((m) => o.maps.length === 0 || o.maps.includes(m.id));
    if (maps.length === 0) problems.push(`no map is called ${o.maps.join(', ')} (maps: ${content.maps.map((m) => m.id).join(', ')})`);
    console.log(`content-check: measuring the colours of ${maps.map((m) => m.label).join(', ')} in the browser…`);
    palettes = await measureMapPalettes(maps.map((m) => ({ map: m.id, label: m.label, light: m.light })), { url: o.url });
    for (const p of palettes.filter((x) => x.error)) results.push({ level: 'spec', check: 'skin.map', item: `${item.name} on ${p.label}`, verdict: 'warn', says: `${p.label}'s colours could not be measured (${p.error}); look at it in the game.` });
    const measured = palettes.filter((p) => !p.error);
    if (measured.length > 0) {
      const file = join(ARTIFACTS, 'content-palettes.json');
      writeFileSync(file, `${JSON.stringify(measured)}\n`);
      const judged = contentOf(await runReport('src/content/report/skinMaps.report.ts', { ...env, AIRSOFT_CONTENT_PALETTES: file }, 'skin-maps'));
      if (judged) {
        results.push(...judged.results);
        // The report shows each map's palette as judged (merged, its rare colours left out), not the raw buckets.
        palettes = palettes.map((p) => judged.palettes?.find((j) => j.map === p.map) ?? p);
      } else problems.push('the skin-on-map runner found nothing; its log is pipeline/out/qa-artifacts/content-skin-maps.log');
    }
  }

  const meta = { commit: commitOf(), when: `${new Date().toISOString().slice(0, 16).replace('T', ' ')} UTC`, levels: o.levels, publicGate: o.publicGate };
  writeReport({ outDir, pictureDir, item, results, pictures, problems, meta, md: skinReportMarkdown({ content, item, results, pictures, palettes, meta }) });
  return { item, results, problems, outDir };
}

/** Writes report.md, report.html (the pictures inside) and report.json into `outDir`. */
function writeReport({ outDir, pictureDir, item, results, pictures, problems, meta, md }) {
  const images = {};
  for (const p of pictures.filter((x) => x.ok)) {
    const path = join(pictureDir, p.file);
    if (existsSync(path)) images[`pictures/${p.file}`] = `data:image/${p.file.endsWith('.png') ? 'png' : 'jpeg'};base64,${readFileSync(path).toString('base64')}`;
  }
  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, 'report.md'), md);
  writeFileSync(join(outDir, 'report.html'), reportHtml(md, `Content report: ${item.name}`, images));
  writeFileSync(join(outDir, 'report.json'), `${JSON.stringify({ ...meta, item, results, pictures, problems }, null, 2)}\n`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) await main();
