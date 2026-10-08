import { describe, expect, it } from 'vitest';
import { length3 } from './vec';

describe('length3 (M77 acceptance 1)', () => {
  it('matches Math.hypot to a few ulps on ordinary values, zero and negatives', () => {
    const cases: Array<[number, number, number]> = [
      [0, 0, 0],
      [3, 4, 0],
      [-3, -4, 12],
      [1, 1, 1],
      [0.001, -0.002, 0.003],
      [-87.5, 12.25, -0.5],
      [1234.5, -678.9, 42],
      [0, -2, 0],
    ];
    for (const [x, y, z] of cases) {
      const want = Math.hypot(x, y, z);
      expect(Math.abs(length3(x, y, z) - want), `${x},${y},${z}`).toBeLessThanOrEqual(want * 4 * Number.EPSILON);
    }
    expect(length3(0, 0, 0)).toBe(0);
    expect(length3(-3, 0, 4)).toBe(5);
  });
});

/** The text of `text` with comments blanked, so only code is scanned. */
function code(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//g, (m: string) => m.replace(/[^\n]/g, ' ')).replace(/\/\/[^\n]*/g, (m: string) => ' '.repeat(m.length));
}

/** The argument count of every `Math.hypot(...)` call in `text` (top-level commas in balanced parentheses). */
function hypotArities(text: string): number[] {
  const out: number[] = [];
  const re = /Math\.hypot\s*\(/g;
  for (let m = re.exec(text); m; m = re.exec(text)) {
    let depth = 1;
    let commas = 0;
    let nonEmpty = false;
    for (let i = re.lastIndex; i < text.length && depth > 0; i++) {
      const ch = text[i]!;
      if (ch === '(' || ch === '[' || ch === '{') depth++;
      else if (ch === ')' || ch === ']' || ch === '}') depth--;
      else if (ch === ',' && depth === 1) commas++;
      if (depth > 0 && !/\s/.test(ch)) nonEmpty = true;
    }
    out.push(nonEmpty ? commas + 1 : 0);
  }
  return out;
}

/** The per-BB, per-ray and per-frame files M77 moved to length3 (from its diff against 9ebe034), by path under src/. */
const HOT_FILES = [
  'ai/angles',
  'ai/botCombat',
  'ai/botController',
  'ai/perception',
  'map/foliage',
  'map/torchLight',
  'render/bbRenderer',
  'render/characterRenderer',
  'render/combatPresentation',
  'render/dressingEffects',
  'render/dustMotes',
  'render/impactGrit',
  'render/impactPuffs',
  'render/flagRenderer',
  'sim/bbs',
  'sim/levelRay',
  'sim/ricochet',
  'sim/soundPath',
];
const sources = import.meta.glob<string>(
  [
    '../ai/angles.ts',
    '../ai/botCombat.ts',
    '../ai/botController.ts',
    '../ai/perception.ts',
    '../map/foliage.ts',
    '../map/torchLight.ts',
    '../render/bbRenderer.ts',
    '../render/characterRenderer.ts',
    '../render/combatPresentation.ts',
    '../render/dressingEffects.ts',
    '../render/dustMotes.ts',
    '../render/impactGrit.ts',
    '../render/impactPuffs.ts',
    '../render/flagRenderer.ts',
    './bbs.ts',
    './levelRay.ts',
    './ricochet.ts',
    './soundPath.ts',
  ],
  { query: '?raw', import: 'default', eager: true },
);

describe('no three-argument Math.hypot in the hot paths (M77 acceptance 1)', () => {
  it('the scanner counts arguments (a guard that fails on one)', () => {
    expect(hypotArities('Math.hypot(a, b, c)')).toEqual([3]);
    expect(hypotArities('Math.hypot(f(a, b), c)')).toEqual([2]);
    expect(hypotArities('Math.hypot(\n x - y,\n z - w,\n q)')).toEqual([3]);
    expect(hypotArities('// Math.hypot(a,b,c)')).toEqual([3]); // raw text; code() blanks comments
    expect(hypotArities(code('// Math.hypot(a,b,c)\n/* Math.hypot(1,2,3) */'))).toEqual([]);
  });

  it('reads all the files', () => {
    expect(Object.keys(sources).length).toBe(HOT_FILES.length);
  });

  for (const file of HOT_FILES) {
    it(`${file} has no Math.hypot with three arguments`, () => {
      const text = sources[file.startsWith('sim/') ? `./${file.slice(4)}.ts` : `../${file}.ts`];
      expect(text, file).toBeTypeOf('string');
      expect(hypotArities(code(text!)).filter((n) => n >= 3)).toEqual([]);
    });
  }
});
