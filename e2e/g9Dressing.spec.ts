import { expect, test, type Page } from '@playwright/test';

/**
 * G9 QA: Woodland and Neon Heights re-dressed, through the real sessions (not the unit tests' hand-made call order).
 * Read through the e2e build's `window.airsoft`, no screenshot. Dev content has to be on for both maps.
 */
type Obj = { name: string; visible: boolean; parent: Obj | null };
type Game = { airsoft: { state: { tick: number } | null; renderer: { scene: { traverse: (f: (o: Obj) => void) => void } } } };

/** Starts a match on `map` at `quality` and waits for it to run. */
async function startMatch(page: Page, map: RegExp, quality: 'low' | 'medium'): Promise<void> {
  await page.goto(`/?nolock&seed=3&quality=${quality}`);
  await page.waitForSelector('.menu-title-start', { timeout: 30_000 });
  await page.locator('.menu-title-start').click();
  const setup = page.locator('.menu-setup');
  await page.locator('.menu-topbar').getByRole('button', { name: 'Settings' }).click();
  const settings = page.locator('.menu-settings');
  await settings.getByRole('checkbox', { name: 'Dev settings' }).check();
  await settings.getByRole('group', { name: 'Dev content' }).getByRole('button', { name: 'On' }).click();
  await page.keyboard.press('Escape');
  await setup.getByRole('group', { name: 'Map', exact: true }).getByRole('button', { name: map }).click();
  await setup.getByRole('button', { name: 'Start match', exact: true }).click();
  await expect(page.locator('.menus')).toBeHidden({ timeout: 20_000 });
  await expect.poll(() => page.evaluate(() => (window as unknown as Game).airsoft.state?.tick ?? 0), { timeout: 90_000 }).toBeGreaterThan(30);
}

/** Every object of the scene by name, with whether it is drawn (itself and every parent visible). */
const drawn = (page: Page): Promise<Record<string, boolean>> =>
  page.evaluate(() => {
    const out: Record<string, boolean> = {};
    (window as unknown as Game).airsoft.renderer.scene.traverse((o) => {
      let on = true;
      for (let p: Obj | null = o; p; p = p.parent) on = on && p.visible;
      if (o.name) out[o.name] = (out[o.name] ?? false) || on;
    });
    return out;
  });

/**
 * What the tree ring's mesh carries besides the ring (render/skyHost.ts's `skyPart`): 1 the skyline's lights, 2 the
 * plane. They ride the ring's draw call (G9 perf), so a scene has no mesh of their own to look for.
 */
const ringCarries = (page: Page): Promise<number[]> =>
  page.evaluate(() => {
    let parts: number[] = [];
    (window as unknown as Game).airsoft.renderer.scene.traverse((o) => {
      const a = o.name === 'trees' ? (o as unknown as { geometry?: { getAttribute: (n: string) => { array: ArrayLike<number> } | undefined } }).geometry?.getAttribute('skyPart') : undefined;
      if (a) parts = [...new Set(Array.from(a.array))].filter((v) => v > 0).sort();
    });
    return parts;
  });

const watchErrors = (page: Page): string[] => {
  const errors: string[] = [];
  page.on('pageerror', (err) => errors.push(`pageerror: ${err.message}`));
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(`console: ${msg.text()}`);
  });
  return errors;
};

// Was BUG G9-QA-4 (fixed): the game calls setQuality (in CombatPresentation's constructor) before setNight (MatchSession's
// setLighting), and the fireflies are only made inside setQuality, so the night map has none until a graphics setting
// changes. The unit tests of the effects call setNight first, so they cannot see it.
test('Woodland on Medium has its fireflies drawn by night from the first frame', async ({ page }) => {
  test.setTimeout(240_000);
  const errors = watchErrors(page);
  await startMatch(page, /Woodland/i, 'medium');
  const scene = await drawn(page);
  expect(scene['fireflies']).toBe(true);
  expect(errors).toEqual([]);
});

test('Woodland on Medium draws its dressing meshes and none of the city’s moving effects', async ({ page }) => {
  test.setTimeout(240_000);
  const errors = watchErrors(page);
  await startMatch(page, /Woodland/i, 'medium');
  const scene = await drawn(page);
  expect(scene['map-junk']).toBe(true);
  expect(scene['map-puddles']).toBe(true);
  expect(scene['steamPlumes']).toBeUndefined();
  expect(scene['passingPlane']).toBeUndefined();
  expect(errors).toEqual([]);
});

for (const [name, map] of [['Woodland', /Woodland/i], ['Neon Heights', /Neon Heights/i]] as const) {
  test(`${name} on Low draws none of the new meshes and makes no moving effect`, async ({ page }) => {
    test.setTimeout(240_000);
    const errors = watchErrors(page);
    await startMatch(page, map, 'low');
    const scene = await drawn(page);
    for (const n of ['map-junk', 'map-puddles', 'fireflies', 'steamPlumes', 'passingPlane', 'skylineLights']) expect(scene[n], n).toBeUndefined();
    // Nor do the skyline's lights or the plane ride the ring on Low.
    expect(await ringCarries(page)).toEqual([]);
    expect(errors).toEqual([]);
  });
}

test('Neon Heights on Medium draws its steam and its plane, its junk and puddle meshes, and its skyline’s lights', async ({ page }) => {
  test.setTimeout(240_000);
  const errors = watchErrors(page);
  await startMatch(page, /Neon Heights/i, 'medium');
  const scene = await drawn(page);
  expect(scene['map-junk']).toBe(true);
  expect(scene['map-puddles']).toBe(true);
  expect(scene['steamPlumes']).toBe(true);
  // The skyline's lights and the plane are drawn by the tree ring's mesh (one draw call; render/skyHost.ts).
  expect(scene['trees']).toBe(true);
  expect(await ringCarries(page)).toEqual([1, 2]);
  // The plane's flight is made (hidden between passes; the ring draws it).
  expect(Object.keys(scene)).toContain('passingPlane');
  expect(scene['fireflies']).toBeUndefined();
  expect(errors).toEqual([]);
});
