import { expect, test } from '@playwright/test';

/**
 * M33e QA: Woodland (dev content, so Dev settings > Dev content) loads with its bushes
 * drawn as one mesh (casting shadows where the shadow map follows the view, M33i) and the bots of its match given the same bushes, with no console error. Values are
 * read through the e2e build's `window.airsoft`, no screenshot.
 */
type Mesh = { name: string; castShadow: boolean; receiveShadow: boolean; geometry: { getAttribute: (n: string) => { count: number } } };
type Airsoft = {
  airsoft: { state: { tick: number } | null; renderer: { quality: { shadows: boolean; shadowFollowsView: boolean }; scene: { traverse: (f: (o: Mesh) => void) => void } } };
};

test('Woodland loads with its bushes drawn, in one mesh that receives shadows, and no console errors', async ({ page }) => {
  test.setTimeout(180_000);
  const errors: string[] = [];
  page.on('pageerror', (err) => errors.push(`pageerror: ${err.message}`));
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(`console: ${msg.text()}`);
  });
  await page.goto('/?nolock&seed=3');
  await page.waitForSelector('.menu-title-start', { timeout: 30_000 });
  await page.locator('.menu-title-start').click();
  const setup = page.locator('.menu-setup');

  // Dev settings > Dev content lists Woodland (M35).
  await page.locator('.menu-topbar').getByRole('button', { name: 'Settings' }).click();
  const settings = page.locator('.menu-settings');
  await settings.getByRole('checkbox', { name: 'Dev settings' }).check();
  await settings.getByRole('group', { name: 'Dev content' }).getByRole('button', { name: 'On' }).click();
  await page.keyboard.press('Escape');
  await setup.getByRole('group', { name: 'Map', exact: true }).getByRole('button', { name: /Woodland/i }).click();
  await expect(setup.locator('.play-map-line')).toContainText('Woodland');
  await setup.getByRole('button', { name: 'Start match', exact: true }).click();
  await expect(page.locator('.menus')).toBeHidden({ timeout: 20_000 });
  await expect.poll(() => page.evaluate(() => (window as unknown as Airsoft).airsoft.state?.tick ?? 0), { timeout: 60_000 }).toBeGreaterThan(10);

  // Exactly one foliage mesh holds the bushes: 80 triangles (icosphere detail 1) each, 3 vertices a triangle.
  const foliage = await page.evaluate(() => {
    // The map's meshes are a group in the renderer's scene (kept between sessions, FA11b): find the foliage by name.
    const meshes: Mesh[] = [];
    (window as unknown as Airsoft).airsoft.renderer.scene.traverse((o) => {
      if (o.name === 'map-foliage') meshes.push(o);
    });
    const q = (window as unknown as Airsoft).airsoft.renderer.quality;
    // Bushes cast shadows only where the shadow map follows the view (M33i: High; Medium's triangles go to the figures).
    const casts = q.shadows && q.shadowFollowsView;
    return meshes.map((m) => ({ castShadow: m.castShadow === casts, receiveShadow: m.receiveShadow, vertices: m.geometry.getAttribute('position').count }));
  });
  expect(foliage).toHaveLength(1);
  expect(foliage[0]!.castShadow).toBe(true);
  expect(foliage[0]!.receiveShadow).toBe(true);
  const bushes = foliage[0]!.vertices / 240;
  expect(Number.isInteger(bushes)).toBe(true);
  expect(bushes).toBeGreaterThanOrEqual(50);
  expect(errors).toEqual([]);
});

type Look = {
  airsoft: {
    renderer: { scene: { fog: { near: number; far: number; color: { getHex: () => number } }; background: { getHex: () => number }; children: { isDirectionalLight?: boolean; isPointLight?: boolean; intensity: number; name: string }[] }; renderer: { toneMappingExposure: number } };
  };
};

/**
 * M33f QA: a Woodland match is lit as night (dark haze, dim moon, the pools' meshes and no real lights on the Low the
 * software fallback runs), and leaving it for the practice range brings back the day's haze, exposure and sun (acceptance 4,
 * through the real sessions: each calls Renderer.setLighting).
 */
