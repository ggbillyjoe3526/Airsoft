import { expect, test } from '@playwright/test';

/**
 * The release build itself (audit CORE-22, CORE-09): `dist/`, what players download, served as it is (playwright.config.ts
 * project `release`). Every other browser test loads the e2e build, which differs in `import.meta.env.MODE`, so this is
 * the one place a bug behind those branches, or a release-only chunk problem, would show. It is also the one path that
 * runs without `?nolock&seed=1`: the test flags in the address must do nothing here, Play takes the real pointer lock
 * (headless Chromium grants it), losing the lock pauses the game, and Resume takes it again. The game picks its own seed.
 */
test('the release build boots, ignores the test flags and plays with the real pointer lock', async ({ page }) => {
  test.setTimeout(120_000);
  const errors: string[] = [];
  page.on('pageerror', (err) => errors.push(`pageerror: ${err.message}`));
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(`console: ${msg.text()}`);
  });
  await page.goto('/?nolock&script=perf&quality=low');
  await page.waitForSelector('.menu-title-start', { timeout: 60_000 });
  await expect(page.locator('#loading')).toHaveCount(0);
  // No console handle in a release build (main.ts), and its page carries the CSP.
  expect(await page.evaluate(() => 'airsoft' in window)).toBe(false);
  await expect(page.locator('meta[http-equiv="Content-Security-Policy"]')).toHaveCount(1);

  // The physics chunk ships with Brotli and gzip copies beside it for a host that serves them (audit CORE-29). Vite's
  // preview server labels a .br or .gz file with its Content-Encoding, so the browser unpacks it: the chunk's own bytes
  // arrive, in well under half the transfer.
  const meta = page.locator('meta[name="airsoft-physics-chunk"]');
  const chunkUrl = new URL((await meta.getAttribute('content')) ?? '', page.url()).href;
  const bytes = Number(await meta.getAttribute('data-bytes'));
  expect(chunkUrl).toMatch(/rapier-.*\.js$/);
  const original = await (await page.request.get(chunkUrl)).body();
  expect(original.byteLength).toBe(bytes);
  for (const [suffix, encoding] of [['.br', 'br'], ['.gz', 'gzip']] as const) {
    const copy = await page.request.get(`${chunkUrl}${suffix}`);
    expect(copy.ok(), `${chunkUrl}${suffix}`).toBe(true);
    expect(copy.headers()['content-encoding']).toBe(encoding);
    expect(Number(copy.headers()['content-length'])).toBeLessThan(bytes / 2);
    expect((await copy.body()).equals(original), `${suffix} unpacks to the chunk`).toBe(true);
  }

  // Play asks for the pointer lock: `?nolock` is ignored, so the match starts only once the game holds it
  // (the lock is on the game's container, #app, since FA2: turning edge smoothing on or off replaces the canvas).
  await page.locator('.menu-title-start').click();
  await page.locator('.menu-setup').getByRole('button', { name: 'Start match', exact: true }).click();
  await page.waitForFunction(() => document.pointerLockElement?.id === 'app', undefined, { timeout: 30_000 });
  await expect(page.locator('.hud')).toBeVisible({ timeout: 30_000 });

  // Losing the lock (Esc in a real browser) pauses; Resume asks for it again and play carries on.
  await page.evaluate(() => document.exitPointerLock());
  const pauseMenu = page.locator('.menu-pause');
  await expect(pauseMenu).toBeVisible({ timeout: 10_000 });
  await pauseMenu.getByRole('button', { name: 'Resume' }).click();
  await page.waitForFunction(() => document.pointerLockElement?.id === 'app', undefined, { timeout: 10_000 });
  await expect(pauseMenu).toBeHidden();

  expect(errors).toEqual([]);
});

// W1 QA (WebGPU overhaul): the release build's side of the Renderer row. The row is public, `?forceWebGL` is a dev and e2e
// flag the release build ignores, a browser with no adapter never downloads the node renderer, and a browser that gives an
// adapter but no device loads it through the real chunk (under the page's CSP) and falls back to WebGL without an error.
test('the release build shows the Renderer row, ignores ?forceWebGL, and falls back to WebGL quietly with or without an adapter', async ({ page, browser }) => {
  test.setTimeout(120_000);
  const errors: string[] = [];
  const chunks: string[] = [];
  const watch = (p: typeof page) => {
    p.on('pageerror', (err) => errors.push(`pageerror: ${err.message}`));
    p.on('console', (msg) => {
      if (msg.type() === 'error') errors.push(`console: ${msg.text()}`);
    });
    p.on('request', (req) => {
      if (/three-webgpu|nodeBackend/.test(req.url())) chunks.push(req.url());
    });
  };
  watch(page);
  // This browser has navigator.gpu but no adapter (SwiftShader); ?forceWebGL must not turn the node renderer on.
  await page.goto('/?nolock&forceWebGL');
  await page.waitForSelector('.menu-title-start', { timeout: 60_000 });
  await page.keyboard.press('Escape');
  const settings = page.locator('.menu-settings');
  await settings.getByRole('tab', { name: /Graphics/i }).click();
  const row = settings.getByRole('group', { name: 'Renderer' });
  await expect(row).toBeVisible();
  await expect(row.getByRole('button', { name: 'Auto' })).toHaveAttribute('aria-pressed', 'true');
  await expect(row.getByRole('button', { name: 'WebGPU' })).toBeVisible();
  await expect(row.getByRole('button', { name: 'WebGL' })).toBeVisible();
  await expect(page.locator('canvas.game-canvas')).toHaveCount(1);
  expect(chunks).toEqual([]);

  // An adapter that cannot give a device: the real chunk is fetched, tried and let go; WebGL draws; nothing is an error.
  const context = await browser.newContext();
  const second = await context.newPage();
  watch(second);
  await second.addInitScript(() => {
    const adapter = {
      features: new Set<string>(),
      limits: {},
      info: { vendor: 'qa', architecture: 'fake', description: 'adapter without a device', isFallbackAdapter: false },
      requestDevice: () => Promise.reject(new DOMException('device creation failed', 'OperationError')),
    };
    Object.defineProperty(Navigator.prototype, 'gpu', { configurable: true, get: () => ({ requestAdapter: () => Promise.resolve(adapter), getPreferredCanvasFormat: () => 'bgra8unorm' }) });
  });
  await second.goto('/?nolock');
  await second.waitForSelector('.menu-title-start', { timeout: 60_000 });
  await expect(second.locator('canvas.game-canvas')).toHaveCount(1);
  expect(chunks.length).toBeGreaterThan(0);
  await context.close();
  expect(errors).toEqual([]);
});
