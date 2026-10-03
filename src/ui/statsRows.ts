import { TEAMS } from '../config/teams';
import type { Character } from '../sim/character';
import { isInPlay } from '../sim/elimination';
import { accuracy, type PlayerStats } from '../stats/matchStats';

/**
 * What the stats tables show (the hold-Tab scoreboard, the round's numbers between rounds and the end-of-match
 * summary): a block per team, yours first, with a row per player. Pure, so it's tested without a page.
 */

/** Display names by character id: "Blue 2", "Orange 1", and "You" for the player. */
export function rosterNames(characters: readonly Character[], playerId: number): Map<number, string> {
  const names = new Map<number, string>();
  const perTeam = [0, 0];
  for (const c of characters) {
    const n = ++perTeam[c.team]!;
    names.set(c.id, c.id === playerId ? 'You' : `${TEAMS[c.team]!.name} ${n}`);
  }
  return names;
}

export interface StatsRow {
  name: string;
  you: boolean;
  /** Hit this round (only marked while a round is live). */
  out: boolean;
  hits: string;
  timesHit: string;
  friendlyHits: string;
  bbsFired: string;
  accuracy: string;
  timeAlive: string;
}

export interface TeamBlock {
  team: number;
  /** "Blue (you) · 3 rounds won". */
  title: string;
  rows: StatsRow[];
}

/** "34%", or "–" before the first BB. */
export function formatAccuracy(s: PlayerStats): string {
  const a = accuracy(s);
  return a === null ? '–' : `${Math.round(a * 100)}%`;
}

/** Whole seconds as "m:ss". */
export function formatTime(seconds: number): string {
  const s = Math.floor(seconds);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/**
 * The table's blocks: your team, then the other, each player's numbers from `statsOf`, best hitters first (ties keep
 * the roster order). `markOut`: grey out the players hit this round (the live scoreboard).
 */
export function statsBlocks(
  characters: readonly Character[],
  names: ReadonlyMap<number, string>,
  statsOf: (id: number) => PlayerStats,
  score: readonly number[],
  player: Character,
  markOut: boolean,
): TeamBlock[] {
  const order = [player.team, 1 - player.team];
  return order.map((team) => {
    const members = characters.filter((c) => c.team === team);
    const sorted = members
      .map((c, i) => ({ c, s: statsOf(c.id), i }))
      .sort((a, b) => b.s.hits - a.s.hits || a.i - b.i);
    const won = score[team] ?? 0;
    return {
      team,
      title: `${TEAMS[team]!.name}${team === player.team ? ' (you)' : ''} · ${won} ${won === 1 ? 'round' : 'rounds'} won`,
      rows: sorted.map(({ c, s }) => ({
        name: names.get(c.id) ?? '',
        you: c.id === player.id,
        out: markOut && !isInPlay(c),
        hits: String(s.hits),
        timesHit: String(s.timesHit),
        friendlyHits: String(s.friendlyHits),
        bbsFired: String(s.bbsFired),
        accuracy: formatAccuracy(s),
        timeAlive: formatTime(s.timeAlive),
      })),
    };
  });
}
