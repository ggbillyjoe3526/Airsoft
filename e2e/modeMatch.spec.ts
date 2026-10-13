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
 * Resting on cover (M104): the player is put still on Depot's floor at (-10, -15.6) facing +x, where a 1.2 m crate stands
 * a step ahead (found with sim/coverRest.ts restTop, standing eye); the sight goes up with the right mouse button (the
 * default aim, held), and the HUD's "Rested" tag shows once the replica has settled on it, then hides when the aim is let go.
 * Ghost is on so no bot hits the player meanwhile; `input.resetView` (the Game's private PlayerInput) sets the yaw, since
 * ?nolock has no mouse look.
 */
test('Rest on cover: aiming still at a crate shows the Rested tag, and letting go of the aim hides it', async ({ page }) => {
  test.setTimeout(300_000);
  const errors: string[] = [];
  const elimination = MATCH_MODES.find((m) => m.id === 'elimination')!;
  await startMatch(page, errors, elimination, true, 'Depot');
  await expect.poll(async () => (await round(page)).phase, { timeout: 60_000 }).toBe('live');
  const tag = page.locator('.hud-rest');
  await expect(tag).toBeHidden(); // not resting while walking about
  // Stand the player at the crate, held still (re-placed each poll: the round start or a bot order may move it).
  const place = () =>
    page.evaluate(() => {
      const game = (window as unknown as { airsoft: { state: { characters: Character[] }; input: { resetView(yaw: number): void } } }).airsoft;
      const you = game.state.characters.find((c) => c.id === 0)!;
      Object.assign(you.position, { x: -10, y: 0, z: -15.6 });
      game.input.resetView(Math.PI / 2);
    });
  await place();
  await page.mouse.move(400, 300);
  await page.mouse.down({ button: 'right' });
  await expect
    .poll(async () => {
      await place();
      return tag.isVisible();
    }, { timeout: 60_000 })
    .toBe(true);
  await expect(tag).toHaveText('Rested');
  await page.mouse.up({ button: 'right' });
  await expect(tag).toBeHidden({ timeout: 30_000 });
  expect(errors, errors.join(' | ')).toEqual([]);
});
