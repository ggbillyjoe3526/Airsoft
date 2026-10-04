import type { Character } from '../sim/character';
import { isInPlay } from '../sim/elimination';
import type { GameEvent } from '../sim/events';
import type { BotController } from './botController';

/**
 * Extraction (M43): the squad's team plan is to follow the runner (plan, section 2). With no order in force (the run's
 * start, after Team plan, after the runner is back from a hit) the runner's bot teammates are given Follow me again, and
 * a teammate back from a hit (a 'respawned' event this tick) rejoins the order. Quietly: no radio answer, as nobody
 * gave it. Call after the bots have observed the tick, while its events are in `events`.
 */
export function keepSquadFollowing(bots: BotController, runner: Character, events: readonly GameEvent[], live: boolean): void {
  if (!live || !isInPlay(runner)) return;
  let rejoined = false;
  for (const e of events) if (e.type === 'respawned' && e.characterId !== runner.id) rejoined = true;
  if (rejoined && bots.orderOf(runner) !== 'none') bots.cancelOrder(runner);
  if (bots.orderOf(runner) === 'none') bots.giveOrder(runner, 'follow', false);
}
