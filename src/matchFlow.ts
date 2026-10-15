import { SIM_DT, SKIP_ROUND } from './config/sim';
import { deriveSeed } from './core/seed';
import type { Character } from './sim/character';
import { createCommand, type PlayerCommand } from './sim/commands';
import type { GameEvent } from './sim/events';
import { longestOvertime, matchWon, type RoundRules, type RoundState } from './sim/round';

/**
 * The seed of the match played `matchesPlayed`-th this visit (from 0): the visit's seed for the first, so `?seed=N`
 * replays it, and one derived from it for each later match, so the bots' plans differ match to match. Shown on the
 * pause screen and the debug overlay: since deriveSeed(N, 1, 0) is N, `?seed=` with any match's seed replays that match.
 */
export function matchSeed(visitSeed: number, matchesPlayed: number): number {
  return deriveSeed(visitSeed, 1, matchesPlayed);
}

/**
 * Skip to next round (M83): what the player, out and spectating, can skip to now. `round` plays the rest of this round
 * out and stops as the next starts; `result` when this round could decide the match (one more win takes it for either
 * team), so the skip may end on the result instead. Null where it doesn't apply: Extraction (a hit runner is back at
 * the insertion or ends the run, so there is nothing to wait out), between rounds (the next starts in seconds), while
 * the player is still in play or calling the hit, and once the match is decided. The practice range has no rounds.
 */
export type SkipOffer = 'round' | 'result' | null;

export function skipOffer(round: Readonly<RoundState>, rules: RoundRules, player: Readonly<Character>): SkipOffer {
  if (round.mode === 'extraction' || round.phase !== 'live') return null;
  const s = player.status;
  if (s !== 'walkingOff' && s !== 'leaving' && s !== 'out') return null;
  return winDecides(round.score, 0, rules) || winDecides(round.score, 1, rules) ? 'result' : 'round';
}

/** Scratch for winDecides (read each frame for the HUD's label, so nothing is made per call). */
const nextScore: [number, number] = [0, 0];

/** Whether one more round won by `team` would take the match. */
function winDecides(score: readonly [number, number], team: number, rules: RoundRules): boolean {
  nextScore[0] = score[0] + (team === 0 ? 1 : 0);
  nextScore[1] = score[1] + (team === 1 ? 1 : 0);
  return matchWon(nextScore, team, rules);
}

/** The most ticks a skip runs before it gives up (SKIP_ROUND): the longest the rest of a round and the pause after it can take. */
export function skipTickCap(rules: RoundRules): number {
  return Math.ceil((rules.roundTime + longestOvertime(rules) + rules.resetDelay + SKIP_ROUND.spareSeconds) / SIM_DT);
}

/** A skip ends on the tick the next round starts, or the match is decided. */
export function skipEnds(events: readonly GameEvent[]): boolean {
  for (const e of events) if (e.type === 'roundStart' || e.type === 'matchOver') return true;
  return false;
}

/**
 * A skipped tick whose presentation runs as watched: the round's end and the next round's start (the banner, the hit
 * feed's line, the view reset). Every other skipped tick runs the simulation, the bots, the stats and the squad only.
 */
export function skipTickShown(events: readonly GameEvent[]): boolean {
  for (const e of events) if (e.type === 'roundOver' || e.type === 'roundStart' || e.type === 'matchOver') return true;
  return false;
}

const IDLE = createCommand();

/** A skipped tick's command for the player (M83): nothing held or pressed, looking `yaw`, `pitch`. In place. */
export function idleCommand(cmd: PlayerCommand, yaw: number, pitch: number): void {
  Object.assign(cmd, IDLE);
  cmd.yaw = yaw;
  cmd.pitch = pitch;
}
