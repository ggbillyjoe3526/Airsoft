import { expect, test } from '@playwright/test';

/**
 * RM1 QA: the AEG and GBB pistol drawn from their Blender files, through the real game. Read through the e2e build's
 * `window.airsoft` (the viewmodel's private slots at run time), no screenshot.
 */
type Rig = { clips: Map<string, { time: number; duration: number }>; bones: { name: string; position: { x: number; y: number; z: number } }[]; rest: { position: { x: number; y: number; z: number } }[] };
type Slot = { model: { traverse: (f: (o: { isSkinnedMesh?: boolean }) => void) => void }; parts3d: Rig | null };
// The Blender files are what a fresh save draws (BD1): no setting needed.

type Game = { airsoft: { state: { tick: number } | null; session: { combat: { viewmodel: { slots: Slot[]; shownSlot: number } } } } };

test('the held AEG and GBB pistol are skinned file models, the selector turns with the fire mode, the slide kicks and locks (RM7)', async ({ page }) => {
  test.setTimeout(150_000);
  const errors: string[] = [];
  page.on('pageerror', (err) => errors.push(`pageerror: ${err.message}`));
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(`console: ${msg.text()}`);
  });
  await page.goto('/?nolock&seed=3&quality=low');
  await page.waitForSelector('.menu-title-start', { timeout: 30_000 });
  await page.locator('.menu-title-start').click();
  await page.locator('.menu-setup').getByRole('button', { name: 'Start match', exact: true }).click();
  await expect(page.locator('.menus')).toBeHidden({ timeout: 20_000 });
  await expect.poll(() => page.evaluate(() => (window as unknown as Game).airsoft.state?.tick ?? 0), { timeout: 90_000 }).toBeGreaterThan(30);

  const info = (i: number) =>
    page.evaluate((n) => {
      const slot = (window as unknown as Game).airsoft.session.combat.viewmodel.slots[n]!;
      let skinned = 0;
      slot.model.traverse((o) => o.isSkinnedMesh && skinned++);
      const rig = slot.parts3d;
      return { skinned, rig: rig !== null, bones: rig?.bones.map((b) => b.name).sort() ?? [], clips: rig ? [...rig.clips.keys()].sort() : [] };
    }, i);
  const aeg = await info(0);
  expect(aeg.rig).toBe(true);
  expect(aeg.skinned).toBeGreaterThan(0);
  expect(aeg.clips).toEqual(expect.arrayContaining(['Fire', 'Selector']));
  const pistol = await info(1);
  expect(pistol.rig).toBe(true);
  expect(pistol.skinned).toBeGreaterThan(0);
  expect(pistol.bones.join()).toMatch(/slide/);

  // The selector: the AEG starts on auto (the end of the animation); B steps it to semi, the selector turns back to half.
  const selector = () =>
    page.evaluate(() => {
      const c = (window as unknown as Game).airsoft.session.combat.viewmodel.slots[0]!.parts3d!.clips.get('Selector')!;
      return c.time / c.duration;
    });
  await expect.poll(selector, { timeout: 20_000 }).toBeCloseTo(1, 2);
  await page.keyboard.press('b');
  await expect(page.locator('.hud-mode.on')).toHaveText('S', { timeout: 10_000 });
  await expect.poll(selector, { timeout: 20_000 }).toBeCloseTo(0.5, 2);

  // The GBB pistol (slot 2, RM7): a shot kicks the slide back and it comes home; the last shot leaves it locked back until a reload.
  await page.keyboard.press('2');
  await expect.poll(() => page.evaluate(() => (window as unknown as Game).airsoft.session.combat.viewmodel.shownSlot), { timeout: 20_000 }).toBe(1);
  await page.mouse.move(640, 360);
  type Ammo = { mag: number };
  const mag = () => page.evaluate(() => (window as unknown as { airsoft: { state: { characters: { armament: { ammo: Ammo[] } }[] } } }).airsoft.state.characters[0]!.armament.ammo[1]!.mag);
  const slideAway = () =>
    page.evaluate(() => {
      const rig = (window as unknown as Game).airsoft.session.combat.viewmodel.slots[1]!.parts3d!;
      const i = rig.bones.findIndex((b) => /slide/.test(b.name));
      const p = rig.bones[i]!.position;
      const r = rig.rest[i]!.position;
      return Math.hypot(p.x - r.x, p.y - r.y, p.z - r.z);
    });
  // SwiftShader draws a frame in more than the pistol's whole 0.12 s Fire clip, so a real frame would step over the kick:
  // the viewmodel is advanced 1/60 s a frame here (the clip then plays frame by frame, as on a real machine).
  await page.evaluate(() => {
    const vm = (window as unknown as Game).airsoft.session.combat.viewmodel as unknown as { update: (dt: number, ...rest: unknown[]) => void };
    const real = vm.update.bind(vm);
    vm.update = (_dt, ...rest) => real(1 / 60, ...rest);
  });
  // Record the slide's furthest travel every frame (SwiftShader draws only a few a second).
  await page.evaluate(() => {
    const w = window as unknown as Game & { slidePeak: number };
    w.slidePeak = 0;
    const tick = (): void => {
      const rig = w.airsoft.session.combat.viewmodel.slots[1]!.parts3d!;
      const i = rig.bones.findIndex((b) => /slide/.test(b.name));
      const p = rig.bones[i]!.position;
      const r = rig.rest[i]!.position;
      w.slidePeak = Math.max(w.slidePeak, Math.hypot(p.x - r.x, p.y - r.y, p.z - r.z));
      requestAnimationFrame(tick);
    };
    tick();
  });
  const peak = () => page.evaluate(() => (window as unknown as { slidePeak: number }).slidePeak);

  // Shots do not fire during the round-start freeze: click until one takes a BB.
  const full = await mag();
  await expect
    .poll(
      async () => {
        await page.mouse.down();
        await page.mouse.up();
        return mag();
      },
      { timeout: 60_000, intervals: [500] },
    )
    .toBeLessThan(full);
  await expect.poll(peak, { timeout: 20_000 }).toBeGreaterThan(0.01);
  await expect.poll(slideAway, { timeout: 20_000 }).toBeLessThan(1e-6);

  // The last round: the slide stays locked back.
  await page.evaluate(() => {
    (window as unknown as { airsoft: { state: { characters: { armament: { ammo: Ammo[] } }[] } } }).airsoft.state.characters[0]!.armament.ammo[1]!.mag = 1;
  });
  await expect
    .poll(
      async () => {
        await page.mouse.down();
        await page.mouse.up();
        return mag();
      },
      { timeout: 60_000, intervals: [500] },
    )
    .toBe(0);
  // Locked at its full travel (0.026 m), where it stays through the reload (the game reloads on the next trigger pull)...
  await expect.poll(slideAway, { timeout: 20_000 }).toBeCloseTo(0.026, 3);
  expect(await mag()).toBe(0);
  // ...until the reload seats a full magazine, and the slide goes home.
  await page.keyboard.press('r');
  await expect.poll(mag, { timeout: 60_000 }).toBeGreaterThan(0);
  await expect.poll(slideAway, { timeout: 20_000 }).toBeLessThan(1e-6);
  expect(errors).toEqual([]);
});

