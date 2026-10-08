import { describe, expect, it } from 'vitest';
import { buildGraph, describeCycles, findCycles, importsIn, resolveSpecifier } from './cycles.mjs';

describe('findCycles', () => {
  it('reports a cycle in a small synthetic graph (so the check can fail), and only the files in it', () => {
    const graph = new Map([
      ['src/a.ts', ['src/b.ts']],
      ['src/b.ts', ['src/c.ts', 'src/leaf.ts']],
      ['src/c.ts', ['src/a.ts']],
      ['src/leaf.ts', []],
      ['src/top.ts', ['src/a.ts']],
    ]);
    const cycles = findCycles(graph);
    expect(cycles).toEqual([['src/a.ts', 'src/b.ts', 'src/c.ts']]);
    expect(describeCycles(cycles)).toEqual(['src/a.ts <-> src/b.ts <-> src/c.ts']);
  });

  it('reports two files importing each other, and a file importing itself', () => {
    const graph = new Map([
      ['src/x.ts', ['src/y.ts']],
      ['src/y.ts', ['src/x.ts']],
      ['src/self.ts', ['src/self.ts']],
    ]);
    expect(findCycles(graph)).toEqual([['src/self.ts'], ['src/x.ts', 'src/y.ts']]);
  });

  it('finds none in a graph with shared dependencies but no loop', () => {
    const graph = new Map([
      ['src/a.ts', ['src/b.ts', 'src/c.ts']],
      ['src/b.ts', ['src/d.ts']],
      ['src/c.ts', ['src/d.ts']],
      ['src/d.ts', []],
    ]);
    expect(findCycles(graph)).toEqual([]);
  });
});

describe('importsIn', () => {
  it('follows value imports, bare imports and re-exports, over several lines', () => {
    const text = [
      "import { a } from './a';",
      "import b, { type B } from '../b';",
      'import {',
      '  c, // the one that matters',
      '  d,',
      "} from './c';",
      "import './effects';",
      "export { e } from './e';",
      "export * from './f';",
      "export * as g from './g';",
    ].join('\n');
    expect(importsIn(text)).toEqual(['./a', '../b', './c', './effects', './e', './f', './g']);
  });

  it('leaves out type-only imports and exports, dynamic imports, packages and the text of a comment', () => {
    const text = [
      "import type { T } from './types';",
      "import type X from './x';",
      "export type { U } from './u';",
      "export type * from './v';",
      "import * as THREE from 'three';",
      "const late = () => import('./lazy');",
      " * import { z } from './in-a-comment';",
      "export const plain = 1;",
    ].join('\n');
    expect(importsIn(text)).toEqual([]);
  });
});

describe('resolveSpecifier', () => {
  it('finds x.ts, then x/index.ts, relative to the importing file', () => {
    const known = new Set(['src/config/render.ts', 'src/map/index.ts', 'src/map/devMaps.ts']);
    expect(resolveSpecifier('src/game.ts', './config/render', known)).toBe('src/config/render.ts');
    expect(resolveSpecifier('src/game.ts', './map', known)).toBe('src/map/index.ts');
    expect(resolveSpecifier('src/map/index.ts', './devMaps', known)).toBe('src/map/devMaps.ts');
    expect(resolveSpecifier('src/ai/bot.ts', '../map/devMaps', known)).toBe('src/map/devMaps.ts');
    expect(resolveSpecifier('src/game.ts', './missing', known)).toBeNull();
  });
});

describe('src/', () => {
  it('has no import cycles (CORE-08)', () => {
    const graph = buildGraph();
    expect(graph.size).toBeGreaterThan(200);
    // The re-exports are followed: config/render.ts is a barrel over other config files.
    expect(graph.get('src/config/render.ts')?.length ?? 0).toBeGreaterThan(1);
    expect(describeCycles(findCycles(graph))).toEqual([]);
  });
});
