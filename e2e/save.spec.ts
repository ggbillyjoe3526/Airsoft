import { expect, type Page, test } from '@playwright/test';

/**
 * The save system (M31) in a real browser: Settings → Save downloads the save as a file, loads one back (after the
 * side-by-side check, with Undo after), warns about an edited file, refuses what isn't a save, and a second tab waits
 * behind the "open in another tab" notice until Play here. Chromium only here; PLAYTEST lists the Firefox checks.
 */

/** Node's Buffer, for setInputFiles (the e2e files are type-checked without Node's types). */
declare const Buffer: { from(text: string): never };

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
  const stream = await download.createReadStream();
  let text = '';
  for await (const chunk of stream as unknown as AsyncIterable<{ toString(): string }>) text += chunk.toString();
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

/** A returning player's saves, written once before the first load (not again on the reloads). */
async function seedOnce(page: Page, entries: Record<string, unknown>) {
  await page.addInitScript((data) => {
    if (sessionStorage.getItem('seeded')) return;
    sessionStorage.setItem('seeded', '1');
    for (const [key, value] of Object.entries(data)) localStorage.setItem(key, JSON.stringify(value));
  }, entries);
}

const collectionOf = (page: Page) => page.evaluate(() => JSON.parse(localStorage.getItem('airsoft.collection') ?? 'null') as { fc: number; futureField?: string } | null);

/** A save file's text, for dropping or loading. */
function saveText(extra: Record<string, unknown> = {}, stores: Record<string, unknown> = {}): string {
  return JSON.stringify({ game: 'Airsoft', format: 1, build: 'v-test', savedAt: '2026-10-01T10:00:00.000Z', stores, ...extra });
}

test('Delete save asks first, offers a download, starts fresh and Undo brings it back; Restore uses the day\'s restore point', async ({ page }) => {
  test.setTimeout(150_000);
  const errors = watchErrors(page);
  await seedOnce(page, { 'airsoft.collection': { version: 1, owned: { '000001@common': 1 }, fc: 400, tokens: 1, seed: 1, futureField: 'kept' } });
  await page.goto('/?nolock&seed=1');
  let settings = await openSaveTab(page);

  // The first start of the day kept a restore point of the save as it was.
  const restoreButton = settings.getByRole('button', { name: /^Restore:.*400 FC/ });
  await expect(restoreButton).toBeVisible();
  await expect(settings.getByText('Nothing to undo.')).toBeVisible();

  // Delete save: the pop-up says what goes, Cancel has the focus, Download first downloads and leaves it open.
  await settings.getByRole('button', { name: 'Delete save', exact: true }).click();
  const dialog = page.locator('.save-dialog');
  await expect(dialog).toContainText('Delete your save?');
  await expect(dialog.getByRole('button', { name: 'Cancel', exact: true })).toBeFocused();
  const [download] = await Promise.all([page.waitForEvent('download'), dialog.getByRole('button', { name: 'Download first' }).click()]);
  expect(download.suggestedFilename()).toMatch(/^airsoft-save-\d{4}-\d{2}-\d{2}\.json$/);
  await expect(dialog).toBeVisible();
  // Cancel: nothing deleted.
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(dialog).toBeHidden();
  expect((await collectionOf(page))?.fc).toBe(400);

  // Delete: the game reloads as for a new player.
  await settings.getByRole('button', { name: 'Delete save', exact: true }).click();
  await Promise.all([page.waitForEvent('load'), dialog.getByRole('button', { name: 'Delete', exact: true }).click()]);
  settings = await openSaveTab(page);
  const fresh = await collectionOf(page);
  expect(fresh?.fc ?? 0).toBe(0);
  expect(fresh?.futureField).toBeUndefined();
  await expect(settings.getByText('Brings back the save from before the delete.')).toBeVisible();

  // Undo brings the whole save back, the field this build doesn't know included.
  await settings.getByRole('button', { name: 'Undo', exact: true }).click();
  await Promise.all([page.waitForEvent('load'), page.locator('.save-dialog').getByRole('button', { name: 'Undo' }).click()]);
  settings = await openSaveTab(page);
  expect(await collectionOf(page)).toMatchObject({ fc: 400, tokens: 1, futureField: 'kept' });

  // Change the collection behind the game's back, then Restore the day's point: it comes back, and Undo notes the restore.
  await page.evaluate(() => localStorage.setItem('airsoft.collection', JSON.stringify({ version: 1, owned: {}, fc: 999, tokens: 0, seed: 1 })));
  await settings.getByRole('button', { name: /^Restore:.*400 FC/ }).click();
  await expect(page.locator('.save-dialog')).toContainText('Restore this save?');
  await expect(page.locator('.save-dialog .save-compare')).toContainText('999');
  await Promise.all([page.waitForEvent('load'), page.locator('.save-dialog').getByRole('button', { name: 'Replace' }).click()]);
  settings = await openSaveTab(page);
  expect((await collectionOf(page))?.fc).toBe(400);
  await expect(settings.getByText('Brings back the save from before the last restore.')).toBeVisible();
  expect(errors()).toEqual([]);
});

