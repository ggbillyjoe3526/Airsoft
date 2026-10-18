import { RANGE, RANGE_VISUALS } from '../config/range';
import { VAULT_WALL_HEIGHT, VAULT_WALL_MAX_DEPTH } from '../config/vault';
import { vec3 } from '../sim/vec';
import type { GlowStrip, MapBlock, MapDressing } from './mapTypes';

/**
 * The practice range in the new look (M81, playtest note 9), dressed in the art direction Depot got in G8: an airsoft
 * site's range in the countryside. Its props stand behind the firing line, in the corners, where nobody shoots (a
 * portable toilet, the replica rack, a water tank, the generator, a crate bench, a low sandbag wall to vault) and a
 * sandbag berm lies at the foot of the backstop; they are blocks like any map's, so BBs stop on them. The dressing (MapData.dressing, render/dressing/mapDressing.ts)
 * adds dirt and junk at the walls' feet, litter, puddles, sprays and warning signs, small glow strips by the firing line,
 * and wooded hills, treelines, site huts, a water tower and a power line beyond the walls. World coordinates
 * (downrange is -z, the firing line runs across z = 0). Look only, but for the props: nothing else is read by play.
 */

/** Glow strip colours: lime and teal (none near a team's blue or orange; mapDressing.test.ts checks every map's). */
const LIME = 0xb8e63a;
const TEAL = 0x2fc9a0;

/** A box standing on the floor: its kind, its middle across (x) and along (z) the range, and its size (m). */
function prop(kind: MapBlock['kind'], x: number, z: number, w: number, d: number, h: number): MapBlock {
  return { kind, center: vec3(x, h / 2, z), size: vec3(w, h, d) };
}

/** A crate's size (m), as on Depot: the site's props are sized from it. */
const CRATE = 1.2;
/** Full-height props (the toilet, the rack): two crates, as on Depot. */
const FULL_HEIGHT = 2 * CRATE;
/** The sandbag berm at the backstop's foot: how deep it is from the backstop (m) and how high. */
const BERM = { depth: 1.2, height: 0.9 };
/**
 * A low sandbag wall to vault (M102, the tutorial's vault step): its middle across and along the range and its length.
 * Off to the right of where you start, with room on both sides, clear of the walk to the line and of the back props.
 */
const VAULT_BAGS = { x: 4.6, z: 3.4, length: 2.4 };

/**
 * The range's props (M81), placed from config/range.ts: behind the firing line in the two back corners and along the
 * back wall (clear of where you start and of the walk to the line), the berm across the backstop's foot (past the
 * farthest targets), and a low sandbag wall to vault (M102).
 */
export function rangeProps(): MapBlock[] {
  const w = RANGE.halfWidth;
  const back = RANGE.behindLine;
  // Flush against the back wall and the side walls.
  const atBack = (depth: number): number => back - depth / 2;
  const atLeft = (width: number): number => -w + width / 2;
  const atRight = (width: number): number => w - width / 2;
  return [
    prop('toilet', atLeft(CRATE), atBack(CRATE), CRATE, CRATE, FULL_HEIGHT),
    prop('rack', atLeft(CRATE) + CRATE + 1.4, atBack(CRATE / 2), 2.6, CRATE / 2, FULL_HEIGHT),
    prop('ibc', atRight(CRATE), atBack(CRATE), CRATE, CRATE, CRATE),
    prop('generator', atRight(CRATE), atBack(CRATE) - CRATE - 0.3, CRATE, CRATE, CRATE),
    prop('crate', atRight(CRATE) - CRATE - 1.6, atBack(CRATE), 2 * CRATE, CRATE, 0.9),
    prop('sandbags', 0, -RANGE.backstop + BERM.depth / 2, 2 * w, BERM.depth, BERM.height),
    prop('sandbags', VAULT_BAGS.x, VAULT_BAGS.z, VAULT_BAGS.length, VAULT_WALL_MAX_DEPTH, VAULT_WALL_HEIGHT),
  ];
}

