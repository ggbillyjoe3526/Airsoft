import { expect, type Page, test } from '@playwright/test';

/**
 * The node renderer (WebGPU overhaul W1). On Settings › Graphics › Renderer, Auto (the default) and WebGPU draw with
 * `WebGPURenderer` from `three/webgpu` wherever the browser gives a WebGPU adapter. This container's Chromium has none
 * (SwiftShader), so the first test picks WebGPU and adds `?forceWebGL` (the e2e build only): the same node renderer on
 * its WebGL2 back end. The second checks what a browser without WebGPU gets on Auto: WebGL, quietly, with `three/webgpu`
 * never downloaded. Every test asserts zero console and page errors, as the other specs do.
 */

/** The settings object as a save holds it (the Renderer pick). */
async function seedSettings(page: Page, settings: Record<string, unknown>): Promise<void> {
  await page.addInitScript((text) => {
    // Only on the first load of the page: a reload keeps what the game saved since.
    if (sessionStorage.getItem('w1-seeded')) return;
    sessionStorage.setItem('w1-seeded', '1');
    localStorage.setItem('airsoft.settings', text);
  }, JSON.stringify({ version: 1, ...settings }));
}

function watchErrors(page: Page): () => string[] {
  const errors: string[] = [];
  page.on('pageerror', (err) => errors.push(`pageerror: ${err.message}`));
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(`console: ${msg.text()}`);
  });
  return () => errors;
}

interface GameHandle {
  airsoft: {
    state: { tick: number } | null;
    renderer: { backend: string; stats: { calls: number; triangles: number }; renderer: { info: { render: { calls: number } } } };
  };
}

const backend = (page: Page) => page.evaluate(() => (window as unknown as GameHandle).airsoft.renderer.backend);
const tick = (page: Page) => page.evaluate(() => (window as unknown as GameHandle).airsoft.state?.tick ?? 0);
/** The node renderer's render() calls so far (its `info.render.calls` counts them and is never reset). */
const renders = (page: Page) => page.evaluate(() => (window as unknown as GameHandle).airsoft.renderer.renderer.info.render.calls);

test('the node renderer boots a match, draws its frames and recovers a lost device without errors', async ({ page }, testInfo) => {
  test.setTimeout(150_000);
  const errors = watchErrors(page);
  await seedSettings(page, { renderer: 'webgpu' });
  await page.goto('/?nolock&seed=1&forceWebGL');
  await page.waitForSelector('.menu-title-start', { timeout: 30_000 });
  expect(await backend(page)).toBe('webgpu-webgl2');
  await expect(page.locator('canvas.game-canvas')).toHaveCount(1);

  // The Renderer row on Settings › Graphics shows the saved pick and no note.
  await page.keyboard.press('Escape');
  const settings = page.locator('.menu-settings');
  await settings.getByRole('tab', { name: /Graphics/i }).click();
  const row = settings.getByRole('group', { name: 'Renderer' });
  await expect(row).toBeVisible();
  await expect(row.getByRole('button', { name: 'WebGPU' })).toHaveAttribute('aria-pressed', 'true');
  const note = settings.locator('.menu-row', { has: page.getByRole('group', { name: 'Renderer' }) }).locator('.graphics-note');
  await expect(note).toHaveCount(1);
  await expect(note).toBeHidden();
  await page.keyboard.press('Escape');

  await page.locator('.menu-title-start').click();
  await page.locator('.menu-setup').getByRole('button', { name: 'Start match', exact: true }).click();
  await expect(page.locator('.menus')).toBeHidden({ timeout: 20_000 });
  await expect(page.locator('.hud')).toBeVisible();
  // Frames are drawn: the simulation runs, the renderer's render() calls climb and a frame has draws and triangles.
  const ticked = await tick(page);
  const rendered = await renders(page);
  await expect.poll(() => tick(page), { timeout: 30_000 }).toBeGreaterThan(ticked + 30);
  await expect.poll(() => renders(page), { timeout: 30_000 }).toBeGreaterThan(rendered + 10);
  const stats = await page.evaluate(() => ({ ...(window as unknown as GameHandle).airsoft.renderer.stats }));
  expect(stats.calls).toBeGreaterThan(10);
  expect(stats.triangles).toBeGreaterThan(1000);
  await testInfo.attach('node-renderer-match', { body: await page.screenshot(), contentType: 'image/png' });

  // A lost device (here the WebGL2 back end's context): the game pauses under the graphics notice, a new renderer on a
  // new canvas takes over, and after Resume the match draws on it.
  const pauseMenu = page.locator('.menu-pause');
  await page.evaluate(() => {
    const lose = document.querySelector<HTMLCanvasElement>('canvas.game-canvas')!.getContext('webgl2')!.getExtension('WEBGL_lose_context')!;
    lose.loseContext();
  });
  await expect(page.locator('.graphics-notice')).toBeVisible({ timeout: 10_000 });
  await expect(page.locator('.graphics-notice')).toBeHidden({ timeout: 20_000 });
  await expect(pauseMenu).toContainText('Graphics are back');
  expect(await backend(page)).toBe('webgpu-webgl2');
  await expect(page.locator('canvas.game-canvas')).toHaveCount(1);
  await pauseMenu.getByRole('button', { name: 'Resume' }).click();
  await expect(page.locator('.menus')).toBeHidden({ timeout: 10_000 });
  const tickAfter = await tick(page);
  const renderedAfter = await renders(page);
  await expect.poll(() => tick(page), { timeout: 30_000 }).toBeGreaterThan(tickAfter + 30);
  await expect.poll(() => renders(page), { timeout: 30_000 }).toBeGreaterThan(renderedAfter + 10);
  await testInfo.attach('node-renderer-recovered', { body: await page.screenshot(), contentType: 'image/png' });
  expect(errors()).toEqual([]);
});

