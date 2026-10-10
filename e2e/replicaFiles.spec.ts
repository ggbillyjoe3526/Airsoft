import { expect, test } from '@playwright/test';

/**
 * RM1 QA: the AEG and gas pistol drawn from their Blender files, through the real game. Read through the e2e build's
 * `window.airsoft` (the viewmodel's private slots at run time), no screenshot.
 */
type Rig = { clips: Map<string, { time: number; duration: number }>; bones: { name: string; position: { x: number; y: number; z: number } }[]; rest: { position: { x: number; y: number; z: number } }[] };
type Slot = { model: { traverse: (f: (o: { isSkinnedMesh?: boolean }) => void) => void }; parts3d: Rig | null };
type Game = { airsoft: { state: { tick: number } | null; session: { combat: { viewmodel: { slots: Slot[]; shownSlot: number } } } } };

test('the held AEG and gas pistol are skinned file models, the selector turns with the fire mode, the slide rests', async ({ page }) => {
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
  await expect(page.locator('.hud-mode.on')).toHaveText('Semi', { timeout: 10_000 });
  await expect.poll(selector, { timeout: 20_000 }).toBeCloseTo(0.5, 2);

  // The gas pistol (slot 2) is never fired through a clip of the slide: its slide bone stays at rest after a reload.
  await page.keyboard.press('2');
  await page.keyboard.press('t');
  await expect.poll(() => page.evaluate(() => (window as unknown as Game).airsoft.session.combat.viewmodel.shownSlot), { timeout: 20_000 }).toBe(1);
  await page.mouse.move(640, 360);
  await page.mouse.down();
  await page.mouse.up();
  const slideAtRest = () =>
    page.evaluate(() => {
      const rig = (window as unknown as Game).airsoft.session.combat.viewmodel.slots[1]!.parts3d!;
      const i = rig.bones.findIndex((b) => /slide/.test(b.name));
      const p = rig.bones[i]!.position;
      const r = rig.rest[i]!.position;
      return Math.hypot(p.x - r.x, p.y - r.y, p.z - r.z);
    });
  await expect.poll(slideAtRest, { timeout: 20_000 }).toBeLessThan(1e-6);
  expect(errors).toEqual([]);
});
