import { expect, test } from '@playwright/test';

/**
 * Crash handling (audit CORE-04, UI-02, CORE-28): an error in the game loop stops the game once and shows the "Something
 * went wrong" pane with a report to copy; a start-up failure shows the same pane, with advice when there's no WebGL.
 * Errors are expected here, so unlike boot.spec.ts these tests count them instead of asserting there are none.
 */

type Airsoft = { airsoft: { state: { tick: number } | null; session: { advance: (dt: number) => number } } };

test('an error in play stops the game once, gives the controls back and shows a report to copy', async ({ page, context }) => {
  test.setTimeout(120_000);
  const pageErrors: string[] = [];
  page.on('pageerror', (err) => pageErrors.push(err.message));
  let consoleErrors = 0;
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors++;
  });
  await page.goto('/?nolock&seed=7');
  await page.waitForSelector('.menu-title-start', { timeout: 30_000 });
  await page.locator('.menu-title-start').click();
  await page.locator('.menu-setup').getByRole('button', { name: 'Start match', exact: true }).click();
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

  // IM7: the fuller report, a note box and Report a Bug.
  for (const head of ['Time: ', 'Language: ', 'Player: at ', 'Frames: ', 'Memory: ', 'Load: ', 'Recent errors', 'Recent events']) {
    expect(report, head).toContain(head);
  }
  const note = pane.getByRole('textbox', { name: 'What went wrong' });
  await expect(note).toBeVisible();
  await note.fill('the door stuck');
  const send = pane.getByRole('link', { name: 'Report a Bug' });
  await expect(send).toBeVisible();
  // The issue page isn't loaded (no network needed): the new tab gets an empty answer.
  await context.route('https://github.com/**', (route) => route.fulfill({ status: 200, contentType: 'text/html', body: '<title>issue</title>' }));
  const popup = context.waitForEvent('page');
  await send.click();
  await (await popup).close();
  const href = (await send.getAttribute('href')) ?? '';
  expect(href.startsWith('https://github.com/ggbillyjoe3526/Airsoft/issues/new?')).toBe(true);
  const issue = new URL(href).searchParams;
  expect(issue.get('title')).toBe('Bug: the door stuck');
  expect(issue.get('body')).toContain('the door stuck');
  expect(issue.get('body')).toContain('Error: TypeError: test crash in advance');

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

test('a physics download that fails gives the start-up pane naming the WebAssembly fetch, not a stuck loading bar (IM3)', async ({ page }) => {
  let wasmRequests = 0;
  await page.route(/rapier_wasm3d_bg-.*\.wasm$/, (route) => {
    wasmRequests++;
    return route.fulfill({ status: 404, contentType: 'text/plain', body: 'not found' });
  });
  await page.goto('/?seed=5');
  const pane = page.locator('.crash-screen');
  await expect(pane).toBeVisible({ timeout: 30_000 });
  await expect(pane.getByRole('heading')).toHaveText(/The game couldn.t start/i);
  await expect(page.locator('#loading')).toHaveCount(0);
  await expect(page.locator('.menu-title-start')).toHaveCount(0);
  expect(wasmRequests).toBeGreaterThan(0);
  const report = await pane.getByRole('textbox', { name: 'Error report' }).inputValue();
  expect(report).toMatch(/Error: .*failed to fetch Wasm: 404.*rapier_wasm3d_bg-.*\.wasm/i);
});
