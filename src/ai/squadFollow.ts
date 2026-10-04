import type { Character } from '../sim/character';
import { isInPlay } from '../sim/elimination';
import type { GameEvent } from '../sim/events';
import type { BotController } from './botController';

/**
 * Extraction (M43): the squad's team plan is to follow the runner (plan, section 2). At the run's start and whenever a
 * bot teammate is back from a hit (a 'respawned' event), the runner's bot teammates are given Follow me, quietly (no
 * radio answer, as nobody gave it), as soon as one of them is in play to take it. An order the runner gives
 * themselves (Hold, Regroup, Team plan) stands until the next respawn; one given before a respawn is replaced, since
 * the bot back at the insertion isn't part of it. One per match; call `update` after the bots have observed the tick,
 * while its events are in `events`. No allocation per tick.
 */
export class SquadFollow {
  /** Follow me is due: the run has just started, or a teammate is back. */
  private due = true;

  update(bots: BotController, runner: Character, characters: readonly Character[], events: readonly GameEvent[], live: boolean): void {
    for (const e of events) {
      if (e.type !== 'respawned' || e.characterId === runner.id) continue;
      this.due = true;
      if (bots.orderOf(runner) !== 'none') bots.cancelOrder(runner);
    }
    if (!this.due || !live || !isInPlay(runner) || !mateInPlay(runner, characters)) return;
    if (bots.orderOf(runner) === 'none') bots.giveOrder(runner, 'follow', false);
    this.due = false;
  }
}

/** Whether `runner` has a teammate in play (who could take an order). */
function mateInPlay(runner: Character, characters: readonly Character[]): boolean {
  for (const c of characters) if (c !== runner && c.team === runner.team && isInPlay(c)) return true;
  return false;
}
