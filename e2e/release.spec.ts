import { expect, test } from '@playwright/test';

/**
 * The release build itself (audit CORE-22, CORE-09): `dist/`, what players download, served as it is from the play
 * link's path, `/Airsoft/` (playwright.config.ts project `release`, IM2). Every other browser test loads the e2e build, which differs in `import.meta.env.MODE`, so this is
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
  await page.goto('./?nolock&script=perf&quality=low');
  await page.waitForSelector('.menu-title-start', { timeout: 60_000 });
  await expect(page.locator('#loading')).toHaveCount(0);
  // No console handle in a release build (main.ts), and its page carries the CSP.
  expect(await page.evaluate(() => 'airsoft' in window)).toBe(false);
  await expect(page.locator('meta[http-equiv="Content-Security-Policy"]')).toHaveCount(1);

  // The title's Licences link opens the build's licences file (LC1), served as text, with every bundled package and the
  // notices vendoredLicences() appends.
  const licences = await page.request.get(new URL((await page.locator('.title-licences').getAttribute('href')) ?? '', page.url()).href);
  expect(licences.ok()).toBe(true);
  expect(licences.headers()['content-type']).toMatch(/^text\/plain/);
  const licenceText = await licences.text();
  for (const name of ['@dimforge/rapier3d-compat', 'three', 'meshoptimizer', 'Inter']) expect(licenceText).toMatch(new RegExp(`^## ${name} `, 'm'));

  // Rapier's WebAssembly is a plain file (IM3), served as application/wasm so the browser compiles it while it streams
  // in, with Brotli and gzip copies beside it for a host that serves them (audit CORE-29). Vite's preview server labels
  // a .br or .gz file with its Content-Encoding, so the browser unpacks it: the file's own bytes arrive, in well under
  // half the transfer.
  const meta = page.locator('meta[name="airsoft-physics-wasm"]');
  const wasmUrl = new URL((await meta.getAttribute('content')) ?? '', page.url()).href;
  const bytes = Number(await meta.getAttribute('data-bytes'));
  expect(wasmUrl).toMatch(/rapier_wasm3d_bg-.*\.wasm$/);
  const plain = await page.request.get(wasmUrl);
  expect(plain.headers()['content-type']).toBe('application/wasm');
  const original = await plain.body();
  expect(original.byteLength).toBe(bytes);
  expect([...original.subarray(0, 4)], 'a WebAssembly module').toEqual([0x00, 0x61, 0x73, 0x6d]);
  for (const [suffix, encoding] of [['.br', 'br'], ['.gz', 'gzip']] as const) {
    const copy = await page.request.get(`${wasmUrl}${suffix}`);
    expect(copy.ok(), `${wasmUrl}${suffix}`).toBe(true);
    expect(copy.headers()['content-encoding']).toBe(encoding);
    expect(Number(copy.headers()['content-length'])).toBeLessThan(bytes / 2);
    expect((await copy.body()).equals(original), `${suffix} unpacks to the file`).toBe(true);
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

  // Esc on the pause menu resumes, but Esc is no click, so Chrome refuses the lock (IN1). Stood in for here by refusing
  // both of the game's tries: the menu asks for a click, and one click off its buttons resumes.
  await page.evaluate(() => document.exitPointerLock());
  await expect(pauseMenu).toBeVisible({ timeout: 10_000 });
  await page.evaluate(() => {
    const app = document.getElementById('app')!;
    const real = app.requestPointerLock.bind(app);
    let refusals = 2;
    app.requestPointerLock = ((options?: PointerLockOptions) => {
      if (refusals-- <= 0) return real(options);
      document.dispatchEvent(new Event('pointerlockerror'));
      return Promise.reject(new DOMException('Refused', 'NotAllowedError'));
    }) as typeof app.requestPointerLock;
  });
  await page.waitForTimeout(500); // past the pause menu's Esc guard (PAUSE_ESC_GUARD_MS)
  await page.keyboard.press('Escape');
  await expect(pauseMenu.locator('.menu-hint')).toHaveText('Click anywhere to resume');
  await expect(pauseMenu).toBeVisible();
  const box = (await pauseMenu.boundingBox())!;
  await page.mouse.click(box.x + box.width - 20, box.y + box.height / 2);
  await page.waitForFunction(() => document.pointerLockElement?.id === 'app', undefined, { timeout: 10_000 });
  await expect(pauseMenu).toBeHidden();

  expect(errors).toEqual([]);
});

// W1 QA (WebGPU overhaul): the release build's side of the Renderer row. The row is public, and the node renderer is the
// only one since W6a: its chunks load under the page's CSP whether the browser has no adapter (WebGL2 at once) or an
// adapter that gives no device (WebGPU tried, then WebGL2), without an error.
test('the release build shows the Renderer row and draws with the node renderer on WebGL2, with or without an adapter, quietly', async ({ page, browser }) => {
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
  // This browser has navigator.gpu but no adapter (SwiftShader).
  await page.goto('./?nolock');
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
  expect(chunks.length).toBeGreaterThan(0);
  chunks.length = 0;

  // An adapter that cannot give a device: WebGPU is tried and let go; WebGL2 draws; nothing is an error.
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
  await second.goto('./?nolock');
  await second.waitForSelector('.menu-title-start', { timeout: 60_000 });
  await expect(second.locator('canvas.game-canvas')).toHaveCount(1);
  expect(chunks.length).toBeGreaterThan(0);
  await context.close();
  expect(errors).toEqual([]);
});
