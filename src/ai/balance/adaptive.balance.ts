import { beforeAll, describe, it } from 'vitest';
import { BOT_BEHAVIOUR, type BotConfig, botConfig, type Difficulty } from '../../config/bots';
import { initPhysics } from '../../physics/physicsWorld';
import { AdaptiveRun } from '../adaptiveRun';
import { levelAt, levelRating, ratingWords, skillAt } from '../adaptiveSkill';
import { playMatch } from '../depotMatchSupport';
import { duel, noWalls } from '../testSupport';
import { reportMeasure } from './balanceSupport';

/**
 * Adaptive difficulty (AD1). Two measures:
 *
 * - **In between.** A bot's first hit on a player standing in the open at 5 and 10 m, at every half step from Easy to
 *   Pro: an in-between skill should land its first hit between the two levels around it (the band is theirs). The mean
 *   time over the duels that hit, not the median: bursts and ticks make the median lumpy. Measured 2026-10-13 (AD1):
 *   with medians over 60 seeds, Hard-Pro at 10 m read 0.925 s against Pro's 0.95 s; over 200 seeds the median was
 *   Pro's own (0.917 s) while the mean ran Hard 1.23, 2.25 1.10, 2.5 0.95, 2.75 0.89, Pro 0.84 s.
 * - **It follows you.** Depot 3v3 bot matches where Alpha stands in for you at a fixed level and Beta adapts from Normal,
 *   round by round and match by match, as a real match does (character 0 is "you" for its hit counts): against Hard
 *   play Beta's rating should climb, against Easy play fall.
 */
const DUEL_SEEDS = 60;
const DUEL_SECONDS = 6;
const RATINGS = [0, 0.5, 1, 1.5, 2, 2.5, 3] as const;
const CHAINS = 4;
const MATCHES = 8;
const MATCH_SECONDS = 150;

/** The mean of the finite times (the duels that hit), and how many those are. */
const meanHit = (xs: readonly number[]): { mean: number; hit: number } => {
  const hit = xs.filter(Number.isFinite);
  return { mean: hit.length > 0 ? hit.reduce((s, x) => s + x, 0) / hit.length : Number.NaN, hit: hit.length };
};

const configAt = (rating: number): BotConfig => ({ ...BOT_BEHAVIOUR, ...skillAt(rating, levelAt(rating)) });

/** Seconds from the bot first seeing the player to its first hit on them in one duel; Infinity when it never hits. */
function duelFirstHit(cfg: BotConfig, dist: number, seed: number): number {
  const { state, bots, run } = duel(dist, () => {}, noWalls, cfg, seed);
  let took = Number.POSITIVE_INFINITY;
  run(DUEL_SECONDS, () => {
    if (took < Number.POSITIVE_INFINITY) return;
    for (const e of state.events) if (e.type === 'characterHit' && e.victimId === 0) took = state.time - (bots.bots[0]!.contacts.get(0)?.firstSeenAt ?? 0);
  });
  return took;
}

/**
 * One chain of MATCHES Depot matches: Alpha at `you` throughout, Beta adapting from Normal. Returns Beta's rating after
 * each match and the share of decided rounds Beta won over the chain's second half.
 */
function chain(you: Difficulty, seed: number): { ratings: number[]; lateShare: number } {
  const mine = botConfig(you);
  let rating = levelRating('normal');
  const ratings: number[] = [];
  let lateWon = 0;
  let lateDecided = 0;
  for (let m = 0; m < MATCHES; m++) {
    const run = new AdaptiveRun(rating, 2, levelAt(rating), { id: 0, team: 0 });
    const teamOf = (id: number): number | undefined => (id < 3 ? 0 : 1);
    let first = true;
    const stats = playMatch(MATCH_SECONDS, seed * 100 + m, undefined, configAt(rating), 'elimination', undefined, undefined, undefined, undefined, (state, bots) => {
      if (first) {
        bots.setTeamSkill(0, mine);
        first = false;
      }
      if (run.observe(state.events, teamOf)) bots.setTeamSkill(1, run.skill());
    });
    let alpha = 0;
    let beta = 0;
    for (const r of stats.results) {
      if (r.winner === 0) alpha++;
      else if (r.winner === 1) beta++;
    }
    if (m >= MATCHES / 2) {
      lateWon += beta;
      lateDecided += alpha + beta;
    }
    rating = run.next(alpha > beta);
    ratings.push(rating);
  }
  return { ratings, lateShare: lateDecided > 0 ? lateWon / lateDecided : Number.NaN };
}

describe('adaptive difficulty (AD1)', () => {
  beforeAll(async () => {
    await initPhysics();
  });

  for (const dist of [5, 10] as const) {
    it(`measures the first hit at ${dist} m at every half step from Easy to Pro`, { timeout: 600_000 }, (ctx) => {
      const means = RATINGS.map((r) => {
        const times: number[] = [];
        for (let seed = 1; seed <= DUEL_SEEDS; seed++) times.push(duelFirstHit(configAt(r), dist, seed));
        return meanHit(times);
      });
      RATINGS.forEach((r, i) => {
        if (Number.isInteger(r)) return;
        const [below, at, above] = [means[i - 1]!, means[i]!, means[i + 1]!];
        // Between its neighbours: no quicker than the level above, no slower than the level below.
        reportMeasure(ctx, {
          label: `Duel at ${dist} m, ${ratingWords(r)} (${r}), a player standing still: mean time to the bot's first hit`,
          value: at.mean,
          band: { min: above.mean, max: below.mean },
          unit: 's',
          detail: `${ratingWords(r - 0.5)} ${below.mean.toFixed(2)} s, ${ratingWords(r + 0.5)} ${above.mean.toFixed(2)} s; ${at.hit} of ${DUEL_SEEDS} hit within ${DUEL_SECONDS} s; seeds 1-${DUEL_SEEDS}`,
        });
      });
    });
  }

  for (const you of ['hard', 'easy'] as const) {
    it(`measures Beta's rating after ${MATCHES} Depot matches against ${you} play, from Normal`, { timeout: 1_800_000 }, (ctx) => {
      const chains = Array.from({ length: CHAINS }, (_, i) => chain(you, i + 1));
      const finals = chains.map((c) => c.ratings.at(-1)!);
      const mean = finals.reduce((s, x) => s + x, 0) / finals.length;
      reportMeasure(ctx, {
        label: `Depot, Elimination, Beta adapting against Alpha at ${you}: Beta's rating after ${MATCHES} matches`,
        value: mean,
        band: you === 'hard' ? { min: 1.2 } : { max: 0.8 },
        unit: '',
        detail: chains.map((c) => c.ratings.map((r) => r.toFixed(2)).join(' → ')).join('; '),
      });
      const late = chains.reduce((s, c) => s + c.lateShare, 0) / chains.length;
      reportMeasure(ctx, {
        label: `Depot, Elimination, Beta adapting against Alpha at ${you}: Beta's share of decided rounds over the last ${MATCHES / 2} matches`,
        value: late,
        band: {},
        detail: `mean of ${CHAINS} chains; seeds ${CHAINS} × ${MATCHES} matches, ${MATCH_SECONDS} s each`,
      });
    });
  }
});
