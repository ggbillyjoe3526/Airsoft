import type { DressingPuddle, MapDressing, SkylinePiece } from './mapTypes';

/**
 * Woodland's set dressing (G9, MapData.dressing; render/mapDressing.ts and render/woodsDressing.ts place it): the floor
 * of a wood in autumn. Leaf litter drifts round the trunks, logs, boulders and the fence; fallen branches, twigs and
 * sawn logs lie against their feet; mud and puddles lie in the tracks, the creek bed and the camp clearings; moss and a
 * damp band grow on the boulders, logs and trunks; a dark treeline and low wooded hills stand beyond the fence; and
 * fireflies drift over the field at night. World coordinates (plan x − 60, plan 40 − z). Look only: nothing here is
 * read by play, nothing collides and nothing hides anyone (map/woodlandDressing.test.ts).
 */

/** Plan coordinates (as in woodland.ts: x east 0–120, z north 0–80) to the world's. */
const wx = (x: number): number => x - 60;
const wz = (z: number): number => 40 - z;

/** A puddle or a patch of mud in plan coordinates. */
const pool = (x: number, z: number, width: number, depth: number, mud = false): DressingPuddle => ({ x: wx(x), z: wz(z), width, depth, ...(mud ? { mud: true } : {}) });

/**
 * Water and mud on the ground: puddles in the creek's bed and the two tracks, mud where feet churn the earth (the camp
 * clearings, the fort's floor, the cabin's doors and the foot of the Knoll's climbs). All flat on the terrain, clear of
 * the spawns themselves so a figure still reads on the ground it starts on (as the ground surfaces are, M33i).
 */
const POOLS = [
  // The creek's bed (its line is z = 12 + 3·sin(x / 14)).
  pool(18, 14.1, 3.4, 1.8),
  pool(38, 14.4, 4.2, 2.0),
  pool(54, 10.3, 3.0, 1.7),
  pool(70, 13.4, 3.6, 1.9),
  pool(82, 10.0, 2.6, 1.6),
  // The forest track along the Pine Belt lane.
  pool(31, 65.5, 2.2, 1.5, true),
  pool(45, 70.6, 2.6, 1.6, true),
  pool(63, 72, 2.4, 1.5, true),
  // The sunken track up to the Knoll.
  pool(76, 25.6, 2.6, 1.8, true),
  pool(86, 29.9, 2.4, 1.6),
  // The camps' clearings, a stride or two from the fires, and the fort's trampled floor.
  pool(7.5, 49, 3.0, 2.0, true),
  pool(113, 49, 2.8, 1.9, true),
  pool(99, 45, 2.4, 1.8, true),
  pool(103.5, 49.5, 2.0, 1.5, true),
  // By the cabin's north and east doors.
  pool(64.8, 28.2, 2.2, 1.5, true),
  pool(72.2, 21.2, 1.8, 1.4, true),
  // The feet of the Meadow's climb and the Pine Belt's descent.
  pool(88, 46, 2.6, 1.7),
  pool(92, 62.5, 2.2, 1.6, true),
];

/**
 * Beyond the fence: a band of dark conifers close behind it on all four sides, and low wooded hills further out (the
 * tree ring beyond them starts 92 m from the middle, so they fill the gap between the fence and the ring without
 * standing in it). Trees of the ring may stand on a hill or behind a treeline (render/skyline.ts skylineClear).
 */
const SKYLINE: SkylinePiece[] = [
  // The treelines, 6 m beyond the fence on each side.
  { kind: 'treeline', height: 15, depth: 5, points: [{ x: wx(-8), z: wz(86) }, { x: wx(40), z: wz(88) }, { x: wx(88), z: wz(87) }, { x: wx(128), z: wz(85) }] },
  { kind: 'treeline', height: 13, depth: 5, points: [{ x: wx(-8), z: wz(-7) }, { x: wx(44), z: wz(-8) }, { x: wx(92), z: wz(-7) }, { x: wx(128), z: wz(-6) }] },
  { kind: 'treeline', height: 14, depth: 4.5, points: [{ x: wx(-8), z: wz(-6) }, { x: wx(-9), z: wz(32) }, { x: wx(-8), z: wz(74) }, { x: wx(-7), z: wz(86) }] },
  { kind: 'treeline', height: 16, depth: 4.5, points: [{ x: wx(128), z: wz(-6) }, { x: wx(129), z: wz(34) }, { x: wx(128), z: wz(76) }, { x: wx(127), z: wz(86) }] },
  // Wooded hills on the horizon: higher behind the Knoll (east), lower to the west and south.
  { kind: 'hill', x: wx(170), z: wz(44), width: 150, depth: 90, height: 26 },
  { kind: 'hill', x: wx(118), z: wz(150), width: 180, depth: 90, height: 20 },
  { kind: 'hill', x: wx(-70), z: wz(96), width: 150, depth: 80, height: 17 },
  { kind: 'hill', x: wx(10), z: wz(-82), width: 170, depth: 80, height: 14, colour: 0x22312a },
  { kind: 'hill', x: wx(-56), z: wz(-18), width: 110, depth: 90, height: 12 },
];

export const WOODLAND_DRESSING: MapDressing = {
  seed: 5209,
  // The wood's floor (render/woodsDressing.ts): leaf drifts round roughly a third of the squares that lie by a foot,
  // and a fallen branch, twigs or a sawn log in about a fifth of the slots along those feet.
  woods: { leaves: 0.28, fallen: 0.2 },
  // Moss and a damp band on the hard cover (render/natureShapes.ts): a cool green, strongest on tops and north faces.
  moss: { colour: 0x4e6b3a, share: 0.5 },
  puddles: POOLS,
  skyline: SKYLINE,
  // Fireflies over the field by night (render/fireflies.ts), gathering round the bushes.
  fireflies: { count: 150 },
  // The dust in the air and underfoot: a cool woodland grey-green rather than Depot's concrete.
  motes: { tint: 0xc9d2bc },
  kickedDust: { tint: 0x8d8367, scale: 0.9 },
};