test('a file that is too big, not a save, from a newer game or dropped on the page is handled on the Save tab', async ({ page }) => {
  test.setTimeout(120_000);
  const errors = watchErrors(page);
  await seedOnce(page, { 'airsoft.collection': { version: 1, owned: {}, fc: 400, tokens: 0, seed: 1 } });
  await page.goto('/?nolock&seed=1');
  const settings = await openSaveTab(page);
  const input = settings.locator('input[type="file"]');
  const message = settings.locator('.save-message');
  const upload = (name: string, text: string) => input.setInputFiles({ name, mimeType: 'application/json', buffer: Buffer.from(text) });

  // Over the size limit (2 MB): refused before it is read, no pop-up.
  await upload('huge.json', saveText({ filler: 'x'.repeat(2 * 1024 * 1024 + 10) }));
  await expect(message).toHaveText('That file is too big to be an Airsoft save.');
  await expect(page.locator('.save-dialog')).toBeHidden();

  // Text that isn't JSON.
  await upload('notes.json', 'just some words');
  await expect(message).toContainText("isn't an Airsoft save (it can't be read)");

  // A newer format: told to update, nothing replaced.
  await upload('future.json', saveText({ format: 2, build: 'v9-future' }));
  await expect(message).toContainText('newer version of the game (v9-future)');
  await expect(message).toContainText('Update the game');
  await expect(page.locator('.save-dialog')).toBeHidden();
  expect((await collectionOf(page))?.fc).toBe(400);

  // A good file dropped anywhere on the page while the Save tab shows opens the comparison.
  const good = saveText({}, { collection: { version: 1, owned: { '000002@epic': 2 }, fc: 5, tokens: 0, seed: 1 } });
  await page.evaluate((text) => {
    const data = new DataTransfer();
    data.items.add(new File([text], 'dropped.json', { type: 'application/json' }));
    document.body.dispatchEvent(new DragEvent('drop', { dataTransfer: data, bubbles: true, cancelable: true }));
  }, good);
  const dialog = page.locator('.save-dialog');
  await expect(dialog).toBeVisible();
  await expect(dialog.locator('.save-compare')).toContainText('The file');
  // This file has no checksum: a mismatch asks "Load anyway".
  await expect(dialog).toContainText('changed or damaged');
  await expect(dialog.getByRole('button', { name: 'Load anyway' })).toBeVisible();
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
  expect((await collectionOf(page))?.fc).toBe(400);
  expect(errors()).toEqual([]);
});

test('Load anyway on a checksum mismatch replaces the save', async ({ page }) => {
  test.setTimeout(120_000);
  const errors = watchErrors(page);
  await seedOnce(page, { 'airsoft.collection': { version: 1, owned: {}, fc: 400, tokens: 0, seed: 1 } });
  await page.goto('/?nolock&seed=1');
  const settings = await openSaveTab(page);
  const edited = saveText({ checksum: 'sha256:0000' }, { collection: { version: 1, owned: {}, fc: 77, tokens: 0, seed: 1 } });
  await settings.locator('input[type="file"]').setInputFiles({ name: 'edited.json', mimeType: 'application/json', buffer: Buffer.from(edited) });
  const dialog = page.locator('.save-dialog');
  await expect(dialog).toContainText('changed or damaged');
  await expect(dialog.getByRole('button', { name: 'Replace', exact: true })).toHaveCount(0);
  await Promise.all([page.waitForEvent('load'), dialog.getByRole('button', { name: 'Load anyway' }).click()]);
  expect((await collectionOf(page))?.fc).toBe(77);
  expect(errors()).toEqual([]);
});