test('Woodland is lit by night and the practice range after it by day again', async ({ page }) => {
  test.setTimeout(240_000);
  const errors: string[] = [];
  page.on('pageerror', (err) => errors.push(`pageerror: ${err.message}`));
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(`console: ${msg.text()}`);
  });
  const look = () =>
    page.evaluate(() => {
      const r = (window as unknown as Look).airsoft.renderer;
      const sun = r.scene.children.find((o) => o.isDirectionalLight)!;
      return {
        fogNear: r.scene.fog.near,
        fogFar: r.scene.fog.far,
        fogColour: r.scene.fog.color.getHex(),
        background: r.scene.background.getHex(),
        exposure: r.renderer.toneMappingExposure,
        sun: sun.intensity,
        pools: r.scene.children.filter((o) => o.name === 'pool-glow' || o.name === 'pool-ground').map((o) => o.name).sort(),
        pointLights: r.scene.children.filter((o) => o.isPointLight).length,
      };
    });
  await page.goto('/?nolock&seed=3&quality=low');
  await page.waitForSelector('.menu-title-start', { timeout: 30_000 });
  await page.locator('.menu-title-start').click();
  const setup = page.locator('.menu-setup');
  await page.locator('.menu-topbar').getByRole('button', { name: 'Settings' }).click();
  const settings = page.locator('.menu-settings');
  await settings.getByRole('checkbox', { name: 'Dev settings' }).check();
  await settings.getByRole('group', { name: 'Dev content' }).getByRole('button', { name: 'On' }).click();
  await page.keyboard.press('Escape');
  await setup.getByRole('group', { name: 'Map', exact: true }).getByRole('button', { name: /Woodland/i }).click();
  await setup.getByRole('button', { name: 'Start match', exact: true }).click();
  await expect(page.locator('.menus')).toBeHidden({ timeout: 20_000 });
  await expect.poll(() => page.evaluate(() => (window as unknown as { airsoft: { state: { tick: number } | null } }).airsoft.state?.tick ?? 0), { timeout: 60_000 }).toBeGreaterThan(10);

  const night = await look();
  expect(night.fogFar).toBe(140);
  expect(night.fogNear).toBe(20);
  expect(night.fogColour).toBe(0x1d2b46);
  expect(night.background).toBe(0x1d2b46);
  expect(night.sun).toBeCloseTo(1.35, 5); // the night key, M52 (audit REN-02 candidate B), Woodland's 1.35 since MS1
  expect(night.pools).toEqual(['pool-glow', 'pool-ground']);
  expect(night.pointLights).toBe(0); // Low: the pools light the ground with one mesh, no real lights

  // Pause (a hidden tab does, as in the smoke test) and Quit to the title, then open the range.
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { value: true, configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  const pauseMenu = page.locator('.menu-pause');
  await expect(pauseMenu).toBeVisible({ timeout: 10_000 });
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { value: false, configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await pauseMenu.getByRole('button', { name: 'Quit' }).click();
  await page.locator('.menu-title-start').click();
  await page.locator('.menu-setup').getByRole('group', { name: 'Mode', exact: true }).getByRole('button', { name: /Practice/ }).click();
  await page.locator('.menu-setup').getByRole('button', { name: 'Start practice', exact: true }).click();
  await expect(page.locator('.range-readout')).toBeVisible({ timeout: 60_000 });
  await expect.poll(async () => (await look()).fogFar, { timeout: 30_000 }).not.toBe(140);

  const day = await look();
  expect(day.fogNear).toBe(32);
  expect(day.fogFar).toBe(210);
  expect(day.fogColour).toBe(0xd3e5f1);
  expect(day.background).toBe(day.fogColour);
  expect(day.sun).toBeGreaterThan(night.sun * 2);
  expect(day.exposure).toBeLessThan(night.exposure);
  expect(day.pools).toEqual([]);
  expect(day.pointLights).toBe(0);
  expect(errors).toEqual([]);
});

type TorchView = {
  airsoft: {
    state: { tick: number; characters: { id: number; torchOn: boolean; armament: { active: number; parts: { light?: string | null }[] } }[] } | null;
    renderer: {
      scene: { traverse: (f: (o: { name: string; isPointLight?: boolean; isSpotLight?: boolean; intensity: number }) => void) => void };
    };
  };
};

/**
 * Counts the shader programs the node renderer builds from now on (its back end builds each through `createProgram`),
 * in `programsBuilt` on the page. The renderer's own program count also falls as unused ones are let go, so a count
 * before and after could hide a build (W6a).
 */
