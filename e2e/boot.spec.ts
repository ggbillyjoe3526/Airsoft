import { expect, test } from '@playwright/test';
import { renders } from './rendererRow';

/**
 * Smoke test: the built game boots to the title screen with no map loaded, goes through New game (the Map, Match and
 * Difficulty pop-ups, a 2v2 picked, the Loadout and Settings screens, a crosshair picked) and starts a match with a 2x scope, an
 * angled grip, a hi-cap and 0.28 g BBs (unlocked through a saved level 7), holds Tab for the scoreboard, fires, reloads, moves the fire selector, aims
 * down the scope, switches the graphics quality to Medium and back to Low mid-match, ends the match (summary, result, Play
 * Again) and keeps running without a page error.
 *
 * Uses `?nolock` (no pointer lock): the fire button and wheel work without the lock there. The real lock flow is
 * `release.spec.ts`; mouse look, the wheel's pointer and Esc itself stay hand checks (Esc releases the lock in the
 * browser, out of reach of a synthetic key press). SwiftShader draws only
 * a few frames a second, so the simulation runs slower than real time: assert on page text, never on frames,
 * and poll rather than wait fixed times. It loads with no `?quality=`, as a player would: the game sees SwiftShader
 * draws in software and starts on Low itself (audit M-02), since the art pass (M14) on Medium or High draws too slowly
 * in software on a CI runner for the reload and range steps to finish in time.
 */
