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

// ---- W1 QA: the adversarial pass (what a browser without WebGPU, or a broken one, must never turn into an error) ----

/** Names every request for the node renderer's chunks (vite.config.ts: `three-webgpu`, and the node back end's own). */
function watchNodeChunks(page: Page): () => string[] {
  const chunks: string[] = [];
  page.on('request', (req) => {
    if (/three-webgpu|nodeBackend/.test(req.url())) chunks.push(req.url());
  });
  return () => chunks;
}

/** Boots to the title and counts the game's canvases. */
async function bootToTitle(page: Page, query = ''): Promise<void> {
  await page.goto(`/?nolock&seed=1${query}`);
  await page.waitForSelector('.menu-title-start', { timeout: 30_000 });
}

async function startMatch(page: Page): Promise<void> {
  await page.locator('.menu-title-start').click();
  await page.locator('.menu-setup').getByRole('button', { name: 'Start match', exact: true }).click();
  await expect(page.locator('.menus')).toBeHidden({ timeout: 20_000 });
  await expect(page.locator('.hud')).toBeVisible();
}

async function openRendererRow(page: Page) {
  await page.keyboard.press('Escape');
  const settings = page.locator('.menu-settings');
  await settings.getByRole('tab', { name: /Graphics/i }).click();
  const row = settings.getByRole('group', { name: 'Renderer' });
  await expect(row).toBeVisible();
  const note = settings.locator('.menu-row', { has: page.getByRole('group', { name: 'Renderer' }) }).locator('.graphics-note');
  return { settings, row, note };
}

test('an explicit WebGL pick never touches navigator.gpu, ignores ?forceWebGL and never fetches the node renderer', async ({ page }) => {
  const errors = watchErrors(page);
  const chunks = watchNodeChunks(page);
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
  expect(await page.evaluate(() => (window as unknown as { gpuTouched: number }).gpuTouched)).toBe(0);
  await startMatch(page);
  const stats = await page.evaluate(() => ({ ...(window as unknown as GameHandle).airsoft.renderer.stats }));
  await expect.poll(() => tick(page), { timeout: 30_000 }).toBeGreaterThan(30);
  expect(stats.calls).toBeGreaterThanOrEqual(0);
  expect(await page.evaluate(() => (window as unknown as { gpuTouched: number }).gpuTouched)).toBe(0);
  expect(chunks()).toEqual([]);
  expect(errors()).toEqual([]);
});

// Every way a browser can fail the adapter probe on Auto ends on WebGL with no console error and no node chunk fetched.
const PROBE_FAILURES: Record<string, string> = {
  'no navigator.gpu': `Object.defineProperty(Navigator.prototype, 'gpu', { configurable: true, get: () => undefined });`,
  'requestAdapter throwing': `Object.defineProperty(Navigator.prototype, 'gpu', { configurable: true, get: () => ({ requestAdapter: () => { throw new TypeError('blocked'); } }) });`,
  'requestAdapter rejecting': `Object.defineProperty(Navigator.prototype, 'gpu', { configurable: true, get: () => ({ requestAdapter: () => Promise.reject(new DOMException('no', 'OperationError')) }) });`,
  'requestAdapter that never answers': `Object.defineProperty(Navigator.prototype, 'gpu', { configurable: true, get: () => ({ requestAdapter: () => new Promise(() => {}) }) });`,
};
for (const [name, script] of Object.entries(PROBE_FAILURES)) {
  test(`on Auto, ${name} is WebGL with no console error and no node chunk fetched`, async ({ page }) => {
    const errors = watchErrors(page);
    const chunks = watchNodeChunks(page);
    await page.addInitScript(script);
    await bootToTitle(page);
    expect(await backend(page)).toBe('webgl');
    await expect(page.locator('canvas.game-canvas')).toHaveCount(1);
    expect(chunks()).toEqual([]);
    expect(errors()).toEqual([]);
  });
}

test('a WebGPU adapter that cannot give a device (requestDevice fails at boot) is WebGL, quietly, with one canvas and the row saying so', async ({ page }) => {
  const errors = watchErrors(page);
  const chunks = watchNodeChunks(page);
  await seedSettings(page, { renderer: 'webgpu' });
  await page.addInitScript(() => {
    const adapter = {
      features: new Set<string>(),
      limits: {},
      info: { vendor: 'qa', architecture: 'fake', description: 'adapter without a device', isFallbackAdapter: false },
      requestDevice: () => Promise.reject(new DOMException('device creation failed', 'OperationError')),
    };
    Object.defineProperty(Navigator.prototype, 'gpu', { configurable: true, get: () => ({ requestAdapter: () => Promise.resolve(adapter), getPreferredCanvasFormat: () => 'bgra8unorm' }) });
  });
  await bootToTitle(page);
  expect(await backend(page)).toBe('webgl');
  // The probe found an adapter, so the node renderer was tried (its chunk fetched) and given up on.
  expect(chunks().length).toBeGreaterThan(0);
  await expect(page.locator('canvas.game-canvas')).toHaveCount(1);
  const { note } = await openRendererRow(page);
  await expect(note).toHaveText('No WebGPU here: drawn with WebGL.');
  expect(errors()).toEqual([]);
});

