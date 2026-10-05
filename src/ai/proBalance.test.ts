import { beforeAll, describe, expect, it } from 'vitest';
import { BOT_SKILL, botConfig, type Difficulty } from '../config/bots';
import { HITS, ROUNDS } from '../config/hits';
import { DEPOT } from '../map/depot';
import { inLight } from '../map/nightSight';
import { WOODLAND } from '../map/woodland';
import { initPhysics } from '../physics/physicsWorld';
import { vec3 } from '../sim/vec';
import { playMatch } from './depotMatchSupport';
import { depotBots } from './testSupport';

/**
 * M40's two Pro-only bot changes for map balance (the Pro guards in depotMatch.pro*.test.ts and woodlandMatch.pro*.test.ts
 * measure what they do to a match): hunting the middle of the map once a lane is swept (huntsMiddle), and holding lane
 * points out of the light on a night field (keepsDark). Easy, Normal and Hard do neither.
 */

describe('Pro-only map balance skills (M40)', () => {
  it('only Pro hunts the middle and keeps out of the light', () => {
    for (const d of ['easy', 'normal', 'hard'] as Difficulty[]) {
      expect(BOT_SKILL[d].huntsMiddle, d).toBe(false);
      expect(BOT_SKILL[d].keepsDark, d).toBe(false);
    }
    expect(BOT_SKILL.pro.huntsMiddle).toBe(true);
    expect(BOT_SKILL.pro.keepsDark).toBe(true);
  });

  it('a Pro bot hunts spots near the middle of the map; a Hard one heads for the far end', () => {
    // The middle: halfway between the two teams' spawn centres.
    const centre = (team: number) => {
      const s = DEPOT.spawns[team]!;
      return { x: s.reduce((a, p) => a + p.position.x, 0) / s.length, z: s.reduce((a, p) => a + p.position.z, 0) / s.length };
    };
    const mid = { x: (centre(0).x + centre(1).x) / 2, z: (centre(0).z + centre(1).z) / 2 };
    const meanFromMiddle = (level: Difficulty) => {
      const { bots } = depotBots('elimination', undefined, botConfig(level));
      const b = bots.bots[0]!;
      const out = vec3();
      let sum = 0;
      for (let i = 0; i < 100; i++) {
        expect(bots.worldForTests.huntPoint(b, out)).toBe(true);
        sum += Math.hypot(out.x - mid.x, out.z - mid.z);
      }
      return sum / 100;
    };
    const pro = meanFromMiddle('pro');
    const hard = meanFromMiddle('hard');
    // Depot is 40 m end to end: the middle's sectors are a few metres off for Pro, the far end's 15 m and more for Hard.
    expect(pro, `pro ${pro.toFixed(1)} m, hard ${hard.toFixed(1)} m`).toBeLessThan(hard / 2);
  });

  describe('holding out of the light on Woodland at night (keepsDark)', () => {
    /** Seeds measured: one seed's share swings with its fights (seed 1 read 43 % with torches on the maps before M55, seeds 2-4 7-21 %). */
    const SEEDS = 4;
    beforeAll(async () => {
      await initPhysics();
    });

    it('Pro defenders hold their posts in the fort at the edge of the lanterns\' light; Hard ones stand in it', { timeout: 150_000 }, () => {
      const litAtPost = (level: Difficulty) => {
        let atPost = 0;
        let lit = 0;
        for (let seed = 1; seed <= SEEDS; seed++) playMatch(120, seed, undefined, botConfig(level), 'attackDefend', ROUNDS, WOODLAND, 4, HITS, (state, bots) => {
          if (state.round.phase !== 'live') return;
          const night = bots.worldForTests.sight!.night!;
          for (const b of bots.bots) {
            if (b.character.team === state.round.attackers || !b.atPost || b.character.status !== 'alive') continue;
            atPost++;
            if (inLight(night, b.character.position)) lit++;
          }
        });
        return { atPost, lit };
      };
      const pro = litAtPost('pro');
      const hard = litAtPost('hard');
      const said = `pro ${JSON.stringify(pro)}, hard ${JSON.stringify(hard)}`;
      expect(pro.atPost).toBeGreaterThan(0);
      expect(hard.atPost).toBeGreaterThan(0);
      // Measured 2026-10-05 (M57, seeds 1-4, 120 s each, every bot carrying its torch as the game fits it): Pro in the
      // light for 18 % of its time at a post (it stops a step short of the pool's edge), Hard for 92 % (on M55's maps;
      // on the maps before M55, seed 1 alone read 43 % for Pro). Before M57 (no torches, seed 1 alone): Pro 24 %, Hard
      // 94 %.
      expect(pro.lit / pro.atPost, said).toBeLessThan(0.35);
      expect(hard.lit / hard.atPost, said).toBeGreaterThan(0.8);
    });
  });
});
