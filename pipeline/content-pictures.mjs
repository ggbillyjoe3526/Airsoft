/**
 * The content report's pictures (CT1, the spec test): a replica on its own and with each part fitted, drawn by the
 * game's own menu pictures (render/itemPictures.ts, at high detail), and the item in first person in a real match; and
 * a map from above, its minimap and the view from each end's spawns (CT2, drawMapPictures).
 * `pipeline/content-check.mjs` calls `drawPictures` and `drawMapPictures`; it needs the e2e build (`window.airsoft`), which it builds and
 * serves itself unless given a URL. Software rendering (SwiftShader) draws what a GPU would, only slower.
 *
 * The page is read through the game's objects at run time (`airsoft.pictures`, `airsoft.loadout`), as the smoke tests
 * do: a picture that can't be drawn is reported as missing, never as a failure of the item.
 */
import { execFileSync, spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PORT = 4184;
const SWIFTSHADER = ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'];

/** The settings a first-person picture starts with: Dev content and Unlock all gear on, the item equipped. */
export function firstPersonSettings(subject) {
  const picks = { version: 1, 'dev.enabled': true, 'dev.devContent': 'on', 'dev.unlockAllGear': 'on', 'equip.dev.primary': `${subject.replica}@${subject.tier}` };
  for (const [slot, item] of Object.entries(subject.fit ?? {})) picks[`fit.dev.${subject.replica}.${slot}`] = item;
  return picks;
}

/** Serves the e2e build on PORT (building it first when its sources changed); returns the URL and a stop function. */
async function serve() {
  execFileSync(process.execPath, [join(ROOT, 'pipeline', 'build-cached.mjs'), '--mode', 'e2e'], { cwd: ROOT, stdio: 'ignore' });
  const server = spawn(process.execPath, [join(ROOT, 'node_modules', 'vite', 'bin', 'vite.js'), 'preview', '--outDir', 'dist-e2e', '--port', String(PORT), '--strictPort'], { cwd: ROOT, stdio: 'ignore' });
  const base = `http://localhost:${PORT}/`;
  for (let i = 0; i < 100 && !(await fetch(base).then((r) => r.ok, () => false)); i++) await new Promise((r) => setTimeout(r, 200));
  return { base, stop: () => server.kill() };
}

/**
 * Draws `shots` into `outDir`: each `{ file, title, replica (pool ID), picture: { fit, scheme } }` for a menu picture, or
 * `{ file, title, replica, tier, firstPerson: { fit } }` for one in a match (fit: slot → "ID@tier"). Returns
 * `{ file, title, ok, error? }` per shot, in order.
 */
export async function drawPictures(shots, { outDir, url = '', chromium = process.env.PLAYWRIGHT_CHROMIUM } = {}) {
  mkdirSync(outDir, { recursive: true });
  const server = url ? { base: url, stop: () => {} } : await serve();
  const { chromium: browserType } = await import(pathToFileURL(join(ROOT, 'node_modules', '@playwright', 'test', 'index.mjs')).href);
  const browser = await browserType.launch({ ...(chromium ? { executablePath: chromium } : {}), args: SWIFTSHADER });
  const out = [];
  try {
    const menu = shots.filter((s) => s.picture);
    if (menu.length > 0) out.push(...(await menuPictures(browser, server.base, menu, outDir)));
    for (const shot of shots.filter((s) => s.firstPerson)) out.push(await firstPerson(browser, server.base, shot, outDir));
  } finally {
    await browser.close();
    server.stop();
  }
  const order = new Map(shots.map((s, i) => [s.file, i]));
  return out.sort((a, b) => order.get(a.file) - order.get(b.file));
}

/** Every menu picture on one page: the title screen's game draws them with its renderer, one a frame. */
async function menuPictures(browser, base, shots, outDir) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  try {
    await page.addInitScript(() => localStorage.setItem('airsoft.settings', JSON.stringify({ version: 1, 'dev.enabled': true, 'dev.devContent': 'on' })));
    await page.goto(`${base}?nolock&seed=1&quality=high`);
    await page.waitForSelector('.menu-title-start', { timeout: 120_000 });
    const urls = await page.evaluate(async (list) => {
      const game = globalThis.airsoft;
      const done = [];
      for (const s of list) {
        try {
          const slot = game.loadout.asItComes(s.replica);
          const url = await Promise.race([
            game.pictures.picture({ replica: slot.replica, scheme: s.picture.scheme, realistic: false, fit: s.picture.fit, shape: 'wide' }),
            new Promise((_, reject) => setTimeout(() => reject(new Error('no picture after 60 s')), 60_000)),
          ]);
          done.push({ url });
        } catch (e) {
          done.push({ error: String(e?.message ?? e) });
        }
      }
      return done;
    }, shots);
    return shots.map((s, i) => {
      const r = urls[i];
      if (!r?.url) return { file: s.file, title: s.title, ok: false, error: r?.error ?? errors[0] ?? 'not drawn' };
      writeFileSync(join(outDir, s.file), Buffer.from(r.url.slice(r.url.indexOf(',') + 1), 'base64'));
      return { file: s.file, title: s.title, ok: true };
    });
  } catch (e) {
    return shots.map((s) => ({ file: s.file, title: s.title, ok: false, error: String(e?.message ?? e) }));
  } finally {
    await page.close();
  }
}

