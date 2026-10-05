import { beforeAll, describe, expect, it } from 'vitest';
import { HITS } from '../config/hits';
import { BODY } from '../config/movement';
import { DEPOT } from '../map/depot';
import type { MapData } from '../map/mapTypes';
import { NEON_HEIGHTS } from '../map/neonHeights';
import { WOODLAND } from '../map/woodland';
import { initPhysics } from '../physics/physicsWorld';
import { isInPlay } from '../sim/elimination';
import { vec3 } from '../sim/vec';
import type { Bot } from './bot';
import { setUpRun } from './extractionRunSupport';
import { eyeOf, lineClear } from './perception';

/**
 * M55 acceptance 3 on every map (QA): over 6 seeds on each map, no guard at its post goes without seeing its way in
 * (before M55: 17 of 48 guards on the three maps), and a guard at a lean post is leaning while it holds there.
 * extractionRoles.test.ts pins the same on three Depot seeds.
 */
const SEEDS = [1, 2, 3, 4, 5, 6];
const SECONDS = 12;
/** The share of its ticks at the post a guard sees its way in (measured: every guard well over this). */
const SEEN_SHARE = 0.8;
const MAPS: { name: string; map: MapData }[] = [
  { name: 'Depot', map: DEPOT },
  { name: 'Neon Heights', map: NEON_HEIGHTS },
  { name: 'Woodland', map: WOODLAND },
];

describe('Extraction: guards see their way in, on every map (M55, audit AI-01)', () => {
  beforeAll(async () => {
    await initPhysics();
  });

  for (const { name, map } of MAPS) {
    it(`${name}: no guard at its post goes without seeing its way in, over ${SEEDS.length} seeds`, () => {
      const eye = vec3();
      let guards = 0;
      let leanPosts = 0;
      for (const seed of SEEDS) {
        const r = setUpRun({ seed, map });
        const held = new Map<Bot, { at: number; seen: number; leaned: number }>();
        r.play(SECONDS, () => {
          for (const b of r.bots.bots) {
            if (b.character.team !== 1 || b.role !== 'guard' || !b.atPost) continue;
            const t = held.get(b) ?? { at: 0, seen: 0, leaned: 0 };
            t.at++;
            if (lineClear(r.physics, eyeOf(b.character, BODY, HITS, eye), b.postWatch)) t.seen++;
            if (b.character.lean !== 0) t.leaned++;
            held.set(b, t);
          }
        });
        // Every guard still in play has reached its post, and sees its way in from there.
        for (const b of r.bots.bots) {
          if (b.character.team !== 1 || b.role !== 'guard' || !isInPlay(b.character)) continue;
          const who = `${name} seed ${seed}, Red ${b.character.id}`;
          const t = held.get(b);
          expect(t, `${who} reached its post`).toBeDefined();
          guards++;
          expect(t!.seen / t!.at, `${who} sees its way in`).toBeGreaterThan(SEEN_SHARE);
          if (b.postLean === 0) continue;
          leanPosts++;
          expect(t!.leaned / t!.at, `${who} leans out`).toBeGreaterThan(SEEN_SHARE);
        }
        r.dispose();
      }
      expect(guards).toBeGreaterThan(0);
      // Each map has a post picked for a lean among these seeds, or the lean half of the check is blind.
      expect(leanPosts).toBeGreaterThan(0);
    }, 120_000);
  }
});
