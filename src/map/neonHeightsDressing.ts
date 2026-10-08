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
 * none of them shows inside the field), taller to the north and west, lower where the avenue runs out so the sky and the
 * far city show down the street. Some carry a lit blade sign.
 */
const SKYLINE: SkylinePiece[] = [
  // North of the site (plan +z: world −z).
  { kind: 'tower', x: -17, z: -24, width: 14, depth: 11, height: 27, base: 9.6, sign: NEON_COLOURS.magenta },
  { kind: 'tower', x: -3, z: -26, width: 12, depth: 13, height: 20, base: 9.6 },
  { kind: 'tower', x: 9.5, z: -23.5, width: 11, depth: 10, height: 31, base: 9.6, sign: NEON_COLOURS.teal },
  { kind: 'tower', x: 21, z: -27, width: 13, depth: 12, height: 23, base: 9.6 },
  // South of the site.
  { kind: 'tower', x: -19, z: 24, width: 15, depth: 10, height: 21, base: 9.6 },
  { kind: 'tower', x: -4.5, z: 27, width: 11, depth: 12, height: 17, base: 9.6 },
  { kind: 'tower', x: 10, z: 24.5, width: 14, depth: 11, height: 25, base: 9.6, sign: NEON_COLOURS.yellow },
  // West and east, beyond the yards.
  { kind: 'tower', x: -34, z: -8, width: 12, depth: 14, height: 29, base: 9.6, sign: NEON_COLOURS.violet },
  { kind: 'tower', x: -33, z: 7.5, width: 11, depth: 13, height: 22, base: 9.6 },
  { kind: 'tower', x: 33, z: -7, width: 12, depth: 13, height: 24, base: 9.6 },
  { kind: 'tower', x: 34.5, z: 8, width: 13, depth: 12, height: 18, base: 9.6, sign: NEON_COLOURS.magenta },
  // Further out, filling the skyline behind the first row.
  { kind: 'tower', x: -46, z: -28, width: 16, depth: 14, height: 34, base: 9.6 },
  { kind: 'tower', x: 2, z: -44, width: 18, depth: 15, height: 30, base: 9.6 },
  { kind: 'tower', x: 44, z: -34, width: 15, depth: 14, height: 28, base: 9.6 },
  { kind: 'tower', x: -40, z: 40, width: 17, depth: 14, height: 26, base: 9.6 },
  { kind: 'tower', x: 36, z: 42, width: 16, depth: 15, height: 32, base: 9.6 },
];

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
  skyline: SKYLINE.map((p) => ('points' in p ? p : { ...p, z: -p.z })),
  // A plane crossing the city's sky: a pass starts every twenty seconds and takes ten.
  plane: { height: 130, every: 20 },
  // The dust in the air and underfoot: city grey, a touch cool.
  motes: { tint: 0xc6cad4 },
  kickedDust: { tint: 0xb0b4bc, scale: 0.9 },
};
