import { readFile } from 'node:fs/promises';
import { expect, type Page, test } from '@playwright/test';

/**
 * The save system (M31) in a real browser: Settings → Save downloads the save as a file, loads one back (after the
 * side-by-side check, with Undo after), warns about an edited file, refuses what isn't a save, and a second tab waits
 * behind the "open in another tab" notice until Play here. Chromium only here; PLAYTEST lists the Firefox checks.
 */

function watchErrors(page: Page): () => string[] {
  const errors: string[] = [];
  page.on('pageerror', (err) => errors.push(`pageerror: ${err.message}`));
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(`console: ${msg.text()}`);
  });
  return () => errors;
}

async function openSaveTab(page: Page) {
  await page.waitForSelector('.menu-title-start', { timeout: 30_000 });
  await page.getByRole('button', { name: 'Start' }).click();
  await page.locator('.menu-setup').getByRole('button', { name: /Settings/i }).click();
  const settings = page.locator('.menu-settings');
  await settings.getByRole('tab', { name: /Save/ }).click();
  return settings;
}

const fov = (page: Page) => page.evaluate(() => JSON.parse(localStorage.getItem('airsoft.settings') ?? '{}').fov as number | undefined);

test('Settings → Save downloads the save and loads it back, with Undo', async ({ page }) => {
  test.setTimeout(120_000);
  const errors = watchErrors(page);
  // A returning player's collection, saved once before the first load (not again on the reloads).
  await page.addInitScript(() => {
    if (sessionStorage.getItem('seeded')) return;
    sessionStorage.setItem('seeded', '1');
    localStorage.setItem('airsoft.collection', JSON.stringify({ version: 1, owned: { '000001@common': 1, '000003@common': 2 }, fc: 400, tokens: 1, seed: 1, futureField: 'kept' }));
  });
  await page.goto('/?nolock&seed=1');
  let settings = await openSaveTab(page);
  await expect(settings.getByRole('tabpanel', { name: /Save/ })).toContainText('Saved automatically');
  await expect(settings.getByText('Not downloaded yet.')).toBeVisible();

  // Graphics → Field of view to 100°, then download: the file has it (the slider's pending write goes in first).
  await settings.getByRole('tab', { name: /Graphics/ }).click();
  await settings.getByRole('slider', { name: 'Field of view' }).fill('100');
  await settings.getByRole('tab', { name: /Save/ }).click();
  const [download] = await Promise.all([page.waitForEvent('download'), settings.getByRole('button', { name: 'Download', exact: true }).click()]);
  expect(download.suggestedFilename()).toMatch(/^airsoft-save-\d{4}-\d{2}-\d{2}\.json$/);
  const text = await readFile((await download.path())!, 'utf8');
  const file = JSON.parse(text);
  expect(file).toMatchObject({ game: 'Airsoft', format: 1, summary: { fc: 400, tokens: 1, items: 3 } });
  expect(file.stores.settings.fov).toBe(100);
  expect(file.stores.collection.futureField).toBe('kept');
  expect(file.checksum).toMatch(/^sha256:/);
  await expect(settings.getByText(/Last downloaded just now/)).toBeVisible();

  // Change the FOV again, then load the file: the comparison shows, Replace reloads the game with the file's save.
  await settings.getByRole('tab', { name: /Graphics/ }).click();
  await settings.getByRole('slider', { name: 'Field of view' }).fill('80');
  await settings.getByRole('tab', { name: /Save/ }).click();
  await settings.locator('input[type="file"]').setInputFiles({ name: 'my-save.json', mimeType: 'application/json', buffer: Buffer.from(text) });
  const dialog = page.locator('.save-dialog');
  await expect(dialog).toBeVisible();
  await expect(dialog.locator('.save-compare')).toContainText('The file');
  await expect(dialog.locator('.save-compare')).toContainText('400');
  await expect(dialog.getByRole('button', { name: 'Cancel', exact: true })).toBeFocused();
  await Promise.all([page.waitForEvent('load'), dialog.getByRole('button', { name: 'Replace' }).click()]);
  settings = await openSaveTab(page);
  expect(await fov(page)).toBe(100);
  // Undo is there, and brings back the 80° save.
  await expect(settings.getByText('Brings back the save from before the last load.')).toBeVisible();
  await settings.getByRole('button', { name: 'Undo', exact: true }).click();
  await Promise.all([page.waitForEvent('load'), page.locator('.save-dialog').getByRole('button', { name: 'Undo' }).click()]);
  settings = await openSaveTab(page);
  expect(await fov(page)).toBe(80);
  await expect(settings.getByText('Nothing to undo.')).toBeVisible();

  // An edited file: a warning and "Load anyway"; Cancel leaves the save alone.
  file.stores.collection.fc = 99999;
  await settings.locator('input[type="file"]').setInputFiles({ name: 'edited.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(file)) });
  await expect(page.locator('.save-dialog')).toContainText('changed or damaged');
  await page.locator('.save-dialog').getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(page.locator('.save-dialog')).toBeHidden();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('airsoft.collection')!).fc)).toBe(400);

  // Not a save at all: refused with a line on the tab.
  await settings.locator('input[type="file"]').setInputFiles({ name: 'notes.json', mimeType: 'application/json', buffer: Buffer.from('{"hello": 1}') });
  await expect(settings.getByText("That file isn't an Airsoft save.")).toBeVisible();
  expect(errors()).toEqual([]);
});

test('a second tab waits behind a notice until Play here', async ({ page, context }) => {
  test.setTimeout(120_000);
  const errors = watchErrors(page);
  await page.goto('/?nolock&seed=1');
  await page.waitForSelector('.menu-title-start', { timeout: 30_000 });

  const second = await context.newPage();
  const secondErrors = watchErrors(second);
  await second.goto('/?nolock&seed=1');
  const notice = second.locator('.other-tab-notice');
  await expect(notice).toBeVisible({ timeout: 30_000 });
  await expect(notice).toContainText('Airsoft is open in another tab');
  await expect(second.locator('.menu-title-start')).toHaveCount(0);

  // Play here: the second tab reloads into the game, and the first stops behind the notice.
  await Promise.all([second.waitForEvent('load'), notice.getByRole('button', { name: 'Play here' }).click()]);
  await second.waitForSelector('.menu-title-start', { timeout: 30_000 });
  await expect(page.locator('.other-tab-notice')).toBeVisible();
  expect(errors()).toEqual([]);
  expect(secondErrors()).toEqual([]);
});
