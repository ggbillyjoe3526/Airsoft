import { expect, test } from '@playwright/test';

/**
 * Dev content (M35): the Dev group's Dev content switch shows content still being built and hides it again. Woodland is
 * dev content today: with the switch off the Play screen's Map cards don't list it at all; on, it is listed after Depot,
 * tagged Dev (G3), and can be picked (M33d); off again, it is hidden and Depot plays, while the pick stays saved. A test of
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
  await page.locator('.menu-title-start').click();
  const setup = page.locator('.menu-setup');
  await expect(setup).toBeVisible();

  const maps = setup.getByRole('group', { name: 'Map', exact: true });
  const woodland = maps.getByRole('button', { name: /Woodland/i });
  const neonHeights = maps.getByRole('button', { name: /Neon Heights/i });
  const mapLine = setup.locator('.play-map-line');
  const devContent = async (on: boolean): Promise<void> => {
    await page.locator('.menu-topbar').getByRole('button', { name: 'Settings' }).click();
    const settings = page.locator('.menu-settings');
    const devBox = settings.getByRole('checkbox', { name: 'Dev settings' });
    if (!(await devBox.isChecked())) await devBox.check();
    await expect(settings.getByRole('tab', { name: /^Dev/i })).toHaveAttribute('aria-selected', 'true');
    const group = settings.getByRole('group', { name: 'Dev content' });
    await group.getByRole('button', { name: on ? 'On' : 'Off' }).click();
    await expect(group.getByRole('button', { name: on ? 'On' : 'Off' })).toHaveAttribute('aria-pressed', 'true');
    await page.keyboard.press('Escape');
    await expect(setup).toBeVisible();
  };

  // Off (the default): Woodland isn't listed at all, not even greyed out.
  await expect(maps.getByRole('button', { name: /Depot/i })).toHaveAttribute('aria-pressed', 'true');
  await expect(woodland).toBeHidden();
  await expect(neonHeights).toBeHidden();

  // On: listed after Depot with a Dev tag, not Coming soon, and it can be picked (M33d).
  await devContent(true);
  await expect(woodland).toBeVisible();
  await expect(woodland).toBeEnabled();
  await expect(woodland).not.toContainText('Coming soon');
  await expect(woodland.locator('.tag-dev')).toHaveText('Dev');
  await expect(neonHeights).toBeVisible();
  await expect(neonHeights).toBeEnabled();
  await woodland.click();
  await expect(woodland).toHaveAttribute('aria-pressed', 'true');
  await expect(mapLine).toContainText('Woodland');

  // Off again: gone, and Depot plays; the pick stays saved, so turning the switch on brings Woodland back.
  await devContent(false);
  await expect(mapLine).toContainText('Depot');
  await expect(woodland).toBeHidden();
  await expect(neonHeights).toBeHidden();
  await devContent(true);
  await expect(mapLine).toContainText('Woodland');

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
  await page.locator('.menu-title-start').click();
  const setup = page.locator('.menu-setup');
  await expect(setup).toBeVisible();
  await page.locator('.menu-topbar').getByRole('button', { name: 'Settings' }).click();
  const settings = page.locator('.menu-settings');
  await settings.getByRole('checkbox', { name: 'Dev settings' }).check();
  await settings.getByRole('group', { name: 'Dev content' }).getByRole('button', { name: 'On' }).click();
  await page.keyboard.press('Escape');
  await expect(setup).toBeVisible();
  // Day or Night on the map's card (M34d): Night the first time; picking Day picks the map with that light.
  const maps = setup.getByRole('group', { name: 'Map', exact: true });
  const light = maps.getByRole('group', { name: 'Neon Heights: Light' });
  await expect(light.getByRole('button', { name: 'Night' })).toHaveAttribute('aria-pressed', 'true');
  await expect(maps.getByRole('group', { name: /Depot/ })).toHaveCount(0);
  await light.getByRole('button', { name: 'Day' }).click();
  await expect(maps.getByRole('button', { name: /Neon Heights/i }).first()).toHaveAttribute('aria-pressed', 'true');
  await expect(setup.locator('.play-map-line')).toHaveText('Neon Heights · Day');
  await setup.getByRole('button', { name: 'Start match', exact: true }).click();
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
  await page.locator('.menu-title-start').click();
  const setup = page.locator('.menu-setup');
  await expect(setup).toBeVisible();
  await page.locator('.menu-topbar').getByRole('button', { name: 'Settings' }).click();
  const settings = page.locator('.menu-settings');
  await settings.getByRole('checkbox', { name: 'Dev settings' }).check();
  await settings.getByRole('group', { name: 'Dev content' }).getByRole('button', { name: 'On' }).click();
  await page.keyboard.press('Escape');
  await setup.getByRole('group', { name: 'Map', exact: true }).getByRole('button', { name: /Neon Heights/i }).first().click();
  await expect(setup.locator('.play-map-line')).toHaveText('Neon Heights · Night');
  await setup.getByRole('button', { name: 'Start match', exact: true }).click();
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

/**
 * M33h: the Weapon Torch is dev content. With Dev content off (the default) the Loadout has no Light row, a Depot match
 * builds nothing for torches, and the Weapon torch key does nothing.
 */
