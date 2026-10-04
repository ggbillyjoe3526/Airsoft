import type { Character } from '../sim/character';
import { isInPlay } from '../sim/elimination';
import type { GameState } from '../sim/state';

/** One player's numbers over a round or a match. */
export interface PlayerStats {
  /** Opponents this player's BBs hit. */
  hits: number;
  /** Times this player was hit (at most once a round). */
  timesHit: number;
  /** Teammates this player's BBs hit (friendly fire counts, as at a real site). */
  friendlyHits: number;
  bbsFired: number;
  /** Seconds in play while rounds were live. */
  timeAlive: number;
}

export function emptyStats(): PlayerStats {
  return { hits: 0, timesHit: 0, friendlyHits: 0, bbsFired: 0, timeAlive: 0 };
}

function clear(s: PlayerStats): void {
  s.hits = 0;
  s.timesHit = 0;
  s.friendlyHits = 0;
  s.bbsFired = 0;
  s.timeAlive = 0;
}

/** Share of the BBs fired that hit an opponent (0..1), or null before the first BB. Friendly hits don't count. */
export function accuracy(s: PlayerStats): number | null {
  return s.bbsFired > 0 ? s.hits / s.bbsFired : null;
}

/**
 * Keeps every player's numbers for the match so far and for the round in play (or just played), read from each
 * tick's events. Reads the simulation, never writes it: the stats are derived data for the HUD and the menus.
 */
export class MatchStats {
  private readonly match = new Map<number, PlayerStats>();
  private readonly round = new Map<number, PlayerStats>();
  private readonly teamOf = new Map<number, number>();
  /** Rounds each player's team won that the player took part in (audit POOL-08). */
  private readonly roundsWonWith = new Map<number, number>();
  /** Goes up whenever a count changes (not the time alive): the tables redraw on it. */
  version = 0;

  constructor(characters: readonly Character[]) {
    for (const c of characters) {
      this.match.set(c.id, emptyStats());
      this.round.set(c.id, emptyStats());
      this.teamOf.set(c.id, c.team);
    }
  }

  /** `id`'s numbers over the whole match so far. */
  matchOf(id: number): PlayerStats {
    return this.match.get(id) ?? emptyStats();
  }

  /** `id`'s numbers in the round in play, or the one just played while waiting for the next. */
  roundOf(id: number): PlayerStats {
    return this.round.get(id) ?? emptyStats();
  }

  /** Call after every simulation tick of `dt` seconds, while its events are still in the state. */
  afterTick(state: GameState, dt: number): void {
    let started = false;
    for (const e of state.events) {
      if (e.type === 'roundStart') {
        for (const s of this.round.values()) clear(s);
        started = true;
        this.version++;
      } else if (e.type === 'shot') {
        this.add(e.characterId, 'bbsFired');
      } else if (e.type === 'roundOver') {
        // A round won counts for a player who hit an opponent in it or was still in play when it ended.
        for (const c of state.characters) {
          if (c.team !== e.winner || !(this.roundOf(c.id).hits > 0 || isInPlay(c))) continue;
          this.roundsWonWith.set(c.id, (this.roundsWonWith.get(c.id) ?? 0) + 1);
        }
      } else if (e.type === 'characterHit') {
        this.add(e.victimId, 'timesHit');
        // Your own ricochet (audit SIM-07) is a time you were hit, not a hit you scored on anyone.
        if (e.shooterId === e.victimId) continue;
        const friendly = this.teamOf.get(e.shooterId) === this.teamOf.get(e.victimId);
        this.add(e.shooterId, friendly ? 'friendlyHits' : 'hits');
      }
    }
    // Time alive counts live play only: not the pause between rounds, nor the tick that set up a new round.
    if (started || state.round.phase !== 'live') return;
    for (const c of state.characters) {
      if (!isInPlay(c)) continue;
      this.match.get(c.id)!.timeAlive += dt;
      this.round.get(c.id)!.timeAlive += dt;
    }
  }

  /** Rounds `id`'s team won with `id` taking part: a hit on an opponent in the round, or still in play at its end. */
  roundsContributed(id: number): number {
    return this.roundsWonWith.get(id) ?? 0;
  }

  /** Everything back to zero: a new match ("Play Again"). */
  reset(): void {
    this.roundsWonWith.clear();
    for (const s of this.match.values()) clear(s);
    for (const s of this.round.values()) clear(s);
    this.version++;
  }

  private add(id: number, field: Exclude<keyof PlayerStats, 'timeAlive'>): void {
    const m = this.match.get(id);
    const r = this.round.get(id);
    if (m) m[field]++;
    if (r) r[field]++;
    this.version++;
  }
}
