import { expect, type Page, test } from '@playwright/test';

/**
 * M49: the Mode pop-up says which supply event is on by the device's clock, under Extraction (dev content, so Dev
 * settings > Dev content), and says nothing on a day with none. The clock is fixed by Playwright; timers keep running.
 */
async function openMode(page: Page): Promise<void> {
  await page.goto('/?nolock&seed=2');
  await page.waitForSelector('.menu-title-start', { timeout: 30_000 });
  await page.getByRole('button', { name: 'Start' }).click();
  const setup = page.locator('.menu-setup');
  await setup.getByRole('button', { name: /Settings/i }).click();
  const settings = page.locator('.menu-settings');
  await settings.getByRole('checkbox', { name: 'Dev settings' }).check();
  await settings.getByRole('group', { name: 'Dev content' }).getByRole('button', { name: 'On' }).click();
  await page.keyboard.press('Escape');
  await setup.getByRole('button', { name: /Mode/i }).click();
}

const extraction = (page: Page) => page.getByRole('dialog', { name: 'Game mode' }).getByRole('button', { name: /Extraction/i });

test('a Saturday shows the Supply weekend under Extraction on the Mode pop-up', async ({ page }) => {
  await page.clock.setFixedTime(new Date(2026, 9, 10, 15)); // Saturday 10 October 2026, local time
  await openMode(page);
  await expect(extraction(page).locator('.choice-note')).toBeVisible();
  await expect(extraction(page).locator('.choice-note')).toHaveText('Supply weekend, until Sunday: cases hold +25 % Field Credits and +50 % parts.');
});

test('Halloween weekend shows the dated event in its place', async ({ page }) => {
  await page.clock.setFixedTime(new Date(2026, 9, 31, 15)); // Saturday 31 October 2026
  await openMode(page);
  await expect(extraction(page).locator('.choice-note')).toHaveText('Halloween night run, until 1 Nov: cases hold +50 % Field Credits and +100 % parts.');
});

test('a Wednesday shows no event line', async ({ page }) => {
  await page.clock.setFixedTime(new Date(2026, 9, 7, 15)); // Wednesday 7 October 2026
  await openMode(page);
  await expect(extraction(page)).toBeVisible();
  await expect(extraction(page).locator('.choice-note')).toBeHidden();
});
