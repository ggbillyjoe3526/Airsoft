/**
 * The content report's pictures (CT1, the spec test): a replica on its own and with each part fitted, drawn by the
 * game's own menu pictures (render/replicas/itemPictures.ts, at high detail), and the item in first person in a real match; and
 * a map from above, its minimap and the view from each end's spawns (CT2, drawMapPictures).
 * `pipeline/content-check.mjs` calls `drawPictures` and `drawMapPictures`; it needs the e2e build (`window.airsoft`), which it builds and
 * serves itself unless given a URL. Software rendering (SwiftShader) draws what a GPU would, only slower.
 *
 * The page is read through the game's objects at run time (`airsoft.pictures`, `airsoft.setup.loadout`), as the smoke tests
 * do: a picture that can't be drawn is reported as missing, never as a failure of the item.
 */
import { execFileSync, spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PORT = 4184;
const SWIFTSHADER = ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'];

/** The settings a first-person picture starts with: Dev content and Disable levelling on, the item equipped. */
export function firstPersonSettings(subject) {
  const picks = { version: 1, 'dev.enabled': true, 'dev.devContent': 'on', 'dev.unlockAllGear': 'on', 'equip.dev.primary': subject.replica };
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
 * Draws `shots` into `outDir`: each `{ file, title, replica (pool ID), picture: { fit, scheme, realistic? } }` for a menu picture, or
 * `{ file, title, replica, firstPerson: { fit } }` for one in a match (fit: slot → pool ID). Returns
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
          const slot = game.setup.loadout.asItComes(s.replica);
          const url = await Promise.race([
            game.pictures.picture({ replica: slot.replica, scheme: s.picture.scheme, realistic: s.picture.realistic ?? false, fit: s.picture.fit, shape: 'wide' }),
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
    await page.addInitScript((saved) => localStorage.setItem('airsoft.settings', JSON.stringify(saved)), firstPersonSettings({ replica: shot.replica, fit: shot.firstPerson.fit }));
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

/** Starts an Elimination match on `map` in `light` (Dev content on), on High, and waits until it has played a second. */
async function startMatchOn(page, base, map, light) {
  // The picks as saved settings, as map-stills.mjs saves them: the map in its light, Elimination, Dev content on.
  const picks = { version: 1, map, mode: 'elimination', [`lighting.${map}`]: light, 'dev.enabled': true, 'dev.devContent': 'on' };
  await page.addInitScript((saved) => localStorage.setItem('airsoft.settings', JSON.stringify(saved)), picks);
  await page.goto(`${base}?nolock&seed=1&quality=high`);
  await page.waitForSelector('.menu-title-start', { timeout: 120_000 });
  await page.locator('.menu-title-start').click();
  const setup = page.locator('.menu-setup');
  await setup.locator('.map-cards .choice-card.selected').waitFor({ timeout: 60_000 });
  // A dev map's data arrives after the title shows: the Match screen offers it once it is in.
  await page.waitForFunction((id) => globalThis.airsoft?.setup?.playedPicks?.().map === id, map, { timeout: 60_000 });
  await setup.getByRole('button', { name: 'Start match', exact: true }).click();
  await page.waitForFunction(() => globalThis.airsoft?.state && globalThis.airsoft.state.tick > 60, null, { timeout: 240_000 });
}

async function mapShot(browser, base, shot, outDir) {
  const wanted = mapShotPictures(shot);
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  try {
    await startMatchOn(page, base, shot.map, shot.light);
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

/**
 * Each map's colours (CT4, the skin checks' spec test): per `{ map, label, light }`, one match on that map, and the
 * colours its painted surfaces are drawn in (the map's own meshes: each material's colour times its texture's mean
 * and the vertex and instance colours, before light), as buckets of near colours with their share of the surface.
 * Glowing signs, glass and other see-through surfaces are light, not paint, and are left out. Returns
 * `{ map, label, buckets: [{ colour, share }], error? }` per map, in order; skinMaps.ts judges them.
 */
export async function measureMapPalettes(maps, { url = '', chromium = process.env.PLAYWRIGHT_CHROMIUM } = {}) {
  const server = url ? { base: url, stop: () => {} } : await serve();
  const { chromium: browserType } = await import(pathToFileURL(join(ROOT, 'node_modules', '@playwright', 'test', 'index.mjs')).href);
  const browser = await browserType.launch({ ...(chromium ? { executablePath: chromium } : {}), args: SWIFTSHADER });
  const out = [];
  try {
    for (const m of maps) {
      const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
      try {
        await startMatchOn(page, server.base, m.map, m.light);
        const buckets = await page.evaluate(measureInPage);
        out.push({ map: m.map, label: m.label, buckets });
      } catch (e) {
        out.push({ map: m.map, label: m.label, buckets: [], error: String(e?.message ?? e).split('\n')[0] });
      } finally {
        await page.close();
      }
    }
  } finally {
    await browser.close();
    server.stop();
  }
  return out;
}

/** In the page: the match's map meshes' colours by surface (see measureMapPalettes). */
function measureInPage() {
  const group = globalThis.airsoft?.session?.mapGroup;
  if (!group) throw new Error('no map meshes in the match');
  group.updateMatrixWorld(true);
  const toLinear = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  const toSrgb = (c) => Math.round(255 * Math.min(1, Math.max(0, c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055)));
  const means = new Map();
  /** A texture's mean colour, linear. */
  const meanOf = (tex) => {
    if (!tex?.image) return [1, 1, 1];
    if (means.has(tex.uuid)) return means.get(tex.uuid);
    let data = null;
    const img = tex.image;
    try {
      if (img.data && img.width && img.data.length === img.width * img.height * 4) data = img.data;
      else {
        const c = document.createElement('canvas');
        c.width = c.height = 32;
        const x = c.getContext('2d');
        x.drawImage(img, 0, 0, 32, 32);
        data = x.getImageData(0, 0, 32, 32).data;
      }
    } catch {
      data = null;
    }
    let mean = [1, 1, 1];
    if (data) {
      const sum = [0, 0, 0];
      const srgb = tex.colorSpace === 'srgb';
      for (let i = 0; i < data.length; i += 4) for (let k = 0; k < 3; k++) sum[k] += srgb ? toLinear(data[i + k] / 255) : data[i + k] / 255;
      mean = sum.map((v) => v / (data.length / 4));
    }
    means.set(tex.uuid, mean);
    return mean;
  };
  const buckets = new Map();
  const add = (rgb, area) => {
    if (!(area > 0)) return;
    const s = rgb.map(toSrgb);
    const key = (s[0] >> 4) * 256 + (s[1] >> 4) * 16 + (s[2] >> 4);
    const b = buckets.get(key) ?? { area: 0, sum: [0, 0, 0] };
    b.area += area;
    for (let k = 0; k < 3; k++) b.sum[k] += rgb[k] * area;
    buckets.set(key, b);
  };
  const paint = (mat) => {
    if (!mat || !mat.visible || mat.isShaderMaterial || mat.isMeshBasicMaterial) return null;
    if (mat.transparent && mat.opacity < 0.5) return null;
    if (mat.emissive && mat.emissiveIntensity > 0 && mat.emissive.r + mat.emissive.g + mat.emissive.b > 0.05) return null;
    const c = mat.color ?? { r: 1, g: 1, b: 1 };
    const t = meanOf(mat.map);
    return [c.r * t[0], c.g * t[1], c.b * t[2]];
  };
  const a = { x: 0, y: 0, z: 0 };
  const scaleSq = (e) => {
    const det = e[0] * (e[5] * e[10] - e[6] * e[9]) - e[4] * (e[1] * e[10] - e[2] * e[9]) + e[8] * (e[1] * e[6] - e[2] * e[5]);
    return Math.cbrt(Math.abs(det)) ** 2;
  };
  group.traverseVisible((o) => {
    if (!o.isMesh) return;
    const g = o.geometry;
    const pos = g.getAttribute('position');
    if (!pos) return;
    const colour = g.getAttribute('color');
    const index = g.index;
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    const groups = Array.isArray(o.material) ? g.groups : [{ start: 0, count: index ? index.count : pos.count, materialIndex: 0 }];
    // The mesh's own triangles by colour (local area), then its instances or its place.
    const local = new Map();
    for (const grp of groups) {
      const base = paint(mats[grp.materialIndex ?? 0]);
      if (!base) continue;
      const end = Math.min(grp.start + grp.count, index ? index.count : pos.count);
      for (let i = grp.start; i + 2 < end; i += 3) {
        const v = index ? [index.getX(i), index.getX(i + 1), index.getX(i + 2)] : [i, i + 1, i + 2];
        const p = v.map((j) => [pos.getX(j), pos.getY(j), pos.getZ(j)]);
        const u = [p[1][0] - p[0][0], p[1][1] - p[0][1], p[1][2] - p[0][2]];
        const w = [p[2][0] - p[0][0], p[2][1] - p[0][1], p[2][2] - p[0][2]];
        a.x = u[1] * w[2] - u[2] * w[1];
        a.y = u[2] * w[0] - u[0] * w[2];
        a.z = u[0] * w[1] - u[1] * w[0];
        const area = Math.hypot(a.x, a.y, a.z) / 2;
        let rgb = base;
        if (colour && mats[grp.materialIndex ?? 0].vertexColors) {
          const m = [0, 0, 0];
          for (const j of v) {
            m[0] += colour.getX(j) / 3;
            m[1] += colour.getY(j) / 3;
            m[2] += colour.getZ(j) / 3;
          }
          rgb = [base[0] * m[0], base[1] * m[1], base[2] * m[2]];
        }
        const key = rgb.map((c) => c.toFixed(3)).join(',');
        const e = local.get(key) ?? { rgb, area: 0 };
        e.area += area;
        local.set(key, e);
      }
    }
    if (local.size === 0) return;
    if (o.isInstancedMesh) {
      const m = new o.matrixWorld.constructor();
      const tint = o.instanceColor;
      for (let i = 0; i < o.count; i++) {
        o.getMatrixAt(i, m);
        m.premultiply(o.matrixWorld);
        const s = scaleSq(m.elements);
        const c = tint ? [tint.getX(i), tint.getY(i), tint.getZ(i)] : [1, 1, 1];
        for (const e of local.values()) add([e.rgb[0] * c[0], e.rgb[1] * c[1], e.rgb[2] * c[2]], e.area * s);
      }
    } else {
      const s = scaleSq(o.matrixWorld.elements);
      for (const e of local.values()) add(e.rgb, e.area * s);
    }
  });
  const total = [...buckets.values()].reduce((t, b) => t + b.area, 0);
  return [...buckets.values()]
    .map((b) => ({ colour: b.sum.map((c) => toSrgb(c / b.area)).reduce((h, c) => h * 256 + c, 0), share: b.area / total }))
    .filter((b) => b.share >= 0.002)
    .sort((x, y) => y.share - x.share);
}
