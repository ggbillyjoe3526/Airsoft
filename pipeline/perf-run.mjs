#!/usr/bin/env node
/**
 * The perf harness (pipeline/README.md): plays a fixed Depot match in the e2e build with the scripted player
 * (`?script=perf`, config/perfScript.ts) and seed 1, at a fixed resolution and pixel ratio, with the CPU throttled
 * over CDP, and records frame times, draw calls, triangles, GPU memory and heap growth for 60 s.
 *
 *   node pipeline/perf-run.mjs [--env container|laptop|desktop|ci] [--preset low|medium|high|ultra|all] [--cpu N]
 *                              [--ticks 3600] [--warmup-ticks 120] [--max-seconds 300] [--baseline] [--no-build]
 *                              [--chromium /path] [--channel chrome|msedge] [--headless] [--map <map>] [--mode <mode>]
 *                              [--viewport 1920x1080] [--port 4181] [--backend webgl|webgpu] [--vsync]
 *
 * The e2e bundle is reused when the source hasn't changed since it was built (pipeline/build-cached.mjs).
 *
 * The window is counted in simulation ticks, not wall time, so the player is at the same point of the script
 * whatever the frame rate: 3600 ticks is 60 s of play on a laptop and about four minutes in software rendering,
 * where the simulation runs at about 16 ticks/s (five catch-up ticks a frame). perf-budget.json sets each
 * environment's default (`ticks`, and `presetTicks` where Medium, High and Ultra run far slower in software). `--preset all`
 * runs Low, Medium, High and Ultra in turn (audit REN-15; Ultra since G5). Writes pipeline/out/perf-<env>-<preset>.json, and
 * perf-<env>.json for the budget preset (what the gate reads); --baseline also writes pipeline/baseline/<env>.json
 * for the budget preset and <env>-<preset>.json for the others (commit those). Frame times mean something only on
 * hardware rendering (the owner's laptop); in a container they are noise and the gate ignores them (perf-budget.json
 * frameTimeGatedEnvs). Draw calls, triangles, memory and heap are real everywhere.
 *
 * `--map <map>` plays any map the game has, by its id in map/maps.ts or the short name perf-budget.json's `mapIds` gives
 * it (`neon` for neonHeights), with the same script and Dev content on (the dev maps need it); its files are named by
 * the short name: perf-<env>-woodland-<preset>.json (baseline <env>-woodland[-<preset>].json). `--mode <mode>` plays any
 * of the game's modes (config/modes.ts MATCH_MODES), saved as the player's picks before the page loads (CT2: the maps
 * and modes are the game's own lists, so a new one needs no change here); a map or mode the game doesn't offer stops
 * the run. `--mode extraction` (M48) plays an Extraction run: a trio against the map's home team, the cases and exits
 * drawn, with its own opening; its files carry `-extraction` after the map's name. On Woodland it is the heaviest scene
 * the game has (ten characters at night, plan section 7).
 *
 * The gate (M76, audit CORE-03) runs one map, mode and preset at a time from perf-budget.json's `matrix` and reads
 * perf-<env><tag>-<preset>.json (pipeline/perfMatrix.mjs names the files); perf-<env>.json stays Depot Elimination's
 * budget-preset run for the performance agent.
 *
 * `--env laptop` measures the real GPU: no SwiftShader flags, a visible window (vsync, as a player sees it; --headless
 * to hide it) and the installed Chrome (`--channel chrome`, the default there; or `--chromium /path`).
 *
 * `--env desktop` (G5) is the same on the owner's desktop PC, without CPU throttling: where the Ultra budget is measured.
 * Its frames run past the screen's refresh (perfDesktop.mjs UNCAPPED_ARGS; `--vsync` keeps the cap), so a 240 Hz
 * screen doesn't hold them at the target's own period; perf-desktop.mjs runs its whole suite. Every result records
 * `vsync` and the `gpu` the browser drew with.
 * `--viewport WxH` sets the page's size (default 1920x1080 at pixel ratio 1; 3840x2160 for 4K); the result records it.
 *
 * `--backend webgl|webgpu` (WebGPU overhaul W6; default `webgl`) picks the node renderer's back end: `webgl` is its
 * WebGL2 back end (Renderer pick saved as WebGL, `?forceWebGL`, the only way it runs in the container), `webgpu` is a
 * WebGPU device (pick saved as WebGPU; in the container and on CI Chromium gets WEBGPU_ARGS, SwiftShader's Vulkan).
 * After the match starts the page's `airsoft.renderer.backend` must be the asked one, or the run fails loudly. Every
 * result records `backend`; a WebGPU run names its files with it after the environment (perf-laptop-webgpu-low.json,
 * baseline laptop-webgpu.json), so the WebGL files and baselines are never overwritten. Draw calls are the node
 * renderer's `drawCalls` (Renderer.stats).
 *
 * Every run records `figureMs`, the figures' drawing work per frame (CharacterRenderer.update, milliseconds of CPU):
 * since BD1 the rigged Blender figures, which every match draws.
 */