async function countProgramsBuilt(page: import('@playwright/test').Page): Promise<void> {
  // The count starts once the match's warm-up compile is done: it builds over many frames (on a slow runner, or with the
  // CPU slowed 4x, still hundreds of ticks into the match), so its shaders are built ahead of play, not while you play.
  type Counted = {
    programsBuilt?: number;
    airsoft: {
      pictures: { scene: object };
      renderer: {
        afterCompiles(): Promise<void>;
        renderer: { backend: { createProgram: (...args: unknown[]) => unknown }; render: (scene: object, ...args: unknown[]) => unknown };
      };
    };
  };
  await page.evaluate(() => (window as unknown as Counted).airsoft.renderer.afterCompiles());
  await page.evaluate(() => {
    const w = window as unknown as Counted;
    const renderer = w.airsoft.renderer.renderer;
    const backend = renderer.backend;
    // The menus' and HUD's item pictures draw through the game's renderer too (W6a), one at a time between frames: their
    // studio's shaders are theirs, not the match's, so a draw of the pictures' scene isn't counted (a slow runner is still
    // drawing them well into the match).
    const studio = w.airsoft.pictures.scene;
    const render = renderer.render;
    let picturing = false;
    renderer.render = function (this: unknown, scene: object, ...args: unknown[]) {
      const was = picturing;
      picturing = scene === studio;
      try {
        return render.call(this, scene, ...args);
      } finally {
        picturing = was;
      }
    };
    const createProgram = backend.createProgram;
    w.programsBuilt = 0;
    backend.createProgram = function (this: unknown, ...args: unknown[]) {
      if (!picturing) w.programsBuilt = (w.programsBuilt ?? 0) + 1;
      return createProgram.apply(this, args);
    };
  });
}

/**
 * M33h QA: on Woodland with Dev content on, T switches your weapon torch (a starter, fitted by default), on Medium
 * your torch is one real spot light that takes one of the two night lights, and switching it builds no shader.
 */
