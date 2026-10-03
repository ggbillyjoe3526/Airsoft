import { expect, test } from '@playwright/test';

/**
 * Smoke test: the built game boots to the title screen with no map loaded, goes through New game (the Map and
 * Difficulty pop-ups, the Loadout and Settings screens, a crosshair picked) and starts a match with a 2× scope, an
 * angled grip, a hi-cap and 0.28 g BBs, holds Tab for the scoreboard, fires, reloads, moves the fire selector, aims
 * down the scope and keeps running without a page error.
 *
 * Uses `?nolock` (no pointer lock; automated browsers can't take it): the fire button and wheel work without
 * the lock there, but the real lock flow, mouse look and Esc to pause stay manual tests. SwiftShader draws only
 * a few frames a second, so the simulation runs slower than real time: assert on page text, never on frames,
 * and poll rather than wait fixed times.
 */
test('the game boots, starts a match, fires, reloads and aims without errors', async ({ page }, testInfo) => {
  const errors: string[] = [];
  page.on('pageerror', (err) => errors.push(`pageerror: ${err.message}`));
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(`console: ${msg.text()}`);
  });
  const errorList = () => (errors.length > 0 ? errors.join(' | ') : 'none');

  await page.goto('/?nolock&seed=1');
  // Wait for the title screen or the boot's own failure text, whichever comes first.
  await page.waitForFunction(
    () => document.querySelector('.menu-title-start') !== null || /Failed/.test(document.getElementById('loading')?.textContent ?? ''),
    undefined,
    { timeout: 30_000 },
  ).catch(() => undefined);
  if ((await page.locator('.menu-title-start').count()) === 0) {
    const loading = (await page.locator('#loading').textContent().catch(() => null)) ?? '(gone)';
    throw new Error(`The title screen never appeared. Loading text: "${loading}". Page errors: ${errorList()}`);
  }
  await expect(page.locator('#loading')).toHaveCount(0);
  await expect(page.locator('.menu-title-wordmark')).toBeVisible();
  // No map is loaded until Play (M15b); the e2e build exposes the game as `airsoft`.
  const matchLoaded = () => page.evaluate(() => (window as unknown as { airsoft: { state: unknown } }).airsoft.state !== null);
  expect(await matchLoaded()).toBe(false);

  // Title → Start → New game, with the picked mode's rules under the four buttons.
  await page.getByRole('button', { name: 'Start' }).click();
  const setup = page.locator('.menu-setup');
  await expect(setup).toBeVisible();
  await expect(page.locator('.setup-rules')).not.toBeEmpty();

  // Map opens a pop-up listing Depot, the default.
  await setup.getByRole('button', { name: /Map/i }).click();
  const mapDialog = page.getByRole('dialog', { name: 'Map' });
  await expect(mapDialog).toBeVisible();
  await expect(mapDialog.getByRole('button', { name: /Depot/i })).toHaveAttribute('aria-pressed', 'true');
  await mapDialog.getByRole('button', { name: /Depot/i }).click();
  await expect(mapDialog).toBeHidden();
  await expect(setup.getByRole('button', { name: /Map/i })).toContainText('Depot');

  // Difficulty opens a pop-up; picking an option closes it and the button shows the choice.
  await setup.getByRole('button', { name: /Difficulty/i }).click();
  const dialog = page.getByRole('dialog', { name: 'Bot difficulty' });
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: /Hard/i }).click();
  await expect(dialog).toBeHidden();
  await expect(setup.getByRole('button', { name: /Difficulty/i })).toContainText('Hard');
  await setup.getByRole('button', { name: /Difficulty/i }).click();
  await dialog.getByRole('button', { name: /Normal/i }).click();

  // The Loadout screen: the replica in each slot, the optic, and a hop-up dial and BB weight per replica. Fit the red
  // dot and heavier BBs before the match.
  await setup.getByRole('button', { name: /Loadout/i }).click();
  const loadout = page.locator('.menu-loadout');
  await expect(loadout).toBeVisible();
  await expect(loadout.locator('.loadout-hopup input[type=range]')).toHaveCount(2);
  await expect(loadout.getByRole('group', { name: 'Primary replica' }).getByRole('button', { name: 'AEG rifle' })).toHaveAttribute('aria-pressed', 'true');
  await loadout.getByRole('button', { name: 'Red dot' }).click();
  await expect(loadout.getByRole('button', { name: 'Red dot' })).toHaveAttribute('aria-pressed', 'true');
  const rifleWeight = loadout.getByRole('group', { name: 'AEG rifle BB weight' });
  await expect(rifleWeight.getByRole('button', { name: '0.25 g' })).toHaveAttribute('aria-pressed', 'true');
  await rifleWeight.getByRole('button', { name: '0.28 g' }).click();
  await expect(loadout.getByText(/Leaves the barrel at \d+ m\/s .* Longest reach at about 75% hop-up/).first()).toBeVisible();
  await loadout.getByRole('button', { name: 'Back' }).click();
  await expect(setup.getByRole('button', { name: /Loadout/i })).toContainText('Red dot');
  await expect(setup.getByRole('button', { name: /Loadout/i })).toContainText('0.28 g / 0.20 g BBs');

  // Attachments (M17b): the 2× scope, an angled grip and a hi-cap on the rifle, each with its numbers under it.
  await setup.getByRole('button', { name: /Loadout/i }).click();
  await loadout.getByRole('button', { name: '2× scope' }).click();
  const rifleGrip = loadout.getByRole('group', { name: 'AEG rifle grip' });
  await expect(rifleGrip.getByRole('button', { name: 'No grip' })).toHaveAttribute('aria-pressed', 'true');
  await rifleGrip.getByRole('button', { name: 'Angled grip' }).click();
  await expect(loadout.getByText(/Brings the AEG rifle up in 0\.36 s/)).toBeVisible();
  await loadout.getByRole('group', { name: 'AEG rifle magazine' }).getByRole('button', { name: 'Hi-cap' }).click();
  await expect(loadout.getByText('120 BBs each, 2 carried (240 in all). Reload 1.8 s.')).toBeVisible();
  await expect(loadout.getByText('Replicas and outfit').first()).toBeAttached(); // skins, greyed as LATER
  await loadout.getByRole('button', { name: 'Back' }).click();
  await expect(setup.getByRole('button', { name: /Loadout/i })).toContainText('2× scope · Angled grip · Hi-cap mag');

  // Settings: its own screen with tabs; Esc works as Back and returns to New game, with focus back on the Settings tile.
  await setup.getByRole('button', { name: /Settings/i }).click();
  const settings = page.locator('.menu-settings');
  await expect(settings).toBeVisible();
  await settings.getByRole('tab', { name: /Graphics/i }).click();
  await expect(settings.getByRole('slider', { name: 'Field of view' })).toHaveValue('100');
  await settings.getByRole('tab', { name: /Key bindings/i }).click();
  await expect(settings.locator('.key-row').first()).toBeVisible();
  await settings.getByRole('tab', { name: /Audio/i }).click();
  await expect(settings.getByRole('slider', { name: /volume/i })).toHaveCount(3);
  // Crosshair (M19): a live preview, standing still and moving; the shape picked shows on both and in the match.
  await settings.getByRole('tab', { name: /Crosshair/i }).click();
  const previews = settings.locator('.crosshair-preview .hud-crosshair');
  await expect(previews).toHaveCount(2);
  await settings.getByRole('button', { name: 'Circle' }).click();
  await expect(previews.first()).toHaveClass(/\bshape-circle\b/);
  await page.keyboard.press('Escape');
  await expect(setup).toBeVisible();
  await expect(setup.getByRole('button', { name: /Settings/i })).toBeFocused();

  await setup.getByRole('button', { name: 'Play', exact: true }).click();
  await expect(page.locator('.menus')).toBeHidden({ timeout: 10_000 });
  expect(await matchLoaded()).toBe(true);
  await expect(page.locator('.hud')).toBeVisible();
  await expect(page.locator('.hud-replica-name')).toHaveText(/AEG rifle/i);
  await expect(page.locator('.hud .hud-crosshair')).toHaveClass(/\bshape-circle\b/);
  // Holding Tab shows the scoreboard with every player (M19); letting go hides it.
  const board = page.locator('.match-board');
  await page.keyboard.down('Tab');
  await expect(board).toBeVisible({ timeout: 10_000 });
  await expect(board.locator('tbody tr:not(:first-child)')).toHaveCount(6);
  await page.keyboard.up('Tab');
  await expect(board).toBeHidden({ timeout: 10_000 });
  const mag = page.locator('.hud-mag');
  await expect(mag).toHaveText(/^\d+$/);
  const full = Number(await mag.textContent());
  expect(full).toBe(120); // the hi-cap

  // Fire: hold the button until the magazine count drops.
  await page.mouse.move(640, 360);
  await page.mouse.down();
  await expect.poll(async () => Number(await mag.textContent()), { timeout: 20_000 }).toBeLessThan(full);
  await page.mouse.up();

  // Reload: the half-used magazine goes back in the pouch and a full one comes out.
  await page.keyboard.press('r');
  await expect.poll(async () => Number(await mag.textContent()), { timeout: 30_000 }).toBe(full);

  // Fire selector: the AEG starts on auto, and B steps it to single (semi).
  const fireMode = page.locator('.hud-firemode');
  await expect(fireMode).toHaveText('Auto');
  await page.keyboard.press('b');
  await expect(fireMode).toHaveText('Semi', { timeout: 10_000 });

  await testInfo.attach('in-match', { body: await page.screenshot(), contentType: 'image/png' });

  // Aim down the scope: hold the right button and the HUD swaps the crosshair for the eyepiece; let go and it's back.
  const hud = page.locator('.hud');
  await page.mouse.down({ button: 'right' });
  await expect(hud).toHaveClass(/\bscoped\b/, { timeout: 10_000 });
  await expect(page.locator('.hud-scope')).toBeVisible();
  await expect(page.locator('.hud-reddot')).toBeHidden();
  await testInfo.attach('aiming', { body: await page.screenshot(), contentType: 'image/png' });
  await page.mouse.up({ button: 'right' });
  await expect(hud).not.toHaveClass(/\baiming\b/, { timeout: 10_000 });
  expect(errors, `Page errors: ${errorList()}`).toEqual([]);
});
