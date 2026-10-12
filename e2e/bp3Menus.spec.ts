import { expect, test } from '@playwright/test';

/** BP3a: New game's Start match is on screen without scrolling the page, in the small windows players have. */
for (const [width, height] of [[1280, 720], [1366, 768]] as const) {
  test(`New game's Start match is inside the ${width} x ${height} window (BP3a)`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    await page.goto('/?nolock&seed=1&quality=low');
    await page.waitForSelector('.menu-title-start', { timeout: 30_000 });
    await page.locator('.menu-title-start').click();
    const start = page.locator('.menu-setup').getByRole('button', { name: 'Start match', exact: true });
    await expect(start).toBeVisible();
    await expect
      .poll(async () => {
        const box = await start.boundingBox();
        return box !== null && box.y >= 0 && box.y + box.height <= height && box.x >= 0 && box.x + box.width <= width;
      })
      .toBe(true);
  });
}