/** A glow strip on `b`'s face looking along `facing`, `along` the face (world x or z), its middle `y` over the block's foot. */
function strip(b: MapBlock, facing: GlowStrip['facing'], along: number, y: number, colour: number, width = 1.6, height = 0.12): GlowStrip {
  const sx = b.size.x / 2;
  const sz = b.size.z / 2;
  const base = b.center.y - b.size.y / 2;
  const x = facing === '+x' ? b.center.x + sx : facing === '-x' ? b.center.x - sx : along;
  const z = facing === '+z' ? b.center.z + sz : facing === '-z' ? b.center.z - sz : along;
  return { centre: { x, y: base + y, z }, width, height, facing, colour };
}

/** The range's dressing, its strips placed on its own `blocks` (the side walls and the wall behind the firing line). */
export function rangeDressing(blocks: readonly MapBlock[]): MapDressing {
  const walls = blocks.filter((b) => b.kind === 'wall');
  const behind = walls.reduce((a, b) => (b.center.z > a.center.z ? b : a));
  const west = walls.reduce((a, b) => (b.center.x < a.center.x ? b : a));
  const east = walls.reduce((a, b) => (b.center.x > a.center.x ? b : a));
  const top = RANGE.wallHeight - 0.45;
  return {
    seed: 2113,
    clutter: { dirt: 0.5, junk: 0.3, litter: 0.2 },
    puddles: [
      { x: -3.6, z: -17, width: 2.2, depth: 1.4 },
      { x: 3.8, z: -38.5, width: 2.8, depth: 1.6 },
      { x: -9.4, z: -51, width: 1.6, depth: 2.2 },
    ],
    marks: { logos: 0, walls: 0.3 },
    strips: [
      // By the firing line, where you stand: on each side wall a step behind it, and two on the wall behind you.
      strip(west, '+x', 1.2, top, TEAL),
      strip(east, '-x', 1.2, top, TEAL),
      strip(behind, '-z', -4, top, LIME, 2.4),
      strip(behind, '-z', 4, top, LIME, 2.4),
    ],
    skyline: [
      { kind: 'hill', x: -6, z: -112, width: 120, depth: 36, height: 14 },
      { kind: 'hill', x: -58, z: -40, width: 34, depth: 70, height: 9 },
      { kind: 'treeline', points: [{ x: -34, z: 18 }, { x: -36, z: -30 }, { x: -32, z: -84 }], height: 13, depth: 7 },
      { kind: 'treeline', points: [{ x: 36, z: 10 }, { x: 34, z: -40 }, { x: 38, z: -90 }], height: 12, depth: 7 },
      { kind: 'shed', x: -24, z: 16, width: 14, depth: 8, height: 5 },
      { kind: 'shed', x: 26, z: -8, width: 10, depth: 7, height: 4.5, turned: true },
      { kind: 'waterTower', x: 30, z: 24, width: 6, depth: 6, height: 18 },
      { kind: 'powerLine', points: [{ x: -70, z: -96 }, { x: -20, z: -92 }, { x: 30, z: -95 }, { x: 75, z: -90 }], height: 13 },
    ],
    motes: { tint: 0xd8d6cf },
    kickedDust: { tint: 0xb9b7b0, scale: 1 },
    // 90 m up (BP3, was 180, past the sky dome's 200 m reach for most of its line).
    plane: { height: 90, every: 150 },
  };
}

/**
 * The wall round each distance board (render/match/rangeTargetsRenderer.ts draws them), kept clear of the painted signs and
 * the dressing's marks (MapData.keepClear): before M81 the site's roundel sat over the 30 m board on the left wall.
 * Each box runs from the wall's face as far out as the turned board reaches, along the wall as far as it does, with
 * `margin` m round it.
 */
export function rangeBoardsClear(margin = 0.2): { center: ReturnType<typeof vec3>; size: ReturnType<typeof vec3> }[] {
  const V = RANGE_VISUALS;
  const out = V.signWidth * Math.sin(V.signTurn) + margin;
  const along = V.signWidth * Math.cos(V.signTurn) + 2 * margin;
  const high = V.signHeight + 2 * margin;
  return RANGE.distances.flatMap((d) => [-1, 1].map((side) => ({ center: vec3(side * (RANGE.halfWidth - out / 2), V.signLift, -d), size: vec3(out, high, along) })));
}
