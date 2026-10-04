import type { NavGridConfig } from '../nav/navGrid';
import { BODY } from './movement';
import { PHYSICS } from './physics';

/** Navigation grid for bots and walk-offs, built from the map's blocks. */
const CELL = 0.2;
const CLEARANCE = BODY.radius + 0.06;

export const NAV: NavGridConfig & { snap: number; legProbe: number } = {
  /** Fine enough that ~1 m door gaps keep a walkable lane down the middle. */
  cell: CELL,
  /** Body radius plus a small margin so routes don't scrape walls and corners. */
  clearance: CLEARANCE,
  maxLedge: PHYSICS.maxWalkableLedge,
  bodyHeight: BODY.height,
  /** The tallest ledge a character always walks onto; a ramp no steeper than PHYSICS.maxRampSlope rises less than this per cell. */
  maxStep: PHYSICS.maxWalkableLedge,
  /** Route ends off the grid (e.g. inside a wall's clearance) snap to the nearest walkable cell within this. */
  snap: 2,
  /**
   * Bots' routes (audit AI-12): how far round each point of a straight leg the cells must be walkable too, so the
   * leg keeps the body's radius from corners (see clearLineFor): radius + half a cell diagonal − clearance.
   */
  legProbe: BODY.radius + (CELL * Math.SQRT2) / 2 - CLEARANCE,
};
