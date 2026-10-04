import { RANGE } from '../config/range';
import { vec3 } from '../sim/vec';
import type { MapBlock, MapData } from './mapTypes';

const FLOOR_THICKNESS = 0.5;
const WALL_THICKNESS = 0.4;

/**
 * The practice range (M21): a long concrete floor between two walls, a tall backstop downrange and a wall behind the
 * firing line. It has no roof: a BB fired high can sail out over a wall, and the readout says so. Downrange is -z;
 * the firing line runs across z = 0. The targets aren't blocks: they are simulated on their own
 * (sim/rangeTargets.ts) and never stop you walking.
 */
function rangeBlocks(): MapBlock[] {
  const w = RANGE.halfWidth;
  const t = WALL_THICKNESS;
  const near = RANGE.behindLine;
  const far = RANGE.backstop;
  const length = near + far;
  const midZ = (near - far) / 2;
  const h = RANGE.wallHeight;
  return [
    { kind: 'floor', center: vec3(0, -FLOOR_THICKNESS / 2, midZ), size: vec3(w * 2 + t * 2, FLOOR_THICKNESS, length + t * 2) },
    { kind: 'wall', center: vec3(-w - t / 2, h / 2, midZ), size: vec3(t, h, length) },
    { kind: 'wall', center: vec3(w + t / 2, h / 2, midZ), size: vec3(t, h, length) },
    { kind: 'wall', center: vec3(0, h / 2, near + t / 2), size: vec3(w * 2 + t * 2, h, t) },
    { kind: 'wall', center: vec3(0, RANGE.backstopHeight / 2, -far - t / 2), size: vec3(w * 2 + t * 2, RANGE.backstopHeight, t) },
  ];
}

const spawn = { position: vec3(0, 0, RANGE.spawnBack), yaw: 0 };

export const RANGE_MAP: MapData = {
  name: 'Practice range',
  blocks: rangeBlocks(),
  killY: -10,
  // One spot, used for both ends: nobody else is on the range and no round is played on it.
  spawns: [[spawn], [spawn]],
  deadZones: [[spawn], [spawn]],
  lanes: [],
};
