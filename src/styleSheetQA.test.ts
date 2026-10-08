import { describe, expect, it } from 'vitest';

/**
 * QA for M100's sheets, fonts and text (read from disk, as styleSheet.test.ts does): Inter really is the face in the
 * files and the rules, every character the screens print is one Inter has, and the pop-up menu's rules hold.
 */
const nodeFs = 'node:' + 'fs';
const nodeZlib = 'node:' + 'zlib';
type Fs = {
  readFileSync(path: URL): Uint8Array;
  readFileSync(path: URL, encoding: 'utf8'): string;
  existsSync(path: URL): boolean;
  readdirSync(path: URL, options: { withFileTypes: true }): { name: string; isDirectory(): boolean }[];
};
const fs = (await import(/* @vite-ignore */ nodeFs)) as Fs;
const zlib = (await import(/* @vite-ignore */ nodeZlib)) as { brotliDecompressSync(data: Uint8Array): Uint8Array };

const here = (p: string): URL => new URL(p, import.meta.url);
const text = (p: string): string => fs.readFileSync(here(p), 'utf8');
const uncomment = (t: string): string => t.replace(/\/\*[\s\S]*?\*\//g, '');

function withImports(url: URL): string[] {
  const t = fs.readFileSync(url, 'utf8');
  const imports = [...t.matchAll(/@import\s+'([^']+)';/g)].map((m) => new URL(m[1]!, url));
  return [t.replace(/@import\s+'[^']+';/g, ''), ...imports.flatMap(withImports)];
}
const menuSheet = uncomment(withImports(here('./ui/menus/menus.css')).join('\n'));
const hudSheet = uncomment(withImports(here('./ui/hud.css')).join('\n'));
const baseSheet = uncomment(text('./style.css'));
const sheet = `${baseSheet}\n${menuSheet}\n${hudSheet}`;

/** Every `selector { body }` pair of a sheet (no nesting: the sheets have none outside @media, which this reads through). */
const rules = (css: string): { selector: string; body: string }[] => [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m) => ({ selector: m[1]!.trim(), body: m[2]! }));
const rulesFor = (css: string, selector: string): string[] => rules(css).filter((r) => r.selector.split(',').some((s) => s.trim() === selector)).map((r) => r.body);

describe('the Inter files are the font they say (M100 QA)', () => {
  const weights = ['500', '600', '700', '800'];

  it('are real woff2 files of a sensible size, one per weight the sheets load, and no Barlow file is left to ship', () => {
    const dir = fs.readdirSync(here('./assets/fonts/'), { withFileTypes: true }).map((e) => e.name);
    expect(dir.filter((n) => n.endsWith('.woff2')).sort()).toEqual(weights.map((w) => `Inter-${w}.woff2`));
    expect(dir.some((n) => /barlow/i.test(n))).toBe(false);
    const sizes = new Set<number>();
    for (const w of weights) {
      const bytes = fs.readFileSync(here(`./assets/fonts/Inter-${w}.woff2`));
      expect(String.fromCharCode(...bytes.subarray(0, 4)), w).toBe('wOF2');
      expect(bytes.length, w).toBeGreaterThan(8_000);
      expect(bytes.length, w).toBeLessThan(120_000);
      sizes.add(bytes.length);
    }
    // Four different weights, not one file four times.
    expect(sizes.size).toBe(4);
  });

  it('ship with their licence, and the assets list names Inter and its licence and no longer lists Barlow as a font in use', () => {
    expect(text('./assets/fonts/OFL.txt')).toMatch(/Inter Project Authors/);
    const assets = text('../docs/ASSETS.md');
    expect(assets).toMatch(/Inter-500\.woff2/);
    expect(assets).toMatch(/SIL OFL 1\.1/);
    expect(assets.split('\n').filter((l) => l.startsWith('|') && /Barlow[\w-]*\.woff2/.test(l))).toEqual([]);
  });
});

describe('Inter is the only face the menus and the HUD name (M100 QA)', () => {
  it('has no literal font name in any rule or shorthand outside the font variables and the @font-face blocks', () => {
    const plain = sheet.replace(/@font-face\s*\{[^}]*\}/g, '').replace(/--ui-(font|display|mono):[^;]*;/g, '');
    const families = [...plain.matchAll(/font-family:\s*([^;}]+)/g)].map((m) => m[1]!.trim());
    for (const f of families) expect(f, f).toMatch(/^(var\(--ui-(font|display)\)|inherit)$/);
    for (const m of plain.matchAll(/(?:^|[;{\s])font:\s*([^;}]+)/g)) expect(m[1], m[1]).not.toMatch(/['"]|sans-serif|serif|monospace|Arial|Helvetica|Segoe|Roboto|system-ui/);
  });

  it('leaves the monospace face to the debug overlay, the crash report and the bare key cap, and the menus draw their key caps in Inter', () => {
    const users = rules(baseSheet)
      .filter((r) => /var\(--ui-mono\)/.test(r.body))
      .map((r) => r.selector)
      .sort();
    expect(users).toEqual(['.crash-report', '.debug-overlay', 'kbd']);
    expect(rulesFor(menuSheet, '.menus kbd').join(';')).toMatch(/var\(--ui-display\)/);
  });

  // The order wheel's key caps are bare <kbd>: they take style.css's monospace cap, so the digits are not Inter (minor).
  it.fails('draws the order wheel\'s key caps in Inter too (style.css .order-wheel-key leaves the bare kbd\'s --ui-mono)', () => {
    const own = rulesFor(baseSheet, '.order-wheel-key').join(';');
    expect(own).toMatch(/font(-family)?:[^;]*(var\(--ui-(font|display)\)|inherit)/);
  });

  it('puts Inter first in both font variables, with a system face behind it for the moment the files arrive', () => {
    for (const v of ['--ui-font', '--ui-display']) expect(new RegExp(`${v}:\\s*'Inter',\\s*system-ui`).test(baseSheet), v).toBe(true);
    expect(menuSheet).toMatch(/font-display:\s*swap/);
  });
});

/** The code points Inter's latin files hold, read from the first file's cmap (woff2: a brotli stream; cmap is never transformed). */
function innerCodePoints(file: URL): Set<number> {
  const b = fs.readFileSync(file);
  const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
  const known = ['cmap', 'head', 'hhea', 'hmtx', 'maxp', 'name', 'OS/2', 'post', 'cvt ', 'fpgm', 'glyf', 'loca', 'prep'];
  const count = dv.getUint16(12);
  const compressed = dv.getUint32(20);
  let o = 48;
  const base128 = (): number => {
    let v = 0;
    for (let i = 0; i < 5; i++) {
      const c = b[o++]!;
      v = v * 128 + (c & 127);
      if (!(c & 128)) break;
    }
    return v;
  };
  const tables: { tag: string; len: number }[] = [];
  for (let i = 0; i < count; i++) {
    const flags = b[o++]!;
    let tag = known[flags & 63] ?? '';
    if ((flags & 63) === 63) {
      tag = String.fromCharCode(...b.subarray(o, o + 4));
      o += 4;
    }
    let len = base128();
    const transformed = tag === 'glyf' || tag === 'loca' ? flags >> 6 === 0 : flags >> 6 !== 0;
    if (transformed) len = base128();
    tables.push({ tag, len });
  }
  const data = zlib.brotliDecompressSync(b.subarray(o, o + compressed));
  let at = 0;
  let cmap: DataView | null = null;
  for (const t of tables) {
    if (t.tag === 'cmap') cmap = new DataView(data.buffer, data.byteOffset + at, t.len);
    at += t.len;
  }
  const set = new Set<number>();
  if (!cmap) return set;
  for (let i = 0; i < cmap.getUint16(2); i++) {
    const off = cmap.getUint32(8 + i * 8);
    const format = cmap.getUint16(off);
    if (format === 4) {
      const segments = cmap.getUint16(off + 6) / 2;
      const ends = off + 14;
      const starts = ends + segments * 2 + 2;
      for (let s = 0; s < segments; s++) for (let u = cmap.getUint16(starts + s * 2); u <= cmap.getUint16(ends + s * 2) && u < 0xffff; u++) set.add(u);
    } else if (format === 12) {
      for (let g = 0; g < cmap.getUint32(off + 12); g++) for (let u = cmap.getUint32(off + 16 + g * 12); u <= cmap.getUint32(off + 20 + g * 12); u++) set.add(u);
    }
  }
  return set;
}

/** Every non-ASCII character in the code outside comments, with where it is. */
function printedSymbols(): { file: string; line: number; ch: string }[] {
  const out: { file: string; line: number; ch: string }[] = [];
  const walk = (dir: URL, rel: string): void => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      if (e.isDirectory()) walk(new URL(`${e.name}/`, dir), `${rel}${e.name}/`);
      else if (e.name.endsWith('.ts') && !e.name.includes('.test.') && !e.name.endsWith('testSupport.ts')) {
        const code = fs.readFileSync(new URL(e.name, dir), 'utf8').replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '));
        code.split('\n').forEach((l, i) => {
          const at = l.search(/(^|\s)\/\/ /);
          for (const ch of at >= 0 ? l.slice(0, at) : l) if (ch.codePointAt(0)! > 0x7f) out.push({ file: `${rel}${e.name}`, line: i + 1, ch });
        });
      }
    }
  };
  walk(here('./'), 'src/');
  return out;
}