test('the game boots, starts a match, fires, reloads and aims without errors', async ({ page, browserName }, testInfo) => {
  // The longest test (since the audit fixes it also rebinds a key and plays to the result screen): about 30 s here,
  // three to four times that on a CI runner in software. In a cloud container it now takes about 3 min alone (main at
  // 69d69f5 ran out of a 180 s budget in two of three runs, UX1), so it gets four times the default budget.
  test.setTimeout(360_000);
  const errors: string[] = [];
  page.on('pageerror', (err) => errors.push(`pageerror: ${err.message}`));
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(`console: ${msg.text()}`);
  });
  const errorList = () => (errors.length > 0 ? errors.join(' | ') : 'none');

  // Level unlocks (LV1) a new player wouldn't have: the red dot, the 2x scope, the angled grip and the hi-cap come with
  // level 7 (3,400 XP; levels.md). Saved before the page loads, as a returning player's progress: 3,500 XP, the unlocks
  // left for the game to add as it reads them.
  await page.addInitScript(() => {
    localStorage.setItem('airsoft.progress', JSON.stringify({ version: 1, xp: 3500, unlocked: [], rev: 1 }));
  });
  // The loading bar (audit CORE-10): the furthest it got, read as the page changes it.
  await page.addInitScript(() => {
    const w = window as unknown as { loadingMax: number };
    w.loadingMax = -1;
    new MutationObserver(() => {
      const now = Number(document.querySelector('.loading-bar')?.getAttribute('aria-valuenow') ?? -1);
      w.loadingMax = Math.max(w.loadingMax, now);
    }).observe(document, { subtree: true, attributes: true, attributeFilter: ['aria-valuenow'] });
  });
  await page.goto('/?nolock&seed=1');
  // Wait for the title screen or the start-up failure pane (audit CORE-28), whichever comes first.
  await page.waitForFunction(
    () => document.querySelector('.menu-title-start') !== null || document.querySelector('.crash-screen') !== null,
    undefined,
    { timeout: 30_000 },
  ).catch(() => undefined);
  if ((await page.locator('.menu-title-start').count()) === 0) {
    const loading = (await page.locator('#loading').textContent().catch(() => null)) ?? '(gone)';
    const report = (await page.locator('.crash-report').inputValue().catch(() => null)) ?? '(no crash pane)';
    throw new Error(`The title screen never appeared. Loading text: "${loading}". Report: ${report}. Page errors: ${errorList()}`);
  }
  await expect(page.locator('#loading')).toHaveCount(0);
  await expect(page.locator('.menu-title-wordmark')).toBeVisible();
  // Release basics (audit CORE-19, FA9): the built page carries its Content-Security-Policy (a violation would be a
  // console error above), an icon and a manifest. The loading bar showed the physics download (CORE-10), Rapier's
  // WebAssembly as a plain file (IM3): it is fetched once with progress and Rapier's own fetch that follows is answered
  // by the cache, not a second download. Rapier's code chunk, no longer carrying the WebAssembly as base64, is preloaded
  // beside the game's own code and downloads once.
  await expect(page.locator('meta[http-equiv="Content-Security-Policy"]')).toHaveAttribute('content', /'wasm-unsafe-eval'/);
  await expect(page.locator('link[rel="icon"]')).toHaveAttribute('href', /icon\.svg$/);
  await expect(page.locator('link[rel="manifest"]')).toHaveCount(1);
  const physicsWasm = (await page.locator('meta[name="airsoft-physics-wasm"]').getAttribute('content')) ?? '';
  expect(physicsWasm).toMatch(/rapier_wasm3d_bg-.*\.wasm$/);
  await expect(page.locator('link[rel="modulepreload"][href*="rapier"]')).toHaveCount(1);
  await expect(page.locator('link[rel="modulepreload"][href*="rapier"]')).toHaveAttribute('href', /rapier-.*\.js$/);
  expect(await page.evaluate(() => (window as unknown as { loadingMax: number }).loadingMax)).toBeGreaterThanOrEqual(85);
  const physicsLoads = (name: RegExp) =>
    page.evaluate(
      (source) =>
        performance
          .getEntriesByType('resource')
          .filter((e) => new RegExp(source).test(e.name))
          .map((e) => ({ full: (e as PerformanceResourceTiming).transferSize > (e as PerformanceResourceTiming).encodedBodySize / 2, bytes: (e as PerformanceResourceTiming).decodedBodySize })),
      name.source,
    );
  // Firefox reports a revalidated response (304, as the test server's no-cache asks for) with the full body's transfer
  // size (checked in Firefox 136, IN1), so a second download can't be told from the cache there: Chromium checks it.
  const wasmLoads = await physicsLoads(/rapier_wasm3d_bg-.*\.wasm$/);
  const chunkLoads = await physicsLoads(/rapier-.*\.js$/);
  if (browserName !== 'firefox') {
    expect(wasmLoads.filter((load) => load.full)).toHaveLength(1);
    expect(chunkLoads.filter((load) => load.full)).toHaveLength(1);
  }
  expect(chunkLoads[0]!.bytes).toBeLessThan(500_000);
  // SwiftShader is a software renderer: the title screen warns that the game will run slowly (M18b), and that it picked
  // Low for this visit as nothing was saved (audit M-02).
  await expect(page.locator('.menu-title-warning')).toContainText('without hardware acceleration');
  await expect(page.locator('.menu-title-warning')).toContainText('set to Low for this visit');
  // No map is loaded until Play (M15b); the e2e build exposes the game as `airsoft`.
  const matchLoaded = () => page.evaluate(() => (window as unknown as { airsoft: { state: unknown } }).airsoft.state !== null);
  expect(await matchLoaded()).toBe(false);

  // Title → Play → the Play screen (G3): the map and the mode as cards, the Match section, and Your match beside them
  // with the picked mode's rules.
  await page.locator('.menu-title-start').click();
  const setup = page.locator('.menu-setup');
  await expect(setup).toBeVisible();
  await expect(page.locator('.setup-rules')).not.toBeEmpty();
  // The top bar (G3) shows the place on screen and your level (LV1).
  const topBar = page.locator('.menu-topbar');
  await expect(topBar.getByRole('button', { name: 'Match', exact: true })).toHaveAttribute('aria-current', 'page');

  // The Map cards: Depot, the default, picked.
  const maps = setup.getByRole('group', { name: 'Map', exact: true });
  await expect(maps.getByRole('button', { name: /Depot/i })).toHaveAttribute('aria-pressed', 'true');
  // Woodland is dev content (M35): not listed at all while Dev content is off (devContent.spec.ts turns it on).
  await expect(maps.getByRole('button', { name: /Woodland/i })).toBeHidden();
  await maps.getByRole('button', { name: /Depot/i }).click();
  await expect(setup.locator('.play-map-line')).toHaveText('Depot');

  // Match (M20): rounds to win, round time, team size, friendly fire and ricochets; Your match sums them up.
  // The rules as chips (MR1): the ruleset, the size and the wins.
  const facts = setup.locator('.play-facts');
  await expect(setup.locator('.play-chip')).toHaveText(['Skirmish', '3v3', 'first to 5']);
  const match = setup.locator('.match-panel');
  await expect(match.getByRole('group', { name: 'Ricochets count' }).getByRole('button', { name: 'Off' })).toHaveAttribute('aria-pressed', 'true');
  // Rules (M39): Skirmish is picked, Tournament and Pro CQB are dev content (hidden with Dev content off), Custom opens
  // every switch; Skirmish and a named ruleset show only the rows they leave to the player.
  const rulesGroup = match.getByRole('group', { name: 'Rules' });
  await expect(rulesGroup.getByRole('button', { name: 'Skirmish' })).toHaveAttribute('aria-pressed', 'true');
  await expect(rulesGroup.getByRole('button', { name: 'Tournament' })).toBeHidden();
  await expect(rulesGroup.getByRole('button', { name: 'Pro CQB' })).toBeHidden();
  await expect(match.getByRole('group', { name: 'Win by two' })).toBeHidden();
  await rulesGroup.getByRole('button', { name: 'Custom' }).click();
  await expect(match.getByRole('group', { name: 'Win by two' })).toBeVisible();
  await expect(match.getByRole('group', { name: 'Fire modes' })).toBeVisible();
  await expect(page.locator('.setup-rules')).toContainText('never go into your records'); // Custom never goes into the records, and says so
  await rulesGroup.getByRole('button', { name: 'Skirmish' }).click();
  await expect(match.getByRole('group', { name: 'Win by two' })).toBeHidden();
  await match.getByRole('group', { name: 'Team size' }).getByRole('button', { name: '2v2' }).click();
  await match.getByRole('group', { name: 'Rounds to win' }).getByRole('button', { name: '3' }).click();
  await expect(setup.locator('.play-chip')).toHaveText(['Skirmish', '2v2', 'first to 3']);
  await expect(page.locator('.setup-rules')).toContainText('you and 1 bot teammate');
  await expect(page.locator('.setup-rules')).toContainText("won't go into your records"); // custom rules, said before Play

  // Difficulty: a level for the opponents and one for your teammates; Your match shows both.
  // Nothing saved for the teammates yet: they follow the opponents' level until picked.
  await match.getByRole('group', { name: 'Opponents' }).getByRole('button', { name: 'Hard' }).click();
  await expect(match.getByRole('group', { name: 'Teammates' }).getByRole('button', { name: 'Hard' })).toHaveAttribute('aria-pressed', 'true');
  await match.getByRole('group', { name: 'Teammates' }).getByRole('button', { name: 'Normal' }).click();
  await expect(facts).toContainText('Hard / Normal');
  await expect(page.locator('.setup-rules')).toContainText('2:30 rounds'); // the custom-rules note names the whole standard
  await match.getByRole('group', { name: 'Opponents' }).getByRole('button', { name: 'Normal' }).click();

  // The Loadout screen (M26b; G3 look): three gear slots, the AEG Rifle and GBB Pistol equipped, Grenades empty.
  // Right-click the Primary slot to customise the rifle: fit the red dot and heavier BBs before the match.
  await setup.getByRole('button', { name: 'Change Loadout' }).click();
  const loadout = page.locator('.menu-loadout');
  await expect(loadout).toBeVisible();
  await expect(loadout.locator('.gear-slot')).toHaveCount(3);
  const primary = loadout.getByRole('button', { name: /^Primary: AEG Rifle/ });
  await expect(primary).toHaveAttribute('aria-pressed', 'true');
  await expect(loadout.getByRole('button', { name: /^Secondary: GBB Pistol/ })).toBeVisible();
  await expect(loadout.getByRole('button', { name: /^Grenades: Empty/ })).toBeVisible();
  await expect(primary.locator('.gear-stats')).toHaveText('0.97 J · 13 BBs/s · 60 BBs');
  await primary.click({ button: 'right' });
  await expect(loadout.getByRole('heading', { name: /Customise: AEG Rifle/ })).toBeVisible();
  // Customise opens on Colour, the first part, with the keyboard on its tab; the parts are tabs down the left.
  const partTab = (name: string) => loadout.getByRole('tab', { name: new RegExp(`^${name}`) });
  await expect(partTab('Colour')).toHaveAttribute('aria-selected', 'true');
  await expect(partTab('Colour')).toBeFocused();
  await partTab('Optic').click();
  // The Performance sheet (M29) sits beside the parts: the numbers of the rifle as it comes.
  const sheet = loadout.locator('.customise-perf');
  await expect(sheet).toBeVisible();
  await expect(sheet.getByText('Energy', { exact: true })).toBeVisible();
  await expect(sheet.locator('dd', { hasText: /^0\.97 J/ })).toBeVisible();
  await expect(sheet.locator('dd', { hasText: /^13 BBs\/s/ })).toBeVisible();
  await expect(sheet.locator('dd', { hasText: /^60 × 4 \(240\)/ })).toBeVisible();
  // Down its iron sights with no optic fitted (M84).
  await expect(sheet.locator('dt', { hasText: /^Aim raise$/ }).locator('xpath=following-sibling::dd[1]')).toHaveText(/^0\.15 s/);
  for (const label of ['Muzzle speed', 'BB weight', 'On target to', 'Time to 20 m', 'Spread', 'Recoil', 'Reload', 'Draw', 'Aim raise', 'Shots heard from']) await expect(sheet.getByText(label, { exact: true })).toBeVisible();
  const optic = loadout.getByRole('group', { name: 'Optic' });
  await expect(optic.getByRole('button', { name: /Iron Sights/ })).toHaveAttribute('aria-pressed', 'true');
  await optic.getByRole('button', { name: /Red Dot/ }).click();
  await expect(optic.getByRole('button', { name: /Red Dot/ })).toHaveAttribute('aria-pressed', 'true');
  await expect(partTab('Optic')).toContainText('Red Dot');
  await partTab('BBs').click();
  const rifleWeight = loadout.getByRole('slider', { name: 'AEG Rifle BB weight' });
  await expect(rifleWeight).toHaveValue('0.25');
  await rifleWeight.fill('0.28');
  // The sheet follows the BB weight slider: a heavier BB is a little more energy, marked against the rifle as it comes.
  await expect(sheet.locator('dd', { hasText: /^0\.99 J/ })).toBeVisible();
  await expect(sheet.locator('dd', { hasText: /^0\.28 g/ })).toBeVisible();
  await expect(sheet.locator('dd', { hasText: /^0\.99 J/ }).locator('.perf-delta.perf-better')).toHaveText(/^\+\d/);
  await expect(sheet.locator('dd', { hasText: /^\d+ m\/s/ }).locator('.perf-delta.perf-worse')).toHaveText(/^−\d/);
  // The red dot just fitted shows its own raise time.
  await expect(sheet.locator('dd', { hasText: /^\d\.\d\d s/ }).last()).toBeVisible();
  await expect(loadout.getByText(/Leaves the barrel at \d+ m\/s .* Longest reach at about 75% hop-up/).first()).toBeVisible();
  // Glowing BBs (M33b) sit beside BB weight and hop-up: At Night by default, and the pick is kept for the replica.
  const glow = loadout.getByRole('group', { name: 'Glowing BBs' });
  await expect(glow.getByRole('button', { name: 'At Night' })).toHaveAttribute('aria-pressed', 'true');
  await expect(glow.getByRole('button', { name: 'Always' })).toHaveAttribute('aria-pressed', 'false');
  await expect(glow.getByRole('button', { name: 'Off' })).toHaveAttribute('aria-pressed', 'false');
  await glow.getByRole('button', { name: 'Always' }).click();
  await expect(loadout.getByRole('group', { name: 'Glowing BBs' }).getByRole('button', { name: 'Always' })).toHaveAttribute('aria-pressed', 'true');
  await loadout.getByRole('group', { name: 'Glowing BBs' }).getByRole('button', { name: 'At Night' }).click();
  await expect(loadout.getByRole('group', { name: 'Glowing BBs' }).getByRole('button', { name: 'At Night' })).toHaveAttribute('aria-pressed', 'true');
  // Back leaves Customise for the gear (MR1), then the top bar's Match returns to the Match screen (no key prompts
  // along the bottom since M100: the mouse has a button for each).
  await loadout.locator('.customise-back').click(); // Back to the gear (MR1)
  await expect(loadout.locator('.item-grid')).toBeVisible();
  await topBar.getByRole('button', { name: 'Match', exact: true }).click();
  const loadoutLine = setup.locator('.play-loadout-line');
  await expect(loadoutLine).toContainText('Red Dot');
  await expect(loadoutLine).toContainText('0.28 g / 0.20 g BBs');

  // Attachments: the 2x scope, the angled grip and a hi-cap on the rifle, each with its numbers under it.
  await setup.getByRole('button', { name: 'Change Loadout' }).click();
  await loadout.getByRole('button', { name: /^Customise AEG Rifle/ }).click();
  await partTab('Optic').click();
  await loadout.getByRole('group', { name: 'Optic' }).getByRole('button', { name: /2x Scope/ }).click();
  await partTab('Grip').click();
  const rifleGrip = loadout.getByRole('group', { name: 'Grip' });
  await expect(rifleGrip.getByRole('button', { name: /No Grip/ })).toHaveAttribute('aria-pressed', 'true');
  await rifleGrip.getByRole('button', { name: /Angled Grip/ }).click();
  await expect(rifleGrip.getByRole('button', { name: /Angled Grip/ })).toHaveAttribute('aria-pressed', 'true');
  // The numbers themselves are the unit tests' (loadoutChoice.test.ts); here only that they show (audit L-10).
  await expect(loadout.getByText(/Brings the AEG Rifle up in [\d.]+ s/)).toBeVisible();
  // The optic's line names the grip that steadies it: on the Optic part, where it belongs (G3: one part at a time).
  await partTab('Optic').click();
  await expect(loadout.getByText(/Up to your eye in [\d.]+ s with the angled grip\./)).toBeVisible();
  await partTab('Magazine').click();
  await loadout.getByRole('group', { name: 'Magazine' }).getByRole('button', { name: /Hi-Cap/ }).click();
  // The magazine's line sits under its tiles, in the same row.
  const hiCapLine = loadout.locator('.menu-row', { has: page.getByRole('group', { name: 'Magazine' }) }).getByText(/\d+ BBs each, \d+ carried \(\d+ in all\)\. Reload [\d.]+ s\./);
  await expect(hiCapLine).toBeVisible();
  const hiCap = Number((await hiCapLine.textContent())!.match(/(\d+) BBs each/)![1]); // checked in the match below
  await expect(partTab('Skins')).toHaveCount(0); // Skins joined Colour (MR1)
  // The pistol has no top rail: its Optic part is greyed. Esc goes back to the gear like Back.
  await page.keyboard.press('Escape');
  await loadout.getByRole('button', { name: /^Secondary: GBB Pistol/ }).click({ button: 'right' });
  await expect(partTab('Optic')).toHaveAttribute('aria-disabled', 'true');
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape'); // Esc on the gear is Back too
  await expect(setup).toBeVisible();
  await expect(loadoutLine).toContainText('2x Scope · Angled Grip · Hi-Cap Magazine');

  // The Armory (LV1): your level on the top bar opens it. Level 7 of 10, 100 of level 8's 900 XP, the LiPo battery next,
  // and every level on the track with its state.
  const badge = topBar.locator('.menu-chip-level');
  await expect(badge).toHaveText(/LVL 7/);
  await badge.click();
  const armory = page.locator('.menu-armory');
  await expect(armory).toBeVisible();
  await expect(armory.locator('.armory-level')).toHaveText(/Level 7\s*of 10/);
  await expect(armory.locator('.armory-xp-line')).toHaveText('100 / 900 XP');
  await expect(armory.locator('.armory-next')).toContainText('Level 8');
  await expect(armory.locator('.armory-next-item')).toContainText(['11.1 V LiPo Battery']);
  await expect(armory.locator('.armory-level-row')).toHaveCount(11);
  await expect(armory.locator('.armory-level-row[data-state="unlocked"]')).toHaveCount(8);
  await expect(armory.locator('.armory-level-row[data-state="next"]')).toHaveCount(1);
  await page.keyboard.press('Escape');
  await expect(setup).toBeVisible();
  await topBar.getByRole('button', { name: 'Armory', exact: true }).click();
  await expect(armory).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(setup).toBeVisible();

  // Settings (G3; William's order since the Dev 6 playtest, ST1): the groups down the left, opening on Display; Esc works
  // as Back and returns to the Play screen.
  await topBar.getByRole('button', { name: 'Settings' }).click();
  const settings = page.locator('.menu-settings');
  await expect(settings).toBeVisible();
  const group = (name: string | RegExp) => settings.getByRole('tab', { name });
  await expect(settings.getByRole('tab')).toHaveText([/^Display/, /^Graphics/, /^Gameplay/, /^Looks/, /^Audio/, /^Controls/, /^Accessibility/, /^Save file/]);
  // Display: the field of view and fullscreen, out of the old Graphics tab.
  await expect(group(/Display/i)).toHaveAttribute('aria-selected', 'true');
  await expect(settings.getByRole('slider', { name: 'Field of view' })).toHaveValue('90');
  await expect(settings.getByRole('button', { name: 'Enter Fullscreen' })).toBeVisible();
  await group(/Graphics/i).click();
  await expect(settings.getByRole('group', { name: 'Quality' }).getByRole('button', { name: 'Low' })).toHaveAttribute('aria-pressed', 'true');
  // Controls (M18): the sensitivity as cm/360 at the mouse's DPI; typing a cm/360 moves the slider to match.
  await group(/Controls/i).click();
  const cm = settings.getByRole('spinbutton', { name: /cm per 360/ });
  await expect(cm).toHaveValue(/^\d+\.\d$/); // worked out from the sensitivity and DPI (sensitivity.test.ts has the sums)
  await cm.fill('40');
  await cm.press('Enter');
  await expect(settings.getByRole('slider', { name: 'Mouse sensitivity' })).toHaveValue('0.5');
  // ST1: aim on Toggle and crouch on Hold by default.
  await expect(settings.getByRole('group', { name: 'Aim button' }).getByRole('button', { name: 'Toggle' })).toHaveAttribute('aria-pressed', 'true');
  await expect(settings.getByRole('group', { name: 'Crouch key' }).getByRole('button', { name: 'Hold' })).toHaveAttribute('aria-pressed', 'true');
  await expect(settings.getByRole('group', { name: 'Order wheel' }).getByRole('button', { name: 'Hover' })).toHaveAttribute('aria-pressed', 'true');
  // The key bindings sit under Controls (G3). Fire and aim are bindings like the rest (M18), on the mouse buttons by
  // default. A rebind by a real key press (audit L-27): each key box is named for its action (L-31); Reload moves to T,
  // is saved, and the match below reloads on T.
  await expect(settings.locator('.key-row').first()).toContainText('Left mouse');
  await settings.getByRole('button', { name: 'Reload, main key: R' }).click();
  await expect(settings.getByRole('button', { name: 'Reload, main key: waiting for a key' })).toBeVisible();
  await page.keyboard.press('KeyT');
  await expect(settings.getByRole('button', { name: 'Reload, main key: T' })).toHaveText('T');
  const savedReload = await page.evaluate(() => (JSON.parse(localStorage.getItem('airsoft.keyBindings') ?? '{}') as { reload?: string[] }).reload);
  expect(savedReload).toEqual(['KeyT']);
  // A note on every row of every group (G3 criterion 8); back to Controls for the search below.
  const tabs = settings.getByRole('tab');
  for (let i = 0; i < (await tabs.count()); i++) {
    await tabs.nth(i).click();
    const bare = settings.locator('.menu-row').filter({ visible: true }).filter({ hasNot: page.locator('.menu-row-help') });
    await expect(bare, await tabs.nth(i).innerText()).toHaveCount(0);
  }
  await group(/Controls/i).click();
  // Search (G3): every group's rows that match, a note on each; clearing it shows the group again.
  const search = settings.getByRole('searchbox', { name: 'Search settings' });
  await search.fill('sensitivity');
  await expect(settings.getByRole('slider', { name: 'Mouse sensitivity' })).toBeVisible();
  await expect(settings.getByRole('slider', { name: 'Aiming sensitivity' })).toBeVisible();
  await expect(settings.locator('.key-row').first()).toBeHidden();
  await search.fill('');
  await expect(settings.locator('.key-row').first()).toBeVisible();
  await group(/Accessibility/i).click();
  await expect(settings.getByRole('group', { name: 'Reduced motion' }).getByRole('button', { name: 'Off' })).toHaveAttribute('aria-pressed', 'true');
  // Reduced motion reaches the HUD's CSS animations through a class on the container (audit M-03); back off for the match.
  const reducedMotion = settings.getByRole('group', { name: 'Reduced motion' });
  await reducedMotion.getByRole('button', { name: 'On' }).click();
  await expect(page.locator('#app')).toHaveClass(/\breduced-motion\b/);
  await reducedMotion.getByRole('button', { name: 'Off' }).click();
  await expect(page.locator('#app')).not.toHaveClass(/\breduced-motion\b/);
  // M18b: High contrast team colours and the on-screen sound cues, both for the match below.
  await settings.getByRole('group', { name: 'Team colours' }).getByRole('button', { name: 'High Contrast' }).click();
  await expect(settings.locator('.team-swatch')).toHaveCount(2);
  await settings.getByRole('group', { name: 'Sound cues' }).getByRole('button', { name: 'On' }).click();
  // M24: the cues' colour and size reach the HUD as CSS variables on the container. Red by default (ST1).
  await expect(settings.getByRole('group', { name: 'Sound cue colour' }).getByRole('button', { name: 'Red' })).toHaveAttribute('aria-pressed', 'true');
  await settings.getByRole('group', { name: 'Sound cue colour' }).getByRole('button', { name: 'Yellow' }).click();
  await expect.poll(() => page.evaluate(() => document.getElementById('app')!.style.getPropertyValue('--cue-colour'))).toBe('#ffe94a');
  await expect(settings.getByRole('slider', { name: 'Sound cue size' })).toHaveValue('1');
  // G1: the Looks group has Robots (Mixed by default), saved as picked; Realistic colours left for the Loadout (ST1).
  await group(/Looks/i).click();
  await expect(group(/Looks/i)).toHaveAttribute('aria-selected', 'true');
  const robots = settings.getByRole('group', { name: 'Robots' });
  await expect(robots.getByRole('button', { name: 'Mixed' })).toHaveAttribute('aria-pressed', 'true');
  await expect(settings.getByRole('group', { name: 'Replica colours' })).toHaveCount(0);
  const savedLook = () => page.evaluate(() => JSON.parse(localStorage.getItem('airsoft.settings') ?? '{}') as { robots?: string });
  await robots.getByRole('button', { name: 'Humans only' }).click();
  await expect.poll(savedLook).toMatchObject({ robots: 'off' });
  await robots.getByRole('button', { name: 'Mixed' }).click();
  await expect.poll(savedLook).toMatchObject({ robots: 'on' });
  await group(/Audio/i).click();
  // Master, Effects, Power source (the owner's 0.1 Dev 5 playtest, note 2), Ambience and Interface, at William's
  // defaults (ST1); no Voices row.
  await expect(settings.getByRole('slider', { name: /volume/i })).toHaveCount(5);
  const volumes = [['Master volume', '1'], ['Effects volume', '0.8'], ['Power source volume', '1'], ['Ambience volume', '0.6'], ['Interface volume', '0.5']] as const;
  for (const [name, value] of volumes) await expect(settings.getByRole('slider', { name }), name).toHaveValue(value);
  await expect(settings.getByText('Voices (hit calls)')).toHaveCount(0);
  // The groups follow the tabs pattern (audit L-31): Arrow Up from Audio picks Looks, then Gameplay, and moves the
  // focus there.
  await page.keyboard.press('ArrowUp');
  await expect(group(/Looks/i)).toHaveAttribute('aria-selected', 'true');
  await page.keyboard.press('ArrowUp');
  await expect(group(/Gameplay/i)).toHaveAttribute('aria-selected', 'true');
  await expect(group(/Gameplay/i)).toBeFocused();
  // Gameplay (G3): the HUD's rows (M24) with the crosshair's. The scoreboard at 100% by default (ST1).
  await expect(settings.getByRole('slider', { name: 'Scoreboard size' })).toHaveValue('1');
  // G4: HUD opacity, 90 % by default, reaches the HUD as --hud-opacity on the container and is saved as hudOpacity.
  const hudOpacity = settings.getByRole('slider', { name: 'HUD opacity' });
  await expect(hudOpacity).toHaveValue('0.9');
  await expect(hudOpacity).toHaveAttribute('aria-valuetext', '90%');
  const appVar = (name: string) => page.evaluate((n) => document.getElementById('app')!.style.getPropertyValue(n), name);
  await expect.poll(() => appVar('--hud-opacity')).toBe('0.9');
  await hudOpacity.focus();
  await page.keyboard.press('ArrowLeft');
  await expect(hudOpacity).toHaveValue('0.85');
  await expect.poll(() => appVar('--hud-opacity')).toBe('0.85');
  const savedOpacity = () => page.evaluate(() => (JSON.parse(localStorage.getItem('airsoft.settings') ?? '{}') as { hudOpacity?: number }).hudOpacity);
  await expect.poll(savedOpacity).toBe(0.85);
  await page.keyboard.press('ArrowRight');
  await expect.poll(() => appVar('--hud-opacity')).toBe('0.9');
  await expect(settings.getByRole('group', { name: 'Hit feed' }).getByRole('button', { name: 'Fade' })).toHaveAttribute('aria-pressed', 'true');
  // M41: the What got you row, Auto by default (shown against Pro opponents only).
  const whatGotYou = settings.getByRole('group', { name: 'What got you' });
  await expect(whatGotYou).toBeVisible();
  await expect(whatGotYou.getByRole('button')).toHaveText(['Auto', 'On', 'Off']);
  await expect(whatGotYou.getByRole('button', { name: 'Auto' })).toHaveAttribute('aria-pressed', 'true');
  // Crosshair (M19): a live preview, standing still and moving; the shape picked shows on both and in the match.
  // The hit marker's preview (the owner's 0.1 Dev 5 playtest, note 4) draws your crosshair under its X: a third.
  const previews = settings.locator('.crosshair-preview .hud-crosshair');
  await expect(previews).toHaveCount(3);
  await settings.getByRole('button', { name: 'Circle' }).click();
  await expect(previews.first()).toHaveClass(/\bshape-circle\b/);
  // M24: the Dev group is hidden until its box is ticked; its settings apply only while it is (Debug info shows the panel).
  await expect(group(/^Dev/i)).toBeHidden();
  const devBox = settings.getByRole('checkbox', { name: 'Dev settings' });
  await devBox.check();
  await expect(group(/^Dev/i)).toHaveAttribute('aria-selected', 'true');
  await settings.getByRole('group', { name: 'Debug info' }).getByRole('button', { name: 'On' }).click();
  await expect(page.locator('.debug-overlay')).toBeVisible();
  // ST1: the Retro look is back on the Dev group (it was on Settings › Look from M96): Off, its sliders at 4 px and 216
  // colours; the smoke run leaves the filter off.
  const devPanel = settings.locator('#settings-panel-dev');
  const retro = devPanel.getByRole('group', { name: 'Retro look' });
  await expect(retro.getByRole('button', { name: 'Off' })).toHaveAttribute('aria-pressed', 'true');
  await expect(retro.getByRole('button', { name: 'On' })).toHaveAttribute('aria-pressed', 'false');
  await expect(devPanel.getByRole('slider', { name: 'Retro pixel size' })).toHaveValue('4');
  await expect(devPanel.getByRole('slider', { name: 'Retro colours' })).toHaveValue('6');
  await expect(devPanel.getByText('4 px', { exact: true })).toBeVisible();
  await expect(devPanel.getByText('216', { exact: true })).toBeVisible();
  // LV1: Disable levelling unlocks everything while it applies, so the level badge goes from the top bar; the Armory stays.
  const armoryPlace = topBar.getByRole('button', { name: 'Armory', exact: true });
  await settings.getByRole('group', { name: 'Disable levelling' }).getByRole('button', { name: 'On' }).click();
  await expect(badge).toBeHidden();
  await expect(armoryPlace).toBeVisible();
  await devBox.uncheck();
  await expect(page.locator('.debug-overlay')).toBeHidden();
  await expect(badge).toBeVisible();
  await expect(armoryPlace).toBeEnabled();
  await expect(group(/^Dev/i)).toBeHidden();
  await expect(group(/Display/i)).toHaveAttribute('aria-selected', 'true');
  await page.keyboard.press('Escape');
  await expect(setup).toBeVisible();
  await expect(setup.locator(':focus')).toHaveCount(1); // the keyboard is back on the Play screen

  const teamCss = () => page.evaluate(() => getComputedStyle(document.getElementById('app')!).getPropertyValue('--team-1').trim());
  await setup.getByRole('button', { name: 'Start match', exact: true }).click();
  await expect(page.locator('.menus')).toBeHidden({ timeout: 10_000 });
  expect(await matchLoaded()).toBe(true);
  await expect(page.locator('.hud')).toBeVisible();
  // The AEG in hand: its three fire modes (the panel names no replica since UI2).
  await expect(page.locator('.hud-mode')).toHaveCount(3);
  await expect(page.locator('.hud .hud-crosshair')).toHaveClass(/\bshape-circle\b/);
  // The match wears the High contrast colours on the HUD, and the sound cue ring is up.
  // The menus already wear the picked set (M98: the Your team dots), and the match keeps it: High contrast's HUD orange.
  const matchOrange = '#e0601a';
  const standardOrange = '#ff8a2a';
  expect(await teamCss()).toBe(matchOrange);
  await expect(page.locator('.sound-cues')).not.toHaveAttribute('hidden');
  // The keys below act on the frames after they're pressed, so the match must be drawing first. On a CI runner in
  // software a frame can take seconds early in a match (Chrome 153 there, where these steps were flaky with 10 s waits;
  // they never failed on Chromium 141 in the container): wait for frames to come, then give each key's result the same
  // CI-sized wait as the fire and reload steps below (keyWait).
  // The node renderer counts render() calls, never reset (a frame makes one or more), so the count moving on by ten
  // says the match is drawing; its `info.frame` only moves under its own animation loop, which the game doesn't use.
  const drawnAtStart = await renders(page);
  await expect.poll(() => renders(page), { timeout: 60_000 }).toBeGreaterThan(drawnAtStart + 10);
  const keyWait = { timeout: 30_000 };
  // Holding Tab shows the scoreboard with every player (M19); letting go hides it.
  const board = page.locator('.match-board');
  await page.keyboard.down('Tab');
  await expect(board).toBeVisible(keyWait);
  await expect(board.locator('tbody tr:not(:first-child)')).toHaveCount(4); // the 2v2 picked on Match
  await page.keyboard.up('Tab');
  await expect(board).toBeHidden(keyWait);
  // The minimap (M23) is up while playing, with the map and round under it (G4).
  await expect(page.locator('.minimap')).toBeVisible();
  await expect(page.locator('.minimap-caption')).toHaveText(/^Depot · Round \d+$/);
  // CL1: the minimap names the area you stand in, and the one feed (Dev 6 playtest item 32) waits top right for hits
  // and your teammates' calls.
  await expect(page.locator('.minimap-area')).toHaveText(/^[A-Z][A-Za-z ]+$/);
  await expect(page.locator('.hit-feed')).toHaveAttribute('aria-live', 'polite');
  await expect(page.locator('.hit-feed')).not.toHaveClass(/bottom-left/);
  // G4: the score bar says what wins the match; the replica panel has a chip per fire mode the AEG has, on the panel
  // navy at HUD opacity's 90 %; the round banner sets its words in capitals.
  await expect(page.locator('.sb-aim')).toHaveText(/^First to \d+/);
  await expect(page.locator('.hud-mode')).toHaveText(['S', 'B', 'A']);
  await expect(page.locator('.hud-replica')).toHaveCSS('background-color', 'rgba(7, 13, 31, 0.9)');
  await expect(page.locator('.hud-replica')).toHaveCSS('opacity', '1');
  await expect(page.locator('.hitfx-round')).toHaveCSS('text-transform', 'uppercase');
  // G4 (owner, 2026-10-08): no squad cards or order keys on screen; the squad orders show on the order wheel only.
  await expect(page.locator('.squad-bar, .squad-card, .squad-keys')).toHaveCount(0);
  // The order wheel (M23) shows while Z is held; let go in the middle, it closes with no order given.
  const wheel = page.locator('.order-wheel');
  await page.keyboard.down('z');
  await expect(wheel.locator('.order-wheel-item').first()).toBeVisible(keyWait);
  // Each direct order shows its key (FA5, UI-03); the Team Plan has none. MG1: the fifth, Need a Mag, is H.
  await expect(wheel.locator('.order-wheel-item')).toHaveText([/^Follow Me/, /^Hold Here/, /^Regroup/, 'Team Plan', /^Need a Mag/]);
  await expect(wheel.locator('.order-wheel-key')).toHaveText(['F', 'X', 'V', 'H']);
  await page.keyboard.up('z');
  await expect(wheel).toHaveAttribute('hidden', '', keyWait);
  // MG1: H with a full pouch only says why nothing happens, on the line under the crosshair (out of a live round, why not now).
  await page.keyboard.press('h');
  await expect(page.locator('.mag-prompt')).toHaveText(/^(You still have a full spare mag|Mags wait for the next round)$/i, keyWait);
  // Squad orders (M22): F has the bot teammates follow you and the HUD says so; F again sends them back to the plan.
  // Orders are taken only in a live round with you and a teammate in play (else the line says why for a moment).
  // The line is read out, not shown (G4): a status region off the screen, empty while they play the team plan.
  const squadLine = page.locator('.squad-order');
  await expect(squadLine).toHaveClass(/\bsr-only\b/);
  await expect(squadLine).toHaveAttribute('role', 'status');
  await expect(squadLine).toBeEmpty();
  expect((await squadLine.boundingBox())?.width ?? 0).toBeLessThanOrEqual(1);
  type Orders = { airsoft: { state: { round: { phase: string }; characters: { team: number; status: string }[] }; session: { player: { team: number; status: string } } } };
  const ordersTaken = () =>
    page.evaluate(() => {
      const { state, session } = (window as unknown as Orders).airsoft;
      const p = session.player;
      return state.round.phase === 'live' && p.status === 'alive' && state.characters.some((c) => c !== p && c.team === p.team && c.status === 'alive');
    });
  await expect.poll(ordersTaken, keyWait).toBe(true);
  await page.keyboard.press('f');
  await expect(squadLine).toHaveText(/Follow me/i, keyWait);
  await page.keyboard.press('f');
  await expect(squadLine).toHaveText(/Back to the team plan/i, keyWait);
  // X: they hold, and a marker shows where; X again on the same spot lets them go.
  const holdMarker = page.locator('.hold-marker');
  await page.keyboard.press('x');
  await expect(squadLine).toHaveText(/Hold here/i, keyWait);
  await expect(holdMarker).not.toHaveAttribute('hidden', keyWait);
  await expect(holdMarker).toContainText(/Hold · \d+ m/);
  await page.keyboard.press('x');
  await expect(squadLine).toHaveText(/Back to the team plan/i, keyWait);
  await expect(holdMarker).toHaveAttribute('hidden', '', keyWait);
  const mag = page.locator('.hud-mag');
  await expect(mag).toHaveText(/^\d+$/);
  const full = Number(await mag.textContent());
  expect(full).toBe(hiCap); // the hi-cap, as the Loadout said

  // Fire: hold the button until the magazine count drops.
  await page.mouse.move(640, 360);
  await page.mouse.down();
  await expect.poll(async () => Number(await mag.textContent()), { timeout: 20_000 }).toBeLessThan(full);
  await page.mouse.up();

  // Reload (on T, rebound in Settings): the half-used magazine goes back in the pouch and a full one comes out.
  await page.keyboard.press('t');
  await expect.poll(async () => Number(await mag.textContent()), { timeout: 30_000 }).toBe(full);

  // Fire selector: the AEG starts on auto, and B steps it to single (semi).
  const fireMode = page.locator('.hud-mode.on');
  await expect(fireMode).toHaveText('A');
  await page.keyboard.press('b');
  await expect(fireMode).toHaveText('S', { timeout: 10_000 });

  await testInfo.attach('in-match', { body: await page.screenshot(), contentType: 'image/png' });

  // Aim down the scope: a right click raises it (Toggle, the default since ST1) and the HUD swaps the crosshair for the
  // eyepiece, which stays up after the button is let go; a second click lowers it.
  const hud = page.locator('.hud');
  await page.mouse.down({ button: 'right' });
  await expect(hud).toHaveClass(/\bscoped\b/, { timeout: 10_000 });
  await page.mouse.up({ button: 'right' });
  await expect(page.locator('.hud-scope')).toBeVisible();
  await expect(page.locator('.hud-reddot')).toBeHidden();
  await testInfo.attach('aiming', { body: await page.screenshot(), contentType: 'image/png' });
  await expect(hud).toHaveClass(/\bscoped\b/);
  await page.mouse.down({ button: 'right' });
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
  // Graphics quality (M14): a saved picker on Settings → Graphics that applies at once (this visit started on Low, the
  // software fallback).
  // Medium turns the sun's shadows on in the match loaded and Low off again (the screenshots after this one show Low).
  await pauseMenu.getByRole('button', { name: 'Settings' }).click();
  await settings.getByRole('tab', { name: /Graphics/i }).click();
  const quality = settings.getByRole('group', { name: 'Quality' });
  const shadowsOn = () => page.evaluate(() => (window as unknown as { airsoft: { renderer: { renderer: { shadowMap: { enabled: boolean } } } } }).airsoft.renderer.renderer.shadowMap.enabled);
  // Edge smoothing (REN-04): the node renderer's multisampling is fixed for its life, so a change waits for the next
  // load (the Graphics tab says so) and nothing else is pending (W6a: the old WebGL path's new context is gone).
  type Smoothing = { airsoft: { renderer: { antialiased: boolean; antialiasPending: boolean } } };
  const smoothing = () => page.evaluate(() => { const r = (window as unknown as Smoothing).airsoft.renderer; return { given: r.antialiased, pending: r.antialiasPending }; });
  await expect(quality.getByRole('button', { name: 'Low' })).toHaveAttribute('aria-pressed', 'true');
  expect(await shadowsOn()).toBe(false);
  expect(await smoothing()).toEqual({ given: false, pending: false });
  await quality.getByRole('button', { name: 'Medium' }).click();
  await expect(quality.getByRole('button', { name: 'Medium' })).toHaveAttribute('aria-pressed', 'true');
  expect(await shadowsOn()).toBe(true);
  expect(await smoothing()).toEqual({ given: false, pending: true });
  expect(await page.locator('canvas.game-canvas').count()).toBe(1);
  // The Custom rows are folded under a preset (M68, audit UI-09): opened here, a row moves the picker to Custom, and
  // setting it back finds Medium again.
  const shadows = settings.getByRole('group', { name: 'Shadows', exact: true });
  await expect(shadows).toBeHidden();
  await settings.locator('summary', { hasText: 'Custom settings' }).click();
  await expect(shadows).toBeVisible();
  await shadows.getByRole('button', { name: 'Off' }).click();
  await expect(quality.getByRole('button', { name: 'Custom' })).toHaveAttribute('aria-pressed', 'true');
  expect(await shadowsOn()).toBe(false);
  await shadows.getByRole('button', { name: 'On' }).click();
  await expect(quality.getByRole('button', { name: 'Medium' })).toHaveAttribute('aria-pressed', 'true');
  await quality.getByRole('button', { name: 'Low' }).click();
  await expect(quality.getByRole('button', { name: 'Low' })).toHaveAttribute('aria-pressed', 'true');
  expect(await shadowsOn()).toBe(false);
  expect(await smoothing()).toEqual({ given: false, pending: false });
  // Team colours picked mid-match show from the next match, Play Again included (bug pass): back to Standard here.
  await settings.getByRole('tab', { name: /Accessibility/i }).click();
  await settings.getByRole('group', { name: 'Team colours' }).getByRole('button', { name: 'Standard' }).click();
  expect(await teamCss()).toBe(matchOrange);
  await page.keyboard.press('Escape');
  await expect(pauseMenu).toBeVisible();
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

  // The match's end (audit L-27): in a live round with Blue one win short, the Orange team is put out of play, so the
  // simulation ends the round and the match with it (a round between rounds, or a draw, gets another go). The summary
  // comes up with the records (custom rules, so not counted), then the result, and Play Again starts the match over.
  type End = { airsoft: { state: { round: { phase: string; score: number[] }; characters: { team: number; status: string }[] }; session: { rounds: { winsNeeded: number } } } };
  await expect
    .poll(
      () =>
        page.evaluate(() => {
          const game = (window as unknown as End).airsoft;
          const r = game.state.round;
          if (r.phase === 'matchOver') return true;
          if (r.phase === 'live') {
            r.score[0] = game.session.rounds.winsNeeded - 1;
            for (const c of game.state.characters) if (c.team === 1) c.status = 'out';
          }
          return false;
        }),
      { timeout: 30_000 },
    )
    .toBe(true);
  const summary = page.locator('.menu-summary');
  await expect(summary).toBeVisible({ timeout: 30_000 });
  await expect(summary.locator('.summary-result')).toContainText('You win!');
  await expect(summary.locator('.records-not-counted')).toContainText('Custom rules');
  await expect(summary.locator('.records-grid td').first()).toHaveText('–');
  // Custom rules still give XP (LV1), scaled to the shorter match.
  await expect(summary.locator('.summary-xp')).toContainText(/XP earned\s*\+\d+ XP/i);
  await summary.getByRole('button', { name: 'Continue' }).click();
  const result = page.locator('.menu-result');
  await expect(result).toBeVisible();
  await expect(result.locator('.menu-result-headline')).toHaveText('You win!');
  await result.getByRole('button', { name: 'Play Again' }).click();
  await expect(page.locator('.menus')).toBeHidden({ timeout: 10_000 });
  const round = () => page.evaluate(() => (window as unknown as End).airsoft.state.round);
  await expect.poll(async () => (await round()).phase, { timeout: 10_000 }).toBe('live');
  expect((await round()).score).toEqual([0, 0]);
  expect(await teamCss()).toBe(standardOrange); // the Standard set picked mid-match
  expect(errors, `Page errors: ${errorList()}`).toEqual([]);
});

