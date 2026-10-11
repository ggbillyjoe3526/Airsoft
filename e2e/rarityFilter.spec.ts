import { expect, test } from '@playwright/test';

/**
 * M82 (owner's 0.1 Dev 4 note 4): the Loadout's replicas sort by rarity and can hide chosen tiers ("only Epic and
 * Legendary"), Customise does the same for parts, and both choices are there again after a reload.
 */
test('the Loadout and Customise sort and filter by rarity, and remember it (M82)', async ({ page }) => {
  test.setTimeout(120_000);
  const errors: string[] = [];
  page.on('pageerror', (err) => errors.push(`pageerror: ${err.message}`));
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(`console: ${msg.text()}`);
  });
  // A collection of several tiers (saved once: the reload below must read back what the page saved, not this).
  await page.addInitScript(() => {
    if (sessionStorage.getItem('m82-seeded')) return;
    sessionStorage.setItem('m82-seeded', '1');
    const owned = {
      '000001@common': 1, '000001@epic': 1, '000002@common': 1, '000002@rare': 1, '000002@legendary': 1, '000019@legendary': 1,
      '000003@common': 1, '000004@common': 1, '000007@common': 1, '000007@epic': 1, '000010@rare': 1,
    };
    localStorage.setItem('airsoft.collection', JSON.stringify({ version: 1, owned, fc: 0, tokens: 0, seed: 1 }));
  });
  const openLoadout = async () => {
    await page.goto('/?nolock&seed=1&quality=low');
    await page.waitForSelector('.menu-title-start', { timeout: 30_000 });
    await page.locator('.menu-title-start').click();
    await page.locator('.menu-topbar').getByRole('button', { name: 'Loadout', exact: true }).click();
  };
  await openLoadout();
  const loadout = page.locator('.menu-loadout');
  const tiles = loadout.locator('.replica-grid .replica-tile');
  const tilesTiers = () => tiles.evaluateAll((ts) => ts.map((t) => (t as HTMLElement).dataset.tier));
  const bar = loadout.getByRole('group', { name: 'Sort and filter by rarity' });
  // As it always came: by replica, each one's rarest copy first.
  await expect(bar.getByRole('button', { name: 'Replica', exact: true })).toHaveAttribute('aria-pressed', 'true');
  expect(await tilesTiers()).toEqual(['epic', 'common', 'legendary', 'rare', 'common', 'legendary']);

  // By rarity: rarest first. Then only Epic and Legendary (what you carry always shows).
  await bar.getByRole('button', { name: 'Rarity', exact: true }).click();
  expect(await tilesTiers()).toEqual(['legendary', 'legendary', 'epic', 'rare', 'common', 'common']);
  for (const tier of ['Common', 'Uncommon', 'Rare', 'Very Rare']) await bar.getByRole('button', { name: tier, exact: true }).click();
  await expect(bar.getByRole('button', { name: 'Common', exact: true })).toHaveAttribute('aria-pressed', 'false');
  const carriedTiers = await loadout.locator('.carried-card').evaluateAll((cs) => cs.map((c) => (c as HTMLElement).dataset.tier));
  const shown = await tilesTiers();
  for (const t of shown) expect(['epic', 'legendary', ...carriedTiers]).toContain(t);
  await expect(bar.locator('.rarity-hidden')).toHaveText(`${6 - shown.length} hidden`);

  // Customise: the parts sort and filter the same way, one choice for every part.
  await loadout.getByRole('button', { name: /^Primary: AEG Rifle/ }).click({ button: 'right' });
  await loadout.getByRole('tab', { name: /^Optic/ }).click();
  const optic = loadout.getByRole('group', { name: 'Optic', exact: true });
  const partBar = loadout.locator('.customise-panel:not([hidden])').getByRole('group', { name: 'Sort and filter by rarity' });
  await expect(optic.getByRole('button')).toHaveText([/None|Iron/i, /Red Dot/, /Red Dot/, /2x Scope/]);
  await partBar.getByRole('button', { name: 'Rarity', exact: true }).click();
  await partBar.getByRole('button', { name: 'Common', exact: true }).click();
  // "As it comes" stays first; the common Red Dot goes.
  await expect(optic.getByRole('button')).toHaveText([/None|Iron/i, /Red Dot.*Epic/i, /2x Scope.*Rare/i]);

  // Both remembered after a reload.
  await openLoadout();
  await expect(bar.getByRole('button', { name: 'Rarity', exact: true })).toHaveAttribute('aria-pressed', 'true');
  expect(await tilesTiers()).toEqual(shown);
  await loadout.getByRole('button', { name: /^Primary: AEG Rifle/ }).click({ button: 'right' });
  await loadout.getByRole('tab', { name: /^Optic/ }).click();
  await expect(partBar.getByRole('button', { name: 'Common', exact: true })).toHaveAttribute('aria-pressed', 'false');
  await expect(optic.getByRole('button')).toHaveCount(3);
  expect(errors).toEqual([]);
});