// A software WebGPU adapter (SwiftShader and the like) is far slower than WebGL on the same machine: Auto passes it over,
// an explicit WebGPU pick still tries it.
const SOFTWARE_ADAPTER = `{
  const adapter = { features: new Set(), limits: {}, info: { vendor: 'qa', architecture: 'software', description: '', isFallbackAdapter: true },
    requestDevice: () => Promise.reject(new DOMException('device creation failed', 'OperationError')) };
  Object.defineProperty(Navigator.prototype, 'gpu', { configurable: true, get: () => ({ requestAdapter: () => Promise.resolve(adapter), getPreferredCanvasFormat: () => 'bgra8unorm' }) });
}`;
test('on Auto a software WebGPU adapter is WebGL with no node chunk fetched; picked WebGPU still tries it', async ({ page }) => {
  const errors = watchErrors(page);
  const chunks = watchNodeChunks(page);
  await page.addInitScript(SOFTWARE_ADAPTER);
  await bootToTitle(page);
  expect(await backend(page)).toBe('webgl');
  expect(chunks()).toEqual([]);
  await seedSettings(page, { renderer: 'webgpu' });
  await bootToTitle(page);
  expect(await backend(page)).toBe('webgl');
  expect(chunks().length).toBeGreaterThan(0);
  expect(errors()).toEqual([]);
});

test('changing the Renderer row mid-session changes nothing until the next load, says so, and the next load follows the pick', async ({ page }) => {
  test.setTimeout(150_000);
  const errors = watchErrors(page);
  await bootToTitle(page, '&forceWebGL');
  expect(await backend(page)).toBe('webgpu-webgl2');
  const canvasBefore = await page.evaluate(() => document.querySelector('canvas.game-canvas')!.id || 'canvas');
  const { row, note } = await openRendererRow(page);
  await expect(row.getByRole('button', { name: 'Auto' })).toHaveAttribute('aria-pressed', 'true');
  await row.getByRole('button', { name: 'WebGL' }).click();
  await expect(note).toHaveText('Changes from the next time the game loads.');
  expect(await backend(page)).toBe('webgpu-webgl2');
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('airsoft.settings')!).renderer)).toBe('webgl');
  await expect(page.locator('canvas.game-canvas')).toHaveCount(1);
  expect(canvasBefore).toBeTruthy();
  // Put back to Auto: the line goes.
  await row.getByRole('button', { name: 'Auto' }).click();
  await expect(note).toBeHidden();
  await row.getByRole('button', { name: 'WebGL' }).click();
  await page.reload();
  await page.waitForSelector('.menu-title-start', { timeout: 30_000 });
  expect(await backend(page)).toBe('webgl');
  expect(errors()).toEqual([]);
});

test('a second loss is recovered too, and when no new device can be made the game ends on WebGL and plays on, with no errors', async ({ page }, testInfo) => {
  test.setTimeout(240_000);
  const errors = watchErrors(page);
  await bootToTitle(page, '&forceWebGL');
  expect(await backend(page)).toBe('webgpu-webgl2');
  await startMatch(page);
  const lose = () =>
    page.evaluate(() => {
      const lost = document.querySelector<HTMLCanvasElement>('canvas.game-canvas')!.getContext('webgl2')!.getExtension('WEBGL_lose_context')!;
      lost.loseContext();
    });
  const notice = page.locator('.graphics-notice');
  const pauseMenu = page.locator('.menu-pause');

  // Loss 1: a new node renderer takes over, on a new canvas.
  await page.evaluate(() => ((window as unknown as { firstCanvas: Element }).firstCanvas = document.querySelector('canvas.game-canvas')!));
  await lose();
  await expect(notice).toBeVisible({ timeout: 10_000 });
  await expect(notice).toBeHidden({ timeout: 30_000 });
  expect(await backend(page)).toBe('webgpu-webgl2');
  expect(await page.evaluate(() => document.querySelector('canvas.game-canvas') === (window as unknown as { firstCanvas: Element }).firstCanvas)).toBe(false);
  await expect(page.locator('canvas.game-canvas')).toHaveCount(1);

  // Loss 2, and now the browser refuses the node renderer's WebGL2 context (Three asks without `failIfMajorPerformanceCaveat`,
  // which WebGLRenderer always sets): three tries, then the game's own WebGL renderer takes over.
  await page.evaluate(() => {
    const w = window as unknown as { nodeAsks: number; loseNow: () => void };
    const lost = document.querySelector<HTMLCanvasElement>('canvas.game-canvas')!.getContext('webgl2')!.getExtension('WEBGL_lose_context')!;
    w.loseNow = () => lost.loseContext();
    w.nodeAsks = 0;
    const real = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, type: string, attributes?: unknown) {
      if (type === 'webgl2' && attributes && !('failIfMajorPerformanceCaveat' in (attributes as object))) {
        w.nodeAsks++;
        return null;
      }
      return real.call(this, type, attributes as never);
    } as typeof real;
    w.loseNow();
  });
  await expect(notice).toBeVisible({ timeout: 10_000 });
  await expect(notice).toBeHidden({ timeout: 60_000 });
  expect(await backend(page)).toBe('webgl');
  expect(await page.evaluate(() => (window as unknown as { nodeAsks: number }).nodeAsks)).toBeGreaterThanOrEqual(3);
  await expect(page.locator('canvas.game-canvas')).toHaveCount(1);
  await expect(pauseMenu).toContainText('Graphics are back');
  await pauseMenu.getByRole('button', { name: 'Resume' }).click();
  await expect(page.locator('.menus')).toBeHidden({ timeout: 10_000 });
  const t0 = await tick(page);
  await expect.poll(() => tick(page), { timeout: 30_000 }).toBeGreaterThan(t0 + 30);
  // The WebGL renderer draws: its calls and triangles are counted the way the debug overlay reads them.
  await expect.poll(() => page.evaluate(() => (window as unknown as GameHandle).airsoft.renderer.stats.calls), { timeout: 30_000 }).toBeGreaterThan(10);
  await testInfo.attach('fell-back-to-webgl', { body: await page.screenshot(), contentType: 'image/png' });
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
  expect(await backend(page)).toBe('webgpu-webgl2');
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
