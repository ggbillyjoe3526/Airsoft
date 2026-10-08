import { beforeAll, expect, it } from 'vitest';
import { BOTS } from '../config/bots';
import { ROUNDS } from '../config/hits';
import { DEPOT } from '../map/depot';
import { initPhysics } from '../physics/physicsWorld';
import { isInPlay } from '../sim/elimination';
import type { GameState } from '../sim/state';
import { playMatch } from './depotMatchSupport';

beforeAll(async () => {
  await initPhysics();
});

/** Centres closer than this on about one floor count as two characters inside each other (the audit's P5b probe). */
const INSIDE = 0.45;

/** Counts live ticks, and those on which any two characters in play stand inside each other. */
function overlapCounter() {
  const n = { live: 0, overlap: 0 };
  const onTick = (state: GameState) => {
    if (state.round.phase !== 'live') return;
    n.live++;
    const cs = state.characters;
    for (let i = 0; i < cs.length; i++) {
      const a = cs[i]!;
      if (!isInPlay(a)) continue;
      for (let j = i + 1; j < cs.length; j++) {
        const b = cs[j]!;
        if (!isInPlay(b) || Math.abs(a.position.y - b.position.y) > 1) continue;
        if (Math.hypot(a.position.x - b.position.x, a.position.z - b.position.z) < INSIDE) {
          n.overlap++;
          return;
        }
      }
    }
  };
  return { n, onTick };
}

it('keeps bots out of each other: two characters stand inside each other on under 0.5 % of live ticks (audit AI-01)', { timeout: 120_000 }, () => {
  // Measured 2026-10-04 (FA4), 180 s per seed: 0.15 / 0.18 / 0.21 % for seeds 1-3, from 5.80 / 8.00 / 3.45 % before
  // (bots sharing a lane point or a cover spot, nothing keeping them apart). M71 (every level hunts the middle): seed 2
  // read 0.78 %, two teammates who met in one fight strafing through each other; with a fight's sidestep turned to
  // the side the push points, 0.27 / 0.10 / 0.27 %.
  for (const seed of [1, 2, 3]) {
    const { n, onTick } = overlapCounter();
    playMatch(180, seed, undefined, BOTS, 'elimination', ROUNDS, DEPOT, ROUNDS.teamSize, undefined, onTick);
    expect(n.live, `seed ${seed}`).toBeGreaterThan(5000);
    expect(n.overlap / n.live, `seed ${seed}: ${n.overlap} of ${n.live} live ticks`).toBeLessThan(0.005);
  }
});
