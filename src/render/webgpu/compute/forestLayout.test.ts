import { describe, expect, it } from 'vitest';
import { GPU_FOREST } from '../../../config/gpuDressing';
import { terrainMaxX, terrainMaxZ } from '../../../map/terrain';
import { WOODLAND } from '../../../map/woodland';
import { skylineClear } from '../../skyline';
import { forestCount, hillHeight, placeForest } from './forestLayout';

/** Where the tree stand-ins beyond the fence stand (W5). */

const t = WOODLAND.terrain!;
const field = { minX: t.minX, maxX: terrainMaxX(t), minZ: t.minZ, maxZ: terrainMaxZ(t) };
const skyline = WOODLAND.dressing!.skyline!;
const trees = WOODLAND.dressing!.forest!.trees;

describe('placeForest', () => {
  const wood = placeForest(trees, field, skyline);

  it("stands Woodland's whole wood (about 2,000) on Ultra, fewer on Medium and High", () => {
    expect(wood).toHaveLength(trees);
    expect(trees).toBeGreaterThanOrEqual(1800);
    expect(forestCount(trees, 'ultra')).toBe(trees);
    expect(forestCount(trees, 'high')).toBeLessThan(trees);
    expect(forestCount(trees, 'medium')).toBeLessThan(forestCount(trees, 'high'));
  });

  it('keeps every stand-in beyond the fence, within its reach, clear of the skyline and apart from the rest', () => {
    const cx = (field.minX + field.maxX) / 2;
    const cz = (field.minZ + field.maxZ) / 2;
    for (const s of wood) {
      expect(Math.max(field.minX - s.x, s.x - field.maxX, field.minZ - s.z, s.z - field.maxZ)).toBeGreaterThanOrEqual(GPU_FOREST.fence);
      expect(Math.hypot(s.x - cx, s.z - cz)).toBeLessThanOrEqual(GPU_FOREST.reach);
      expect(skylineClear(skyline, s.x, s.z)).toBe(true);
      expect(s.height).toBeGreaterThanOrEqual(GPU_FOREST.height[0]);
      expect(s.height).toBeLessThanOrEqual(GPU_FOREST.height[1]);
      expect(s.variant).toBeGreaterThanOrEqual(0);
      expect(s.variant).toBeLessThan(GPU_FOREST.variants);
    }
    let nearest = Infinity;
    for (let i = 0; i < wood.length; i++) for (let j = i + 1; j < wood.length; j++) nearest = Math.min(nearest, Math.hypot(wood[i]!.x - wood[j]!.x, wood[i]!.z - wood[j]!.z));
    expect(nearest).toBeGreaterThanOrEqual(GPU_FOREST.apart);
  });

  it("stands them on the skyline's hills, sunk a little", () => {
    const onHill = wood.filter((s) => hillHeight(skyline, s.x, s.z) > 1);
    expect(onHill.length).toBeGreaterThan(50);
    for (const s of wood) expect(s.y).toBeCloseTo(hillHeight(skyline, s.x, s.z) - GPU_FOREST.sink, 9);
  });

  it('is the same wood every time, a smaller one being the first of the larger (it thins evenly)', () => {
    const fewer = placeForest(forestCount(trees, 'medium'), field, skyline);
    expect(fewer).toEqual(wood.slice(0, fewer.length));
    expect(placeForest(trees, field, skyline)).toEqual(wood);
  });
});
