import { TEAMS } from '../config/teams';
import type { Character } from '../sim/character';
import { isInPlay } from '../sim/elimination';
import { accuracy, type PlayerStats } from '../stats/matchStats';

/**
 * What the stats tables show (the hold-Tab scoreboard, the round's numbers between rounds and the end-of-match
 * summary): a block per team, yours first, with a row per player. Pure, so it's tested without a page.
 */

/** Who a bot is (BN1, ai/personality.ts BotIdentity), as far as the tables need it: its name and its personality's label. */
export interface RosterIdentity {
  readonly name: string;
  readonly style: { readonly label: string };
}

const NO_IDENTITIES: ReadonlyMap<number, RosterIdentity> = new Map();

/**
 * Display names by character id: each bot's roster name (BN1, bots.md) from `identities`, "You" for the player, and
 * the team's numbered name ("Alpha 2", "Beta 1") for a bot without one.
 */
export function rosterNames(characters: readonly Character[], playerId: number, identities: ReadonlyMap<number, RosterIdentity> = NO_IDENTITIES): Map<number, string> {
  const names = new Map<number, string>();
  const perTeam = [0, 0];
  for (const c of characters) {
    const n = ++perTeam[c.team]!;
    names.set(c.id, c.id === playerId ? 'You' : (identities.get(c.id)?.name ?? `${TEAMS[c.team]!.name} ${n}`));
  }
  return names;
}

/** Each bot's personality as the tables tag it ("Rusher"), by character id; none for the player or a bot without one. */
export function rosterTags(identities: ReadonlyMap<number, RosterIdentity>): Map<number, string> {
  const tags = new Map<number, string>();
  for (const [id, who] of identities) if (who.style.label !== '') tags.set(id, who.style.label);
  return tags;
}

export interface StatsRow {
  name: string;
  /** The bot's personality (BN1: "Rusher"), or '' (you, or a bot without one). */
  tag: string;
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
  /** "Alpha (you) · 3 rounds won". */
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
 * the roster order). `markOut`: grey out the players hit this round (the live scoreboard). `run`: an Extraction run
 * (M43), one long round, so the teams are named for their side (your squad, the home team) instead of rounds won.
 * `benched` (by character id): left out, Extraction's reserve until it joins the run (BP3: it showed as hit, 0:00 alive).
 */
export function statsBlocks(
  characters: readonly Character[],
  names: ReadonlyMap<number, string>,
  statsOf: (id: number) => PlayerStats,
  score: readonly number[],
  player: Character,
  markOut: boolean,
  run = false,
  benched: readonly boolean[] = [],
  /** Each bot's personality tag by character id (rosterTags, BN1). */
  tags: ReadonlyMap<number, string> = new Map(),
): TeamBlock[] {
  const order = [player.team, 1 - player.team];
  return order.map((team) => {
    const members = characters.filter((c) => c.team === team && benched[c.id] !== true);
    const sorted = members
      .map((c, i) => ({ c, s: statsOf(c.id), i }))
      .sort((a, b) => b.s.hits - a.s.hits || a.i - b.i);
    const won = score[team] ?? 0;
    const side = run ? (team === player.team ? 'your squad' : 'home team') : `${won} ${won === 1 ? 'round' : 'rounds'} won`;
    return {
      team,
      title: `${TEAMS[team]!.name}${team === player.team ? ' (you)' : ''} · ${side}`,
      rows: sorted.map(({ c, s }) => ({
        name: names.get(c.id) ?? '',
        tag: tags.get(c.id) ?? '',
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