test('with Dev content off there is no Light row, no torch in the match, and T does nothing', async ({ page }) => {
  test.setTimeout(180_000);
  const errors: string[] = [];
  page.on('pageerror', (err) => errors.push(`pageerror: ${err.message}`));
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(`console: ${msg.text()}`);
  });
  await page.goto('/?nolock&seed=1');
  await expect(page.locator('.menu-title-start')).toBeVisible({ timeout: 30_000 });
  await page.locator('.menu-title-start').click();
  const setup = page.locator('.menu-setup');
  await setup.getByRole('button', { name: 'Change Loadout' }).click();
  const loadout = page.locator('.menu-loadout');
  await loadout.getByRole('button', { name: /^Primary: AEG Rifle/ }).click({ button: 'right' });
  // Customise's parts are tabs (G3): Optic is offered, Light is not.
  await expect(loadout.getByRole('tab', { name: /^Optic/ })).toBeVisible();
  await expect(loadout.getByRole('tab', { name: /^Light/ })).toHaveCount(0);
  await loadout.getByRole('button', { name: 'Loadout', exact: true }).click(); // the crumb: back to the gear
  await page.locator('.menu-topbar').getByRole('button', { name: 'Match', exact: true }).click();
  await setup.getByRole('button', { name: 'Start match', exact: true }).click();
  await expect(page.locator('.menus')).toBeHidden({ timeout: 20_000 });
  type View = { airsoft: { state: { tick: number; characters: { id: number; torchOn: boolean }[] } | null; renderer: { scene: { traverse: (f: (o: { name: string }) => void) => void } } } };
  await expect.poll(() => page.evaluate(() => (window as unknown as View).airsoft.state?.tick ?? 0), { timeout: 60_000 }).toBeGreaterThan(10);
  await page.keyboard.press('t');
  // A second of play after the press (polled on the simulation's ticks, never a fixed wait).
  const pressedAt = await page.evaluate(() => (window as unknown as View).airsoft.state?.tick ?? 0);
  await expect.poll(() => page.evaluate(() => (window as unknown as View).airsoft.state?.tick ?? 0), { timeout: 30_000 }).toBeGreaterThan(pressedAt + 60);
  const seen = await page.evaluate(() => {
    const g = (window as unknown as View).airsoft;
    const torchObjects: string[] = [];
    g.renderer.scene.traverse((o) => {
      if (o.name.startsWith('torch-') && o.name !== 'torch-beams') torchObjects.push(o.name);
    });
    return { torchOn: g.state!.characters.some((c) => c.torchOn), torchObjects };
  });
  expect(seen).toEqual({ torchOn: false, torchObjects: [] });
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
  await page.locator('.menu-title-start').click();
  const setup = page.locator('.menu-setup');
  await expect(setup).toBeVisible();
  await page.locator('.menu-topbar').getByRole('button', { name: 'Settings' }).click();
  const settings = page.locator('.menu-settings');
  await settings.getByRole('checkbox', { name: 'Dev settings' }).check();
  await settings.getByRole('group', { name: 'Dev content' }).getByRole('button', { name: 'On' }).click();
  await settings.getByRole('group', { name: 'Ghost' }).getByRole('button', { name: 'On' }).click();
  await page.keyboard.press('Escape');
  await expect(setup).toBeVisible();
  const extraction = setup.getByRole('group', { name: 'Mode', exact: true }).getByRole('button', { name: /Extraction/i });
  await extraction.click();
  await expect(extraction).toHaveAttribute('aria-pressed', 'true');
  await expect(setup.locator('.play-facts')).toContainText('Extraction');
  await setup.getByRole('button', { name: 'Start match', exact: true }).click();
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
  const colours: Record<string, string> = { rare: 'rgb(79, 151, 255)', veryRare: 'rgb(164, 123, 255)', epic: 'rgb(255, 92, 157)', legendary: 'rgb(255, 194, 26)' };
  const tierColour = await tile.locator('.item-tier').evaluate((n) => getComputedStyle(n).color);
  expect(tierColour).toBe(colours[found.item!.tier]);
  expect(errors, errors.join(' | ')).toEqual([]);
});

