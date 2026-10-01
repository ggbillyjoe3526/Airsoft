import { describe, expect, it } from 'vitest';
import { BOTS } from '../config/bots';
import { createRng } from '../sim/rng';
import { assignLanes, pickTeamPlan, shuffledLanes, type TeamPlan } from './teamPlan';

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
