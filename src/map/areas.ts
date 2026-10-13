import type { MapArea } from './mapTypes';

/**
 * Named areas (CL1, MapData.areas): where on the field a point is, in the words players use ("Dock", "Main Gate"). The
 * bots' callouts say it and the minimap's caption shows it. Pure; nothing allocated per call.
 */

/** Longest area name: it sits in a callout line and in the minimap's caption. */
export const AREA_NAME_MAX_LENGTH = 14;

/** The name of the first area of `areas` that holds the point (feet height `y`), or '' when none does. */
export function areaAt(areas: readonly MapArea[], x: number, y: number, z: number): string {
  for (const a of areas) {
    const b = a.box;
    if (x < b[0] || x >= b[1] || z < b[2] || z >= b[3]) continue;
    if (a.floor && (y < a.floor[0] || y >= a.floor[1])) continue;
    return a.name;
  }
  return '';
}
