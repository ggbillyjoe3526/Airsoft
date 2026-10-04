import type { MapBlock } from './mapTypes';

/**
 * Walkable surfaces: the tops of `floor` blocks (at any height) and of `ramp` blocks. Nothing else is
 * walkable by design. Walkable surfaces may stack (a floor over a floor, M34b) as long as the upper one leaves
 * body height above the lower; the nav grid keeps one node per floor.
 */

const RISE_PX = { x: 1, z: 0 };
const RISE_NX = { x: -1, z: 0 };
const RISE_PZ = { x: 0, z: 1 };
const RISE_NZ = { x: 0, z: -1 };

/** Unit direction (x, z) a ramp's top rises along. Throws for a ramp without `rise`. */
function riseAxis(b: MapBlock): { x: number; z: number } {
  switch (b.rise) {
    case '+x':
      return RISE_PX;
    case '-x':
      return RISE_NX;
    case '+z':
      return RISE_PZ;
    case '-z':
      return RISE_NZ;
    default:
      throw new Error(`Ramp at ${b.center.x}, ${b.center.z} has no rise`);
  }
}

/**
 * Height of the walkable top of `b` at (x, z): a floor's top, or a ramp's top interpolated along its rise.
 * Undefined for other kinds and outside the block's footprint (its edges count as inside).
 */
export function surfaceHeightAt(b: MapBlock, x: number, z: number): number | undefined {
  if (b.kind !== 'floor' && b.kind !== 'ramp') return undefined;
  const dx = x - b.center.x;
  const dz = z - b.center.z;
  const hx = b.size.x / 2;
  const hz = b.size.z / 2;
  if (Math.abs(dx) > hx || Math.abs(dz) > hz) return undefined;
  const top = b.center.y + b.size.y / 2;
  if (b.kind === 'floor') return top;
  const r = riseAxis(b);
  // -1 at the low edge, 1 at the high edge.
  const along = (dx * r.x) / hx + (dz * r.z) / hz;
  return top - (b.size.y * (1 - along)) / 2;
}

/**
 * The six corners of a ramp's wedge relative to its centre, written into `out` as x, y, z triples: the
 * low edge's two bottom corners, the high edge's two bottom corners, then the high edge's two top corners.
 * Within each pair the second lies to the right looking up the ramp, so RAMP_FACES winds outward.
 */
export function rampCorners(b: MapBlock, out: Float32Array | number[]): void {
  const r = riseAxis(b);
  // Along the rise, and across it (along × up, so the frame is right-handed like x, y, z).
  const ha = r.x !== 0 ? b.size.x / 2 : b.size.z / 2;
  const hc = r.x !== 0 ? b.size.z / 2 : b.size.x / 2;
  const cx = -r.z;
  const cz = r.x;
  const hy = b.size.y / 2;
  for (let k = 0; k < 6; k++) {
    const a = k < 2 ? -1 : 1;
    const y = k < 4 ? -1 : 1;
    const c = k % 2 === 0 ? -1 : 1;
    out[k * 3] = r.x * a * ha + cx * c * hc;
    out[k * 3 + 1] = y * hy;
    out[k * 3 + 2] = r.z * a * ha + cz * c * hc;
  }
}

/** A ramp's five faces as indices into rampCorners, counter-clockwise seen from outside: bottom, high end, slope, two sides. */
export const RAMP_FACES: readonly (readonly number[])[] = [
  [0, 2, 3, 1],
  [2, 4, 5, 3],
  [0, 1, 5, 4],
  [0, 4, 2],
  [1, 3, 5],
];
