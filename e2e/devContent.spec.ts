import { expect, test } from '@playwright/test';

/**
 * Dev content (M35): the Dev tab's Dev content switch shows content still being built and hides it again. Woodland is
 * dev content today: with the switch off the Map pop-up doesn't list it at all; on, it is listed under Depot like any
 * other map and can be picked (M33d); off again, it is hidden and Depot plays, while the pick stays saved. A test of
 * its own, so the long match test in boot.spec.ts plays the same way as before. Neon Heights (M34c) is dev content too,
 * listed and hidden with Woodland, and the second test picks it by Day (M34d's switch) and plays it; the third plays it by
 * Night, with its lamps and neon (M34e). Uses `?nolock` like the other smoke tests.
 */
test('the Dev content switch lists Woodland in the Map pop-up, lets it be picked, and hides it again', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (err) => errors.push(`pageerror: ${err.message}`));
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(`console: ${msg.text()}`);
  });
  await page.goto('/?nolock&seed=1');
  await expect(page.locator('.menu-title-start')).toBeVisible({ timeout: 30_000 });
  await page.getByRole('button', { name: 'Start' }).click();
  const setup = page.locator('.menu-setup');
  await expect(setup).toBeVisible();

  const mapDialog = page.getByRole('dialog', { name: 'Map' });
  const woodland = mapDialog.getByRole('button', { name: /Woodland/i });
  const neonHeights = mapDialog.getByRole('button', { name: /Neon Heights/i });
  const openMap = async (): Promise<void> => {
    await setup.getByRole('button', { name: /Map/i }).click();
    await expect(mapDialog).toBeVisible();
    await expect(mapDialog.getByRole('button', { name: /Depot/i })).toHaveAttribute('aria-pressed', 'true');
  };
  const closeMap = async (): Promise<void> => {
    await page.keyboard.press('Escape');
    await expect(mapDialog).toBeHidden();
    await expect(setup).toBeVisible();
  };
  const devContent = async (on: boolean): Promise<void> => {
    await setup.getByRole('button', { name: /^Settings/ }).click();
    const settings = page.locator('.menu-settings');
    const devBox = settings.getByRole('checkbox', { name: 'Dev settings' });
    if (!(await devBox.isChecked())) await devBox.check();
    await expect(settings.getByRole('tab', { name: /^Dev$/i })).toHaveAttribute('aria-selected', 'true');
    const group = settings.getByRole('group', { name: 'Dev content' });
    await group.getByRole('button', { name: on ? 'On' : 'Off' }).click();
    await expect(group.getByRole('button', { name: on ? 'On' : 'Off' })).toHaveAttribute('aria-pressed', 'true');
    await page.keyboard.press('Escape');
    await expect(setup).toBeVisible();
  };

  // Off (the default): Woodland isn't listed at all, not even greyed out.
  await openMap();
  await expect(woodland).toBeHidden();
  await expect(neonHeights).toBeHidden();
  await closeMap();

  // On: listed under Depot like any other map, no tag, and it can be picked (M33d).
  await devContent(true);
  await openMap();
  await expect(woodland).toBeVisible();
  await expect(woodland).toBeEnabled();
  await expect(woodland).not.toContainText('Coming soon');
  await expect(neonHeights).toBeVisible();
  await expect(neonHeights).toBeEnabled();
  await woodland.click();
  await expect(mapDialog).toBeHidden();
  await expect(setup.getByRole('button', { name: /Map/i })).toContainText('Woodland');

  // Off again: gone, and Depot plays; the pick stays saved, so turning the switch on brings Woodland back.
  await devContent(false);
  await expect(setup.getByRole('button', { name: /Map/i })).toContainText('Depot');
  await openMap();
  await expect(woodland).toBeHidden();
  await expect(neonHeights).toBeHidden();
  await closeMap();
  await devContent(true);
  await expect(setup.getByRole('button', { name: /Map/i })).toContainText('Woodland');

  expect(errors, errors.join(' | ')).toEqual([]);
});

