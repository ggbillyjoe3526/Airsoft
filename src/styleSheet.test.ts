import { describe, expect, it } from 'vitest';


// style.css pinned as text (audit UI-03, UI-04, UI-06, UI-07), the way bots.ts and maps.ts are in their tests: the
// stylesheet can't be drawn in Vitest, so these read its rules.

// Read from disk: Vitest empties a `?raw` import of a .css file (its CSS handling is off), and the project's types
// don't include Node's, so the module name is built at run time.
const nodeFs = 'node:' + 'fs';
const { readFileSync } = (await import(/* @vite-ignore */ nodeFs)) as { readFileSync(path: URL, encoding: 'utf8'): string };
const css = readFileSync(new URL('./style.css', import.meta.url), 'utf8');

/** The stylesheet without its comments, so a comment naming `:has()` or a class is not mistaken for a rule. */
const sheet = css.replace(/\/\*[\s\S]*?\*\//g, '');

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

describe("the menus' size step (M68, audit UI-12)", () => {
  const rootBlock = blockOf(':root')!;
  const tokens = [...rootBlock.matchAll(/(--(?:fs|control)-[a-z0-9]+):\s*([^;]+);/g)].map((m) => [m[1]!, m[2]!.trim()] as const);

  it('scales every type and control token inside .menus by --menu-scale, from the same size as :root', () => {
    expect(tokens.length).toBeGreaterThanOrEqual(14);
    for (const [name, value] of tokens) {
      expect(declared('.menus', name), name).toBe(`calc(${value} * var(--menu-scale, 1))`);
    }
  });

  it("leaves :root's tokens as they are, so the HUD, which has its own --hud-scale, is not scaled twice", () => {
    expect(rootBlock).not.toMatch(/--menu-scale/);
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
