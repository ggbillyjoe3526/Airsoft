import { expect, type Page } from '@playwright/test';

/** What the Renderer row's browser checks share (e2e/webgpu.spec.ts, e2e/webgpuDevice.spec.ts). */

/** The settings object as a save holds it (the Renderer pick). */
export async function seedSettings(page: Page, settings: Record<string, unknown>): Promise<void> {
  await page.addInitScript((text) => {
    // Only on the first load of the page: a reload keeps what the game saved since.
    if (sessionStorage.getItem('w1-seeded')) return;
    sessionStorage.setItem('w1-seeded', '1');
    localStorage.setItem('airsoft.settings', text);
  }, JSON.stringify({ version: 1, ...settings }));
}

export function watchErrors(page: Page): () => string[] {
  const errors: string[] = [];
  page.on('pageerror', (err) => errors.push(`pageerror: ${err.message}`));
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(`console: ${msg.text()}`);
  });
  return () => errors;
}

export interface GameHandle {
  airsoft: {
    state: { tick: number } | null;
    renderer: { backend: string; lostToWebGL: boolean; stats: { calls: number; triangles: number }; renderer: { isWebGPURenderer?: boolean; info: { render: { calls: number } } } };
  };
}

export const backend = (page: Page) => page.evaluate(() => (window as unknown as GameHandle).airsoft.renderer.backend);
/** The renderer drawing is the node renderer (WebGPURenderer), whichever its back end. */
export const nodeRenderer = (page: Page) => page.evaluate(() => (window as unknown as GameHandle).airsoft.renderer.renderer.isWebGPURenderer === true);
export const tick = (page: Page) => page.evaluate(() => (window as unknown as GameHandle).airsoft.state?.tick ?? 0);
/** The node renderer's render() calls so far (its `info.render.calls` counts them and is never reset). */
export const renders = (page: Page) => page.evaluate(() => (window as unknown as GameHandle).airsoft.renderer.renderer.info.render.calls);

/** Boots to the title and counts the game's canvases. */
export async function bootToTitle(page: Page, query = ''): Promise<void> {
  await page.goto(`/?nolock&seed=1${query}`);
  await page.waitForSelector('.menu-title-start', { timeout: 30_000 });
}

export async function startMatch(page: Page): Promise<void> {
  await page.locator('.menu-title-start').click();
  await page.locator('.menu-setup').getByRole('button', { name: 'Start match', exact: true }).click();
  await expect(page.locator('.menus')).toBeHidden({ timeout: 20_000 });
  await expect(page.locator('.hud')).toBeVisible();
}

export async function openRendererRow(page: Page) {
  await page.keyboard.press('Escape');
  const settings = page.locator('.menu-settings');
  await settings.getByRole('tab', { name: /Graphics/i }).click();
  const row = settings.getByRole('group', { name: 'Renderer' });
  await expect(row).toBeVisible();
  const note = settings.locator('.menu-row', { has: page.getByRole('group', { name: 'Renderer' }) }).locator('.graphics-note');
  return { settings, row, note };
}
