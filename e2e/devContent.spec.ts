import { expect, test } from '@playwright/test';

/**
 * Dev content (M35): the Dev tab's Dev content switch shows content still being built and hides it again. Woodland is
 * dev content today: with the switch off the Map pop-up doesn't list it at all; on, it is listed under Depot like any
 * other map and can be picked (M33d); off again, it is hidden and Depot plays, while the pick stays saved. A test of
 * its own, so the long match test in boot.spec.ts plays the same way as before. Neon Heights (M34c) is dev content too,
 * listed and hidden with Woodland, and the second test plays it. Uses `?nolock` like the other smoke tests.
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

test('Neon Heights (dev content, M34c) loads and plays: the city builds, the HUD and minimap come up, no errors', async ({ page }) => {
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
  await page.getByRole('dialog', { name: 'Map' }).getByRole('button', { name: /Neon Heights/i }).click();
  await expect(setup.getByRole('button', { name: /Map/i })).toContainText('Neon Heights');
  await setup.getByRole('button', { name: 'Play', exact: true }).click();
  await expect(page.locator('.menus')).toBeHidden({ timeout: 20_000 });
  expect(await page.evaluate(() => (window as unknown as { airsoft: { state: unknown } }).airsoft.state !== null)).toBe(true);
  await expect(page.locator('.hud')).toBeVisible();
  await expect(page.locator('.minimap')).toBeVisible();
  // It is Neon Heights that was built (the session's setup names the map), with both teams in its yards: 4v4 is its
  // standard team size, so at least six stand in play, and Neon Heights' yards are at x -20 and +22.6 (Depot's -22.7 and 24).
  type Played = { airsoft: { session: { setup: { map: { name: string } } }; state: { tick: number; characters: { position: { x: number; y: number } }[] } } };
  expect(await page.evaluate(() => (window as unknown as Played).airsoft.session.setup.map.name)).toBe('Neon Heights');
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

/**
 * Extraction's cases (M44, dev content like the mode): beside the marshal's locker the page asks for the Use key, holding
 * G opens it with a bar and a line of what it held, you carry the find, and standing in an exit counts you out. The run
 * is dev content, so the summary shows the haul but says it was not kept, and its part's tile wears its tier's rarity
 * colour (the Armory's). Ghost is on so a bot's BB cannot end the run while the locker (7 s, heard 30 m) is worked;
 * the player is placed by the e2e build's `window.airsoft`, since walking there under SwiftShader would take minutes.
 */
type Run = {
  cases: { kind: string; name: string; open: boolean; position: { x: number; y: number; z: number }; finds: { fc: number; resupply: boolean; item: { asset: string; tier: string } | null }[] }[];
  carried: { fc: number; item: { asset: string; tier: string } | null }[];
  exits: { open: boolean; position: { x: number; y: number; z: number } }[];
  outcome: string;
};
type Playing = { airsoft: { state: { tick: number; characters: { id: number; position: { x: number; y: number; z: number } }[]; round: { run: Run } } } };

test('Extraction: the locker asks for G, opens while held, is carried out through an exit, and the summary shows the haul as not kept', async ({ page }) => {
  test.setTimeout(240_000);
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
  await settings.getByRole('group', { name: 'Ghost' }).getByRole('button', { name: 'On' }).click();
  await page.keyboard.press('Escape');
  await expect(setup).toBeVisible();
  await setup.getByRole('button', { name: /Mode/i }).click();
  await page.getByRole('dialog', { name: 'Mode' }).getByRole('button', { name: /Extraction/i }).click();
  await expect(setup.getByRole('button', { name: /Mode/i })).toContainText('Extraction');
  await setup.getByRole('button', { name: 'Play', exact: true }).click();
  await expect(page.locator('.menus')).toBeHidden({ timeout: 20_000 });
  const run = <T>(read: (r: Run, you: { x: number; y: number; z: number }) => T): Promise<T> =>
    page.evaluate(
      ([src]) => {
        const s = (window as unknown as Playing).airsoft.state;
        return (new Function('r', 'you', `return (${src})(r, you)`) as (r: unknown, y: unknown) => T)(s.round.run, s.characters.find((c) => c.id === 0)!.position);
      },
      [read.toString()],
    );
  await expect.poll(() => page.evaluate(() => (window as unknown as Playing).airsoft.state.tick), { timeout: 60_000 }).toBeGreaterThan(10);

  // Stand a step from the locker: the prompt names the key.
  const lockerAt = await run((r) => r.cases.findIndex((k) => k.kind === 'locker'));
  expect(lockerAt).toBeGreaterThanOrEqual(0);
  const stand = (index: number): Promise<void> =>
    page.evaluate((i) => {
      const s = (window as unknown as Playing).airsoft.state;
      const p = s.round.run.cases[i]!.position;
      const you = s.characters.find((c) => c.id === 0)!;
      you.position.x = p.x + 0.8;
      you.position.y = p.y;
      you.position.z = p.z;
    }, index);
  await stand(lockerAt);
  const prompt = page.locator('.case-prompt');
  await expect(prompt).toContainText("Hold G to open the marshal's locker", { timeout: 30_000 });

  // Hold G: the bar shows while it opens, and the locker's part comes out with you.
  await page.keyboard.down('g');
  await expect(prompt).toContainText("Opening the marshal's locker", { timeout: 30_000 });
  await expect(prompt.locator('.case-prompt-bar')).toBeVisible();
  await expect.poll(() => run((r, _you) => r.cases.find((k) => k.kind === 'locker')!.open), { timeout: 120_000 }).toBe(true);
  await page.keyboard.up('g');
  const found = await run((r) => r.cases.find((k) => k.kind === 'locker')!.finds[0]!);
  expect(found.item).not.toBeNull();
  expect(await run((r) => r.carried.length)).toBe(1);
  await expect(prompt).toContainText(/\+\d+ FC/, { timeout: 30_000 });

  // Out through an exit: stand in an open one until you are counted out.
  await page.evaluate(() => {
    const s = (window as unknown as Playing).airsoft.state;
    const exit = s.round.run.exits.find((e) => e.open)!;
    const you = s.characters.find((c) => c.id === 0)!;
    you.position.x = exit.position.x;
    you.position.y = exit.position.y;
    you.position.z = exit.position.z;
  });
  const summary = page.locator('.menu-summary');
  await expect(summary).toBeVisible({ timeout: 150_000 });
  expect(await run((r) => r.outcome)).toBe('extracted');
  const haul = summary.locator('.summary-haul');
  await expect(haul).toContainText('The haul');
  await expect(haul).toContainText('Not kept: nothing from this run goes into your collection.');

  // The part's tile carries its tier and wears that tier's colour, as an Armory tile does.
  const tile = haul.locator('.armory-tile');
  await expect(tile).toHaveCount(1);
  await expect(tile).toContainText('Not kept');
  expect(await tile.getAttribute('data-tier')).toBe(found.item!.tier);
  const colours: Record<string, string> = { rare: 'rgb(61, 139, 255)', veryRare: 'rgb(164, 107, 255)', epic: 'rgb(255, 95, 180)', legendary: 'rgb(255, 193, 59)' };
  const tierColour = await tile.locator('.item-tier').evaluate((n) => getComputedStyle(n).color);
  expect(tierColour).toBe(colours[found.item!.tier]);
  expect(errors, errors.join(' | ')).toEqual([]);
});
