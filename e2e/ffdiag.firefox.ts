import { expect, test } from '@playwright/test';

/** TEMPORARY diagnostic (IN1 follow-up): why the Display tab click hangs in CI's Firefox. Removed before merge. */
test('diag: Display tab click after the Save tab', async ({ page }) => {
  test.setTimeout(120_000);
  const log = (...a: unknown[]) => console.log('DIAG', new Date().toISOString().slice(11, 23), ...a);
  page.on('console', (m) => log('console', m.type(), m.text().slice(0, 200)));
  page.on('pageerror', (e) => log('pageerror', e.message));
  page.on('dialog', (d) => log('dialog', d.type(), d.message()));
  await page.addInitScript(() => {
    const w = window as unknown as { __lag: { max: number; gaps: number[]; raf: number; rafMax: number } };
    w.__lag = { max: 0, gaps: [], raf: 0, rafMax: 0 };
    let last = performance.now();
    setInterval(() => {
      const now = performance.now();
      const gap = now - last - 50;
      last = now;
      if (gap > w.__lag.max) w.__lag.max = gap;
      if (gap > 250) w.__lag.gaps.push(Math.round(now), Math.round(gap));
    }, 50);
    let lr = performance.now();
    const tick = () => {
      const n = performance.now();
      w.__lag.raf++;
      w.__lag.rafMax = Math.max(w.__lag.rafMax, n - lr);
      lr = n;
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
  const probe = async (label: string) => {
    const r = await Promise.race([
      page.evaluate(() => {
        const w = window as unknown as { __lag: unknown };
        const tab = document.querySelector('#settings-tab-display');
        const b = tab?.getBoundingClientRect();
        const hit = b ? document.elementFromPoint(b.x + b.width / 2, b.y + b.height / 2) : null;
        const lag = JSON.parse(JSON.stringify(w.__lag));
        (w as { __lag: { max: number; gaps: number[]; rafMax: number } }).__lag.max = 0;
        (w as { __lag: { rafMax: number } }).__lag.rafMax = 0;
        return { t: Math.round(performance.now()), lag, rect: b && [b.x, b.y, b.width, b.height].map(Math.round), hit: hit ? `${hit.tagName}.${hit.className}` : null, active: document.activeElement?.className, vis: document.visibilityState, focus: document.hasFocus() };
      }),
      new Promise((resolve) => setTimeout(() => resolve('EVALUATE DID NOT ANSWER IN 10 s'), 10_000)),
    ]);
    log(label, JSON.stringify(r));
  };
  let t = Date.now();
  await page.goto('/?nolock&seed=1');
  await page.waitForSelector('.menu-title-start', { timeout: 30_000 });
  log('title after', Date.now() - t);
  await probe('title');
  await page.keyboard.press('Escape');
  const settings = page.locator('.menu-settings');
  t = Date.now();
  await settings.getByRole('tab', { name: /Save/ }).click();
  log('save tab click took', Date.now() - t);
  await probe('save tab');
  await expect(settings.getByText('Not downloaded yet.')).toBeVisible();
  await probe('before display');
  t = Date.now();
  const click = settings.getByRole('tab', { name: /Display/ }).click({ timeout: 25_000 }).then(() => 'ok', (e: Error) => e.message);
  for (let i = 0; i < 5; i++) {
    const done = await Promise.race([click, new Promise((r) => setTimeout(() => r(null), 4000))]);
    if (done) {
      log('display click result', Date.now() - t, String(done).slice(0, 1500));
      break;
    }
    await probe(`display click pending ${i}`);
  }
  const res = await click;
  await probe('after display');
  expect(res).toBe('ok');
});
