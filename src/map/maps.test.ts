import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import mapsSource from './maps.ts?raw';

/**
 * The dev maps' data loads on demand (M50, audit CORE-01). Each test gets a fresh copy of map/maps.ts, as the game has
 * at start-up: only Depot's data in, the dev maps' chunk (map/devMaps.ts) not yet fetched. (src/testSetup.ts registers
 * every map in the shared copy for the rest of the suite, so the shared copy can't show this.)
 */
type Maps = typeof import('./maps');
const fresh = async (): Promise<Maps> => import('./maps');

describe('map/maps.ts: the dev maps on demand', () => {
  beforeEach(() => vi.resetModules());
  afterEach(() => vi.restoreAllMocks());
  // The next test files must not see a second copy of the modules.
  afterAll(() => vi.resetModules());

  it('starts with Depot only: a dev map reads as Depot until its data is in', async () => {
    const maps = await fresh();
    const depot = maps.mapData('depot');
    expect(maps.mapLoaded('depot')).toBe(true);
    expect(maps.mapLoaded('woodland')).toBe(false);
    expect(maps.mapLoaded('neonHeights')).toBe(false);
    expect(maps.allMapsLoaded()).toBe(false);
    expect(maps.mapData('woodland')).toBe(depot);
    expect(maps.mapData('neonHeights')).toBe(depot);
    expect(depot.name).toBe('Depot');
  });

  it('loadDevMaps resolves true and then every map reads as itself', async () => {
    const maps = await fresh();
    const depot = maps.mapData('depot');
    await expect(maps.loadDevMaps()).resolves.toBe(true);
    expect(maps.allMapsLoaded()).toBe(true);
    for (const m of maps.MAPS) expect(maps.mapLoaded(m.id)).toBe(true);
    expect(maps.mapData('woodland')).not.toBe(depot);
    expect(maps.mapData('woodland').name).toBe('Woodland');
    expect(maps.mapData('neonHeights').name).toBe('Neon Heights');
    expect(maps.mapData('depot')).toBe(depot);
  });

  it('asks the chunk once however often it is called, and hands every caller the same answer', async () => {
    const maps = await fresh();
    const first = maps.loadDevMaps();
    const second = maps.loadDevMaps();
    expect(second).toBe(first);
    await first;
    expect(maps.loadDevMaps()).toBe(first);
    expect(await Promise.all([first, second, maps.loadDevMaps()])).toEqual([true, true, true]);
  });

  it('registerMaps adds only the maps it is given, and ignores ids that are not maps', async () => {
    const maps = await fresh();
    const woodland = (await import('./woodland')).WOODLAND;
    maps.registerMaps({ woodland, bogus: woodland } as never);
    expect(maps.mapLoaded('woodland')).toBe(true);
    expect(maps.mapLoaded('neonHeights')).toBe(false);
    expect(maps.allMapsLoaded()).toBe(false);
    expect(maps.mapData('woodland')).toBe(woodland);
  });

  it('a map entry no longer carries its data', async () => {
    const maps = await fresh();
    for (const m of maps.MAPS) expect('data' in m).toBe(false);
  });
});

describe('map/maps.ts: the source', () => {
  it('imports the dev maps only dynamically, so the bundler gives them a chunk of their own', () => {
    expect(mapsSource).not.toMatch(/from\s+['"]\.\/woodland['"]/);
    expect(mapsSource).not.toMatch(/from\s+['"]\.\/neonHeights['"]/);
    expect(mapsSource).not.toMatch(/from\s+['"]\.\/devMaps['"]/);
    expect(mapsSource).not.toMatch(/import\s+['"]\.\/(woodland|neonHeights|devMaps)['"]/);
    expect(mapsSource).toContain("import('./devMaps')");
  });
});
