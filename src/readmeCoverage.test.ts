import { describe, expect, it } from 'vitest';

/**
 * Every source file under src/ is named in its folder's README.md (docs/ARCHITECTURE.md: "a task that adds, renames
 * or moves a file keeps its folder's README current"), or in the nearest README above it for a subfolder without one;
 * the files at src/ itself in docs/ARCHITECTURE.md. A file a README doesn't name is one a session can only find by
 * grepping (DX0). Left out: tests, declaration files, and the balance measures, which their README names as a kind.
 */
const SOURCES = Object.keys(import.meta.glob(['./**/*.ts', '!./**/*.test.ts', '!./**/*.d.ts', '!./ai/balance/*.balance.ts']));
const READMES = import.meta.glob<string>('./**/README.md', { query: '?raw', import: 'default', eager: true });
const ARCHITECTURE = import.meta.glob<string>('../docs/ARCHITECTURE.md', { query: '?raw', import: 'default', eager: true });

/** The README that covers a file: its folder's, else the nearest folder's above it, else docs/ARCHITECTURE.md. */
function readmeFor(file: string): { name: string; text: string } {
  const parts = file.split('/');
  for (let depth = parts.length - 1; depth > 1; depth--) {
    const key = `${parts.slice(0, depth).join('/')}/README.md`;
    const text = READMES[key];
    if (text !== undefined) return { name: key.replace(/^\.\//, 'src/'), text };
  }
  return { name: 'docs/ARCHITECTURE.md', text: Object.values(ARCHITECTURE)[0] ?? '' };
}

describe('every source file is named in its folder README (DX0)', () => {
  it('reads the sources and the READMEs', () => {
    expect(SOURCES.length).toBeGreaterThan(500);
    expect(Object.keys(READMES).length).toBeGreaterThan(15);
    expect(Object.keys(ARCHITECTURE)).toHaveLength(1);
  });

  it('names each one', () => {
    const missing: string[] = [];
    for (const file of SOURCES) {
      const { name, text } = readmeFor(file);
      const base = file.slice(file.lastIndexOf('/') + 1);
      if (!new RegExp(`(^|[^\\w.])${base.replace(/\./g, '\\.')}(?![\\w.])`).test(text)) missing.push(`${file.replace(/^\.\//, 'src/')} (add it to ${name})`);
    }
    expect(missing, 'files no README names').toEqual([]);
  });
});
