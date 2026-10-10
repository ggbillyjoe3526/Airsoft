import { expect, type Page, test } from '@playwright/test';
import { type Any, boot, coverage, expectCoverage, expectUploaded, qa, VIEWPORT, watchErrors } from './webgpuWorldHarness';

/**
 * W2 QA: the world's node twins attacked from the browser, on the node renderer's WebGL2 back end (`?forceWebGL`, the
 * e2e build only), as the game's own frame loop runs them. One match per map, its checks in turn on the one page
 * (serial; e2e/webgpuWorldHarness.ts): every patched material of the scene has a twin, the effects move (flames, embers,
 * fireflies, steam), the uniforms the game changes mid-match reach the GPU and the screen (the flames' clock, the neon
 * flicker, the passing plane), Reduced motion stills them, and a quality change or a lost device leaves the twins whole.
 * Depot by day is e2e/webgpuWorld.spec.ts.
 *
 * The bugs found (W2-QA-1: the flames and the passing plane frozen) are fixed and their tests are plain tests.
 */

test.use({ viewport: VIEWPORT });

/** One shared page per group: booted in beforeAll, closed in afterAll. */
function shared(map: string, light: string, setup: (page: Page) => Promise<void>): { page: () => Page; errors: () => string[] } {
  let page: Page;
  let errors: () => string[] = () => [];
  test.beforeAll(async ({ browser }) => {
    test.setTimeout(180_000);
    page = await browser.newPage({ viewport: VIEWPORT });
    errors = watchErrors(page);
    await boot(page, map, light);
    await setup(page);
  });
  test.afterAll(async () => {
    await page.close();
  });
  return { page: () => page, errors: () => errors() };
}

// --- Woodland at night: the fire, the fireflies, Reduced motion, a quality change and a lost device -----------------------

