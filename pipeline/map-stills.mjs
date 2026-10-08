#!/usr/bin/env node
/**
 * The menus' pictures (graphics overhaul G3): draws each map still, each mode picture and the blurred backdrop with the
 * game itself, and writes them as small JPEGs into public/menu/ (what src/config/menuArt.ts lists). Run it again when
 * a map, its lighting or the renderer's look changes, and commit the pictures.
 *
 *   node pipeline/map-stills.mjs [--url http://localhost:5173/] [--quality high] [--only depot-day.jpg,...] [--chromium /path]
 *
 * Without --url it builds the e2e bundle (pipeline/build-cached.mjs, the build with `window.airsoft`) and serves it on
 * port 4183. Each picture is one page: the map, its light and the mode saved as the player's picks (Dev content on, for
 * the maps still being built), a match started, then the camera stood where config/menuArt.ts STILL_CAMERA says
 * (behind Blue's start, looking across the field at Orange's, or at the flagpole) and one frame drawn with the HUD
 * left out. The frame is scaled down, saved as a JPEG, and checked against its byte budget. The blurred backdrop is
 * a view of Depot blurred once here, so no screen ever blurs live (the title has no picture).
 *
 * Software rendering (SwiftShader) draws the same picture as a GPU, only slower: PLAYWRIGHT_CHROMIUM picks the browser.
 */
import { execFileSync, spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'public', 'menu');
const PORT = 4183;
const args = process.argv.slice(2);
const value = (name, fallback) => (args.includes(name) ? args[args.indexOf(name) + 1] : fallback);

// config/menuArt.ts has no imports, so Node reads it as it is (types stripped).
const art = await import(pathToFileURL(join(ROOT, 'src', 'config', 'menuArt.ts')).href);
const { MAP_STILLS, MODE_STILLS, STILL_SIZE, BACKDROPS, STILL_CAMERA } = art;

const quality = value('--quality', 'high');
const only = value('--only', '')?.split(',').filter(Boolean) ?? [];
const chromium = value('--chromium', process.env.PLAYWRIGHT_CHROMIUM);
let base = value('--url', '');
let server = null;
if (!base) {
  execFileSync(process.execPath, [join(ROOT, 'pipeline', 'build-cached.mjs'), '--mode', 'e2e'], { cwd: ROOT, stdio: 'inherit' });
  // Vite itself, not through npx: killing an npx wrapper would leave its vite child serving.
  server = spawn(process.execPath, [join(ROOT, 'node_modules', 'vite', 'bin', 'vite.js'), 'preview', '--outDir', 'dist-e2e', '--port', String(PORT), '--strictPort'], { cwd: ROOT, stdio: 'ignore' });
  base = `http://localhost:${PORT}/`;
  for (let i = 0; i < 50 && !(await fetch(base).then((r) => r.ok, () => false)); i++) await new Promise((r) => setTimeout(r, 200));
}

/** Every picture to draw: the blurred backdrop first, then the stills and the modes. */
const shots = [
  { ...BACKDROPS.blurred, mode: 'elimination', budget: BACKDROPS.blurred.maxBytes },
  ...MAP_STILLS.map((s) => ({ ...s, mode: 'elimination', width: STILL_SIZE.width, height: STILL_SIZE.height, quality: STILL_SIZE.quality, budget: STILL_SIZE.maxBytes })),
  ...Object.entries(MODE_STILLS).map(([mode, s]) => ({ ...s, mode, width: STILL_SIZE.width, height: STILL_SIZE.height, quality: STILL_SIZE.quality, budget: STILL_SIZE.maxBytes })),
].filter((s) => only.length === 0 || only.includes(s.file));

