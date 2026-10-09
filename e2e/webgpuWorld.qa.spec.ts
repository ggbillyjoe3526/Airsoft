import { expect, type Page, test } from '@playwright/test';

/**
 * W2 QA: the world's node twins attacked from the browser, on the node renderer's WebGL2 back end (`?forceWebGL`, the
 * e2e build only). e2e/webgpuWorld.spec.ts checks that the twins are what is asked for; this checks what they DRAW over
 * time, as the game's own frame loop runs them: every patched material of three maps has a twin, the effects move
 * (flames, embers, fireflies, steam), the uniforms the game changes mid-match reach the screen, Reduced motion stills
 * them, and a quality change or a lost device leaves the twins whole.
 *
 * Bugs found are pinned with `test.fail` (what must be true, failing today): when the worker fixes one the test
 * reports an unexpected pass and the `.fail` goes. Each test of a group shares one page and match (serial).
 */

/* eslint-disable @typescript-eslint/no-explicit-any -- the in-page code reads the game's untyped debug handle. */
type Any = any;

function watchErrors(page: Page): () => string[] {
  const errors: string[] = [];
  page.on('pageerror', (err) => errors.push(`pageerror: ${err.message}`));
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(`console: ${msg.text()}`);
  });
  return () => errors;
}

/** Starts `map` at `light` on High in the node renderer, waits for the match to run, and installs the in-page helpers. */
async function boot(page: Page, map: string, light: string, extra: Record<string, unknown> = {}): Promise<void> {
  await page.addInitScript((text) => {
    if (sessionStorage.getItem('w2qa-seeded')) return;
    sessionStorage.setItem('w2qa-seeded', '1');
    localStorage.setItem('airsoft.settings', text);
  }, JSON.stringify({ version: 1, renderer: 'webgpu', map, mode: 'elimination', [`lighting.${map}`]: light, 'dev.enabled': true, 'dev.devContent': 'on', ruleset: 'skirmish', ...extra }));
  await page.goto('/?nolock&seed=1&quality=high&forceWebGL');
  await page.waitForSelector('.menu-title-start', { timeout: 60_000 });
  expect(await page.evaluate(() => (window as Any).airsoft.renderer.backend)).toBe('webgpu-webgl2');
  await page.locator('.menu-title-start').click();
  const setup = page.locator('.menu-setup');
  await setup.locator('.map-cards .choice-card.selected').waitFor({ timeout: 60_000 });
  await setup.getByRole('button', { name: 'Start match', exact: true }).click();
  await page.waitForFunction(() => (window as Any).airsoft?.state && (window as Any).airsoft.state.tick > 5, null, { timeout: 120_000 });
  await page.evaluate(() => {
    const w = window as Any;
    const game = w.airsoft;
    const r = game.renderer;
    const sleep = (ms: number) => new Promise((done) => setTimeout(done, ms));
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
    const qa = {
      sleep,
      /** The first object under the scene for which `pred` holds. */
      find(pred: (o: Any) => boolean): Any {
        let found: Any = null;
        r.scene.traverse((o: Any) => {
          if (!found && pred(o)) found = o;
        });
        return found;
      },
      /** The canvas's pixels as drawn by the last render (read in the task that rendered). */
      grab(): Uint8ClampedArray {
        const c = r.renderer.domElement as HTMLCanvasElement;
        canvas.width = c.width;
        canvas.height = c.height;
        ctx.drawImage(c, 0, 0);
        return ctx.getImageData(0, 0, canvas.width, canvas.height).data;
      },
      /** How many pixels differ by more than `th` in any channel. */
      over(a: Uint8ClampedArray, b: Uint8ClampedArray, th = 1): number {
        let n = 0;
        for (let i = 0; i < a.length; i += 4) if (Math.abs(a[i]! - b[i]!) > th || Math.abs(a[i + 1]! - b[i + 1]!) > th || Math.abs(a[i + 2]! - b[i + 2]!) > th) n++;
        return n;
      },
      /** Renders until the node renderer has compiled what is in view (its draw count settles), then once more. */
      async settle(): Promise<void> {
        let calls = -1;
        for (let i = 0, still = 0; i < 40 && still < 3; i++) {
          r.render();
          const now = r.stats.calls;
          still = now === calls ? still + 1 : 0;
          calls = now;
          await sleep(120);
        }
        r.render();
      },
      /**
       * The game's own loop keeps running; each render first puts the camera where `aim` says (it is given a function
       * returning {from, to}), and every other render after a warm-up is kept. Returns how many pixels changed between
       * successive kept frames (more than `th` in any channel).
       */
      async watch(aim: () => { from: Any; to: Any }, frames = 5, th = 1): Promise<number[]> {
        const original = r.render.bind(r);
        const kept: Uint8ClampedArray[] = [];
        let n = 0;
        r.render = () => {
          const { from, to } = aim();
          const cam = r.camera;
          cam.position.set(from.x, from.y, from.z);
          cam.fov = 62;
          cam.aspect = 16 / 9;
          cam.updateProjectionMatrix();
          cam.lookAt(to.x, to.y, to.z);
          cam.updateMatrixWorld();
          original();
          if (++n > 4 && n % 2 === 0 && kept.length < frames) kept.push(new Uint8ClampedArray(qa.grab()));
        };
        for (let i = 0; i < 1200 && kept.length < frames; i++) await sleep(100);
        r.render = original;
        return kept.slice(1).map((f, i) => qa.over(kept[i]!, f, th));
      },
      /** Figures out of the way (their motion is not what is measured). */
      hideFigures(): void {
        game.session.match.characters.object.visible = false;
      },
      points(): Any[] {
        const out: Any[] = [];
        r.scene.traverse((o: Any) => {
          if (o.isPoints) out.push(o);
        });
        return out;
      },
      /** Only the Points named `name` (all of them with null) are shown; the rest are hidden. Returns the earlier states. */
      showOnly(name: string | null): () => void {
        const saved = qa.points().map((p: Any) => [p, p.visible] as const);
        for (const [p] of saved) p.visible = name !== null && p.name === name;
        return () => saved.forEach(([p, v]: Any) => (p.visible = v));
      },
    };
    w.__qa = qa;
  });
}

