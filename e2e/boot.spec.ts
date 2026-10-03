import { expect, test } from '@playwright/test';

/**
 * Smoke test: the built game boots, starts a match with a red dot fitted, fires, reloads, moves the fire selector,
 * aims down the sight and keeps running without a page error.
 *
 * Uses `?nolock` (no pointer lock; automated browsers can't take it): the fire button and wheel work without
 * the lock there, but the real lock flow, mouse look and Esc to pause stay manual tests. SwiftShader draws only
 * a few frames a second, so the simulation runs slower than real time: assert on page text, never on frames,
 * and poll rather than wait fixed times.
 */
test('the game boots, starts a match, fires, reloads and aims without errors', async ({ page }, testInfo) => {
  const errors: string[] = [];
  page.on('pageerror', (err) => errors.push(`pageerror: ${err.message}`));
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(`console: ${msg.text()}`);
  });
  const errorList = () => (errors.length > 0 ? errors.join(' | ') : 'none');

  await page.goto('/?nolock&seed=1');
  // Wait for the start screen or the boot's own failure text, whichever comes first.
  await page.waitForFunction(
    () => document.querySelector('.start-play') !== null || /Failed/.test(document.getElementById('loading')?.textContent ?? ''),
    undefined,
    { timeout: 30_000 },
  ).catch(() => undefined);
  if ((await page.locator('.start-play').count()) === 0) {
    const loading = (await page.locator('#loading').textContent().catch(() => null)) ?? '(gone)';
    throw new Error(`The start screen never appeared. Loading text: "${loading}". Page errors: ${errorList()}`);
  }
  await expect(page.locator('.start-play')).toBeVisible();
  await expect(page.locator('#loading')).toHaveCount(0);
  await expect(page.locator('.start-goal')).not.toBeEmpty();

  // Fit the red dot before the match (the optic picker on the start screen).
  await page.getByRole('button', { name: 'Red dot' }).click();
  await expect(page.getByRole('button', { name: 'Red dot' })).toHaveAttribute('aria-pressed', 'true');

  await page.locator('.start-play').click();
  await expect(page.locator('.start-screen')).toBeHidden({ timeout: 10_000 });
  await expect(page.locator('.hud')).toBeVisible();
  await expect(page.locator('.hud-replica-name')).toHaveText(/AEG rifle/i);
  const mag = page.locator('.hud-mag');
  await expect(mag).toHaveText(/^\d+$/);
  const full = Number(await mag.textContent());

  // Fire: hold the button until the magazine count drops.
  await page.mouse.move(640, 360);
  await page.mouse.down();
  await expect.poll(async () => Number(await mag.textContent()), { timeout: 20_000 }).toBeLessThan(full);
  await page.mouse.up();

  // Reload: the half-used magazine goes back in the pouch and a full one comes out.
  await page.keyboard.press('r');
  await expect.poll(async () => Number(await mag.textContent()), { timeout: 30_000 }).toBe(full);

  // Fire selector: the AEG starts on auto, and B steps it to single (semi).
  const fireMode = page.locator('.hud-firemode');
  await expect(fireMode).toHaveText('Auto');
  await page.keyboard.press('b');
  await expect(fireMode).toHaveText('Semi', { timeout: 10_000 });

  await testInfo.attach('in-match', { body: await page.screenshot(), contentType: 'image/png' });

  // Aim down the red dot: hold the right button and the HUD swaps the crosshair for the dot; let go and it's back.
  const hud = page.locator('.hud');
  await page.mouse.down({ button: 'right' });
  await expect(hud).toHaveClass(/\baiming\b/, { timeout: 10_000 });
  await expect(page.locator('.hud-reddot')).toBeVisible();
  await testInfo.attach('aiming', { body: await page.screenshot(), contentType: 'image/png' });
  await page.mouse.up({ button: 'right' });
  await expect(hud).not.toHaveClass(/\baiming\b/, { timeout: 10_000 });
  expect(errors, `Page errors: ${errorList()}`).toEqual([]);
});
