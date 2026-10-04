import { deriveSeed } from './core/seed';

/**
 * The seed of the match played `matchesPlayed`-th this visit (from 0): the visit's seed for the first, so `?seed=N`
 * replays it, and one derived from it for each later match, so the bots' plans differ match to match. Shown on the
 * pause screen and the debug overlay: since deriveSeed(N, 1, 0) is N, `?seed=` with any match's seed replays that match.
 */
export function matchSeed(visitSeed: number, matchesPlayed: number): number {
  return deriveSeed(visitSeed, 1, matchesPlayed);
}
