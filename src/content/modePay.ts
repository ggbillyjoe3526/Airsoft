import type { Difficulty } from '../config/bots';
import type { XpRules } from '../progress/levels';
import { matchXp } from '../progress/xp';
import { matchWon } from '../sim/round';

/**
 * What a mode played in rounds gives a player in XP a minute (CT3, the balance run's "pay in line with the other modes";
 * LV1: XP in place of Field Credits): the standard match a sweep's rounds stand for, priced as the game gives it
 * (progress/xp.ts matchXp), over the minutes
 * that match takes, plus the player's share of the hits. Every round mode is priced the same way from its own rounds, so
 * two modes compare by how long their rounds run, how many are drawn and how many hits they see. Pure.
 */

/** A match's flow as the pay needs it (sim/round.ts RoundRules). */
export interface PayRules {
  winsNeeded: number;
  winBy: number;
  /** Seconds between rounds. */
  resetDelay: number;
}

/** What a sweep played: its rounds (length in seconds, winner or -1 for a draw), hits on an opponent, players, seconds. */
export interface PlayedRounds {
  rounds: readonly { seconds: number; winner: number }[];
  hits: number;
  /** Characters playing (both teams). */
  players: number;
  seconds: number;
}

/**
 * An even match's decided rounds, on average, and the rounds its winner and loser win (sides each taking a round half the
 * time, to `winsNeeded` with a lead of `winBy`), over every score line up to a cap far past any real match: what it
 * drops past the cap is under a ten-thousandth of a round.
 */
export function evenMatchRounds(rules: Pick<PayRules, 'winsNeeded' | 'winBy'>): { decided: number; winner: number; loser: number } {
  const cap = 4 * rules.winsNeeded + 40;
  let chance = new Map<string, number>([['0,0', 1]]);
  let decided = 0;
  let winner = 0;
  let loser = 0;
  for (let played = 0; played < cap && chance.size > 0; played++) {
    const next = new Map<string, number>();
    for (const [key, p] of chance) {
      const [a, b] = key.split(',').map(Number) as [number, number];
      // The round goes to team 0 or team 1, half the time each.
      for (const [x, y, scorer] of [
        [a + 1, b, 0],
        [a, b + 1, 1],
      ] as const) {
        const q = p / 2;
        if (matchWon([x, y], scorer, rules)) {
          decided += q * (x + y);
          winner += q * Math.max(x, y);
          loser += q * Math.min(x, y);
        } else next.set(`${x},${y}`, (next.get(`${x},${y}`) ?? 0) + q);
      }
    }
    chance = next;
  }
  return { decided, winner, loser };
}

/** XP a minute for a player at `level` (teammates at the same) in the standard match `played` stands for. */
export function roundsPayPerMinute(e: XpRules, level: Difficulty, played: PlayedRounds, rules: PayRules): number {
  if (played.rounds.length === 0 || played.seconds <= 0 || played.players <= 0) return Number.NaN;
  const even = evenMatchRounds(rules);
  const draws = played.rounds.filter((r) => r.winner < 0).length / played.rounds.length;
  if (draws >= 1) return Number.NaN;
  const roundSeconds = played.rounds.reduce((sum, r) => sum + r.seconds, 0) / played.rounds.length;
  const matchMinutes = ((even.decided / (1 - draws)) * (roundSeconds + rules.resetDelay)) / 60;
  const pay = (won: boolean, roundsWon: number) => matchXp(e, { won, roundsWon, hits: 0, winsNeeded: rules.winsNeeded, difficulty: level, teammateDifficulty: level }).total;
  const perMatch = (pay(true, even.winner) + pay(false, even.loser)) / 2;
  const multiplier = e.difficulty[level];
  const hitsPerMinute = played.hits / played.players / (played.seconds / 60);
  return perMatch / matchMinutes + hitsPerMinute * e.earn.hit * multiplier;
}

/**
 * How far `roundsPayPerMinute` may be off from the sweep's size alone, as a share of it (one standard error): the error
 * of the mean round length over the round and reset, and of the share of draws over the share decided. The hits' part
 * is small beside the match pay and is left out. NaN when the pay is.
 */
export function roundsPayNoise(played: PlayedRounds, rules: Pick<PayRules, 'resetDelay'>): number {
  const n = played.rounds.length;
  if (n < 2) return Number.NaN;
  const mean = played.rounds.reduce((sum, r) => sum + r.seconds, 0) / n;
  const variance = played.rounds.reduce((sum, r) => sum + (r.seconds - mean) ** 2, 0) / (n - 1);
  const draws = played.rounds.filter((r) => r.winner < 0).length / n;
  if (draws >= 1) return Number.NaN;
  const length = Math.sqrt(variance / n) / (mean + rules.resetDelay);
  const drawn = Math.sqrt((draws * (1 - draws)) / n) / (1 - draws);
  return Math.hypot(length, drawn);
}
