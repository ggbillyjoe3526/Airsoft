#!/usr/bin/env node
/**
 * The perf harness (pipeline/README.md): plays a fixed Depot match in the e2e build with the scripted player
 * (`?script=perf`, config/perfScript.ts) and seed 1, at a fixed resolution and pixel ratio, with the CPU throttled
 * over CDP, and records frame times, draw calls, triangles, GPU memory and heap growth for 60 s.
 *
 *   node pipeline/perf-run.mjs [--env container|laptop|ci] [--preset low|medium|high|all] [--cpu N] [--ticks 3600]
 *                              [--warmup-ticks 120] [--max-seconds 300] [--baseline] [--no-build] [--chromium /path]
 *                              [--channel chrome|msedge] [--headless] [--map depot|woodland]
 *
 * The e2e bundle is reused when the source hasn't changed since it was built (pipeline/build-cached.mjs).
 *
 * The window is counted in simulation ticks, not wall time, so the player is at the same point of the script
 * whatever the frame rate: 3600 ticks is 60 s of play on a laptop and about four minutes in software rendering,
 * where the simulation runs at about 16 ticks/s (five catch-up ticks a frame). perf-budget.json sets each
 * environment's default (`ticks`, and `presetTicks` where Medium and High run far slower in software). `--preset all`
 * runs Low, Medium and High in turn (audit REN-15). Writes pipeline/out/perf-<env>-<preset>.json, and
 * perf-<env>.json for the budget preset (what the gate reads); --baseline also writes pipeline/baseline/<env>.json
 * for the budget preset and <env>-<preset>.json for the others (commit those). Frame times mean something only on
 * hardware rendering (the owner's laptop); in a container they are noise and the gate ignores them (perf-budget.json
 * frameTimeGatedEnvs). Draw calls, triangles, memory and heap are real everywhere.
 *
 * `--map woodland` (M33i) plays Woodland instead (dev content: Dev settings > Dev content on, then the map) with the same
 * script, and names its files perf-<env>-woodland-<preset>.json (baseline <env>-woodland[-<preset>].json); the gate
 * still reads Depot's run only.
 *
 * `--env laptop` measures the real GPU: no SwiftShader flags, a visible window (vsync, as a player sees it; --headless
 * to hide it) and the installed Chrome (`--channel chrome`, the default there; or `--chromium /path`).
 */
import { execFileSync, spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'pipeline', 'out');
const PORT = 4181;

const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const value = (name, fallback) => (args.includes(name) ? args[args.indexOf(name) + 1] : fallback);
const budget = JSON.parse(readFileSync(join(ROOT, 'pipeline', 'perf-budget.json'), 'utf8'));
const PRESETS = ['low', 'medium', 'high'];
const options = {
  env: value('--env', 'container'),
  preset: value('--preset', budget.budgetPreset),
  warmupTicks: Number(value('--warmup-ticks', '120')),
  maxSeconds: Number(value('--max-seconds', '300')),
  baseline: flag('--baseline'),
  build: !flag('--no-build'),
  chromium: value('--chromium', process.env.PLAYWRIGHT_CHROMIUM),
  map: value('--map', 'depot'),
};
const MAPS = { depot: /Depot/i, woodland: /Woodland/i };
if (!(options.map in MAPS)) throw new Error(`--map must be one of ${Object.keys(MAPS).join(', ')}`);
/** Depot's files keep their names (what the gate and the baselines read); another map's carry its name. */
const mapTag = options.map === 'depot' ? '' : `-${options.map}`;
options.cpu = Number(value('--cpu', budget.cpuThrottle?.[options.env] ?? 1));
const presets = options.preset === 'all' ? PRESETS : [options.preset];
if (!presets.every((p) => PRESETS.includes(p))) throw new Error(`--preset must be one of ${PRESETS.join(', ')} or all`);
/** The measured window for a preset: --ticks, else the budget's per-preset line for this env, else the env's. */
const ticksFor = (preset) => Number(value('--ticks', budget.presetTicks?.[options.env]?.[preset] ?? budget.ticks?.[options.env] ?? 3600));
const laptop = options.env === 'laptop';
/** Software rendering in the container and on CI; the real GPU on the laptop (REN-15). */
// `--expose-gc` gives the page `gc()`, so heap growth is measured between two full collections, not between whatever
// garbage happened to be waiting at the first and last sample (that swung ±10 MB between runs of one head).
const heapArgs = ['--enable-precise-memory-info', '--js-flags=--expose-gc'];
const browserArgs = laptop ? heapArgs : ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', ...heapArgs];
const channel = options.chromium ? undefined : value('--channel', laptop ? 'chrome' : undefined);

mkdirSync(OUT, { recursive: true });
const head = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: ROOT, encoding: 'utf8' }).trim();

