import { describe, expect, it } from 'vitest';
import { MOVEMENT } from '../config/movement';
import { CROUCHED_EYE, mapGeometry, STANDING_EYE, standPoints } from '../content/mapLayout';
import { type MapId, mapData } from '../map/maps';
import type { WorldQuery } from './armament';
import { restTop } from './coverRest';
import { castLevelRay } from './levelRay';

/**
 * Resting on cover on the real maps (M104): from places a player can stand, one a square metre, facing each of 16
 * ways, through the maps' own ray (the one the physics world answers with, surfaces and all), how many places give a
 * rest standing and crouched. Measured 2026-10-13 (standing, crouched): Depot 138 and 1 (its crates, barriers,
 * sandbags, generators and skips are all 1.2 m: you hide behind them crouched and stand up to rest on them), Woodland
 * 204 and 47 (logs and boulders), Neon Heights 309 and 79 (barriers, crates, planters and low walls, on every floor).
 * Each bound is half of that, so a map edit that strips a map of its rests fails here; Depot has no crouched bound.
 */
const FLOOR: Record<MapId, { standing: number; crouched: number }> = {
  depot: { standing: 69, crouched: 0 },
  woodland: { standing: 102, crouched: 23 },
  neonHeights: { standing: 154, crouched: 39 },
};

describe('cover to rest on, on every map (M104)', () => {
  for (const id of Object.keys(FLOOR) as MapId[]) {
    it(`${id} has crates, walls or sills to rest on`, () => {
      const geo = mapGeometry(mapData(id));
      const query: WorldQuery = {
        raycastStatic: (o, d, m) => castLevelRay(geo.level, o, d, m),
        raycastSurface: (o, d, m, out) => castLevelRay(geo.level, o, d, m, out),
      };
      let standing = 0;
      let crouched = 0;
      for (const p of standPoints(geo, 1)) {
        let stand = false;
        let crouch = false;
        for (let k = 0; k < 16; k++) {
          const yaw = (k / 16) * Math.PI * 2;
          stand ||= !Number.isNaN(restTop(p.x, p.z, p.y + STANDING_EYE, yaw, 0, MOVEMENT.rest, query));
          crouch ||= !Number.isNaN(restTop(p.x, p.z, p.y + CROUCHED_EYE, yaw, 0, MOVEMENT.rest, query));
        }
        if (stand) standing++;
        if (crouch) crouched++;
      }
      expect(standing, `${id} standing rests (crouched ${crouched})`).toBeGreaterThanOrEqual(FLOOR[id].standing);
      expect(crouched, `${id} crouched rests (standing ${standing})`).toBeGreaterThanOrEqual(FLOOR[id].crouched);
    });
  }
});
