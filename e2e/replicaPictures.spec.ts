import { expect, type Page, test } from '@playwright/test';

/**
 * M99 (owner's 2026-10-07 note 6): every replica picture on the menus shows the whole replica, muzzle to stock, at every
 * window size from 1280 × 720 up. Read from the page, no screenshot: each picture's drawn pixels (its alpha) are mapped
 * onto the screen, and none may fall outside its slot or tile (a crop) or under the tile's words or tick (covered).
 */

/** Per picture shown: opaque pixels in all, cut off by the slot or tile, and covered by the tile's words or tick. */
type PictureCheck = { where: string; opaque: number; cut: number; covered: number };

/** The tiles a picture sits in, and what is drawn over a tile's picture. */
const TILE = '.item-tile, .gear-slot, .option-tile, .option-locked, .armory-item, .armory-next-item, .kit-card, .colour-other';
const OVER = '.item-words, .item-name, .item-note, .item-kind, .item-lock, .armory-item-words, .option-tick, .option-words, .option-name, .option-lock, .carried-customise';

/** Checks every drawn picture on screen. Pictures scrolled out of view aren't drawn wrong, so only the slot and tile clip. */
function checkPictures(page: Page): Promise<PictureCheck[]> {
  return page.evaluate(
    ([TILE, OVER]) => {
      const out: PictureCheck[] = [];
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
      for (const img of document.querySelectorAll<HTMLImageElement>('.pic-slot.has-picture img')) {
        const r = img.getBoundingClientRect();
        if (img.hidden || img.naturalWidth === 0 || img.offsetParent === null || r.width === 0) continue;
        const [nw, nh] = [img.naturalWidth, img.naturalHeight];
        canvas.width = nw;
        canvas.height = nh;
        ctx.clearRect(0, 0, nw, nh);
        ctx.drawImage(img, 0, 0);
        const alpha = ctx.getImageData(0, 0, nw, nh).data;
        // Where object-fit: contain draws it in the img's box (the slot is sized, the picture fitted inside).
        const s = Math.min(r.width / nw, r.height / nh);
        const ox = r.left + (r.width - nw * s) / 2;
        const oy = r.top + (r.height - nh * s) / 2;
        const tile = img.closest(TILE) ?? img.parentElement!;
        let clip = { l: -Infinity, t: -Infinity, r: Infinity, b: Infinity };
        for (let e: Element | null = img.parentElement; e; e = e === tile ? null : e.parentElement) {
          const cs = getComputedStyle(e);
          if (![cs.overflowX, cs.overflowY].some((o) => o === 'hidden' || o === 'clip')) continue;
          const q = e.getBoundingClientRect();
          clip = { l: Math.max(clip.l, q.left), t: Math.max(clip.t, q.top), r: Math.min(clip.r, q.right), b: Math.min(clip.b, q.bottom) };
        }
        const over = [...tile.querySelectorAll<HTMLElement>(OVER)].filter((t) => t.offsetParent !== null && !t.contains(img)).map((t) => t.getBoundingClientRect());
        let opaque = 0;
        let cut = 0;
        let covered = 0;
        for (let y = 0; y < nh; y++) {
          for (let x = 0; x < nw; x++) {
            if (alpha[(y * nw + x) * 4 + 3]! <= 16) continue;
            opaque++;
            const px = ox + (x + 0.5) * s;
            const py = oy + (y + 0.5) * s;
            if (px < clip.l || px > clip.r || py < clip.t || py > clip.b) cut++;
            else if (over.some((q) => px >= q.left && px <= q.right && py >= q.top && py <= q.bottom)) covered++;
          }
        }
        const name = tile.querySelector('.item-name, .option-name, .gear-name')?.textContent ?? '';
        out.push({ where: `${img.parentElement!.className.replace(/pic-slot|has-picture/g, '').trim()} ${name}`.trim(), opaque, cut, covered });
      }
      return out;
    },
    [TILE, OVER] as const,
  );
}

/** The sizes from the smallest supported window up. */
const SIZES = [
  { width: 1280, height: 720 },
  { width: 1440, height: 900 },
  { width: 1920, height: 1080 },
  { width: 2560, height: 1440 },
];

/** Waits for `count` pictures drawn on screen, then checks them at every size: nothing cut or covered. */
async function expectWholeAtEverySize(page: Page, screen: string, count: number): Promise<void> {
  await expect.poll(async () => (await checkPictures(page)).length, { timeout: 60_000, message: `${screen}: pictures drawn` }).toBeGreaterThanOrEqual(count);
  for (const size of SIZES) {
    await page.setViewportSize(size);
    // Two frames for the layout to settle at the new size.
    await page.evaluate(() => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))));
    const bad = (await checkPictures(page)).filter((p) => p.cut > 0 || p.covered > 0).map((p) => `${p.where}: ${p.cut} px cut, ${p.covered} px covered of ${p.opaque}`);
    expect(bad, `${screen} at ${size.width}×${size.height}`).toEqual([]);
  }
  await page.setViewportSize(SIZES[0]!);
}

test('every replica picture shows the whole replica on the Loadout, Customise and the Armory, at every size (M99)', async ({ page }) => {
  test.setTimeout(180_000);
  const errors: string[] = [];
  page.on('pageerror', (err) => errors.push(`pageerror: ${err.message}`));
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(`console: ${msg.text()}`);
  });
  // A new player (LV1): the two starting replicas, and the Cyber Pistol greyed until level 10.
  await page.setViewportSize(SIZES[0]!);
  await page.goto('/?nolock&seed=1&quality=low');
  await page.waitForSelector('.menu-title-start', { timeout: 30_000 });
  await page.locator('.menu-title-start').click();
  const topBar = page.locator('.menu-topbar');

  // The Loadout: what you carry and "Your replicas", the picked one with its tick, the locked one with its lock.
  await topBar.getByRole('button', { name: 'Loadout', exact: true }).click();
  const loadout = page.locator('.menu-loadout');
  await expect(loadout.locator('.replica-tile')).toHaveCount(3);
  await expect(loadout.locator('.replica-tile.selected')).toHaveCount(1);
  await expect(loadout.locator('.replica-tile.is-locked')).toHaveText(/Cyber Pistol\s*Level 10/);
  await expectWholeAtEverySize(page, 'Loadout', 3 + 2);

  // Customise: the replica large, and a tile per colour scheme, the picked one ticked.
  await loadout.getByRole('button', { name: /^Primary: AEG Rifle/ }).click({ button: 'right' });
  await expect(loadout.locator('.scheme-tile').first()).toBeVisible();
  await expectWholeAtEverySize(page, 'Customise', 4);
  await page.keyboard.press('Escape');

  // The Armory (LV1): the next unlock's card and every level's items, the three replicas among them.
  await topBar.getByRole('button', { name: 'Armory', exact: true }).click();
  const armory = page.locator('.menu-armory');
  await expect(armory.locator('.armory-item[data-kind="replica"]')).toHaveCount(3);
  await expectWholeAtEverySize(page, 'Armory', 3);
  expect(errors).toEqual([]);
});