// The e2e bundle, rebuilt only when the source changed since the last one (pipeline/build-cached.mjs; audit CORE-22):
// after the gate's smoke test it is already there. --no-build uses whatever dist-e2e/ holds.
if (options.build || !existsSync(join(ROOT, 'dist-e2e', 'index.html'))) {
  console.log('perf: the e2e bundle');
  execFileSync('node', ['pipeline/build-cached.mjs', '--mode', 'e2e'], { cwd: ROOT, stdio: 'ignore' });
}
const urlFor = (preset) => `http://localhost:${PORT}/?nolock&seed=1&script=perf&quality=${preset}`;
// A server already on the port (another run's, left over) would be measured instead of this build: refuse.
if (await fetch(urlFor(presets[0])).then(() => true, () => false)) {
  console.error(`perf: port ${PORT} is already serving something (a leftover perf server?); stop it and run again`);
  process.exit(1);
}
// Vite itself, not through npx: killing an npx wrapper leaves its vite child serving the old build on the port.
const server = spawn(process.execPath, [join(ROOT, 'node_modules', 'vite', 'bin', 'vite.js'), 'preview', '--outDir', 'dist-e2e', '--port', String(PORT), '--strictPort'], { cwd: ROOT, stdio: 'ignore' });
for (let i = 0; i < 50; i++) {
  try {
    const r = await fetch(urlFor(presets[0]));
    if (r.ok) break;
  } catch {}
  await new Promise((r) => setTimeout(r, 200));
}

const { chromium } = await import(pathToFileURL(join(ROOT, 'node_modules', '@playwright', 'test', 'index.mjs')).href);
const browser = await chromium.launch({
  ...(options.chromium ? { executablePath: options.chromium } : {}),
  ...(channel ? { channel } : {}),
  headless: !laptop || flag('--headless'),
  args: browserArgs,
});
const results = [];
try {
  for (const preset of presets) results.push(await measure(preset));
} finally {
  await browser.close();
  server.kill();
}

/** One preset's run: a fresh page, the match started, `ticksFor(preset)` ticks measured. */
async function measure(preset) {
  const ticks = ticksFor(preset);
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
  const errors = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`console: ${m.text()}`); });
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: options.cpu });
  await page.goto(urlFor(preset));
  await page.waitForSelector('.menu-title-start', { timeout: 60_000 });
  await page.getByRole('button', { name: 'Start' }).click();
  const setup = page.locator('.menu-setup');
  if (options.map !== 'depot') {
    // Dev content (Woodland is dev-tagged), then the map.
    await setup.getByRole('button', { name: /Settings/i }).click();
    const settings = page.locator('.menu-settings');
    await settings.getByRole('checkbox', { name: 'Dev settings' }).check();
    await settings.getByRole('group', { name: 'Dev content' }).getByRole('button', { name: 'On' }).click();
    await page.keyboard.press('Escape');
    await setup.getByRole('button', { name: /Map/i }).click();
    await page.getByRole('dialog', { name: 'Map' }).getByRole('button', { name: MAPS[options.map] }).click();
  }
  await setup.getByRole('button', { name: 'Play', exact: true }).click();
  await page.waitForFunction((t) => globalThis.airsoft?.state && globalThis.airsoft.state.tick >= t, options.warmupTicks, { timeout: 120_000 });
  console.log(`perf: match running (map ${options.map}, env ${options.env}, preset ${preset}, cpu ×${options.cpu}); measuring ${ticks} ticks from tick ${options.warmupTicks}`);

  const sample = await page.evaluate(async ({ ticks, maxSeconds }) => {
    const g = globalThis.airsoft;
    const info = g.renderer.renderer.info;
    const frames = [];
    const heap = [];
    let calls = 0, callsMax = 0, tris = 0, trisMax = 0;
    const tick0 = g.state.tick;
    const heapNow = () => performance.memory?.usedJSHeapSize ?? 0;
    // The live heap: what is left after full collections (twice, so objects freed by the first one's finalizers go too).
    const heapGc = typeof globalThis.gc === 'function';
    const liveHeap = () => {
      if (heapGc) for (let i = 0; i < 2; i++) globalThis.gc();
      return heapNow();
    };
    const heapStart = liveHeap();
    heap.push(heapStart);
    await new Promise((done) => {
      const t0 = performance.now();
      let last = t0;
      let nextHeap = t0 + 1000;
      const f = (now) => {
        frames.push(now - last);
        last = now;
        calls += info.render.calls; callsMax = Math.max(callsMax, info.render.calls);
        tris += info.render.triangles; trisMax = Math.max(trisMax, info.render.triangles);
        if (now >= nextHeap) { heap.push(heapNow()); nextHeap += 1000; }
        if (g.state.tick - tick0 < ticks && now - t0 < maxSeconds * 1000) requestAnimationFrame(f); else done();
      };
      requestAnimationFrame(f);
    });
    const heapEnd = liveHeap();
    const secs = frames.reduce((s, v) => s + v, 0) / 1000;
    // GPU memory, estimated: every geometry attribute's bytes and every texture at 4 bytes a texel (mip chain +33 %).
    let geometryBytes = 0, textureBytes = 0;
    const seenGeo = new Set(), seenTex = new Set();
    const countTexture = (t) => {
      if (!t || seenTex.has(t.uuid)) return;
      seenTex.add(t.uuid);
      const w = t.image?.width ?? t.source?.data?.width ?? 0, h = t.image?.height ?? t.source?.data?.height ?? 0;
      textureBytes += w * h * 4 * (t.generateMipmaps ? 4 / 3 : 1);
    };
    g.renderer.scene.traverse((o) => {
      const geo = o.geometry;
      if (geo && !seenGeo.has(geo.uuid)) {
        seenGeo.add(geo.uuid);
        for (const a of Object.values(geo.attributes)) geometryBytes += a.array.byteLength;
        if (geo.index) geometryBytes += geo.index.array.byteLength;
      }
      for (const m of [].concat(o.material ?? [])) for (const v of Object.values(m)) if (v && v.isTexture) countTexture(v);
    });
    const sorted = [...frames].sort((a, b) => a - b);
    const q = (p) => sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))];
    const n = frames.length;
    const worstPct = sorted.slice(Math.floor(n * 0.99));
    const onePercentLowMs = worstPct.reduce((s, v) => s + v, 0) / Math.max(1, worstPct.length);
    let gcSpikes = 0;
    for (let i = 1; i < heap.length; i++) if (heap[i] < heap[i - 1] * 0.8) gcSpikes++;
    return {
      frames: n,
      fps: n / secs,
      onePercentLowFps: 1000 / onePercentLowMs,
      p50Ms: q(0.5), p95Ms: q(0.95), p99Ms: q(0.99), worstMs: sorted.at(-1),
      drawCalls: calls / n, drawCallsMax: callsMax, triangles: tris / n, trianglesMax: trisMax,
      geometries: info.memory.geometries, textures: info.memory.textures, programs: info.programs?.length ?? 0,
      gpuMemoryMB: (geometryBytes + textureBytes) / 1e6,
      // Start and end are the live heap (after a full GC); the max and the GC drops are the samples taken during play.
      heapStartMB: heapStart / 1e6, heapEndMB: heapEnd / 1e6, heapGrowthMB: (heapEnd - heapStart) / 1e6, heapMaxMB: Math.max(...heap) / 1e6, heapGc,
      gcSpikes,
      seconds: secs, ticks: g.state.tick - tick0, simTicksPerSecond: (g.state.tick - tick0) / secs,
      pixelRatio: g.renderer.renderer.getPixelRatio(), characters: g.session.characterCount,
    };
  }, { ticks, maxSeconds: options.maxSeconds });
  await page.close();
  return { env: options.env, map: options.map, preset, cpu: options.cpu, ticksWanted: ticks, warmupTicks: options.warmupTicks, head, when: new Date().toISOString(), seed: 1, viewport: '1920x1080@1', metrics: sample, errors };
}

