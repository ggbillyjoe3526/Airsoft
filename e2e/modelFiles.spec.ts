import { expect, test } from '@playwright/test';

/** BD1: a fresh save fetches the Blender model files as the game starts, and the held AEG is the Blender model. */
test('a fresh save fetches the model files and plays the Blender replica models', async ({ page }) => {
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
  expect(await page.evaluate(() => (window as unknown as Game).airsoft.session.combat.viewmodel.slots[0]!.parts3d)).not.toBeNull();
  for (const file of ['human', 'robot', 'aeg']) expect(glbs.some((url) => new RegExp(`/${file}[-.][^/]*\\.glb`).test(url)), file).toBe(true);
});

test('the Armory power pictures show the Blender models on a fresh save', async ({ page }) => {
  test.setTimeout(150_000);
  await page.goto('/?nolock&seed=3&quality=low');
  await page.waitForSelector('.menu-title-start', { timeout: 30_000 });
  await page.locator('.menu-title-start').click();
  const power = page.locator('.armory-levels .armory-item[data-kind="power"] .pic-slot');
  const pictured = page.locator('.armory-levels .armory-item[data-kind="power"] .pic-slot.has-picture');
  await page.getByRole('button', { name: 'Armory', exact: true }).first().click();
  await expect(power).toHaveCount(5);
  await power.last().scrollIntoViewIfNeeded();
  await expect.poll(() => pictured.count(), { timeout: 60_000 }).toBe(5);
});
