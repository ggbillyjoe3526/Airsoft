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

/**
 * BP6c: in a 1280 x 720 window "Your match"'s note on the rules is cut to a few lines; it fades at its foot while more
 * lies below and scrolls to the rest. At 900 x 600 Start practice's words and arrow fit on the button.
 */
test('the rules note fades while it has more, and Start practice fits a 900 px window (BP6c)', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto('/?nolock&seed=1&quality=low');
  await page.waitForSelector('.menu-title-start', { timeout: 30_000 });
  await page.locator('.menu-title-start').click();
  const note = page.locator('.play-aside .setup-rules');
  await expect(note).toHaveClass(/more-below/);
  await note.evaluate((e) => e.scrollTo(0, e.scrollHeight));
  await expect(note).not.toHaveClass(/more-below/);

  await page.setViewportSize({ width: 900, height: 600 });
  await page.locator('.menu-setup').getByRole('group', { name: 'Mode', exact: true }).getByRole('button', { name: /Practice/ }).first().click();
  const start = page.locator('.menu-setup').getByRole('button', { name: 'Start practice', exact: true });
  await expect(start).toBeVisible();
  expect(await start.evaluate((b) => b.scrollWidth - b.clientWidth)).toBeLessThanOrEqual(1);
});