describe('every character the screens print is in Inter (M100 QA)', () => {
  const inter = innerCodePoints(here('./assets/fonts/Inter-500.woff2'));

  it('reads the font right: the letters, the middle dot, the multiplication sign, the arrows up and down and the minus', () => {
    for (const ch of ['A', 'z', '0', '9', '·', '×', '↑', '↓', '−', '–', '—', '’', '…']) expect(inter.has(ch.codePointAt(0)!), ch).toBe(true);
    expect(inter.has('☃'.codePointAt(0)!)).toBe(false);
    for (const w of ['600', '700', '800']) expect(innerCodePoints(here(`./assets/fonts/Inter-${w}.woff2`)).size, w).toBe(inter.size);
  });

  // The latin subset has ↑ and ↓ but no ←, → or ✓: the key labels, the stepped-down note and the tutorial's tick fall back to a system font.
  it.fails('has a glyph for every symbol in the text (input/keyBindings.ts ← →, config/graphics.ts →, ui/coachPanel.ts ✓ are not in the subset)', () => {
    const missing = printedSymbols().filter((s) => !inter.has(s.ch.codePointAt(0)!));
    expect(missing.map((s) => `${s.file}:${s.line} ${s.ch}`)).toEqual([]);
  });
});

describe('the pop-up menu\'s rules (M100 QA)', () => {
  const menu = rulesFor(menuSheet, '.context-menu').join(';');
  const item = rulesFor(menuSheet, '.context-item').join(';');

  it('is fixed in the window above every screen and the top bar, opaque, and sized so a long name or a narrow window cannot push it off', () => {
    expect(menu).toMatch(/position:\s*fixed/);
    const z = Number(/z-index:\s*(\d+)/.exec(menu)![1]);
    const topbar = Number(/z-index:\s*(\d+)/.exec(rulesFor(menuSheet, '.menu-topbar').join(';'))![1]);
    expect(z).toBeGreaterThan(topbar);
    expect(menu).toMatch(/background:\s*var\(--menu-panel\)/);
    expect(menu).toMatch(/max-width:\s*min\(\d+px,\s*calc\(100vw\s*-\s*\d+px\)\)/);
  });

  it('is reached by the stylesheet\'s hidden rule, so hidden hides it despite its display:flex', () => {
    expect(menu).toMatch(/display:\s*flex/);
    expect(menuSheet).toMatch(/\.menus \[hidden\]\s*\{\s*display:\s*none\s*!important/);
  });

  it('has items a pointer and a finger can hit (40 px tall), in Inter, with a focus look as visible as the hover', () => {
    expect(Number(/min-height:\s*(\d+)px/.exec(item)![1])).toBeGreaterThanOrEqual(36);
    expect(item).toMatch(/font:\s*600 var\(--fs-md\)[^;]*var\(--ui-font\)/);
    expect(menuSheet).toMatch(/\.context-item:hover,\s*\.context-item:focus-visible\s*\{[^}]*background:\s*var\(--menu-panel-hi\)/);
    // The shared focus ring (an orange outline) still reaches it; only its offset moves inside the item.
    expect(menuSheet).toMatch(/\.menus :is\([^)]*button[^)]*\):focus-visible/);
  });
});