/** The baseline file for a preset: `<env>.json` for the budget preset (what the gate compares), `<env>-<preset>.json` otherwise. */
const baselineName = (preset) => (preset === budget.budgetPreset ? `${options.env}${mapTag}.json` : `${options.env}${mapTag}-${preset}.json`);
const round = (v) => (typeof v === 'number' ? Math.round(v * 100) / 100 : v);
for (const result of results) {
  for (const k of Object.keys(result.metrics)) result.metrics[k] = round(result.metrics[k]);
  const json = `${JSON.stringify(result, null, 2)}\n`;
  const out = join(OUT, `perf-${options.env}${mapTag}-${result.preset}.json`);
  writeFileSync(out, json);
  // The gate reads the budget preset's run (and a single-preset run, as before), on Depot.
  if (!mapTag && (result.preset === budget.budgetPreset || presets.length === 1)) writeFileSync(join(OUT, `perf-${options.env}.json`), json);
  console.log(`perf: ${relative(ROOT, out)}`);
  const m = result.metrics;
  console.log(`  ${result.preset}: ${m.ticks} ticks in ${m.seconds} s · fps ${m.fps} (1 % low ${m.onePercentLowFps}) · p50 ${m.p50Ms} ms · p95 ${m.p95Ms} ms · p99 ${m.p99Ms} ms · sim ${m.simTicksPerSecond} ticks/s`);
  console.log(`  draw calls ${m.drawCalls} (max ${m.drawCallsMax}) · triangles ${m.triangles} (max ${m.trianglesMax}) · GPU memory ~${m.gpuMemoryMB} MB · heap ${m.heapStartMB} → ${m.heapEndMB} MB (${m.heapGrowthMB >= 0 ? "+" : ""}${m.heapGrowthMB}${m.heapGc ? ', live after GC' : ', NO forced GC: noisy'}), ${m.gcSpikes} GC drops`);
  if (result.errors.length) console.log(`  page errors: ${result.errors.length} (${result.errors[0]})`);
  if (options.baseline) {
    const dir = join(ROOT, 'pipeline', 'baseline');
    mkdirSync(dir, { recursive: true });
    const file = join(dir, baselineName(result.preset));
    writeFileSync(file, json);
    console.log(`perf: baseline written to ${relative(ROOT, file)} (commit it)`);
  }
}
process.exit(results.some((r) => r.errors.length) ? 1 : 0);
