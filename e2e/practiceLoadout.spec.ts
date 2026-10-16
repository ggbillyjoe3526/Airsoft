import { expect, test } from '@playwright/test';

/**
 * Practice with any replica (M95): in Practice the Loadout key (L) opens the Loadout straight from play, on the slot of
 * the replica in hand, saying what it is for there and offering Back to practice. A replica you own clicked goes into
 * your hands; L takes you back where you stood, on the same slot, the new replica coming up. With Dev settings ›
 * Disable levelling on (LV1; Unlock all gear before), every replica is on offer. `?nolock`, as the other browser tests
 * (no mouse lock in automation).
 */
type Armament = { active: number; draw: number; replicas: { id: string; name: string }[] };
type Game = { airsoft: { state: { characters: { position: { x: number; z: number }; armament: Armament }[] }; input: { yaw: number } } };

test('the Loadout key in Practice swaps the replica in hand and goes back where you stood', async ({ page }) => {
  test.setTimeout(120_000);
  const errors: string[] = [];
  page.on('pageerror', (err) => errors.push(`pageerror: ${err.message}`));
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(`console: ${msg.text()}`);
  });
  // A returning player at the level cap, so the Cyber Pistol (level 10, LV1) is theirs besides the starters.
  await page.addInitScript(() => localStorage.setItem('airsoft.progress', JSON.stringify({ version: 1, xp: 6500, unlocked: [], rev: 1 })));
  // Low, so the range draws fast enough in software on a CI runner (as the other range tests).
  await page.goto('/?nolock&seed=1&quality=low');
  await page.waitForSelector('.menu-title-start', { timeout: 30_000 });
  await page.locator('.menu-title-start').click();
  await page.locator('.menu-setup').getByRole('group', { name: 'Mode', exact: true }).getByRole('button', { name: /Practice/ }).click();
  await page.locator('.menu-setup').getByRole('button', { name: 'Start practice', exact: true }).click();
  const readout = page.locator('.range-readout');
  await expect(readout).toBeVisible();
  // Before the first shot the readout names the key.
  await expect(readout).toContainText('L for the Loadout');

  const armament = () => page.evaluate(() => (window as unknown as Game).airsoft.state.characters[0]!.armament);
  const where = () =>
    page.evaluate(() => {
      const g = (window as unknown as Game).airsoft;
      return { ...g.state.characters[0]!.position, yaw: g.input.yaw };
    });
  // Take the pistol, and turn a little so the way back is checked against a pose that isn't the spawn's.
  await page.keyboard.press('Digit2');
  await expect.poll(async () => (await armament()).active).toBe(1);
  await page.evaluate(() => ((window as unknown as Game).airsoft.input.yaw += 0.4));
  const before = await where();
  expect((await armament()).replicas[1]!.name).toBe('GBB Pistol');

  // L: the Loadout, on the Secondary (the slot in hand), with the Practice line and Back to practice.
  await page.keyboard.press('KeyL');
  const loadout = page.locator('.menu-loadout');
  await expect(loadout).toBeVisible({ timeout: 10_000 });
  await expect(loadout.getByRole('button', { name: /^Secondary: GBB Pistol/ })).toHaveAttribute('aria-pressed', 'true');
  await expect(loadout.getByText(/^Practice: take any replica you have unlocked/)).toBeVisible();
  const back = page.locator('.menu-topbar').getByRole('button', { name: 'Back to practice' });
  await expect(back).toBeVisible();
  await expect(back.locator('kbd')).toHaveText('L');

  // The Cyber Pistol into the hand's slot; L goes back to practice.
  await loadout.locator('.replica-tile', { hasText: 'Cyber Pistol' }).click();
  await expect(loadout.getByRole('button', { name: /^Secondary: Cyber Pistol/ })).toBeVisible();
  await page.keyboard.press('KeyL');
  await expect(page.locator('.menus')).toBeHidden({ timeout: 10_000 });
  const after = await armament();
  expect(after.active).toBe(1);
  expect(after.replicas[1]!.name).toBe('Cyber Pistol');
  const at = await where();
  expect(at.x).toBeCloseTo(before.x, 1);
  expect(at.z).toBeCloseTo(before.z, 1);
  expect(at.yaw).toBeCloseTo(before.yaw, 3);
  // Played on, the key doesn't open the Loadout again by itself (the press that went back isn't a press in play).
  await page.waitForTimeout(500);
  await expect(page.locator('.menus')).toBeHidden();

  // L again, then Esc: Back to the pause menu (Esc can't take the mouse), whose Resume plays on.
  await page.keyboard.press('KeyL');
  await expect(loadout).toBeVisible({ timeout: 10_000 });
  await page.keyboard.press('Escape');
  const pause = page.locator('.menu-pause');
  await expect(pause).toBeVisible();
  await expect(pause.getByRole('button', { name: 'Loadout' })).toBeVisible();
  // The pause menu's Loadout is Practice's too: Back to practice shows, and clicking it plays on.
  await pause.getByRole('button', { name: 'Loadout' }).click();
  await expect(back).toBeVisible();
  await back.click();
  await expect(page.locator('.menus')).toBeHidden({ timeout: 10_000 });
  expect((await armament()).replicas[1]!.name).toBe('Cyber Pistol');

  // Dev settings › Disable levelling: every replica is on offer, and the Loadout says so.
  await page.keyboard.press('KeyL');
  await expect(loadout).toBeVisible({ timeout: 10_000 });
  await page.keyboard.press('Escape');
  await pause.getByRole('button', { name: 'Settings' }).click();
  const settings = page.locator('.menu-settings');
  await settings.getByRole('checkbox', { name: 'Dev settings' }).check();
  await settings.getByRole('group', { name: 'Disable levelling' }).getByRole('button', { name: 'On' }).click();
  await page.keyboard.press('Escape');
  await pause.getByRole('button', { name: 'Loadout' }).click();
  await expect(loadout.getByText(/^Disable levelling is on/)).toBeVisible();
  await expect(loadout.locator('.replica-tile', { hasText: 'AEG Rifle' })).not.toHaveCount(0);
  // One of each public replica (no rarity copies since LV1), none of them locked.
  await expect(loadout.locator('.replica-tile')).toHaveCount(3);
  await expect(loadout.locator('.replica-tile.is-locked')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('the Loadout key does nothing in a match', async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto('/?nolock&seed=1&quality=low');
  await page.waitForSelector('.menu-title-start', { timeout: 30_000 });
  await page.locator('.menu-title-start').click();
  await page.locator('.menu-setup').getByRole('button', { name: 'Start match', exact: true }).click();
  await expect(page.locator('.menus')).toBeHidden({ timeout: 60_000 });
  await page.keyboard.press('KeyL');
  await page.waitForTimeout(500);
  await expect(page.locator('.menus')).toBeHidden();
  await expect(page.locator('.menu-loadout')).toBeHidden();
});