test('Y turns the held AEG over (its Inspect clip plays) and a left click ends it (RM2)', async ({ page }) => {
  test.setTimeout(150_000);
  type Vm = { inspectT: number; slots: { parts3d: { clips: Map<string, { time: number }> } | null }[] };
  await page.goto('/?nolock&seed=3&quality=low');
  await page.waitForSelector('.menu-title-start', { timeout: 30_000 });
  await page.locator('.menu-title-start').click();
  await page.locator('.menu-setup').getByRole('button', { name: 'Start match', exact: true }).click();
  await expect(page.locator('.menus')).toBeHidden({ timeout: 20_000 });
  await expect.poll(() => page.evaluate(() => (window as unknown as Game).airsoft.state?.tick ?? 0), { timeout: 90_000 }).toBeGreaterThan(30);
  expect(await page.evaluate(() => (window as unknown as { airsoft: { session: { combat: { viewmodel: Vm } } } }).airsoft.session.combat.viewmodel.inspectT)).toBe(-1);

  await page.keyboard.press('y');
  await page.waitForFunction(
    () => {
      const vm = (window as unknown as { airsoft: { session: { combat: { viewmodel: Vm } } } }).airsoft.session.combat.viewmodel;
      return vm.inspectT >= 0 && (vm.slots[0]!.parts3d!.clips.get('Inspect')?.time ?? 0) > 0;
    },
    undefined,
    { timeout: 30_000 },
  );

  await page.mouse.move(640, 360);
  await page.mouse.down();
  await page.mouse.up();
  await page.waitForFunction(() => (window as unknown as { airsoft: { session: { combat: { viewmodel: Vm } } } }).airsoft.session.combat.viewmodel.inspectT === -1, undefined, { timeout: 30_000 });
});
