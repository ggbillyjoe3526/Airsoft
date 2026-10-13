import { expect, type Page, test } from '@playwright/test';

/**
 * Adaptive difficulty in a real browser (AD1, Dev 6 item 48): Settings › Dev › Adaptive difficulty. Off (the default), the
 * match plays a fixed level: no rating on the session and no line on the Match screen. On, the Match screen says where the
 * other team starts; a won round moves the rating up a little within the match; the match won moves the saved rating
 * (settings `adaptiveRating`, `adaptiveFrom`), the summary says so on its own card, and the next Match screen reads the new
 * start. Rounds are won by putting the other team out directly (as modeMatch.spec.ts), so no hits are counted: a round won
 * scores 0.6 (config/adaptiveDifficulty.ts roundWeights.result), drifts the rating 0.04 x 0.6, and a match of two such
 * rounds moves the start 0.2 x (0.5 + 0.5 x 0.6) = 0.16, to 1.16: "Normal, a little sharper". Uses `?nolock`.
 */

type Round = { phase: string; winner: number; score: number[] };
type Airsoft = { airsoft: { state: { tick: number; round: Round; characters: { team: number; status: string }[] }; session: { rounds: { winsNeeded: number }; adaptive: { rating: number; start: number } | null } } };

const NOTE = /Adaptive difficulty: the other team adapts to how you do, and starts this match at Normal\./;

function watch(page: Page, errors: string[]): void {
  page.on('pageerror', (err) => errors.push(`pageerror: ${err.message}`));
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(`console: ${msg.text()}`);
  });
}

/** Boots to the Match screen (Depot, Elimination by default), with Dev settings ticked and Adaptive difficulty `on`. */
async function toMatchScreen(page: Page, adaptive: boolean) {
  await page.goto('/?nolock&seed=3');
  await expect(page.locator('.menu-title-start')).toBeVisible({ timeout: 30_000 });
  await page.locator('.menu-title-start').click();
  const setup = page.locator('.menu-setup');
  await expect(setup).toBeVisible();
  if (adaptive) {
    await page.locator('.menu-topbar').getByRole('button', { name: 'Settings' }).click();
    const settings = page.locator('.menu-settings');
    await settings.getByRole('checkbox', { name: 'Dev settings' }).check();
    await settings.getByRole('group', { name: 'Adaptive difficulty' }).getByRole('button', { name: 'On' }).click();
    await page.keyboard.press('Escape');
    await expect(setup).toBeVisible();
  }
  for (const [group, label] of [['Map', 'Depot'], ['Mode', 'Elimination']] as const) {
    const b = setup.getByRole('group', { name: group, exact: true }).getByRole('button', { name: new RegExp(label, 'i') });
    await b.click();
    await expect(b).toHaveAttribute('aria-pressed', 'true');
  }
  return setup;
}

async function startPlay(page: Page, setup: ReturnType<Page['locator']>): Promise<void> {
  await setup.getByRole('button', { name: 'Start match', exact: true }).click();
  await expect(page.locator('.menus')).toBeHidden({ timeout: 30_000 });
  await expect.poll(() => page.evaluate(() => (window as unknown as Airsoft).airsoft.state?.tick ?? 0), { timeout: 60_000 }).toBeGreaterThan(10);
}

/** The match's adaptive run as plain numbers (`rating` is a getter, which a structured clone drops). */
const adaptiveOf = (page: Page) =>
  page.evaluate(() => {
    const a = (window as unknown as Airsoft).airsoft.session.adaptive;
    return a ? { rating: a.rating, start: a.start } : null;
  });
const round = (page: Page): Promise<Round> => page.evaluate(() => (window as unknown as Airsoft).airsoft.state.round);
const saved = (page: Page) =>
  page.evaluate(() => {
    const s = JSON.parse(localStorage.getItem('airsoft.settings') ?? '{}') as { adaptiveRating?: number; adaptiveFrom?: string };
    return { rating: s.adaptiveRating, from: s.adaptiveFrom };
  });

