import { type Vec3, vec3 } from '../sim/vec';
import type { DressingPuddle, MapDressing, NeonSign, SkylinePiece } from './mapTypes';

/**
 * Neon Heights' set dressing (G9, MapData.dressing; render/mapDressing.ts places it): a closed-down market block at
 * street level. Street litter and junk against the walls, puddles in the avenue and the alleys, a few sprays and
 * warning signs and pasted posters, tube-letter neon signs (a couple of them flickering gently), steam from the vents
 * and the drains, and a city skyline of lit towers beyond the perimeter with a plane crossing over it.
 *
 * Written in the map's plan coordinates (x east, z north, as neonHeights.ts is) and turned into world coordinates
 * (north = −z) here, exactly as the map's own signs are. Look only: nothing here is read by play, nothing collides and
 * nothing hides anyone (map/neonHeightsDressing.test.ts); the map's blocks and their order are untouched.
 */

const HALF_X = 23;
const HALF_Z = 15;
/** The avenue's kerbs (plan x), as the map lays them. */
const ROAD = [-2, 2.5] as const;

const at = (x: number, y: number, z: number): Vec3 => vec3(x, y, -z);
const FLIP: Record<NeonSign['facing'], NeonSign['facing']> = { '+x': '+x', '-x': '-x', '+z': '-z', '-z': '+z' };

/** A puddle in plan coordinates. */
const pool = (x: number, z: number, width: number, depth: number): DressingPuddle => ({ x, z: -z, width, depth });

/** A neon sign in plan coordinates: `size` is its letters' height; `flicker` puts it on a flicker channel. */
const sign = (x: number, y: number, z: number, facing: NeonSign['facing'], colour: number, size: number, body: { text: string } | { emblem: NonNullable<NeonSign['emblem']> }, flicker?: 1 | 2 | 3): NeonSign => ({
  centre: at(x, y, z),
  facing: FLIP[facing],
  colour,
  size,
  ...body,
  ...(flicker ? { flicker } : {}),
});

/**
 * The tube colours: the map's own neon palette (M34e) less its cyan, amber and red, which read as a team's blue or
 * orange under G8's rule for props (mapDressing.test.ts checks every colour of a map's dressing), with a teal and a
 * warm yellow in their place.
 */
const NEON_COLOURS = { magenta: 0xff2bd6, lime: 0x8dff3a, violet: 0x9a6bff, teal: 0x2fc9a0, yellow: 0xecd04a } as const;

/**
 * Tube signs on the walls, each written on the face of the wall it hangs on (the engine mounts it flush and drops any
 * sign whose plate a face does not back whole: render/neonDressing.ts mountNeon), all well above head height and
 * clear of every opening and of the map's own panel signs:
 * the Arcade's name over the avenue, a noodle bowl in Noodle Alley, the Tower's bar and a cocktail in the Back Alley,
 * an arrow over the Drone Dock's shutter, a hotel blade on the perimeter by the West Yard. Two flicker gently.
 */
const SIGNS: NeonSign[] = [
  // Neon Avenue: the Arcade's east face and the Tower's west face.
  sign(-3.5, 3.5, 6.0, '+x', NEON_COLOURS.magenta, 0.52, { text: 'PLAY' }),
  sign(-3.5, 3.3, -9.6, '+x', NEON_COLOURS.lime, 0.46, { text: 'PARTS' }, 2),
  sign(4.0, 3.4, -4.2, '-x', NEON_COLOURS.teal, 0.5, { text: 'BAR' }),
  sign(4.0, 4.5, 10.0, '-x', NEON_COLOURS.yellow, 0.44, { emblem: 'cup' as const }),
  // Noodle Alley: a bowl on the Arcade's north face and the alley's name on the perimeter wall.
  sign(-9.2, 3.15, 10.0, '+z', NEON_COLOURS.yellow, 0.6, { emblem: 'bowl' }),
  sign(-6.4, 3.4, HALF_Z, '-z', NEON_COLOURS.magenta, 0.42, { text: 'NOODLE' }, 1),
  // Lantern Lane and the Repair Shop block's north face.
  sign(-4.75, 3.3, -5.0, '+z', NEON_COLOURS.violet, 0.4, { text: 'LANE' }),
  // The Drone Dock: an arrow over the shutter, and the dock's number on the perimeter.
  sign(13.2, 3.2, -15, '+z', NEON_COLOURS.teal, 0.55, { emblem: 'arrow' as const }),
  sign(5.6, 3.4, -15, '+z', NEON_COLOURS.lime, 0.4, { text: 'DOCK 4' }),
  // The Back Alley and the East Yard's perimeter.
  sign(9.6, 3.3, HALF_Z, '-z', NEON_COLOURS.magenta, 0.44, { text: 'HOTEL' }, 3),
  sign(HALF_X, 3.6, 2.4, '-x', NEON_COLOURS.teal, 0.42, { text: 'TAXI' }),
  sign(-HALF_X, 3.6, -8.4, '+x', NEON_COLOURS.yellow, 0.42, { text: 'KIOSK' }),
];

