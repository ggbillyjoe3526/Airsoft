/**
 * Whether a diff reaches the headless bot-match guards (vitest project `slow`), so the local gate runs them only when
 * they can say something new (token plan item 21). CI always runs them all.
 *
 * A diff reaches them when it changes a file they load: a guard file itself, anything it imports, directly or through
 * other files (static `import` and `export … from`, dynamic `import('…')`, `?raw` text such as `pool.md` and
 * `stats.md`), the test setup file, or the files that configure the test run itself (ALWAYS_REACHED). Bare package
 * imports (three, Rapier) are left out: a package changes only with package.json and the lockfile, which are in
 * ALWAYS_REACHED. Pure functions here, so the rules are unit-tested (testReach.test.mjs); gate.mjs reads the files.
 */
import { posix } from 'node:path';

/** Changing any of these can change every test, so they always reach the guards. */
export const ALWAYS_REACHED = ['package.json', 'package-lock.json', 'vite.config.ts', 'tsconfig.json'];
/** vite.config.ts › test.setupFiles: loaded before every test file without an import (testReach.test.mjs pins it). */
export const SETUP_FILES = ['src/testSetup.ts'];
/** What a module may be written as, tried in this order for an import without an extension. */
const RESOLVE_SUFFIXES = ['', '.ts', '.mjs', '.js', '/index.ts'];
/** Modules whose imports are followed; anything else (Markdown, base64 text, JSON) is a leaf. */
const MODULE = /\.(ts|mjs|js)$/;
/**
 * Every relative module specifier in `text`: `import … from '…'`, `export … from '…'`, `import '…'` and
 * `import('…')`. Comments are not stripped: a commented-out import only adds a file, never hides one.
 */
const SPECIFIER = /\b(?:import|export)\s+(?:type\s+)?(?:[^;]*?\bfrom\s+)?['"](\.{1,2}\/[^'"]+)['"]|\bimport\(\s*['"](\.{1,2}\/[^'"]+)['"]\s*\)/g;

/** The relative specifiers `text` imports from, as written (query strings such as `?raw` kept). */
export function importsOf(text) {
  const out = [];
  for (const m of text.matchAll(SPECIFIER)) out.push(m[1] ?? m[2]);
  return out;
}

/**
 * The repo-relative file `spec` names when imported from `from`, or null when no such file exists. `isFile(path)` says
 * whether a repo-relative path is a file.
 */
export function resolveImport(from, spec, isFile) {
  const base = posix.normalize(posix.join(posix.dirname(from), spec.replace(/[?#].*$/, '')));
  for (const suffix of RESOLVE_SUFFIXES) if (isFile(base + suffix)) return base + suffix;
  return null;
}

/**
 * Every repo-relative file `entries` load, themselves included. `read(path)` returns a module's text, `isFile(path)`
 * whether a path is a file.
 */
export function importClosure(entries, read, isFile) {
  const seen = new Set();
  const stack = [...entries];
  while (stack.length > 0) {
    const file = stack.pop();
    if (seen.has(file)) continue;
    seen.add(file);
    if (!MODULE.test(file)) continue;
    for (const spec of importsOf(read(file))) {
      const target = resolveImport(file, spec, isFile);
      if (target !== null && !seen.has(target)) stack.push(target);
    }
  }
  return seen;
}

/**
 * Whether `changed` (repo-relative paths) reaches the guards whose files are `guardFiles`: `{ reached, by }`, `by`
 * the changed files that reach them, at most `limit` of them, for the gate's line.
 */
export function slowGuardsReached(changed, guardFiles, read, isFile, limit = 3) {
  const closure = importClosure([...guardFiles, ...SETUP_FILES], read, isFile);
  const by = [...changed].filter((f) => ALWAYS_REACHED.includes(f) || closure.has(f)).sort();
  return { reached: by.length > 0, by: by.slice(0, limit), count: by.length };
}

/** The gate's note on the tests gate for `reach`: what ran, and why. */
export function reachNote(reach) {
  if (!reach.reached) return 'fast project only: the diff reaches no bot-match guard (CI runs them)';
  const more = reach.count > reach.by.length ? ` and ${reach.count - reach.by.length} more` : '';
  return `both projects: ${reach.by.join(', ')}${more} ${reach.count === 1 ? 'reaches' : 'reach'} the bot-match guards`;
}
