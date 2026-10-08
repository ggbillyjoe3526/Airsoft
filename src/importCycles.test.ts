import { afterEach, beforeAll, describe, expect, it } from 'vitest';
// @ts-expect-error the pipeline's plain-JS module has no declarations
import { buildGraph, describeCycles, findCycles } from '../pipeline/cycles.mjs';

// The app's tsconfig has no Node types: load Node's modules by a name TypeScript doesn't resolve.
type NodeModules = {
  fs: { mkdirSync(p: string, o: object): void; mkdtempSync(p: string): string; rmSync(p: string, o: object): void; writeFileSync(p: string, t: string): void };
  os: { tmpdir(): string };
  path: { join(...p: string[]): string };
};
let node: NodeModules;
beforeAll(async () => {
  const load = (name: string): Promise<unknown> => import(/* @vite-ignore */ `node:${name}`);
  node = { fs: (await load('fs')) as NodeModules['fs'], os: (await load('os')) as NodeModules['os'], path: (await load('path')) as NodeModules['path'] };
});

/** A tree of source files on disk, as buildGraph reads them. */
function tree(files: Record<string, string>): string {
  const root = node.fs.mkdtempSync(node.path.join(node.os.tmpdir(), 'cycles-'));
  roots.push(root);
  for (const [path, text] of Object.entries(files)) {
    node.fs.mkdirSync(node.path.join(root, path, '..'), { recursive: true });
    node.fs.writeFileSync(node.path.join(root, path), text);
  }
  return root;
}
const roots: string[] = [];
afterEach(() => {
  for (const r of roots.splice(0)) node.fs.rmSync(r, { recursive: true, force: true });
});

describe('the import-cycle check on real files (M79 acceptance 2, CORE-08)', () => {
  it('fails on two files that import each other, through the whole path from disk to report', () => {
    const root = tree({
      'src/a.ts': "import { b } from './b';\nexport const a = b;\n",
      'src/b.ts': "import { a } from './a';\nexport const b = a;\n",
      'src/c.ts': "import { a } from './a';\nexport const c = a;\n",
    });
    expect(describeCycles(findCycles(buildGraph(root)))).toEqual(['src/a.ts <-> src/b.ts']);
  });

  it('fails on a cycle through a re-exporting barrel', () => {
    const root = tree({
      'src/config/index.ts': "export * from './x';\n",
      'src/config/x.ts': "import { y } from '../user';\nexport const x = y;\n",
      'src/user.ts': "import { x } from './config/index';\nexport const y = x;\n",
    });
    expect(findCycles(buildGraph(root))).toHaveLength(1);
  });

  it('passes when the back edge is a type import (erased at build time)', () => {
    const root = tree({
      'src/a.ts': "import { b } from './b';\nexport const a = b;\n",
      'src/b.ts': "import type { a } from './a';\nexport const b = 1;\n",
    });
    expect(findCycles(buildGraph(root))).toEqual([]);
  });
});
