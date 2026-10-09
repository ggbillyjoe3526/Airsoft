import { beforeAll, describe, it } from 'vitest';
import { botConfig, type Difficulty } from '../../config/bots';
import { initPhysics } from '../../physics/physicsWorld';
import { playMatch } from '../depotMatchSupport';
import { duel, noWalls } from '../testSupport';
import { reportMeasure, share } from './balanceSupport';

/**
 * How long a bot takes to land its first BB on someone up close (G11, the owner's "bots land hits within a few moments
 * at 5 to 10 metres"), from the moment it first sees them. Two measures:
 *
 * - **Duel.** One bot against a player standing still in the open, facing it, `DUEL_SEEDS` seeds at 5 and 10 m on every
 *   level: the median time to the first hit, and the share of duels where the first hit came sooner than `FAIR_MOMENT`
 *   (the time a player needs to see the BBs coming, turn and answer; G11's target is that few duels end that soon).
 * - **Match.** Depot 3v3 bot matches at Normal (the headless harness, depotMatchSupport.ts): every first hit a bot
 *   lands on someone it saw from 4 to 11.5 m, timed from when it first saw them (a hit on someone it never saw, by a
 *   stray BB, is left out).
 */
const DUEL_SEEDS = 120;
const DUEL_SECONDS = 6;
const DISTANCES = [5, 10] as const;
const LEVELS: readonly Difficulty[] = ['easy', 'normal', 'hard', 'pro'];
/** A player's fair moment to answer a bot that opens up close (s): seeing the BBs, turning, aiming. */
const FAIR_MOMENT = 0.75;
/** G11's targets at Normal: a median first hit at least this late (s), and at most this share inside the fair moment. */
const NORMAL_MEDIAN_MIN = 1;
const FAST_SHARE_MAX = 0.15;
const MATCH_SEEDS = 16;
const MATCH_SECONDS = 150;
/** The match measure's two distance bins (metres at the first sight). */
const BINS = [
  { label: '4-7 m', min: 4, max: 7 },
  { label: '8.5-11.5 m', min: 8.5, max: 11.5 },
] as const;

const median = (xs: readonly number[]): number => {
  if (xs.length === 0) return Number.NaN;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
};

/** The lower and upper quartiles of `xs`, as "0.61-1.20 s". */
const quartiles = (xs: readonly number[]): string => {
  const s = [...xs].sort((a, b) => a - b);
  const half = Math.floor(s.length / 2);
  return `${median(s.slice(0, half)).toFixed(2)}-${median(s.slice(s.length - half)).toFixed(2)} s`;
};

/** Seconds from the bot first seeing the player to its first hit on them in one duel; Infinity when it never hits. */
function duelFirstHit(level: Difficulty, dist: number, seed: number): number {
  const { state, bots, run } = duel(dist, () => {}, noWalls, botConfig(level), seed);
  let took = Number.POSITIVE_INFINITY;
  run(DUEL_SECONDS, () => {
    if (took < Number.POSITIVE_INFINITY) return;
    for (const e of state.events) if (e.type === 'characterHit' && e.victimId === 0) took = state.time - (bots.bots[0]!.contacts.get(0)?.firstSeenAt ?? 0);
  });
  return took;
}

describe("a bot's first hit up close (G11)", () => {
  beforeAll(async () => {
    await initPhysics();
  });

  for (const level of LEVELS) {
    for (const dist of DISTANCES) {
      it(`measures ${level}'s first hit at ${dist} m in a duel`, { timeout: 300_000 }, (ctx) => {
        const times: number[] = [];
        for (let seed = 1; seed <= DUEL_SEEDS; seed++) times.push(duelFirstHit(level, dist, seed));
        const hit = times.filter(Number.isFinite);
        const fast = hit.filter((t) => t < FAIR_MOMENT).length;
        const label = `Duel at ${dist} m, ${level}, a player standing still`;
        reportMeasure(ctx, {
          label: `${label}: median time to the bot's first hit`,
          value: median(times),
          band: level === 'normal' ? { min: NORMAL_MEDIAN_MIN } : {},
          unit: 's',
          detail: `${hit.length} of ${times.length} hit within ${DUEL_SECONDS} s; quartiles ${quartiles(times)}`,
        });
        reportMeasure(ctx, {
          label: `${label}: duels whose first hit lands inside ${FAIR_MOMENT} s`,
          value: share(fast, times.length),
          of: times.length,
          band: level === 'pro' ? {} : { max: FAST_SHARE_MAX },
          detail: `${fast} of ${times.length}`,
        });
      });
    }
  }

  it('measures how soon Normal bots land their first hit on someone seen close by, in Depot matches', { timeout: 900_000 }, (ctx) => {
    const byBin = BINS.map(() => [] as number[]);
    for (let seed = 1; seed <= MATCH_SEEDS; seed++) {
      playMatch(MATCH_SECONDS, seed, undefined, botConfig('normal'), 'elimination', undefined, undefined, undefined, undefined, (state, bots) => {
        for (const e of state.events) {
          if (e.type !== 'characterHit' || e.ricochet) continue;
          const bot = bots.bots.find((b) => b.character.id === e.shooterId);
          const victim = state.characters.find((c) => c.id === e.victimId);
          const contact = bot?.contacts.get(e.victimId);
          if (!bot || !victim || !contact || victim.team === bot.character.team || !Number.isFinite(contact.firstSeenAt)) continue;
          const me = bot.character.position;
          const d = Math.hypot(victim.position.x - me.x, victim.position.z - me.z);
          const bin = BINS.findIndex((b) => d >= b.min && d <= b.max);
          if (bin >= 0) byBin[bin]!.push(state.time - contact.firstSeenAt);
        }
      });
    }
    BINS.forEach((b, i) => {
      const times = byBin[i]!;
      reportMeasure(ctx, {
        label: `Depot, Elimination, Normal: median time from first sight to a bot's hit at ${b.label}`,
        value: median(times),
        band: {},
        unit: 's',
        detail: `${times.length} hits, ${times.filter((t) => t < FAIR_MOMENT).length} inside ${FAIR_MOMENT} s; seeds 1-${MATCH_SEEDS}`,
      });
    });
  });
});
