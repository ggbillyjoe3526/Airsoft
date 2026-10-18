import { expect, test } from '@playwright/test';
import { MOUSE } from '../src/config/controls';

/**
 * Mouse look and the order wheel under the real pointer lock (BP6d). Every other e2e test plays with `?nolock`, where
 * the view never turns from the mouse; headless Chromium grants the lock (IN1, `release.spec.ts`), so here Play takes
 * it as a player's would and the mouse turns the view and points the wheel. The e2e build keeps the console handle, so
 * the view and the wheel's pointer are read from the game rather than from pixels.
 */
type Airsoft = {
  airsoft: {
    input: { yaw: number; sensitivity: number; wheelPointer: { pick: number } };
    state: { round: { phase: string }; characters: { team: number; status: string }[] };
    session: { player: { team: number; status: string } };
  };
};

test('the mouse turns the view and picks an order on the wheel under the real pointer lock', async ({ page }) => {
  test.setTimeout(120_000);
  const errors: string[] = [];
  page.on('pageerror', (err) => errors.push(`pageerror: ${err.message}`));
  await page.goto('/?seed=3&quality=low');
  await page.locator('.menu-title-start').click({ timeout: 30_000 });
  await page.locator('.menu-setup').getByRole('button', { name: 'Start match', exact: true }).click();
  await page.waitForFunction(() => document.pointerLockElement?.id === 'app', undefined, { timeout: 30_000 });
  await expect(page.locator('.hud')).toBeVisible({ timeout: 30_000 });
  const game = () => page.evaluate(() => {
    const { input, state, session } = (window as unknown as Airsoft).airsoft;
    const p = session.player;
    const mate = state.characters.some((c) => c !== p && c.team === p.team && c.status === 'alive');
    return { yaw: input.yaw, sensitivity: input.sensitivity, pick: input.wheelPointer.pick, orders: state.round.phase === 'live' && p.status === 'alive' && mate };
  });
  await expect.poll(async () => (await game()).orders, { timeout: 30_000 }).toBe(true);

  // Mouse look: 100 counts to the right turn the view right by 100 counts' worth (the first move after the lock is
  // dropped as a glitch, audit UI-10, so the pointer is parked first).
  await page.mouse.move(640, 360);
  await page.mouse.move(641, 360);
  await page.waitForTimeout(200);
  const before = await game();
  for (let i = 1; i <= 10; i++) await page.mouse.move(641 + i * 10, 360);
  await expect.poll(async () => before.yaw - (await game()).yaw, { timeout: 5_000 }).toBeCloseTo(100 * MOUSE.radiansPerCount * before.sensitivity, 3);

  // The order wheel: hold Z, push the mouse up onto Follow Me (the top item), let go: the order is given, and the view
  // didn't turn while the wheel had the mouse.
  const squadLine = page.locator('.squad-order');
  const held = (await game()).yaw;
  await page.keyboard.down('z');
  await expect(page.locator('.order-wheel .order-wheel-item').first()).toBeVisible({ timeout: 10_000 });
  for (let i = 1; i <= 10; i++) await page.mouse.move(741, 360 - i * 15);
  await expect.poll(async () => (await game()).pick, { timeout: 5_000 }).toBe(0);
  await page.keyboard.up('z');
  await expect(squadLine).toHaveText(/Follow me/i, { timeout: 10_000 });
  expect((await game()).yaw).toBe(held);
  expect(errors).toEqual([]);
});
