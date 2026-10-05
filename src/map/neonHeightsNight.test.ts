import { describe, expect, it } from 'vitest';
import { NIGHT_SIGHT } from '../config/bots';
import { type Vec3, vec3 } from '../sim/vec';
import { mapUnderLighting } from './lightingChoice';
import type { MapSign } from './mapTypes';
import { NEON_HEIGHTS, NEON_HEIGHTS_LAYOUT } from './neonHeights';
import { buildNightField, inLight, nightSightRange } from './nightSight';

/**
 * Neon Heights by Night (M34e): its lamps light the floors they hang over, its Level 1 rooms and stairwells are dark,
 * and its signs and windows sit flat on solid wall.
 */

const field = buildNightField(mapUnderLighting(NEON_HEIGHTS, 'night'), NIGHT_SIGHT)!;
const { storey, raised, bridges, links } = NEON_HEIGHTS_LAYOUT;
const spot = (name: string): Vec3 => raised.find((r) => r.name === name)!.at;

const NORMAL: Record<MapSign['facing'], Vec3> = { '+x': vec3(1, 0, 0), '-x': vec3(-1, 0, 0), '+z': vec3(0, 0, 1), '-z': vec3(0, 0, -1) };

/** Whether `p` is inside a wall block (or the perimeter). */
const inWall = (p: Vec3): boolean =>
  NEON_HEIGHTS.blocks.some((b) => b.kind === 'wall' && Math.abs(p.x - b.center.x) <= b.size.x / 2 && Math.abs(p.y - b.center.y) <= b.size.y / 2 && Math.abs(p.z - b.center.z) <= b.size.z / 2);

describe('Neon Heights by Night (M34e)', () => {
  it('is played by Night with its lamps, and by Day with the same map data (the renderer turns them off)', () => {
    expect(field).not.toBeNull();
    expect(NEON_HEIGHTS.lights!.length).toBeGreaterThanOrEqual(10);
    expect(buildNightField(mapUnderLighting(NEON_HEIGHTS, 'day'), NIGHT_SIGHT)).toBeNull();
  });

  it('hangs each lamp over the floor it lights: the street, or the Studio and the Tower gallery on Level 2', () => {
    const floors = [...field.lightFloors].map((f) => Math.round(f / storey));
    expect(floors.every((f) => f === 0 || f === 2)).toBe(true);
    expect(floors.filter((f) => f === 2)).toHaveLength(2);
    // Over head height on its floor.
    NEON_HEIGHTS.lights!.forEach((l, i) => expect(l.position.y, `lamp ${i}`).toBeGreaterThan(field.lightFloors[i]! + 2));
  });

  it('lights the avenue and the flag, and leaves every Level 1 room and the atrium corners dark, as close-up as under trees', () => {
    expect(inLight(field, vec3(0.3, 0, -11.5))).toBe(true);
    expect(nightSightRange(field, NEON_HEIGHTS.flag!)).toBe(NIGHT_SIGHT.lit);
    for (const name of ['Capsules', 'Clinic', 'Tower Level 1']) expect(nightSightRange(field, spot(name)), name).toBe(NIGHT_SIGHT.canopy);
    // The atrium is roofed three storeys up: past the chandelier's pool it is dark.
    expect(nightSightRange(field, vec3(NEON_HEIGHTS.flag!.x, 0, NEON_HEIGHTS.flag!.z + 4))).toBe(NIGHT_SIGHT.canopy);
  });

  it('keeps the stairwells dark and the Sky Bridge moonlit', () => {
    for (const l of links) {
      if (l.well === 'Plaza' || l.well === 'Grand') continue; // the plaza stair is outdoors, the grand stair in the lobby
      const mid = vec3((l.bottom.x + l.top.x) / 2, (l.bottom.y + l.top.y) / 2, (l.bottom.z + l.top.z) / 2);
      expect(nightSightRange(field, mid), l.name).toBe(NIGHT_SIGHT.canopy);
    }
    const sky = bridges.find((b) => b.name === 'Sky Bridge')!;
    const middle = vec3((sky.ends[0]!.x + sky.ends[1]!.x) / 2, sky.y, sky.ends[0]!.z);
    expect(nightSightRange(field, middle)).toBe(NIGHT_SIGHT.open);
  });

  it('lights about as much of each half, so neither end is seen further by Night', () => {
    const west = NEON_HEIGHTS.lights!.filter((l) => l.position.x < -3.5).length;
    const east = NEON_HEIGHTS.lights!.filter((l) => l.position.x > 4).length;
    expect(west).toBe(east);
  });

  it('puts every sign and window flat on solid wall, never across a door or window', () => {
    for (const [i, s] of NEON_HEIGHTS.signs!.entries()) {
      const n = NORMAL[s.facing];
      // Across the panel: right is up × normal.
      const right = vec3(-n.z, 0, n.x);
      for (const u of [-0.45, 0, 0.45]) {
        for (const v of [-0.45, 0, 0.45]) {
          const behind = vec3(
            s.centre.x + right.x * u * s.width - n.x * 0.05,
            s.centre.y + v * s.height,
            s.centre.z + right.z * u * s.width - n.z * 0.05,
          );
          const front = vec3(behind.x + n.x * 0.1, behind.y, behind.z + n.z * 0.1);
          expect(inWall(behind), `sign ${i} on wall`).toBe(true);
          expect(inWall(front), `sign ${i} faces open air`).toBe(false);
        }
      }
    }
  });
});