import { execFileSync, spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { baselineFileName, perfTag, runFileName } from './perfMatrix.mjs';
import { UNCAPPED_ARGS } from './perfDesktop.mjs';
import { WEBGPU_ARGS } from './webgpuCompare.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'pipeline', 'out');

const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const value = (name, fallback) => (args.includes(name) ? args[args.indexOf(name) + 1] : fallback);
const budget = JSON.parse(readFileSync(join(ROOT, 'pipeline', 'perf-budget.json'), 'utf8'));
const PRESETS = ['low', 'medium', 'high', 'ultra'];
const options = {
  env: value('--env', 'container'),
  preset: value('--preset', budget.budgetPreset),
  warmupTicks: Number(value('--warmup-ticks', '120')),
  maxSeconds: Number(value('--max-seconds', '300')),
  baseline: flag('--baseline'),
  build: !flag('--no-build'),
  chromium: value('--chromium', process.env.PLAYWRIGHT_CHROMIUM),
  map: value('--map', 'depot'),
  mode: value('--mode', 'elimination'),
  viewport: value('--viewport', '1920x1080'),
  backend: value('--backend', 'webgl'),
};
if (!['webgl', 'webgpu'].includes(options.backend)) throw new Error('--backend must be webgl or webgpu');
/** The Renderer pick saved before the page loads: the asked back end (the two ids are the setting's values too). */
const rendererSettings = { version: 1, renderer: options.backend };
const [viewWidth, viewHeight] = options.viewport.split('x').map(Number);
if (!(viewWidth > 0 && viewHeight > 0)) throw new Error('--viewport must be WIDTHxHEIGHT, e.g. 3840x2160');
/** No tick for this long ends the window: the match is over (a frame-rate dip still advances a tick every frame). */
const STALL_MS = 1000;
/** The preview server's port: --port for a second run beside another worktree's (the default 4181 is refused when busy). */
const PORT = Number(value('--port', '4181'));
// The game's modes (config/modes.ts has only type imports, so Node reads it as it is); its maps are checked in the page.
const { MATCH_MODES } = await import(pathToFileURL(join(ROOT, 'src', 'config', 'modes.ts')).href);
const MODES = MATCH_MODES.map((m) => m.id);
if (!MODES.includes(options.mode)) throw new Error(`--mode must be one of ${MODES.join(', ')}`);
// A map by its short name (the files' and the matrix's) or its id in the game: options.map is the short name.
const mapIds = budget.mapIds ?? {};
options.map = Object.entries(mapIds).find(([, id]) => id === options.map)?.[0] ?? options.map;
const gameMap = mapIds[options.map] ?? options.map;
/** Depot's files keep their names (what the gate and the baselines read); another map's carry its name. */
const mapTag = perfTag(options.map, options.mode);
options.cpu = Number(value('--cpu', budget.cpuThrottle?.[options.env] ?? 1));
const presets = options.preset === 'all' ? PRESETS : [options.preset];
if (!presets.every((p) => PRESETS.includes(p))) throw new Error(`--preset must be one of ${PRESETS.join(', ')} or all`);
/** The measured window for a preset: --ticks, else the budget's per-preset line for this env, else the env's. */
const ticksFor = (preset) => Number(value('--ticks', budget.presetTicks?.[options.env]?.[preset] ?? budget.ticks?.[options.env] ?? 3600));
/** A real GPU (the owner's laptop, or his desktop PC since G5): no SwiftShader, a visible window, the installed Chrome. */
const laptop = options.env === 'laptop' || options.env === 'desktop';
/** Software rendering in the container and on CI; the real GPU on the laptop and the desktop (REN-15). */
// `--expose-gc` gives the page `gc()`, so heap growth is measured between two full collections, not between whatever
// garbage happened to be waiting at the first and last sample (that swung ±10 MB between runs of one head).
const heapArgs = ['--enable-precise-memory-info', '--js-flags=--expose-gc'];
// WebGPU in the container and on CI needs the software adapter's switches (the laptop and the desktop have a real GPU).
/** The desktop's frames past the screen's refresh (PF3: the 240 Hz target is the cap's own period). */
const vsync = options.env !== 'desktop' || flag('--vsync');
const browserArgs = laptop ? [...heapArgs, ...(vsync ? [] : UNCAPPED_ARGS)] : ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', ...(options.backend === 'webgpu' ? WEBGPU_ARGS : []), ...heapArgs];
const channel = options.chromium ? undefined : value('--channel', laptop ? 'chrome' : undefined);

mkdirSync(OUT, { recursive: true });
/** The commit measured; `unknown` in a download without git (the owner's ZIP of main). */
const head = (() => {
  try {
    return execFileSync('git', ['rev-parse', 'HEAD'], { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    return 'unknown';
  }
})();

// The e2e bundle, rebuilt only when the source changed since the last one (pipeline/build-cached.mjs; audit CORE-22):
// after the gate's smoke test it is already there. --no-build uses whatever dist-e2e/ holds.
if (options.build || !existsSync(join(ROOT, 'dist-e2e', 'index.html'))) {
  console.log('perf: the e2e bundle');
  // Quiet when it works; the build's own output when it fails (a failure said only "Command failed" on the owner's PC).
  try {
    execFileSync(process.execPath, ['pipeline/build-cached.mjs', '--mode', 'e2e'], { cwd: ROOT, stdio: 'pipe' });
  } catch (e) {
    process.stdout.write(e.stdout ?? '');
    process.stderr.write(e.stderr ?? '');
    console.error('perf: the e2e build failed (its output is above)');
    process.exit(1);
  }
}
const urlFor = (preset) => `http://localhost:${PORT}/?nolock&seed=1&script=perf&quality=${preset}${options.backend === 'webgl' ? '&forceWebGL' : ''}`;
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
// A browser that fails to start (no executable at the path) must not leave the preview server serving the port.
const browser = await chromium
  .launch({
    ...(options.chromium ? { executablePath: options.chromium } : {}),
    ...(channel ? { channel } : {}),
    headless: !laptop || flag('--headless'),
    args: browserArgs,
  })
  .catch((err) => {
    server.kill();
    throw err;
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
  const page = await browser.newPage({ viewport: { width: viewWidth, height: viewHeight }, deviceScaleFactor: 1 });
  const errors = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`console: ${m.text()}`); });
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: options.cpu });
  // A fresh context each preset, so its storage is empty: the Renderer pick and, off Depot Elimination, the map and mode
  // with Dev content on (the dev maps and modes need it) are the only settings saved.
  const picks = options.map !== 'depot' || options.mode !== 'elimination' ? { map: gameMap, mode: options.mode, 'dev.enabled': true, 'dev.devContent': 'on' } : {};
  await page.addInitScript((text) => localStorage.setItem('airsoft.settings', text), JSON.stringify({ ...rendererSettings, ...picks, version: 1 }));
  await page.goto(urlFor(preset));
  await page.waitForSelector('.menu-title-start', { timeout: 60_000 });
  // The title's START opens the Match screen (G3, M100): the map and the mode are cards on it, Settings is on the top bar.
  await page.locator('.menu-title-start').click();
  const setup = page.locator('.menu-setup');
  // The saved picks are what the Match screen starts: a dev map's data arrives a moment after the title shows. A map or
  // mode the game doesn't have (or doesn't offer on that map) never becomes the pick.
  const offered = await page
    .waitForFunction(({ map, mode }) => { const p = globalThis.airsoft?.setup?.playedPicks?.(); return p?.map === map && p?.mode === mode; }, { map: gameMap, mode: options.mode }, { timeout: 60_000 })
    .then(() => true, () => false);
  if (!offered) {
    await page.close();
    throw new Error(`the game does not offer map "${gameMap}" in ${options.mode} (map/maps.ts MAPS, map/playableMode.ts)`);
  }
  // The click waits for the menu's page to answer: on a software WebGL2 adapter the menu's item pictures and the
  // match's warm-up compile hold it for 20 s and more (W6a), past Playwright's 30 s default on a slow run.
  await setup.getByRole('button', { name: 'Start match', exact: true }).click({ timeout: 120_000 });
  await page.waitForFunction(() => globalThis.airsoft?.state && globalThis.airsoft.state.tick >= 1, null, { timeout: 120_000 });
  const backend = await page.evaluate(() => globalThis.airsoft.renderer.backend);
  console.log(`perf: match running (map ${options.map}, mode ${options.mode}, env ${options.env}, preset ${preset}, cpu ×${options.cpu}, drawn with ${backend}); measuring ${ticks} ticks from tick ${options.warmupTicks}`);
  if (backend !== options.backend) {
    console.error(`perf: asked for the ${options.backend} back end but ${backend} drew; no file written (WebGPU needs an adapter: WEBGPU_ARGS in the container, a real GPU elsewhere)`);
    await browser.close();
    server.kill();
    process.exit(1);
  }

  const sample = await page.evaluate(async ({ ticks, warmupTicks, maxSeconds, stallMs }) => {
    const g = globalThis.airsoft;
    // The renderer's draw counts, read the same on WebGL and the node renderer (one object, refilled each read).
    const stats = () => g.renderer.stats;
    const frames = [];
    const heap = [];
    let calls = 0, callsMax = 0, tris = 0, trisMax = 0, dressing = 0, dressingMax = 0;
    // The window opens on the first frame at or past the warm-up tick (PF4): waiting for that tick from outside the page
    // overshot it by up to three of software rendering's ten-tick frames, so each run measured a window shifted by a
    // different amount, and a window starting later loses the opening's heaviest view (a few thousand triangles on
    // the mean).
    let tick0 = -1;
    // The figures' drawing work each frame (BF1): CharacterRenderer.update timed in place.
    const figures = g.session?.match?.characters;
    let figureMs = 0;
    if (figures) {
      const update = figures.update.bind(figures);
      figures.update = (...a) => {
        const t = performance.now();
        update(...a);
        if (tick0 >= 0) figureMs += performance.now() - t;
      };
    }
    const heapNow = () => performance.memory?.usedJSHeapSize ?? 0;
    // The live heap: what is left after full collections (twice, so objects freed by the first one's finalizers go too).
    const heapGc = typeof globalThis.gc === 'function';
    const liveHeap = () => {
      if (heapGc) for (let i = 0; i < 2; i++) globalThis.gc();
      return heapNow();
    };
    let heapStart = 0;
    // A match that ends inside the window (Neon Heights Extraction on the desktop's 3600 ticks) stops the simulation:
    // its frames from the last tick on are the results screen's, so the window ends at that tick (`matchEnded`).
    let matchEnded = false;
    await new Promise((done, fail) => {
      let t0 = -1, last = 0, nextHeap = 0;
      let tickSeen = -1, advancedAt = 0;
      // One object, written in place on each tick, so the window makes no garbage of its own.
      const kept = { n: 0, calls: 0, callsMax: 0, tris: 0, trisMax: 0, dressing: 0, dressingMax: 0 };
      // As long as the old wait for the warm-up allowed (a timer: a page that stops drawing stops its frames too).
      const guard = setTimeout(() => fail(new Error(`the match never reached its warm-up tick ${warmupTicks}`)), 120_000);
      const f = (now) => {
        if (tick0 < 0) {
          if (g.state.tick >= warmupTicks) {
            clearTimeout(guard);
            tick0 = g.state.tick;
            heapStart = liveHeap();
            heap.push(heapStart);
          }
          requestAnimationFrame(f);
          return;
        }
        // The frame after the collections starts the clock, so no frame measured carries their time.
        if (t0 < 0) {
          t0 = last = now;
          nextHeap = t0 + 1000;
          tickSeen = g.state.tick;
          advancedAt = now;
          requestAnimationFrame(f);
          return;
        }
        frames.push(now - last);
        last = now;
        const s = stats();
        calls += s.calls; callsMax = Math.max(callsMax, s.calls);
        // W6a: the GPU dressing's triangles (Woodland's grass and stand-ins, counted at their caps) apart from the
        // scene's, each on its own budget line.
        const d = s.dressingTriangles ?? 0;
        tris += s.triangles - d; trisMax = Math.max(trisMax, s.triangles - d);
        dressing += d; dressingMax = Math.max(dressingMax, d);
        if (now >= nextHeap) { heap.push(heapNow()); nextHeap += 1000; }
        if (g.state.tick !== tickSeen) {
          tickSeen = g.state.tick;
          advancedAt = now;
          kept.n = frames.length; kept.calls = calls; kept.callsMax = callsMax; kept.tris = tris; kept.trisMax = trisMax;
          kept.dressing = dressing; kept.dressingMax = dressingMax;
        } else if (now - advancedAt >= stallMs) {
          ({ calls, callsMax, tris, trisMax, dressing, dressingMax } = kept);
          frames.length = kept.n;
          matchEnded = true;
          return done();
        }
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
    const end = stats();
    let gcSpikes = 0;
    for (let i = 1; i < heap.length; i++) if (heap[i] < heap[i - 1] * 0.8) gcSpikes++;
    return {
      frames: n,
      fps: n / secs,
      onePercentLowFps: 1000 / onePercentLowMs,
      p50Ms: q(0.5), p95Ms: q(0.95), p99Ms: q(0.99), worstMs: sorted.at(-1),
      drawCalls: calls / n, drawCallsMax: callsMax, triangles: tris / n, trianglesMax: trisMax,
      dressingTriangles: dressing / n, dressingTrianglesMax: dressingMax,
      geometries: end.geometries, textures: end.textures, programs: end.programs,
      gpuMemoryMB: (geometryBytes + textureBytes) / 1e6,
      // Start and end are the live heap (after a full GC); the max and the GC drops are the samples taken during play.
      heapStartMB: heapStart / 1e6, heapEndMB: heapEnd / 1e6, heapGrowthMB: (heapEnd - heapStart) / 1e6, heapMaxMB: Math.max(...heap) / 1e6, heapGc,
      gcSpikes,
      seconds: secs, ticks: g.state.tick - tick0, simTicksPerSecond: (g.state.tick - tick0) / secs,
      pixelRatio: g.renderer.renderer.getPixelRatio(), characters: g.session.characterCount,
      figureMs: figureMs / n,
      matchEnded,
    };
  }, { ticks, warmupTicks: options.warmupTicks, maxSeconds: options.maxSeconds, stallMs: STALL_MS });
  // The graphics card the browser drew with (an integrated GPU instead of the discrete one would show here), read after
  // the window from a context of its own, released at once.
  const gpu = await page.evaluate(() => {
    const gl = document.createElement('canvas').getContext('webgl2');
    if (!gl) return 'unknown';
    const info = gl.getExtension('WEBGL_debug_renderer_info');
    const name = String(gl.getParameter(info ? info.UNMASKED_RENDERER_WEBGL : gl.RENDERER));
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return name;
  });
  await page.close();
  if (!sample.frames) {
    // The match ended before the window drew a frame (`matchEnded` with nothing kept): no numbers to write.
    console.error(`perf: the match ended before the window measured a frame (map ${options.map}, mode ${options.mode}, preset ${preset}); no file written`);
    await browser.close();
    server.kill();
    process.exit(1);
  }
  return { env: options.env, backend, map: options.map, mode: options.mode, preset, cpu: options.cpu, vsync, gpu, ticksWanted: ticks, warmupTicks: options.warmupTicks, head, when: new Date().toISOString(), seed: 1, viewport: `${options.viewport}@1`, metrics: sample, errors };
}

/** A run's baseline file: `<env>.json` for the budget preset (what the gate compares), `<env>-<preset>.json` otherwise. */
const baselineName = (result) => baselineFileName(options.env, result, budget.budgetPreset);
const round = (v) => (typeof v === 'number' ? Math.round(v * 100) / 100 : v);
for (const result of results) {
  for (const k of Object.keys(result.metrics)) result.metrics[k] = round(result.metrics[k]);
  const json = `${JSON.stringify(result, null, 2)}\n`;
  const out = join(OUT, runFileName(options.env, result));
  writeFileSync(out, json);
  // Depot Elimination's budget-preset run (or a single-preset one) also as perf-<env>.json, what the performance agent reads.
  if (!mapTag && result.backend === 'webgl' && (result.preset === budget.budgetPreset || presets.length === 1)) writeFileSync(join(OUT, `perf-${options.env}.json`), json);
  console.log(`perf: ${relative(ROOT, out)}`);
  const m = result.metrics;
  console.log(`  ${result.preset} on ${result.backend}: ${m.ticks} ticks in ${m.seconds} s · fps ${m.fps} (1 % low ${m.onePercentLowFps}) · p50 ${m.p50Ms} ms · p95 ${m.p95Ms} ms · p99 ${m.p99Ms} ms · sim ${m.simTicksPerSecond} ticks/s · figures ${m.figureMs} ms a frame`);
  console.log(`  draw calls ${m.drawCalls} (max ${m.drawCallsMax}) · triangles ${m.triangles} (max ${m.trianglesMax}) + GPU dressing ${m.dressingTriangles} (max ${m.dressingTrianglesMax}) · GPU memory ~${m.gpuMemoryMB} MB · heap ${m.heapStartMB} → ${m.heapEndMB} MB (${m.heapGrowthMB >= 0 ? "+" : ""}${m.heapGrowthMB}${m.heapGc ? ', live after GC' : ', NO forced GC: noisy'}), ${m.gcSpikes} GC drops`);
  if (result.errors.length) console.log(`  page errors: ${result.errors.length} (${result.errors[0]})`);
  if (options.baseline) {
    const dir = join(ROOT, 'pipeline', 'baseline');
    mkdirSync(dir, { recursive: true });
    const file = join(dir, baselineName(result));
    writeFileSync(file, json);
    console.log(`perf: baseline written to ${relative(ROOT, file)} (commit it)`);
  }
}
process.exit(results.some((r) => r.errors.length) ? 1 : 0);
