import { describe, expect, it } from 'vitest';
import { NAV } from '../config/nav';
import { PHYSICS } from '../config/physics';
import { buildNavGrid, floorAt } from '../nav/navGrid';
import { DEPOT } from './depot';
import { MAPS, mapData } from './maps';
import { NEON_HEIGHTS } from './neonHeights';
import type { MapBlock, MapData } from './mapTypes';
import { RANGE_MAP } from './range';
import { RAMP_YARD, STACK_HOUSE, TEST_YARD } from './testYard';

/** How far a map's points may sit from the nav floor under them. */
const ON_FLOOR = 0.05;

describe.each([DEPOT, NEON_HEIGHTS, RAMP_YARD, STACK_HOUSE])('$name map data', (map: MapData) => {
  it('puts every spawn, dead-zone spot, lane point and flag spot on the floor under it', () => {
    const nav = buildNavGrid(map, NAV);
    const points = [
      ...map.spawns.flat().map((s) => ['spawn', s.position] as const),
      ...map.deadZones.flat().map((s) => ['dead-zone spot', s.position] as const),
      ...map.lanes.flat().map((p) => ['lane point', p] as const),
      ...(map.flag ? [['flag', map.flag] as const] : []),
    ];
    expect(points.length).toBeGreaterThan(0);
    for (const [what, p] of points) {
      const floor = floorAt(nav, p.x, p.y, p.z);
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

/**
 * How far two blocks may run into each other (m): floors drawn edge to edge are grown a centimetre a side to meet
 * (Neon Heights' SEAM), so neighbouring floors and a door's sill overlap by up to 2 cm. More is a block inside another.
 */
const SEAM_SLACK = 0.025;
const AXES = ['x', 'y', 'z'] as const;
const lo = (b: MapBlock, a: (typeof AXES)[number]): number => b.center[a] - b.size[a] / 2;
const hi = (b: MapBlock, a: (typeof AXES)[number]): number => b.center[a] + b.size[a] / 2;
const overlap = (a: MapBlock, b: MapBlock, axis: (typeof AXES)[number]): number => Math.min(hi(a, axis), hi(b, axis)) - Math.max(lo(a, axis), lo(b, axis));
const where = (b: MapBlock): string => `${b.kind} at ${b.center.x.toFixed(2)}, ${b.center.y.toFixed(2)}, ${b.center.z.toFixed(2)}`;

/**
 * The pairs of blocks that fill the same space (overlapping by more than SEAM_SLACK every way), as text: two colliders
 * where one would do, a BB's material a toss-up where their faces meet, and faces drawn in one place (they flicker).
 */
function blockClashes(blocks: readonly MapBlock[]): string[] {
  const out: string[] = [];
  for (let i = 0; i < blocks.length; i++) {
    for (let j = i + 1; j < blocks.length; j++) {
      const a = blocks[i]!;
      const b = blocks[j]!;
      if (AXES.every((axis) => overlap(a, b, axis) > SEAM_SLACK)) out.push(`${where(a)} and ${where(b)} fill the same space`);
    }
  }
  return out;
}

/**
 * Clashes left in on purpose, by map. Neon Heights' Plaza stair runs on 0.6 m under its landing's floor, which leaves a
 * 0.3 m lip at the landing's edge (the bots' grid has no way up that stair there); taking the floor off the stair's top
 * makes it a way up for the bots too, which changes how the map plays, so it waits for its own change (M55). Two walls
 * rise through a floor's edge: the Plaza stair's side wall, 1.2 m over the landing, and the grand stair's top balustrade,
 * 1 m over Level 1 (each floor runs 0.15 to 0.3 m into it, out of sight). Cut, the wall's part over the floor would stand
 * on it as new cover and roof the stair beside it at night; cut round it, the floor changes the bots' nav grid.
 */
const KNOWN_CLASHES: Readonly<Record<string, readonly string[]>> = {
  'Neon Heights': [
    'ramp at -13.90, 1.50, 9.00 and floor at -13.30, 2.85, 5.10 fill the same space',
    'wall at -13.05, 2.10, 9.00 and floor at -13.30, 2.85, 5.10 fill the same space',
    'floor at 9.50, 2.85, 5.35 and barrier at 11.30, 2.00, 7.63 fill the same space',
    'floor at 12.15, 2.85, -1.50 and barrier at 11.30, 2.00, 7.63 fill the same space',
  ],
};

describe('every map’s blocks (M55, audit SIM-04, SIM-05)', () => {
  const maps: { name: string; map: () => MapData }[] = [
    ...MAPS.map((m) => ({ name: m.label, map: () => mapData(m.id) })),
    ...[TEST_YARD, RAMP_YARD, STACK_HOUSE, RANGE_MAP].map((m) => ({ name: m.name, map: () => m })),
  ];
  it.each(maps)('$name: no block stands inside another', ({ name, map }) => {
    expect(blockClashes(map().blocks)).toEqual(KNOWN_CLASHES[name] ?? []);
  });

  it('finds a block inside another: the check is not blind', () => {
    const box = (kind: MapBlock['kind'], x: number, y: number, w: number): MapBlock => ({ kind, center: { x, y, z: 0 }, size: { x: w, y: 2, z: w } });
    expect(blockClashes([box('wall', 0, 1, 1), box('crate', 0.3, 1, 1)])).toHaveLength(1);
    // Flush in a corner, sharing two faces' planes: still inside.
    expect(blockClashes([box('wall', 0, 1, 1), box('crate', 0.25, 1, 0.5)])).toHaveLength(1);
    // Side by side with a seam's overlap, or one standing on the other: fine.
    expect(blockClashes([box('wall', 0, 1, 1), box('wall', 1 - SEAM_SLACK / 2, 1, 1)])).toEqual([]);
    expect(blockClashes([box('wall', 0, 1, 1), box('crate', 0, 3, 1)])).toEqual([]);
  });
});
