import { BOT_PERSONALITIES } from '../config/botPersonalities';
import type { BotsFile, RosterEntry } from '../config/botsFile';
import { createRng, type RngState, rngNext } from '../sim/rng';
import type { BotIdentity } from './personality';

/**
 * Who the bots are this match (BN1): each bot draws a name from bots.md's roster, and plays the personality that name
 * always plays. A team's bots take different personalities while there are enough (then round again), so a team is a
 * mix; no name comes twice in a match. Seeded by the match, on a stream of its own, so a seed replays the same names
 * and no other roll moves. Pure.
 */

/** The roster's stream for a match seeded `seed`: apart from the bots' own (botSeed) and the team plans'. */
export function rosterSeed(seed: number): number {
  return (seed ^ 0x6e616d65) >>> 0;
}

/** A random index below `n` from `rng`. */
const below = (rng: RngState, n: number): number => Math.min(n - 1, Math.floor(rngNext(rng) * n));

/** `list` shuffled in place (Fisher–Yates) and returned. */
function shuffle<T>(list: T[], rng: RngState): T[] {
  for (let i = list.length - 1; i > 0; i--) {
    const j = below(rng, i + 1);
    [list[i], list[j]] = [list[j]!, list[i]!];
  }
  return list;
}

/**
 * An identity for each of `bots` (id and team; players are left out by the caller) in a match seeded `seed`, from
 * `file` (bots.md as the game read it). A bot gets none when the roster has run out of names: it keeps the team's
 * numbered name and plays its difficulty as it is.
 */
export function drawIdentities(seed: number, bots: readonly { id: number; team: number }[], file: BotsFile = BOT_PERSONALITIES): Map<number, BotIdentity> {
  const out = new Map<number, BotIdentity>();
  const rng = createRng(rosterSeed(seed));
  // The personalities somebody on the roster plays, in the file's order (so a seed's draw follows the file).
  const kinds = [...file.styles.keys()].filter((k) => file.roster.some((e) => e.personality === k));
  if (kinds.length === 0) return out;
  const free: RosterEntry[] = [...file.roster];
  for (const team of [0, 1]) {
    const members = bots.filter((b) => b.team === team).sort((a, b) => a.id - b.id);
    let deal: string[] = [];
    for (const m of members) {
      if (deal.length === 0) deal = shuffle([...kinds], rng);
      const kind = deal.pop()!;
      // A name of that personality, or failing that any name left (it plays its own).
      const ofKind = free.filter((e) => e.personality === kind);
      const pool = ofKind.length > 0 ? ofKind : free;
      if (pool.length === 0) break;
      const entry = pool[below(rng, pool.length)]!;
      free.splice(free.indexOf(entry), 1);
      out.set(m.id, { name: entry.name, personality: entry.personality, style: file.styles.get(entry.personality)! });
    }
  }
  return out;
}