test('Woodland: T switches your weapon torch, one real spot light in place of a pool light, no shader built', async ({ page }) => {
  test.setTimeout(240_000);
  const errors: string[] = [];
  page.on('pageerror', (err) => errors.push(`pageerror: ${err.message}`));
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(`console: ${msg.text()}`);
  });
  const look = () =>
    page.evaluate(() => {
      const g = (window as unknown as TorchView).airsoft;
      let points = 0;
      let spots = 0;
      let spotIntensity = 0;
      g.renderer.scene.traverse((o) => {
        if (o.isPointLight) points++;
        if (o.isSpotLight && o.name === 'torch-spot') {
          spots++;
          spotIntensity = o.intensity;
        }
      });
      return { torchOn: g.state!.characters.find((c) => c.id === 0)!.torchOn, points, spots, spotIntensity, built: (window as unknown as { programsBuilt?: number }).programsBuilt ?? 0 };
    });
  await page.goto('/?nolock&seed=3&quality=medium');
  await page.waitForSelector('.menu-title-start', { timeout: 30_000 });
  await page.locator('.menu-title-start').click();
  const setup = page.locator('.menu-setup');
  await page.locator('.menu-topbar').getByRole('button', { name: 'Settings' }).click();
  const settings = page.locator('.menu-settings');
  await settings.getByRole('checkbox', { name: 'Dev settings' }).check();
  await settings.getByRole('group', { name: 'Dev content' }).getByRole('button', { name: 'On' }).click();
  await page.keyboard.press('Escape');
  await setup.getByRole('group', { name: 'Map', exact: true }).getByRole('button', { name: /Woodland/i }).click();
  await setup.getByRole('button', { name: 'Start match', exact: true }).click();
  await expect(page.locator('.menus')).toBeHidden({ timeout: 20_000 });
  await expect.poll(() => page.evaluate(() => (window as unknown as TorchView).airsoft.state?.tick ?? 0), { timeout: 60_000 }).toBeGreaterThan(10);

  // Everyone carries a torch on Woodland with Dev content on: you your starter (fitted by default), the bots by rule.
  const carried = await page.evaluate(() => (window as unknown as TorchView).airsoft.state!.characters.map((c) => c.armament.parts[c.armament.active]?.light ?? null));
  expect(carried.length).toBeGreaterThan(1);
  expect(carried.every((l) => l === 'weaponTorch'), carried.join()).toBe(true);
  await countProgramsBuilt(page);
  const off = await look();
  expect(off.torchOn).toBe(false); // off at spawn
  expect(off.spots).toBe(1);
  expect(off.spotIntensity).toBe(0);
  expect(off.points + off.spots).toBe(2); // Medium's two night lights, one of them the torch's

  // A match's first frames under software rendering stall for 6 to 9 s (measured on G2, 5 October 2026), longer
  // on a busy machine, so the switch gets 30 s to show.
  await page.keyboard.press('t');
  await expect.poll(async () => (await look()).torchOn, { timeout: 30_000 }).toBe(true);
  await expect.poll(async () => (await look()).spotIntensity, { timeout: 30_000 }).toBeGreaterThan(0);
  const on = await look();
  expect(on.points + on.spots).toBe(2);
  expect(on.built).toBe(0);

  // Switching it off gets the same 30 s: a stall can come again on a busy machine (a 10 s wait failed there once).
  await page.keyboard.press('t');
  await expect.poll(async () => (await look()).torchOn, { timeout: 30_000 }).toBe(false);
  await expect.poll(async () => (await look()).spotIntensity, { timeout: 30_000 }).toBe(0);
  expect((await look()).points).toBe(off.points);

  // M33h QA: Depot by day with Dev content still on. The torch stays fitted in the Loadout (it counts and pays there,
  // newGamePicks.ts usedItems) but the match leaves it off every replica and the bots get none, so nothing is built for
  // torches and T does nothing (matchSession.ts fitPickedLoadout, spawnRoster).
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { value: true, configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  const pauseMenu = page.locator('.menu-pause');
  await expect(pauseMenu).toBeVisible({ timeout: 10_000 });
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { value: false, configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await pauseMenu.getByRole('button', { name: 'Quit' }).click();
  await page.locator('.menu-title-start').click();
  await setup.getByRole('group', { name: 'Map', exact: true }).getByRole('button', { name: /Depot/i }).click();
  await setup.getByRole('button', { name: 'Start match', exact: true }).click();
  await expect(page.locator('.menus')).toBeHidden({ timeout: 20_000 });
  const dayTick = () => page.evaluate(() => (window as unknown as TorchView).airsoft.state?.tick ?? 0);
  await expect.poll(dayTick, { timeout: 60_000 }).toBeGreaterThan(10);
  const dayLook = () =>
    page.evaluate(() => {
      const g = (window as unknown as TorchView).airsoft;
      const torchObjects: string[] = [];
      let spots = 0;
      g.renderer.scene.traverse((o) => {
        if (o.name.startsWith('torch-') && o.name !== 'torch-beams') torchObjects.push(o.name);
        if (o.isSpotLight) spots++;
      });
      const chars = g.state!.characters;
      return { lights: chars.flatMap((c) => c.armament.parts.map((p) => p.light ?? null)).filter((l) => l !== null), torchOn: chars.some((c) => c.torchOn), torchObjects, spots };
    });
  expect(await dayLook()).toEqual({ lights: [], torchOn: false, torchObjects: [], spots: 0 });
  await page.keyboard.press('t');
  const pressedAt = await dayTick();
  await expect.poll(dayTick, { timeout: 30_000 }).toBeGreaterThan(pressedAt + 30);
  expect(await dayLook()).toEqual({ lights: [], torchOn: false, torchObjects: [], spots: 0 });
  expect(errors).toEqual([]);
});

type LookView = {
  airsoft: {
    state: { tick: number; characters: { id: number; yaw: number; prevYaw: number }[] } | null;
    /** The player's view, which the input writes into each tick's command (game.ts, playerInput.ts). */
    input: { yaw: number; pitch: number };
    renderer: {
      camera: { matrixWorld: { elements: number[] } };
      scene: { getObjectByName: (n: string) => { visible: boolean } | undefined };
      /** One frame's draws (DrawStats, render/rendererParts.ts): the renderer's own counts are per render() call or cumulative. */
      stats: { calls: number; triangles: number; dressingTriangles: number };
    };
  };
};

/**
 * What a full turn of the view drew: the most calls and triangles in a frame (the scene's, without the GPU dressing,
 * which has a line of its own since W6a: `dressing`), the shader programs built meanwhile and how far the camera turned.
 */
type Spin = { calls: number; triangles: number; dressing: number; built: number; quadrants: number; widest: number; pitchSpan: number };