/** Puts team 1 out while a round is live until it is over; `oneShort` first sets your team's wins to one short. */
async function putOtherTeamOut(page: Page, oneShort: boolean): Promise<Round> {
  await expect
    .poll(
      () =>
        page.evaluate((short) => {
          const game = (window as unknown as Airsoft).airsoft;
          const r = game.state.round;
          if (r.phase !== 'live') return r.phase;
          if (short) r.score[0] = game.session.rounds.winsNeeded - 1;
          for (const c of game.state.characters) if (c.team === 1) c.status = 'out';
          return 'live';
        }, oneShort),
      { timeout: 30_000 },
    )
    .not.toBe('live');
  return round(page);
}

test('Adaptive difficulty off (the default): no rating in the match, no line on the Match screen, nothing saved', async ({ page }) => {
  test.setTimeout(120_000);
  const errors: string[] = [];
  watch(page, errors);
  const setup = await toMatchScreen(page, false);
  await expect(setup.locator('.setup-rules')).not.toContainText('Adaptive difficulty');
  await startPlay(page, setup);
  expect(await adaptiveOf(page)).toBeNull();
  expect((await saved(page)).rating).toBeUndefined();
  expect(errors, errors.join(' | ')).toEqual([]);
});

test('Adaptive difficulty on: the Match screen says where it starts, a won round and match move the rating, the summary and the next Match screen say so', async ({ page }) => {
  test.setTimeout(300_000);
  const errors: string[] = [];
  watch(page, errors);
  const setup = await toMatchScreen(page, true);
  await expect(setup.locator('.setup-rules')).toContainText(NOTE);
  await startPlay(page, setup);

  // Starts at the level picked (Normal, 1); a round won drifts it up a little, within the match's limit of 0.15.
  const start = await adaptiveOf(page);
  expect(start).not.toBeNull();
  expect(start!.rating).toBe(1);
  expect((await putOtherTeamOut(page, false)).winner, 'the other team out: your round').toBe(0);
  const drifted = (await adaptiveOf(page))!;
  expect(drifted.start).toBe(1);
  expect(drifted.rating).toBeGreaterThan(1);
  expect(drifted.rating).toBeLessThanOrEqual(1.15 + 1e-9);
  await expect.poll(async () => (await round(page)).phase, { timeout: 30_000 }).toBe('live');

  // One win short, the other team out again: the match is yours.
  expect((await putOtherTeamOut(page, true)).phase).toBe('matchOver');
  const summary = page.locator('.menu-summary');
  await expect(summary).toBeVisible({ timeout: 30_000 });
  const card = summary.locator('.summary-adaptive');
  await expect(card).toBeVisible();
  await expect(card).toContainText('Adaptive difficulty');
  await expect(card).toContainText('A step up: the next match starts at Normal, a little sharper.');
  await expect.poll(() => saved(page)).toMatchObject({ from: 'normal' });
  const after = await saved(page);
  expect(after.rating!).toBeGreaterThan(1);
  expect(after.rating!).toBeCloseTo(1.16, 2);

  // Continue to the result, then New game: the Match screen reads the new start; Play starts the next match from it.
  await summary.getByRole('button', { name: 'Continue' }).click();
  const result = page.locator('.menu-result');
  await expect(result).toBeVisible();
  await result.getByRole('button', { name: 'New game' }).click();
  const next = page.locator('.menu-setup');
  await expect(next).toBeVisible();
  await expect(next.locator('.setup-rules')).toContainText('starts this match at Normal, a little sharper.');
  await expect(next.locator('.setup-rules')).not.toContainText('starts this match at Normal.');
  await startPlay(page, next);
  expect((await adaptiveOf(page))!.start).toBeCloseTo(after.rating!, 3);
  expect(errors, errors.join(' | ')).toEqual([]);
});