/**
 * The High preset (the default on a real GPU) still boots in a browser: `?quality=high` overrides the software fallback,
 * so its renderer setup runs once here, to the title screen only (a match on High is too slow in software).
 */
/** Barrels and the silencer (M29b): Customise's Barrel and Muzzle rows, what they offer, and the sheet's "Shots heard from". */
for (const withParts of [false, true]) {
  test(`Customise has Barrel and Muzzle rows (${withParts ? 'owning the barrels and silencer' : 'starters only'})`, async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (err) => errors.push(`pageerror: ${err.message}`));
    page.on('console', (msg) => {
      if (msg.type() === 'error') errors.push(`console: ${msg.text()}`);
    });
    // The Silencer (level 4), Tight-Bore Barrel (level 5) and Long Barrel (level 9) come with levels (LV1): a returning
    // player at level 9 (5,300 XP, levels.md) has them; a new player at level 0 sees them locked.
    await page.addInitScript((extra) => {
      localStorage.setItem('airsoft.progress', JSON.stringify({ version: 1, xp: extra ? 5300 : 0, unlocked: [], rev: 1 }));
    }, withParts);
    await page.goto('/?nolock&seed=1&quality=low');
    await page.waitForSelector('.menu-title-start', { timeout: 30_000 });
    // The title's Loadout (G3), then Customise on the rifle: its parts are tabs, Barrel and Muzzle among them.
    await page.locator('.menu-title-start').click();
    await page.locator('.menu-topbar').getByRole('button', { name: 'Loadout', exact: true }).click();
    const loadout = page.locator('.menu-loadout');
    await loadout.getByRole('button', { name: /^Primary: AEG Rifle/ }).click({ button: 'right' });
    await expect(loadout.getByRole('heading', { name: /Customise: AEG Rifle/ })).toBeVisible();
    const partTab = (name: string) => loadout.getByRole('tab', { name: new RegExp(`^${name}`) });
    await partTab('Barrel').click();
    const sheet = loadout.locator('.customise-perf');
    const heardFrom = sheet.locator('dt', { hasText: 'Shots heard from' }).locator('xpath=following-sibling::dd[1]');
    const barrel = loadout.getByRole('group', { name: 'Barrel', exact: true });
    const muzzle = loadout.getByRole('group', { name: 'Muzzle', exact: true });
    // The AEG takes both: "as it comes" is picked, and shots carry 22 m.
    await expect(barrel.getByRole('button', { name: /Standard/ })).toHaveAttribute('aria-pressed', 'true');
    await expect(heardFrom).toHaveText(/^22 m/);
    if (!withParts) {
      // Nothing still locked can be picked: the barrels show greyed with the level that unlocks each, and a line says how.
      await expect(barrel.getByRole('button')).toHaveCount(1);
      await expect(barrel.locator('.option-locked')).toHaveText([/Tight-Bore Barrel\s*Level 5/, /Long Barrel\s*Level 9/]);
      const levelUpLine = 'Level up to unlock more: the Armory shows what each level gives.';
      await expect(loadout.locator('.menu-row', { has: page.getByRole('group', { name: 'Barrel', exact: true }) }).getByText(levelUpLine)).toBeVisible();
      await partTab('Muzzle').click();
      await expect(muzzle.getByRole('button', { name: /None/ })).toHaveAttribute('aria-pressed', 'true');
      await expect(muzzle.getByRole('button')).toHaveCount(1);
      await expect(muzzle.locator('.option-locked')).toHaveText([/Silencer\s*Level 4/]);
      await expect(loadout.locator('.menu-row', { has: page.getByRole('group', { name: 'Muzzle', exact: true }) }).getByText(levelUpLine)).toBeVisible();
    } else {
      await expect(barrel.getByRole('button')).toHaveCount(3);
      await expect(barrel.getByRole('button', { name: /Tight-Bore Barrel/ })).toBeVisible();
      await barrel.getByRole('button', { name: /Long Barrel/ }).click();
      await expect(barrel.getByRole('button', { name: /Long Barrel/ })).toHaveAttribute('aria-pressed', 'true');
      await expect(loadout.locator('.menu-row', { has: page.getByRole('group', { name: 'Barrel', exact: true }) }).getByText(/Brings it up in [\d.]+ s\./)).toBeVisible();
      // A long barrel is front-heavy: a slower draw is marked worse, the extra energy better (LV1: +10 %).
      await expect(sheet.locator('dt', { hasText: /^Draw$/ }).locator('xpath=following-sibling::dd[1]').locator('.perf-delta.perf-worse')).toHaveText(/^\+15%/);
      await expect(sheet.locator('dt', { hasText: /^Energy$/ }).locator('xpath=following-sibling::dd[1]').locator('.perf-delta.perf-better')).toHaveText(/^\+10%/);
      // The silencer halves how far shots are heard, which the sheet marks as better, and says it to the player.
      await partTab('Muzzle').click();
      await expect(muzzle.getByRole('button', { name: /None/ })).toHaveAttribute('aria-pressed', 'true');
      await expect(muzzle.getByRole('button')).toHaveCount(2);
      await muzzle.getByRole('button', { name: /Silencer/ }).click();
      await expect(heardFrom).toHaveText(/^11 m/);
      await expect(heardFrom.locator('.perf-delta.perf-better')).toHaveText(/^−50%/);
      await expect(loadout.getByText('Bots hear your shots from 11 m (22 m without a silencer).')).toBeVisible();
    }
    // The pistol's barrel is fixed (a greyed row), and its muzzle is threaded: owned, it offers the silencer.
    await page.keyboard.press('Escape');
    await loadout.getByRole('button', { name: /^Secondary: GBB Pistol/ }).click({ button: 'right' });
    await expect(loadout.getByRole('heading', { name: /Customise: GBB Pistol/ })).toBeVisible();
    await expect(partTab('Barrel')).toHaveAttribute('aria-disabled', 'true');
    await expect(partTab('Barrel')).toContainText('Fixed barrel');
    await expect(loadout.getByRole('group', { name: 'Barrel', exact: true })).toHaveCount(0);
    await partTab('Muzzle').click();
    const pistolMuzzle = loadout.getByRole('group', { name: 'Muzzle', exact: true });
    await expect(pistolMuzzle.getByRole('button', { name: /None/ })).toHaveAttribute('aria-pressed', 'true');
    await expect(pistolMuzzle.getByRole('button')).toHaveCount(withParts ? 2 : 1);
    expect(errors).toEqual([]);
  });
}