/** One first-person picture: a match started with the item equipped, a frame once it has been in play a moment. */
async function firstPerson(browser, base, shot, outDir) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  try {
    await page.addInitScript((saved) => localStorage.setItem('airsoft.settings', JSON.stringify(saved)), firstPersonSettings({ replica: shot.replica, tier: shot.tier, fit: shot.firstPerson.fit }));
    await page.goto(`${base}?nolock&seed=1&quality=high`);
    await page.waitForSelector('.menu-title-start', { timeout: 120_000 });
    await page.locator('.menu-title-start').click();
    await page.locator('.menu-setup').getByRole('button', { name: 'Start match', exact: true }).click();
    await page.waitForFunction(() => globalThis.airsoft?.state && globalThis.airsoft.state.tick > 120, null, { timeout: 240_000 });
    writeFileSync(join(outDir, shot.file), await page.screenshot({ type: 'jpeg', quality: 80 }));
    return { file: shot.file, title: shot.title, ok: true };
  } catch (e) {
    return { file: shot.file, title: shot.title, ok: false, error: String(e?.message ?? e).split('\n')[0] };
  } finally {
    await page.close();
  }
}

/**
 * A map's pictures (CT2, the spec test): per shot `{ file, title, map, light, field: { x, z, middle } }`, one match on
 * that map under that light, and from it four pictures: the field from above (framed on its walkable ground, `field`),
 * the minimap as the player first sees it, and the view from each end's spawns across the field (the game's own camera
 * moved there, the HUD left out, as pipeline/map-stills.mjs draws the menus' stills). Returns `{ file, title, ok, error? }`
 * per picture, in order.
 */
export async function drawMapPictures(shots, { outDir, url = '', chromium = process.env.PLAYWRIGHT_CHROMIUM } = {}) {
  mkdirSync(outDir, { recursive: true });
  const server = url ? { base: url, stop: () => {} } : await serve();
  const { chromium: browserType } = await import(pathToFileURL(join(ROOT, 'node_modules', '@playwright', 'test', 'index.mjs')).href);
  const browser = await browserType.launch({ ...(chromium ? { executablePath: chromium } : {}), args: SWIFTSHADER });
  const out = [];
  try {
    for (const shot of shots) out.push(...(await mapShot(browser, server.base, shot, outDir)));
  } finally {
    await browser.close();
    server.stop();
  }
  return out;
}

/** The pictures one map shot draws: their files and titles. */
export function mapShotPictures(shot) {
  return [
    { file: `${shot.file}-overhead.jpg`, title: `${shot.title}: from above` },
    { file: `${shot.file}-minimap.png`, title: `${shot.title}: the minimap at the start` },
    { file: `${shot.file}-end-0.jpg`, title: `${shot.title}: from end 0's spawns` },
    { file: `${shot.file}-end-1.jpg`, title: `${shot.title}: from end 1's spawns` },
  ];
}

