import { describe, expect, it } from 'vitest';
import { MAPS, mapData } from './maps';
import { AREA_NAME_MAX_LENGTH, areaAt } from './areas';
import type { MapArea } from './mapTypes';

/** CL1 criterion 1: areaAt's rules, and the shipped maps' names. */
describe('areaAt', () => {
  const areas: MapArea[] = [
    { name: 'Dock', box: [0, 10, 0, 10] },
    { name: 'Yard', box: [-20, 20, -20, 20] },
    { name: 'Roof', box: [30, 40, 0, 10], floor: [3, 6] },
  ];

  it('the first area that holds the point wins, though a later one holds it too', () => {
    expect(areaAt(areas, 5, 0, 5)).toBe('Dock');
    expect(areaAt([...areas].reverse(), 5, 0, 5)).toBe('Yard');
    expect(areaAt(areas, 15, 0, 5)).toBe('Yard');
  });

  it('a box holds from its low edge to just short of its high edge, on both axes', () => {
    expect(areaAt(areas, 0, 0, 0)).toBe('Dock');
    expect(areaAt(areas, 10, 0, 5)).toBe('Yard');
    expect(areaAt(areas, 5, 0, 10)).toBe('Yard');
  });

  it('a floor band is [from, to): feet at from are in, at to are out, and a box without a band takes any height', () => {
    expect(areaAt(areas, 35, 3, 5)).toBe('Roof');
    expect(areaAt(areas, 35, 5.99, 5)).toBe('Roof');
    expect(areaAt(areas, 35, 6, 5)).toBe('');
    expect(areaAt(areas, 35, 2.99, 5)).toBe('');
    expect(areaAt(areas, 5, 100, 5)).toBe('Dock');
  });

  it('is empty outside every area, and with no areas at all', () => {
    expect(areaAt(areas, 50, 0, 50)).toBe('');
    expect(areaAt([], 0, 0, 0)).toBe('');
  });
});

describe('the shipped maps name their ground', () => {
  it.each(MAPS.filter((m) => ['depot', 'woodland', 'neon'].some((id) => m.id.startsWith(id))))('$label has areas, each name a short one', (entry) => {
    const areas = mapData(entry.id).areas ?? [];
    expect(areas.length).toBeGreaterThan(1);
    for (const a of areas) {
      expect(a.name.trim(), entry.id).not.toBe('');
      expect(a.name.length, a.name).toBeLessThanOrEqual(AREA_NAME_MAX_LENGTH);
    }
  });
});
