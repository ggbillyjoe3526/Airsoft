import { describe, expect, it } from 'vitest';
import { BODY } from '../config/movement';
import { buildLevelRay, castLevelRay } from '../sim/levelRay';
import { type Vec3, vec3 } from '../sim/vec';
import { NEON_HEIGHTS } from './neonHeights';

/**
 * M73 (audit BAL-04): the Tower's bar door opens on Neon Avenue, and the east's last mid-lane holds must sit inside the
 * door line, back in the bar. From (5.4, 1.7) (plan coordinates; z is mirrored in world coordinates), 1.1 m behind the
 * door, a holder watched a 7 m stretch of the avenue and took the first hit in 15 of 24 Normal night rounds; the lane
 * point now stands deeper in the door's line. The door is read off the map's wall blocks, not copied.
 */

const level = buildLevelRay(NEON_HEIGHTS.blocks);
/** The Mid lane (index 1, "through the Arcade, past the van, the bar door, the atrium"): its last two points are the east's holds. */
const MID_LANE = 1;
const holds: readonly Vec3[] = NEON_HEIGHTS.lanes![MID_LANE]!.slice(-2);

/** The avenue line a holder is judged against: this far out from the door's outer face, about the middle of Neon Avenue. */
const AVENUE_OFFSET = 4;
const SAMPLE_STEP = 0.1;

interface DoorLine {
  /** The wall's outer face (towards the avenue) and inner face (into the bar), along x. */
  outer: number;
  inner: number;
  /** The opening's extent along z. */
  z0: number;
  z1: number;
}

/**
 * The ground-storey door in the wall just west of `p` that p's z falls in: the nearest thin full-height wall column
 * west of p with no wall block over p.z, bounded by wall blocks on both sides of the gap.
 */
function doorLineAt(p: Vec3): DoorLine | undefined {
  const thin = NEON_HEIGHTS.blocks.filter((b) => b.kind === 'wall' && b.size.x <= 0.5 && b.center.y - b.size.y / 2 < 0.01);
  const columns = [...new Set(thin.map((b) => Math.round(b.center.x * 1000) / 1000))].filter((x) => x < p.x).sort((a, b) => b - a);
  for (const x of columns) {
    const col = thin.filter((b) => Math.abs(b.center.x - x) < 0.001);
    if (col.some((b) => Math.abs(p.z - b.center.z) < b.size.z / 2)) continue;
    const below = col.filter((b) => b.center.z + b.size.z / 2 <= p.z).sort((a, b) => b.center.z - a.center.z)[0];
    const above = col.filter((b) => b.center.z - b.size.z / 2 >= p.z).sort((a, b) => a.center.z - b.center.z)[0];
    if (!below || !above) continue;
    return { outer: x - below.size.x / 2, inner: x + below.size.x / 2, z0: below.center.z + below.size.z / 2, z1: above.center.z - above.size.z / 2 };
  }
  return undefined;
}

/** How much of the avenue line (metres along it) a standing holder at `p` sees through the door. */
function avenueSeen(p: Vec3, door: DoorLine): number {
  const eye = vec3(p.x, p.y + BODY.standEyeHeight, p.z);
  const x = door.outer - AVENUE_OFFSET;
  let seen = 0;
  for (let z = -15; z <= 15; z += SAMPLE_STEP) {
    const to = vec3(x, eye.y, z);
    const d = vec3(to.x - eye.x, 0, to.z - eye.z);
    const len = Math.hypot(d.x, d.z);
    if (castLevelRay(level, eye, vec3(d.x / len, 0, d.z / len), len) < 0) seen += SAMPLE_STEP;
  }
  return seen;
}

describe("the east's last mid-lane holds sit inside the bar's door line (M73, audit BAL-04)", () => {
  it('finds the bar door in the Tower wall from the map blocks', () => {
    const door = doorLineAt(holds[holds.length - 1]!)!;
    expect(door, 'a door in a wall west of the last hold').toBeDefined();
    expect(door.z1 - door.z0, 'the door is a person wide, not a wall gap').toBeGreaterThan(1);
    expect(door.z1 - door.z0).toBeLessThan(2.5);
  });

  it.each([0, 1])('hold %# is in the bar, within the door\'s width, not out on the avenue', (i) => {
    const hold = holds[i]!;
    const door = doorLineAt(hold)!;
    expect(hold.x, 'past the wall, inside the bar').toBeGreaterThan(door.inner);
    expect(hold.z).toBeGreaterThanOrEqual(door.z0 - 1e-6);
    expect(hold.z).toBeLessThanOrEqual(door.z1 + 1e-6);
  });

  it.each([0, 1])('hold %# shows the avenue through the door no wider than two doors, not the 4 m a hold just inside it does', (i) => {
    const hold = holds[i]!;
    const door = doorLineAt(hold)!;
    const limit = 2 * (door.z1 - door.z0);
    const seen = avenueSeen(hold, door);
    expect(seen, `hold (${hold.x}, ${hold.z}) sees ${seen.toFixed(1)} m of the avenue line, limit ${limit.toFixed(1)} m`).toBeGreaterThan(0);
    expect(seen, `hold (${hold.x}, ${hold.z}) sees ${seen.toFixed(1)} m of the avenue line, limit ${limit.toFixed(1)} m`).toBeLessThanOrEqual(limit);
  });

  it("the check tells the old lane point (5.4, 1.7 in plan coordinates) from the new one: it sees more than two doors of the avenue", () => {
    const old = vec3(5.4, 0, -1.7);
    const door = doorLineAt(old)!;
    expect(door).toBeDefined();
    expect(avenueSeen(old, door)).toBeGreaterThan(2 * (door.z1 - door.z0));
  });
});
