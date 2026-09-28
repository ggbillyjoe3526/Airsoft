import { vec3 } from '../sim/vec';
import type { MapBlock, MapData } from './mapTypes';

/** Half the inner width of the yard (metres). */
export const TEST_YARD_HALF_SIZE = 15;
const HALF = TEST_YARD_HALF_SIZE;
const WALL_HEIGHT = 3;
const WALL_THICKNESS = 0.4;
const FLOOR_THICKNESS = 0.5;

/** Four walls enclosing a square floor, so nobody can leave the play area. */
function perimeter(half: number): MapBlock[] {
  const h = WALL_HEIGHT / 2;
  const t = WALL_THICKNESS;
  const len = half * 2 + t * 2;
  return [
    { kind: 'wall', center: vec3(0, h, -half - t / 2), size: vec3(len, WALL_HEIGHT, t) },
    { kind: 'wall', center: vec3(0, h, half + t / 2), size: vec3(len, WALL_HEIGHT, t) },
    { kind: 'wall', center: vec3(-half - t / 2, h, 0), size: vec3(t, WALL_HEIGHT, half * 2) },
    { kind: 'wall', center: vec3(half + t / 2, h, 0), size: vec3(t, WALL_HEIGHT, half * 2) },
  ];
}

/** Minimal walled yard with a crate: a small, predictable fixture for physics and lighting tests. */
export const TEST_YARD: MapData = {
  name: 'Test Yard',
  blocks: [
    {
      kind: 'floor',
      center: vec3(0, -FLOOR_THICKNESS / 2, 0),
      size: vec3(HALF * 2 + WALL_THICKNESS * 2, FLOOR_THICKNESS, HALF * 2 + WALL_THICKNESS * 2),
    },
    ...perimeter(HALF),
    { kind: 'crate', center: vec3(0, 0.6, -6), size: vec3(1.2, 1.2, 1.2) },
  ],
  killY: -10,
  spawns: [[{ position: vec3(0, 0, 4), yaw: 0 }], []],
};