test('Neon Heights (dev content, M34c) picked by Day (M34d) loads and plays: the city builds, the HUD and minimap come up, no errors', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (err) => errors.push(`pageerror: ${err.message}`));
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(`console: ${msg.text()}`);
  });
  await page.goto('/?nolock&seed=1');
  await expect(page.locator('.menu-title-start')).toBeVisible({ timeout: 30_000 });
  await page.getByRole('button', { name: 'Start' }).click();
  const setup = page.locator('.menu-setup');
  await expect(setup).toBeVisible();
  await setup.getByRole('button', { name: /^Settings/ }).click();
  const settings = page.locator('.menu-settings');
  await settings.getByRole('checkbox', { name: 'Dev settings' }).check();
  await settings.getByRole('group', { name: 'Dev content' }).getByRole('button', { name: 'On' }).click();
  await page.keyboard.press('Escape');
  await expect(setup).toBeVisible();
  await setup.getByRole('button', { name: /Map/i }).click();
  // Day or Night on the map's option (M34d): Night the first time; picking Day picks the map with that light.
  const light = page.getByRole('dialog', { name: 'Map' }).getByRole('group', { name: 'Neon Heights: Light' });
  await expect(light.getByRole('button', { name: 'Night' })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('dialog', { name: 'Map' }).getByRole('group', { name: /Depot/ })).toHaveCount(0);
  await light.getByRole('button', { name: 'Day' }).click();
  await expect(page.getByRole('dialog', { name: 'Map' })).toBeHidden();
  await expect(setup.getByRole('button', { name: /Map/i })).toContainText('Neon Heights · Day');
  await setup.getByRole('button', { name: 'Play', exact: true }).click();
  await expect(page.locator('.menus')).toBeHidden({ timeout: 20_000 });
  expect(await page.evaluate(() => (window as unknown as { airsoft: { state: unknown } }).airsoft.state !== null)).toBe(true);
  await expect(page.locator('.hud')).toBeVisible();
  await expect(page.locator('.minimap')).toBeVisible();
  // It is Neon Heights that was built (the session's setup names the map), with both teams in its yards: 4v4 is its
  // standard team size, so at least six stand in play, and Neon Heights' yards are at x -20 and +22.6 (Depot's -22.7 and 24).
  type Played = { airsoft: { session: { setup: { map: { name: string; night?: boolean; lighting?: { presets: string[] } } } }; state: { tick: number; characters: { position: { x: number; y: number } }[] } } };
  expect(await page.evaluate(() => (window as unknown as Played).airsoft.session.setup.map.name)).toBe('Neon Heights');
  // Played by Day: the day preset first for the lighting path, and no night for the bots' sight or glowing BBs.
  const lit = await page.evaluate(() => {
    const m = (window as unknown as Played).airsoft.session.setup.map;
    return { night: m.night, first: m.lighting?.presets[0] };
  });
  expect(lit).toEqual({ night: false, first: 'day' });
  // By Day the lamps are off (M34e): no light pools in the scene, and the signs are painted boards.
  const scene = await page.evaluate(() => {
    const s = (window as unknown as { airsoft: { session: { renderer: { scene: { getObjectByName(n: string): unknown } } } } }).airsoft.session.renderer.scene;
    return { pools: s.getObjectByName('pool-glow') !== undefined, signs: s.getObjectByName('map-signs') !== undefined };
  });
  expect(scene).toEqual({ pools: false, signs: true });
  const placed = () => page.evaluate(() => (window as unknown as Played).airsoft.state.characters.map((c) => c.position));
  const yards = await placed();
  expect(yards.length).toBeGreaterThanOrEqual(6);
  expect(Math.min(...yards.map((p) => p.x))).toBeLessThan(-18);
  expect(Math.max(...yards.map((p) => p.x))).toBeGreaterThan(18);
  // Play on: the simulation runs two more seconds of game time, the bots set off from their yards, and nobody falls
  // off a floor (the lowest floor is the street at 0).
  const tick = () => page.evaluate(() => (window as unknown as Played).airsoft.state.tick);
  const start = await tick();
  await expect.poll(tick, { timeout: 60_000 }).toBeGreaterThan(start + 120);
  const after = await placed();
  expect(after.some((p, i) => Math.hypot(p.x - yards[i]!.x, p.y - yards[i]!.y) > 1)).toBe(true);
  expect(Math.min(...after.map((p) => p.y))).toBeGreaterThanOrEqual(-0.5);
  expect(errors, errors.join(' | ')).toEqual([]);
});