/**
 * Turns your view a full circle over `frames` frames (and nods it up and down), through the input as the mouse does (a
 * character's own yaw is overwritten by the input each tick), reading each frame's draw calls and triangles, the shader
 * programs built meanwhile, and the camera's actual direction: the compass quadrants it faced, the widest angle from
 * where it started (degrees) and the spread of its pitch (radians).
 */
async function spinView(page: import('@playwright/test').Page, frames = 48): Promise<Spin> {
  await countProgramsBuilt(page);
  return page.evaluate(async (frames) => {
    const g = (window as unknown as LookView).airsoft;
    const forward = (): [number, number, number] => {
      const e = g.renderer.camera.matrixWorld.elements;
      return [-e[8]!, -e[9]!, -e[10]!];
    };
    const start = forward();
    const startYaw = g.input.yaw;
    const quadrants = new Set<number>();
    let calls = 0;
    let triangles = 0;
    let dressing = 0;
    let widest = 0;
    let minY = Infinity;
    let maxY = -Infinity;
    for (let i = 0; i <= frames; i++) {
      g.input.yaw = startYaw + (i / frames) * Math.PI * 2;
      g.input.pitch = 0.35 * Math.sin((i / frames) * Math.PI * 4);
      await new Promise((r) => requestAnimationFrame(r));
      const stats = g.renderer.stats;
      calls = Math.max(calls, stats.calls);
      triangles = Math.max(triangles, stats.triangles - stats.dressingTriangles);
      dressing = Math.max(dressing, stats.dressingTriangles);
      const f = forward();
      quadrants.add((f[0] >= 0 ? 1 : 0) + (f[2] >= 0 ? 2 : 0));
      const flat = Math.hypot(f[0], f[2]) * Math.hypot(start[0], start[2]) || 1;
      widest = Math.max(widest, (Math.acos(Math.max(-1, Math.min(1, (f[0] * start[0] + f[2] * start[2]) / flat))) * 180) / Math.PI);
      minY = Math.min(minY, f[1]);
      maxY = Math.max(maxY, f[1]);
    }
    const built = (window as unknown as { programsBuilt?: number }).programsBuilt ?? 0;
    return { calls, triangles, dressing, built, quadrants: quadrants.size, widest, pitchSpan: Math.asin(Math.min(1, maxY)) - Math.asin(Math.max(-1, minY)) };
  }, frames);
}

/** The view really went round: every compass quadrant, all but opposite where it started, and up and down. */
function expectTurned(spin: Spin): void {
  expect(spin.quadrants).toBe(4);
  expect(spin.widest).toBeGreaterThan(170);
  expect(spin.pitchSpan).toBeGreaterThan(0.4);
}

/**
 * M33i QA: Woodland's look on Low (its 60 fps preset): the moon and stars, the camp fires' flames (no embers: Low has no
 * dust motes), within Low's 100 draw calls and 150k triangles, and no shader first built while you turn round. Since
 * M88 at 6v6, the most figures Woodland plays, after checking the map sets 5v5 and offers only 5v5 and 6v6.
 */
