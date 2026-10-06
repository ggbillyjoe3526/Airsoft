import { describe, expect, it } from 'vitest';
import { SURFACES } from '../config/render';
import { WEATHERING } from '../config/weathering';
import { MAPS, mapData } from '../map/maps';
import { floorStains } from './mapDecals';

/**
 * QA for the floor stains (G6): the placement rules hold on every map the game has, not only Depot's.
 */

const D = SURFACES.decals;
const S = WEATHERING.stains;

describe('floor stains on every map (G6 QA)', () => {
  for (const entry of MAPS) {
    const map = mapData(entry.id);
    const stains = floorStains(map);
    const floors = map.blocks.filter((b) => b.kind === 'floor');

    it(`${entry.label}: every stain lies flat on a floor's top, inside its edge, and under no block`, () => {
      for (const q of stains) {
        const [cx, cy, cz] = q.centre;
        const lo = [cx - q.width / 2, cz - q.height / 2];
        const hi = [cx + q.width / 2, cz + q.height / 2];
        const onFloors = floors.filter(
          (f) =>
            Math.abs(f.center.y + f.size.y / 2 + D.offset - cy) < 1e-9 &&
            lo[0]! >= f.center.x - f.size.x / 2 &&
            hi[0]! <= f.center.x + f.size.x / 2 &&
            lo[1]! >= f.center.z - f.size.z / 2 &&
            hi[1]! <= f.center.z + f.size.z / 2,
        );
        expect(onFloors.length, `${entry.id} stain at ${q.centre.join(', ')} is on no floor`).toBeGreaterThan(0);
        const top = cy - D.offset;
        // Nothing, floor or prop, stands on or over the stain's patch within the clearance (a stain half under a crate is half hidden).
        const over = map.blocks.filter(
          (b) =>
            !onFloors.includes(b) &&
            b.center.x + b.size.x / 2 > lo[0]! &&
            b.center.x - b.size.x / 2 < hi[0]! &&
            b.center.z + b.size.z / 2 > lo[1]! &&
            b.center.z - b.size.z / 2 < hi[1]! &&
            b.center.y + b.size.y / 2 > top + 1e-3 &&
            b.center.y - b.size.y / 2 < top + S.clearance,
        );
        expect(over.map((b) => b.kind), `${entry.id} stain at ${q.centre.join(', ')}`).toEqual([]);
      }
    });

    it(`${entry.label}: no two stains overlap, and the same map always gets the same ones, at any atlas size`, () => {
      for (let i = 0; i < stains.length; i++) {
        for (let j = i + 1; j < stains.length; j++) {
          const [a, b] = [stains[i]!, stains[j]!];
          const apart = Math.abs(a.centre[0] - b.centre[0]) >= (a.width + b.width) / 2 || Math.abs(a.centre[2] - b.centre[2]) >= (a.height + b.height) / 2 || Math.abs(a.centre[1] - b.centre[1]) > 0.5;
          expect(apart, `${entry.id}: stains ${i} and ${j}`).toBe(true);
        }
      }
      expect(floorStains(map)).toEqual(stains);
      // Where they lie does not depend on the atlas' resolution (only which pixels they read does).
      expect(floorStains(map, 512).map((q) => q.centre)).toEqual(stains.map((q) => q.centre));
    });
  }

  it('lays stains on at least Depot (the map with detail), and none off any floor of a map without floors', () => {
    expect(floorStains(mapData('depot')).length).toBeGreaterThan(10);
    const noFloors = { ...mapData('depot'), blocks: mapData('depot').blocks.filter((b) => b.kind !== 'floor') };
    expect(floorStains(noFloors)).toEqual([]);
  });
});
