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
  await page.getByRole('button', { name: 'Start' }).click();
  const setup = page.locator('.menu-setup');

  // Dev settings > Dev content lists Woodland (M35).
  await setup.getByRole('button', { name: /Settings/i }).click();
  const settings = page.locator('.menu-settings');
  await settings.getByRole('checkbox', { name: 'Dev settings' }).check();
  await settings.getByRole('group', { name: 'Dev content' }).getByRole('button', { name: 'On' }).click();
  await page.keyboard.press('Escape');
  await setup.getByRole('button', { name: /Map/i }).click();
  const mapDialog = page.getByRole('dialog', { name: 'Map' });
  await mapDialog.getByRole('button', { name: /Woodland/i }).click();
  await expect(setup.getByRole('button', { name: /Map/i })).toContainText('Woodland');
  await setup.getByRole('button', { name: 'Play', exact: true }).click();
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
  await page.getByRole('button', { name: 'Start' }).click();
  const setup = page.locator('.menu-setup');
  await setup.getByRole('button', { name: /Settings/i }).click();
  const settings = page.locator('.menu-settings');
  await settings.getByRole('checkbox', { name: 'Dev settings' }).check();
  await settings.getByRole('group', { name: 'Dev content' }).getByRole('button', { name: 'On' }).click();
  await page.keyboard.press('Escape');
  await setup.getByRole('button', { name: /Map/i }).click();
  await page.getByRole('dialog', { name: 'Map' }).getByRole('button', { name: /Woodland/i }).click();
  await setup.getByRole('button', { name: 'Play', exact: true }).click();
  await expect(page.locator('.menus')).toBeHidden({ timeout: 20_000 });
  await expect.poll(() => page.evaluate(() => (window as unknown as { airsoft: { state: { tick: number } | null } }).airsoft.state?.tick ?? 0), { timeout: 60_000 }).toBeGreaterThan(10);

  const night = await look();
  expect(night.fogFar).toBe(140);
  expect(night.fogNear).toBe(20);
  expect(night.fogColour).toBe(0x1d2b46);
  expect(night.background).toBe(0x1d2b46);
  expect(night.sun).toBeCloseTo(0.6, 5);
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
  await page.getByRole('button', { name: 'Practice Range' }).click();
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
      renderer: { info: { programs: unknown[] | null } };
    };
  };
};

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
      return { torchOn: g.state!.characters.find((c) => c.id === 0)!.torchOn, points, spots, spotIntensity, programs: g.renderer.renderer.info.programs?.length ?? 0 };
    });
  await page.goto('/?nolock&seed=3&quality=medium');
  await page.waitForSelector('.menu-title-start', { timeout: 30_000 });
  await page.getByRole('button', { name: 'Start' }).click();
  const setup = page.locator('.menu-setup');
  await setup.getByRole('button', { name: /Settings/i }).click();
  const settings = page.locator('.menu-settings');
  await settings.getByRole('checkbox', { name: 'Dev settings' }).check();
  await settings.getByRole('group', { name: 'Dev content' }).getByRole('button', { name: 'On' }).click();
  await page.keyboard.press('Escape');
  await setup.getByRole('button', { name: /Map/i }).click();
  await page.getByRole('dialog', { name: 'Map' }).getByRole('button', { name: /Woodland/i }).click();
  await setup.getByRole('button', { name: 'Play', exact: true }).click();
  await expect(page.locator('.menus')).toBeHidden({ timeout: 20_000 });
  await expect.poll(() => page.evaluate(() => (window as unknown as TorchView).airsoft.state?.tick ?? 0), { timeout: 60_000 }).toBeGreaterThan(10);

  // Everyone carries a torch on Woodland with Dev content on: you your starter (fitted by default), the bots by rule.
  const carried = await page.evaluate(() => (window as unknown as TorchView).airsoft.state!.characters.map((c) => c.armament.parts[c.armament.active]?.light ?? null));
  expect(carried.length).toBeGreaterThan(1);
  expect(carried.every((l) => l === 'weaponTorch'), carried.join()).toBe(true);
  const off = await look();
  expect(off.torchOn).toBe(false); // off at spawn
  expect(off.spots).toBe(1);
  expect(off.spotIntensity).toBe(0);
  expect(off.points + off.spots).toBe(2); // Medium's two night lights, one of them the torch's

  await page.keyboard.press('t');
  await expect.poll(async () => (await look()).torchOn, { timeout: 10_000 }).toBe(true);
  await expect.poll(async () => (await look()).spotIntensity, { timeout: 10_000 }).toBeGreaterThan(0);
  const on = await look();
  expect(on.points + on.spots).toBe(2);
  expect(on.programs).toBe(off.programs);

  await page.keyboard.press('t');
  await expect.poll(async () => (await look()).torchOn, { timeout: 10_000 }).toBe(false);
  await expect.poll(async () => (await look()).spotIntensity, { timeout: 10_000 }).toBe(0);
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
  await page.getByRole('button', { name: 'Start' }).click();
  await setup.getByRole('button', { name: /Map/i }).click();
  await page.getByRole('dialog', { name: 'Map' }).getByRole('button', { name: /Depot/i }).click();
  await setup.getByRole('button', { name: 'Play', exact: true }).click();
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
    renderer: {
      scene: { getObjectByName: (n: string) => { visible: boolean } | undefined };
      renderer: { info: { programs: unknown[] | null; render: { calls: number; triangles: number } } };
    };
  };
};

