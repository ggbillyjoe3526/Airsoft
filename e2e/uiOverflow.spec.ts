import { expect, type Page, test } from '@playwright/test';

/**
 * UI overflow guard (Dev 5 playtest, points 1 and 8): at 1280 x 720, the smallest window the menus are made for, no
 * button, tab, chip, card or panel line has text running out of its box or its background, and in a match the ammo
 * panel's count never touches the fire-mode chips or name beside it (a three-digit count did) nor any other HUD panel,
 * at the smallest, default and largest HUD size. Measured from the page (text rectangles against their boxes), not from
 * screenshots. `?nolock`, as the other browser tests; Low, so the match draws fast enough in software.
 *
 * Truncation with an ellipsis is allowed only on a name the player chose, which says so in a `title` (the saved
 * loadouts' tabs, the Match screen's loadout pick); every other word must fit.
 */

/** What the page reports: one line per problem, naming the element, its words and what ran out of what. */
function overflowReport(): string[] {
  const TOL = 1.5;
  const found: string[] = [];
  const name = (e: Element): string => {
    const parts: string[] = [];
    for (let n: Element | null = e; n && parts.length < 3; n = n.parentElement) {
      const cls = typeof n.className === 'string' ? n.className.trim().split(/\s+/).slice(0, 2).join('.') : '';
      parts.unshift(n.tagName.toLowerCase() + (cls ? `.${cls}` : ''));
    }
    return parts.join(' > ');
  };
  const shown = (e: Element): boolean => {
    for (let n: Element | null = e; n; n = n.parentElement) {
      const cs = getComputedStyle(n);
      if (cs.display === 'none' || cs.visibility === 'hidden' || (n as HTMLElement).hidden) return false;
    }
    const r = e.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  };
  const painted = (cs: CSSStyleDeclaration): boolean => {
    const m = cs.backgroundColor.match(/[\d.]+/g);
    const alpha = m && m.length > 3 ? parseFloat(m[3]!) : m ? 1 : 0;
    return alpha > 0.05 || cs.backgroundImage !== 'none' || (parseFloat(cs.borderTopWidth) > 0 && cs.borderTopStyle !== 'none');
  };
  const scrolls = (cs: CSSStyleDeclaration): boolean => /(auto|scroll)/.test(cs.overflowY);
  const hasTip = (e: Element): boolean => !!e.closest('[title]:not([title=""])');
  const root = document.querySelector('#app') ?? document.body;
  for (const e of root.querySelectorAll('*')) {
    if (!shown(e) || e.closest('.sr-only')) continue;
    const details = e.closest('details');
    if (details && !details.open && !e.closest('summary')) continue;
    const cs = getComputedStyle(e);
    const lineClamp = (cs as CSSStyleDeclaration & { webkitLineClamp?: string }).webkitLineClamp;
    if (lineClamp && lineClamp !== 'none') continue;
    // A button or chip's own contents wider than itself: whatever it holds is out of it.
    if (e.matches('button, .tag-pill, .menu-chip, .hud-mode') && e.scrollWidth > e.clientWidth + 1 && e.clientWidth > 0) {
      found.push(`${name(e)}: contents ${e.scrollWidth}px in a ${e.clientWidth}px box`);
    }
    const texts = [...e.childNodes].filter((n) => n.nodeType === 3 && n.textContent!.trim());
    if (!texts.length) continue;
    const range = document.createRange();
    let left = Infinity;
    let top = Infinity;
    let right = -Infinity;
    let bottom = -Infinity;
    for (const t of texts) {
      range.selectNodeContents(t);
      for (const r of range.getClientRects()) {
        if (r.width === 0) continue;
        left = Math.min(left, r.left);
        top = Math.min(top, r.top);
        right = Math.max(right, r.right);
        bottom = Math.max(bottom, r.bottom);
      }
    }
    if (left === Infinity) continue;
    const words = texts.map((t) => t.textContent!.trim()).join(' ').slice(0, 40);
    const box = e.getBoundingClientRect();
    const fontSize = parseFloat(cs.fontSize) || 16;
    const lineHeight = parseFloat(cs.lineHeight) || fontSize * 1.2;
    // A text rectangle is the font's height, taller than a tight line box: allow what the line height cuts.
    // The font's height and the line height are in layout pixels: a HUD panel scaled by its size setting (CSS scale) draws
    // them larger, so what the line height cuts grows with it.
    const drawn = e instanceof HTMLElement && e.offsetHeight > 0 ? Math.max(1, box.height / e.offsetHeight) : 1;
    const slack = Math.max(TOL, ((fontSize * 1.25 - lineHeight) / 2 + 1.5) * drawn);
    const clipped = e.scrollWidth > e.clientWidth + 1 && cs.textOverflow === 'ellipsis';
    if (clipped) {
      // A cut name needs its full text as a tip.
      if (!hasTip(e)) found.push(`${name(e)} "${words}": cut with an ellipsis and no title`);
      continue;
    }
    if (right > box.right + TOL || left < box.left - TOL) found.push(`${name(e)} "${words}": text ${Math.round(left)}-${Math.round(right)} runs out of its box ${Math.round(box.left)}-${Math.round(box.right)}`);
    if (!scrolls(cs) && (bottom > box.bottom + slack || top < box.top - slack)) found.push(`${name(e)} "${words}": text ${Math.round(top)}-${Math.round(bottom)} runs out of its box ${Math.round(box.top)}-${Math.round(box.bottom)}`);
    // And out of the nearest thing with a background of its own (a card, a panel), unless that scrolls.
    let back: Element | null = e;
    while (back && !painted(getComputedStyle(back))) back = back.parentElement;
    if (back && back !== e && back !== root && back !== document.body && !back.classList.contains('menus') && !scrolls(getComputedStyle(back))) {
      const b = back.getBoundingClientRect();
      if (right > b.right + TOL || left < b.left - TOL || bottom > b.bottom + slack || top < b.top - slack) found.push(`${name(e)} "${words}": text is outside its background ${name(back)}`);
    }
  }
  return found;
}

