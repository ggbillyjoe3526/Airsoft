#!/usr/bin/env node
/**
 * The perf harness (pipeline/README.md): plays a fixed Depot match in the e2e build with the scripted player
 * (`?script=perf`, config/perfScript.ts) and seed 1, at a fixed resolution and pixel ratio, with the CPU throttled
 * over CDP, and records frame times, draw calls, triangles, GPU memory and heap growth for 60 s.
 *
 *   node pipeline/perf-run.mjs [--env container|laptop|ci] [--preset low|medium|high] [--cpu N] [--ticks 3600]
 *                              [--warmup-ticks 120] [--max-seconds 300] [--baseline] [--no-build] [--chromium /path]
 *
 * The window is counted in simulation ticks, not wall time, so the player is at the same point of the script
 * whatever the frame rate: 3600 ticks is 60 s of play on a laptop and about four minutes in software rendering,
 * where the simulation runs at about 16 ticks/s (five catch-up ticks a frame). perf-budget.json sets each
 * environment's default (`ticks`). Writes pipeline/out/perf-<env>.json; --baseline also writes
 * pipeline/baseline/<env>.json (commit that one). Frame times mean something only on hardware rendering (the
 * owner's laptop); in a container they are noise and the gate ignores them (perf-budget.json
 * frameTimeGatedEnvs). Draw calls, triangles, memory and heap are real everywhere.
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
const options = {
  env: value('--env', 'container'),
  preset: value('--preset', budget.budgetPreset),
  warmupTicks: Number(value('--warmup-ticks', '120')),
  maxSeconds: Number(value('--max-seconds', '300')),
  baseline: flag('--baseline'),
  build: !flag('--no-build'),
  chromium: value('--chromium', process.env.PLAYWRIGHT_CHROMIUM),
};
options.cpu = Number(value('--cpu', budget.cpuThrottle?.[options.env] ?? 1));
options.ticks = Number(value('--ticks', budget.ticks?.[options.env] ?? 3600));

mkdirSync(OUT, { recursive: true });
const head = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: ROOT, encoding: 'utf8' }).trim();

if (options.build || !existsSync(join(ROOT, 'dist-e2e', 'index.html'))) {
  console.log('perf: building the e2e bundle');
  execFileSync('npm', ['run', 'build:e2e'], { cwd: ROOT, stdio: 'ignore', shell: process.platform === 'win32' });
}
const server = spawn('npx', ['vite', 'preview', '--outDir', 'dist-e2e', '--port', String(PORT), '--strictPort'], { cwd: ROOT, stdio: 'ignore', shell: process.platform === 'win32' });
const url = `http://localhost:${PORT}/?nolock&seed=1&script=perf&quality=${options.preset}`;
for (let i = 0; i < 50; i++) {
  try {
    const r = await fetch(url);
    if (r.ok) break;
  } catch {}
  await new Promise((r) => setTimeout(r, 200));
}

const { chromium } = await import(pathToFileURL(join(ROOT, 'node_modules', '@playwright', 'test', 'index.mjs')).href);
const browser = await chromium.launch({
  ...(options.chromium ? { executablePath: options.chromium } : {}),
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-precise-memory-info'],
});
let result;
try {
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
  const errors = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`console: ${m.text()}`); });
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: options.cpu });
  await page.goto(url);
  await page.waitForSelector('.menu-title-start', { timeout: 60_000 });
  await page.getByRole('button', { name: 'Start' }).click();
  await page.locator('.menu-setup').getByRole('button', { name: 'Play', exact: true }).click();
  await page.waitForFunction((t) => globalThis.airsoft?.state && globalThis.airsoft.state.tick >= t, options.warmupTicks, { timeout: 120_000 });
  console.log(`perf: match running (env ${options.env}, preset ${options.preset}, cpu ×${options.cpu}); measuring ${options.ticks} ticks from tick ${options.warmupTicks}`);

  const sample = await page.evaluate(async ({ ticks, maxSeconds }) => {
    const g = globalThis.airsoft;
    const info = g.renderer.renderer.info;
    const frames = [];
    const heap = [];
    let calls = 0, callsMax = 0, tris = 0, trisMax = 0;
    const tick0 = g.state.tick;
    const heapNow = () => performance.memory?.usedJSHeapSize ?? 0;
    heap.push(heapNow());
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
      heapStartMB: heap[0] / 1e6, heapEndMB: heap.at(-1) / 1e6, heapGrowthMB: (heap.at(-1) - heap[0]) / 1e6, heapMaxMB: Math.max(...heap) / 1e6,
      gcSpikes,
      seconds: secs, ticks: g.state.tick - tick0, simTicksPerSecond: (g.state.tick - tick0) / secs,
      pixelRatio: g.renderer.renderer.getPixelRatio(), characters: g.session.characterCount,
    };
  }, { ticks: options.ticks, maxSeconds: options.maxSeconds });
  result = { env: options.env, preset: options.preset, cpu: options.cpu, ticksWanted: options.ticks, warmupTicks: options.warmupTicks, head, when: new Date().toISOString(), seed: 1, viewport: '1920x1080@1', metrics: sample, errors };
} finally {
  await browser.close();
  server.kill();
}

const round = (v) => (typeof v === 'number' ? Math.round(v * 100) / 100 : v);
for (const k of Object.keys(result.metrics)) result.metrics[k] = round(result.metrics[k]);
const out = join(OUT, `perf-${options.env}.json`);
writeFileSync(out, `${JSON.stringify(result, null, 2)}\n`);
console.log(`perf: ${relative(ROOT, out)}`);
const m = result.metrics;
console.log(`  ${m.ticks} ticks in ${m.seconds} s · fps ${m.fps} (1 % low ${m.onePercentLowFps}) · p50 ${m.p50Ms} ms · p95 ${m.p95Ms} ms · p99 ${m.p99Ms} ms · sim ${m.simTicksPerSecond} ticks/s`);
console.log(`  draw calls ${m.drawCalls} (max ${m.drawCallsMax}) · triangles ${m.triangles} (max ${m.trianglesMax}) · GPU memory ~${m.gpuMemoryMB} MB · heap ${m.heapStartMB} → ${m.heapEndMB} MB (+${m.heapGrowthMB}), ${m.gcSpikes} GC drops`);
if (result.errors.length) console.log(`  page errors: ${result.errors.length} (${result.errors[0]})`);
if (options.baseline) {
  const dir = join(ROOT, 'pipeline', 'baseline');
  mkdirSync(dir, { recursive: true });
  const file = join(dir, `${options.env}.json`);
  writeFileSync(file, `${JSON.stringify(result, null, 2)}\n`);
  console.log(`perf: baseline written to ${relative(ROOT, file)} (commit it)`);
}
process.exit(result.errors.length ? 1 : 0);
