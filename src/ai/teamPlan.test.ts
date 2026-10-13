import { describe, expect, it } from 'vitest';
import { BOTS } from '../config/bots';
import { createRng } from '../sim/rng';
import { vec3 } from '../sim/vec';
import { assignLanes, pickTeamPlan, shuffledLanes, takeOwnLanes, type TeamPlan } from './teamPlan';

describe('team plans', () => {
  it('deal lanes: split spreads out, pair doubles up two, stack puts everyone on one lane', () => {
    expect(assignLanes('split', 3, [2, 0, 1])).toEqual([2, 0, 1]);
    expect(assignLanes('split', 4, [2, 0, 1])).toEqual([2, 0, 1, 2]); // more bots than lanes: wraps
    expect(assignLanes('pair', 3, [1, 2, 0])).toEqual([1, 1, 2]);
    expect(assignLanes('pair', 2, [1, 2, 0])).toEqual([1, 2]); // two bots (plus the player): a pair would be a stack
    expect(assignLanes('stack', 3, [0, 2, 1])).toEqual([0, 0, 0]);
    expect(assignLanes('split', 2, [])).toEqual([-1, -1]); // no lanes on the map
  });

  it('pick plans by their weights', () => {
    const rng = createRng(3);
    const counts: Record<TeamPlan, number> = { split: 0, pair: 0, stack: 0 };
    const n = 4000;
    for (let i = 0; i < n; i++) counts[pickTeamPlan(rng, BOTS)]++;
    const total = BOTS.planSplitWeight + BOTS.planPairWeight + BOTS.planStackWeight;
    expect(counts.split / n).toBeCloseTo(BOTS.planSplitWeight / total, 1);
    expect(counts.pair / n).toBeCloseTo(BOTS.planPairWeight / total, 1);
    expect(counts.stack / n).toBeCloseTo(BOTS.planStackWeight / total, 1);
  });

  it('shuffle lanes into every order over time', () => {
    const rng = createRng(8);
    const seen = new Set<string>();
    for (let i = 0; i < 200; i++) {
      const order = shuffledLanes(rng, 3);
      expect([...order].sort()).toEqual([0, 1, 2]);
      seen.add(order.join());
    }
    expect(seen.size).toBe(6);
  });
});

describe('a lane of its own (BN1, the flanker)', () => {
  // Four lanes side by side, 10 m apart along x, each two points long towards -z.
  const LANES = [0, 10, 20, 30].map((x) => [vec3(x, 0, 0), vec3(x, 0, -20)]);

  it('moves a bot that keeps its own lane off a shared lane, to the free lane furthest from the team\'s', () => {
    const lanes = [1, 1, 2];
    takeOwnLanes([false, true, false], lanes, LANES);
    // Lanes 1 and 2 stay in use: free lane 0 is 10 m from lane 1, free lane 3 is 10 m from lane 2; the first wins a tie.
    expect(lanes).toEqual([1, 0, 2]);
    const stacked = [0, 0, 0];
    takeOwnLanes([true, false, false], stacked, LANES);
    expect(stacked).toEqual([3, 0, 0]);
  });

  it('leaves a bot alone on a lane of its own already, a bot that shares happily, and everyone when no lane is free', () => {
    const own = [0, 2, 2];
    takeOwnLanes([true, false, false], own, LANES);
    expect(own).toEqual([0, 2, 2]);
    const full = [0, 0, 1, 2, 3];
    takeOwnLanes([true, true, true, true, true], full, LANES);
    expect(full).toEqual([0, 0, 1, 2, 3]);
  });

  it('gives two bots that keep their own lanes a lane each', () => {
    const lanes = [1, 1, 1];
    takeOwnLanes([true, true, false], lanes, LANES);
    expect(new Set(lanes).size).toBe(3);
  });
});
