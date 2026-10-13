import type { BotBehaviour } from '../config/bots';
import { type RngState, rngNext } from '../sim/rng';
import type { Vec3 } from '../sim/vec';

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

/** The middle of a lane's points on the ground (x, z), or null for a lane without any. */
function laneMiddle(points: readonly Vec3[] | undefined): { x: number; z: number } | null {
  if (!points || points.length === 0) return null;
  let x = 0;
  let z = 0;
  for (const p of points) {
    x += p.x;
    z += p.z;
  }
  return { x: x / points.length, z: z / points.length };
}

/**
 * Bots that keep a lane of their own (BN1, bots.md › Own lane: `own`, per member) and were dealt one a teammate shares:
 * each in member order moves to a free lane, the one whose middle is furthest from the nearest lane the team still
 * uses, so it comes round the side. `lanes` (per member, from assignLanes) changes in place; nothing moves when no lane
 * is free. Once a round, as the plan is made.
 */
export function takeOwnLanes(own: readonly boolean[], lanes: number[], laneDefs: readonly (readonly Vec3[])[]): void {
  for (let i = 0; i < lanes.length; i++) {
    const lane = lanes[i]!;
    if (!own[i] || lane < 0 || !lanes.some((l, j) => j !== i && l === lane)) continue;
    let best = -1;
    let bestGap = -1;
    for (let free = 0; free < laneDefs.length; free++) {
      if (lanes.includes(free)) continue;
      const mid = laneMiddle(laneDefs[free]);
      if (!mid) continue;
      // How far this free lane runs from the nearest lane in use (the moving bot's leaves with it).
      let gap = Number.POSITIVE_INFINITY;
      for (let j = 0; j < lanes.length; j++) {
        if (j === i) continue;
        const used = laneMiddle(laneDefs[lanes[j]!]);
        if (used) gap = Math.min(gap, Math.hypot(mid.x - used.x, mid.z - used.z));
      }
      if (gap > bestGap) {
        bestGap = gap;
        best = free;
      }
    }
    if (best >= 0) lanes[i] = best;
  }
}
