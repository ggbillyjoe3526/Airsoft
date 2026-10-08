import { beforeAll, describe, expect, it } from 'vitest';
import { BOT_SKILL, type BotConfig, botConfig, type Difficulty } from '../config/bots';
import { HITS, ROUNDS } from '../config/hits';
import { DEPOT } from '../map/depot';
import { inLight } from '../map/nightSight';
import { WOODLAND } from '../map/woodland';
import { initPhysics } from '../physics/physicsWorld';
import { vec3 } from '../sim/vec';
import { playMatch } from './depotMatchSupport';
import { depotBots } from './testSupport';

/**
 * The two map balance habits (M40 for Pro; every level since Audit 2, BAL-01 and BAL-02): hunting the middle of the map
 * once a lane is swept (huntsMiddle, every level), and holding lane points out of the light on a night field (keepsDark,
 * Normal and up). The guards in woodlandMatch.levels*.test.ts, depotMatch*.test.ts and the Pro guards measure what they
 * do to a match; here, that each habit does what it says against the same level with it turned off.
 */

describe('map balance habits (M40, Audit 2)', () => {
  it('every level hunts the middle; Normal and up keep out of the light, Easy stands where its lane says', () => {
    for (const d of ['easy', 'normal', 'hard', 'pro'] as Difficulty[]) expect(BOT_SKILL[d].huntsMiddle, d).toBe(true);
    for (const d of ['normal', 'hard', 'pro'] as Difficulty[]) expect(BOT_SKILL[d].keepsDark, d).toBe(true);
    expect(BOT_SKILL.easy.keepsDark).toBe(false);
  });

  it('a bot that hunts the middle hunts spots near it; one without the habit heads for the far end', () => {
    // The middle: halfway between the two teams' spawn centres.
    const centre = (team: number) => {
      const s = DEPOT.spawns[team]!;
      return { x: s.reduce((a, p) => a + p.position.x, 0) / s.length, z: s.reduce((a, p) => a + p.position.z, 0) / s.length };
    };
    const mid = { x: (centre(0).x + centre(1).x) / 2, z: (centre(0).z + centre(1).z) / 2 };
    const meanFromMiddle = (cfg: BotConfig) => {
      const { bots } = depotBots('elimination', undefined, cfg);
      const b = bots.bots[0]!;
      const out = vec3();
      let sum = 0;
      for (let i = 0; i < 100; i++) {
        expect(bots.worldForTests.huntPoint(b, out)).toBe(true);
        sum += Math.hypot(out.x - mid.x, out.z - mid.z);
      }
      return sum / 100;
    };
    const middle = meanFromMiddle(botConfig('hard'));
    const farEnd = meanFromMiddle({ ...botConfig('hard'), huntsMiddle: false });
    // Depot is 40 m end to end: the middle's sectors are a few metres off with the habit, the far end's 15 m and more without.
    expect(middle, `middle ${middle.toFixed(1)} m, far end ${farEnd.toFixed(1)} m`).toBeLessThan(farEnd / 2);
  });

  describe('holding out of the light on Woodland at night (keepsDark)', () => {
    /** Seeds measured: one seed's share swings with its fights (seed 1 read 43 % with torches on the maps before M55, seeds 2-4 7-21 %). */
    const SEEDS = 4;
    beforeAll(async () => {
      await initPhysics();
    });

    it('defenders who keep out of the light hold their posts in the fort at the edge of the lanterns\' light; without the habit they stand in it', { timeout: 150_000 }, () => {
      const litAtPost = (cfg: BotConfig) => {
        let atPost = 0;
        let lit = 0;
        for (let seed = 1; seed <= SEEDS; seed++) playMatch(120, seed, undefined, cfg, 'attackDefend', ROUNDS, WOODLAND, 4, HITS, (state, bots) => {
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
      const dark = litAtPost(botConfig('hard'));
      const lit = litAtPost({ ...botConfig('hard'), keepsDark: false });
      const said = `Hard ${JSON.stringify(dark)}, Hard without keepsDark ${JSON.stringify(lit)}`;
      expect(dark.atPost).toBeGreaterThan(0);
      expect(lit.atPost).toBeGreaterThan(0);
      // Measured 2026-10-05 (M57, seeds 1-4, 120 s each, every bot carrying its torch as the game fits it): Pro in the
      // light for 18 % of its time at a post (it stops a step short of the pool's edge), Hard for 92 % (on M55's maps;
      // on the maps before M55, seed 1 alone read 43 % for Pro). Before M57 (no torches, seed 1 alone): Pro 24 %, Hard
      // 94 %. Since Hard keeps out of the light too (M71, Audit 2) the test compares it with and without the habit: 21 %
      // (12,901 of 61,410 ticks at a post) against 92 % (56,375 of 60,976).
      expect(dark.lit / dark.atPost, said).toBeLessThan(0.35);
      expect(lit.lit / lit.atPost, said).toBeGreaterThan(0.8);
    });
  });
});
