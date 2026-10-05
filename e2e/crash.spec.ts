import { expect, test } from '@playwright/test';

/**
 * Crash handling (audit CORE-04, UI-02, CORE-28): an error in the game loop stops the game once and shows the "Something
 * went wrong" pane with a report to copy; a start-up failure shows the same pane, with advice when there's no WebGL.
 * Errors are expected here, so unlike boot.spec.ts these tests count them instead of asserting there are none.
 */

type Airsoft = { airsoft: { state: { tick: number } | null; session: { advance: (dt: number) => number } } };

test('an error in play stops the game once, gives the controls back and shows a report to copy', async ({ page }) => {
  test.setTimeout(120_000);
  const pageErrors: string[] = [];
  page.on('pageerror', (err) => pageErrors.push(err.message));
  let consoleErrors = 0;
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors++;
  });
  await page.goto('/?nolock&seed=7');
  await page.waitForSelector('.menu-title-start', { timeout: 30_000 });
  await page.getByRole('button', { name: 'Start' }).click();
  await page.locator('.menu-setup').getByRole('button', { name: 'Play', exact: true }).click();
  await expect(page.locator('.menus')).toBeHidden({ timeout: 10_000 });
  await expect.poll(() => page.evaluate(() => (window as unknown as Airsoft).airsoft.state?.tick ?? 0), { timeout: 30_000 }).toBeGreaterThan(10);
  expect(consoleErrors).toBe(0);

  // Something in the frame throws: the simulation's step, here.
  await page.evaluate(() => {
    (window as unknown as Airsoft).airsoft.session.advance = () => {
      throw new TypeError('test crash in advance');
    };
  });
  const pane = page.locator('.crash-screen');
  await expect(pane).toBeVisible({ timeout: 10_000 });
  await expect(pane.getByRole('heading')).toHaveText(/Something went wrong/i);
  await expect(pane.getByRole('button', { name: 'Reload' })).toBeFocused();
  const report = await pane.getByRole('textbox', { name: 'Error report' }).inputValue();
  expect(report).toContain('Seed: 7');
  expect(report).toContain('Map: ');
  expect(report).toMatch(/Tick: \d+/);
  expect(report).toContain('Error: TypeError: test crash in advance');
  expect(report).toContain('Stack:');
  // The Quality row is the debug overlay's line (audit CORE-02), not the settings object; Rules and Lighting are new rows.
  const qualityRow = report.split('\n').find((l) => l.startsWith('Quality:')) ?? '';
  expect(qualityRow).not.toContain('[object Object]');
  expect(qualityRow).toContain(' · scale ');
  expect(qualityRow).toMatch(/^Quality: (low|medium|high|custom)( \(auto\))? · scale [\d.]+ · shadow map (\d+|off) · textures \d+$/);
  expect(report).toMatch(/^Rules: \S+/m);
  expect(report).toMatch(/^Lighting: \S+/m);
  expect(report).toMatch(/^Retro pixels: \S/m);

  // Once: the loop stopped, so the error doesn't repeat every frame, and it never reached the page uncaught.
  await page.waitForTimeout(1500);
  expect(consoleErrors).toBe(1);
  expect(pageErrors).toEqual([]);

  // An error nobody catches later adds to the report instead of stacking a second pane.
  await page.evaluate(() => {
    setTimeout(() => {
      throw new Error('a second error');
    });
  });
  await expect(pane.getByRole('textbox', { name: 'Error report' })).toHaveValue(/Error: Error: a second error/);
  await expect(page.locator('.crash-screen')).toHaveCount(1);
});

test('a browser that gives no WebGL gets the start-up pane, with advice and a report', async ({ page }) => {
  await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    // Every WebGL context refused, as on a machine with graphics acceleration blocked.
    HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, type: string, options?: unknown) {
      return /webgl/i.test(type) ? null : original.call(this, type as '2d', options as CanvasRenderingContext2DSettings);
    } as typeof original;
  });
  await page.goto('/?seed=3');
  const pane = page.locator('.crash-screen');
  await expect(pane).toBeVisible({ timeout: 30_000 });
  await expect(pane.getByRole('heading')).toHaveText(/The game couldn.t start/i);
  await expect(pane.locator('.crash-advice')).toContainText('WebGL');
  await expect(page.locator('#loading')).toHaveCount(0);
  const report = await pane.getByRole('textbox', { name: 'Error report' }).inputValue();
  expect(report).toContain('Seed: 3');
  expect(report).toContain('Error: ');
});