test.describe('Woodland at night on the node renderer', () => {
  test.describe.configure({ mode: 'serial' });
  const s = shared('woodland', 'night', (page) =>
    qa(page, (q, game) => {
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
    }),
  );

  /** Pixels that changed between successive frames of the game's own loop with only `only` drawn of the Points (and the flames when `flames`). */
  async function moving(only: string | null, flames: boolean): Promise<number[]> {
    return s.page().evaluate(
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

  test('every patched material the scene draws is a twin, Three’s own by design, or a sprite twin’s Points; the flames are a twin; stars, embers and fireflies are sprites; the sky is prefiltered', async () => {
    expectCoverage(await coverage(s.page()), { keys: ['light-fixtures-flames'], points: ['night-stars', 'fire-embers', 'fireflies'], surfaces: 2 });
  });

  test('control: the flames are drawn at all (the fire view differs with and without them)', async () => {
    const drawn = await s.page().evaluate(async () => {
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

  // W2-QA-1 (fixed; see worldTwins.qa.test.ts): the flames' clock is an object uniform of a twin, sent again on every
  // draw only because the twin's observer says it holds nodes; without that the flames of a camp fire neither sway nor
  // flicker on the node path (the game's clock runs, the frames do not change).
  test('the flames sway and flicker: successive frames of the game’s own loop differ when only the flames are drawn', async () => {
    const diffs = await moving(null, true);
    expect(diffs.length).toBeGreaterThan(2);
    expect(diffs.reduce((a, b) => a + b, 0)).toBeGreaterThan(200);
  });

  test('Reduced motion: the fireflies hold still and the dust motes are not drawn', async () => {
    const result = await s.page().evaluate(async () => {
      const q = (window as Any).__qa;
      q.reduceMotion(true);
      await q.sleep(300);
      const motes = q.find((o: Any) => o.name === 'dustMotes');
      const flies = q.find((o: Any) => o.name === 'fireflies');
      const before = Array.from(flies.geometry.getAttribute('position').array as Float32Array);
      const restore = q.showOnly('fireflies');
      const aim = () => {
        const p = flies.geometry.getAttribute('position');
        return { from: { x: p.getX(0) - 3, y: p.getY(0) + 0.5, z: p.getZ(0) }, to: { x: p.getX(0), y: p.getY(0), z: p.getZ(0) } };
      };
      const diffs = await q.watch(aim, 5, 1);
      restore();
      const after = Array.from(flies.geometry.getAttribute('position').array as Float32Array);
      const out = { motesVisible: motes.visible, diffs, still: JSON.stringify(before) === JSON.stringify(after) };
      q.reduceMotion(false);
      return out;
    });
    expect(result.motesVisible).toBe(false);
    expect(result.still).toBe(true);
    expect(result.diffs.length).toBeGreaterThan(2);
    expect(result.diffs.reduce((a: number, b: number) => a + b, 0)).toBe(0);
  });

  // W5: the particles moved by compute passes, Woodland's grass and tree stand-ins drawn on High, freed when Map detail
  // goes off mid-match and made again when it comes back.
  test('compute: every particle pool has its driver and a spawn draws; the grass and stand-ins draw on High and go with Map detail', async () => {
    test.setTimeout(150_000);
    const page = s.page();
    const particles = await page.evaluate(async () => {
      const q = (window as Any).__qa;
      const r = (window as Any).airsoft.renderer;
      const tagged: Any[] = [];
      r.scene.traverse((o: Any) => {
        // Each pool's CPU module (render/gpuPools.ts), as the node renderer's particle drivers find it.
        const owner = r.node.particles.ownerOf(o);
        if (owner) tagged.push({ name: o.name, owner, o });
      });
      const puffs = tagged.find((t) => Array.isArray(t.owner.puffs) && t.o.children.some((c: Any) => c.name.endsWith('-gpu')));
      const draw = puffs.o.children.find((c: Any) => c.name.endsWith('-gpu'));
      // An ImpactPuffs pool (its `puffs` slots). What the draw holds right after the driver's own update in the game's frame (a slow frame can outlive a puff,
      // so sampling between frames may miss it).
      const gpu = puffs.owner.gpu;
      const update = gpu.update.bind(gpu);
      let drawn = 0;
      gpu.update = (dt: number, camera: Any) => {
        update(dt, camera);
        drawn = Math.max(drawn, draw.geometry.instanceCount);
      };
      const eye = r.camera.position;
      puffs.owner.spawn({ x: eye.x, y: eye.y, z: eye.z - 2 });
      for (let i = 0; i < 600 && drawn === 0; i++) await q.sleep(100);
      delete gpu.update;
      return { drivers: r.node.particles.count, tagged: tagged.length, driven: tagged.filter((t) => t.owner.gpu).length, drawn };
    });
    expect(particles.drivers).toBe(particles.tagged);
    expect(particles.driven).toBe(particles.tagged);
    expect(particles.tagged).toBeGreaterThanOrEqual(5);
    expect(particles.drawn).toBeGreaterThan(0);

    const dressing = () =>
      page.evaluate(() => {
        const r = (window as Any).airsoft.renderer;
        return { ...r.node.dressing.counts, meshes: ['grass-gpu', 'forest-gpu'].filter((n) => r.scene.getObjectByName(n)).length };
      });
    await expect.poll(dressing, { timeout: 30_000 }).toEqual({ grass: 93_696, forest: 1_400, meshes: 2 });

    // The grass is drawn: a low view over Blue's meadow differs with and without it.
    const grass = await page.evaluate(async () => {
      const q = (window as Any).__qa;
      const game = (window as Any).airsoft;
      const r = game.renderer;
      const mesh = r.scene.getObjectByName('grass-gpu');
      const blue = game.state.characters.filter((c: Any) => c.team === 0).reduce((a: Any, c: Any, _i: number, all: Any[]) => ({ x: a.x + c.spawnPosition.x / all.length, z: a.z + c.spawnPosition.z / all.length }), { x: 0, z: 0 });
      const original = r.render.bind(r);
      const shot = async (visible: boolean): Promise<Uint8ClampedArray> => {
        let out: Uint8ClampedArray | null = null;
        r.render = () => {
          r.camera.position.set(blue.x * 0.8, 1.2, blue.z * 0.8);
          r.camera.lookAt(0, 0, 0);
          r.camera.updateMatrixWorld();
          mesh.visible = visible;
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
        mesh.visible = true;
      }
    });
    expect(grass).toBeGreaterThan(2_000);

    await page.evaluate(() => {
      const game = (window as Any).airsoft;
      game.__w5 = game.renderer.quality;
      game.changeQuality('custom', { ...game.__w5, mapDetail: false });
    });
    await expect.poll(dressing, { timeout: 30_000 }).toEqual({ grass: 0, forest: 0, meshes: 0 });
    await page.evaluate(() => (window as Any).airsoft.changeQuality('high', (window as Any).airsoft.__w5));
    await expect.poll(dressing, { timeout: 30_000 }).toEqual({ grass: 93_696, forest: 1_400, meshes: 2 });
  });

  test('a quality change mid-match and a lost device leave every sized Points a sprite twin, the library hooked once, and the old library whole', async () => {
    test.setTimeout(240_000);
    const page = s.page();
    const state = (label: string) =>
      page.evaluate((label) => {
        const q = (window as Any).__qa;
        const r = (window as Any).airsoft.renderer;
        const points = q.points().map((p: Any) => ({ name: p.name, mask: p.layers.mask, sprites: p.children.filter((c: Any) => c.isSprite).length }));
        // The motes and fireflies are drawn by their compute drivers (W5), not by a CPU-fed twin.
        return { label, points, count: r.node.world.sprites.count + q.points().filter((p: Any) => r.node.particles.claims(p) && r.node.particles.ownerOf(p)?.gpu).length, env: r.scene.environment?.isTexture === true, canvases: document.querySelectorAll('canvas.game-canvas').length };
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
        count: r.node.world.sprites.count + w.__qa.points().filter((p: Any) => r.node.particles.claims(p) && r.node.particles.ownerOf(p)?.gpu).length,
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
  });

  // W2-QA-1: the fires' clock (fxTime), read back from the flames' uniform buffer frame by frame (on the renderer that
  // replaced the lost one). Stops the game's loop: the last check of the page.
  test('the flames’ clock reaches the GPU on every frame', async () => {
    await expectUploaded(s.page(), { mesh: 'fire-flames', name: 'fxTime', values: [[3.25], [7.5]] });
  });

  test('draws without console or page errors', () => {
    expect(s.errors()).toEqual([]);
  });
});

// --- Neon Heights at night: the steam, Reduced motion, the plane, the neon flicker ----------------------------------------

test.describe('Neon Heights at night on the node renderer', () => {
  test.describe.configure({ mode: 'serial' });
  const s = shared('neonHeights', 'night', (page) => qa(page, (q) => q.hideFigures()));

  /** Pixels that changed between successive frames of the game's own loop, looking at the first steam vent. */
  const steamDiffs = (): Promise<number[]> =>
    s.page().evaluate(async () => {
      const q = (window as Any).__qa;
      const steam = q.find((o: Any) => o.name === 'steamPlumes');
      const restore = q.showOnly(null);
      try {
        // The first vent, from 4 m off (its puffs' matrices are the compute pass's since W5, not written on the CPU).
        const v = (window as Any).airsoft.renderer.node.particles.ownerOf(steam).sources[0];
        return await q.watch(() => ({ from: { x: v.x - 4, y: v.y + 1.5, z: v.z - 4 }, to: { x: v.x, y: v.y + 1.2, z: v.z } }));
      } finally {
        restore();
      }
    });

  test('every patched material the scene draws is a twin, Three’s own by design, or a sprite twin’s Points; the steam and the sky host are twins; the stars are sprites; the sky is prefiltered', async () => {
    expectCoverage(await coverage(s.page()), { keys: ['smoke-plumes', 'without-environment:sky-host'], points: ['night-stars'], surfaces: 2 });
  });

  test('the steam moves frame to frame in the game’s own loop', async () => {
    const diffs = await steamDiffs();
    expect(diffs.length).toBeGreaterThan(2);
    expect(diffs.reduce((a: number, b: number) => a + b, 0)).toBeGreaterThan(1000);
  });

  test('Reduced motion: the steam holds still (its puffs stand where they were)', async () => {
    await qa(s.page(), async (q) => {
      q.reduceMotion(true);
      await q.sleep(300);
    });
    const diffs = await steamDiffs();
    await qa(s.page(), (q) => q.reduceMotion(false));
    expect(diffs.length).toBeGreaterThan(2);
    expect(diffs.reduce((a: number, b: number) => a + b, 0)).toBe(0);
  });

  // W2-QA-1 (fixed): the passing plane is moved and shown by two uniforms the game writes each frame (skyPlane,
  // skyPlaneUp) on the tree ring's twin, which must reach the GPU on every draw for the plane to show and move.
  // The game's loop is stopped here and the uniforms written as PassingPlane writes them: three places, three frames.
  test('the passing plane is drawn where its uniforms put it: the frame changes with the matrix and with it hidden', async () => {
    const result = await s.page().evaluate(async () => {
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

  // W2-QA-1: the neon tubes' three flicker channels, read back from the junk's uniform buffer frame by frame.
  test('the neon flicker reaches the GPU on every frame', async () => {
    await expectUploaded(s.page(), { mesh: 'map-junk', name: 'neonFlicker', values: [[0.2, 0.45, 0.7], [0.9, 0.15, 0.55]] });
  });

  test('draws without console or page errors', () => {
    expect(s.errors()).toEqual([]);
  });
});