test('the game boots to the title screen on High', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (err) => errors.push(`pageerror: ${err.message}`));
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(`console: ${msg.text()}`);
  });
  // A saved level so the Armory below has a track to draw on High.
  await page.addInitScript(() => localStorage.setItem('airsoft.progress', JSON.stringify({ version: 1, xp: 1000, unlocked: [], rev: 1 })));
  await page.goto('/?nolock&seed=1&quality=high');
  await page.waitForSelector('.menu-title-start', { timeout: 30_000 });
  // The title is plain navy (M100): no picture of the map or anything else behind it.
  await expect(page.locator('.menu-backdrop')).toHaveClass(/plain/);
  await expect(page.locator('.menu-backdrop img:visible')).toHaveCount(0);
  expect(await page.locator('.menu-backdrop').evaluate((e) => getComputedStyle(e).backgroundImage)).not.toContain('url(');
  // Asked for in the address, so the warning doesn't claim Low was picked.
  await expect(page.locator('.menu-title-warning')).toContainText('without hardware acceleration');
  await expect(page.locator('.menu-title-warning')).not.toContainText('set to Low');
  const shadows = await page.evaluate(() => (window as unknown as { airsoft: { renderer: { renderer: { shadowMap: { enabled: boolean } } } } }).airsoft.renderer.renderer.shadowMap.enabled);
  expect(shadows).toBe(true);
  // The Armory (LV1) draws on High: level 3 of 10, the next unlock, the track.
  await page.locator('.menu-title-start').click();
  await page.locator('.menu-topbar').getByRole('button', { name: 'Armory', exact: true }).click();
  const armoryScreen = page.locator('.menu-armory');
  await expect(armoryScreen.locator('.armory-level')).toHaveText(/Level 3\s*of 10/);
  await expect(armoryScreen.locator('.armory-next-item').first()).toBeVisible();
  await expect(armoryScreen.locator('.armory-level-row')).toHaveCount(11);
  // A pop-up open when the graphics context is lost closes, so the notice isn't under it (bug pass): Delete save asks
  // first.
  await page.keyboard.press('Escape');
  await page.locator('.menu-topbar').getByRole('button', { name: 'Settings', exact: true }).click();
  const settings = page.locator('.menu-settings');
  await settings.getByRole('tab', { name: /Save/ }).click();
  await settings.getByRole('button', { name: 'Delete save', exact: true }).click();
  const ask = page.locator('.save-dialog');
  await expect(ask).toContainText('Delete your save?');
  await page.evaluate(() => {
    const lose = document.querySelector('canvas')!.getContext('webgl2')!.getExtension('WEBGL_lose_context')!;
    (window as unknown as { lose: WEBGL_lose_context }).lose = lose;
    lose.loseContext();
  });
  await expect(page.locator('.graphics-notice')).toBeVisible({ timeout: 10_000 });
  await expect(ask).toBeHidden();
  await page.evaluate(() => (window as unknown as { lose: WEBGL_lose_context }).lose.restoreContext());
  await expect(page.locator('.graphics-notice')).toBeHidden({ timeout: 10_000 });
  expect(errors).toEqual([]);
});

