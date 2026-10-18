import { expect, type Page, test } from '@playwright/test';
import { MATCH_MODES, type MatchMode, unknownMode } from '../src/config/modes';

/**
 * The content toolkit's spec test for a mode (CT3, docs/content/modes.md › Checks): a short match of each mode in a real
 * browser on the e2e build. It starts, a round ends both ways, the end screen shows, and nothing errors. A mode played in
 * rounds: the other team is put out of play (your round), then yours (theirs), then, one win short, theirs again for the
 * match and its summary and result. A run (Extraction): the clock runs out (the home team's), then on Play Again you are
 * counted out at an open exit (yours), with Ghost on so nobody hits you on the way. Each mode answers here (the switch's
 * never-check), so a new mode fails to compile until it has its own short match.
 *
 * `node pipeline/content-check.mjs mode:<id>` runs one mode on one map (AIRSOFT_CONTENT_MODE, AIRSOFT_CONTENT_MAP_LABEL: a
 * map's name); the smoke test runs every mode on Depot. Uses `?nolock` like the other smoke tests.
 */

type Character = { id: number; team: number; status: string; position: { x: number; y: number; z: number } };
type Round = { mode: string; phase: string; winner: number; reason: string; score: number[]; clock: number; run: { exits: { open: boolean; position: { x: number; y: number; z: number } }[] } };
type Airsoft = { airsoft: { state: { tick: number; round: Round; characters: Character[] }; session: { rounds: { winsNeeded: number } } } };

/** The environment, read without Node's types (as playwright.config.ts does). */
const ENV = (globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env ?? {};
const ONLY_MODE = ENV.AIRSOFT_CONTENT_MODE;
/** The map by its name on the Play screen (the content check passes it; Depot, the public map, by default). */
const MAP = ENV.AIRSOFT_CONTENT_MAP_LABEL ?? 'Depot';

/** The round as the page has it. */
const round = (page: Page): Promise<Round> => page.evaluate(() => (window as unknown as Airsoft).airsoft.state.round);

/** Boots the e2e build, turns on what the match needs (Dev content for a dev mode or map, Ghost), picks the map and mode. */
async function startMatch(page: Page, errors: string[], mode: (typeof MATCH_MODES)[number], ghost: boolean, map = MAP): Promise<void> {
  page.on('pageerror', (err) => errors.push(`pageerror: ${err.message}`));
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(`console: ${msg.text()}`);
  });
  await page.goto('/?nolock&seed=3');
  await expect(page.locator('.menu-title-start')).toBeVisible({ timeout: 30_000 });
  await page.locator('.menu-title-start').click();
  const setup = page.locator('.menu-setup');
  await expect(setup).toBeVisible();
  await page.locator('.menu-topbar').getByRole('button', { name: 'Settings' }).click();
  const settings = page.locator('.menu-settings');
  await settings.getByRole('checkbox', { name: 'Dev settings' }).check();
  // Dev content on for every mode: the map or the mode may be dev content, and it changes nothing else a match plays.
  await settings.getByRole('group', { name: 'Dev content' }).getByRole('button', { name: 'On' }).click();
  if (ghost) await settings.getByRole('group', { name: 'Ghost' }).getByRole('button', { name: 'On' }).click();
  await page.keyboard.press('Escape');
  await expect(setup).toBeVisible();
  const mapButton = setup.getByRole('group', { name: 'Map', exact: true }).getByRole('button', { name: new RegExp(map, 'i') });
  await mapButton.click();
  await expect(mapButton).toHaveAttribute('aria-pressed', 'true');
  const modeButton = setup.getByRole('group', { name: 'Mode', exact: true }).getByRole('button', { name: new RegExp(mode.label, 'i') });
  await modeButton.click();
  await expect(modeButton).toHaveAttribute('aria-pressed', 'true');
  await setup.getByRole('button', { name: 'Start match', exact: true }).click();
  await expect(page.locator('.menus')).toBeHidden({ timeout: 30_000 });
  await expect.poll(() => page.evaluate(() => (window as unknown as Airsoft).airsoft.state?.tick ?? 0), { timeout: 60_000 }).toBeGreaterThan(10);
  expect((await round(page)).mode).toBe(mode.id);
}

