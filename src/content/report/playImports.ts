// @ts-expect-error the pipeline's plain-JS module has no declarations
import { buildGraph } from '../../../pipeline/cycles.mjs';
import { PLAY_MODULES } from '../../config/contentRules';
import { isPlayModule, type PlayImport } from '../skinCheckSupport';

/**
 * Test-only (Node): the modules that decide play (config/contentRules.ts PLAY_MODULES) and every module they reach by
 * value (pipeline/cycles.mjs buildGraph, the import-cycle check's graph), keeping those that import config/schemes.ts by
 * value, with the names each takes from it. The skin checks' "looks only" proof judges them (skinFit.ts).
 */

const SCHEMES_FILE = 'src/config/schemes.ts';

// Node's fs, without its types.
const nodeFs = 'node:fs';
const fs = (await import(/* @vite-ignore */ nodeFs)) as { readFileSync(path: URL, enc: 'utf8'): string };

/** The names an `import { … } from '…/schemes'` clause in `text` takes by value (type-only names are erased). */
export function schemeNamesIn(text: string): string[] {
  const out: string[] = [];
  for (const m of text.matchAll(/^import\s+(type\s+)?\{([^}]*)\}\s*from\s*['"][^'"]*\/schemes['"]/gm)) {
    if (m[1]) continue;
    for (const raw of m[2]!.split(',')) {
      const name = raw.trim();
      if (name && !name.startsWith('type ')) out.push(name.split(/\s+as\s+/)[0]!.trim());
    }
  }
  return out;
}

/** The play modules' imports of the schemes, read from the source files. */
export function gamePlayImports(roots: readonly string[] = PLAY_MODULES): PlayImport[] {
  const graph = buildGraph() as Map<string, string[]>;
  const reached = new Set<string>([...graph.keys()].filter((f) => isPlayModule(f, roots)));
  const queue = [...reached];
  while (queue.length > 0) {
    for (const next of graph.get(queue.shift()!) ?? []) {
      if (reached.has(next)) continue;
      reached.add(next);
      queue.push(next);
    }
  }
  const root = new URL('../../../', import.meta.url);
  return [...reached]
    .filter((f) => (graph.get(f) ?? []).includes(SCHEMES_FILE))
    .sort()
    .map((file) => {
      const names = schemeNamesIn(fs.readFileSync(new URL(file, root), 'utf8'));
      // Reached some other way (a re-export, a namespace or bare import): everything in it counts as read.
      return { file, names: names.length > 0 ? names : ['*'] };
    });
}
