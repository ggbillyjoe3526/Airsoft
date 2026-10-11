import { MAP_BALANCE_WATCH } from '../../config/contentRules';
import type { BotController } from '../../ai/botController';
import type { MapData } from '../../map/mapTypes';
import { isInPlay } from '../../sim/elimination';
import type { GameState } from '../../sim/state';

/**
 * Test-only (the content report's map balance run, CT2): watches a headless bot match tick by tick for what a map can
 * get wrong besides who wins. Bots that never leave their spawn in a round, bots stuck standing still with nothing to do,
 * and anyone who falls below the map's lowest floor. "Nothing to do" is the audit's stall rule (2026-10-05, AI probe P3):
 * still while not holding, not at a post, not in their cover spot, not settled on an order, not at the flag, not
 * watching or searching and not fighting.
 */

/** What one match showed. */
export interface WatchTally {
  /** Bots' rounds long enough to judge (in play at least MAP_BALANCE_WATCH.leaveSpawnSeconds), and those spent at spawn. */
  botRounds: number;
  stayedAtSpawn: number;
  /** Bot-minutes in play during live rounds, and stretches of over stuckSeconds standing still with nothing to do. */
  botMinutes: number;
  stuck: number;
  /** Where the first stuck stretch was (x, y, z), for the report. */
  firstStuck: string;
  /** Characters who went below the map's lowest floor (once per round each). */
  fell: number;
}

/** The lowest floor anyone can stand on (the map's walkable floors, or its ground). */
export function lowestFloor(floorY: Float32Array): number {
  let lowest = Number.POSITIVE_INFINITY;
  for (const f of floorY) if (!Number.isNaN(f)) lowest = Math.min(lowest, f);
  return lowest;
}

/** A watcher for one match on `map` (`lowest` its lowest floor): `onTick` goes to playMatch, `tally` is read after. */
export function watchMatch(map: MapData, lowest: number, dt: number) {
  const w = MAP_BALANCE_WATCH;
  const tally: WatchTally = { botRounds: 0, stayedAtSpawn: 0, botMinutes: 0, stuck: 0, firstStuck: '', fell: 0 };
  /** Per character this round: seconds in play, farthest from its spawn (m), whether it fell; seconds standing still. */
  const inPlay = new Map<number, number>();
  const farthest = new Map<number, number>();
  const fell = new Set<number>();
  const still = new Map<number, number>();
  const closeRound = (bots: BotController): void => {
    for (const b of bots.bots) {
      const id = b.character.id;
      if ((inPlay.get(id) ?? 0) < w.leaveSpawnSeconds) continue;
      tally.botRounds++;
      if ((farthest.get(id) ?? 0) < w.leaveSpawnMetres) tally.stayedAtSpawn++;
    }
    inPlay.clear();
    farthest.clear();
    fell.clear();
    still.clear();
  };
  const onTick = (state: GameState, bots: BotController): void => {
    if (state.events.some((e) => e.type === 'roundOver')) closeRound(bots);
    if (state.round.phase !== 'live') return;
    for (const c of state.characters) {
      if (c.position.y < Math.max(map.killY, lowest - w.fallMetres) && !fell.has(c.id)) {
        fell.add(c.id);
        tally.fell++;
      }
    }
    for (const b of bots.bots) {
      const c = b.character;
      if (!isInPlay(c)) {
        still.set(c.id, 0);
        continue;
      }
      inPlay.set(c.id, (inPlay.get(c.id) ?? 0) + dt);
      farthest.set(c.id, Math.max(farthest.get(c.id) ?? 0, Math.hypot(c.position.x - c.spawnPosition.x, c.position.z - c.spawnPosition.z)));
      tally.botMinutes += dt / 60;
      const atCover = b.mode === 'cover' && Math.hypot(b.cover.position.x - c.position.x, b.cover.position.z - c.position.z) < 0.9;
      const settled = b.mode === 'order' && (b.orderSettled || b.order === 'hold' || b.orderCovering);
      const watching = state.time < b.watchUntil || b.searchLookLeft > 0;
      const excused = b.holding || b.atPost || atCover || settled || watching || b.mode === 'flag' || b.mode === 'fight';
      if (Math.hypot(c.velocity.x, c.velocity.z) >= w.stuckSpeed || excused) {
        still.set(c.id, 0);
        continue;
      }
      const before = still.get(c.id) ?? 0;
      const now = before + dt;
      still.set(c.id, now);
      if (before <= w.stuckSeconds && now > w.stuckSeconds) {
        tally.stuck++;
        tally.firstStuck ||= `${c.position.x.toFixed(1)}, ${c.position.y.toFixed(1)}, ${c.position.z.toFixed(1)}`;
      }
    }
  };
  return { onTick, tally };
}

/** Several matches' tallies added up. */
export function addTallies(a: WatchTally, b: WatchTally): WatchTally {
  return {
    botRounds: a.botRounds + b.botRounds,
    stayedAtSpawn: a.stayedAtSpawn + b.stayedAtSpawn,
    botMinutes: a.botMinutes + b.botMinutes,
    stuck: a.stuck + b.stuck,
    firstStuck: a.firstStuck || b.firstStuck,
    fell: a.fell + b.fell,
  };
}
