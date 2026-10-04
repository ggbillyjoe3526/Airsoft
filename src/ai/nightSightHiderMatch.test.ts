import { beforeAll, describe, expect, it } from 'vitest';
import { BOTS, NIGHT_SIGHT } from '../config/bots';
import { HITS, ROUNDS } from '../config/hits';
import type { MapData } from '../map/mapTypes';
import { nightSightRange } from '../map/nightSight';
import { initPhysics } from '../physics/physicsWorld';
import { OPEN_FIELD } from '../sim/testSupport';
import { vec3 } from '../sim/vec';
import { playMatch } from './depotMatchSupport';
import { sightConditionsOf } from './perception';

/**
 * M33g QA, acceptance 1 in a real headless setup (Rapier, BotController -> BotWorld -> perceive -> visiblePart): Blue's
 * lone player stands still at the origin of an open field; Orange's three bots start 30 m east facing him and play
 * towards the other end. By day they have him in view from the start. At night in the open they do not until they are
 * within 25 m; with a lantern at his feet they do from 30 m. Every sighting is checked against the range of the spot he
 * stands on.
 */
const HIDER = vec3(0, 0, 0);
const field = (extra: Partial<MapData>): MapData => ({
  ...OPEN_FIELD,
  spawns: [
    [{ position: vec3(-30, 0, -3), yaw: 0 }, { position: vec3(-30, 0, 0), yaw: 0 }, { position: vec3(-30, 0, 3), yaw: 0 }],
    [{ position: vec3(30, 0, -3), yaw: Math.PI / 2 }, { position: vec3(30, 0, 0), yaw: Math.PI / 2 }, { position: vec3(30, 0, 3), yaw: Math.PI / 2 }],
  ],
  deadZones: [[{ position: vec3(-45, 0, 0), yaw: 0 }], [{ position: vec3(45, 0, 0), yaw: 0 }]],
  ...extra,
});
const DAY = field({});
const DARK = field({ night: true });
const LANTERN = field({ night: true, lights: [{ position: vec3(0, 2, 0), radius: 3, colour: 0xffd27a }] });

describe('bots hunting a still player at night, in a headless match (acceptance 1)', () => {
  beforeAll(async () => {
    await initPhysics();
  });

  /** The farthest a bot had the hider in view (m, while he stood at the origin), and how often one saw him past his range. */
  const hunt = (map: MapData, seconds: number) => {
    const sight = sightConditionsOf(map);
    let farthest = 0;
    let sightings = 0;
    let beyondRange = 0;
    playMatch(seconds, 5, HIDER, BOTS, 'elimination', { ...ROUNDS, eliminationFirstEnd: 0 }, map, 3, HITS, (state, controller) => {
      const hider = state.characters[0]!;
      if (hider.status !== 'alive' || state.round.phase !== 'live') return;
      const range = sight.night ? Math.min(BOTS.viewDistance, nightSightRange(sight.night, hider.position)) : BOTS.viewDistance;
      for (const b of controller.bots) {
        if (!b.targetVisible || b.targetId !== hider.id) continue;
        const d = Math.hypot(b.character.position.x - hider.position.x, b.character.position.z - hider.position.z);
        sightings++;
        farthest = Math.max(farthest, d);
        // A bot moves up to a step between sensing and this check.
        if (d > range + 0.5 && d > BOTS.closeAwareness) beyondRange++;
      }
    });
    return { farthest, sightings, beyondRange };
  };

  it('has them see him from beyond 25 m by day, never from beyond 25 m in the dark, and from 30 m and more by a lantern', { timeout: 45_000 }, () => {
    const day = hunt(DAY, 40);
    expect(day.farthest, 'by day, bots spot him from afar').toBeGreaterThan(NIGHT_SIGHT.open + 3);
    expect(day.farthest).toBeLessThanOrEqual(BOTS.viewDistance + 0.5);

    const dark = hunt(DARK, 40);
    expect(dark.sightings, 'in the dark they do find him once close').toBeGreaterThan(0);
    expect(dark.farthest, 'in the open at night: not beyond 25 m').toBeLessThanOrEqual(NIGHT_SIGHT.open + 0.5);
    expect(dark.beyondRange).toBe(0);

    const lit = hunt(LANTERN, 40);
    expect(lit.farthest, 'by a lantern: as far as by day').toBeGreaterThan(NIGHT_SIGHT.open + 3);
    expect(lit.farthest).toBeLessThanOrEqual(BOTS.viewDistance + 0.5);
    expect(lit.beyondRange).toBe(0);
  });
});
