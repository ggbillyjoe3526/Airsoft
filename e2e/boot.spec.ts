import { expect, test } from '@playwright/test';

/**
 * Smoke test: the built game boots to the title screen with no map loaded, goes through New game (the Map, Match and
 * Difficulty pop-ups, a 2v2 picked, the Loadout and Settings screens, a crosshair picked) and starts a match with a 2x scope, an
 * angled grip, a hi-cap and 0.28 g BBs (owned through a saved collection), holds Tab for the scoreboard, fires, reloads, moves the fire selector, aims
 * down the scope, switches the graphics quality to Medium and back to Low mid-match, ends the match (summary, result, Play
 * Again) and keeps running without a page error.
 *
 * Uses `?nolock` (no pointer lock; automated browsers can't take it): the fire button and wheel work without
 * the lock there, but the real lock flow, mouse look and Esc to pause stay manual tests. SwiftShader draws only
 * a few frames a second, so the simulation runs slower than real time: assert on page text, never on frames,
 * and poll rather than wait fixed times. It loads with no `?quality=`, as a player would: the game sees SwiftShader
 * draws in software and starts on Low itself (audit M-02), since the art pass (M14) on Medium or High draws too slowly
 * in software on a CI runner for the reload and range steps to finish in time.
 */
test('the game boots, starts a match, fires, reloads and aims without errors', async ({ page }, testInfo) => {
  // The longest test (since the audit fixes it also rebinds a key and plays to the result screen): about 30 s here,
  // three to four times that on a CI runner in software, so it gets twice the default budget.
  test.setTimeout(180_000);
  const errors: string[] = [];
  page.on('pageerror', (err) => errors.push(`pageerror: ${err.message}`));
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(`console: ${msg.text()}`);
  });
  const errorList = () => (errors.length > 0 ? errors.join(' | ') : 'none');

  // Armory unlocks (M26c) a new player wouldn't have: the red dot, the 2x scope, a Rare angled grip and a hi-cap, besides
  // the starters. Saved before the page loads, as a returning player's collection.
  await page.addInitScript(() => {
    const owned = ['000001', '000002', '000003', '000004', '000007', '000010', '000012'].map((id) => [`${id}@common`, 1]);
    localStorage.setItem('airsoft.collection', JSON.stringify({ version: 1, owned: Object.fromEntries([...owned, ['000011@rare', 1]]), fc: 400, tokens: 0, seed: 1 }));
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
  // console error above), an icon and a manifest. The loading bar showed the physics chunk's download (CORE-10): the
  // chunk is fetched once with progress and the module import that follows is answered by the cache, not a second
  // download (no modulepreload of it either).
  await expect(page.locator('meta[http-equiv="Content-Security-Policy"]')).toHaveAttribute('content', /'wasm-unsafe-eval'/);
  await expect(page.locator('link[rel="icon"]')).toHaveAttribute('href', /icon\.svg$/);
  await expect(page.locator('link[rel="manifest"]')).toHaveCount(1);
  const physicsChunk = (await page.locator('meta[name="airsoft-physics-chunk"]').getAttribute('content')) ?? '';
  expect(physicsChunk).toMatch(/rapier-.*\.js$/);
  await expect(page.locator('link[rel="modulepreload"][href*="rapier-"]')).toHaveCount(0);
  expect(await page.evaluate(() => (window as unknown as { loadingMax: number }).loadingMax)).toBeGreaterThanOrEqual(85);
  const chunkLoads = await page.evaluate(() =>
    performance
      .getEntriesByType('resource')
      .filter((e) => /rapier-/.test(e.name))
      .map((e) => (e as PerformanceResourceTiming).transferSize > (e as PerformanceResourceTiming).encodedBodySize / 2),
  );
  expect(chunkLoads.filter((full) => full)).toHaveLength(1);
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
  // The top bar (G3) shows the place on screen and the wallet.
  const topBar = page.locator('.menu-topbar');
  await expect(topBar.getByRole('button', { name: 'Play' })).toHaveAttribute('aria-current', 'page');

  // The Map cards: Depot, the default, picked.
  const maps = setup.getByRole('group', { name: 'Map', exact: true });
  await expect(maps.getByRole('button', { name: /Depot/i })).toHaveAttribute('aria-pressed', 'true');
  // Woodland is dev content (M35): not listed at all while Dev content is off (devContent.spec.ts turns it on).
  await expect(maps.getByRole('button', { name: /Woodland/i })).toBeHidden();
  await maps.getByRole('button', { name: /Depot/i }).click();
  await expect(setup.locator('.play-map-line')).toHaveText('Depot');

  // Match (M20): rounds to win, round time, team size, friendly fire and ricochets; Your match sums them up.
  const facts = setup.locator('.play-facts');
  await expect(facts).toContainText('3v3 · first to 5');
  const match = setup.locator('.match-panel');
  await expect(match.getByRole('group', { name: 'Ricochets count' }).getByRole('button', { name: 'Off' })).toHaveAttribute('aria-pressed', 'true');
  // Rules (M39): Skirmish is picked, Tournament and Pro CQB are dev content (hidden with Dev content off), Custom opens
  // every switch; Skirmish and a named ruleset show only the rows they leave to the player.
  const rulesGroup = match.getByRole('group', { name: 'Rules' });
  await expect(rulesGroup.getByRole('button', { name: 'Skirmish' })).toHaveAttribute('aria-pressed', 'true');
  await expect(rulesGroup.getByRole('button', { name: 'Tournament' })).toBeHidden();
  await expect(rulesGroup.getByRole('button', { name: 'Pro CQB' })).toBeHidden();
  await expect(match.getByRole('group', { name: 'Overtime' })).toBeHidden();
  await rulesGroup.getByRole('button', { name: 'Custom' }).click();
  await expect(match.getByRole('group', { name: 'Overtime' })).toBeVisible();
  await expect(match.getByRole('group', { name: 'Fire modes' })).toBeVisible();
  await expect(page.locator('.setup-rules')).toContainText('never go into your records'); // Custom never goes into the records, and says so
  await rulesGroup.getByRole('button', { name: 'Skirmish' }).click();
  await expect(match.getByRole('group', { name: 'Overtime' })).toBeHidden();
  await match.getByRole('group', { name: 'Team size' }).getByRole('button', { name: '2v2' }).click();
  await match.getByRole('group', { name: 'Rounds to win' }).getByRole('button', { name: '3' }).click();
  await expect(facts).toContainText('2v2 · first to 3');
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

  // The Loadout screen (M26b; G3 look): three gear slots, the AEG Rifle and Gas Pistol equipped, Grenades empty.
  // Right-click the Primary slot to customise the rifle: fit the red dot and heavier BBs before the match.
  await setup.getByRole('button', { name: 'Change Loadout' }).click();
  const loadout = page.locator('.menu-loadout');
  await expect(loadout).toBeVisible();
  await expect(loadout.locator('.gear-slot')).toHaveCount(3);
  const primary = loadout.getByRole('button', { name: /^Primary: AEG Rifle/ });
  await expect(primary).toHaveAttribute('aria-pressed', 'true');
  await expect(loadout.getByRole('button', { name: /^Secondary: Gas Pistol/ })).toBeVisible();
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
  await expect(sheet.locator('dd', { hasText: /^no optic/ })).toBeVisible();
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
  // The red dot just fitted shows as its raise time instead of "no optic".
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
  // Back leaves Customise for the gear first, then the Loadout.
  await loadout.getByRole('button', { name: 'Back', exact: true }).click();
  await expect(loadout.locator('.item-grid')).toBeVisible();
  await loadout.getByRole('button', { name: 'Back', exact: true }).click();
  const loadoutLine = setup.locator('.play-loadout-line');
  await expect(loadoutLine).toContainText('Red Dot');
  await expect(loadoutLine).toContainText('0.28 g / 0.20 g BBs');

  // Attachments: the 2x scope, a Rare angled grip and a hi-cap on the rifle, each with its numbers under it.
  await setup.getByRole('button', { name: 'Change Loadout' }).click();
  await loadout.getByRole('button', { name: /^Customise AEG Rifle/ }).click();
  await partTab('Optic').click();
  await loadout.getByRole('group', { name: 'Optic' }).getByRole('button', { name: /2x Scope/ }).click();
  await partTab('Grip').click();
  const rifleGrip = loadout.getByRole('group', { name: 'Grip' });
  await expect(rifleGrip.getByRole('button', { name: /No Grip/ })).toHaveAttribute('aria-pressed', 'true');
  await rifleGrip.getByRole('button', { name: /Angled Grip/ }).click();
  await expect(rifleGrip.getByRole('button', { name: /Angled Grip/ })).toContainText('Rare');
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
  await expect(partTab('Skins')).toHaveAttribute('aria-disabled', 'true'); // in a later version
  // The pistol has no top rail: its Optic part is greyed. Esc goes back to the gear like Back.
  await page.keyboard.press('Escape');
  await loadout.getByRole('button', { name: /^Secondary: Gas Pistol/ }).click({ button: 'right' });
  await expect(partTab('Optic')).toHaveAttribute('aria-disabled', 'true');
  await page.keyboard.press('Escape');
  await loadout.getByRole('button', { name: 'Back', exact: true }).click();
  await expect(loadoutLine).toContainText('2x Scope · Angled Grip · Hi-Cap Magazine');

  // The Armory (M26c), on the top bar with the wallet: beta and free. The saved 400 FC buy a Token (160 FC), and a Shot
  // dispenses three assets into the collection.
  const wallet = topBar.locator('.menu-chip-fc');
  await expect(wallet).toContainText('400 FC');
  await topBar.getByRole('button', { name: 'Armory' }).click();
  const armory = page.locator('.menu-armory');
  await expect(armory).toBeVisible();
  await expect(armory.locator('.menu-heading .beta-tag')).toHaveText(/beta/i);
  await expect(armory.getByText(/^Completely free/).first()).toBeVisible();
  await armory.getByRole('button', { name: /^Buy 1 Token/ }).click();
  await expect(armory.locator('.armory-balance')).toContainText('240 FC');
  await armory.getByRole('button', { name: /^1 Shot/ }).click();
  await expect(armory.locator('.armory-reveal .item-tile')).toHaveCount(3);
  await expect(armory.locator('.armory-balance')).toContainText('240 FC'); // paid with the Token
  await page.keyboard.press('Escape');
  await expect(setup).toBeVisible();
  await expect(wallet).toContainText('240 FC');

  // Settings (G3): the groups down the left, opening on Graphics; Esc works as Back and returns to the Play screen.
  await topBar.getByRole('button', { name: 'Settings' }).click();
  const settings = page.locator('.menu-settings');
  await expect(settings).toBeVisible();
  const group = (name: string | RegExp) => settings.getByRole('tab', { name });
  await expect(group(/Graphics/i)).toHaveAttribute('aria-selected', 'true');
  await expect(settings.getByRole('group', { name: 'Quality' }).getByRole('button', { name: 'Low' })).toHaveAttribute('aria-pressed', 'true');
  // Display: the field of view and fullscreen, out of the old Graphics tab.
  await group(/Display/i).click();
  await expect(settings.getByRole('slider', { name: 'Field of view' })).toHaveValue('90');
  await expect(settings.getByRole('button', { name: 'Enter Fullscreen' })).toBeVisible();
  // Controls (M18): the sensitivity as cm/360 at the mouse's DPI; typing a cm/360 moves the slider to match.
  await group(/Controls/i).click();
  const cm = settings.getByRole('spinbutton', { name: /cm per 360/ });
  await expect(cm).toHaveValue(/^\d+\.\d$/); // worked out from the sensitivity and DPI (sensitivity.test.ts has the sums)
  await cm.fill('40');
  await cm.press('Enter');
  await expect(settings.getByRole('slider', { name: 'Mouse sensitivity' })).toHaveValue('0.5');
  await expect(settings.getByRole('group', { name: 'Aim button' }).getByRole('button', { name: 'Hold' })).toHaveAttribute('aria-pressed', 'true');
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
  // M24: the cues' colour and size reach the HUD as CSS variables on the container.
  await settings.getByRole('group', { name: 'Sound cue colour' }).getByRole('button', { name: 'Yellow' }).click();
  await expect.poll(() => page.evaluate(() => document.getElementById('app')!.style.getPropertyValue('--cue-colour'))).toBe('#ffe94a');
  await expect(settings.getByRole('slider', { name: 'Sound cue size' })).toHaveValue('1');
  // G1: the Look group has Robots (Mixed by default) and Realistic colours (Bold by default); each pick is saved.
  await group(/Look/i).click();
  await expect(group(/Look/i)).toHaveAttribute('aria-selected', 'true');
  const robots = settings.getByRole('group', { name: 'Robots' });
  const realistic = settings.getByRole('group', { name: 'Replica colours' });
  await expect(robots.getByRole('button', { name: 'Mixed' })).toHaveAttribute('aria-pressed', 'true');
  await expect(realistic.getByRole('button', { name: 'Bold' })).toHaveAttribute('aria-pressed', 'true');
  const savedLook = () => page.evaluate(() => JSON.parse(localStorage.getItem('airsoft.settings') ?? '{}') as { robots?: string; realisticColours?: string });
  await robots.getByRole('button', { name: 'Humans only' }).click();
  await realistic.getByRole('button', { name: 'Realistic' }).click();
  await expect.poll(savedLook).toMatchObject({ robots: 'off', realisticColours: 'on' });
  await robots.getByRole('button', { name: 'Mixed' }).click();
  await realistic.getByRole('button', { name: 'Bold' }).click();
  await expect.poll(savedLook).toMatchObject({ robots: 'on', realisticColours: 'off' });
  await group(/Audio/i).click();
  await expect(settings.getByRole('slider', { name: /volume/i })).toHaveCount(3);
  // The groups follow the tabs pattern (audit L-31): Arrow Down from Audio picks Controls, then Gameplay, and moves
  // the focus there.
  await page.keyboard.press('ArrowDown');
  await expect(group(/Controls/i)).toHaveAttribute('aria-selected', 'true');
  await page.keyboard.press('ArrowDown');
  await expect(group(/Gameplay/i)).toHaveAttribute('aria-selected', 'true');
  await expect(group(/Gameplay/i)).toBeFocused();
  // Gameplay (G3): the HUD's rows (M24) with the crosshair's.
  await expect(settings.getByRole('slider', { name: 'Scoreboard size' })).toHaveValue('1.3');
  await expect(settings.getByRole('group', { name: 'Hit feed' }).getByRole('button', { name: 'Fade' })).toHaveAttribute('aria-pressed', 'true');
  // M41: the What got you row, Auto by default (shown against Pro opponents only).
  const whatGotYou = settings.getByRole('group', { name: 'What got you' });
  await expect(whatGotYou).toBeVisible();
  await expect(whatGotYou.getByRole('button')).toHaveText(['Auto', 'On', 'Off']);
  await expect(whatGotYou.getByRole('button', { name: 'Auto' })).toHaveAttribute('aria-pressed', 'true');
  // Crosshair (M19): a live preview, standing still and moving; the shape picked shows on both and in the match.
  const previews = settings.locator('.crosshair-preview .hud-crosshair');
  await expect(previews).toHaveCount(2);
  await settings.getByRole('button', { name: 'Circle' }).click();
  await expect(previews.first()).toHaveClass(/\bshape-circle\b/);
  // M24: the Dev group is hidden until its box is ticked; its settings apply only while it is (Debug info shows the panel).
  await expect(group(/^Dev/i)).toBeHidden();
  const devBox = settings.getByRole('checkbox', { name: 'Dev settings' });
  await devBox.check();
  await expect(group(/^Dev/i)).toHaveAttribute('aria-selected', 'true');
  await settings.getByRole('group', { name: 'Debug info' }).getByRole('button', { name: 'On' }).click();
  await expect(page.locator('.debug-overlay')).toBeVisible();
  // M42: the Retro pixels switch (off) and its two sliders sit on the Dev group; the smoke run leaves the filter off.
  const retro = settings.getByRole('group', { name: 'Retro pixels' });
  await expect(retro).toBeVisible();
  await expect(retro.getByRole('button', { name: 'Off' })).toHaveAttribute('aria-pressed', 'true');
  await expect(retro.getByRole('button', { name: 'On' })).toHaveAttribute('aria-pressed', 'false');
  const retroPixelSize = settings.getByRole('slider', { name: 'Pixel size' });
  const retroColours = settings.getByRole('slider', { name: 'Colours' });
  await expect(retroPixelSize).toHaveValue('4');
  await expect(retroColours).toHaveValue('6');
  const devPanel = settings.locator('#settings-panel-dev');
  await expect(devPanel.getByText('4 px', { exact: true })).toBeVisible();
  await expect(devPanel.getByText('216', { exact: true })).toBeVisible();
  // M26d: Disable Armory greys out the top bar's Armory while it applies.
  const armoryPlace = topBar.getByRole('button', { name: 'Armory' });
  await settings.getByRole('group', { name: 'Disable Armory' }).getByRole('button', { name: 'On' }).click();
  await expect(armoryPlace).toBeDisabled();
  await devBox.uncheck();
  await expect(page.locator('.debug-overlay')).toBeHidden();
  await expect(armoryPlace).toBeEnabled();
  await expect(group(/^Dev/i)).toBeHidden();
  await expect(group(/Graphics/i)).toHaveAttribute('aria-selected', 'true');
  await page.keyboard.press('Escape');
  await expect(setup).toBeVisible();
  await expect(setup.locator(':focus')).toHaveCount(1); // the keyboard is back on the Play screen

  const teamCss = () => page.evaluate(() => getComputedStyle(document.getElementById('app')!).getPropertyValue('--team-1').trim());
  const standardOrange = await teamCss(); // the stylesheet's until a match applies the picked set
  await setup.getByRole('button', { name: 'Play', exact: true }).click();
  await expect(page.locator('.menus')).toBeHidden({ timeout: 10_000 });
  expect(await matchLoaded()).toBe(true);
  await expect(page.locator('.hud')).toBeVisible();
  await expect(page.locator('.hud-replica-name')).toHaveText(/AEG rifle/i);
  await expect(page.locator('.hud .hud-crosshair')).toHaveClass(/\bshape-circle\b/);
  // The match wears the High contrast colours on the HUD, and the sound cue ring is up.
  const matchOrange = await teamCss();
  expect(matchOrange).toMatch(/^#[0-9a-f]{6}$/);
  expect(matchOrange).not.toBe(standardOrange);
  await expect(page.locator('.sound-cues')).not.toHaveAttribute('hidden');
  // The keys below act on the frames after they're pressed, so the match must be drawing first. On a CI runner in
  // software a frame can take seconds early in a match (Chrome 153 there, where these steps were flaky with 10 s waits;
  // they never failed on Chromium 141 in the container): wait for frames to come, then give each key's result the same
  // CI-sized wait as the fire and reload steps below (keyWait).
  type Drawn = { airsoft: { renderer: { renderer: { info: { render: { frame: number } } } } } };
  const framesDrawn = () => page.evaluate(() => (window as unknown as Drawn).airsoft.renderer.renderer.info.render.frame);
  const drawnAtStart = await framesDrawn();
  await expect.poll(framesDrawn, { timeout: 60_000 }).toBeGreaterThan(drawnAtStart + 10);
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
  // G4: the score bar says what wins the match; the squad line has a card per player on your side, you first; the
  // replica panel a chip per fire mode the AEG has.
  await expect(page.locator('.sb-aim')).toHaveText(/^First to \d+/);
  await expect(page.locator('.squad-card b')).toHaveText(['You', /\S/]);
  await expect(page.locator('.hud-mode')).toHaveText(['Semi', 'Burst', 'Auto']);
  // The order wheel (M23) shows while Z is held; let go in the middle, it closes with no order given.
  const wheel = page.locator('.order-wheel');
  await page.keyboard.down('z');
  await expect(wheel.locator('.order-wheel-item').first()).toBeVisible(keyWait);
  // Each direct order shows its key (FA5, UI-03); the Team Plan has none.
  await expect(wheel.locator('.order-wheel-item')).toHaveText([/^Follow Me/, /^Hold Here/, /^Regroup/, 'Team Plan']);
  await expect(wheel.locator('.order-wheel-key')).toHaveText(['F', 'X', 'V']);
  await page.keyboard.up('z');
  await expect(wheel).toHaveAttribute('hidden', '', keyWait);
  // Squad orders (M22): F has the bot teammates follow you and the HUD says so; F again sends them back to the plan.
  // Orders are taken only in a live round with you and a teammate in play (else the line says why for a moment).
  const squadLine = page.locator('.squad-order');
  await expect(squadLine).toBeHidden();
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
  // Graphics quality (M14): a saved picker on Settings → Graphics that applies at once (this visit started on Low, the
  // software fallback).
  // Medium turns the sun's shadows on in the match loaded and Low off again (the screenshots after this one show Low).
  await pauseMenu.getByRole('button', { name: 'Settings' }).click();
  await settings.getByRole('tab', { name: /Graphics/i }).click();
  const quality = settings.getByRole('group', { name: 'Quality' });
  const shadowsOn = () => page.evaluate(() => (window as unknown as { airsoft: { renderer: { renderer: { shadowMap: { enabled: boolean } } } } }).airsoft.renderer.renderer.shadowMap.enabled);
  // Edge smoothing applies at once too (final alpha audit REN-04): the game's canvas gets a new, multisampled context.
  const multisampled = () => page.evaluate(() => document.querySelector<HTMLCanvasElement>('canvas.game-canvas')!.getContext('webgl2')!.getContextAttributes()!.antialias);
  await expect(quality.getByRole('button', { name: 'Low' })).toHaveAttribute('aria-pressed', 'true');
  expect(await shadowsOn()).toBe(false);
  expect(await multisampled()).toBe(false);
  await quality.getByRole('button', { name: 'Medium' }).click();
  await expect(quality.getByRole('button', { name: 'Medium' })).toHaveAttribute('aria-pressed', 'true');
  expect(await shadowsOn()).toBe(true);
  expect(await multisampled()).toBe(true);
  expect(await page.locator('canvas.game-canvas').count()).toBe(1);
  // The Custom rows are folded under a preset (M68, audit UI-09): opened here, a row moves the picker to Custom, and
  // setting it back finds Medium again.
  const shadows = settings.getByRole('group', { name: 'Shadows' });
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
  expect(await multisampled()).toBe(false);
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
  // Custom rules still pay Field Credits (M26c), scaled to the shorter match.
  await expect(summary.locator('.summary-credits')).toContainText(/Field Credits earned\s*\+\d+ FC/i);
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
    // The Tight-Bore Barrel (000016), Long Barrel (000017) and Silencer (000018) come from Shots: saved as a returning
    // player's collection, or left out for a new player.
    await page.addInitScript((extra) => {
      const ids = ['000001', '000002', '000003', '000004', ...(extra ? ['000016', '000017', '000018'] : [])];
      localStorage.setItem('airsoft.collection', JSON.stringify({ version: 1, owned: Object.fromEntries(ids.map((id) => [`${id}@common`, 1])), fc: 0, tokens: 0, seed: 1 }));
    }, withParts);
    await page.goto('/?nolock&seed=1&quality=low');
    await page.waitForSelector('.menu-title-start', { timeout: 30_000 });
    // The title's Loadout (G3), then Customise on the rifle: its parts are tabs, Barrel and Muzzle among them.
    await page.locator('.menu-title').getByRole('button', { name: 'Loadout' }).click();
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
      // Nothing is offered that the player does not own; the Armory hint says where to get them.
      await expect(barrel.getByRole('button')).toHaveCount(1);
      await expect(loadout.locator('.menu-row', { has: page.getByRole('group', { name: 'Barrel', exact: true }) }).getByText('Unlock more in the Armory.')).toBeVisible();
      await partTab('Muzzle').click();
      await expect(muzzle.getByRole('button', { name: /None/ })).toHaveAttribute('aria-pressed', 'true');
      await expect(muzzle.getByRole('button')).toHaveCount(1);
      await expect(loadout.locator('.menu-row', { has: page.getByRole('group', { name: 'Muzzle', exact: true }) }).getByText('Unlock more in the Armory.')).toBeVisible();
    } else {
      await expect(barrel.getByRole('button')).toHaveCount(3);
      await expect(barrel.getByRole('button', { name: /Tight-Bore Barrel/ })).toBeVisible();
      await barrel.getByRole('button', { name: /Long Barrel/ }).click();
      await expect(barrel.getByRole('button', { name: /Long Barrel/ })).toHaveAttribute('aria-pressed', 'true');
      await expect(loadout.locator('.menu-row', { has: page.getByRole('group', { name: 'Barrel', exact: true }) }).getByText(/Brings it up in [\d.]+ s\./)).toBeVisible();
      // A long barrel is front-heavy: a slower draw is marked worse, the extra energy better.
      await expect(sheet.locator('dt', { hasText: /^Draw$/ }).locator('xpath=following-sibling::dd[1]').locator('.perf-delta.perf-worse')).toHaveText(/^\+15%/);
      await expect(sheet.locator('dt', { hasText: /^Energy$/ }).locator('xpath=following-sibling::dd[1]').locator('.perf-delta.perf-better')).toHaveText(/^\+8%/);
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
    await loadout.getByRole('button', { name: /^Secondary: Gas Pistol/ }).click({ button: 'right' });
    await expect(loadout.getByRole('heading', { name: /Customise: Gas Pistol/ })).toBeVisible();
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
  // FC enough for Ten Shots, saved before the game reads the collection (the bug-pass check below opens its pop-up).
  await page.addInitScript(() => localStorage.setItem('airsoft.collection', JSON.stringify({ version: 1, owned: {}, fc: 2000, tokens: 0, seed: 1 })));
  await page.goto('/?nolock&seed=1&quality=high');
  await page.waitForSelector('.menu-title-start', { timeout: 30_000 });
  // Asked for in the address, so the warning doesn't claim Low was picked.
  await expect(page.locator('.menu-title-warning')).toContainText('without hardware acceleration');
  await expect(page.locator('.menu-title-warning')).not.toContainText('set to Low');
  const shadows = await page.evaluate(() => (window as unknown as { airsoft: { renderer: { renderer: { shadowMap: { enabled: boolean } } } } }).airsoft.renderer.renderer.shadowMap.enabled);
  expect(shadows).toBe(true);
  // A pop-up open when the graphics context is lost closes, so the notice isn't under it (bug pass): the Armory's Ten
  // Shots asks first.
  await page.locator('.menu-title').getByRole('button', { name: 'Armory' }).click();
  await page.locator('.menu-armory').getByRole('button', { name: /^10 Shots/ }).click();
  const ask = page.getByRole('dialog', { name: 'Take 10 Shots?' });
  await expect(ask).toBeVisible();
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
  await page.locator('.menu-title').getByRole('button', { name: 'Settings' }).click();
  const settings = page.locator('.menu-settings');
  await settings.getByRole('tab', { name: /Graphics/i }).click();
  await settings.getByRole('group', { name: 'Quality' }).getByRole('button', { name: 'Low' }).click();
  await page.keyboard.press('Escape');
  await expect(page.locator('.menu-title')).toBeVisible();
  // A refused mouse lock (Practice Range or Tutorial clicked too soon after Esc) says so on the title too (audit L-29).
  await page.evaluate(() => document.dispatchEvent(new Event('pointerlockerror')));
  await expect(page.locator('.menu-title .menu-hint')).toContainText('Click again');
  await page.getByRole('button', { name: 'Practice Range' }).click();
  const readout = page.locator('.range-readout');
  await expect(readout).toBeVisible();
  await expect(readout).toContainText('Practice range');
  type Lit = { airsoft: { renderer: { scene: { children: { isDirectionalLight?: boolean; castShadow: boolean }[] } } } };
  const sunCastsShadow = () => page.evaluate(() => (window as unknown as Lit).airsoft.renderer.scene.children.find((o) => o.isDirectionalLight)!.castShadow);
  expect(await sunCastsShadow()).toBe(false);
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
  await loadout.getByRole('button', { name: 'Back', exact: true }).click();
  await loadout.getByRole('button', { name: 'Back', exact: true }).click();
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
  const tutorial = page.getByRole('button', { name: /Tutorial/ });
  await expect(tutorial.locator('.menu-title-new')).toBeVisible();
  await expect(tutorial).toContainText('New? Start here');
  await tutorial.click();
  const coach = page.locator('.coach');
  await expect(coach).toBeVisible();
  await expect(coach).toContainText('Look around');
  await expect(coach).toContainText(/1 of \d+/);
  await expect(page.locator('.range-readout')).toBeHidden(); // the coach takes its place until the last step

  // Doing it moves it on: turn the view (a little more on each poll, so the ticks see it), and the coach asks you to move.
  type Tut = {
    airsoft: {
      input: { yaw: number };
      session: { tutorial: { steps: { goal: { seconds?: number } }[]; debugJumpTo: (index: number, amount: number) => void } };
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

  // The last card read to its end (the tracker's debug jump, e2e build only): the coach gives way to the range readout,
  // and the title stops tagging the button.
  await page.evaluate(() => {
    const t = (window as unknown as Tut).airsoft.session.tutorial;
    const last = t.steps.length - 1;
    t.debugJumpTo(last, (t.steps[last]!.goal.seconds ?? 0) - 0.1);
  });
  await expect(page.locator('.range-readout')).toBeVisible({ timeout: 10_000 });
  await expect(coach).toBeHidden();
  await page.reload();
  await page.waitForSelector('.menu-title-start', { timeout: 30_000 });
  await expect(page.getByRole('button', { name: /Tutorial/ }).locator('.menu-title-new')).toBeHidden();
  expect(errors).toEqual([]);
});