/** The practice range (M21): opened from the title, its targets loaded, firing reads out where the BB landed. */
test('the practice range opens from the title screen and reads out the last BB', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (err) => errors.push(`pageerror: ${err.message}`));
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(`console: ${msg.text()}`);
  });
  // Loaded on Medium, then Low picked on Settings before the range opens: the range is built with the pick (audit M-01),
  // and draws fast enough in software on a CI runner (as the first test).
  await page.goto('/?nolock&seed=1&quality=medium');
  await page.waitForSelector('.menu-title-start', { timeout: 30_000 });
  await page.keyboard.press('Escape'); // Esc on the title opens Settings
  const settings = page.locator('.menu-settings');
  await settings.getByRole('tab', { name: /Graphics/i }).click();
  await settings.getByRole('group', { name: 'Quality' }).getByRole('button', { name: 'Low' }).click();
  await page.keyboard.press('Escape');
  await expect(page.locator('.menu-title')).toBeVisible();
  // Practice is the last mode on the Match screen (M100), and starts the range.
  await page.locator('.menu-title-start').click();
  const modes = page.locator('.menu-setup').getByRole('group', { name: 'Mode', exact: true });
  await expect(modes.getByRole('button').last()).toContainText('Practice');
  await modes.getByRole('button', { name: /Practice/ }).click();
  // A refused mouse lock (Start practice or Tutorial clicked too soon after Esc) says so on the screen too (audit L-29).
  await page.evaluate(() => document.dispatchEvent(new Event('pointerlockerror')));
  await expect(page.locator('.menu-setup .menu-hint')).toContainText('Click again');
  await page.locator('.menu-setup').getByRole('button', { name: 'Start practice', exact: true }).click();
  const readout = page.locator('.range-readout');
  await expect(readout).toBeVisible();
  await expect(readout).toContainText('Practice ·');
  type Lit = { airsoft: { renderer: { scene: { children: { isDirectionalLight?: boolean; castShadow: boolean }[] } } } };
  const sunCastsShadow = () => page.evaluate(() => (window as unknown as Lit).airsoft.renderer.scene.children.find((o) => o.isDirectionalLight)!.castShadow);
  expect(await sunCastsShadow()).toBe(false);
  type RangeState = { targets: unknown[]; characters: { armament: { ammo: { mag: number; pouch: number[] }[]; handling: { magSize: number }[] } }[] };
  const state = () => page.evaluate(() => (window as unknown as { airsoft: { state: RangeState } }).airsoft.state);
  const s0 = await state();
  expect(s0.targets).toHaveLength(30); // 18 in the lanes, M93's 11 others and the timed challenge's START plate
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
  // Full auto: the next BB flies past the fallen figure and says "miss", so remember every text the readout showed.
  await page.evaluate(() => {
    const seen: string[] = [];
    (window as unknown as { readoutSeen: string[] }).readoutSeen = seen;
    const el = document.querySelector('.range-readout')!;
    new MutationObserver(() => seen.push(el.textContent ?? '')).observe(el, { childList: true, characterData: true, subtree: true });
  });
  await page.mouse.down();
  await expect
    .poll(() => page.evaluate(() => (window as unknown as { readoutSeen: string[] }).readoutSeen.some((t) => t.includes('hit Figure 10 m'))), { timeout: 30_000 })
    .toBe(true);
  await page.mouse.up();

  // Esc (here: tabbing away) on the range offers the Loadout; 0.30 g BBs, Back, Resume: the range is rebuilt where you
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
  await loadout.getByRole('button', { name: /^Primary: AEG Rifle/ }).click({ button: 'right' });
  await loadout.getByRole('tab', { name: /^BBs/ }).click();
  await loadout.getByRole('slider', { name: 'AEG Rifle BB weight' }).fill('0.3');
  // Customise's Back to the gear, then Back (the top bar's wordmark, alone there from the pause menu) to the pause menu.
  await loadout.locator('.customise-back').click(); // Back to the gear (MR1)
  await page.locator('.menu-topbar').getByRole('button', { name: 'Back', exact: true }).click();
  await pauseMenu.getByRole('button', { name: 'Resume' }).click();
  await expect(page.locator('.menus')).toBeHidden({ timeout: 10_000 });
  await expect(readout).toContainText('Practice ·'); // a new range: no last shot yet
  const after = await page.evaluate(() => {
    const game = (window as unknown as Aim & { airsoft: { state: { characters: { armament: { bbWeights: number[] } }[] } } }).airsoft;
    return { ...game.state.characters[0]!.position, yaw: game.input.yaw, pitch: game.input.pitch, bb: game.state.characters[0]!.armament.bbWeights[0] };
  });
  expect(after.x).toBeCloseTo(before.x, 1);
  expect(after.z).toBeCloseTo(before.z, 1);
  expect(after.yaw).toBeCloseTo(before.yaw, 3);
  expect(after.pitch).toBeCloseTo(before.pitch, 3);
  expect(after.bb).toBe(0.3);
  expect(errors).toEqual([]);
});

