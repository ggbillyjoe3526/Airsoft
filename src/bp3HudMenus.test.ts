import { describe, expect, it } from 'vitest';

/**
 * BP3a QA (bug pass 3, the HUD and the menus): the sheets read as text (as styleSheet.test.ts does), the option lists in
 * src/config, and the wiring of what a Vitest run cannot draw (the sessions need a WebGL renderer), pinned at the source.
 */

const nodeFs = 'node:' + 'fs';
const { readFileSync } = (await import(/* @vite-ignore */ nodeFs)) as { readFileSync(path: URL, encoding: 'utf8'): string };
const read = (path: string): string => readFileSync(new URL(path, import.meta.url), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');

const styleCss = read('./style.css');
const hudCss = (name: string): string => read(`./ui/hudCss/${name}.css`);
const menuCss = (name: string): string => read(`./ui/menus/css/${name}.css`);

/** The declarations of the first rule that has exactly `selector` as one of its comma-separated selectors. */
function rule(sheet: string, selector: string): string {
  for (const m of sheet.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    if (m[1]!.split(',').some((s) => s.trim() === selector)) return m[2]!;
  }
  throw new Error(`no rule for ${selector}`);
}
const decl = (sheet: string, selector: string, property: string): string | undefined =>
  new RegExp(`(?:^|[;\\s])${property}:\\s*([^;]+)`).exec(rule(sheet, selector))?.[1]?.trim();

describe('BP3a acceptance: the HUD\'s measures at 1280, 1366 and 1920 px', () => {
  it('puts the round banner\'s gap under the score bar in the HUD\'s scale', () => {
    expect(decl(hudCss('round'), '.hitfx-round', 'top')).toContain('32px * var(--hud-scale, 1)');
  });

  it('keeps the flag / run line within the bar\'s widest form and lets its words wrap instead of running over the minimap', () => {
    expect(decl(hudCss('score'), '.sb-flag', 'max-width')).toBe('730px');
    expect(decl(hudCss('score'), '.sb-flag-text', 'white-space')).toBe('normal');
    expect(decl(hudCss('score'), '.sb-flag-text', 'min-width')).toBe('0');
  });

  it('hides the reserve\'s pip', () => {
    expect(decl(hudCss('score'), '.sb-pips i.reserve', 'display')).toBe('none');
  });

  it('hides the replica panel while the board covers it, and closes the board\'s rows when compact', () => {
    expect(decl(hudCss('board'), '.board-covers-panel .hud-replica', 'visibility')).toBe('hidden');
    expect(rule(hudCss('board'), '.match-board.compact .stats-table td')).toMatch(/padding-top/);
    expect(decl(hudCss('board'), '.match-board', 'scale')).toContain('var(--board-fit, 1)');
  });

  it('sets no HUD text under 15 px in the rules raised to --fs-md', () => {
    const fsMd = Number(/--fs-md:\s*(\d+)px/.exec(styleCss)![1]);
    expect(fsMd).toBeGreaterThanOrEqual(15);
    for (const selector of ['.hitfx-out', '.case-prompt', '.order-wheel-hint', '.coach-head', '.coach-shot', '.what-got-you-title', '.what-got-you-notes p']) {
      expect(decl(styleCss, selector, 'font-size'), selector).toBe('var(--fs-md)');
    }
  });
});

describe('BP3a acceptance: the menus at 1280 x 720', () => {
  it('puts a gap only between settings panels that are both shown', () => {
    const sheet = menuCss('settings');
    expect(decl(sheet, '.settings-tab-panel:not([hidden]) ~ .settings-tab-panel:not([hidden])', 'margin-top')).toBe('var(--sp-4)');
    expect(sheet).not.toMatch(/\.settings-tab-panel \+ \.settings-tab-panel/);
  });

  it('keeps Start match and Continue stuck at the foot of their panels', () => {
    for (const [sheet, selector] of [[menuCss('play'), '.play-aside > .play-button'], [menuCss('end'), '.summary-aside > .menu-button-big']] as const) {
      expect(decl(sheet, selector, 'position'), selector).toBe('sticky');
      expect(decl(sheet, selector, 'bottom'), selector).toBe('0');
    }
  });
});

describe('BP3a acceptance 4: every list of two options labelled On and Off in src/config reads Off first', () => {
  const modules = import.meta.glob<Record<string, unknown>>(['./config/*.ts', '!./config/*.test.ts'], { eager: true });
  const lists: [name: string, ids: string[]][] = [];
  for (const [file, exports] of Object.entries(modules)) {
    for (const [name, value] of Object.entries(exports)) {
      if (!Array.isArray(value) || value.length !== 2) continue;
      const items = value.map((o) => (o && typeof o === 'object' ? (o as { id?: unknown; label?: unknown }) : {}));
      // The choices a player reads as On and Off: their buttons are labelled so (Mixed / Humans only, Dynamic / Static
      // and Heard / Teammates only are two named options, not a switch).
      if (items.map((o) => o.label).sort().join() === 'Off,On') lists.push([`${file.slice(9)}: ${name}`, items.map((o) => String(o.label))]);
    }
  }

  it('finds the lists it should (a rename would otherwise empty this check)', () => {
    const names = lists.map(([n]) => n.split(': ')[1]);
    expect(names).toEqual(expect.arrayContaining(['FRIENDLY_FIRE_CHOICES', 'RAW_INPUT', 'CROSSHAIR_OUTLINES', 'RICOCHETS_COUNT_CHOICES']));
  });

  it.each(lists)('%s', (_name, labels) => {
    expect(labels).toEqual(['Off', 'On']);
  });
});

describe('BP3a: wiring of the presentation classes, pinned at the source', () => {
  const sources = import.meta.glob<string>(['./matchSession.ts', './render/match/matchPresentation.ts'], { query: '?raw', import: 'default', eager: true });

  it('holds the round message while the player calls their hit, and shows it again after', () => {
    const src = sources['./render/match/matchPresentation.ts']!;
    expect(src).toMatch(/this\.updateRoundMessage\(status === 'calling'\)/);
    expect(src).toMatch(/if \(calling\) this\.feedback\.setRoundMessage\(''\)/);
    // Changing the state rebuilds the message, so it comes back when the call ends.
    expect(src).toMatch(/shown\.calling === calling\) return/);
  });

  it('hands the scoreboard the roster sizes (the reserve included) and the board its fit mode, and the reserve to the table', () => {
    const session = sources['./matchSession.ts']!;
    expect(session).toMatch(/this\.teamSizes\(\), this\.rounds/);
    expect(session).toMatch(/const \[mine, theirs\] = this\.rosterSizes\(\);\s*return byTeam\(this\.playerTeam, mine, theirs\)/);
    const match = sources['./render/match/matchPresentation.ts']!;
    expect(match).toMatch(/new MatchBoard\(container, true\)/);
    expect(match).toMatch(/this\.extraction !== undefined, r\.run\.reserve, this\.tags\)/);
  });
});