test('on Auto without a WebGPU adapter the game draws with WebGL, as before, never loading three/webgpu', async ({ page }) => {
  const errors = watchErrors(page);
  // The node renderer's chunks (vite.config.ts: `three-webgpu`, and the node back end's own) are fetched only after an adapter is found.
  const nodeChunks: string[] = [];
  page.on('request', (req) => {
    if (/three-webgpu|nodeBackend/.test(req.url())) nodeChunks.push(req.url());
  });
  // A fresh save: Auto. This browser has `navigator.gpu`, but its adapter request comes back null.
  await page.goto('/?nolock&seed=1');
  await page.waitForSelector('.menu-title-start', { timeout: 30_000 });
  expect(await backend(page)).toBe('webgl');
  await page.keyboard.press('Escape');
  const settings = page.locator('.menu-settings');
  await settings.getByRole('tab', { name: /Graphics/i }).click();
  const row = settings.getByRole('group', { name: 'Renderer' });
  await expect(row).toBeVisible();
  await expect(row.getByRole('button', { name: 'Auto' })).toHaveAttribute('aria-pressed', 'true');
  const note = settings.locator('.menu-row', { has: page.getByRole('group', { name: 'Renderer' }) }).locator('.graphics-note');
  await expect(note).toBeHidden();
  // WebGPU picked here can't be honoured: one line says so. WebGL draws already, so the WebGL pick says nothing.
  await row.getByRole('button', { name: 'WebGPU' }).click();
  await expect(note).toHaveText('No WebGPU here: drawn with WebGL.');
  await row.getByRole('button', { name: 'WebGL' }).click();
  await expect(note).toBeHidden();

  // A reload on WebGPU: still WebGL (no adapter), the pick kept, the note there from the start.
  await row.getByRole('button', { name: 'WebGPU' }).click();
  await page.reload();
  await page.waitForSelector('.menu-title-start', { timeout: 30_000 });
  expect(await backend(page)).toBe('webgl');
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('airsoft.settings')!).renderer)).toBe('webgpu');
  await page.keyboard.press('Escape');
  await settings.getByRole('tab', { name: /Graphics/i }).click();
  await expect(note).toHaveText('No WebGPU here: drawn with WebGL.');
  expect(nodeChunks).toEqual([]);
  expect(errors()).toEqual([]);
});
