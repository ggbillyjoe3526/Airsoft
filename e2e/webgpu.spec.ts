import { expect, test } from '@playwright/test';
import { backend, bootToTitle, type GameHandle, nodeRenderer, openRendererRow, renders, seedSettings, startMatch, tick, watchErrors } from './rendererRow';

/**
 * The node renderer (WebGPU overhaul W1; the only renderer since W6a). On Settings › Graphics › Renderer, Auto (the
 * default) and WebGPU draw with `WebGPURenderer` from `three/webgpu` on WebGPU wherever the browser gives a WebGPU
 * adapter, and on its WebGL2 back end otherwise; WebGL is its WebGL2 back end always. This project's Chromium has no
 * adapter (SwiftShader), so most tests draw on WebGL2 (`?forceWebGL`, the e2e build only, asks for it outright); the last
 * describe launches Chromium with SwiftShader's Vulkan for a real WebGPU device (WEBGPU_LAUNCH). Every test asserts zero
 * console and page errors, as the other specs do.
 */

test('the node renderer boots a match, draws its frames and recovers a lost device without errors', async ({ page }, testInfo) => {
  test.setTimeout(150_000);
  const errors = watchErrors(page);
  await seedSettings(page, { renderer: 'webgpu' });
  await page.goto('/?nolock&seed=1&forceWebGL');
  await page.waitForSelector('.menu-title-start', { timeout: 30_000 });
  expect(await backend(page)).toBe('webgl');
  await expect(page.locator('canvas.game-canvas')).toHaveCount(1);

  // The Renderer row on Settings › Graphics shows the saved pick.
  await page.keyboard.press('Escape');
  const settings = page.locator('.menu-settings');
  await settings.getByRole('tab', { name: /Graphics/i }).click();
  const row = settings.getByRole('group', { name: 'Renderer' });
  await expect(row).toBeVisible();
  await expect(row.getByRole('button', { name: 'WebGPU' })).toHaveAttribute('aria-pressed', 'true');
  // WebGPU picked and WebGL2 drawing (asked for here by ?forceWebGL): one line says so.
  const note = settings.locator('.menu-row', { has: page.getByRole('group', { name: 'Renderer' }) }).locator('.graphics-note');
  await expect(note).toHaveText('No WebGPU here: drawn with WebGL.');
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
  expect(await backend(page)).toBe('webgl');
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

test('on Auto without a WebGPU adapter the game draws with the node renderer on WebGL2, quietly', async ({ page }) => {
  const errors = watchErrors(page);
  // A fresh save: Auto. This browser has `navigator.gpu`, but its adapter request comes back null.
  await page.goto('/?nolock&seed=1');
  await page.waitForSelector('.menu-title-start', { timeout: 30_000 });
  expect(await backend(page)).toBe('webgl');
  expect(await nodeRenderer(page)).toBe(true);
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
  expect(errors()).toEqual([]);
});

// ---- W1 QA: the adversarial pass (what a browser without WebGPU, or a broken one, must never turn into an error) ----

test('an explicit WebGL pick never touches navigator.gpu and draws with the node renderer on WebGL2', async ({ page }) => {
  const errors = watchErrors(page);
  await seedSettings(page, { renderer: 'webgl' });
  await page.addInitScript(() => {
    (window as unknown as { gpuTouched: number }).gpuTouched = 0;
    Object.defineProperty(Navigator.prototype, 'gpu', {
      configurable: true,
      get() {
        (window as unknown as { gpuTouched: number }).gpuTouched++;
        return undefined;
      },
    });
  });
  await bootToTitle(page, '&forceWebGL');
  expect(await backend(page)).toBe('webgl');
  expect(await nodeRenderer(page)).toBe(true);
  expect(await page.evaluate(() => (window as unknown as { gpuTouched: number }).gpuTouched)).toBe(0);
  await startMatch(page);
  const stats = await page.evaluate(() => ({ ...(window as unknown as GameHandle).airsoft.renderer.stats }));
  await expect.poll(() => tick(page), { timeout: 30_000 }).toBeGreaterThan(30);
  expect(stats.calls).toBeGreaterThanOrEqual(0);
  expect(await page.evaluate(() => (window as unknown as { gpuTouched: number }).gpuTouched)).toBe(0);
  expect(errors()).toEqual([]);
});

// Every way a browser can fail the adapter probe on Auto ends on WebGL2 with no console error.
const PROBE_FAILURES: Record<string, string> = {
  'no navigator.gpu': `Object.defineProperty(Navigator.prototype, 'gpu', { configurable: true, get: () => undefined });`,
  'requestAdapter throwing': `Object.defineProperty(Navigator.prototype, 'gpu', { configurable: true, get: () => ({ requestAdapter: () => { throw new TypeError('blocked'); } }) });`,
  'requestAdapter rejecting': `Object.defineProperty(Navigator.prototype, 'gpu', { configurable: true, get: () => ({ requestAdapter: () => Promise.reject(new DOMException('no', 'OperationError')) }) });`,
  'requestAdapter that never answers': `Object.defineProperty(Navigator.prototype, 'gpu', { configurable: true, get: () => ({ requestAdapter: () => new Promise(() => {}) }) });`,
};
for (const [name, script] of Object.entries(PROBE_FAILURES)) {
  test(`on Auto, ${name} is WebGL2 with no console error`, async ({ page }) => {
    const errors = watchErrors(page);
    await page.addInitScript(script);
    await bootToTitle(page);
    expect(await backend(page)).toBe('webgl');
    await expect(page.locator('canvas.game-canvas')).toHaveCount(1);
    expect(errors()).toEqual([]);
  });
}

test('a WebGPU adapter that cannot give a device (requestDevice fails at boot) is WebGL2, quietly, with one canvas and the row saying so', async ({ page }) => {
  const errors = watchErrors(page);
  await seedSettings(page, { renderer: 'webgpu' });
  await page.addInitScript(() => {
    const w = window as unknown as { deviceAsks: number };
    w.deviceAsks = 0;
    const adapter = {
      features: new Set<string>(),
      limits: {},
      info: { vendor: 'qa', architecture: 'fake', description: 'adapter without a device', isFallbackAdapter: false },
      requestDevice: () => {
        w.deviceAsks++;
        return Promise.reject(new DOMException('device creation failed', 'OperationError'));
      },
    };
    Object.defineProperty(Navigator.prototype, 'gpu', { configurable: true, get: () => ({ requestAdapter: () => Promise.resolve(adapter), getPreferredCanvasFormat: () => 'bgra8unorm' }) });
  });
  await bootToTitle(page);
  expect(await backend(page)).toBe('webgl');
  // The probe found an adapter, so WebGPU was tried and given up on.
  expect(await page.evaluate(() => (window as unknown as { deviceAsks: number }).deviceAsks)).toBeGreaterThan(0);
  await expect(page.locator('canvas.game-canvas')).toHaveCount(1);
  const { note } = await openRendererRow(page);
  await expect(note).toHaveText('No WebGPU here: drawn with WebGL.');
  expect(errors()).toEqual([]);
});

// A software WebGPU adapter (SwiftShader and the like) is far slower than WebGL on the same machine: Auto passes it over,
// an explicit WebGPU pick still tries it.
const SOFTWARE_ADAPTER = `{
  window.deviceAsks = 0;
  const adapter = { features: new Set(), limits: {}, info: { vendor: 'qa', architecture: 'software', description: '', isFallbackAdapter: true },
    requestDevice: () => { window.deviceAsks++; return Promise.reject(new DOMException('device creation failed', 'OperationError')); } };
  Object.defineProperty(Navigator.prototype, 'gpu', { configurable: true, get: () => ({ requestAdapter: () => Promise.resolve(adapter), getPreferredCanvasFormat: () => 'bgra8unorm' }) });
}`;
test('on Auto a software WebGPU adapter is passed over for WebGL2 untried; picked WebGPU still tries it', async ({ page }) => {
  const errors = watchErrors(page);
  const asks = () => page.evaluate(() => (window as unknown as { deviceAsks: number }).deviceAsks);
  await page.addInitScript(SOFTWARE_ADAPTER);
  await bootToTitle(page);
  expect(await backend(page)).toBe('webgl');
  expect(await asks()).toBe(0);
  await seedSettings(page, { renderer: 'webgpu' });
  await bootToTitle(page);
  expect(await backend(page)).toBe('webgl');
  expect(await asks()).toBeGreaterThan(0);
  expect(errors()).toEqual([]);
});

test('the GPU timer is safe without timestamp queries: turned on in a match on the node renderer it reads n/a, warns of nothing and draws on', async ({ page }) => {
  test.setTimeout(150_000);
  const errors = watchErrors(page);
  const warnings: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'warning') warnings.push(msg.text());
  });
  await bootToTitle(page, '&forceWebGL');
  expect(await backend(page)).toBe('webgl');
  await startMatch(page);
  const gpuMs = () => page.evaluate(() => (window as unknown as { airsoft: { renderer: { gpuMs: number } } }).airsoft.renderer.gpuMs);
  await page.evaluate(() => ((window as unknown as { airsoft: { renderer: { gpuTiming: boolean } } }).airsoft.renderer.gpuTiming = true));
  const before = await renders(page);
  // More frames than the timer's read interval (RENDER_BACKEND.timestampEvery), so a read would have been asked for.
  await expect.poll(() => renders(page), { timeout: 60_000 }).toBeGreaterThan(before + 40);
  const ms = await gpuMs();
  // Either this machine's WebGL2 offers a disjoint timer (then a positive number) or it does not (NaN, "n/a"): never zero, negative or Infinity.
  expect(Number.isNaN(ms) || (ms > 0 && Number.isFinite(ms))).toBe(true);
  await page.evaluate(() => ((window as unknown as { airsoft: { renderer: { gpuTiming: boolean } } }).airsoft.renderer.gpuTiming = false));
  await expect.poll(async () => Number.isNaN(await gpuMs()), { timeout: 10_000 }).toBe(true);
  expect(warnings.filter((w) => /timestamp/i.test(w))).toEqual([]);
  expect(errors()).toEqual([]);
});