/** The tutorial (M16): tagged for new players on the title, it opens the range with the coach on its first step. */
test('the tutorial opens on the range with the coach', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (err) => errors.push(`pageerror: ${err.message}`));
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(`console: ${msg.text()}`);
  });
  // Low, so the range draws fast enough in software on a CI runner (as the first test).
  await page.goto('/?nolock&seed=1&quality=low');
  await page.waitForSelector('.menu-title-start', { timeout: 30_000 });
  // A clean save: the Tutorial shows under START (M100), and nothing else but the wordmark, the tagline, Fullscreen and
  // the version (MR1).
  const tutorial = page.locator('.menu-title').getByRole('button', { name: 'Tutorial', exact: true });
  await expect(tutorial).toBeVisible();
  await expect(page.locator('.menu-title').getByRole('button')).toHaveText(['START', 'Tutorial', 'Fullscreen']);
  await expect(page.locator('.menu-title-tagline')).toHaveText('Call your hit. Go again.');
  await expect(page.locator('.menu-title .title-version')).toBeVisible();
  await tutorial.click();
  const coach = page.locator('.coach');
  // The range loads behind a loading screen; a click soon after the title can wait past the default 5 s in software.
  await expect(coach).toBeVisible({ timeout: 30_000 });
  await expect(coach).toContainText('Look around');
  await expect(coach).toContainText(/1 of \d+/);
  await expect(page.locator('.range-readout')).toBeHidden(); // the coach takes its place until the last step

  // Doing it moves it on: turn the view (a little more on each poll, so the ticks see it), and the coach asks you to move.
  type Tut = {
    airsoft: {
      input: { yaw: number };
      session: { tutorial: { steps: { id: string; goal: { seconds?: number } }[]; debugJumpTo: (index: number, amount: number) => void } };
    };
  };
  await expect
    .poll(
      async () => {
        await page.evaluate(() => {
          (window as unknown as Tut).airsoft.input.yaw += 0.3;
        });
        return coach.textContent();
      },
      { timeout: 10_000 },
    )
    .toMatch(/2 of \d+/);
  await expect(coach).toContainText('Move');

  // The steps that name the scoreboard and the order wheel open them on screen, and close them as the next step comes
  // up (M80). The tracker's debug jump (e2e build only) goes to each.
  const jumpTo = (id: string, readLeft = -1) =>
    page.evaluate(
      ([id, readLeft]) => {
        const t = (window as unknown as Tut).airsoft.session.tutorial;
        const i = t.steps.findIndex((s) => s.id === id);
        t.debugJumpTo(i, readLeft < 0 ? 0 : (t.steps[i]!.goal.seconds ?? 0) - readLeft);
      },
      [id, readLeft] as const,
    );
  await jumpTo('scoreboard');
  await expect(coach).toContainText('Scoreboard');
  await expect(page.locator('.match-board')).toBeVisible();
  await expect(page.locator('.match-board tr.you')).toContainText('You');
  await jumpTo('orderWheel');
  // The wheel's root is a point in the middle of the screen (no size): its orders are what show.
  await expect(page.locator('.order-wheel-item')).toHaveCount(5);
  await expect(page.locator('.order-wheel-item').first()).toBeVisible();
  await expect(page.locator('.order-wheel-hint')).toContainText(/order|give/);
  await expect(page.locator('.match-board')).toBeHidden();
  await jumpTo('match');
  await expect(page.locator('.order-wheel-item').first()).toBeHidden();

  // The last card read to its end: the "Tutorial complete" pop-up, with Practice (the range) or the menu (M80).
  // Practice: the coach gives way to the range readout, and the title stops offering the button.
  await jumpTo('match', 0.1);
  const done = page.getByRole('dialog', { name: 'Tutorial complete' });
  await expect(done).toBeVisible({ timeout: 10_000 });
  await expect(done.getByRole('button')).toHaveText(['Practice', 'Menu']);
  await done.getByRole('button', { name: 'Practice', exact: true }).click();
  await expect(done).toBeHidden();
  await expect(page.locator('.range-readout')).toBeVisible({ timeout: 10_000 });
  await expect(coach).toBeHidden();
  await page.reload();
  await page.waitForSelector('.menu-title-start', { timeout: 30_000 });
  await expect(page.locator('.menu-title').getByRole('button', { name: 'Tutorial', exact: true })).toBeHidden();
  expect(errors).toEqual([]);
});

