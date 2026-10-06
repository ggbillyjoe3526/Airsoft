import { describe, expect, it } from 'vitest';
import { BAKED_LIGHT } from '../../config/bake';
import { bakeHash, bakeInputs } from '../../render/lightBake';
import { decodeProbeFile, fromBase64 } from '../../render/probeGrid';
import { lightingPicked } from '../lightingChoice';
import { MAPS, mapData, registerMaps } from '../maps';
import { DEV_MAP_DATA } from '../devMaps';
import { BAKE_COMMAND, BAKE_FILES, type BakeFileId, bakeFilePath } from './files';

/**
 * The shipped probe files match their maps (G6): a map that opts in to baked light (MapData.bakedLight) and was changed
 * since its file was baked fails here, naming the command that bakes it again. Every map is checked, the dev maps too.
 */

registerMaps(DEV_MAP_DATA);

/** The text's size gzipped (as a server sends it). */
async function gzipSize(text: string): Promise<number> {
  const stream = new Blob([text]).stream().pipeThrough(new CompressionStream('gzip'));
  return (await new Response(stream).arrayBuffer()).byteLength;
}

const baked = MAPS.map((m) => mapData(m.id)).filter((map) => map.bakedLight);

describe('the baked light files (G6)', () => {
  it('Depot opts in; the night maps (Woodland, Neon Heights) opt out, lit by their lamps', () => {
    expect(mapData('depot').bakedLight).toEqual({ file: 'depot' });
    for (const id of ['woodland', 'neonHeights'] as const) {
      const map = mapData(id);
      expect(map.bakedLight, id).toBeUndefined();
      expect(lightingPicked(map), id).toBe('night');
    }
  });

  it('has a file for every map that opts in, and no file no map uses', () => {
    const used = new Set(baked.map((m) => m.bakedLight!.file));
    expect(new Set(Object.keys(BAKE_FILES))).toEqual(used);
  });

  for (const map of baked) {
    const id = map.bakedLight!.file as BakeFileId;
    it(`${map.name}: its file was baked from the map as it is (else run \`${BAKE_COMMAND}\`)`, async () => {
      const text = await BAKE_FILES[id]();
      const grid = decodeProbeFile(fromBase64(text));
      const hint = `${bakeFilePath(id)} is out of date: the map, its tints, the day lighting or the bake changed. Run \`${BAKE_COMMAND}\` and commit the file.`;
      expect(grid.hash, hint).toBe(bakeHash(bakeInputs(map)));
      expect(grid.version, hint).toBe(BAKED_LIGHT.bake.version);
      expect(grid.preset, hint).toBe(BAKED_LIGHT.bake.preset);
      expect(lightingPicked(map)).toBe(grid.preset);
    });

    it(`${map.name}: its file is small (well under 300 KB compressed) and covers the map`, async () => {
      const text = await BAKE_FILES[id]();
      expect(await gzipSize(text)).toBeLessThan(200 * 1024);
      const grid = decodeProbeFile(fromBase64(text));
      expect(grid.spacing).toBeCloseTo(BAKED_LIGHT.bake.probe, 5);
      // Every block's middle is inside the grid.
      const hi = [0, 1, 2].map((a) => grid.origin[a as 0]! + ([grid.nx, grid.ny, grid.nz][a]! - 1) * grid.spacing);
      for (const b of map.blocks) {
        expect(b.center.x).toBeGreaterThanOrEqual(grid.origin[0] - grid.spacing);
        expect(b.center.x).toBeLessThanOrEqual(hi[0]! + grid.spacing);
        expect(b.center.z).toBeGreaterThanOrEqual(grid.origin[2] - grid.spacing);
        expect(b.center.z).toBeLessThanOrEqual(hi[2]! + grid.spacing);
      }
    });
  }

  it('fails when the map changes without a re-bake (the pin works)', () => {
    const depot = mapData('depot');
    const [first, ...rest] = depot.blocks;
    const moved = { ...depot, blocks: [{ ...first!, center: { ...first!.center, x: first!.center.x + 0.5 } }, ...rest] };
    expect(bakeHash(bakeInputs(moved))).not.toBe(bakeHash(bakeInputs(depot)));
  });
});
