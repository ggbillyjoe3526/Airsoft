import { expect, type Page, test } from '@playwright/test';

/**
 * Audit 2 CORE-15: the dev content paths no other spec starts in a real browser. A Tournament Extraction run on Depot
 * with Retro pixels on, and a Pro CQB match against Pro opponents (whose "what got you" card is on by default). Each
 * boots once, plays a few ticks and reads the match through the e2e build's `window.airsoft` (its diagnostics report
 * names the rules, the run and the retro look), with no console error.
 */
type Airsoft = {
  airsoft: {
    state: { tick: number; round: { mode: string } } | null;
    renderer: { retroPixelAngle: number };
    diagnostics: () => string;
  };
};

/** Boots the e2e build and turns Dev settings and Dev content on (and Retro pixels when asked), back on the Play screen. */
async function newGameWithDevContent(page: Page, errors: string[], retro: boolean): Promise<void> {
  page.on('pageerror', (err) => errors.push(`pageerror: ${err.message}`));
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(`console: ${msg.text()}`);
  });
  await page.goto('/?nolock&seed=4');
  await page.waitForSelector('.menu-title-start', { timeout: 30_000 });
  await page.locator('.menu-title-start').click();
  const setup = page.locator('.menu-setup');
  await page.locator('.menu-topbar').getByRole('button', { name: 'Settings' }).click();
  const settings = page.locator('.menu-settings');
  await settings.getByRole('checkbox', { name: 'Dev settings' }).check();
  await settings.getByRole('group', { name: 'Dev content' }).getByRole('button', { name: 'On' }).click();
  if (retro) await settings.getByRole('group', { name: 'Retro pixels' }).getByRole('button', { name: 'On' }).click();
  await page.keyboard.press('Escape');
  await expect(setup).toBeVisible();
}

/** Picks the ruleset in the Play screen's match panel (G3). */
async function pickRules(page: Page, rules: string): Promise<void> {
  const group = page.locator('.menu-setup .match-panel').getByRole('group', { name: 'Rules' });
  await group.getByRole('button', { name: rules }).click();
  await expect(group.getByRole('button', { name: rules })).toHaveAttribute('aria-pressed', 'true');
}

/** Presses Play and waits for the match to run a few ticks. */
async function playAndWait(page: Page): Promise<void> {
  await page.locator('.menu-setup').getByRole('button', { name: 'Play', exact: true }).click();
  await expect(page.locator('.menus')).toBeHidden({ timeout: 20_000 });
  await expect.poll(() => page.evaluate(() => (window as unknown as Airsoft).airsoft.state?.tick ?? 0), { timeout: 60_000 }).toBeGreaterThan(10);
}

test('a Tournament Extraction run on Depot with Retro pixels on starts, and its report names the rules, the run and the look', async ({ page }) => {
  test.setTimeout(180_000);
  const errors: string[] = [];
  await newGameWithDevContent(page, errors, true);
  const setup = page.locator('.menu-setup');
  const extraction = setup.getByRole('group', { name: 'Mode', exact: true }).getByRole('button', { name: /Extraction/i });
  await extraction.click();
  await expect(extraction).toHaveAttribute('aria-pressed', 'true');
  await pickRules(page, 'Tournament');
  await playAndWait(page);

  const seen = await page.evaluate(() => {
    const a = (window as unknown as Airsoft).airsoft;
    return { mode: a.state!.round.mode, report: a.diagnostics(), retroAngle: a.renderer.retroPixelAngle };
  });
  expect(seen.mode).toBe('extraction');
  expect(seen.report).toContain('Map: Depot');
  expect(seen.report).toContain('Rules: tournament');
  expect(seen.report).toMatch(/Run: running, exits open \d+\/\d+/);
  expect(seen.report).toMatch(/Retro pixels: \d+ px, \d+ levels/);
  expect(seen.retroAngle).toBeGreaterThan(0);
  expect(errors).toEqual([]);
});

test('a Pro CQB match against Pro opponents starts, and its report names the rules and the level', async ({ page }) => {
  test.setTimeout(180_000);
  const errors: string[] = [];
  await newGameWithDevContent(page, errors, false);
  const setup = page.locator('.menu-setup');
  const opponents = setup.locator('.match-panel').getByRole('group', { name: 'Opponents' });
  await opponents.getByRole('button', { name: 'Pro' }).click();
  await expect(opponents.getByRole('button', { name: 'Pro' })).toHaveAttribute('aria-pressed', 'true');
  await expect(setup.locator('.play-facts')).toContainText('Pro');
  await pickRules(page, 'Pro CQB');
  await playAndWait(page);

  const seen = await page.evaluate(() => {
    const a = (window as unknown as Airsoft).airsoft;
    return { mode: a.state!.round.mode, report: a.diagnostics() };
  });
  expect(seen.mode).toBe('elimination');
  expect(seen.report).toContain('Rules: proCqb');
  expect(seen.report).toMatch(/Mode: elimination, pro/);
  expect(seen.report).toContain('Retro pixels: off');
  expect(errors).toEqual([]);
});
