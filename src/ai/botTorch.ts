import { BOT_TORCH } from '../config/bots';
import { TORCHES } from '../config/torches';
import type { PlayerCommand } from '../sim/commands';
import { isInPlay } from '../sim/elimination';
import { lightInHand } from '../sim/torch';
import { updateTorchLight } from '../map/torchLight';
import type { Bot, BotWorld } from './bot';

/**
 * Bots and their weapon torches on a night field (M33h). The torch-light field the bots' sight reads is brought up to
 * date once per perception interval (map/torchLight.ts; whichever bot comes first in it: the field is read only when a
 * bot perceives, every BOT_BEHAVIOUR.thinkInterval, so a 60 Hz refresh bought nothing, audit AI-07), and each bot with
 * a light in hand switches it by what it is doing (wantsTorch), holding a state at least BOT_TORCH.minHold seconds. On a
 * day map (no night field) nothing here runs and the command is never touched beyond clearing its toggle.
 */

/**
 * Whether `b` wants its torch on: on for the last stretch of a search (within its skill's searchWalkDistance of where it
 * last knew of someone) and fighting someone within `reach`; off advancing and on the way to a search (unless its skill
 * keeps it on the move), in cover, at the pole and on orders, and between rounds. A beam switched on far from the fight
 * only gives its bot away (M71: on Woodland it took 20 points off Hard attackers, 48 % against 28 %). Reads the last tick's mode and target
 * (a tick's lag is nothing next to the hold time), without changing them.
 */
export function wantsTorch(b: Bot, w: BotWorld, reach: number): boolean {
  if (!w.live) return false;
  if (b.mode === 'search') return b.skill.torchOnTheMove === true || near(b, b.skill.searchWalkDistance);
  if (b.mode === 'advance') return b.skill.torchOnTheMove === true;
  if (b.mode !== 'fight' || b.targetId < 0) return false;
  const me = b.character;
  for (const c of w.characters) {
    if (c.id !== b.targetId) continue;
    return isInPlay(c) && Math.hypot(c.position.x - me.position.x, c.position.z - me.position.z) <= reach;
  }
  return false;
}

/** Whether `b` is within `d` of where it last knew of someone (the stretch a search walks). */
function near(b: Bot, d: number): boolean {
  const me = b.character.position;
  return Math.hypot(b.lastKnown.x - me.x, b.lastKnown.z - me.z) <= d;
}

/** One tick of `b`'s torch, into `cmd` (thinkBot's one hook): the field refreshed if due, then a switch if one is due. */
export function stepBotTorch(b: Bot, w: BotWorld, cmd: PlayerCommand): void {
  cmd.toggleTorch = false;
  const torches = w.sight?.torches;
  if (!w.sight?.night || !torches) return;
  updateTorchLight(torches, w.characters, w.query, w.body, w.hits, w.cfg.aimHeightFraction, Math.floor(w.time / w.cfg.thinkInterval));
  const me = b.character;
  const light = lightInHand(me);
  if (!isInPlay(me) || light === null) return;
  const want = wantsTorch(b, w, Math.min(BOT_TORCH.fightReach, TORCHES[light].reach));
  if (want !== me.torchOn && me.torchTime >= BOT_TORCH.minHold) cmd.toggleTorch = true;
}
