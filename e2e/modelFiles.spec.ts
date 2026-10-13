import { expect, test } from '@playwright/test';

/** RM4 QA: a fresh save fetches no model file, and the held AEG is the built-in model. */
test('a fresh save fetches no .glb and plays the built-in replica models', async ({ page }) => {
  test.setTimeout(150_000);
  const glbs: string[] = [];
  page.on('request', (req) => {
    if (/\.glb(\?|$)/.test(req.url())) glbs.push(req.url());
  });
  await page.goto('/?nolock&seed=3&quality=low');
  await page.waitForSelector('.menu-title-start', { timeout: 30_000 });
  await page.locator('.menu-title-start').click();
  await page.locator('.menu-setup').getByRole('button', { name: 'Start match', exact: true }).click();
  await expect(page.locator('.menus')).toBeHidden({ timeout: 20_000 });
  type Game = { airsoft: { state: { tick: number } | null; session: { combat: { viewmodel: { slots: { parts3d: unknown }[] } } } } };
  await expect.poll(() => page.evaluate(() => (window as unknown as Game).airsoft.state?.tick ?? 0), { timeout: 90_000 }).toBeGreaterThan(30);
  expect(await page.evaluate(() => (window as unknown as Game).airsoft.session.combat.viewmodel.slots[0]!.parts3d)).toBeNull();
  expect(glbs).toEqual([]);
});

test('the Armory power pictures appear only once "Disable all models" is turned Off in the Dev tab', async ({ page }) => {
  test.setTimeout(150_000);
  await page.goto('/?nolock&seed=3&quality=low');
  await page.waitForSelector('.menu-title-start', { timeout: 30_000 });
  await page.locator('.menu-title-start').click();
  const power = page.locator('.armory-levels .armory-item[data-kind="power"] .pic-slot');
  const pictured = page.locator('.armory-levels .armory-item[data-kind="power"] .pic-slot.has-picture');
  await page.getByRole('button', { name: 'Armory', exact: true }).first().click();
  await expect(power).toHaveCount(5);
  await power.last().scrollIntoViewIfNeeded();
  await page.waitForTimeout(3000); // a short wait for pictures that must not come
  expect(await pictured.count()).toBe(0);

  await page.locator('.menu-topbar').getByRole('button', { name: 'Settings' }).click();
  const settings = page.locator('.menu-settings');
  await settings.getByRole('checkbox', { name: 'Dev settings' }).check();
  const group = settings.getByRole('group', { name: 'Disable all models' });
  await group.getByRole('button', { name: 'Off' }).click();
  await expect(group.getByRole('button', { name: 'Off' })).toHaveAttribute('aria-pressed', 'true');
  await page.keyboard.press('Escape');
  await page.locator('.menu-title-start').click();
  await page.getByRole('button', { name: 'Armory', exact: true }).first().click();
  await expect(power).toHaveCount(5);
  await power.last().scrollIntoViewIfNeeded();
  await expect.poll(() => pictured.count(), { timeout: 60_000 }).toBe(5);
});
