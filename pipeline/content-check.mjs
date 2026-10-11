#!/usr/bin/env node
/**
 * The content check (CT1, the content toolkit): every check for one replica or part, in four levels, and a report in
 * plain words with pictures. docs/content/README.md says when to run it; the new-content skill runs it for you.
 *
 *   node pipeline/content-check.mjs <item|all> [options]      the item by pool ID, name or Key ("000007", "Red Dot")
 *
 *   --balance        also run level 4, the balance run (bot matches; minutes per map, one process per map in parallel)
 *   --public         the public gate: all four levels at full length, every warning listed for the owner's OK
 *   --levels a,b     only these levels (rules, compatibility, spec, balance)
 *   --maps a,b       the balance run on these maps only (by id: depot, woodland, neon)
 *   --seeds n        seeds per pairing (default config/contentRules.ts CONTENT_BALANCE_RUN)
 *   --seconds n      match length in seconds (the same default's)
 *   --no-pictures    skip the pictures (they need a browser and the e2e build)
 *   --url u          draw the pictures from a running e2e build instead of building and serving one
 *
 * Writes pipeline/out/content/<id>/report.md, report.html (one file, pictures inside), report.json and pictures/.
 * Exits 1 when a check fails or a runner could not run, else 0 (warnings are for the owner, not the exit code).
 */
import { execFileSync, spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { measuresFrom, measuresNotRun } from './balanceReport.mjs';
import { drawPictures } from './content-pictures.mjs';
import { balanceResults, LEVELS, reportHtml, reportMarkdown, worst } from './contentReport.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const ARTIFACTS = join(ROOT, 'pipeline', 'out', 'qa-artifacts');

/** The command line as options; throws with a usage line on a mistake. */
export function parseArgs(argv) {
  const o = { item: '', levels: ['rules', 'compatibility', 'spec'], balance: false, publicGate: false, maps: [], seeds: undefined, seconds: undefined, pictures: true, url: '' };
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
    else if (a.startsWith('--')) throw new Error(`unknown option ${a}`);
    else o.item = o.item ? `${o.item} ${a}` : a;
  }
  if (!o.item) throw new Error('name an item (its pool ID, name or Key) or "all"');
  if (o.publicGate) o.levels = [...LEVELS];
  else if (o.balance && !levelsGiven) o.levels = [...o.levels, 'balance'];
  const bad = o.levels.filter((l) => !LEVELS.includes(l));
  if (bad.length > 0) throw new Error(`unknown level ${bad.join(', ')} (levels: ${LEVELS.join(', ')})`);
  for (const [name, n] of [['--seeds', o.seeds], ['--seconds', o.seconds]]) if (n !== undefined && !(Number.isInteger(n) && n > 0)) throw new Error(`${name} needs a whole number above 0`);
  if (o.item === 'all' && o.levels.includes('balance')) throw new Error('the balance run takes one item, not "all"');
  if (o.item === 'all') o.pictures = false;
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
    console.error(`content-check: ${e.message}\n  usage: node pipeline/content-check.mjs <item|all> [--balance] [--public] [--levels a,b] [--maps a,b] [--seeds n] [--seconds n] [--no-pictures] [--url u]`);
    process.exit(2);
  }
  mkdirSync(ARTIFACTS, { recursive: true });
  const started = Date.now();
  const env = { AIRSOFT_CONTENT_ITEM: o.item, ...(o.seeds ? { AIRSOFT_CONTENT_SEEDS: String(o.seeds) } : {}), ...(o.seconds ? { AIRSOFT_CONTENT_SECONDS: String(o.seconds) } : {}) };

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
  for (const data of balanceData) {
    if (data.error) {
      problems.push(data.error);
      continue;
    }
    results.push(...balanceResults(measuresFrom(data, ROOT)));
    for (const n of measuresNotRun(data, ROOT)) results.push({ level: 'balance', check: 'balance.run', item: n.test, verdict: 'fail', says: `did not run: ${n.message}` });
  }
  for (const p of pictures.filter((x) => !x.ok)) results.push({ level: 'spec', check: 'spec.picture', item: p.title, verdict: 'warn', says: `not drawn (${p.error}); look at it in the game instead.` });

  const meta = { commit: commitOf(), when: `${new Date().toISOString().slice(0, 16).replace('T', ' ')} UTC`, levels: o.levels, publicGate: o.publicGate };
  const md = reportMarkdown({ content, item, results, pictures, meta });
  const images = {};
  for (const p of pictures.filter((x) => x.ok)) {
    const path = join(pictureDir, p.file);
    if (existsSync(path)) images[`pictures/${p.file}`] = `data:image/${p.file.endsWith('.png') ? 'png' : 'jpeg'};base64,${readFileSync(path).toString('base64')}`;
  }
  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, 'report.md'), md);
  writeFileSync(join(outDir, 'report.html'), reportHtml(md, `Content report: ${item.name}`, images));
  writeFileSync(join(outDir, 'report.json'), `${JSON.stringify({ ...meta, item, results, pictures, problems }, null, 2)}\n`);

  const verdict = worst(results);
  const counts = ['fail', 'warn', 'pass', 'info'].map((v) => `${results.filter((r) => r.verdict === v).length} ${v}`).join(', ');
  console.log(`content-check: ${item.name}: ${verdict === 'fail' ? 'FAILS' : verdict === 'warn' ? 'passes, with things to look at' : 'passes'} (${counts}; ${Math.round((Date.now() - started) / 1000)} s) · ${relative(ROOT, join(outDir, 'report.md'))}`);
  for (const r of results.filter((x) => x.verdict === 'fail' || x.verdict === 'warn')) console.log(`  ${r.verdict}: ${r.check} · ${r.item}: ${r.says}`);
  for (const p of problems) console.log(`  could not run: ${p}`);
  process.exit(verdict === 'fail' || problems.length > 0 ? 1 : 0);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) await main();
