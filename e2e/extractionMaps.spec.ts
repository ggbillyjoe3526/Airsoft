import { expect, test } from '@playwright/test';

/**
 * M48: Extraction on Woodland and Neon Heights (dev content, so Dev settings > Dev content). Each map offers the mode
 * and starts a run with its own exits and cases, the exits drawn in the scene (on Woodland's slopes, standing on the
 * ground), with no console error. Values are read through the e2e build's `window.airsoft`, no screenshot.
 */
type Point = { x: number; y: number; z: number };
type Obj = { name: string; children: Obj[]; getWorldPosition: (v: Point) => Point; isMesh?: boolean; geometry?: { type: string } };
type Airsoft = {
  airsoft: {
    state: { tick: number; round: { mode: string; run: { exits: { name: string; closed: boolean; position: Point }[]; cases: { kind: string }[] } } } | null;
    renderer: { scene: { getObjectByName: (n: string) => Obj | undefined } };
  };
};

for (const map of [
  { name: 'Woodland', button: /Woodland/i, exits: ['Logging track gate', 'Cabin road gate', 'North-west woods', 'North-east woods'] },
  { name: 'Neon Heights', button: /Neon Heights/i, exits: ['Noodle Alley gate', 'Back Alley gate', 'Plaza gate', 'Drone Dock gate'] },
]) {
  test(`${map.name} offers Extraction and starts a run with its own exits and cases, and no console errors`, async ({ page }) => {
    test.setTimeout(180_000);
    const errors: string[] = [];
    page.on('pageerror', (err) => errors.push(`pageerror: ${err.message}`));
    page.on('console', (msg) => {
      if (msg.type() === 'error') errors.push(`console: ${msg.text()}`);
    });
    await page.goto('/?nolock&seed=2');
    await page.waitForSelector('.menu-title-start', { timeout: 30_000 });
    await page.locator('.menu-title-start').click();
    const setup = page.locator('.menu-setup');
    await page.locator('.menu-topbar').getByRole('button', { name: 'Settings' }).click();
    const settings = page.locator('.menu-settings');
    await settings.getByRole('checkbox', { name: 'Dev settings' }).check();
    await settings.getByRole('group', { name: 'Dev content' }).getByRole('button', { name: 'On' }).click();
    await settings.getByRole('group', { name: 'Ghost' }).getByRole('button', { name: 'On' }).click();
    await page.keyboard.press('Escape');
    await setup.getByRole('group', { name: 'Map', exact: true }).getByRole('button', { name: map.button }).first().click();
    await expect(setup.locator('.play-map-line')).toContainText(map.name);
    const extraction = setup.getByRole('group', { name: 'Mode', exact: true }).getByRole('button', { name: /Extraction/i });
    await extraction.click();
    await expect(extraction).toHaveAttribute('aria-pressed', 'true');
    await setup.getByRole('button', { name: 'Play', exact: true }).click();
    await expect(page.locator('.menus')).toBeHidden({ timeout: 20_000 });
    await expect.poll(() => page.evaluate(() => (window as unknown as Airsoft).airsoft.state?.tick ?? 0), { timeout: 60_000 }).toBeGreaterThan(10);

    const run = await page.evaluate(() => {
      const s = (window as unknown as Airsoft).airsoft.state!;
      return { mode: s.round.mode, exits: s.round.run.exits.map((e) => ({ name: e.name, closed: e.closed })), cases: s.round.run.cases.map((k) => k.kind) };
    });
    expect(run.mode).toBe('extraction');
    expect(run.exits.map((e) => e.name)).toEqual(map.exits);
    // Some exits are closed by the squad's insertion; the rest are drawn.
    const drawn = run.exits.filter((e) => !e.closed).length;
    expect(drawn).toBeGreaterThanOrEqual(2);
    expect(run.cases.filter((k) => k === 'locker')).toHaveLength(1);
    expect(run.cases.length).toBeGreaterThanOrEqual(7);
    // Five draws whatever the exit count (M75): the rings and washes as one floor mesh, the open and shut boards, the
    // cones and the posts instanced; one board and one post an exit drawn.
    const exits = await page.evaluate(() =>
      ((window as unknown as Airsoft).airsoft.renderer.scene.getObjectByName('exits')?.children ?? []).map((c) => ({ name: c.name, count: (c as { count?: number }).count ?? 1 })),
    );
    expect(exits.map((e) => e.name).sort()).toEqual(['exit-boards-open', 'exit-boards-shut', 'exit-cones', 'exit-floor', 'exit-posts']);
    const count = (name: string): number => exits.find((e) => e.name === name)!.count;
    expect(count('exit-boards-open') + count('exit-boards-shut')).toBe(drawn);
    expect(count('exit-posts')).toBe(drawn);
    expect(errors).toEqual([]);
  });
}