const qa = <T>(page: Page, fn: (qa: Any, game: Any) => T | Promise<T>): Promise<T> => page.evaluate(`(${fn.toString()})(window.__qa, window.airsoft)`) as Promise<T>;

// --- Every patched material of the maps, in the real scenes -------------------------------------------------------------

const COVERAGE = [
  { map: 'depot', light: 'day' },
  { map: 'woodland', light: 'night' },
  { map: 'neonHeights', light: 'night' },
] as const;

for (const c of COVERAGE) {
  test(`a ${c.map} ${c.light} match on High: every patched material the scene draws is a twin, Three's own by design, or a sprite twin's Points`, async ({ page }) => {
    test.setTimeout(150_000);
    const errors = watchErrors(page);
    await boot(page, c.map, c.light);
    const report = await qa(page, (_q, game) => {
      const r = game.renderer;
      const library = r.renderer.library;
      const unaccounted: string[] = [];
      const kinds: Record<string, number> = {};
      const seen = new Set();
      // What Three's own node library draws as it is by design: the figures' finish is W3's, the moon and the plain Lambert off the environment need nothing added.
      const OWN = ['without-environment', 'night-sky-moon', 'fa8-vertex-finish'];
      r.scene.traverse((o: Any) => {
        const materials = Array.isArray(o.material) ? o.material : o.material ? [o.material] : [];
        for (const m of materials) {
          if (seen.has(m)) continue;
          seen.add(m);
          if (m.onBeforeCompile.toString().replace(/\s/g, '') === 'onBeforeCompile(){}' || m.onBeforeCompile.toString().replace(/\s/g, '').startsWith('onBeforeCompile(/*')) continue;
          const key = m.customProgramCacheKey().slice(0, 40);
          const label = `${o.type}:${o.name || '-'}:${key}`;
          if (o.isPoints) {
            if (o.layers.mask === 0 && o.children.filter((child: Any) => child.isSprite).length === 1) kinds.sprites = (kinds.sprites ?? 0) + 1;
            else unaccounted.push(`${label} (a Points drawn as pixels)`);
            continue;
          }
          if (OWN.includes(m.customProgramCacheKey())) {
            kinds.threes = (kinds.threes ?? 0) + 1;
            continue;
          }
          const twin = library.fromMaterial(m);
          if (twin?.isNodeMaterial === true && (twin.surface != null || twin.positionNode != null || twin.opacityNode != null)) kinds.twins = (kinds.twins ?? 0) + 1;
          else unaccounted.push(label);
        }
      });
      return { unaccounted, kinds };
    });
    expect(report.unaccounted).toEqual([]);
    expect(report.kinds.twins ?? 0).toBeGreaterThan(2);
    expect(errors()).toEqual([]);
  });
}