test('Woodland on Low at 6v6: moon, stars and fires, within 100 draw calls and 150k triangles, no shader built mid-match', async ({ page }) => {
  test.setTimeout(240_000);
  const errors: string[] = [];
  page.on('pageerror', (err) => errors.push(`pageerror: ${err.message}`));
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(`console: ${msg.text()}`);
  });
  await page.goto('/?nolock&seed=3&quality=low');
  await page.waitForSelector('.menu-title-start', { timeout: 30_000 });
  await page.locator('.menu-title-start').click();
  const setup = page.locator('.menu-setup');
  await page.locator('.menu-topbar').getByRole('button', { name: 'Settings' }).click();
  const settings = page.locator('.menu-settings');
  await settings.getByRole('checkbox', { name: 'Dev settings' }).check();
  await settings.getByRole('group', { name: 'Dev content' }).getByRole('button', { name: 'On' }).click();
  await page.keyboard.press('Escape');
  await setup.getByRole('group', { name: 'Map', exact: true }).getByRole('button', { name: /Woodland/i }).click();
  // M88 (owner, 2026-10-06): picking Woodland sets 5v5 (4v4 before), and its Team size row offers 5v5 and 6v6 only.
  await expect(setup.locator('.play-facts')).toContainText('5v5');
  const sizes = setup.locator('.match-panel').getByRole('group', { name: 'Team size' });
  await expect.poll(async () => (await sizes.locator('button.picker-button:visible').allTextContents()).map((t) => t.trim())).toEqual(['5v5', '6v6']);
  // Low holds its frame budget at the largest Woodland plays, 6v6 (M88, acceptance 3).
  await sizes.getByRole('button', { name: '6v6' }).click();
  await expect(setup.locator('.play-facts')).toContainText('6v6');
  await setup.getByRole('button', { name: 'Start match', exact: true }).click();
  await expect(page.locator('.menus')).toBeHidden({ timeout: 20_000 });
  await expect.poll(() => page.evaluate(() => (window as unknown as LookView).airsoft.state?.tick ?? 0), { timeout: 60_000 }).toBeGreaterThan(10);
  expect(await page.evaluate(() => (window as unknown as LookView).airsoft.state!.characters.length)).toBe(12);

  const parts = await page.evaluate(() => {
    const s = (window as unknown as LookView).airsoft.renderer.scene;
    return ['night-stars', 'night-moon', 'fire-flames', 'fire-embers'].map((n) => s.getObjectByName(n)?.visible ?? null);
  });
  expect(parts).toEqual([true, true, true, false]);

  // Turn a full circle, reading what each frame draws and which shaders are built.
  const spin = await spinView(page);
  console.log(`Woodland Low spin: ${JSON.stringify(spin)}`);
  expectTurned(spin);
  expect(spin.calls).toBeLessThanOrEqual(100);
  expect(spin.triangles).toBeLessThanOrEqual(150_000);
  expect(spin.dressing).toBe(0);
  expect(spin.built).toBe(0);
  expect(errors).toEqual([]);
});

/**
 * M33i QA: Medium's ceiling (140 draw calls, 200k triangles) at the largest team size, 5v5, where the figures' share is
 * the largest: the moon, stars, flames and (Medium has dust motes) embers drawn, and no shader first built while you
 * turn round at the spawn. G5 raised the line from 120: Medium's bloom draws 14 full-screen passes (the bright-pass, two
 * blurs on each of five sizes, the mix, its blend onto the picture and the output), cheap on the CPU; the world's own
 * draws stay about 110. W6a raised it to 140 with Woodland's Medium perf line (DECISIONS 2026-10-11): the grass and
 * stand-ins' two draws and the built-in models' (RM4). Still under the owner's ceiling of 150.
 */
test('Woodland on Medium at 5v5: within 140 draw calls and 200k triangles, embers on, no shader built mid-match', async ({ page }) => {
  test.setTimeout(300_000);
  const errors: string[] = [];
  page.on('pageerror', (err) => errors.push(`pageerror: ${err.message}`));
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(`console: ${msg.text()}`);
  });
  await page.goto('/?nolock&seed=3&quality=medium');
  await page.waitForSelector('.menu-title-start', { timeout: 30_000 });
  await page.locator('.menu-title-start').click();
  const setup = page.locator('.menu-setup');
  await page.locator('.menu-topbar').getByRole('button', { name: 'Settings' }).click();
  const settings = page.locator('.menu-settings');
  await settings.getByRole('checkbox', { name: 'Dev settings' }).check();
  await settings.getByRole('group', { name: 'Dev content' }).getByRole('button', { name: 'On' }).click();
  await page.keyboard.press('Escape');
  await setup.getByRole('group', { name: 'Map', exact: true }).getByRole('button', { name: /Woodland/i }).click();
  await setup.locator('.match-panel').getByRole('group', { name: 'Team size' }).getByRole('button', { name: '5v5' }).click();
  await expect(setup.locator('.play-facts')).toContainText('5v5');
  await setup.getByRole('button', { name: 'Start match', exact: true }).click();
  await expect(page.locator('.menus')).toBeHidden({ timeout: 30_000 });
  await expect.poll(() => page.evaluate(() => (window as unknown as LookView).airsoft.state?.tick ?? 0), { timeout: 90_000 }).toBeGreaterThan(10);

  const parts = await page.evaluate(() => {
    const s = (window as unknown as LookView).airsoft.renderer.scene;
    return ['night-stars', 'night-moon', 'fire-flames', 'fire-embers'].map((n) => s.getObjectByName(n)?.visible ?? null);
  });
  expect(parts).toEqual([true, true, true, true]);
  const figures = await page.evaluate(() => (window as unknown as LookView).airsoft.state!.characters.length);
  expect(figures).toBe(10);

  const spin = await spinView(page);
  console.log(`Woodland Medium 5v5 spin: ${JSON.stringify(spin)}`);
  expectTurned(spin);
  expect(spin.calls).toBeLessThanOrEqual(140);
  expect(spin.triangles).toBeLessThanOrEqual(200_000);
  // The GPU dressing at its caps, on its own line (pipeline/perf-budget.json presets.medium.dressingTriangles, W6a).
  expect(spin.dressing).toBeGreaterThan(0);
  expect(spin.dressing).toBeLessThanOrEqual(130_000);
  expect(spin.built).toBe(0);
  expect(errors).toEqual([]);
});

