import { expect, test } from '@playwright/test';

/**
 * Smoke test: the built game boots to the title screen with no map loaded, goes through New game (the Map, Match and
 * Difficulty pop-ups, a 2v2 picked, the Loadout and Settings screens, a crosshair picked) and starts a match with a 2× scope, an
 * angled grip, a hi-cap and 0.28 g BBs, holds Tab for the scoreboard, fires, reloads, moves the fire selector, aims
 * down the scope and keeps running without a page error.
 *
 * Uses `?nolock` (no pointer lock; automated browsers can't take it): the fire button and wheel work without
 * the lock there, but the real lock flow, mouse look and Esc to pause stay manual tests. SwiftShader draws only
 * a few frames a second, so the simulation runs slower than real time: assert on page text, never on frames,
 * and poll rather than wait fixed times.
 */
test('the game boots, starts a match, fires, reloads and aims without errors', async ({ page }, testInfo) => {
  const errors: string[] = [];
  page.on('pageerror', (err) => errors.push(`pageerror: ${err.message}`));
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(`console: ${msg.text()}`);
  });
  const errorList = () => (errors.length > 0 ? errors.join(' | ') : 'none');

  await page.goto('/?nolock&seed=1');
  // Wait for the title screen or the boot's own failure text, whichever comes first.
  await page.waitForFunction(
    () => document.querySelector('.menu-title-start') !== null || /Failed/.test(document.getElementById('loading')?.textContent ?? ''),
    undefined,
    { timeout: 30_000 },
  ).catch(() => undefined);
  if ((await page.locator('.menu-title-start').count()) === 0) {
    const loading = (await page.locator('#loading').textContent().catch(() => null)) ?? '(gone)';
    throw new Error(`The title screen never appeared. Loading text: "${loading}". Page errors: ${errorList()}`);
  }
  await expect(page.locator('#loading')).toHaveCount(0);
  await expect(page.locator('.menu-title-wordmark')).toBeVisible();
  // SwiftShader is a software renderer: the title screen warns that the game will run slowly (M18b).
  await expect(page.locator('.menu-title-warning')).toContainText('without hardware acceleration');
  // No map is loaded until Play (M15b); the e2e build exposes the game as `airsoft`.
  const matchLoaded = () => page.evaluate(() => (window as unknown as { airsoft: { state: unknown } }).airsoft.state !== null);
  expect(await matchLoaded()).toBe(false);

  // Title → Start → New game, with the picked mode's rules under the four buttons.
  await page.getByRole('button', { name: 'Start' }).click();
  const setup = page.locator('.menu-setup');
  await expect(setup).toBeVisible();
  await expect(page.locator('.setup-rules')).not.toBeEmpty();

  // Map opens a pop-up listing Depot, the default.
  await setup.getByRole('button', { name: /Map/i }).click();
  const mapDialog = page.getByRole('dialog', { name: 'Map' });
  await expect(mapDialog).toBeVisible();
  await expect(mapDialog.getByRole('button', { name: /Depot/i })).toHaveAttribute('aria-pressed', 'true');
  await mapDialog.getByRole('button', { name: /Depot/i }).click();
  await expect(mapDialog).toBeHidden();
  await expect(setup.getByRole('button', { name: /Map/i })).toContainText('Depot');

  // Match (M20): rounds to win, round time, team size, friendly fire and ricochets; the button sums them up.
  await expect(setup.getByRole('button', { name: /Match/i })).toContainText('3v3 · first to 5');
  await setup.getByRole('button', { name: /Match/i }).click();
  const matchDialog = page.getByRole('dialog', { name: 'Match' });
  await expect(matchDialog).toBeVisible();
  await expect(matchDialog.getByRole('group', { name: 'Ricochets count' }).getByRole('button', { name: 'Off' })).toHaveAttribute('aria-pressed', 'true');
  await matchDialog.getByRole('group', { name: 'Team size' }).getByRole('button', { name: '2v2' }).click();
  await matchDialog.getByRole('group', { name: 'Rounds to win' }).getByRole('button', { name: '3' }).click();
  await page.keyboard.press('Escape');
  await expect(matchDialog).toBeHidden();
  await expect(setup).toBeVisible(); // Esc closed the pop-up only
  await expect(setup.getByRole('button', { name: /Match/i })).toContainText('2v2 · first to 3');
  await expect(page.locator('.setup-rules')).toContainText('you and 1 bot teammate');
  await expect(page.locator('.setup-rules')).toContainText("won't go into your records"); // custom rules, said before Play

  // Difficulty opens a pop-up with a level for the opponents and one for your teammates; the button shows both.
  await setup.getByRole('button', { name: /Difficulty/i }).click();
  const dialog = page.getByRole('dialog', { name: 'Bot difficulty' });
  await expect(dialog).toBeVisible();
  // Nothing saved for the teammates yet: they follow the opponents' level until picked.
  await dialog.getByRole('group', { name: 'Opponents' }).getByRole('button', { name: 'Hard' }).click();
  await expect(dialog.getByRole('group', { name: 'Teammates' }).getByRole('button', { name: 'Hard' })).toHaveAttribute('aria-pressed', 'true');
  await dialog.getByRole('group', { name: 'Teammates' }).getByRole('button', { name: 'Normal' }).click();
  await dialog.getByRole('button', { name: 'Close' }).click();
  await expect(dialog).toBeHidden();
  await expect(setup.getByRole('button', { name: /Difficulty/i })).toContainText('Hard / Normal');
  await expect(page.locator('.setup-rules')).toContainText('2:30 rounds'); // the custom-rules note names the whole standard
  await setup.getByRole('button', { name: /Difficulty/i }).click();
  await dialog.getByRole('group', { name: 'Opponents' }).getByRole('button', { name: 'Normal' }).click();
  await dialog.getByRole('button', { name: 'Close' }).click();

  // The Loadout screen: the replica in each slot, the optic, and a hop-up dial and BB weight per replica. Fit the red
  // dot and heavier BBs before the match.
  await setup.getByRole('button', { name: /Loadout/i }).click();
  const loadout = page.locator('.menu-loadout');
  await expect(loadout).toBeVisible();
  await expect(loadout.locator('.loadout-hopup input[type=range]')).toHaveCount(2);
  await expect(loadout.getByRole('group', { name: 'Primary replica' }).getByRole('button', { name: 'AEG rifle' })).toHaveAttribute('aria-pressed', 'true');
  await loadout.getByRole('button', { name: 'Red dot' }).click();
  await expect(loadout.getByRole('button', { name: 'Red dot' })).toHaveAttribute('aria-pressed', 'true');
  const rifleWeight = loadout.getByRole('group', { name: 'AEG rifle BB weight' });
  await expect(rifleWeight.getByRole('button', { name: '0.25 g' })).toHaveAttribute('aria-pressed', 'true');
  await rifleWeight.getByRole('button', { name: '0.28 g' }).click();
  await expect(loadout.getByText(/Leaves the barrel at \d+ m\/s .* Longest reach at about 75% hop-up/).first()).toBeVisible();
  await loadout.getByRole('button', { name: 'Back' }).click();
  await expect(setup.getByRole('button', { name: /Loadout/i })).toContainText('Red dot');
  await expect(setup.getByRole('button', { name: /Loadout/i })).toContainText('0.28 g / 0.20 g BBs');

  // Attachments (M17b): the 2× scope, an angled grip and a hi-cap on the rifle, each with its numbers under it.
  await setup.getByRole('button', { name: /Loadout/i }).click();
  await loadout.getByRole('button', { name: '2× scope' }).click();
  const rifleGrip = loadout.getByRole('group', { name: 'AEG rifle grip' });
  await expect(rifleGrip.getByRole('button', { name: 'No grip' })).toHaveAttribute('aria-pressed', 'true');
  await rifleGrip.getByRole('button', { name: 'Angled grip' }).click();
  await expect(loadout.getByText(/Brings the AEG rifle up in 0\.36 s/)).toBeVisible();
  await expect(loadout.getByText('Up to your eye in 0.19 s with the angled grip.')).toBeVisible();
  await loadout.getByRole('group', { name: 'AEG rifle magazine' }).getByRole('button', { name: 'Hi-cap' }).click();
  await expect(loadout.getByText('120 BBs each, 2 carried (240 in all). Reload 1.8 s.')).toBeVisible();
  await expect(loadout.getByText('Replicas and outfit').first()).toBeAttached(); // skins, greyed as LATER
  await loadout.getByRole('button', { name: 'Back' }).click();
  await expect(setup.getByRole('button', { name: /Loadout/i })).toContainText('2× scope · Angled grip · Hi-cap mag');

  // Settings: its own screen with tabs; Esc works as Back and returns to New game, with focus back on the Settings tile.
  await setup.getByRole('button', { name: /Settings/i }).click();
  const settings = page.locator('.menu-settings');
  await expect(settings).toBeVisible();
  // Controls (M18): the sensitivity as cm/360 at the mouse's DPI; typing a cm/360 moves the slider to match.
  const cm = settings.getByRole('spinbutton', { name: /cm per 360/ });
  await expect(cm).toHaveValue(/^(19\.9|20\.0)$/); // 19.95 cm at sensitivity 1.00 and 800 DPI
  await cm.fill('40');
  await cm.press('Enter');
  await expect(settings.getByRole('slider', { name: 'Mouse sensitivity' })).toHaveValue('0.5');
  await expect(settings.getByRole('group', { name: 'Aim button' }).getByRole('button', { name: 'Hold' })).toHaveAttribute('aria-pressed', 'true');
  await settings.getByRole('tab', { name: /Accessibility/i }).click();
  await expect(settings.getByRole('group', { name: 'Reduced motion' }).getByRole('button', { name: 'Off' })).toHaveAttribute('aria-pressed', 'true');
  // M18b: High contrast team colours and the on-screen sound cues, both for the match below.
  await settings.getByRole('group', { name: 'Team colours' }).getByRole('button', { name: 'High contrast' }).click();
  await expect(settings.locator('.team-swatch')).toHaveCount(2);
  await settings.getByRole('group', { name: 'Sound cues' }).getByRole('button', { name: 'On' }).click();
  await settings.getByRole('tab', { name: /Graphics/i }).click();
  await expect(settings.getByRole('slider', { name: 'Field of view' })).toHaveValue('100');
  await expect(settings.getByRole('button', { name: 'Go fullscreen' })).toBeVisible();
  await settings.getByRole('tab', { name: /Key bindings/i }).click();
  // Fire and aim are bindings like the rest (M18), on the mouse buttons by default.
  await expect(settings.locator('.key-row').first()).toContainText('Left mouse');
  await settings.getByRole('tab', { name: /Audio/i }).click();
  await expect(settings.getByRole('slider', { name: /volume/i })).toHaveCount(3);
  // Crosshair (M19): a live preview, standing still and moving; the shape picked shows on both and in the match.
  await settings.getByRole('tab', { name: /Crosshair/i }).click();
  const previews = settings.locator('.crosshair-preview .hud-crosshair');
  await expect(previews).toHaveCount(2);
  await settings.getByRole('button', { name: 'Circle' }).click();
  await expect(previews.first()).toHaveClass(/\bshape-circle\b/);
  await page.keyboard.press('Escape');
  await expect(setup).toBeVisible();
  await expect(setup.getByRole('button', { name: /Settings/i })).toBeFocused();

  await setup.getByRole('button', { name: 'Play', exact: true }).click();
  await expect(page.locator('.menus')).toBeHidden({ timeout: 10_000 });
  expect(await matchLoaded()).toBe(true);
  await expect(page.locator('.hud')).toBeVisible();
  await expect(page.locator('.hud-replica-name')).toHaveText(/AEG rifle/i);
  await expect(page.locator('.hud .hud-crosshair')).toHaveClass(/\bshape-circle\b/);
  // The match wears the High contrast colours on the HUD, and the sound cue ring is up.
  expect(await page.evaluate(() => document.getElementById('app')!.style.getPropertyValue('--team-1'))).toBe('#e0601a');
  await expect(page.locator('.sound-cues')).not.toHaveAttribute('hidden');
  // Holding Tab shows the scoreboard with every player (M19); letting go hides it.
  const board = page.locator('.match-board');
  await page.keyboard.down('Tab');
  await expect(board).toBeVisible({ timeout: 10_000 });
  await expect(board.locator('tbody tr:not(:first-child)')).toHaveCount(4); // the 2v2 picked on Match
  await page.keyboard.up('Tab');
  await expect(board).toBeHidden({ timeout: 10_000 });
  const mag = page.locator('.hud-mag');
  await expect(mag).toHaveText(/^\d+$/);
  const full = Number(await mag.textContent());
  expect(full).toBe(120); // the hi-cap

  // Fire: hold the button until the magazine count drops.
  await page.mouse.move(640, 360);
  await page.mouse.down();
  await expect.poll(async () => Number(await mag.textContent()), { timeout: 20_000 }).toBeLessThan(full);
  await page.mouse.up();

  // Reload: the half-used magazine goes back in the pouch and a full one comes out.
  await page.keyboard.press('r');
  await expect.poll(async () => Number(await mag.textContent()), { timeout: 30_000 }).toBe(full);

  // Fire selector: the AEG starts on auto, and B steps it to single (semi).
  const fireMode = page.locator('.hud-firemode');
  await expect(fireMode).toHaveText('Auto');
  await page.keyboard.press('b');
  await expect(fireMode).toHaveText('Semi', { timeout: 10_000 });

  await testInfo.attach('in-match', { body: await page.screenshot(), contentType: 'image/png' });

  // Aim down the scope: hold the right button and the HUD swaps the crosshair for the eyepiece; let go and it's back.
  const hud = page.locator('.hud');
  await page.mouse.down({ button: 'right' });
  await expect(hud).toHaveClass(/\bscoped\b/, { timeout: 10_000 });
  await expect(page.locator('.hud-scope')).toBeVisible();
  await expect(page.locator('.hud-reddot')).toBeHidden();
  await testInfo.attach('aiming', { body: await page.screenshot(), contentType: 'image/png' });
  await page.mouse.up({ button: 'right' });
  await expect(hud).not.toHaveClass(/\baiming\b/, { timeout: 10_000 });

  // Browser basics (M18b). A hidden tab pauses the match.
  const pauseMenu = page.locator('.menu-pause');
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { value: true, configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await expect(pauseMenu).toBeVisible({ timeout: 10_000 });
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { value: false, configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await pauseMenu.getByRole('button', { name: 'Resume' }).click();
  await expect(page.locator('.menus')).toBeHidden({ timeout: 10_000 });

  // A lost graphics context pauses with a notice over everything; once it's back the pause menu says so, and the match
  // carries on drawing after Resume.
  await page.evaluate(() => {
    const gl = document.querySelector('canvas')!.getContext('webgl2')!;
    (window as unknown as { lose: WEBGL_lose_context }).lose = gl.getExtension('WEBGL_lose_context')!;
    (window as unknown as { lose: WEBGL_lose_context }).lose.loseContext();
  });
  await expect(page.locator('.graphics-notice')).toBeVisible({ timeout: 10_000 });
  await expect(pauseMenu).toBeAttached();
  // Nothing under the notice can resume the match (Resume had the focus).
  await page.keyboard.press('Space');
  await page.keyboard.press('Enter');
  await expect(pauseMenu).not.toHaveAttribute('hidden');
  await expect(page.locator('.menus')).not.toHaveAttribute('hidden');
  await page.evaluate(() => (window as unknown as { lose: WEBGL_lose_context }).lose.restoreContext());
  await expect(page.locator('.graphics-notice')).toBeHidden({ timeout: 10_000 });
  await expect(pauseMenu).toContainText('Graphics are back');
  await pauseMenu.getByRole('button', { name: 'Resume' }).click();
  await expect(page.locator('.menus')).toBeHidden({ timeout: 10_000 });
  const tick = () => page.evaluate(() => (window as unknown as { airsoft: { state: { tick: number } } }).airsoft.state.tick);
  const before = await tick();
  await expect.poll(tick, { timeout: 20_000 }).toBeGreaterThan(before + 30);
  await expect(page.locator('.hud')).toBeVisible();
  await testInfo.attach('after-graphics-reset', { body: await page.screenshot(), contentType: 'image/png' });

  // Sound cues: an Orange player's shot 6 m from the camera gets a marker on the ring. The shot is added to
  // each tick's events after the simulation has run (so no bot or physics step depends on luck), with the shooter
  // moved beside the camera only while the presentation reads the events, then put back.
  await page.evaluate(() => {
    type P = { x: number; y: number; z: number };
    type C = { id: number; team: number; position: P };
    type Session = {
      state: { characters: C[]; events: unknown[] };
      match: { afterTick: (yaw: number) => void };
    };
    const game = window as unknown as { airsoft: { session: Session; renderer: { camera: { position: P } } }; stopShots?: () => void };
    const s = game.airsoft.session;
    const cam = game.airsoft.renderer.camera.position;
    const enemy = s.state.characters.find((c) => c.team === 1)!;
    const real = s.match.afterTick;
    s.match.afterTick = function (yaw: number): void {
      const { x, y, z } = enemy.position;
      Object.assign(enemy.position, { x: cam.x + 6, y, z: cam.z });
      s.state.events.push({ type: 'shot', characterId: enemy.id, replicaId: 'aeg', position: { ...enemy.position } });
      real.call(this, yaw);
      s.state.events.pop();
      Object.assign(enemy.position, { x, y, z });
    };
    game.stopShots = () => {
      s.match.afterTick = real;
    };
  });
  await expect(page.locator('.sound-cue.cue-shot:not([hidden])').first()).toBeAttached({ timeout: 10_000 });
  await page.evaluate(() => (window as unknown as { stopShots: () => void }).stopShots());
  await testInfo.attach('sound-cue', { body: await page.screenshot(), contentType: 'image/png' });
  expect(errors, `Page errors: ${errorList()}`).toEqual([]);
});