/** Puts `team` out of play while a round is live, until the round is over (a draw or a pause in between gets another go). */
async function putOut(page: Page, team: number, oneShort = false): Promise<Round> {
  await expect
    .poll(
      () =>
        page.evaluate(
          ([team, oneShort]) => {
            const game = (window as unknown as Airsoft).airsoft;
            const r = game.state.round;
            if (r.phase !== 'live') return r.phase;
            if (oneShort) r.score[1 - (team as number)] = game.session.rounds.winsNeeded - 1;
            for (const c of game.state.characters) if (c.team === team) c.status = 'out';
            return 'live';
          },
          [team, oneShort] as const,
        ),
      { timeout: 30_000 },
    )
    .not.toBe('live');
  return round(page);
}

/** Waits for the next round to be live. */
const nextRound = (page: Page): Promise<void> => expect.poll(async () => (await round(page)).phase, { timeout: 30_000 }).toBe('live');

/** The summary, then the result screen with `headline`; Play Again starts over. */
async function endScreens(page: Page, headline: RegExp): Promise<void> {
  const summary = page.locator('.menu-summary');
  await expect(summary).toBeVisible({ timeout: 30_000 });
  await expect(summary.locator('.summary-result')).toContainText(headline);
  await summary.getByRole('button', { name: 'Continue' }).click();
  const result = page.locator('.menu-result');
  await expect(result).toBeVisible();
  await expect(result.locator('.menu-result-headline')).toHaveText(headline);
  await result.getByRole('button', { name: 'Play Again' }).click();
  await expect(page.locator('.menus')).toBeHidden({ timeout: 30_000 });
  await nextRound(page);
}

/** A mode played in rounds: a round each way, then the match. */
async function roundsMatch(page: Page): Promise<void> {
  const banner = page.locator('.hitfx-round');
  const ours = await putOut(page, 1);
  expect(ours.winner, 'the other team out: your round').toBe(0);
  await expect(banner).toHaveText(/\S/);
  await nextRound(page);
  const theirs = await putOut(page, 0);
  expect(theirs.winner, 'your team out: their round').toBe(1);
  await expect(banner).toHaveText(/\S/);
  await nextRound(page);
  const last = await putOut(page, 1, true);
  expect(last.phase, 'one win short, the other team out: the match').toBe('matchOver');
  await endScreens(page, /You win!/);
}

/** A run: the clock runs out (the home team's), then on Play Again you are counted out at an open exit (yours). */
async function run(page: Page): Promise<void> {
  await page.evaluate(() => {
    (window as unknown as Airsoft).airsoft.state.round.clock = 0;
  });
  await expect.poll(async () => (await round(page)).reason, { timeout: 30_000 }).toBe('time');
  await endScreens(page, /Caught out/);
  await expect.poll(async () => (await round(page)).run.exits.some((e) => e.open), { timeout: 60_000 }).toBe(true);
  await page.evaluate(() => {
    const s = (window as unknown as Airsoft).airsoft.state;
    const exit = s.round.run.exits.find((e) => e.open)!;
    const you = s.characters.find((c) => c.id === 0)!;
    Object.assign(you.position, exit.position);
  });
  await expect.poll(async () => (await round(page)).reason, { timeout: 120_000 }).toBe('extracted');
  await expect(page.locator('.menu-summary .summary-result')).toContainText(/Extracted!/, { timeout: 30_000 });
}

/** Each mode's short match (the never-check: a new mode answers here). */
function playFor(mode: MatchMode): { ghost: boolean; play: (page: Page) => Promise<void> } {
  switch (mode) {
    case 'elimination':
    case 'attackDefend':
      return { ghost: false, play: roundsMatch };
    case 'extraction':
      return { ghost: true, play: run };
    default:
      return unknownMode(mode);
  }
}

for (const mode of MATCH_MODES.filter((m) => !ONLY_MODE || m.id === ONLY_MODE)) {
  test(`${mode.label} on ${MAP}: it starts, a round ends both ways, the end screen shows, nothing errors`, async ({ page }) => {
    test.setTimeout(300_000);
    const errors: string[] = [];
    const how = playFor(mode.id);
    await startMatch(page, errors, mode, how.ghost);
    await how.play(page);
    expect(errors, errors.join(' | ')).toEqual([]);
  });
}