/** The ammo panel's parts against each other and its box against the other HUD panels: pairs that touch. */
function hudOverlaps(): string[] {
  const out: string[] = [];
  const shown = (e: Element): boolean => {
    for (let n: Element | null = e; n; n = n.parentElement) {
      const cs = getComputedStyle(n);
      if (cs.display === 'none' || cs.visibility === 'hidden' || (n as HTMLElement).hidden || parseFloat(cs.opacity) === 0) return false;
    }
    return true;
  };
  const touch = (a: number[], b: number[]): boolean => a[0]! < b[2]! && b[0]! < a[2]! && a[1]! < b[3]! && b[1]! < a[3]!;
  // The text rectangle of the first element matching `selector`, as [left, top, right, bottom].
  const textBox = (selector: string): number[] | null => {
    const e = document.querySelector(selector);
    if (!e) return null;
    const range = document.createRange();
    range.selectNodeContents(e);
    const r = range.getBoundingClientRect();
    return [r.left, r.top, r.right, r.bottom];
  };
  const ammo = textBox('.hud-mag');
  if (!ammo) return ['no ammo count in the HUD'];
  // Inside the panel: the count against the chips, the spare line and the status line.
  const parts = ['.hud-mode', '.hud-spare', '.hud-status'];
  for (const sel of parts) {
    for (const e of document.querySelectorAll(sel)) {
      if (!shown(e)) continue;
      const r = e.getBoundingClientRect();
      const text = sel === '.hud-mode' ? [r.left, r.top, r.right, r.bottom] : textBox(sel)!;
      if (touch(ammo, text)) out.push(`the ammo count touches ${sel} "${e.textContent!.trim()}"`);
    }
  }
  const panel = document.querySelector('.hud-replica')!.getBoundingClientRect();
  const box = [panel.left, panel.top, panel.right, panel.bottom];
  // And the count and every part of the panel stay inside it.
  if (ammo[2]! > panel.right + 1 || ammo[0]! < panel.left - 1) out.push('the ammo count is outside the panel');
  for (const e of document.querySelectorAll('.hud-mode, .hud-mags i')) {
    const r = e.getBoundingClientRect();
    if (r.right > panel.right + 1 || r.left < panel.left - 1) out.push(`${e.className} leaves the panel`);
  }
  // The panel against the rest of the HUD.
  for (const sel of ['.minimap-frame', '.scoreboard', '.hit-feed', '.range-readout', '.match-board', '.what-got-you', '.coach']) {
    for (const e of document.querySelectorAll(sel)) {
      if (!shown(e)) continue;
      const r = e.getBoundingClientRect();
      if (r.width > 0 && r.height > 0 && touch(box, [r.left, r.top, r.right, r.bottom])) out.push(`the ammo panel touches ${sel}`);
    }
  }
  return out;
}