/** Puddles on the street: the avenue's gutters, the alleys and the yards; never where a floor or a roof is over them. */
const POOLS: DressingPuddle[] = [
  pool(ROAD[0] + 0.5, 6.4, 2.2, 1.4),
  pool(ROAD[1] - 0.6, -3.4, 1.8, 2.4),
  pool(ROAD[0] + 0.6, -14.2, 2.0, 1.2),
  pool(0.4, 10.2, 2.6, 1.5),
  pool(-8.6, 13.4, 2.4, 1.4),
  pool(-15.6, 11.4, 2.0, 1.6),
  pool(-20.6, -12.2, 2.2, 1.6),
  pool(-20.4, 9.4, 2.4, 1.5),
  pool(8.4, -13.8, 2.8, 1.6),
  pool(14.6, -13.2, 2.2, 1.4),
  pool(20.6, 11.6, 2.4, 1.6),
  pool(21.0, -6.6, 1.8, 2.6),
  pool(-13.4, -2.6, 1.8, 1.3),
];

/** Steam from the vents and the drains (plan): the noodle stall's pot, two wall vents and three street drains. */
const STEAM: Vec3[] = [
  at(-9.5, 1.1, 10.4),
  at(-3.7, 3.0, -14.8),
  at(-7.2, 4.4, 10.3),
  at(0.9, 0.02, -0.6),
  at(-0.6, 0.02, 9.6),
  at(11.6, 0.02, -13.7),
  at(-20.4, 0.02, -1.6),
];

/**
 * The city round the site: towers standing behind the 10 m perimeter walls (their base just under the wall's top, so
 * none of them shows inside the field). MS1: they loom, 40 to 75 m in the first row, stepping in near the top, with
 * billboards and blade signs on their field faces; lower where the avenue runs out (north and south, plan x 0) so the
 * street's canyon carries on into the city. Behind them the city goes on in blocks to the haze (`outerCity`).
 */
const NEAR: SkylinePiece[] = [
  // North of the site (plan +z: world −z), either side of the avenue's end.
  { kind: 'tower', x: -17, z: -24, width: 14, depth: 11, height: 58, base: 9.6, sign: NEON_COLOURS.magenta, setback: { at: 0.72, inset: 2 } },
  { kind: 'tower', x: -4.5, z: -27, width: 9, depth: 13, height: 26, base: 9.6 },
  { kind: 'tower', x: 9.5, z: -23.5, width: 11, depth: 10, height: 66, base: 9.6, sign: NEON_COLOURS.teal, billboard: NEON_COLOURS.violet },
  { kind: 'tower', x: 21, z: -27, width: 13, depth: 12, height: 48, base: 9.6, setback: { at: 0.6, inset: 1.5 } },
  // South of the site.
  { kind: 'tower', x: -19, z: 24, width: 15, depth: 10, height: 52, base: 9.6, billboard: NEON_COLOURS.magenta },
  { kind: 'tower', x: -4.5, z: 27, width: 9, depth: 12, height: 22, base: 9.6 },
  { kind: 'tower', x: 10, z: 24.5, width: 14, depth: 11, height: 61, base: 9.6, sign: NEON_COLOURS.yellow, setback: { at: 0.68, inset: 2.5 } },
  { kind: 'tower', x: 24, z: 26, width: 10, depth: 12, height: 44, base: 9.6 },
  // West and east, beyond the yards.
  { kind: 'tower', x: -34, z: -8, width: 12, depth: 14, height: 72, base: 9.6, sign: NEON_COLOURS.violet, setback: { at: 0.75, inset: 2 } },
  { kind: 'tower', x: -33, z: 7.5, width: 11, depth: 13, height: 55, base: 9.6, billboard: NEON_COLOURS.teal },
  { kind: 'tower', x: 33, z: -7, width: 12, depth: 13, height: 63, base: 9.6, billboard: NEON_COLOURS.yellow },
  { kind: 'tower', x: 34.5, z: 8, width: 13, depth: 12, height: 50, base: 9.6, sign: NEON_COLOURS.magenta, setback: { at: 0.7, inset: 1.5 } },
  // The corners, so no gap shows between the rows.
  { kind: 'tower', x: -33, z: -24, width: 12, depth: 12, height: 46, base: 9.6 },
  { kind: 'tower', x: 33, z: -24, width: 12, depth: 12, height: 57, base: 9.6 },
  { kind: 'tower', x: -33, z: 23, width: 12, depth: 12, height: 41, base: 9.6 },
  { kind: 'tower', x: 34, z: 23, width: 12, depth: 12, height: 49, base: 9.6 },
  // Skybridges across the avenue's ends, high over the street.
  { kind: 'skybridge', points: [{ x: -10, z: -24 }, { x: 4, z: -24 }], y: 34, width: 3, height: 3.2 },
  { kind: 'skybridge', points: [{ x: -11.5, z: 25 }, { x: 3, z: 25 }], y: 28, width: 3, height: 3.2 },
];

