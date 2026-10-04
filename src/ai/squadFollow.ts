import type { Character } from '../sim/character';
import { isInPlay } from '../sim/elimination';
import type { GameEvent } from '../sim/events';
import type { BotController } from './botController';

/**
 * Extraction (M43): the squad's team plan is to follow the runner (plan, section 2). At the run's start, after the
 * runner is back from a hit (the hit drops their order) and whenever a bot teammate is back (a 'respawned' event), the
 * runner's bot teammates are given Follow me, quietly (no radio answer, as nobody gave it), as soon as the runner and
 * one of them are in play. An order the runner gives themselves (Hold, Regroup, Team plan) stands until the next hit
 * or respawn; one given before a teammate's respawn is replaced, since the bot back at the insertion isn't part of it.
 * One per match; call `update` after the bots have observed the tick, while its events are in `events`. No allocation
 * per tick.
 */
export class SquadFollow {
  /** Follow me is due: the run has just started, the runner has been hit, or a teammate is back. */
  private due = true;

  update(bots: BotController, runner: Character, characters: readonly Character[], events: readonly GameEvent[], live: boolean): void {
    for (const e of events) {
      if (e.type !== 'respawned' || e.characterId === runner.id) continue;
      this.due = true;
      if (bots.orderOf(runner) !== 'none') bots.cancelOrder(runner);
    }
    // Hit: the order went with it (BotController drops a leader's order out of play), so Follow me is due once back.
    if (!isInPlay(runner)) this.due = true;
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