test('Neon Heights by Night (M34e, the default light) plays with its lamps lit and its neon glowing, no errors', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (err) => errors.push(`pageerror: ${err.message}`));
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(`console: ${msg.text()}`);
  });
  await page.goto('/?nolock&seed=1');
  await expect(page.locator('.menu-title-start')).toBeVisible({ timeout: 30_000 });
  await page.getByRole('button', { name: 'Start' }).click();
  const setup = page.locator('.menu-setup');
  await expect(setup).toBeVisible();
  await setup.getByRole('button', { name: /^Settings/ }).click();
  const settings = page.locator('.menu-settings');
  await settings.getByRole('checkbox', { name: 'Dev settings' }).check();
  await settings.getByRole('group', { name: 'Dev content' }).getByRole('button', { name: 'On' }).click();
  await page.keyboard.press('Escape');
  await setup.getByRole('button', { name: /Map/i }).click();
  await page.getByRole('dialog', { name: 'Map' }).getByRole('button', { name: /Neon Heights/i }).click();
  await expect(setup.getByRole('button', { name: /Map/i })).toContainText('Neon Heights · Night');
  await setup.getByRole('button', { name: 'Play', exact: true }).click();
  await expect(page.locator('.menus')).toBeHidden({ timeout: 20_000 });
  await expect(page.locator('.hud')).toBeVisible();
  type Lit = {
    airsoft: {
      session: { setup: { map: { name: string; night?: boolean; lights?: unknown[] } }; renderer: { scene: { getObjectByName(n: string): unknown } } };
      state: { tick: number };
    };
  };
  const seen = await page.evaluate(() => {
    const { session } = (window as unknown as Lit).airsoft;
    const scene = session.renderer.scene;
    return {
      name: session.setup.map.name,
      night: session.setup.map.night,
      lamps: (session.setup.map.lights ?? []).length,
      pools: scene.getObjectByName('pool-glow') !== undefined,
      signs: scene.getObjectByName('map-signs') !== undefined,
    };
  });
  expect(seen.name).toBe('Neon Heights');
  expect(seen.night).toBe(true);
  expect(seen.lamps).toBeGreaterThan(0);
  expect(seen.pools).toBe(true);
  expect(seen.signs).toBe(true);
  const tick = () => page.evaluate(() => (window as unknown as Lit).airsoft.state.tick);
  const start = await tick();
  await expect.poll(tick, { timeout: 60_000 }).toBeGreaterThan(start + 120);
  expect(errors, errors.join(' | ')).toEqual([]);
});

