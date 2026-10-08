/**
 * Import cycles among the modules under `src/` (audit CORE-08, M79): files that import each other, directly or through
 * others, so which one loads first decides what the others see. `node pipeline/cycles.mjs` lists them and exits 1 if
 * there are any; `cycles.test.mjs` runs the same check in the fast suite.
 *
 * An edge is a value import: `import … from './x'`, `import './x'`, `export … from './x'` and `export * from './x'`
 * (the re-exporting config files). `import type` and `export type` are erased at build time, so they are no edge, and
 * neither is a dynamic `import('./x')` (loaded later, on demand). Test files and `.d.ts` files are not modules of the
 * game and are left out. Pure functions (`findCycles`, `importsIn`) plus one that reads the files (`buildGraph`).
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, posix, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

/**
 * `import … from '…'`, `export … from '…'` (the clause may run over several lines; it holds no quote or semicolon) and
 * the bare `import '…'`, at the start of a line. Capture 1: the clause, 2: the specifier of a `from`, 3: of a bare import.
 */
const STATEMENT = /^(?:(?:import|export)\b([^'";]*?)\bfrom\s*['"](\.{1,2}\/[^'"]*)['"]|import\s*['"](\.{1,2}\/[^'"]*)['"])/gm;

/** The relative specifiers `text` brings in by value, as written. Comments are not stripped (a line starting `import`/`export` inside one is the only thing that could fool it, and none does). */
export function importsIn(text) {
  const out = [];
  for (const m of text.matchAll(STATEMENT)) {
    if (m[3] !== undefined) out.push(m[3]);
    else if (!/^\s*type\b/.test(m[1])) out.push(m[2]);
  }
  return out;
}

/** The module `spec` (written in `from`, a path under the root) names among `known`: `x.ts`, or `x/index.ts`. */
export function resolveSpecifier(from, spec, known) {
  const base = posix.join(posix.dirname(from), spec);
  for (const candidate of [base, `${base}.ts`, `${base}/index.ts`]) if (known.has(candidate)) return candidate;
  return null;
}

/**
 * The cycles in `graph` (a Map from a file to the files it imports): each as the sorted list of files that import one
 * another (a strongly connected set, Tarjan), plus a file that imports itself. Empty when there are none.
 */
export function findCycles(graph) {
  const index = new Map();
  const low = new Map();
  const onStack = new Set();
  const stack = [];
  const cycles = [];
  let next = 0;
  const visit = (v) => {
    index.set(v, next);
    low.set(v, next);
    next++;
    stack.push(v);
    onStack.add(v);
    for (const w of graph.get(v) ?? []) {
      if (!graph.has(w)) continue;
      if (!index.has(w)) {
        visit(w);
        low.set(v, Math.min(low.get(v), low.get(w)));
      } else if (onStack.has(w)) low.set(v, Math.min(low.get(v), index.get(w)));
    }
    if (low.get(v) !== index.get(v)) return;
    const group = [];
    let w;
    do {
      w = stack.pop();
      onStack.delete(w);
      group.push(w);
    } while (w !== v);
    if (group.length > 1 || (graph.get(v) ?? []).includes(v)) cycles.push(group.sort());
  };
  for (const v of graph.keys()) if (!index.has(v)) visit(v);
  return cycles.sort((a, b) => a[0].localeCompare(b[0]));
}

/** Every module file under `dir`, as paths relative to `root` with forward slashes. */
function moduleFiles(root, dir) {
  const out = [];
  for (const name of readdirSync(join(root, dir))) {
    const rel = posix.join(dir, name);
    if (statSync(join(root, rel)).isDirectory()) out.push(...moduleFiles(root, rel));
    else if (name.endsWith('.ts') && !name.endsWith('.test.ts') && !name.endsWith('.d.ts')) out.push(rel);
  }
  return out;
}

/** The import graph of the modules under `<root>/<dir>` (default `src`): each file to the files it imports by value. */
export function buildGraph(root = ROOT, dir = 'src') {
  const files = moduleFiles(root, dir);
  const known = new Set(files);
  const graph = new Map();
  for (const file of files) {
    const edges = new Set();
    for (const spec of importsIn(readFileSync(join(root, file), 'utf8'))) {
      const target = resolveSpecifier(file, spec, known);
      if (target) edges.add(target);
    }
    graph.set(file, [...edges].sort());
  }
  return graph;
}

/** One line per cycle, for the log: `src/a.ts <-> src/b.ts`. */
export function describeCycles(cycles) {
  return cycles.map((c) => c.join(' <-> '));
}

if (process.argv[1] && existsSync(process.argv[1]) && relative(process.argv[1], fileURLToPath(import.meta.url)) === '') {
  const graph = buildGraph();
  const cycles = findCycles(graph);
  console.log(`${graph.size} modules, ${cycles.length} import ${cycles.length === 1 ? 'cycle' : 'cycles'}`);
  for (const line of describeCycles(cycles)) console.log(`  ${line}`);
  process.exit(cycles.length ? 1 : 0);
}
