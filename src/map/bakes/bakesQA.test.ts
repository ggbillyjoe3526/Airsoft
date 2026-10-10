import { describe, expect, it } from 'vitest';
import { bakeHash, bakeInputs, bakeProbes } from '../../render/lightBake';
import { decodeProbeFile, encodeProbeFile, fromBase64, toBase64 } from '../../render/probeFile';
import { DEPOT } from '../depot';
import type { MapBlock, MapData } from '../mapTypes';
import { BAKE_COMMAND, BAKE_FILES } from './files';

/**
 * QA for the baked light files (G6): the shipped Depot file is exactly what the bake gives today, reads back the same
 * every time, and the hash that pins it notices every input the bake reads.
 */

describe('the shipped Depot probe file (G6 QA)', () => {
  it(`is byte for byte what a fresh bake of Depot writes (else run \`${BAKE_COMMAND}\`): a change to the bake's code, not only to its inputs, is caught`, async () => {
    const shipped = await BAKE_FILES.depot();
    const fresh = toBase64(encodeProbeFile(bakeProbes(bakeInputs(DEPOT))));
    expect(fresh === shipped, `src/map/bakes/depot.probes.b64 is stale: the bake's output changed. Run \`${BAKE_COMMAND}\` and commit the file.`).toBe(true);
  }, 60_000);

  it('decodes the same grid every time and writes back the very same text', async () => {
    const text = await BAKE_FILES.depot();
    const a = decodeProbeFile(fromBase64(text));
    const b = decodeProbeFile(fromBase64(text));
    expect(b).toEqual(a);
    expect(toBase64(encodeProbeFile(a))).toBe(text);
    // Its own header says what it was baked from.
    expect(a.hash).toBe(bakeHash(bakeInputs(DEPOT)));
  });

  it('carries a hash a changed map no longer matches (the pin catches a moved, resized or removed block)', async () => {
    const shipped = decodeProbeFile(fromBase64(await BAKE_FILES.depot()));
    const [first, ...rest] = DEPOT.blocks as MapBlock[];
    const variants: Record<string, MapData> = {
      moved: { ...DEPOT, blocks: [{ ...first!, center: { ...first!.center, z: first!.center.z + 0.5 } }, ...rest] },
      resized: { ...DEPOT, blocks: [{ ...first!, size: { ...first!.size, y: first!.size.y + 0.5 } }, ...rest] },
      removed: { ...DEPOT, blocks: rest },
    };
    for (const [name, map] of Object.entries(variants)) expect(bakeHash(bakeInputs(map)), name).not.toBe(shipped.hash);
  });
});

describe('what the bake hash notices (G6 QA)', () => {
  const base = bakeHash(bakeInputs(DEPOT));
  const ramp = DEPOT.blocks.find((b) => b.kind === 'ramp')!;
  const crate = DEPOT.blocks.find((b) => b.kind === 'crate')!;
  const withBlock = (index: number, change: Partial<MapBlock>): MapData => ({ ...DEPOT, blocks: DEPOT.blocks.map((b, i) => (i === index ? { ...b, ...change } : b)) });
  const index = (b: MapBlock): number => DEPOT.blocks.indexOf(b);

  it('asks for a re-bake when a ramp is turned (its slope decides which voxels are solid)', () => {
    expect(ramp.rise).toBeDefined();
    const turned = ramp.rise === '+x' ? '-x' : '+x';
    expect(bakeHash(bakeInputs(withBlock(index(ramp), { rise: turned })))).not.toBe(base);
  });

  it('asks for a re-bake when a block is repainted or finished differently (its colour is the light it bounces)', () => {
    expect(bakeHash(bakeInputs(withBlock(index(crate), { paint: 0x2040d0 })))).not.toBe(base);
    expect(bakeHash(bakeInputs(withBlock(index(crate), { finish: 'plaster' })))).not.toBe(base);
  });

  it('asks for a re-bake when look-only decor is added (it is drawn, so it throws and bounces light)', () => {
    const decor: MapBlock = { ...crate, center: { ...crate.center, x: crate.center.x + 7 } };
    expect(bakeHash(bakeInputs({ ...DEPOT, decor: [decor] }))).not.toBe(base);
  });

  it('asks for nothing when only what the bake never reads changes (the name, the spawns)', () => {
    expect(bakeHash(bakeInputs({ ...DEPOT, name: 'Renamed' }))).toBe(base);
    expect(bakeHash(bakeInputs({ ...DEPOT, spawns: [[], []] }))).toBe(base);
  });
});