describe('the small text of M100 reads on the navy (M100 QA)', () => {
  const token = (name: string): string => new RegExp(`${name}:\\s*(#[0-9a-fA-F]{6})`).exec(baseSheet)![1]!;
  const lum = (hex: string): number => {
    const n = parseInt(hex.slice(1), 16);
    const [r, g, b] = [n >> 16, (n >> 8) & 255, n & 255].map((c) => ((c / 255) <= 0.03928 ? c / 255 / 12.92 : (((c / 255) + 0.055) / 1.055) ** 2.4)) as [number, number, number];
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const contrast = (a: string, b: string): number => {
    const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x) as [number, number];
    return (hi + 0.05) / (lo + 0.05);
  };

  it('has the title\'s version, in the faint colour, at 4.5:1 on the title\'s navy', () => {
    expect(rulesFor(menuSheet, '.title-version').join(';')).toMatch(/color:\s*var\(--menu-faint\)/);
    expect(contrast(token('--menu-faint'), token('--menu-bg'))).toBeGreaterThanOrEqual(4.5);
  });

  it('has the spare count in acid, the pop-up\'s text and its title at 4.5:1 on their grounds', () => {
    expect(contrast(token('--menu-acid'), token('--menu-bg'))).toBeGreaterThanOrEqual(4.5);
    expect(contrast(token('--paper'), token('--menu-panel'))).toBeGreaterThanOrEqual(4.5);
    expect(contrast(token('--menu-muted'), token('--menu-panel'))).toBeGreaterThanOrEqual(4.5);
    expect(rulesFor(menuSheet, '.context-menu-title').join(';')).toMatch(/color:\s*var\(--menu-muted\)/);
  });
});
