#!/usr/bin/env node
/**
 * The WebGPU world-materials comparison (WebGPU overhaul W2): draws the same fixed camera views of every map, by day and
 * by night where the map has night, on Medium and High, once with the old WebGL path and once with the node renderer,
 * scores each pair against the bar in `webgpuCompare.mjs` and saves the pairs side by side (WebGL | node | difference)
 * for the owner. Exits 1 when a pair fails the bar.
 *
 *   node pipeline/webgpu-compare.mjs [--out <dir>] [--only depot,woodland] [--quality medium] [--noise] [--full] [--chromium /path]
 *
 * It builds the e2e bundle (pipeline/build-cached.mjs, the build with `window.airsoft` and `?forceWebGL`) and serves it
 * on port 4186. Each map, light and preset is one page per renderer: the picks saved as settings, a match started, the
 * simulation held still (Dev game speed 0) and the game's own frame loop stopped once the node renderer has compiled
 * what it draws, then for each view the camera stood where config/menuArt.ts STILL_CAMERA says (as the menus' stills),
 * the figures hidden with their contact shadows and torch beams (W3's) and one frame drawn without the held replica.
 * On the WebGL side the post stack's effects are left out (W4's: the node path has none yet) but not its output step,
 * which is where WebGL tone-maps a Medium or High frame; `--full` also scores the WebGL frame with the whole stack, for
 * information. `--noise` draws each view on WebGL twice (two pages) instead, the floor any bar must sit above.
 *
 * In a container without WebGPU the node renderer runs on its WebGL2 back end (`?forceWebGL`, W1), as the e2e test does:
 * the node materials, their shaders and their uniforms are the ones a WebGPU device draws; only the back end's own
 * code differs. PLAYWRIGHT_CHROMIUM picks the browser.
 */