test('mid-match, the Save tab cannot load, restore, undo or delete, but still downloads', async ({ page }) => {
  test.setTimeout(150_000);
  const errors = watchErrors(page);
  await seedOnce(page, { 'airsoft.collection': { version: 1, owned: { '000001@common': 1 }, fc: 400, tokens: 0, seed: 1 } });
  await page.goto('/?nolock&seed=1');
  await page.waitForSelector('.menu-title-start', { timeout: 30_000 });
  await page.getByRole('button', { name: 'Start' }).click();
  await page.locator('.menu-setup').getByRole('button', { name: 'Play', exact: true }).click();
  await expect(page.locator('.menus')).toBeHidden({ timeout: 30_000 });
  // Tabbing away pauses the match (no pointer lock here).
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { value: true, configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  const pause = page.locator('.menu-pause');
  await expect(pause).toBeVisible({ timeout: 10_000 });
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { value: false, configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await pause.getByRole('button', { name: 'Settings' }).click();
  const settings = page.locator('.menu-settings');
  await settings.getByRole('tab', { name: /Save/ }).click();

  await expect(settings.getByText('Leave the match to load a save.')).toBeVisible();
  await expect(settings.getByRole('button', { name: 'Load file' })).toBeDisabled();
  await expect(settings.getByRole('button', { name: 'Undo', exact: true })).toBeDisabled();
  await expect(settings.getByRole('button', { name: 'Delete save', exact: true })).toBeDisabled();
  await expect(settings.getByRole('button', { name: /^Restore:/ })).toBeDisabled();
  await expect(settings.getByRole('button', { name: 'Download', exact: true })).toBeEnabled();

  // A dropped file is ignored too.
  await page.evaluate(async (text) => {
    const data = new DataTransfer();
    data.items.add(new File([text], 'dropped.json', { type: 'application/json' }));
    document.body.dispatchEvent(new DragEvent('drop', { dataTransfer: data, bubbles: true, cancelable: true }));
    // Reading a file takes a round trip: let one pass, so a load that was going to start has started.
    await new File(['x'], 'x.txt').text();
    await new Promise((resolve) => setTimeout(resolve, 0));
  }, saveText());
  await expect(page.locator('.save-dialog')).toBeHidden();

  const [download] = await Promise.all([page.waitForEvent('download'), settings.getByRole('button', { name: 'Download', exact: true }).click()]);
  expect(download.suggestedFilename()).toMatch(/^airsoft-save-/);

  // Back to the title and New game's Settings: loading is possible again.
  await settings.getByRole('button', { name: 'Back', exact: true }).click();
  await expect(pause).toBeVisible();
  expect(errors()).toEqual([]);
});

test('with browser storage blocked the title and Save tab say so, and Download still has the visit\'s save', async ({ page }) => {
  test.setTimeout(120_000);
  const errors = watchErrors(page);
  await page.addInitScript(() => {
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      get() {
        throw new DOMException('denied', 'SecurityError');
      },
    });
  });
  await page.goto('/?nolock&seed=1');
  await page.waitForSelector('.menu-title-start', { timeout: 30_000 });
  await expect(page.locator('.menu-title-warning')).toContainText("isn't keeping your save");
  let settings = await openSaveTab(page);
  await expect(settings.locator('.save-problem')).toContainText("isn't keeping your save");
  // Nothing can be replaced when the browser would lose it at the reload.
  await expect(settings.getByRole('button', { name: 'Load file' })).toBeDisabled();
  await expect(settings.getByRole('button', { name: 'Delete save', exact: true })).toBeDisabled();

  await settings.getByRole('tab', { name: /Graphics/ }).click();
  await settings.getByRole('slider', { name: 'Field of view' }).fill('101');
  await settings.getByRole('tab', { name: /Save/ }).click();
  const [download] = await Promise.all([page.waitForEvent('download'), settings.getByRole('button', { name: 'Download', exact: true }).click()]);
  const stream = await download.createReadStream();
  let text = '';
  for await (const chunk of stream as unknown as AsyncIterable<{ toString(): string }>) text += chunk.toString();
  expect(JSON.parse(text).stores.settings.fov).toBe(101);
  settings = page.locator('.menu-settings');
  await expect(settings.getByText(/Last downloaded just now/)).toBeVisible();
  expect(errors()).toEqual([]);
});