// --- Woodland at night: the fire ----------------------------------------------------------------------------------------

test.describe('Woodland at night on the node renderer: the fire and the fireflies move', () => {
  test.describe.configure({ mode: 'serial' });
  let page: Page;
  let errors: () => string[];
  test.beforeAll(async ({ browser }) => {
    test.setTimeout(150_000);
    page = await browser.newPage();
    errors = watchErrors(page);
    await boot(page, 'woodland', 'night');
    await qa(page, (q, game) => {
      q.hideFigures();
      // Where the first camp fire is seen from, as pipeline/webgpu-compare.mjs's fire view: 3.4 m back from Blue's side.
      q.aimFire = () => {
        const fire = game.session.combat.field.lights.find((l: Any) => l.kind === 'fire').position;
        const blue = game.state.characters.filter((c: Any) => c.team === 0).reduce((a: Any, c: Any, _i: number, all: Any[]) => ({ x: a.x + c.spawnPosition.x / all.length, z: a.z + c.spawnPosition.z / all.length }), { x: 0, z: 0 });
        const fx = fire.x - blue.x;
        const fz = fire.z - blue.z;
        const fl = Math.hypot(fx, fz) || 1;
        const foot = fire.y - 1;
        return { from: { x: fire.x - (fx / fl) * 3.4, y: foot + 1.5, z: fire.z - (fz / fl) * 3.4 }, to: { x: fire.x, y: foot + 0.5, z: fire.z } };
      };
    });
  });
  test.afterAll(async () => {
    await page.close();
  });

  /** Pixels that changed between successive frames of the game's own loop with only `only` drawn of the Points (and the flames when `flames`). */
  async function moving(only: string | null, flames: boolean): Promise<number[]> {
    return page.evaluate(
      async ({ only, flames }) => {
        const q = (window as Any).__qa;
        const flameMesh = q.find((o: Any) => o.name === 'fire-flames');
        const restore = q.showOnly(only);
        const wasVisible = flameMesh.visible;
        flameMesh.visible = flames;
        try {
          return await q.watch(q.aimFire);
        } finally {
          restore();
          flameMesh.visible = wasVisible;
        }
      },
      { only, flames },
    );
  }

  test('control: the flames are drawn at all (the fire view differs with and without them)', async () => {
    const drawn = await page.evaluate(async () => {
      const q = (window as Any).__qa;
      const r = (window as Any).airsoft.renderer;
      const flames = q.find((o: Any) => o.name === 'fire-flames');
      const restore = q.showOnly(null);
      const original = r.render.bind(r);
      const shot = async (visible: boolean): Promise<Uint8ClampedArray> => {
        let out: Uint8ClampedArray | null = null;
        r.render = () => {
          const { from, to } = q.aimFire();
          r.camera.position.set(from.x, from.y, from.z);
          r.camera.lookAt(to.x, to.y, to.z);
          r.camera.updateMatrixWorld();
          flames.visible = visible;
          original();
          out = new Uint8ClampedArray(q.grab());
        };
        for (let i = 0; i < 300 && !out; i++) await q.sleep(100);
        if (!out) throw new Error('the game loop did not render');
        return out;
      };
      try {
        await shot(true);
        const on = await shot(true);
        const off = await shot(false);
        return q.over(on, off, 12);
      } finally {
        r.render = original;
        restore();
        flames.visible = true;
      }
    });
    expect(drawn).toBeGreaterThan(500);
  });

  test('control: the same harness sees the embers and the fireflies move frame to frame in the game’s own loop', async () => {
    const embers = await moving('fire-embers', false);
    expect(embers.reduce((a, b) => a + b, 0)).toBeGreaterThan(200);
    const flies = await moving('fireflies', false);
    expect(flies.reduce((a, b) => a + b, 0)).toBeGreaterThan(200);
  });

  // BUG W2-QA-1 (see worldTwins.qa.test.ts): the flames' clock is an object uniform of a twin whose observer says
  // hasNode false, so after the first draw Three never sends it again: on a static mesh the flames of a camp fire neither
  // sway nor flicker on the node path (the game's clock runs, the frames do not change). Measured: with the observer's
  // hasNode set the same frames differ by a thousand pixels.
  test.fail('the flames sway and flicker: successive frames of the game’s own loop differ when only the flames are drawn', async () => {
    const diffs = await moving(null, true);
    expect(diffs.length).toBeGreaterThan(2);
    expect(diffs.reduce((a, b) => a + b, 0)).toBeGreaterThan(200);
  });

  test('draws without console or page errors', () => {
    expect(errors()).toEqual([]);
  });
});