/**
 * M33i QA: Woodland's look on Low (its 60 fps preset): the moon and stars, the camp fires' flames (no embers: Low has no
 * dust motes), within Low's 100 draw calls and 150k triangles, and no shader first built while you turn round.
 */
test('Woodland on Low: moon, stars and fires, within 100 draw calls and 150k triangles, no shader built mid-match', async ({ page }) => {
  test.setTimeout(240_000);
  const errors: string[] = [];
  page.on('pageerror', (err) => errors.push(`pageerror: ${err.message}`));
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(`console: ${msg.text()}`);
  });
  await page.goto('/?nolock&seed=3&quality=low');
  await page.waitForSelector('.menu-title-start', { timeout: 30_000 });
  await page.getByRole('button', { name: 'Start' }).click();
  const setup = page.locator('.menu-setup');
  await setup.getByRole('button', { name: /Settings/i }).click();
  const settings = page.locator('.menu-settings');
  await settings.getByRole('checkbox', { name: 'Dev settings' }).check();
  await settings.getByRole('group', { name: 'Dev content' }).getByRole('button', { name: 'On' }).click();
  await page.keyboard.press('Escape');
  await setup.getByRole('button', { name: /Map/i }).click();
  await page.getByRole('dialog', { name: 'Map' }).getByRole('button', { name: /Woodland/i }).click();
  await setup.getByRole('button', { name: 'Play', exact: true }).click();
  await expect(page.locator('.menus')).toBeHidden({ timeout: 20_000 });
  await expect.poll(() => page.evaluate(() => (window as unknown as LookView).airsoft.state?.tick ?? 0), { timeout: 60_000 }).toBeGreaterThan(10);

  const parts = await page.evaluate(() => {
    const s = (window as unknown as LookView).airsoft.renderer.scene;
    return ['night-stars', 'night-moon', 'fire-flames', 'fire-embers'].map((n) => s.getObjectByName(n)?.visible ?? null);
  });
  expect(parts).toEqual([true, true, true, false]);

  // Turn a full circle over a second and a half, reading what each frame draws and which shaders exist.
  const spin = await page.evaluate(async () => {
    const g = (window as unknown as LookView).airsoft;
    const info = g.renderer.renderer.info;
    const me = g.state!.characters.find((c) => c.id === 0)!;
    const programs = info.programs?.length ?? 0;
    let calls = 0;
    let triangles = 0;
    const frames = 90;
    for (let i = 0; i < frames; i++) {
      me.yaw = (i / frames) * Math.PI * 2;
      me.prevYaw = me.yaw;
      await new Promise((r) => requestAnimationFrame(r));
      calls = Math.max(calls, info.render.calls);
      triangles = Math.max(triangles, info.render.triangles);
    }
    return { calls, triangles, before: programs, after: info.programs?.length ?? 0 };
  });
  expect(spin.calls).toBeLessThanOrEqual(100);
  expect(spin.triangles).toBeLessThanOrEqual(150_000);
  expect(spin.after).toBe(spin.before);
  expect(errors).toEqual([]);
});