import { execFileSync, spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { COMPARE_BAR, COMPARE_QUALITIES, COMPARE_SCENES, COMPARE_VIEWPORT, EXTRA_CAMERAS, pairFile, scorePixels, verdict } from './webgpuCompare.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PORT = 4186;
const args = process.argv.slice(2);
const value = (name, fallback) => (args.includes(name) ? args[args.indexOf(name) + 1] : fallback);
const OUT = value('--out', join(ROOT, 'pipeline', 'out', 'webgpu-compare'));
const only = value('--only', '').split(',').filter(Boolean);
const qualities = value('--quality', '') ? value('--quality', '').split(',') : COMPARE_QUALITIES;
const noise = args.includes('--noise');
const full = args.includes('--full');
const chromium = value('--chromium', process.env.PLAYWRIGHT_CHROMIUM);

const art = await import(pathToFileURL(join(ROOT, 'src', 'config', 'menuArt.ts')).href);
const { STILL_CAMERA } = art;

/** Refuses to start over a server already on the port (a leftover preview is never killed by pattern). */
async function portFree(port) {
  return new Promise((done) => {
    const probe = createServer().once('error', () => done(false)).once('listening', () => probe.close(() => done(true)));
    probe.listen(port, '127.0.0.1');
  });
}
if (!(await portFree(PORT))) {
  console.error(`webgpu-compare: port ${PORT} is busy; stop what serves it and run again`);
  process.exit(2);
}

execFileSync(process.execPath, [join(ROOT, 'pipeline', 'build-cached.mjs'), '--mode', 'e2e'], { cwd: ROOT, stdio: 'inherit' });
const server = spawn(process.execPath, [join(ROOT, 'node_modules', 'vite', 'bin', 'vite.js'), 'preview', '--outDir', 'dist-e2e', '--port', String(PORT), '--strictPort'], { cwd: ROOT, stdio: 'ignore' });
const base = `http://localhost:${PORT}/`;
for (let i = 0; i < 100 && !(await fetch(base).then((r) => r.ok, () => false)); i++) await new Promise((r) => setTimeout(r, 200));

const { chromium: browserType } = await import(pathToFileURL(join(ROOT, 'node_modules', '@playwright', 'test', 'index.mjs')).href);
const browser = await browserType.launch({
  ...(chromium ? { executablePath: chromium } : {}),
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
mkdirSync(OUT, { recursive: true });
const results = [];
let failed = false;
try {
  for (const scene of COMPARE_SCENES.filter((s) => only.length === 0 || only.includes(s.map))) {
    for (const quality of qualities) {
      const left = await draw(scene, quality, 'webgl', full);
      const right = await draw(scene, quality, noise ? 'webgl' : 'node', false);
      for (const view of scene.views) {
        const a = left.frames[view];
        const b = right.frames[view];
        const scored = await compare(a.plain, b.plain, `${scene.map} ${scene.light}, ${quality}, ${view}`);
        const v = verdict(scored.score);
        if (!v.pass) failed = true;
        const file = pairFile(scene, quality, view);
        writeFileSync(join(OUT, file), scored.jpeg);
        const entry = { map: scene.map, light: scene.light, quality, view, file, ...round(scored.score), pass: v.pass, fails: v.fails, draws: { webgl: a.calls, node: b.calls } };
        if (full && a.post) entry.withPost = round((await compare(a.post, b.plain, 'post')).score);
        results.push(entry);
        const tag = v.pass ? 'pass' : `FAIL (${v.fails.join('; ')})`;
        console.log(`webgpu-compare: ${file}  mad ${entry.mad}  over ${(entry.over * 100).toFixed(2)} %  draws ${a.calls}/${b.calls}  ${tag}${entry.withPost ? `  (with WebGL's post: mad ${entry.withPost.mad}, over ${(entry.withPost.over * 100).toFixed(2)} %)` : ''}`);
      }
    }
  }
} finally {
  await browser.close();
  server.kill();
}
writeFileSync(join(OUT, noise ? 'noise.json' : 'scores.json'), `${JSON.stringify({ bar: COMPARE_BAR, viewport: COMPARE_VIEWPORT, noise, results }, null, 2)}\n`);
console.log(`webgpu-compare: ${results.filter((r) => r.pass).length} of ${results.length} pairs pass (bar: mad ≤ ${COMPARE_BAR.mad}, ≤ ${COMPARE_BAR.over * 100} % of pixels over ${COMPARE_BAR.threshold}); pictures in ${OUT}`);
if (failed && !noise) process.exit(1);

function round(s) {
  return { mad: Number(s.mad.toFixed(3)), madRgb: s.madRgb.map((x) => Number(x.toFixed(3))), over: Number(s.over.toFixed(5)) };
}

/** One page: the map in its light on `quality`, drawn by `renderer`; each view's frame as a PNG data URL. */
async function draw(scene, quality, renderer, withPost) {
  const page = await browser.newPage({ viewport: COMPARE_VIEWPORT, deviceScaleFactor: 1 });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  const picks = { version: 1, map: scene.map, mode: 'elimination', [`lighting.${scene.map}`]: scene.light, 'dev.devContent': 'on', 'dev.enabled': true, ruleset: 'skirmish', renderer: renderer === 'node' ? 'webgpu' : 'webgl' };
  await page.addInitScript((saved) => localStorage.setItem('airsoft.settings', JSON.stringify(saved)), picks);
  await page.goto(`${base}?nolock&seed=1&quality=${quality}${renderer === 'node' ? '&forceWebGL' : ''}`);
  await page.waitForSelector('.menu-title-start', { timeout: 120_000 });
  const backend = await page.evaluate(() => globalThis.airsoft.renderer.backend);
  if ((renderer === 'node') !== (backend === 'webgpu-webgl2')) throw new Error(`webgpu-compare: asked for ${renderer}, drawn with ${backend}`);
  await page.locator('.menu-title-start').click();
  const setup = page.locator('.menu-setup');
  await setup.locator('.map-cards .choice-card.selected').waitFor({ timeout: 60_000 });
  await page.waitForFunction((map) => document.querySelector('.menu-setup .play-map-line')?.textContent?.toLowerCase().replace(/\s/g, '').startsWith(map.toLowerCase()), scene.map, { timeout: 60_000 });
  await setup.getByRole('button', { name: 'Start match', exact: true }).click();
  await page.waitForFunction(() => globalThis.airsoft?.state && globalThis.airsoft.state.tick > 5, null, { timeout: 180_000 });
  // The simulation held still: the figures stay at their starts and nobody fires; the effects keep drawing.
  await page.evaluate(() => {
    globalThis.airsoft.dev.gameSpeed = 0;
  });
  await page.waitForTimeout(2500);
  const frames = {};
  for (const view of scene.views) {
    frames[view] = await page.evaluate(
      async ({ camera, view, withPost }) => {
        const game = globalThis.airsoft;
        // The game's own frame loop stops: from here only this page's renders draw, from the stood camera.
        cancelAnimationFrame(game.rafId);
        const state = game.state;
        const r = game.renderer;
        game.session.match.characters.object.visible = false;
        // What rides on the figures goes with them (W3's too): the contact shadows under their feet and the torch beams
        // (the cones, the lit spots and your torch's real spot light), placed where each figure stood when the clock stopped.
        for (const name of ['contact-shadows', 'torch-beams']) r.scene.traverse((o) => {
          if (o.name === name) o.visible = false;
        });
        const eye = (game.__eye ??= { position: r.camera.position.clone(), rotation: r.camera.rotation.clone() });
        const centre = (team) => {
          const own = state.characters.filter((c) => c.team === team);
          const sum = own.reduce((a, c) => ({ x: a.x + c.spawnPosition.x, y: a.y + c.spawnPosition.y, z: a.z + c.spawnPosition.z }), { x: 0, y: 0, z: 0 });
          return { x: sum.x / own.length, y: sum.y / own.length, z: sum.z / own.length };
        };
        const blue = centre(0);
        const orange = centre(1);
        const target = view === 'overview' || view === 'aerial' ? { x: (blue.x + orange.x) / 2, y: (blue.y + orange.y) / 2, z: (blue.z + orange.z) / 2 } : orange;
        const dx = target.x - blue.x;
        const dz = target.z - blue.z;
        const len = Math.hypot(dx, dz) || 1;
        const from = view === 'aerial' ? target : blue;
        const cam = r.camera;
        cam.position.set(from.x - (dx / len) * camera.back, from.y + camera.up, from.z - (dz / len) * camera.back);
        cam.fov = camera.fov;
        cam.aspect = 16 / 9;
        cam.updateProjectionMatrix();
        cam.lookAt(target.x, target.y + camera.lookUp, target.z);
        if (view === 'street') {
          cam.position.copy(eye.position);
          cam.position.y += camera.up;
          cam.rotation.set(eye.rotation.x - 0.05, eye.rotation.y, 0, 'YXZ');
        }
        if (view === 'fire') {
          const fire = game.session.combat.field.lights.find((l) => l.kind === 'fire').position;
          const fx = fire.x - blue.x;
          const fz = fire.z - blue.z;
          const fl = Math.hypot(fx, fz) || 1;
          const foot = fire.y - 1;
          cam.position.set(fire.x - (fx / fl) * camera.back, foot + camera.up, fire.z - (fz / fl) * camera.back);
          cam.lookAt(fire.x, foot + camera.lookUp, fire.z);
        }
        if (view === 'sky') {
          const moon = r.scene.getObjectByName('night-moon').geometry.getAttribute('position');
          cam.position.set(blue.x, blue.y + camera.up, blue.z);
          cam.lookAt(blue.x + moon.getX(0), blue.y + camera.up + moon.getY(0) + camera.lookUp * Math.hypot(moon.getX(0), moon.getY(0), moon.getZ(0)), blue.z + moon.getZ(0));
        }
        cam.updateMatrixWorld();
        // The night's real lights take the pools nearest the stood camera, settled (as the game does each frame with the
        // eye), so both pages light the same pools whatever their own loop last followed.
        game.session.daylight.follow(cam, 10);
        const grab = () => r.renderer.domElement.toDataURL('image/png');
        // The post stack's effects (W4's) are left out of the plain frame, the node path has none yet, but not its output
        // step: on Medium and up WebGL draws the world into the stack's linear target and tone-maps it after (so the
        // haze is mixed before the tone mapping, as on the node path). A stack of the output step alone stands in.
        const ownStack = r.postStack;
        const own = ownStack.call(r);
        let plainStack = null;
        if (own) {
          const q = { ...r.quality, ambientOcclusion: 0, reflections: false, lightShafts: false, temporalAA: false, bloom: true, lensFinish: false };
          const pr = r.renderer.getPixelRatio();
          plainStack = game.__plainStack ??= new own.constructor({ quality: q, halfFloat: r.drawsHalfFloat() }, r.width * pr, r.height * pr);
          plainStack.passes.splice(0, plainStack.passes.length, ...plainStack.passes.filter((p) => p.id === 'output'));
        }
        // Draw until the node renderer has compiled everything in view (its draw count settles), then the frame.
        // Each render waits for an animation frame, as the game's own loop does: the node renderer redraws its shadow
        // maps once a frame (it counts frames by them), so renders between two frames would see the last frame's.
        const nextFrame = () => new Promise((done) => requestAnimationFrame(done));
        let calls = -1;
        for (let i = 0, still = 0; i < 40 && still < 3; i++) {
          await nextFrame();
          r.postStack = () => plainStack;
          r.render();
          const now = r.stats.calls;
          still = now === calls ? still + 1 : 0;
          calls = now;
          await new Promise((done) => setTimeout(done, 150));
        }
        await nextFrame();
        r.postStack = () => plainStack;
        r.render();
        const plain = grab();
        const drawn = r.stats.calls;
        r.postStack = ownStack;
        let post = null;
        if (withPost) {
          // The post stack's temporal pass settles over a few frames from the stood camera.
          for (let i = 0; i < 8; i++) {
            await nextFrame();
            r.render();
          }
          post = grab();
        }
        return { plain, post, calls: drawn };
      },
      { camera: STILL_CAMERA[view] ?? EXTRA_CAMERAS[view], view, withPost },
    );
  }
  await page.close();
  if (errors.length > 0) console.warn(`webgpu-compare: ${scene.map} ${scene.light} ${quality} ${renderer}: ${errors.length} page error(s): ${errors.slice(0, 3).join(' | ')}`);
  return { frames };
}

/** Scores a pair in a blank page (the browser decodes the PNGs) and lays it out side by side with its difference. */
async function compare(a, b, label) {
  const page = await browser.newPage();
  const result = await page.evaluate(
    async ({ a, b, threshold, scoreSource, label }) => {
      const scorePixels = new Function(`return (${scoreSource})`)();
      const load = (url) =>
        new Promise((done, fail) => {
          const img = new Image();
          img.onload = () => done(img);
          img.onerror = fail;
          img.src = url;
        });
      const [ia, ib] = await Promise.all([load(a), load(b)]);
      const w = ia.width;
      const h = ia.height;
      const read = (img) => {
        const c = document.createElement('canvas');
        c.width = w;
        c.height = h;
        const ctx = c.getContext('2d');
        ctx.drawImage(img, 0, 0, w, h);
        return ctx.getImageData(0, 0, w, h).data;
      };
      const pa = read(ia);
      const pb = read(ib);
      const score = scorePixels(pa, pb, threshold);
      // The difference: black where equal, brighter where they differ (×4), red where over the threshold.
      const diff = new ImageData(w, h);
      for (let i = 0; i < pa.length; i += 4) {
        const dr = Math.abs(pa[i] - pb[i]);
        const dg = Math.abs(pa[i + 1] - pb[i + 1]);
        const db = Math.abs(pa[i + 2] - pb[i + 2]);
        const over = dr > threshold || dg > threshold || db > threshold;
        diff.data[i] = over ? 255 : Math.min(255, dr * 4);
        diff.data[i + 1] = over ? 40 : Math.min(255, dg * 4);
        diff.data[i + 2] = over ? 40 : Math.min(255, db * 4);
        diff.data[i + 3] = 255;
      }
      const dc = document.createElement('canvas');
      dc.width = w;
      dc.height = h;
      dc.getContext('2d').putImageData(diff, 0, 0);
      // Side by side at two thirds of the frame's size each, labelled.
      const sw = Math.round((w * 2) / 3);
      const sh = Math.round((h * 2) / 3);
      const out = document.createElement('canvas');
      out.width = sw * 3;
      out.height = sh + 28;
      const ctx = out.getContext('2d');
      ctx.fillStyle = '#111';
      ctx.fillRect(0, 0, out.width, out.height);
      ctx.drawImage(ia, 0, 28, sw, sh);
      ctx.drawImage(ib, sw, 28, sw, sh);
      ctx.drawImage(dc, sw * 2, 28, sw, sh);
      ctx.fillStyle = '#eee';
      ctx.font = '16px sans-serif';
      ctx.fillText(`WebGL (today)  ·  ${label}`, 8, 20);
      ctx.fillText('Node renderer (W2)', sw + 8, 20);
      ctx.fillText(`Difference ×4 (red: over ${threshold}) · mad ${score.mad.toFixed(2)} · over ${(score.over * 100).toFixed(2)} %`, sw * 2 + 8, 20);
      return { score, jpeg: out.toDataURL('image/jpeg', 0.85) };
    },
    { a, b, threshold: COMPARE_BAR.threshold, scoreSource: scorePixels.toString(), label },
  );
  await page.close();
  return { score: result.score, jpeg: Buffer.from(result.jpeg.slice(result.jpeg.indexOf(',') + 1), 'base64') };
}
