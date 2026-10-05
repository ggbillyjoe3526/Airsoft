import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type * as BotsConfig from '../config/bots';
import { HITS, ROUNDS } from '../config/hits';
import { SIM_DT } from '../config/sim';
import type * as NightSight from '../map/nightSight';
import type { MapData } from '../map/mapTypes';
import { isInPlay } from '../sim/elimination';
import type { playMatch as PlayMatch } from './depotMatchSupport';

// Count the night fields built: the canopy grid must be made once as a match loads, never while it runs.
vi.mock('../map/nightSight', async (importOriginal) => {
  const real = await importOriginal<typeof import('../map/nightSight')>();
  return { ...real, buildNightField: vi.fn(real.buildNightField) };
});

/**
 * M33g QA, acceptances 1, 2 and 5 together: a 4v4 bot match on the real Woodland with its night field and its bushes.
 * Every few ticks each bot's sight of each enemy is checked against the range of the spot the enemy stands on; the
 * dark must matter (someone within viewDistance was hidden by it), and the canopy grid is built exactly once.
 */
const TEAM_SIZE = 4;
const SAMPLE_EVERY = 4;

describe('a 4v4 bot match on Woodland at night (M33g, acceptances 1, 2 and 5)', () => {
  // Test files share a worker's modules (isolate: false): another file may already have loaded the bots with the real
  // night field, so this file loads its own copies, with the mock, and leaves a clean registry behind.
  let nightSight: typeof NightSight;
  let WOODLAND: MapData;
  let playMatch: typeof PlayMatch;
  let BOTS: typeof BotsConfig.BOTS;
  let NIGHT_SIGHT: typeof BotsConfig.NIGHT_SIGHT;
  beforeAll(async () => {
    vi.resetModules();
    ({ BOTS, NIGHT_SIGHT } = await import('../config/bots'));
    nightSight = await import('../map/nightSight');
    ({ WOODLAND } = await import('../map/woodland'));
    ({ playMatch } = await import('./depotMatchSupport'));
    await (await import('../physics/physicsWorld')).initPhysics();
  });
  afterAll(() => vi.resetModules());

  it('keeps every sighting inside the target\'s light range, hides people in the dark, builds the canopy grid once, and finishes rounds', { timeout: 45_000 }, () => {
    const build = vi.mocked(nightSight.buildNightField);
    build.mockClear();
    let sampled = 0;
    let hiddenByDark = 0;
    let seenLit = 0;
    let seenDark = 0;
    let visibleBeyond = 0;
    // Each character's night range over the last ticks, newest last: a bot looks every thinkInterval, so the target it
    // has in view it saw where it stood up to that long ago. A step from the moonlit open in under the trees takes its
    // range from 25 m to 10 m; M55's Woodland fixes dealt this seed bots that took that step between two looks.
    const lookTicks = Math.ceil(BOTS.thinkInterval / SIM_DT) + 1;
    const ranges = new Map<number, number[]>();
    let buildsAtFirstTick = -1;
    let sightRef: unknown;
    let gridRef: unknown;
    let sightChanged = false;
    const stats = playMatch(150, 3, undefined, BOTS, 'elimination', ROUNDS, WOODLAND, TEAM_SIZE, HITS, (state, controller) => {
      const world = controller.worldForTests;
      if (buildsAtFirstTick < 0) {
        buildsAtFirstTick = build.mock.calls.length;
        sightRef = world.sight;
        gridRef = world.sight?.night?.canopy;
      }
      if (world.sight !== sightRef || world.sight?.night?.canopy !== gridRef) sightChanged = true;
      const field = world.sight!.night!;
      for (const c of state.characters) {
        const recent = ranges.get(c.id) ?? [];
        recent.push(nightSight.nightSightRange(field, c.position));
        if (recent.length > lookTicks) recent.shift();
        ranges.set(c.id, recent);
      }
      if (state.tick % SAMPLE_EVERY !== 0 || state.round.phase !== 'live') return;
      for (const b of controller.bots) {
        const me = b.character;
        if (!isInPlay(me)) continue;
        for (const other of state.characters) {
          if (other.team === me.team || !isInPlay(other)) continue;
          const dist = Math.hypot(other.position.x - me.position.x, other.position.z - me.position.z);
          const range = Math.min(BOTS.viewDistance, nightSight.nightSightRange(field, other.position));
          if (dist > BOTS.viewDistance) continue;
          sampled++;
          if (dist > range && dist > BOTS.closeAwareness) hiddenByDark++;
          // What a bot has in view as its target, it had within the range of the spot the target stood on when it last
          // looked (and 0.6 m for how far either moved since).
          if (b.targetVisible && b.targetId === other.id) {
            const lookedRange = Math.min(BOTS.viewDistance, Math.max(...ranges.get(other.id)!));
            if (dist > lookedRange + 0.6 && dist > BOTS.closeAwareness) visibleBeyond++;
            if (nightSight.inLight(field, other.position)) seenLit++;
            else seenDark++;
          }
        }
      }
      // The night field alone (M33g), without the torches the game fits (M57): woodlandTorchMatch.test.ts checks the same
      // bound with torchlight on the real roster.
    }, undefined, false);
    expect(sampled).toBeGreaterThan(300);
    expect(visibleBeyond, 'no bot ever had a target in view beyond that target\'s night range').toBe(0);
    expect(hiddenByDark, 'the dark hides enemies from bots in play').toBeGreaterThan(0);
    expect(seenDark + seenLit, 'bots do still see each other').toBeGreaterThan(0);
    // The grid is made as the match loads (once, by playMatch's controller) and nothing rebuilds it while it plays.
    expect(buildsAtFirstTick).toBe(1);
    expect(build.mock.calls.length).toBe(1);
    expect(build.mock.calls[0]![0]).toBe(WOODLAND);
    expect(build.mock.calls[0]![1]).toBe(NIGHT_SIGHT);
    expect(sightChanged).toBe(false);
    // Bots still play: rounds end, BBs fly and hit.
    expect(stats.rounds).toBeGreaterThanOrEqual(1);
    expect(stats.shots).toBeGreaterThan(50);
    expect(stats.hits).toBeGreaterThan(0);
  });
});
