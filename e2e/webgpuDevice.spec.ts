import { expect, test } from '@playwright/test';
import { backend, bootToTitle, type GameHandle, nodeRenderer, openRendererRow, seedSettings, startMatch, tick, watchErrors } from './rendererRow';
import { WEBGPU_LAUNCH } from './webgpuWorldHarness';

/**
 * The Renderer row and a lost device on a real WebGPU device (W6a): Chromium launched with SwiftShader's Vulkan
 * (WEBGPU_LAUNCH), as e2e/webgpuLights.spec.ts. A browser that gives no device skips these.
 */

test.use({ launchOptions: async ({ launchOptions }, use) => use({ ...launchOptions, args: [...(launchOptions.args ?? []), ...WEBGPU_LAUNCH] }) });

/**
 * Wraps every device the page is given so the test can lose it (`loseGpu`: its `lost` promise resolves as a driver's
 * would; a destroyed device's is ignored by Three) and refuse the next ones (`refuseGpu`).
 */
const LOSABLE_DEVICES = `if (typeof GPUAdapter !== 'undefined') {
  window.gpuDevices = 0;
  window.refuseGpu = false;
  const request = GPUAdapter.prototype.requestDevice;
  GPUAdapter.prototype.requestDevice = async function (descriptor) {
    if (window.refuseGpu) throw new DOMException('qa: no device', 'OperationError');
    const device = await request.call(this, descriptor);
    let lose;
    const lost = new Promise((done) => (lose = done));
    Object.defineProperty(device, 'lost', { configurable: true, get: () => lost });
    window.loseGpu = () => lose({ reason: 'unknown', message: 'qa: device lost' });
    window.gpuDevices++;
    return device;
  };
}`;

test.describe('on a WebGPU device (W6a)', () => {
  test('changing the Renderer row mid-session changes nothing until the next load, says so, and the next load follows the pick', async ({ page }) => {
    test.setTimeout(150_000);
    const errors = watchErrors(page);
    await seedSettings(page, { renderer: 'webgpu' });
    await bootToTitle(page);
    test.skip((await backend(page)) !== 'webgpu', 'this browser gave no WebGPU device');
    const { row, note } = await openRendererRow(page);
    await expect(row.getByRole('button', { name: 'WebGPU' })).toHaveAttribute('aria-pressed', 'true');
    await row.getByRole('button', { name: 'WebGL' }).click();
    await expect(note).toHaveText('Changes from the next time the game loads.');
    expect(await backend(page)).toBe('webgpu');
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem('airsoft.settings')!).renderer)).toBe('webgl');
    await expect(page.locator('canvas.game-canvas')).toHaveCount(1);
    // Put back: the line goes.
    await row.getByRole('button', { name: 'WebGPU' }).click();
    await expect(note).toBeHidden();
    await row.getByRole('button', { name: 'WebGL' }).click();
    await page.reload();
    await page.waitForSelector('.menu-title-start', { timeout: 30_000 });
    expect(await backend(page)).toBe('webgl');
    expect(await nodeRenderer(page)).toBe(true);
    expect(errors()).toEqual([]);
  });

  test('a lost device is replaced by a new WebGPU one; when none can be made, WebGL2 takes over and play goes on', async ({ page }, testInfo) => {
    test.setTimeout(240_000);
    const errors = watchErrors(page);
    await seedSettings(page, { renderer: 'webgpu' });
    await page.addInitScript(LOSABLE_DEVICES);
    await bootToTitle(page, '&quality=low');
    test.skip((await backend(page)) !== 'webgpu', 'this browser gave no WebGPU device');
    await startMatch(page);
    const w = (fn: string) => page.evaluate((f) => (window as unknown as Record<string, () => void>)[f]!(), fn);
    const notice = page.locator('.graphics-notice');
    const pauseMenu = page.locator('.menu-pause');

    // Loss 1: a new device, on a new canvas.
    await page.evaluate(() => ((window as unknown as { firstCanvas: Element }).firstCanvas = document.querySelector('canvas.game-canvas')!));
    await w('loseGpu');
    await expect(notice).toBeVisible({ timeout: 10_000 });
    await expect(notice).toBeHidden({ timeout: 30_000 });
    expect(await backend(page)).toBe('webgpu');
    expect(await page.evaluate(() => (window as unknown as { gpuDevices: number }).gpuDevices)).toBe(2);
    expect(await page.evaluate(() => document.querySelector('canvas.game-canvas') === (window as unknown as { firstCanvas: Element }).firstCanvas)).toBe(false);
    await expect(page.locator('canvas.game-canvas')).toHaveCount(1);

    // Loss 2, and now no device is given: the tries run out and WebGL2 takes over.
    await page.evaluate(() => ((window as unknown as { refuseGpu: boolean }).refuseGpu = true));
    await w('loseGpu');
    await expect(notice).toBeVisible({ timeout: 10_000 });
    await expect(notice).toBeHidden({ timeout: 60_000 });
    expect(await backend(page)).toBe('webgl');
    expect(await page.evaluate(() => (window as unknown as GameHandle).airsoft.renderer.lostToWebGL)).toBe(true);
    await expect(page.locator('canvas.game-canvas')).toHaveCount(1);
    await expect(pauseMenu).toContainText('Graphics are back');
    await pauseMenu.getByRole('button', { name: 'Resume' }).click();
    await expect(page.locator('.menus')).toBeHidden({ timeout: 10_000 });
    const t0 = await tick(page);
    await expect.poll(() => tick(page), { timeout: 30_000 }).toBeGreaterThan(t0 + 30);
    await expect.poll(() => page.evaluate(() => (window as unknown as GameHandle).airsoft.renderer.stats.calls), { timeout: 30_000 }).toBeGreaterThan(10);
    await testInfo.attach('fell-back-to-webgl2', { body: await page.screenshot(), contentType: 'image/png' });
    expect(errors()).toEqual([]);
  });
});
