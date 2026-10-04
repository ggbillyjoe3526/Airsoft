import { PHYSICS } from '../config/physics';
import { vec3 } from '../sim/vec';
import type { MapData } from './mapTypes';
import { buildTerrain, type Terrain } from './terrain';

/** Test fixtures for sloping ground (M33c). Only used by tests. */

/** Half the sloped yard's width (m): its terrain covers [-15, 15] in x and z. */
export const SLOPE_YARD_HALF = 15;

/** The hill in the sloped yard: its centre, its height above the slope and its spread (m). */
export const HILL = { x: 6, z: -6, height: 1.6, sigma: 2 } as const;

/** The yard's ground: a gentle slope rising along +x (0.15 per metre) with a rounded hill, on a 1 m grid. */
export const SLOPE_YARD_TERRAIN: Terrain = buildTerrain(-SLOPE_YARD_HALF, -SLOPE_YARD_HALF, 1, 30, 30, (x, z) => {
  const r2 = (x - HILL.x) ** 2 + (z - HILL.z) ** 2;
  return 0.15 * x + HILL.height * Math.exp(-r2 / (2 * HILL.sigma ** 2));
});

/**
 * A small yard on that ground, with no floor block: a crate on the slope, a wall across the low end and a low wall on
 * the hill's flank. Blocks stand on the ground (their bottoms sit a little under it).
 */
export const SLOPE_YARD: MapData = {
  name: 'Slope Yard',
  blocks: [
    { kind: 'crate', center: vec3(-5, -0.75 + 0.6, 3), size: vec3(1.2, 1.2, 1.2) },
    { kind: 'wall', center: vec3(-14.8, 0, 0), size: vec3(0.4, 5, 12) },
    { kind: 'wall', center: vec3(3, 1.2, -6), size: vec3(0.3, 1.2, 3) },
  ],
  terrain: SLOPE_YARD_TERRAIN,
  killY: -10,
  spawns: [[], []],
  deadZones: [[], []],
  lanes: [],
};

/** A plane rising `slope` per metre along +x over [-15, 15]², on a 1 m grid. */
export function planeTerrain(slope: number, cell = 1, size = 2 * SLOPE_YARD_HALF): Terrain {
  const n = Math.round(size / cell);
  return buildTerrain(-size / 2, -size / 2, cell, n, n, (x) => slope * x);
}

/** A plane at 60 % of the steepest slope a ramp may have: gentle enough to walk, run and sprint up. */
export const GENTLE_SLOPE = PHYSICS.maxRampSlope * 0.6;

/** A map of just a terrain (no blocks). */
export function terrainOnly(terrain: Terrain, name = 'terrain-only'): MapData {
  return { name, blocks: [], terrain, killY: -10, spawns: [[], []], deadZones: [[], []], lanes: [] };
}