type SoundView = {
  airsoft: {
    state: { tick: number } | null;
    audio: { ctx: { state: string } | null; buffers: Map<string, { length: number }[]>; loops: Map<string, { length: number }> };
    session: { combat: { sfx: { bed: { loop: boolean; buffer: { length: number } }[]; scene: { fires: unknown[]; ambience: { calls: { cue: string }[] } } } } };
  };
};

/**
 * M33j QA: a Woodland match sounds like the woods at night (Dev content on): the wind and insects as beds and a crackle
 * at each camp fire are playing, the owl and every ground's steps are rendered (and only for this map), no birds, no
 * console errors. Read through the e2e build's `window.airsoft`; the memory the map's own sounds hold is reported.
 */
test('Woodland sounds like the woods at night: its beds, fires, owl and ground steps, and no console errors', async ({ page }) => {
  test.setTimeout(180_000);
  const errors: string[] = [];
  page.on('pageerror', (err) => errors.push(`pageerror: ${err.message}`));
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(`console: ${msg.text()}`);
  });
  await page.goto('/?nolock&seed=3');
  await page.waitForSelector('.menu-title-start', { timeout: 30_000 });
  await page.locator('.menu-title-start').click();
  const setup = page.locator('.menu-setup');
  await page.locator('.menu-topbar').getByRole('button', { name: 'Settings' }).click();
  const settings = page.locator('.menu-settings');
  await settings.getByRole('checkbox', { name: 'Dev settings' }).check();
  await settings.getByRole('group', { name: 'Dev content' }).getByRole('button', { name: 'On' }).click();
  await page.keyboard.press('Escape');
  await setup.getByRole('group', { name: 'Map', exact: true }).getByRole('button', { name: /Woodland/i }).click();
  await setup.getByRole('button', { name: 'Start match', exact: true }).click();
  await expect(page.locator('.menus')).toBeHidden({ timeout: 20_000 });
  await expect.poll(() => page.evaluate(() => (window as unknown as SoundView).airsoft.state?.tick ?? 0), { timeout: 60_000 }).toBeGreaterThan(10);

  const heard = await page.evaluate(() => {
    const { audio, session } = (window as unknown as SoundView).airsoft;
    const sfx = session.combat.sfx;
    const mapCues = [...audio.buffers.keys()].filter((c) => /^step\.(grass|leaves|earth|gravel|wood)\./.test(c) || c === 'ambience.owl' || c === 'ambience.creak');
    const bytes = (n: number): number => n * 4;
    const cueBytes = mapCues.reduce((sum, c) => sum + audio.buffers.get(c)!.reduce((s, b) => s + bytes(b.length), 0), 0);
    const loopBytes = [...audio.loops.values()].reduce((sum, b) => sum + bytes(b.length), 0);
    return {
      context: audio.ctx?.state ?? 'none',
      loops: [...audio.loops.keys()].sort(),
      playing: sfx.bed.filter((s) => s.loop).length,
      fires: sfx.scene.fires.length,
      calls: sfx.scene.ambience.calls.map((c) => c.cue),
      mapCues: mapCues.length,
      megabytes: (cueBytes + loopBytes) / 1e6,
    };
  });
  console.log(`Woodland's own sounds: ${heard.megabytes.toFixed(2)} MB (${heard.mapCues} cues, loops ${heard.loops.join(', ')}), context ${heard.context}`);
  expect(heard.loops).toEqual(['crackle', 'insects', 'pines']);
  expect(heard.fires).toBe(2);
  expect(heard.playing).toBe(4 + heard.fires);
  // The owl and, since M86, a branch creaking in the wind.
  expect(heard.calls).toEqual(['ambience.owl', 'ambience.creak']);
  expect(heard.mapCues).toBe(17);
  expect(heard.megabytes).toBeLessThan(7.5);
  expect(errors).toEqual([]);
});
