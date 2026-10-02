import { describe, expect, it } from 'vitest';
import { NAV } from '../config/nav';
import { PHYSICS } from '../config/physics';
import { buildNavGrid, floorAt } from '../nav/navGrid';
import { DEPOT } from './depot';
import type { MapData } from './mapTypes';
import { RAMP_YARD } from './testYard';

/** How far a map's points may sit from the nav floor under them. */
const ON_FLOOR = 0.05;

describe.each([DEPOT, RAMP_YARD])('$name map data', (map: MapData) => {
  it('puts every spawn, dead-zone spot, lane point and flag spot on the floor under it', () => {
    const nav = buildNavGrid(map, NAV);
    const points = [
      ...map.spawns.flat().map((s) => ['spawn', s.position] as const),
      ...map.deadZones.flat().map((s) => ['dead-zone spot', s.position] as const),
      ...map.lanes.flat().map((p) => ['lane point', p] as const),
      ...(map.flags ?? []).map((p) => ['flag', p] as const),
    ];
    expect(points.length).toBeGreaterThan(0);
    for (const [what, p] of points) {
      const floor = floorAt(nav, p.x, p.z);
      expect(Math.abs(p.y - floor), `${what} at ${p.x}, ${p.y}, ${p.z} (floor ${floor})`).toBeLessThanOrEqual(ON_FLOOR);
    }
  });

  it(`keeps every ramp at 1:${1 / PHYSICS.maxRampSlope} or gentler`, () => {
    for (const b of map.blocks) {
      if (b.kind !== 'ramp') continue;
      const run = b.rise === '+x' || b.rise === '-x' ? b.size.x : b.size.z;
      expect(b.size.y / run, `ramp at ${b.center.x}, ${b.center.z}`).toBeLessThanOrEqual(PHYSICS.maxRampSlope);
    }
  });
});