async function expectFits(page: Page, where: string): Promise<void> {
  const found = await page.evaluate(overflowReport);
  expect(found, `${where}: text out of its box`).toEqual([]);
}

// The three sizes the criterion names (1280 x 720 is the smallest the menus are made for).
for (const [width, height] of [[1280, 720], [1920, 1080], [2560, 1440]] as const) {
  test(`no text runs out of its box at ${width} x ${height} and the ammo panel touches nothing in a match`, async ({ page }) => {
    test.setTimeout(300_000);
    const errors: string[] = [];
    page.on('pageerror', (err) => errors.push(`pageerror: ${err.message}`));
    await page.setViewportSize({ width, height });
    // A player part way up the levels (LV1: level 3, with a next unlock and the whole track drawn), Dev content on (the
    // Dev tag, Woodland, Neon Heights' Day | Night switch and the Dev tab are all drawn), and the Dev tab's Disable
    // levelling (every slot offers something).
    await page.addInitScript(() => {
      localStorage.setItem('airsoft.settings', JSON.stringify({ version: 1, 'dev.enabled': true, 'dev.devContent': 'on', 'dev.unlockAllGear': 'on' }));
      localStorage.setItem('airsoft.progress', JSON.stringify({ version: 1, xp: 1000, unlocked: [], rev: 1 }));
    });
    await page.goto('/?nolock&seed=1&quality=low');
    await page.waitForSelector('.menu-title-start', { timeout: 30_000 });
    await expectFits(page, 'Title');

    // The Match screen: every mode card, the Custom rules and their pickers, then the Practice places.
    await page.locator('.menu-title-start').click();
    const setup = page.locator('.menu-setup');
    await expect(setup).toBeVisible();
    const mode = setup.getByRole('group', { name: 'Mode', exact: true });
    for (const name of [/Attack and Defend/, /Extraction/, /Elimination/]) {
      await mode.getByRole('button', { name }).first().click();
      await expectFits(page, `Match screen, ${name}`);
    }
    await setup.getByRole('button', { name: /^Custom/ }).first().click();
    await expectFits(page, 'Match screen, Custom rules');
    await mode.getByRole('button', { name: /Practice/ }).first().click();
    await expectFits(page, 'Match screen, Practice');
    await mode.getByRole('button', { name: /Elimination/ }).first().click();

    // Loadout with a saved loadout carrying a long name, and the slots; the Armory's level, next unlock and track.
    await page.locator('.menu-nav-item', { hasText: 'Loadout' }).click();
    await expect(page.locator('.menu-loadout')).toBeVisible();
    await page.locator('.saved-action', { hasText: 'New' }).click();
    await page.keyboard.type('A very long loadout name indeed');
    await page.keyboard.press('Enter');
    await expectFits(page, 'Loadout');
    const slots = page.locator('.gear-slot:not([aria-disabled="true"])');
    for (let i = 0; i < Math.min(await slots.count(), 4); i++) {
      await slots.nth(i).click();
      await expectFits(page, `Loadout, slot ${i}`);
    }
    await page.locator('.menu-nav-item', { hasText: 'Armory' }).click();
    await expect(page.locator('.menu-armory .armory-level')).toHaveText(/Level 3\s*of 10/);
    await expectFits(page, 'Armory');

    // Every Settings tab (the Dev tab too), its folded parts opened.
    await page.locator('.menu-nav-item', { hasText: 'Settings' }).click();
    await page.waitForSelector('.settings-tab');
    const tabs = await page.locator('.settings-tab:visible').evaluateAll((els) => els.map((e) => e.id));
    expect(tabs.length, 'the Settings tabs, Dev among them').toBeGreaterThanOrEqual(9);
    for (const id of tabs) {
      await page.locator(`#${id}`).click();
      await page.evaluate(() => document.querySelectorAll('details').forEach((d) => (d.open = true)));
      await expectFits(page, `Settings, ${id}`);
    }

    // A match: the HUD, with the ammo count at two, three and four digits, at the HUD's three sizes (80 %, 100 %, 150 %).
    await page.locator('.menu-mark').click();
    await page.locator('.menu-title-start').click();
    await setup.getByRole('button', { name: 'Start match', exact: true }).click();
    await page.waitForSelector('.hud-replica', { state: 'visible', timeout: 60_000 });
    // Round 1 goes live once the shader warm-up is done (PF1), and its start fills every pouch afresh.
    // Then a few frames past the first live one: SwiftShader takes 10 s and more over that one at 2560 x 1440 (its GPU
    // process, not the game's code, measured BP6c), and a HUD check waiting on it timed out on CI. A frame advances at
    // most 10 ticks, so 30 ticks is three frames drawn.
    await page.waitForFunction(() => ((window as unknown as { airsoft?: { state?: { tick: number } } }).airsoft?.state?.tick ?? 0) > 30, null, { timeout: 120_000 });
    // Hold round 1 for the checks below: they outlast its 150 s on a slow CI runner, and a round's end freezes the HUD
    // (WON and the table) and then refills the pouch. Nobody fires, nobody sees you, and the clock reads 50:00.
    await page.evaluate(() => {
      type Hold = { airsoft: { dev: { inForce: object }; session: { setDevCheats: (d: object) => void }; state: { round: { clock: number } } } };
      const g = (window as unknown as Hold).airsoft;
      g.session.setDevCheats({ ...g.dev.inForce, botsHoldFire: true, ghost: true });
      g.state.round.clock = 3000;
    });
    type Game = { airsoft: { prefs: { hudSize: number }; hudLook: { show: () => void }; state: { characters: { armament: { active: number; ammo: { mag: number }[] } }[] } } };
    for (const size of [1, 0.8, 1.5]) {
      await page.evaluate((s) => {
        const g = (window as unknown as Game).airsoft;
        g.prefs.hudSize = s;
        g.hudLook.show();
      }, size);
      for (const mag of [60, 200, 1200, 12000]) {
        await page.evaluate((m) => {
          const a = (window as unknown as Game).airsoft.state.characters[0]!.armament;
          a.ammo[a.active]!.mag = m;
        }, mag);
        // A frame at 2560 x 1440 in SwiftShader can take over 10 s on a loaded CI runner (BP6d: twice on one shard).
        await expect(page.locator('.hud-mag')).toHaveText(String(mag), { timeout: 30_000 });
        expect(await page.evaluate(hudOverlaps), `HUD size ${size}, ${mag} BBs loaded`).toEqual([]);
      }
      // The longest hop-up readout and a belt of twelve spare magazines (they wrap) still sit inside the 176 px panel.
      // Set again until the HUD shows them (the round's start refills the pouch to three).
      await expect(async () => {
        await page.evaluate(() => {
          const a = (window as unknown as Game).airsoft.state.characters[0]!.armament as unknown as { ammo: { pouch: number[] }[]; active: number };
          const ammo = a.ammo[a.active]!;
          ammo.pouch = [30, 0, 5, 30, 30, 30, 30, 30, 30, 30, 30, 30];
          const hop = document.querySelector('.hud-hop') as HTMLElement;
          hop.hidden = false;
          hop.querySelector('.hud-hop-value')!.textContent = '100%';
          hop.querySelector('.hud-hop-reach')!.textContent = 'Too much · floats';
        });
        await expect(page.locator('.hud-mags i')).toHaveCount(12, { timeout: 2_000 });
      }).toPass({ timeout: 20_000 });
      const inside = await page.evaluate(() => {
        const panel = document.querySelector('.hud-replica')!.getBoundingClientRect();
        const bad: string[] = [];
        for (const e of document.querySelectorAll('.hud-hop, .hud-hop > *, .hud-mags i, .hud-status, .hud-spare, .hud-mode')) {
          const r = e.getBoundingClientRect();
          if (r.width > 0 && (r.right > panel.right + 1 || r.left < panel.left - 1 || r.bottom > panel.bottom + 1 || r.top < panel.top - 1)) bad.push(e.className);
        }
        const hop = document.querySelector('.hud-hop') as HTMLElement;
        if (hop.scrollWidth > hop.clientWidth + 1) bad.push('hop readout overflows');
        return bad;
      });
      expect(inside, `HUD size ${size}: twelve spare magazines and the hop readout`).toEqual([]);
      await page.evaluate(() => {
        (document.querySelector('.hud-hop') as HTMLElement).hidden = true;
      });
      await expectFits(page, `HUD at size ${size}`);
      // BP6b: the WON / LOST word starts below a two-line round banner (half-time, a named winner) at the HUD's 80 % and 100 %.
      const gap = await page.evaluate(async () => {
        const banner = document.querySelector('.hitfx-round') as HTMLElement;
        const stamp = document.querySelector('.round-result') as HTMLElement;
        const word = stamp.querySelector('.round-result-word') as HTMLElement;
        const was = { cls: banner.className, text: banner.textContent ?? '', hidden: stamp.hidden, word: word.textContent ?? '' };
        banner.textContent = 'Flag touched · your team wins the round · half-time, ends swap · next round in 4';
        banner.className = "hitfx-round show";
        stamp.hidden = false;
        word.textContent = 'LOST';
        // Its round under it and the click line: the word was centred on all three before, so it sat highest with them.
        (stamp.querySelector('.round-result-caption') as HTMLElement).textContent = 'Round 4';
        const hint = stamp.querySelector('.round-result-hint') as HTMLElement;
        hint.hidden = false;
        hint.textContent = 'Click to continue';
        await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
        for (const a of document.getAnimations()) a.finish();
        const br = banner.getBoundingClientRect();
        const wr = word.getBoundingClientRect();
        const clear = wr.top - br.bottom;
        banner.className = was.cls;
        banner.textContent = was.text;
        stamp.hidden = was.hidden;
        word.textContent = was.word;
        hint.hidden = true;
        return clear;
      });
      // At 150 % the same words wrap to three lines in the banner's 730 px, which the word does not clear (advisory, BP6b QA).
      if (size <= 1) expect(gap, `HUD size ${size}: the result word clears a two-line round banner`).toBeGreaterThanOrEqual(0);
    }

    // The pause menu over the match (a hidden tab pauses it, as the smoke test does).
    await page.evaluate(() => {
      Object.defineProperty(document, 'hidden', { value: true, configurable: true });
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await expect(page.locator('.menu-pause')).toBeVisible({ timeout: 10_000 });
    await expectFits(page, 'Pause');

    expect(errors).toEqual([]);
  });
}
