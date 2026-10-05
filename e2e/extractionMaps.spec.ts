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
    await page.getByRole('button', { name: 'Start' }).click();
    const setup = page.locator('.menu-setup');
    await setup.getByRole('button', { name: /Settings/i }).click();
    const settings = page.locator('.menu-settings');
    await settings.getByRole('checkbox', { name: 'Dev settings' }).check();
    await settings.getByRole('group', { name: 'Dev content' }).getByRole('button', { name: 'On' }).click();
    await settings.getByRole('group', { name: 'Ghost' }).getByRole('button', { name: 'On' }).click();
    await page.keyboard.press('Escape');
    await setup.getByRole('button', { name: /Map/i }).click();
    await page.getByRole('dialog', { name: 'Map' }).getByRole('button', { name: map.button }).click();
    await expect(setup.getByRole('button', { name: /Map/i })).toContainText(map.name);
    await setup.getByRole('button', { name: /Mode/i }).click();
    await page.getByRole('dialog', { name: 'Mode' }).getByRole('button', { name: /Extraction/i }).click();
    await expect(setup.getByRole('button', { name: /Mode/i })).toContainText('Extraction');
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
    const groups = await page.evaluate(() => (window as unknown as Airsoft).airsoft.renderer.scene.getObjectByName('exits')?.children.length ?? -1);
    expect(groups).toBe(drawn);
    expect(errors).toEqual([]);
  });
}
