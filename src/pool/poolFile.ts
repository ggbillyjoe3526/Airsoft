/**
 * Reads the tables out of pool.md (M26a): the asset register the owner edits by hand. Pure text in, plain rows out;
 * src/pool/pool.ts turns the rows into assets and economy numbers. Fenced code blocks (the file's examples) are skipped.
 */

/** One table row: each cell by its column's header, trimmed, and the file line it came from (for error messages). */
export interface PoolRow {
  cells: Readonly<Record<string, string>>;
  line: number;
}

/** A table and the heading it sits under (the nearest `#` heading above it). */
export interface PoolTable {
  heading: string;
  headers: readonly string[];
  rows: PoolRow[];
  /** The line of its header row. */
  line: number;
  /** What is wrong with its layout (a column header twice, a row with more cells than the header), by line (audit POOL-18). */
  problems: { line: number; message: string }[];
}

/**
 * The cells of a `| a | b |` line, trimmed (the outer pipes are optional, as in GitHub's Markdown). An escaped `\|`
 * is a pipe inside a cell, as GitHub reads it (audit POOL-18).
 */
function cellsOf(line: string): string[] {
  let body = line.trim();
  if (body.startsWith('|')) body = body.slice(1);
  if (body.endsWith('|') && !body.endsWith('\\|')) body = body.slice(0, -1);
  return body.split(/(?<!\\)\|/).map((c) => c.replace(/\\\|/g, '|').trim());
}

/** A header's separator line: `|---|:--:|`. */
function isSeparator(line: string): boolean {
  return cellsOf(line).every((c) => /^:?-{3,}:?$/.test(c));
}

/**
 * Every table in `text`, in file order. A table is a header row, a separator row and its body rows, all starting with
 * `|`; any other line ends it. A row with fewer cells than the header leaves the rest empty (pool.ts reports the
 * missing values); extra cells are dropped and listed in the table's `problems`, as is a column header used twice.
 */
export function readTables(text: string): PoolTable[] {
  const lines = text.split(/\r?\n/);
  const tables: PoolTable[] = [];
  let heading = '';
  let fenced = false;
  let table: PoolTable | null = null;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    const trimmed = line.trim();
    if (trimmed.startsWith('```')) {
      fenced = !fenced;
      table = null;
      continue;
    }
    if (fenced) continue;
    const head = /^#{1,6}\s+(.*)$/.exec(trimmed);
    if (head) {
      heading = head[1]!.trim();
      table = null;
      continue;
    }
    if (!trimmed.startsWith('|')) {
      table = null;
      continue;
    }
    if (table) {
      const cells = cellsOf(trimmed);
      const row: Record<string, string> = {};
      table.headers.forEach((h, c) => (row[h] = cells[c] ?? ''));
      if (cells.length > table.headers.length) table.problems.push({ line: i + 1, message: `row has ${cells.length} cells, the header ${table.headers.length}` });
      table.rows.push({ cells: row, line: i + 1 });
    } else if (i + 1 < lines.length && lines[i + 1]!.trim().startsWith('|') && isSeparator(lines[i + 1]!)) {
      const headers = cellsOf(trimmed);
      table = { heading, headers, rows: [], line: i + 1, problems: [] };
      for (const [c, h] of headers.entries()) if (headers.indexOf(h) !== c) table.problems.push({ line: i + 1, message: `column "${h}" appears twice` });
      tables.push(table);
      i++; // the separator
    }
  }
  return tables;
}

/**
 * What `t` lacks of the columns `wanted` (M56, audit POOL-07), as its header line's error says it: "missing: When" (with
 * the header as typed when only its case differs: headers are read exactly); null when it has them all.
 */
export function missingColumns(t: PoolTable, wanted: readonly string[]): string | null {
  const missing = wanted.filter((h) => !t.headers.includes(h));
  if (missing.length === 0) return null;
  const named = missing.map((h) => {
    const typed = t.headers.find((x) => x.toLowerCase() === h.toLowerCase());
    return typed === undefined ? h : `${h} (not "${typed}": headers are read exactly)`;
  });
  return `missing: ${named.join(', ')}`;
}
