import { expect, test } from '@playwright/test';

/**
 * RM3: the Armory's collection pictures the power sources from their model files, and every picture fits its slot whole
 * (before, a square picture overflowed a short slot and was cropped). Read from the page, no screenshot.
 */
test('the power sources are pictured in the Armory, and no picture spills out of its slot', async ({ page }) => {
  test.setTimeout(120_000);
  const errors: string[] = [];
  page.on('pageerror', (err) => errors.push(`pageerror: ${err.message}`));
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(`console: ${msg.text()}`);
  });
  await page.goto('/?nolock&seed=3&quality=low');
  await page.waitForSelector('.menu-title-start', { timeout: 30_000 });
  await page.locator('.menu-title-start').click();
  await page.getByRole('button', { name: 'Armory', exact: true }).first().click();

  const power = page.locator('.armory-kind[data-kind="power"] .pic-slot');
  await expect(power).toHaveCount(5);
  await power.last().scrollIntoViewIfNeeded();
  await expect.poll(() => page.locator('.armory-kind[data-kind="power"] .pic-slot.has-picture').count(), { timeout: 60_000 }).toBe(5);

  const spills = await page.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>('.pic-slot.has-picture')]
      .filter((slot) => slot.offsetParent)
      .flatMap((slot) => {
        const s = slot.getBoundingClientRect();
        const i = slot.querySelector('img')!.getBoundingClientRect();
        const inside = i.left >= s.left - 0.5 && i.top >= s.top - 0.5 && i.right <= s.right + 0.5 && i.bottom <= s.bottom + 0.5;
        return inside ? [] : [`${slot.parentElement?.textContent?.slice(0, 24)}: img ${i.width.toFixed(0)}×${i.height.toFixed(0)} in ${s.width.toFixed(0)}×${s.height.toFixed(0)}`];
      }),
  );
  expect(spills).toEqual([]);
  expect(errors).toEqual([]);
});