test('saved loadouts: a new loadout on the Loadout, key 1 back, and the Match screen picker names and switches them (SL1)', async ({ page }) => {
  test.setTimeout(120_000);
  const errors: string[] = [];
  page.on('pageerror', (err) => errors.push(`pageerror: ${err.message}`));
  await page.goto('/?nolock&seed=1&quality=low');
  await page.waitForSelector('.menu-title-start', { timeout: 30_000 });
  await page.locator('.menu-title-start').click();
  const setup = page.locator('.menu-setup');
  const pick = setup.locator('.loadout-pick');
  await expect(pick).toHaveAttribute('aria-label', 'Saved loadout: Loadout 1. Pick another');
  await setup.getByRole('button', { name: /^Change/ }).click();
  const loadout = page.locator('.menu-loadout');
  // The dropdown names the loadout carried (MR1); New makes one and asks its name.
  const current = loadout.locator('.saved-pick-name');
  await expect(current).toHaveText('Loadout 1');
  await loadout.locator('.saved-action', { hasText: 'New' }).click();
  const box = loadout.locator('.saved-pick-input');
  await expect(box).toBeFocused();
  await box.fill('Long range');
  await box.press('Enter');
  await expect(current).toHaveText('Long range');
  // Key 1 carries the first loadout again; the list marks the one carried.
  await page.keyboard.press('Digit1');
  await expect(current).toHaveText('Loadout 1');
  await loadout.locator('.saved-pick').click();
  const saved = page.locator('.context-menu:visible');
  await expect(saved.getByRole('button', { name: /^Long range/ })).toBeVisible();
  await page.keyboard.press('Escape');
  // The Match screen's pick lists both, and a pick switches.
  await page.keyboard.press('Escape'); // Back
  await expect(pick).toBeVisible();
  await pick.click();
  const list = page.locator('.context-menu:visible');
  await expect(list.getByRole('button', { name: /^Long range/ })).toBeVisible();
  await expect(list.getByRole('button', { name: /^Manage loadouts/ })).toBeVisible();
  await list.getByRole('button', { name: /^Long range/ }).click();
  await expect(pick).toHaveAttribute('aria-label', 'Saved loadout: Long range. Pick another');
  await expect(pick.locator('.loadout-pick-name')).toHaveText('Long range');
  expect(errors).toEqual([]);
});
