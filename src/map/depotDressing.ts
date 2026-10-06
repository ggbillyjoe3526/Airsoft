import type { GlowStrip, MapBlock, MapDressing } from './mapTypes';

/**
 * Depot's set dressing (G8, MapData.dressing; render/mapDressing.ts places it): a worked yard of grey concrete and
 * rubble, junk against the block feet, puddles in the open, a few shipping-line logos, sprays and warning signs, glow
 * strips high on the walls, and an industrial skyline beyond them with two smoking chimneys. World coordinates (the
 * map's, after depot.ts mirrors its plan). Look only: nothing here is read by play.
 */

/** Glow strip colours: lime, teal and magenta (none near a team's blue or orange; mapDressing.test.ts checks). */
const LIME = 0xb8e63a;
const TEAL = 0x2fc9a0;
const MAGENTA = 0xd94fc0;

/** A glow strip on `b`'s face looking along `facing`, `along` the face (world x or z), its middle `y` over the block's foot. */
function strip(b: MapBlock, facing: GlowStrip['facing'], along: number, y: number, colour: number, width = 1.6, height = 0.12): GlowStrip {
  const sx = b.size.x / 2;
  const sz = b.size.z / 2;
  const base = b.center.y - b.size.y / 2;
  const x = facing === '+x' ? b.center.x + sx : facing === '-x' ? b.center.x - sx : along;
  const z = facing === '+z' ? b.center.z + sz : facing === '-z' ? b.center.z - sz : along;
  return { centre: { x, y: base + y, z }, width, height, facing, colour };
}

/** Depot's dressing, its strips placed on its own `blocks` (the perimeter walls, then the two spawn walls). */
export function depotDressing(blocks: readonly MapBlock[]): MapDressing {
  const walls = blocks.filter((b) => b.kind === 'wall');
  const north = walls.reduce((a, b) => (b.center.z < a.center.z ? b : a));
  const south = walls.reduce((a, b) => (b.center.z > a.center.z ? b : a));
  const west = walls.reduce((a, b) => (b.center.x < a.center.x ? b : a));
  const east = walls.reduce((a, b) => (b.center.x > a.center.x ? b : a));
  const spawnWalls = walls.filter((b) => Math.abs(b.size.y - 2.6) < 1e-6);
  const strips: GlowStrip[] = [
    strip(north, '+z', -19, 3.3, TEAL),
    strip(north, '+z', 6, 3.3, LIME, 2.4),
    strip(north, '+z', 21, 3.3, MAGENTA),
    strip(south, '-z', -21, 3.3, LIME),
    strip(south, '-z', 4, 3.3, MAGENTA, 2.4),
    strip(south, '-z', 20, 3.3, TEAL),
    strip(west, '+x', -9, 3.3, MAGENTA),
    strip(west, '+x', 9, 3.3, TEAL),
    strip(east, '-x', -8, 3.3, LIME),
    strip(east, '-x', 8, 3.3, MAGENTA),
    ...spawnWalls.map((b) => strip(b, b.center.x < 0 ? '+x' : '-x', b.center.z, 2.3, TEAL, 2.4, 0.1)),
  ];
  return {
    seed: 4127,
    clutter: { dirt: 0.55, junk: 0.45, litter: 0.3 },
    puddles: [
      { x: -21.5, z: -2.5, width: 2.6, depth: 1.6 },
      { x: -1.5, z: -12, width: 3.0, depth: 1.4 },
      { x: 7.5, z: 0.75, width: 2.2, depth: 1.8 },
      { x: -18, z: 12.5, width: 1.8, depth: 1.2 },
      { x: 10.5, z: 5.5, width: 2.4, depth: 1.5 },
      { x: -14, z: 9, width: 2.0, depth: 1.3 },
      { x: 21.75, z: -11, width: 1.6, depth: 2.4 },
    ],
    marks: { logos: 0.45, walls: 0.2 },
    strips,
    skyline: [
      { kind: 'shed', x: -8, z: -44, width: 26, depth: 14, height: 9 },
      { kind: 'shed', x: 40, z: 31, width: 22, depth: 12, height: 8, turned: true },
      { kind: 'waterTower', x: -46, z: -28, width: 7, depth: 7, height: 22 },
      { kind: 'crane', x: 22, z: -40, width: 24, depth: 9, height: 18 },
      { kind: 'containers', x: -42, z: 10, width: 6.1, depth: 2.5, height: 7.8, turned: true },
      { kind: 'containers', x: -40, z: 22, width: 6.1, depth: 2.5, height: 5.2 },
      { kind: 'containers', x: 46, z: -12, width: 12.2, depth: 2.5, height: 5.2, turned: true },
      { kind: 'chimney', x: 54, z: -34, width: 3, depth: 3, height: 34, smoke: true },
      { kind: 'chimney', x: -30, z: 47, width: 2.6, depth: 2.6, height: 28, smoke: true },
      { kind: 'powerLine', points: [{ x: -62, z: 40 }, { x: -22, z: 42 }, { x: 18, z: 44 }, { x: 58, z: 41 }], height: 14 },
    ],
    motes: { tint: 0xd8d6cf },
    kickedDust: { tint: 0xb9b7b0, scale: 1 },
  };
}