const { chromium: browserType } = await import(pathToFileURL(join(ROOT, 'node_modules', '@playwright', 'test', 'index.mjs')).href);
const browser = await browserType.launch({
  ...(chromium ? { executablePath: chromium } : {}),
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
mkdirSync(OUT, { recursive: true });
let failed = false;
try {
  for (const shot of shots) {
    const files = await draw(shot);
    for (const [file, bytes] of files) {
      const over = bytes.length > shot.budget;
      if (over) failed = true;
      writeFileSync(join(OUT, file), bytes);
      console.log(`map-stills: ${file} ${(bytes.length / 1000).toFixed(1)} kB${over ? ' (over its budget)' : ''}`);
    }
  }
} finally {
  await browser.close();
  server?.kill();
}
if (failed) process.exit(1);

/** One picture: its files and their bytes. */
async function draw(shot) {
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
  page.on('pageerror', (e) => console.error(`map-stills: page error: ${e.message}`));
  // The picks as saved settings: the map in its light, the mode, a 3v3 on Skirmish, Dev content on.
  const picks = { version: 1, map: shot.map, mode: shot.mode, [`lighting.${shot.map}`]: shot.light, 'dev.devContent': 'on', 'dev.enabled': true, ruleset: 'skirmish' };
  await page.addInitScript((saved) => localStorage.setItem('airsoft.settings', JSON.stringify(saved)), picks);
  await page.goto(`${base}?nolock&seed=1&quality=${quality}`);
  await page.waitForSelector('.menu-title-start', { timeout: 120_000 });
  // A dev map's data arrives after the title shows (map/maps.ts loadDevMaps): wait until the Play screen offers it.
  await page.locator('.menu-title-start').click();
  const setup = page.locator('.menu-setup');
  await setup.locator('.map-cards .choice-card.selected').waitFor({ timeout: 60_000 });
  await page.waitForFunction((map) => document.querySelector('.menu-setup .play-map-line')?.textContent?.toLowerCase().replace(/\s/g, '').startsWith(map.toLowerCase()), shot.map, { timeout: 60_000 });
  await setup.getByRole('button', { name: 'Play', exact: true }).click();
  await page.waitForFunction(() => globalThis.airsoft?.state && globalThis.airsoft.state.tick > 30, null, { timeout: 180_000 });
  const camera = STILL_CAMERA[shot.view];
  const result = await page.evaluate(
    ({ camera, view, width, height, q, blur }) => {
      const game = globalThis.airsoft;
      const state = game.state;
      const r = game.renderer;
      // Where the game put the camera this frame: the player's eye at their start.
      const eye = { position: r.camera.position.clone(), rotation: r.camera.rotation.clone() };
      const centre = (team) => {
        const own = state.characters.filter((c) => c.team === team);
        const sum = own.reduce((a, c) => ({ x: a.x + c.spawnPosition.x, y: a.y + c.spawnPosition.y, z: a.z + c.spawnPosition.z }), { x: 0, y: 0, z: 0 });
        return { x: sum.x / own.length, y: sum.y / own.length, z: sum.z / own.length };
      };
      const blue = centre(0);
      const orange = centre(1);
      // The flag view looks at the pole; the others across the field from Blue's start to Orange's.
      const target = view === 'flag' ? state.round.flag.position : view === 'overview' || view === 'aerial' ? { x: (blue.x + orange.x) / 2, y: (blue.y + orange.y) / 2, z: (blue.z + orange.z) / 2 } : orange;
      // Facing from Blue's start towards what it looks at, `back` metres behind Blue's start (or the pole, for the flag).
      const dx = target.x - blue.x;
      const dz = target.z - blue.z;
      const len = Math.hypot(dx, dz) || 1;
      const from = view === 'flag' || view === 'aerial' ? target : blue;
      const cam = r.camera;
      cam.position.set(from.x - (dx / len) * camera.back, from.y + camera.up, from.z - (dz / len) * camera.back);
      cam.fov = camera.fov;
      cam.aspect = 16 / 9;
      cam.updateProjectionMatrix();
      cam.lookAt(target.x, target.y + camera.lookUp, target.z);
      if (view === 'street') {
        // Between tall walls the other start is out of sight: the player's own first view, from a little higher.
        cam.position.copy(eye.position);
        cam.position.y += camera.up;
        cam.rotation.set(eye.rotation.x - 0.05, eye.rotation.y, 0, 'YXZ');
      }
      r.render();
      const canvas = r.renderer.domElement;
      const shrink = (w, h, filter) => {
        const c = document.createElement('canvas');
        c.width = w;
        c.height = h;
        const ctx = c.getContext('2d');
        ctx.imageSmoothingQuality = 'high';
        if (filter) ctx.filter = filter;
        // The middle 16:9 of the frame, scaled to the picture's size.
        const sh = Math.min(canvas.height, (canvas.width * 9) / 16);
        const sw = (sh * 16) / 9;
        ctx.drawImage(canvas, (canvas.width - sw) / 2, (canvas.height - sh) / 2, sw, sh, 0, 0, w, h);
        return c;
      };
      // The backdrop is drawn small and blurred once; the menus scale it up behind every screen but the title.
      const main = shrink(width, height, blur ? `blur(${blur}px) saturate(1.1)` : '').toDataURL('image/jpeg', q);
      return { main };
    },
    { camera, view: shot.view, width: shot.width, height: shot.height, q: shot.quality, blur: shot.blur ?? 0 },
  );
  await page.close();
  const bytes = (url) => Buffer.from(url.slice(url.indexOf(',') + 1), 'base64');
  return [[shot.file, bytes(result.main)]];
}
