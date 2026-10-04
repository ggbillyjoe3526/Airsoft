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
}

/** The cells of a `| a | b |` line, trimmed (the outer pipes are optional, as in GitHub's Markdown). */
function cellsOf(line: string): string[] {
  let body = line.trim();
  if (body.startsWith('|')) body = body.slice(1);
  if (body.endsWith('|')) body = body.slice(0, -1);
  return body.split('|').map((c) => c.trim());
}

/** A header's separator line: `|---|:--:|`. */
function isSeparator(line: string): boolean {
  return cellsOf(line).every((c) => /^:?-{3,}:?$/.test(c));
}

/**
 * Every table in `text`, in file order. A table is a header row, a separator row and its body rows, all starting with
 * `|`; any other line ends it. A row with fewer cells than the header leaves the rest empty; extra cells are dropped
 * (pool.ts reports both through the missing or unknown values they cause).
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
      table.rows.push({ cells: row, line: i + 1 });
    } else if (i + 1 < lines.length && lines[i + 1]!.trim().startsWith('|') && isSeparator(lines[i + 1]!)) {
      table = { heading, headers: cellsOf(trimmed), rows: [], line: i + 1 };
      tables.push(table);
      i++; // the separator
    }
  }
  return tables;
}
