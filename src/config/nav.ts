import type { NavGridConfig } from '../nav/navGrid';
import { BODY } from './movement';
import { PHYSICS } from './physics';

/** Navigation grid for bots and walk-offs, built from the map's blocks. */
export const NAV: NavGridConfig & { snap: number } = {
  /** Fine enough that ~1 m door gaps keep a walkable lane down the middle. */
  cell: 0.2,
  /** Body radius plus a small margin so routes don't scrape walls and corners. */
  clearance: BODY.radius + 0.06,
  maxLedge: PHYSICS.maxWalkableLedge,
  bodyHeight: BODY.height,
  /** The tallest ledge a character always walks onto; a ramp of at most 30° rises less than this per cell. */
  maxStep: PHYSICS.maxWalkableLedge,
  /** Route ends off the grid (e.g. inside a wall's clearance) snap to the nearest walkable cell within this. */
  snap: 2,
};
