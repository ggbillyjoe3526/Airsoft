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
