import { afterEach, describe, expect, it, vi } from 'vitest';
import botKitsText from '../../data/bot-kits.md?raw';
import botsText from '../../data/bots.md?raw';
import calloutsText from '../../data/callouts.md?raw';
import levelsText from '../../data/levels.md?raw';
import poolText from '../../data/pool.md?raw';
import statsText from '../../data/stats.md?raw';
import { DEV_DEFAULTS } from './dev';
import { DATA_TABLES, DATA_TABLES_TEXT, dataTableLines } from './dataTables';
import { FakeElement, findAll } from '../ui/testSupport';

/**
 * DX7 (audit B6): a malformed row in any of the six data/ tables shows in Settings → Dev (the Data tables row) and in
 * the console, not the console alone.
 */

/** The shipped text with one row of its first table given a cell too many (the shared reader lists it by line). */
function extraCell(text: string): { text: string; line: number } {
  const lines = text.split('\n');
  const sep = lines.findIndex((l) => /^\s*\|[\s:|-]+\|\s*$/.test(l) && l.includes('-'));
  lines[sep + 1] = `${lines[sep + 1]!.trimEnd()} stray |`;
  return { text: lines.join('\n'), line: sep + 2 };
}

/** stats.md: its first number made a word (the stats reader checks each number's range). */
function badNumber(text: string): { text: string; line: number } {
  const lines = text.split('\n');
  const sep = lines.findIndex((l) => /^\s*\|[\s:|-]+\|\s*$/.test(l) && l.includes('-'));
  const cells = lines[sep + 1]!.split('|');
  const n = cells.findIndex((c, i) => i > 1 && /^\s*-?\d/.test(c));
  cells[n] = ' lots ';
  lines[sep + 1] = cells.join('|');
  return { text: lines.join('\n'), line: sep + 2 };
}

const CASES = [
  { file: 'pool.md', path: '../../data/pool.md?raw', bad: () => extraCell(poolText) },
  { file: 'stats.md', path: '../../data/stats.md?raw', bad: () => badNumber(statsText) },
  { file: 'levels.md', path: '../../data/levels.md?raw', bad: () => extraCell(levelsText) },
  { file: 'bots.md', path: '../../data/bots.md?raw', bad: () => extraCell(botsText) },
  { file: 'bot-kits.md', path: '../../data/bot-kits.md?raw', bad: () => extraCell(botKitsText) },
  { file: 'callouts.md', path: '../../data/callouts.md?raw', bad: () => extraCell(calloutsText) },
] as const;

describe('the data/ tables in the Dev tab (DX7, audit B6)', () => {
  afterEach(() => {
    for (const c of CASES) vi.doUnmock(c.path);
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    vi.resetModules();
  });

  it('names all six, and says they read cleanly as shipped', () => {
    expect(DATA_TABLES.map((t) => t.file)).toEqual(CASES.map((c) => c.file));
    expect(dataTableLines(DATA_TABLES)).toEqual([DATA_TABLES_TEXT.clean(6)]);
  });

  it.each(CASES)('a malformed row in $file shows in the Dev tab and the console, by its line', async ({ file, path, bad }) => {
    const { text, line } = bad();
    vi.resetModules();
    vi.doMock(path, () => ({ default: text }));
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.stubGlobal('document', { createElement: (tag: string) => new FakeElement(tag) });
    const { devSettings } = await import('../ui/devSettings');
    const rows = devSettings({ initial: { ...DEV_DEFAULTS }, onChange: () => {} }) as unknown as FakeElement[];
    const row = rows.find((r) => findAll(r, 'menu-row-label').some((s) => s.textContent === DATA_TABLES_TEXT.label))!;
    const shown = findAll(row, 'data-tables-line').map((p) => p.textContent);
    // The readers word a line two ways: "pool.md: line 12: …" and "bots.md:12: …".
    const at = new RegExp(`^${file.replace('.', '\\.')}:( line )?${line}: `);
    expect(shown.filter((s) => at.test(s)), shown.join('\n')).toHaveLength(1);
    expect(warn.mock.calls.some(([m]) => String(m).startsWith(`${file}:`) && new RegExp(`(line |:)${line}: `).test(String(m)))).toBe(true);
  });

  it('lists at most `shown` lines, then how many more', () => {
    const errors = Array.from({ length: DATA_TABLES_TEXT.shown + 3 }, (_, i) => `line ${i + 1}: bad`);
    const lines = dataTableLines([{ file: 'pool.md', errors }]);
    expect(lines).toHaveLength(DATA_TABLES_TEXT.shown + 1);
    expect(lines[0]).toBe('pool.md: line 1: bad');
    expect(lines.at(-1)).toBe(DATA_TABLES_TEXT.more(3));
  });
});