test('the Day | Night pick on Neon Heights (M34d) is named on the Play screen, kept through Dev content off and on, restored on the next visit, and reached by keyboard', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (err) => errors.push(`pageerror: ${err.message}`));
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(`console: ${msg.text()}`);
  });
  const setup = page.locator('.menu-setup');
  // The Map cards (G3) are on the Play screen itself; the picked map and its light are named in the aside's line.
  const maps = setup.getByRole('group', { name: 'Map', exact: true });
  const mapLine = setup.locator('.play-map-line');
  const switches = maps.locator('.choice-variants:visible');
  const light = maps.getByRole('group', { name: 'Neon Heights: Light' });
  const neonHeights = maps.getByRole('button', { name: /Neon Heights/i }).first();
  const toSetup = async (): Promise<void> => {
    await expect(page.locator('.menu-title-start')).toBeVisible({ timeout: 30_000 });
    await page.locator('.menu-title-start').click();
    await expect(setup).toBeVisible();
  };
  const devContent = async (on: boolean): Promise<void> => {
    await page.locator('.menu-topbar').getByRole('button', { name: 'Settings' }).click();
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

  await page.goto('/?nolock&seed=1');
  await toSetup();
  // Depot (the default) offers one light: no switch, and the line names no light.
  await expect(mapLine).toHaveText('Depot');
  await expect(switches).toHaveCount(0);
  await devContent(true);
  await expect(maps.getByRole('button', { name: /Woodland/i })).toBeVisible();
  // Only the map with two lights has a switch (not Depot, not Woodland), Night first.
  await expect(switches).toHaveCount(1);
  await expect(light.getByRole('button')).toHaveText(['Day', 'Night']);
  await expect(light.getByRole('button', { name: 'Night' })).toHaveAttribute('aria-pressed', 'true');
  await expect(light.getByRole('button', { name: 'Day' })).toHaveAttribute('aria-pressed', 'false');
  expect(await savedLight()).toBeUndefined();
  // By keyboard: Tab from the map's card reaches its Day then Night; Enter on Day picks the map with that light.
  await neonHeights.focus();
  await page.keyboard.press('Tab');
  await expect(light.getByRole('button', { name: 'Day' })).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(light.getByRole('button', { name: 'Night' })).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await page.keyboard.press('Enter');
  await expect(neonHeights).toHaveAttribute('aria-pressed', 'true');
  await expect(mapLine).toHaveText('Neon Heights · Day');
  expect(await savedLight()).toBe('day');

  // The other side picks the same map under that light, and back again.
  await light.getByRole('button', { name: 'Night' }).click();
  await expect(mapLine).toHaveText('Neon Heights · Night');
  expect(await savedLight()).toBe('night');
  await light.getByRole('button', { name: 'Day' }).click();
  await expect(mapLine).toHaveText('Neon Heights · Day');

  // Dev content off: Depot plays and names no light, the switch is gone; the pick stays, so on again it is back.
  await devContent(false);
  await expect(mapLine).toHaveText('Depot');
  await expect(switches).toHaveCount(0);
  await expect(maps.getByRole('group', { name: /Light/ })).toHaveCount(0); // a hidden switch is out of the accessibility tree
  await devContent(true);
  await expect(mapLine).toHaveText('Neon Heights · Day');

  // The next visit: the map, the light and the switch come back as they were left.
  await page.reload();
  await toSetup();
  await expect(mapLine).toHaveText('Neon Heights · Day');
  await expect(light.getByRole('button', { name: 'Day' })).toHaveAttribute('aria-pressed', 'true');
  await expect(light.getByRole('button', { name: 'Night' })).toHaveAttribute('aria-pressed', 'false');

  // Another map picked later does not disturb the pick: back on Neon Heights it is still Day.
  await maps.getByRole('button', { name: /Woodland/i }).click();
  await expect(mapLine).toHaveText('Woodland');
  await expect(light.getByRole('button', { name: 'Day' })).toHaveAttribute('aria-pressed', 'true');
  await neonHeights.click();
  await expect(mapLine).toHaveText('Neon Heights · Day');
  expect(errors, errors.join(' | ')).toEqual([]);
});
