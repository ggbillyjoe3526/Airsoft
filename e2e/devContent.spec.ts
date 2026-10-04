import { expect, test } from '@playwright/test';

/**
 * Dev content (M35): the Dev tab's Dev content switch shows content still being built and hides it again. Woodland is
 * dev content today: with the switch off the Map pop-up doesn't list it at all; on, it is listed under Depot like any
 * other map and can be picked (M33d); off again, it is hidden and Depot plays, while the pick stays saved. A test of
 * its own, so the long match test in boot.spec.ts plays the same way as before. Uses `?nolock` like the other smoke
 * tests.
 */
test('the Dev content switch lists Woodland in the Map pop-up, lets it be picked, and hides it again', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (err) => errors.push(`pageerror: ${err.message}`));
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(`console: ${msg.text()}`);
  });
  await page.goto('/?nolock&seed=1');
  await expect(page.locator('.menu-title-start')).toBeVisible({ timeout: 30_000 });
  await page.getByRole('button', { name: 'Start' }).click();
  const setup = page.locator('.menu-setup');
  await expect(setup).toBeVisible();

  const mapDialog = page.getByRole('dialog', { name: 'Map' });
  const woodland = mapDialog.getByRole('button', { name: /Woodland/i });
  const openMap = async (): Promise<void> => {
    await setup.getByRole('button', { name: /Map/i }).click();
    await expect(mapDialog).toBeVisible();
    await expect(mapDialog.getByRole('button', { name: /Depot/i })).toHaveAttribute('aria-pressed', 'true');
  };
  const closeMap = async (): Promise<void> => {
    await page.keyboard.press('Escape');
    await expect(mapDialog).toBeHidden();
    await expect(setup).toBeVisible();
  };
  const devContent = async (on: boolean): Promise<void> => {
    await setup.getByRole('button', { name: /^Settings/ }).click();
    const settings = page.locator('.menu-settings');
    const devBox = settings.getByRole('checkbox', { name: 'Dev settings' });
    if (!(await devBox.isChecked())) await devBox.check();
    await expect(settings.getByRole('tab', { name: /^Dev$/i })).toHaveAttribute('aria-selected', 'true');
    const group = settings.getByRole('group', { name: 'Dev content' });
    await group.getByRole('button', { name: on ? 'On' : 'Off' }).click();
    await expect(group.getByRole('button', { name: on ? 'On' : 'Off' })).toHaveAttribute('aria-pressed', 'true');
    await page.keyboard.press('Escape');
    await expect(setup).toBeVisible();
  };

  // Off (the default): Woodland isn't listed at all, not even greyed out.
  await openMap();
  await expect(woodland).toBeHidden();
  await closeMap();

  // On: listed under Depot like any other map, no tag, and it can be picked (M33d).
  await devContent(true);
  await openMap();
  await expect(woodland).toBeVisible();
  await expect(woodland).toBeEnabled();
  await expect(woodland).not.toContainText('Coming soon');
  await woodland.click();
  await expect(mapDialog).toBeHidden();
  await expect(setup.getByRole('button', { name: /Map/i })).toContainText('Woodland');

  // Off again: gone, and Depot plays; the pick stays saved, so turning the switch on brings Woodland back.
  await devContent(false);
  await expect(setup.getByRole('button', { name: /Map/i })).toContainText('Depot');
  await openMap();
  await expect(woodland).toBeHidden();
  await closeMap();
  await devContent(true);
  await expect(setup.getByRole('button', { name: /Map/i })).toContainText('Woodland');

  expect(errors, errors.join(' | ')).toEqual([]);
});

/**
 * M33h: the Weapon Torch is dev content. With Dev content off (the default) the Loadout has no Light row, a Depot match
 * builds nothing for torches, and the Weapon torch key does nothing.
 */
test('with Dev content off there is no Light row, no torch in the match, and T does nothing', async ({ page }) => {
  test.setTimeout(180_000);
  const errors: string[] = [];
  page.on('pageerror', (err) => errors.push(`pageerror: ${err.message}`));
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(`console: ${msg.text()}`);
  });
  await page.goto('/?nolock&seed=1');
  await expect(page.locator('.menu-title-start')).toBeVisible({ timeout: 30_000 });
  await page.getByRole('button', { name: 'Start' }).click();
  const setup = page.locator('.menu-setup');
  await setup.getByRole('button', { name: /Loadout/i }).click();
  const loadout = page.locator('.menu-loadout');
  await loadout.getByRole('button', { name: /^Primary: AEG Rifle/ }).click({ button: 'right' });
  await expect(loadout.getByRole('group', { name: 'Optic' })).toBeVisible();
  await expect(loadout.getByRole('group', { name: 'Light' })).toHaveCount(0);
  await loadout.getByRole('button', { name: 'Back', exact: true }).click();
  await loadout.getByRole('button', { name: 'Back', exact: true }).click();
  await setup.getByRole('button', { name: 'Play', exact: true }).click();
  await expect(page.locator('.menus')).toBeHidden({ timeout: 20_000 });
  type View = { airsoft: { state: { tick: number; characters: { id: number; torchOn: boolean }[] } | null; renderer: { scene: { traverse: (f: (o: { name: string }) => void) => void } } } };
  await expect.poll(() => page.evaluate(() => (window as unknown as View).airsoft.state?.tick ?? 0), { timeout: 60_000 }).toBeGreaterThan(10);
  await page.keyboard.press('t');
  await page.waitForTimeout(500);
  const seen = await page.evaluate(() => {
    const g = (window as unknown as View).airsoft;
    const torchObjects: string[] = [];
    g.renderer.scene.traverse((o) => {
      if (o.name.startsWith('torch-') && o.name !== 'torch-beams') torchObjects.push(o.name);
    });
    return { torchOn: g.state!.characters.some((c) => c.torchOn), torchObjects };
  });
  expect(seen).toEqual({ torchOn: false, torchObjects: [] });
  expect(errors, errors.join(' | ')).toEqual([]);
});
