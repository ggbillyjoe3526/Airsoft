import type { BotSkill, Difficulty } from '../config/bots';
import type { GameEvent } from '../sim/events';
import { clampRating, driftAfter, matchScore, ratingAfter, roundScore, skillAt } from './adaptiveSkill';

/**
 * One match's adaptive difficulty (AD1): it starts at the saved rating and drifts a little after each round from how
 * that round went for you (adaptiveSkill.ts driftAfter), never past ADAPTIVE.round.maxDrift from the start nor off the
 * scale; at the end it works out the next match's rating from the start and the whole match (ratingAfter). The level
 * the match plays as stays the start's throughout. Plain state, fed the simulation's events after each tick.
 */
export class AdaptiveRun {
  private drift = 0;
  /** This round so far: your hits on the other team, and whether they hit you. */
  private hits = 0;
  private wasHit = false;
  /** Each finished round's score. */
  private readonly scores: number[] = [];

  constructor(
    /** The rating the match starts at, already on the scale (0 to `top`). */
    readonly start: number,
    /** The highest rating offered (adaptiveSkill.ts topRating). */
    readonly top: number,
    /** The level the match plays as (levelAt(start)): the bots' switches, kits and the rest. */
    readonly playedAs: Difficulty,
    /** You: your id and team. */
    private readonly you: { readonly id: number; readonly team: number },
  ) {}

  /** The rating now: the start plus this match's drift. */
  get rating(): number {
    return clampRating(this.start + this.drift, this.top);
  }

  /** The other team's skill at the rating now (a fresh object). */
  skill(): BotSkill {
    return skillAt(this.rating, this.playedAs);
  }

  /**
   * After a tick, its events: your hits and whether the other team hit you (friendly hits count for neither), and at a
   * round's end that round's score and the drift it brings. True when a round ended: time to hand the other team's bots
   * `skill()` for the next one. `teamOf` gives a character's team.
   */
  observe(events: readonly GameEvent[], teamOf: (id: number) => number | undefined): boolean {
    let ended = false;
    for (const e of events) {
      if (e.type === 'characterHit') {
        if (e.shooterId === this.you.id && teamOf(e.victimId) !== this.you.team) this.hits++;
        else if (e.victimId === this.you.id && teamOf(e.shooterId) !== this.you.team) this.wasHit = true;
      } else if (e.type === 'roundOver') {
        const result = e.winner === this.you.team ? 1 : e.winner === 0 || e.winner === 1 ? -1 : 0;
        const score = roundScore(result, this.hits, this.wasHit);
        this.scores.push(score);
        // Kept so the start plus the drift stays on the scale: at the top, a lost round eases off at once.
        this.drift = Math.min(Math.max(driftAfter(this.drift, score), -this.start), this.top - this.start);
        this.hits = 0;
        this.wasHit = false;
        ended = true;
      }
    }
    return ended;
  }

  /** The rounds scored so far, oldest first. */
  roundScores(): readonly number[] {
    return this.scores;
  }

  /** The next match's rating, once this one ended `won` or lost: from its start, by the whole match's score. */
  next(won: boolean): number {
    return ratingAfter(this.start, matchScore(won, this.scores), this.top);
  }
}
