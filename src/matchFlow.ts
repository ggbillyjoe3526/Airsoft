import { deriveSeed } from './core/seed';

/**
 * The seed of the match played `matchesPlayed`-th this visit (from 0): the visit's seed for the first, so `?seed=N`
 * replays it, and one derived from it for each later match, so the bots' plans differ match to match. Shown on the
 * pause screen and the debug overlay: since deriveSeed(N, 1, 0) is N, `?seed=` with any match's seed replays that match.
 */
export function matchSeed(visitSeed: number, matchesPlayed: number): number {
  return deriveSeed(visitSeed, 1, matchesPlayed);
}

/** What Play (New game's Play, Resume, Play Again) finds when it is pressed. */
export interface PlayPress {
  /** Play has begun in what's loaded. */
  started: boolean;
  loaded: 'match' | 'range' | null;
  /** The loaded match is decided (Play Again on the result screen). */
  matchOver: boolean;
  /** New game's choices (or the team colours) changed since the match was built. */
  setupChanged: boolean;
}

/**
 * Whether Play builds a new match. Before play has begun: unless one built for this setup is waiting (a Play whose
 * mouse lock was refused reuses it). Play Again always builds a new one with its own seed (audit SIM-08): restarting
 * the old one in place kept the simulation's and the bots' random streams going, so its seed didn't replay it.
 */
export function buildsNewMatch(p: PlayPress): boolean {
  if (!p.started) return p.setupChanged || p.loaded !== 'match';
  return p.loaded === 'match' && p.matchOver;
}
