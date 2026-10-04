import type { BotBehaviour } from '../config/bots';
import { type RngState, rngNext } from '../sim/rng';

/** How a team's bots spread over the lanes this round. */
export type TeamPlan = 'split' | 'pair' | 'stack';

/** Picks this round's plan by the weights in the config. */
export function pickTeamPlan(rng: RngState, cfg: BotBehaviour): TeamPlan {
  const total = cfg.planSplitWeight + cfg.planPairWeight + cfg.planStackWeight;
  const r = rngNext(rng) * total;
  if (r < cfg.planSplitWeight) return 'split';
  if (r < cfg.planSplitWeight + cfg.planPairWeight) return 'pair';
  return 'stack';
}

/** The lane indices 0..count-1 in random order. */
export function shuffledLanes(rng: RngState, count: number): number[] {
  const order = Array.from({ length: count }, (_, i) => i);
  for (let i = count - 1; i > 0; i--) {
    const j = Math.floor(rngNext(rng) * (i + 1));
    [order[i], order[j]] = [order[j]!, order[i]!];
  }
  return order;
}

/**
 * Lane per bot (in member order) for `plan`, taking lanes in the order given: split puts each bot on
 * its own lane (wrapping if there are more bots than lanes), pair puts the first two on one lane and
 * the rest on the next, stack puts everyone on one lane. With fewer than three bots (the player makes
 * up the team) a pair would be a stack, so it splits instead. Returns -1s with no lanes.
 */
export function assignLanes(plan: TeamPlan, members: number, laneOrder: readonly number[]): number[] {
  if (plan === 'pair' && members < 3) plan = 'split';
  const out: number[] = [];
  const n = laneOrder.length;
  for (let i = 0; i < members; i++) {
    if (n === 0) {
      out.push(-1);
      continue;
    }
    const slot = plan === 'stack' ? 0 : plan === 'pair' ? (i < 2 ? 0 : i - 1) : i;
    out.push(laneOrder[slot % n]!);
  }
  return out;
}