/** The practice range (M21): opened from the title, its targets loaded, firing reads out where the BB landed. */
test('the practice range opens from the title screen and reads out the last BB', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (err) => errors.push(`pageerror: ${err.message}`));
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(`console: ${msg.text()}`);
  });
  await page.goto('/?nolock&seed=1');
  await page.waitForSelector('.menu-title-start', { timeout: 30_000 });
  await page.getByRole('button', { name: 'Practice range' }).click();
  const readout = page.locator('.range-readout');
  await expect(readout).toBeVisible();
  await expect(readout).toContainText('Practice range');
  type RangeState = { targets: unknown[]; characters: { armament: { ammo: { mag: number; pouch: number[] }[]; handling: { magSize: number }[] } }[] };
  const state = () => page.evaluate(() => (window as unknown as { airsoft: { state: RangeState } }).airsoft.state);
  const s0 = await state();
  expect(s0.targets).toHaveLength(18);
  expect(s0.characters).toHaveLength(1); // you alone on the range

  // Fire down the middle: the BB lands somewhere downrange and the readout says how far.
  const canvas = page.locator('canvas').first();
  const box = (await canvas.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await expect(readout).toContainText('Last BB', { timeout: 30_000 });
  await page.mouse.up();
  const s1 = await state();
  const ammo = s1.characters[0]!.armament.ammo[0]!;
  expect(ammo.mag).toBeLessThan(s1.characters[0]!.armament.handling[0]!.magSize);
  expect(ammo.pouch.every((m) => m === s1.characters[0]!.armament.handling[0]!.magSize)).toBe(true);

  // Aim at the standing figure 10 m out (the middle lane's nearest) and knock it down: the readout names it.
  type Aim = { airsoft: { input: { yaw: number; pitch: number }; state: { targets: { kind: string; crouched: boolean; distance: number; position: { x: number; z: number } }[]; characters: { position: { x: number; z: number } }[] } } };
  await page.evaluate(() => {
    const game = (window as unknown as Aim).airsoft;
    const me = game.state.characters[0]!.position;
    const figure = game.state.targets.find((t) => t.kind === 'figure' && !t.crouched && t.distance === 10)!;
    const dx = figure.position.x - me.x;
    const dz = figure.position.z - me.z;
    game.input.yaw = Math.atan2(-dx, -dz); // facing -z at yaw 0
    game.input.pitch = Math.atan2(1.2 - 1.62, Math.hypot(dx, dz)); // eye height to the chest
  });
  await page.mouse.down();
  await expect(readout).toContainText('hit Figure 10 m', { timeout: 30_000 });
  await page.mouse.up();

  // Esc (here: tabbing away) on the range offers the Loadout; heavier BBs, Back, Resume: the range is rebuilt where you
  // stood and looked, with the new BBs in the rifle.
  const before = await page.evaluate(() => {
    const game = (window as unknown as Aim).airsoft;
    return { ...game.state.characters[0]!.position, yaw: game.input.yaw, pitch: game.input.pitch };
  });
  const pauseMenu = page.locator('.menu-pause');
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { value: true, configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await expect(pauseMenu).toBeVisible({ timeout: 10_000 });
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { value: false, configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await pauseMenu.getByRole('button', { name: 'Loadout' }).click();
  const loadout = page.locator('.menu-loadout');
  await loadout.getByRole('group', { name: 'AEG rifle BB weight' }).getByRole('button', { name: '0.28 g' }).click();
  await loadout.getByRole('button', { name: 'Back' }).click();
  await pauseMenu.getByRole('button', { name: 'Resume' }).click();
  await expect(page.locator('.menus')).toBeHidden({ timeout: 10_000 });
  await expect(readout).toContainText('Practice range'); // a new range: no last shot yet
  const after = await page.evaluate(() => {
    const game = (window as unknown as Aim & { airsoft: { state: { characters: { armament: { bbWeights: number[] } }[] } } }).airsoft;
    return { ...game.state.characters[0]!.position, yaw: game.input.yaw, pitch: game.input.pitch, bb: game.state.characters[0]!.armament.bbWeights[0] };
  });
  expect(after.x).toBeCloseTo(before.x, 1);
  expect(after.z).toBeCloseTo(before.z, 1);
  expect(after.yaw).toBeCloseTo(before.yaw, 3);
  expect(after.pitch).toBeCloseTo(before.pitch, 3);
  expect(after.bb).toBe(0.28);
  expect(errors).toEqual([]);
});
