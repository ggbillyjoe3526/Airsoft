import { describe, expect, it } from 'vitest';


// The stylesheets pinned as text (audit UI-03, UI-04, UI-06, UI-07), the way bots.ts and maps.ts are in their tests:
// they can't be drawn in Vitest, so these read their rules. style.css, then the menus' (ui/menus/menus.css and the
// files it imports, G3) and the HUD's (ui/hud.css and its files, G4), in the order the page loads them.

// Read from disk: Vitest empties a `?raw` import of a .css file (its CSS handling is off), and the project's types
// don't include Node's, so the module name is built at run time.
const nodeFs = 'node:' + 'fs';
const { readFileSync } = (await import(/* @vite-ignore */ nodeFs)) as { readFileSync(path: URL, encoding: 'utf8'): string };

/** A stylesheet with its `@import`s read in their place, each import as its own file's text. */
function withImports(url: URL): { url: URL; text: string }[] {
  const text = readFileSync(url, 'utf8');
  const imports = [...text.matchAll(/@import\s+'([^']+)';/g)].map((m) => new URL(m[1]!, url));
  return [{ url, text: text.replace(/@import\s+'[^']+';/g, '') }, ...imports.flatMap(withImports)];
}

const menuFiles = withImports(new URL('./ui/menus/menus.css', import.meta.url));
const hudFiles = withImports(new URL('./ui/hud.css', import.meta.url));
const css = [readFileSync(new URL('./style.css', import.meta.url), 'utf8'), ...menuFiles.map((f) => f.text), ...hudFiles.map((f) => f.text)].join('\n');

/** A stylesheet without its comments, so a comment naming `:has()` or a class is not mistaken for a rule. */
const uncomment = (text: string): string => text.replace(/\/\*[\s\S]*?\*\//g, '');
const sheet = uncomment(css);
/** The menus' rules alone (G3). */
const menuSheet = uncomment(menuFiles.map((f) => f.text).join('\n'));
/** The HUD's rules alone (G4). */
const hudSheet = uncomment(hudFiles.map((f) => f.text).join('\n'));

/** Every text size a sheet sets in px: font-size, the font shorthand, and a clamp()'s or calc()'s smallest. */
function textSizes(text: string): number[] {
  const plain = [...text.matchAll(/(?:font-size:|font:[^;]*?)\s(?:calc\()?(\d+(?:\.\d+)?)px/g)].map((m) => Number(m[1]));
  const floors = [...text.matchAll(/font(?:-size)?:[^;]*clamp\((\d+)px/g)].map((m) => Number(m[1]));
  return [...plain, ...floors];
}

/** The body of the first rule or at-rule whose prelude is exactly `prelude`, matched by braces. */
function blockOf(prelude: string, from = 0): string | null {
  const re = new RegExp(`(^|[}{;])\\s*${prelude.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\{`, 'g');
  re.lastIndex = from;
  const m = re.exec(sheet);
  if (!m) return null;
  let depth = 1;
  const start = m.index + m[0].length;
  for (let i = start; i < sheet.length; i++) {
    if (sheet[i] === '{') depth++;
    else if (sheet[i] === '}' && --depth === 0) return sheet.slice(start, i);
  }
  return null;
}

/** The selectors of a rule list's rules, flattened: `a, b { }` gives a and b. */
function selectorsIn(body: string): string[] {
  return [...body.matchAll(/([^{}]+)\{[^{}]*\}/g)].flatMap((m) => m[1]!.split(',').map((s) => s.trim()));
}

function luminance(hex: string): number {
  const n = parseInt(hex.slice(1), 16);
  const [r, g, b] = [n >> 16, (n >> 8) & 255, n & 255].map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

/** The first declaration of a custom property (the :root one, before any media override). */
function token(name: string): string {
  const m = new RegExp(`${name}:\\s*(#[0-9a-fA-F]{6})`).exec(sheet);
  if (!m) throw new Error(`no ${name}`);
  return m[1]!;
}

/** The value of a property in the (single) plain rule for `selector`. */
function declared(selector: string, property: string): string | undefined {
  return new RegExp(`${property}:\\s*([^;}]+)`).exec(blockOf(selector) ?? '')?.[1]?.trim();
}

describe('the debug overlay below the minimap (audit UI-06)', () => {
  it('has no :has() rule anywhere', () => {
    expect(sheet).not.toMatch(/:has\(/);
  });

  it('sits below the minimap through the container class the Minimap sets', () => {
    const rule = blockOf('.minimap-on > .debug-overlay');
    expect(rule, 'a rule for the debug overlay under .minimap-on').not.toBeNull();
    expect(rule).toMatch(/top:\s*calc\([^;]*--minimap-size[^;]*\)/);
  });
});

describe('the empty key box (audit UI-04)', () => {
  it('has its dash at least 4.5:1 on the box\'s panel', () => {
    const colour = declared('.key-button.empty', 'color');
    expect(colour, 'the empty box sets its own colour').toMatch(/^var\(--menu-[a-z-]+\)$/);
    const text = token(colour!.slice(4, -1));
    const panel = declared('.key-button', 'background');
    expect(panel).toBe('var(--menu-panel-hi)');
    expect(contrast(text, token('--menu-panel-hi'))).toBeGreaterThanOrEqual(4.5);
  });

  it('does not repaint the box under the dash', () => {
    expect(blockOf('.key-button.empty')).not.toMatch(/background/);
  });
});

describe('the forced-colours list (audit UI-03)', () => {
  it('keeps the case prompt, the coach and the range readout their own colours, beside the HUD it already covered', () => {
    const list = blockOf('@media (forced-colors: active)');
    expect(list).not.toBeNull();
    const group = selectorsIn(list!);
    for (const selector of ['.hud', '.minimap', '.what-got-you', '.case-prompt', '.coach', '.range-readout']) {
      expect(group, selector).toContain(selector);
    }
    // They are in the rule that switches the adjustment off, not merely somewhere in the block.
    const rule = /([^{}]+)\{\s*forced-color-adjust:\s*none;\s*\}/.exec(list!)?.[1] ?? '';
    for (const selector of ['.case-prompt', '.coach', '.range-readout']) expect(rule).toContain(selector);
  });
});

describe('Reduced motion with nothing saved (audit UI-07)', () => {
  it('lets the system setting reduce the key-moved flash and the respawn fade unless the player picked full motion', () => {
    const all = [...sheet.matchAll(/@media \(prefers-reduced-motion: reduce\)\s*\{/g)].map((m) => blockOf('@media (prefers-reduced-motion: reduce)', m.index) ?? '');
    const text = all.join('\n');
    expect(text).toMatch(/#app:not\(\.full-motion\) \.key-row\.moved\s*\{[^}]*animation:\s*none/);
    expect(text).toMatch(/#app:not\(\.full-motion\) \.respawn-fade\.on\s*\{[^}]*animation-duration/);
  });
});

describe('the progress fills (audit UI-11)', () => {
  const fills = ['.hud-reload div', '.case-prompt-fill', '.sb-flag-bar b'];

  it('scale from the left on one transform transition, whose duration the game sets, not a width', () => {
    const rule = blockOf(fills.join(',\n'));
    expect(rule, 'one rule for the three fills').not.toBeNull();
    expect(rule).toMatch(/width:\s*100%/);
    expect(rule).toMatch(/transform:\s*scaleX\(0\)/);
    expect(rule).toMatch(/transform-origin:\s*left/);
    expect(rule).toMatch(/transition-property:\s*transform/);
    expect(rule).toMatch(/transition-duration:\s*0s/);
  });

  it('lose the transition under Reduced motion, the setting and the system fallback, so the game steps them instead', () => {
    expect(blockOf(fills.map((f) => `.reduced-motion ${f}`).join(',\n'))).toMatch(/transition-property:\s*none/);
    const system = [...sheet.matchAll(/@media \(prefers-reduced-motion: reduce\)\s*\{/g)].map((m) => blockOf('@media (prefers-reduced-motion: reduce)', m.index) ?? '').join('\n');
    expect(system).toMatch(/#app:not\(\.full-motion\) \.hud-reload div,\s*#app:not\(\.full-motion\) \.case-prompt-fill,\s*#app:not\(\.full-motion\) \.sb-flag-bar b\s*\{[^}]*transition-property:\s*none/);
  });

  it('keep their colours in forced colours, inside the HUD, the scoreboard and the case prompt', () => {
    const rule = /([^{}]+)\{\s*forced-color-adjust:\s*none;\s*\}/.exec(blockOf('@media (forced-colors: active)')!)?.[1] ?? '';
    for (const owner of ['.hud', '.scoreboard', '.case-prompt']) expect(rule).toContain(owner);
  });
});

describe('the dead rules are gone (M68, audit UI-10)', () => {
  it('has no .settings-reload or .armory-row-count rule', () => {
    expect(sheet).not.toMatch(/\.settings-reload|\.armory-row-count/);
  });
});

describe('the Custom graphics disclosure (M68, audit UI-09)', () => {
  it('shows a keyboard focus ring on its summary, with the controls', () => {
    expect(sheet).toMatch(/\.menus :is\([^)]*\bsummary\b[^)]*\):focus-visible/);
  });

  it('draws its chevron in currentColor, so forced colours keep it, and has no transition for Reduced motion to miss', () => {
    expect(declared('.graphics-subhead::before', 'border-right')).toContain('currentColor');
    expect(blockOf('.graphics-subhead::before')).not.toMatch(/transition|animation/);
    expect(blockOf('.graphics-custom[open] > .graphics-subhead::before')).toMatch(/rotate\(45deg\)/);
  });
});

describe('the Custom graphics disclosure in forced colours, Reduced motion and the keyboard (M68 QA, audit UI-09)', () => {
  const chevron = '.graphics-subhead::before';

  it('draws both chevron strokes in currentColor and gives the summary no marker of its own', () => {
    expect(declared(chevron, 'border-bottom')).toContain('currentColor');
    expect(declared('.graphics-subhead', 'list-style')).toBe('none');
    expect(blockOf('.graphics-subhead::-webkit-details-marker')).toMatch(/display:\s*none/);
  });

  it('leaves the summary and its chevron to the system in forced colours (no forced-color-adjust: none reaches them)', () => {
    const forced = blockOf('@media (forced-colors: active)') ?? '';
    expect(forced).not.toBe('');
    for (const selector of selectorsIn(forced)) expect(selector).not.toMatch(/graphics-(subhead|custom)|summary|\.menu-kicker/);
  });

  it('carries no transition or animation on the fold or its summary, in a Reduced-motion block or out of it', () => {
    for (const selector of ['.graphics-subhead', '.graphics-custom > .menu-readout', '.graphics-custom[open] > .graphics-subhead::before']) {
      expect(blockOf(selector) ?? '', selector).not.toMatch(/transition|animation/);
    }
    for (const m of sheet.matchAll(/[^{}]*graphics-(subhead|custom)[^{}]*\{[^{}]*\}/g)) expect(m[0]).not.toMatch(/transition|animation/);
  });

  it('keeps the focus ring of the shared rule (orange outline and the page-coloured gap) for the summary', () => {
    const m = /(\.menus :is\([^)]*\bsummary\b[^)]*\):focus-visible)[^{]*\{([^}]*)\}/.exec(sheet);
    expect(m).not.toBeNull();
    expect(m![2]).toMatch(/outline:\s*2px solid var\(--orange\)/);
    expect(m![2]).toMatch(/box-shadow/);
  });

  it('sizes the summary as a control (36 px at least) so a touch or a pointer can hit it', () => {
    expect(declared('.graphics-subhead', 'min-height')).toBe('var(--control-sm)');
  });
});

describe('the menus\' sheets (G3)', () => {
  it('read every file menus.css imports, the screens\' own rules among them', () => {
    expect(menuFiles.length).toBeGreaterThan(5);
    expect(menuSheet).toMatch(/\.menu-topbar\s*\{/);
    expect(menuSheet).toMatch(/\.settings-columns\s*\{/);
  });

  it('never set text under 15 px: no smaller size, in a font-size, a font shorthand or the type scale', () => {
    const sizes = [...menuSheet.matchAll(/(?:font-size:|font:[^;]*?)\s(\d+(?:\.\d+)?)px/g)].map((m) => Number(m[1]));
    expect(sizes.length).toBeGreaterThan(0);
    expect(sizes.filter((px) => px < 15)).toEqual([]);
    // A clamp()'s smallest size counts too.
    const floors = [...menuSheet.matchAll(/font(?:-size)?:[^;]*clamp\((\d+)px/g)].map((m) => Number(m[1]));
    expect(floors.filter((px) => px < 15)).toEqual([]);
    for (const step of ['--fs-2xs', '--fs-xs', '--fs-sm']) expect(new RegExp(`${step}:\\s*15px`).test(menuSheet), step).toBe(true);
    expect(menuSheet).not.toMatch(/font-size:\s*0(?![.\d])/);
  });

  it('set every note in sentence case at full contrast: no capitals, no fading, a full-contrast colour (text, soft, muted, or a hint or warning colour)', () => {
    const notes = ['.menu-row-help', '.choice-blurb', '.key-note', '.graphics-note', '.save-dialog-note'];
    const rules = [...sheet.matchAll(/([^{}]+)\{([^{}]*)\}/g)].filter((m) => m[1]!.split(',').some((sel) => notes.some((n) => new RegExp(`${n.replace('.', '\\.')}(?![\\w-])`).test(sel))));
    expect(rules.length).toBeGreaterThan(0);
    for (const [, prelude, body] of rules) {
      expect(body, prelude).not.toMatch(/text-transform:\s*uppercase/);
      const opacity = /(?:^|[;\s])opacity:\s*([\d.]+)/.exec(body!);
      if (opacity) expect(Number(opacity[1]), prelude).toBeGreaterThanOrEqual(1);
      const colour = /(?:^|[;\s])color:\s*([^;]+)/.exec(body!);
      if (colour) expect(colour[1]!.trim(), prelude).toMatch(/^var\(--(paper|menu-soft|menu-muted|hint|warning)\)$/);
    }
  });

  it('never blur live: no backdrop-filter and no blur filter, anywhere on the menus', () => {
    expect(menuSheet).not.toMatch(/backdrop-filter/);
    expect(menuSheet).not.toMatch(/filter:\s*[^;]*blur\(/);
  });

  it('keep every file short (about 600 lines at most)', () => {
    for (const f of menuFiles) expect(f.text.split('\n').length, f.url.pathname).toBeLessThanOrEqual(640);
  });
});

describe('the HUD\'s sheets (G4)', () => {
  it('read every file hud.css imports, each part\'s rules among them', () => {
    expect(hudFiles.length).toBe(7);
    for (const rule of ['.scoreboard', '.minimap-frame', '.hit-feed-line', '.squad-card', '.hud-replica', '.match-board']) {
      expect(blockOf(rule), rule).not.toBeNull();
    }
    // Moved, not copied: style.css keeps none of them.
    const style = uncomment(readFileSync(new URL('./style.css', import.meta.url), 'utf8'));
    for (const rule of ['.scoreboard', '.hit-feed-line', '.hud-replica', '.match-board', '.squad-order']) {
      expect(style, rule).not.toMatch(new RegExp(`(^|\\})\\s*\\${rule}\\s*\\{`));
    }
  });

  it('never set HUD text under 15 px', () => {
    const sizes = textSizes(hudSheet);
    expect(sizes.length).toBeGreaterThan(10);
    expect(sizes.filter((px) => px < 15)).toEqual([]);
    // No type-scale step under 15 px either (they are 11 to 13 px outside the menus).
    expect(hudSheet).not.toMatch(/var\(--fs-(2xs|xs|sm)\)/);
  });

  it('never blur or filter live over the field, and keep every file short', () => {
    expect(hudSheet).not.toMatch(/backdrop-filter|filter:/);
    for (const f of hudFiles) expect(f.text.split('\n').length, f.url.pathname).toBeLessThanOrEqual(640);
  });

  it('draw the concept\'s shapes: slanted pips, cut corners, a rounded minimap, the current fire mode orange', () => {
    expect(declared('.sb-pips i', 'transform')).toBe('skewX(-14deg)');
    for (const rule of ['.sb-team-0', '.sb-team-1', '.hud-replica', '.match-board']) expect(declared(rule, 'clip-path'), rule).toMatch(/^polygon\(/);
    expect(declared('.minimap', 'border-radius')).toBe('10px');
    expect(declared('.hud-mode.on', 'background')).toBe('var(--orange)');
    expect(declared('.hit-feed-line.you', 'box-shadow')).toContain('var(--menu-acid)');
    expect(declared('.squad-card.hit', 'opacity')).toBe('0.6');
  });

  it('keep what keeps under the score bar on its height token, and the debug panel under the minimap\'s caption', () => {
    expect(sheet).not.toMatch(/70px \* var\(--sb-scale/);
    expect(blockOf('.hitfx-banner')).toMatch(/var\(--sb-height\) \* var\(--sb-scale, 1\)/);
    expect(blockOf('.minimap-on > .debug-overlay')).toMatch(/--minimap-caption/);
  });
});