test('the Day | Night pick on Neon Heights (M34d) is named on the Map tile, kept through Dev content off and on, restored on the next visit, and reached by keyboard', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (err) => errors.push(`pageerror: ${err.message}`));
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(`console: ${msg.text()}`);
  });
  const setup = page.locator('.menu-setup');
  const mapTile = setup.getByRole('button', { name: /Map/i });
  const mapDialog = page.getByRole('dialog', { name: 'Map' });
  const light = mapDialog.getByRole('group', { name: 'Neon Heights: Light' });
  const toSetup = async (): Promise<void> => {
    await page.goto('/?nolock&seed=1');
    await expect(page.locator('.menu-title-start')).toBeVisible({ timeout: 30_000 });
    await page.getByRole('button', { name: 'Start' }).click();
    await expect(setup).toBeVisible();
  };
  const devContent = async (on: boolean): Promise<void> => {
    await setup.getByRole('button', { name: /^Settings/ }).click();
    const settings = page.locator('.menu-settings');
    const devBox = settings.getByRole('checkbox', { name: 'Dev settings' });
    if (!(await devBox.isChecked())) await devBox.check();
    const group = settings.getByRole('group', { name: 'Dev content' });
    await group.getByRole('button', { name: on ? 'On' : 'Off' }).click();
    await expect(group.getByRole('button', { name: on ? 'On' : 'Off' })).toHaveAttribute('aria-pressed', 'true');
    await page.keyboard.press('Escape');
    await expect(setup).toBeVisible();
  };
  const savedLight = () => page.evaluate(() => (JSON.parse(localStorage.getItem('airsoft.settings') ?? '{}') as Record<string, unknown>)['lighting.neonHeights']);

  await toSetup();
  // Depot (the default) offers one light: no switch, and the Map tile names no light.
  await expect(mapTile).toContainText('Depot');
  await expect(mapTile).not.toContainText('·');
  await devContent(true);
  await mapTile.click();
  await expect(mapDialog.getByRole('button', { name: /Woodland/i })).toBeVisible();
  // Only the map with two lights has a switch (not Depot, not Woodland), Night first.
  await expect(mapDialog.getByRole('group')).toHaveCount(1);
  await expect(light.getByRole('button')).toHaveText(['Day', 'Night']);
  await expect(light.getByRole('button', { name: 'Night' })).toHaveAttribute('aria-pressed', 'true');
  await expect(light.getByRole('button', { name: 'Day' })).toHaveAttribute('aria-pressed', 'false');
  expect(await savedLight()).toBeUndefined();
  // By keyboard: the picked map's own button has the focus, Tab reaches its Day then Night, Enter picks Day with the map.
  await mapDialog.getByRole('button', { name: /Depot/i }).focus();
  await mapDialog.getByRole('button', { name: /Neon Heights/i }).focus();
  await page.keyboard.press('Tab');
  await expect(light.getByRole('button', { name: 'Day' })).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(light.getByRole('button', { name: 'Night' })).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await page.keyboard.press('Enter');
  await expect(mapDialog).toBeHidden();
  await expect(mapTile).toContainText('Neon Heights · Day');
  expect(await savedLight()).toBe('day');

  // Opening the pop-up again shows the map and the side picked; the other side picks the same map under that light.
  await mapTile.click();
  await expect(mapDialog.getByRole('button', { name: /Neon Heights/i })).toHaveAttribute('aria-pressed', 'true');
  await expect(light.getByRole('button', { name: 'Day' })).toHaveAttribute('aria-pressed', 'true');
  await light.getByRole('button', { name: 'Night' }).click();
  await expect(mapTile).toContainText('Neon Heights · Night');
  expect(await savedLight()).toBe('night');
  await mapTile.click();
  await light.getByRole('button', { name: 'Day' }).click();
  await expect(mapTile).toContainText('Neon Heights · Day');

  // Dev content off: Depot plays and names no light, the switch is gone; the pick stays, so on again it is back.
  await devContent(false);
  await expect(mapTile).toContainText('Depot');
  await expect(mapTile).not.toContainText('·');
  await mapTile.click();
  await expect(mapDialog.getByRole('group')).toHaveCount(0); // a hidden switch is out of the accessibility tree
  await page.keyboard.press('Escape');
  await devContent(true);
  await expect(mapTile).toContainText('Neon Heights · Day');

  // The next visit: the map, the light and the switch come back as they were left.
  await page.reload();
  await expect(page.locator('.menu-title-start')).toBeVisible({ timeout: 30_000 });
  await page.getByRole('button', { name: 'Start' }).click();
  await expect(setup).toBeVisible();
  await expect(mapTile).toContainText('Neon Heights · Day');
  await mapTile.click();
  await expect(light.getByRole('button', { name: 'Day' })).toHaveAttribute('aria-pressed', 'true');
  await expect(light.getByRole('button', { name: 'Night' })).toHaveAttribute('aria-pressed', 'false');

  // Another map picked later does not disturb the pick: back on Neon Heights it is still Day.
  await mapDialog.getByRole('button', { name: /Woodland/i }).click();
  await expect(mapTile).toContainText('Woodland');
  await expect(mapTile).not.toContainText('·');
  await mapTile.click();
  await expect(light.getByRole('button', { name: 'Day' })).toHaveAttribute('aria-pressed', 'true');
  expect(errors, errors.join(' | ')).toEqual([]);
});