/** A fixed hash of two integers to 0..1, so the outer city is the same every load. */
const cityHash = (a: number, b: number, salt: number): number => {
  const h = Math.imul(a * 374761393 + b * 668265263 + salt * 2147483647, 1274126177) >>> 0;
  return (Math.imul(h ^ (h >>> 13), 1103515245) >>> 0) / 4294967296;
};

const CITY = {
  /** Blocks on a `pitch` m grid (streets between them), kept `clear` m (plan) clear of the site and its first row. */
  pitch: 26,
  clear: 44,
  /** Out to `reach` m from the site's middle; nearer blocks are `near` tall, the furthest `far` (min, max). */
  reach: 140,
  near: [55, 95],
  far: [70, 110],
  /** Each block `size` m across (min, max); a share `setbacks` step in, `billboards` carry one. */
  size: [14, 21],
  setbacks: 0.45,
  billboards: 0.12,
} as const;

/** The city beyond the first row: a grid of towers to the haze, taller further out, the avenue's line kept open. */
function outerCity(): SkylinePiece[] {
  const out: SkylinePiece[] = [];
  const billboards = [NEON_COLOURS.magenta, NEON_COLOURS.teal, NEON_COLOURS.yellow, NEON_COLOURS.violet];
  const n = Math.ceil(CITY.reach / CITY.pitch);
  for (let gx = -n; gx <= n; gx++) {
    for (let gz = -n; gz <= n; gz++) {
      const x = gx * CITY.pitch + (cityHash(gx, gz, 1) - 0.5) * 4;
      const z = gz * CITY.pitch + (cityHash(gx, gz, 2) - 0.5) * 4;
      const dist = Math.hypot(x, z);
      if (dist > CITY.reach) continue;
      if (Math.abs(x) < HALF_X + CITY.clear - 20 && Math.abs(z) < HALF_Z + CITY.clear - 20) continue;
      // The avenue's line runs on north and south: no block on it within the haze's near half.
      if (Math.abs(x) < 8 && dist < CITY.reach * 0.6) continue;
      const t = Math.min(1, (dist - CITY.clear) / (CITY.reach - CITY.clear));
      const lo = CITY.near[0] + (CITY.far[0] - CITY.near[0]) * t;
      const hi = CITY.near[1] + (CITY.far[1] - CITY.near[1]) * t;
      const height = Math.round(lo + (hi - lo) * cityHash(gx, gz, 3));
      const size = (k: number): number => Math.round(CITY.size[0] + (CITY.size[1] - CITY.size[0]) * cityHash(gx, gz, k));
      out.push({
        kind: 'tower',
        x,
        z,
        width: size(4),
        depth: size(5),
        height,
        base: 0,
        ...(cityHash(gx, gz, 6) < CITY.setbacks ? { setback: { at: 0.55 + cityHash(gx, gz, 7) * 0.25, inset: 2 + cityHash(gx, gz, 8) * 2 } } : {}),
        ...(cityHash(gx, gz, 9) < CITY.billboards ? { billboard: billboards[(gx + 7 * gz + 99) % billboards.length]! } : {}),
      });
    }
  }
  return out;
}

const SKYLINE: SkylinePiece[] = [...NEAR, ...outerCity()];

export const NEON_HEIGHTS_DRESSING: MapDressing = {
  seed: 7331,
  // Street litter: bin bags, cans, bottles, grey rubble and a cone (the city's mix), dirt banked at the walls' feet and
  // scraps of paper on the open paving.
  clutter: { dirt: 0.4, junk: 0.4, litter: 0.26, mix: 'street' },
  // No shipping lines here (the city has no containers): a spray or a warning sign in about one bay of wall in eight.
  marks: { logos: 0, walls: 0.12 },
  posters: 0.3,
  puddles: POOLS,
  neon: SIGNS,
  steam: STEAM.map((s) => ({ x: s.x, y: s.y, z: s.z })),
  skyline: SKYLINE.map((p) => ('points' in p ? { ...p, points: p.points.map((q) => ({ x: q.x, z: -q.z })) } : { ...p, z: -p.z })),
  // MS1: no tree ring in the city; dark streets beyond the walls, fading into the haze.
  surroundings: { trees: false, ground: { y: -0.03, near: 0x3e4046, far: 0x55565c } },
  // A plane crossing the city's sky: a pass starts every twenty seconds and takes ten.
  // 120 m up (MS1, was 85 since BP3): over the taller city's towers and inside the sky dome for the whole of its line.
  plane: { height: 120, every: 20 },
  // The dust in the air and underfoot: city grey, a touch cool.
  motes: { tint: 0xc6cad4 },
  kickedDust: { tint: 0xb0b4bc, scale: 0.9 },
};