// --- Neon Heights: the steam, the plane ---------------------------------------------------------------------------------

test.describe('Neon Heights at night on the node renderer: the steam moves, the plane follows its uniforms', () => {
  test.describe.configure({ mode: 'serial' });
  let page: Page;
  let errors: () => string[];
  test.beforeAll(async ({ browser }) => {
    test.setTimeout(150_000);
    page = await browser.newPage();
    errors = watchErrors(page);
    await boot(page, 'neonHeights', 'night');
    await qa(page, (q) => q.hideFigures());
  });
  test.afterAll(async () => {
    await page.close();
  });

  test('the steam moves frame to frame in the game’s own loop', async () => {
    const diffs = await page.evaluate(async () => {
      const q = (window as Any).__qa;
      const steam = q.find((o: Any) => o.name === 'steamPlumes');
      const restore = q.showOnly(null);
      try {
        return await q.watch(() => {
          const m = steam.instanceMatrix.array;
          return { from: { x: m[12] - 7, y: m[13] + 1, z: m[14] - 7 }, to: { x: m[12], y: m[13] + 2, z: m[14] } };
        });
      } finally {
        restore();
      }
    });
    expect(diffs.length).toBeGreaterThan(2);
    expect(diffs.reduce((a: number, b: number) => a + b, 0)).toBeGreaterThan(1000);
  });

  // BUG W2-QA-1: the passing plane is moved and shown by two uniforms the game writes each frame (skyPlane, skyPlaneUp)
  // on the tree ring's twin, which Three never sends again after the first draw: on the node path the plane never shows.
  // The game's loop is stopped here and the uniforms written as PassingPlane writes them: three places, three frames.
  test.fail('the passing plane is drawn where its uniforms put it: the frame changes with the matrix and with it hidden', async () => {
    const result = await page.evaluate(async () => {
      const q = (window as Any).__qa;
      const game = (window as Any).airsoft;
      cancelAnimationFrame(game.rafId);
      const r = game.renderer;
      const host = q.find((o: Any) => o.isMesh && o.material.customProgramCacheKey().endsWith(':sky-host'));
      const u = host.userData.skyPlane;
      const c = (team: number) => game.state.characters.filter((ch: Any) => ch.team === team)[0].spawnPosition;
      const at = { x: c(0).x + 5, y: c(0).y + 10, z: c(0).z + 5 };
      const cam = r.camera;
      cam.position.set(at.x - 14, at.y + 1, at.z);
      cam.fov = 60;
      cam.aspect = 16 / 9;
      cam.updateProjectionMatrix();
      cam.lookAt(at.x, at.y, at.z);
      cam.updateMatrixWorld();
      await q.settle();
      const place = async (dx: number, dy: number, dz: number, up: number) => {
        u.skyPlane.value.makeTranslation(at.x + dx, at.y + dy, at.z + dz);
        u.skyPlaneUp.value = up;
        r.render();
        await q.sleep(60);
        r.render();
        return new Uint8ClampedArray(q.grab());
      };
      const hidden = await place(0, 0, 0, 0);
      const shown = await place(0, 0, 0, 1);
      const moved = await place(0, 0, 4, 1);
      return { shown: q.over(hidden, shown), moved: q.over(shown, moved) };
    });
    expect(result.shown).toBeGreaterThan(500);
    expect(result.moved).toBeGreaterThan(500);
  });

  test('draws without console or page errors', () => {
    expect(errors()).toEqual([]);
  });
});

