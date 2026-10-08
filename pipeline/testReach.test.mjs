import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { ALWAYS_REACHED, SETUP_FILES, importClosure, importsOf, reachNote, resolveImport, slowGuardsReached } from './testReach.mjs';
import { gateCell } from './records.mjs';

/** A small repo: one guard over a support file, which loads the bots, a config and the pool's text; a HUD nobody imports. */
const FILES = {
  'src/ai/depotMatch.test.ts': "import { beforeAll } from 'vitest';\nimport { playMatch } from './depotMatchSupport';\n",
  'src/ai/depotMatchSupport.ts': "import type { BotConfig } from '../config/bots';\nimport { BotController } from './botController.ts';\nexport { HITS } from '../config/hits';\n",
  'src/ai/botController.ts': "import {\n  think, // the bot's turn: don't follow 'quotes' here\n  observe,\n} from './botBrain';\nconst late = () => import('../map/devMaps');\n",
  'src/ai/botBrain.ts': "export const think = 1;\n",
  'src/config/bots.ts': "export interface BotConfig { x: number }\n",
  'src/config/hits.ts': "import poolText from '../../pool.md?raw';\nexport const HITS = poolText;\n",
  'src/map/devMaps.ts': "export const devMaps = [];\n",
  'src/map/index.ts': "export * from './devMaps';\n",
  'src/testSetup.ts': "import './map';\n",
  'src/ui/hud.ts': "import { HITS } from '../config/hits';\n",
  'pool.md': '| pool |',
};
const read = (f) => FILES[f];
const isFile = (f) => f in FILES;
const GUARDS = ['src/ai/depotMatch.test.ts'];

describe('which files the slow bot-match guards load (token plan item 21)', () => {
  it('reads static, type, re-export, side-effect and dynamic imports, and leaves packages out', () => {
    expect(importsOf(FILES['src/ai/depotMatchSupport.ts'])).toEqual(['../config/bots', './botController.ts', '../config/hits']);
    expect(importsOf(FILES['src/ai/botController.ts'])).toEqual(['./botBrain', '../map/devMaps']);
    expect(importsOf(FILES['src/testSetup.ts'])).toEqual(['./map']);
    expect(importsOf("import { describe } from 'vitest';\nimport * as THREE from 'three';")).toEqual([]);
  });

  it('resolves a specifier with or without its extension, a folder by its index, and text by its query-less path', () => {
    expect(resolveImport('src/ai/depotMatchSupport.ts', '../config/bots', isFile)).toBe('src/config/bots.ts');
    expect(resolveImport('src/ai/depotMatchSupport.ts', './botController.ts', isFile)).toBe('src/ai/botController.ts');
    expect(resolveImport('src/testSetup.ts', './map', isFile)).toBe('src/map/index.ts');
    expect(resolveImport('src/config/hits.ts', '../../pool.md?raw', isFile)).toBe('pool.md');
    expect(resolveImport('src/ai/bot.ts', './missing', isFile)).toBeNull();
  });

  it('follows imports through every file a guard loads, and nothing else', () => {
    const closure = importClosure(GUARDS, read, isFile);
    expect([...closure].sort()).toEqual(['pool.md', 'src/ai/botBrain.ts', 'src/ai/botController.ts', 'src/ai/depotMatch.test.ts', 'src/ai/depotMatchSupport.ts', 'src/config/bots.ts', 'src/config/hits.ts', 'src/map/devMaps.ts']);
  });

  it('runs the guards for a change they load, the setup file, or the test run\'s own config', () => {
    const one = slowGuardsReached(['src/ai/botBrain.ts'], GUARDS, read, isFile);
    expect(one).toEqual({ reached: true, by: ['src/ai/botBrain.ts'], count: 1 });
    expect(reachNote(one)).toBe('both projects: src/ai/botBrain.ts reaches the bot-match guards');
    expect(slowGuardsReached(['pool.md', 'docs/TASKS.md'], GUARDS, read, isFile).by).toEqual(['pool.md']);
    expect(slowGuardsReached(['src/map/index.ts'], GUARDS, read, isFile).reached).toBe(true);
    for (const f of ALWAYS_REACHED) expect(slowGuardsReached([f], GUARDS, read, isFile).reached, f).toBe(true);
    expect(slowGuardsReached(['src/ai/depotMatch.test.ts'], GUARDS, read, isFile).reached).toBe(true);
  });

  it('leaves them to CI when the diff loads none of them: a HUD change, docs, a new unit test', () => {
    const reach = slowGuardsReached(['src/ui/hud.ts', 'docs/ROADMAP.md', 'src/ui/hud.test.ts'], GUARDS, read, isFile);
    expect(reach).toEqual({ reached: false, by: [], count: 0 });
    expect(reachNote(reach)).toBe('fast project only: the diff reaches no bot-match guard (CI runs them)');
  });

  it('names at most three reaching files in its note', () => {
    const reach = slowGuardsReached(['src/ai/botBrain.ts', 'src/config/bots.ts', 'src/config/hits.ts', 'pool.md', 'package.json'], GUARDS, read, isFile);
    expect(reach.count).toBe(5);
    expect(reachNote(reach)).toBe('both projects: package.json, pool.md, src/ai/botBrain.ts and 2 more reach the bot-match guards');
  });

  it('marks a tests cell run without the slow project in the task\'s record', () => {
    expect(gateCell({ pass: true, ms: 95_000, projects: 'fast' })).toBe('✓ 95 s (fast)');
    expect(gateCell({ pass: true, ms: 1_300_000, projects: 'all' })).toBe('✓ 1300 s');
  });

  it('knows the setup file vite.config.ts loads before every test', () => {
    const config = readFileSync(new URL('../vite.config.ts', import.meta.url), 'utf8');
    expect(config).toContain(`setupFiles: [${SETUP_FILES.map((f) => `'${f}'`).join(', ')}]`);
  });
});