async function mapShot(browser, base, shot, outDir) {
  const wanted = mapShotPictures(shot);
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  try {
    // The picks as saved settings, as map-stills.mjs saves them: the map in its light, Elimination, Dev content on.
    const picks = { version: 1, map: shot.map, mode: 'elimination', [`lighting.${shot.map}`]: shot.light, 'dev.enabled': true, 'dev.devContent': 'on' };
    await page.addInitScript((saved) => localStorage.setItem('airsoft.settings', JSON.stringify(saved)), picks);
    await page.goto(`${base}?nolock&seed=1&quality=high`);
    await page.waitForSelector('.menu-title-start', { timeout: 120_000 });
    await page.locator('.menu-title-start').click();
    const setup = page.locator('.menu-setup');
    await setup.locator('.map-cards .choice-card.selected').waitFor({ timeout: 60_000 });
    // A dev map's data arrives after the title shows: the Match screen offers it once it is in.
    await page.waitForFunction((map) => globalThis.airsoft?.playedPicks?.().map === map, shot.map, { timeout: 60_000 });
    await setup.getByRole('button', { name: 'Start match', exact: true }).click();
    await page.waitForFunction(() => globalThis.airsoft?.state && globalThis.airsoft.state.tick > 60, null, { timeout: 240_000 });
    const files = {};
    const minimap = page.locator('.minimap-frame');
    if (await minimap.isVisible()) files[wanted[1].file] = await minimap.screenshot({ type: 'png' });
    const views = await page.evaluate(({ field }) => {
      const game = globalThis.airsoft;
      const r = game.renderer;
      const cam = r.camera;
      const state = game.state;
      const centre = (team) => {
        const own = state.characters.filter((c) => c.team === team);
        const sum = own.reduce((a, c) => ({ x: a.x + c.spawnPosition.x, y: a.y + c.spawnPosition.y, z: a.z + c.spawnPosition.z }), { x: 0, y: 0, z: 0 });
        return { x: sum.x / own.length, y: sum.y / own.length, z: sum.z / own.length };
      };
      const saved = { position: cam.position.clone(), quaternion: cam.quaternion.clone(), up: cam.up.clone(), fov: cam.fov, aspect: cam.aspect, far: cam.far, fog: r.scene.fog };
      const grab = () => {
        r.render();
        return r.renderer.domElement.toDataURL('image/jpeg', 0.85);
      };
      const out = {};
      // From above: straight down over the middle, high enough to hold the walkable ground, no fog in the way.
      const fov = 50;
      const aspect = r.renderer.domElement.width / r.renderer.domElement.height;
      const half = Math.tan(((fov / 2) * Math.PI) / 180);
      const height = Math.max(field.z / 2 / half, field.x / 2 / (half * aspect)) * 1.08;
      cam.fov = fov;
      cam.far = Math.max(saved.far, height * 2);
      cam.up.set(0, 0, -1);
      cam.position.set(field.middle.x, field.middle.y + height, field.middle.z);
      cam.lookAt(field.middle.x, field.middle.y, field.middle.z);
      cam.updateProjectionMatrix();
      r.scene.fog = null;
      out.overhead = grab();
      r.scene.fog = saved.fog;
      cam.up.set(0, 1, 0);
      cam.far = saved.far;
      // From each end's spawns, at a standing eye among them (behind them is the field's edge), looking at the other end's.
      for (const team of [0, 1]) {
        const from = centre(team);
        const to = centre(1 - team);
        cam.fov = 70;
        cam.position.set(from.x, from.y + 1.7, from.z);
        cam.lookAt(to.x, to.y + 1.2, to.z);
        cam.updateProjectionMatrix();
        out[`end${team}`] = grab();
      }
      cam.position.copy(saved.position);
      cam.quaternion.copy(saved.quaternion);
      cam.fov = saved.fov;
      cam.updateProjectionMatrix();
      return out;
    }, { field: shot.field });
    const bytes = (url) => Buffer.from(url.slice(url.indexOf(',') + 1), 'base64');
    files[wanted[0].file] = bytes(views.overhead);
    files[wanted[2].file] = bytes(views.end0);
    files[wanted[3].file] = bytes(views.end1);
    return wanted.map((p) => {
      if (!files[p.file]) return { ...p, ok: false, error: p.file.endsWith('minimap.png') ? 'the minimap was not showing' : errors[0] ?? 'not drawn' };
      writeFileSync(join(outDir, p.file), files[p.file]);
      return { ...p, ok: true };
    });
  } catch (e) {
    return wanted.map((p) => ({ ...p, ok: false, error: String(e?.message ?? e).split('\n')[0] }));
  } finally {
    await page.close();
  }
}