// --- Reduced motion on the node path ------------------------------------------------------------------------------------

test('Reduced motion on the node renderer: the fireflies hold still and the dust motes are not drawn', async ({ page }) => {
  test.setTimeout(150_000);
  const errors = watchErrors(page);
  await boot(page, 'woodland', 'night', { reducedMotion: 'on' });
  await qa(page, (q) => q.hideFigures());
  const result = await page.evaluate(async () => {
    const q = (window as Any).__qa;
    const motes = q.find((o: Any) => o.name === 'dustMotes');
    const flies = q.find((o: Any) => o.name === 'fireflies');
    const before = Array.from(flies.geometry.getAttribute('position').array as Float32Array);
    const restore = q.showOnly('fireflies');
    const aim = () => {
      const game = (window as Any).airsoft;
      const p = flies.geometry.getAttribute('position');
      return { from: { x: p.getX(0) - 3, y: p.getY(0) + 0.5, z: p.getZ(0) }, to: { x: p.getX(0), y: p.getY(0), z: p.getZ(0) }, game };
    };
    const diffs = await q.watch(aim, 5, 1);
    restore();
    const after = Array.from(flies.geometry.getAttribute('position').array as Float32Array);
    return { motesVisible: motes.visible, spriteOfMotes: motes.children.filter((c: Any) => c.isSprite).length, diffs, still: JSON.stringify(before) === JSON.stringify(after) };
  });
  expect(result.motesVisible).toBe(false);
  expect(result.still).toBe(true);
  expect(result.diffs.length).toBeGreaterThan(2);
  expect(result.diffs.reduce((a: number, b: number) => a + b, 0)).toBe(0);
  expect(errors()).toEqual([]);
});

test('Reduced motion on the node renderer: the steam holds still (its puffs stand where they were)', async ({ page }) => {
  test.setTimeout(150_000);
  const errors = watchErrors(page);
  await boot(page, 'neonHeights', 'night', { reducedMotion: 'on' });
  await qa(page, (q) => q.hideFigures());
  const diffs = await page.evaluate(async () => {
    const q = (window as Any).__qa;
    const steam = q.find((o: Any) => o.name === 'steamPlumes');
    const restore = q.showOnly(null);
    try {
      return await q.watch(() => {
        const m = steam.instanceMatrix.array;
        return { from: { x: m[12] - 7, y: m[13] + 1, z: m[14] - 7 }, to: { x: m[12], y: m[13] + 2, z: m[14] } };
      });
    } finally {
      restore();
    }
  });
  expect(diffs.length).toBeGreaterThan(2);
  expect(diffs.reduce((a: number, b: number) => a + b, 0)).toBe(0);
  expect(errors()).toEqual([]);
});

// --- A quality change and a lost device --------------------------------------------------------------------------------