test('a browser save from a newer format is not overwritten: the title and Save tab say so', async ({ page }) => {
  test.setTimeout(120_000);
  const errors = watchErrors(page);
  const newerMeta = { format: 99, build: 'v9-future', savedAt: null, downloadedAt: null };
  const newerSettings = { version: 1, fov: 70, laterField: 'kept' };
  await seedOnce(page, { 'airsoft.save.meta': newerMeta, 'airsoft.settings': newerSettings, 'airsoft.collection': { version: 1, owned: {}, fc: 70, tokens: 0, seed: 1 } });
  await page.goto('/?nolock&seed=1');
  await page.waitForSelector('.menu-title-start', { timeout: 30_000 });
  await expect(page.locator('.menu-title-warning')).toContainText('newer version (v9-future)');
  const settings = await openSaveTab(page);
  await expect(settings.locator('.save-problem')).toContainText('newer version (v9-future)');
  await expect(settings.getByRole('button', { name: 'Load file' })).toBeDisabled();

  // A change lasts for the visit (and a download has it) but the browser's save stays as it was.
  await settings.getByRole('tab', { name: /Graphics/ }).click();
  await settings.getByRole('slider', { name: 'Field of view' }).fill('100');
  await settings.getByRole('tab', { name: /Save/ }).click();
  const [download] = await Promise.all([page.waitForEvent('download'), settings.getByRole('button', { name: 'Download', exact: true }).click()]);
  const stream = await download.createReadStream();
  let text = '';
  for await (const chunk of stream as unknown as AsyncIterable<{ toString(): string }>) text += chunk.toString();
  expect(JSON.parse(text).stores.settings.fov).toBe(100);
  // The download wrote the pending change; frozen, it stayed in memory. The browser's copy is as it was.
  const stored = await page.evaluate(() => ({ meta: localStorage.getItem('airsoft.save.meta'), settings: localStorage.getItem('airsoft.settings') }));
  expect(JSON.parse(stored.meta!)).toEqual(newerMeta);
  expect(JSON.parse(stored.settings!)).toEqual(newerSettings);
  expect(errors()).toEqual([]);
});

test('Protect from automatic clearing asks only when pressed and shows the answer', async ({ page }) => {
  test.setTimeout(120_000);
  const errors = watchErrors(page);
  await page.addInitScript(() => {
    const w = window as unknown as { persistCalls: number };
    w.persistCalls = 0;
    navigator.storage.persisted = async () => false;
    navigator.storage.persist = async () => {
      w.persistCalls++;
      return false;
    };
  });
  await page.goto('/?nolock&seed=1');
  const settings = await openSaveTab(page);
  const protect = settings.getByRole('button', { name: 'Protect', exact: true });
  await expect(protect).toBeEnabled();
  expect(await page.evaluate(() => (window as unknown as { persistCalls: number }).persistCalls)).toBe(0);
  await protect.click();
  await expect(settings.getByText(/The browser said no for now/)).toBeVisible();
  expect(await page.evaluate(() => (window as unknown as { persistCalls: number }).persistCalls)).toBe(1);

  // Granted: the button turns into "Protected".
  await page.evaluate(() => {
    navigator.storage.persist = async () => true;
  });
  await protect.click();
  await expect(settings.getByRole('button', { name: 'Protected', exact: true })).toBeDisabled();
  expect(errors()).toEqual([]);
});

test('Play here writes what the first tab had pending before it stops saving', async ({ page, context }) => {
  test.setTimeout(150_000);
  const errors = watchErrors(page);
  // The slider's delayed write (400 ms) is held back in this tab, so the change is still pending at the takeover.
  await page.addInitScript(() => {
    const real = window.setTimeout.bind(window);
    window.setTimeout = ((fn: TimerHandler, ms?: number, ...args: unknown[]) => real(fn, ms === 400 ? 600_000 : ms, ...args)) as typeof window.setTimeout;
  });
  await page.goto('/?nolock&seed=1');
  const settings = await openSaveTab(page);
  await settings.getByRole('tab', { name: /Graphics/ }).click();
  await settings.getByRole('slider', { name: 'Field of view' }).fill('103');
  const stored = () => page.evaluate(() => JSON.parse(localStorage.getItem('airsoft.settings') ?? '{}').fov as number | undefined);
  expect(await stored()).not.toBe(103); // still pending

  const second = await context.newPage();
  await second.goto('/?nolock&seed=1');
  const notice = second.locator('.other-tab-notice');
  await expect(notice).toBeVisible({ timeout: 30_000 });
  await Promise.all([second.waitForEvent('load'), notice.getByRole('button', { name: 'Play here' }).click()]);
  await second.waitForSelector('.menu-title-start', { timeout: 30_000 });
  expect(await second.evaluate(() => JSON.parse(localStorage.getItem('airsoft.settings') ?? '{}').fov)).toBe(103);
  expect(errors()).toEqual([]);
});