/**
 * Elimination's overtime flag (OT1, Dev 6 item 45): the clock run out on a level round puts the flag up; the banner says
 * "Overtime · touch the flag", the scoreboard's clock counts the overtime down under "Overtime" with the strip's line, and
 * a hand on the flag (the player put at its foot) wins the round, the banner saying so. Ghost is on so nobody hits the player.
 */
test('Overtime: a level time-out puts the flag up with its banner, clock and strip, and touching it wins the round', async ({ page }) => {
  test.skip(ONLY_MODE !== undefined, "a mode's content check plays only its own short match");
  test.setTimeout(300_000);
  const errors: string[] = [];
  const elimination = MATCH_MODES.find((m) => m.id === 'elimination')!;
  await startMatch(page, errors, elimination, true, 'Depot');
  type OvertimeRound = Round & { overtimeFlag: { up: boolean; left: number; position: { x: number; y: number; z: number } } };
  const flagState = () => page.evaluate(() => (window as unknown as Airsoft).airsoft.state.round as unknown as OvertimeRound);
  // The banner is a moment's headline: catch it in the page as the flag goes up, with the clock and strip beside it.
  await page.evaluate(() => {
    const w = window as unknown as { __seen?: { banner: string; clock: string; aim: string; strip: string } };
    const game = (window as unknown as Airsoft).airsoft;
    const text = (s: string) => document.querySelector(s)?.textContent ?? '';
    const tick = () => {
      const r = game.state.round as unknown as OvertimeRound;
      if (r.overtimeFlag.up && r.phase === 'live' && !w.__seen && text('.hitfx-round').startsWith('Overtime')) {
        w.__seen = { banner: text('.hitfx-round'), clock: text('.sb-clock'), aim: text('.sb-aim'), strip: text('.sb-flag-text') };
      }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
  // A level round (everyone in play) whose clock is about to run out.
  await expect
    .poll(
      () =>
        page.evaluate(() => {
          const r = (window as unknown as Airsoft).airsoft.state.round as unknown as OvertimeRound;
          if (r.phase !== 'live') return r.phase;
          if (r.overtimeFlag.up) return 'up';
          r.clock = 0.05;
          return 'live';
        }),
      { timeout: 60_000 },
    )
    .toBe('up');
  const up = await flagState();
  expect(up.overtimeFlag.left).toBeGreaterThan(0);
  await expect.poll(() => page.evaluate(() => (window as unknown as { __seen?: unknown }).__seen !== undefined), { timeout: 60_000 }).toBe(true);
  const seen = await page.evaluate(() => (window as unknown as { __seen: { banner: string; clock: string; aim: string; strip: string } }).__seen);
  expect(seen.banner).toBe('Overtime · touch the flag');
  expect(seen.clock).toMatch(/^0:\d\d$/);
  expect(seen.aim).toBe('Overtime');
  expect(seen.strip).toMatch(/^(Overtime · first hand on the flag wins|Both teams at the flag · nobody takes it)$/);
  // The player puts a hand on it (re-placed each poll): the round is theirs, or a bot's if one got there first.
  await expect
    .poll(
      () =>
        page.evaluate(() => {
          const s = (window as unknown as Airsoft).airsoft.state;
          const r = s.round as unknown as OvertimeRound;
          if (r.phase !== 'live') return r.reason;
          const you = s.characters.find((c) => c.id === 0)!;
          Object.assign(you.position, r.overtimeFlag.position);
          return 'live';
        }),
      { timeout: 60_000 },
    )
    .toBe('overtimeFlag');
  await expect(page.locator('.hitfx-round')).toHaveText(/(Flag touched · your team wins the round|Beta touched the flag · your team loses the round)/);
  expect((await flagState()).overtimeFlag.up, 'the flag stays up through the pause').toBe(true);
  await nextRound(page);
  expect((await flagState()).overtimeFlag.up, 'and is down for the next round').toBe(false);
  expect(errors, errors.join(' | ')).toEqual([]);
});