test('a quality change mid-match and a lost device leave every sized Points a sprite twin, the library hooked once, and the old library whole', async ({ page }) => {
  test.setTimeout(240_000);
  const errors = watchErrors(page);
  await boot(page, 'woodland', 'night');
  const state = (label: string) =>
    page.evaluate((label) => {
      const q = (window as Any).__qa;
      const r = (window as Any).airsoft.renderer;
      const points = q.points().map((p: Any) => ({ name: p.name, mask: p.layers.mask, sprites: p.children.filter((c: Any) => c.isSprite).length }));
      return { label, points, count: r.node.world.sprites.count, env: r.scene.environment?.isTexture === true, canvases: document.querySelectorAll('canvas.game-canvas').length };
    }, label);
  const rendered = () => page.evaluate(() => (window as Any).airsoft.renderer.renderer.info.render.calls);
  const settled = async () => {
    const before = await rendered();
    await expect.poll(rendered, { timeout: 90_000 }).toBeGreaterThan(before + 3);
  };

  const first = await state('start');
  expect(first.points.length).toBeGreaterThanOrEqual(4);
  for (const p of first.points) expect(p, p.name).toMatchObject({ mask: 0, sprites: 1 });
  expect(first.count).toBe(first.points.length);
  expect(first.env).toBe(true);

  // Map detail, motes, the environment and the weathering off, then back on: new effects get their sprites, nothing stale.
  await page.evaluate(() => {
    const game = (window as Any).airsoft;
    game.__q = game.renderer.quality;
    game.changeQuality('custom', { ...game.__q, mapDetail: false, dustMotes: 0, environment: false, weathering: false });
  });
  await settled();
  await expect.poll(async () => (await state('plain')).env, { timeout: 60_000 }).toBe(false);
  await page.evaluate(() => (window as Any).airsoft.changeQuality('custom', (window as Any).airsoft.__q));
  await settled();
  await expect.poll(async () => (await state('back')).env, { timeout: 60_000 }).toBe(true);
  const back = await state('back');
  for (const p of back.points) expect(p, p.name).toMatchObject({ mask: 0, sprites: 1 });
  expect(back.count).toBe(back.points.length);

  // A lost device: the new renderer's library is hooked by the new world twins, the lost one's is given back whole.
  await page.evaluate(() => {
    const r = (window as Any).airsoft.renderer.renderer;
    const w = window as Any;
    w.__oldLibrary = r.library;
    w.__hooked = r.library.fromMaterial;
    document.querySelector<HTMLCanvasElement>('canvas.game-canvas')!.getContext('webgl2')!.getExtension('WEBGL_lose_context')!.loseContext();
  });
  await expect(page.locator('.graphics-notice')).toBeVisible({ timeout: 15_000 });
  await expect(page.locator('.graphics-notice')).toBeHidden({ timeout: 30_000 });
  await page.locator('.menu-pause').getByRole('button', { name: 'Resume' }).click();
  await settled();
  const after = await page.evaluate(() => {
    const w = window as Any;
    const r = w.airsoft.renderer;
    const old = w.__oldLibrary;
    const library = r.renderer.library;
    const own = (lib: Any) => Object.getPrototypeOf(lib).fromMaterial;
    const surface = w.__qa.find((o: Any) => o.isMesh && String(o.material?.customProgramCacheKey?.()).startsWith('surface:'));
    const twin = surface ? library.fromMaterial(surface.material) : null;
    return {
      differentRenderer: old !== library,
      oldRestored: old.fromMaterial === own(old),
      newHooked: library.fromMaterial !== own(library),
      surfaceTwin: twin?.isNodeMaterial === true && twin.surface != null,
      points: w.__qa.points().map((p: Any) => ({ name: p.name, mask: p.layers.mask, sprites: p.children.filter((c: Any) => c.isSprite).length })),
      count: r.node.world.sprites.count,
      canvases: document.querySelectorAll('canvas.game-canvas').length,
    };
  });
  expect(after.differentRenderer).toBe(true);
  expect(after.oldRestored).toBe(true);
  expect(after.newHooked).toBe(true);
  expect(after.surfaceTwin).toBe(true);
  for (const p of after.points) expect(p, p.name).toMatchObject({ mask: 0, sprites: 1 });
  expect(after.count).toBe(after.points.length);
  expect(after.canvases).toBe(1);
  expect(errors()).toEqual([]);
});