/**
 * Esc while out skips the round without the pause menu (the owner's 0.1 Dev 5 playtest, note 10). `?nolock` has no lock
 * to lose, so the browser's drop is sent as the event it fires (`pointerlockchange` with nothing locked): the game
 * sees a drop it did not ask for, as it does on Esc. Alive, that pauses as ever; out, it skips and the menu stays shut.
 */
test.describe('Esc and the lost mouse in a match (0.1 Dev 5 playtest, note 10)', () => {
  type Esc = {
    airsoft: {
      flow: { escSkipAt: number };
      session: { skipping: boolean; skipOffer: string | null };
      state: { round: { phase: string }; characters: { status: string }[] };
    };
  };
  async function inLiveRound(page: import('@playwright/test').Page): Promise<void> {
    await page.goto('/?nolock&seed=1&quality=low');
    await page.waitForSelector('.menu-title-start', { timeout: 30_000 });
    await page.locator('.menu-title-start').click();
    await page.locator('.menu-setup').getByRole('button', { name: 'Start match', exact: true }).click();
    await page.waitForSelector('.hud-replica', { state: 'visible', timeout: 60_000 });
    await page.waitForFunction(() => (window as unknown as Esc).airsoft.state.round.phase === 'live', undefined, { timeout: 60_000 });
  }
  const dropTheLock = (page: import('@playwright/test').Page) => page.evaluate(() => document.dispatchEvent(new Event('pointerlockchange')));

  test('alive, the mouse lost opens the pause menu as before', async ({ page }) => {
    await inLiveRound(page);
    await dropTheLock(page);
    await expect(page.locator('.menu-pause')).toBeVisible({ timeout: 10_000 });
    expect(await page.evaluate(() => (window as unknown as Esc).airsoft.session.skipping)).toBe(false);
  });

  test('out, it skips the round with the pause menu shut, and Esc again opens the menu', async ({ page }) => {
    await inLiveRound(page);
    await page.evaluate(() => {
      (window as unknown as Esc).airsoft.state.characters[0]!.status = 'out';
    });
    await page.waitForFunction(() => (window as unknown as Esc).airsoft.session.skipOffer !== null, undefined, { timeout: 10_000 });
    await dropTheLock(page);
    await expect.poll(() => page.evaluate(() => (window as unknown as Esc).airsoft.session.skipping)).toBe(true);
    await expect(page.locator('.menu-pause')).toBeHidden();
    // Esc inside the guard (the one that let go of the mouse) does nothing; after it, Esc opens the menu.
    await page.waitForFunction(() => performance.now() - (window as unknown as Esc).airsoft.flow.escSkipAt > 1000);
    await page.keyboard.press('Escape');
    await expect(page.locator('.menu-pause')).toBeVisible({ timeout: 10_000 });
  });
});
