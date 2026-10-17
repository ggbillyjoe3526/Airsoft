import type { PlayerCommand } from '../sim/commands';
import type { Bot, BotWorld } from './bot';

/**
 * Bots and the holster (M92): the same command and rules as the player's (sim/armament.ts, sim/movement.ts). A bot puts
 * its primary away on a long, calm sprint through its own half (slung for the run, faster whenever it eases off the
 * sprint), and draws it again, the slower draw, as soon as that stops being safe: someone seen or heard, the enemy's
 * half, a reload to make, or the sprint over for a moment (BOT_BEHAVIOUR's holster tuning). Call last in a bot's tick, once its sprint, fire and reload are decided: it
 * writes `cmd.holster` and `cmd.switchTo` (the primary, which also draws it when holstered; -1 while it keeps it away).
 */
export function holsterBot(b: Bot, w: BotWorld, cmd: PlayerCommand, dt: number): void {
  const cfg = w.cfg;
  const a = b.character.armament;
  b.sprintRun = cmd.sprint ? b.sprintRun + dt : 0;
  b.sprintGap = cmd.sprint ? 0 : b.sprintGap + dt;
  const busy = cmd.fire || cmd.reload || a.reload > 0 || a.reloadQueued;
  const safe = w.live && !busy && !b.targetVisible && w.time - b.lastThreatAt > cfg.holsterCalmFor && !w.inEnemyHalf(b);
  const away = safe && (a.holstered ? b.sprintGap < cfg.holsterDrawAfter : b.sprintRun >= cfg.holsterAfter);
  cmd.holster = away && !a.holstered;
  cmd.switchTo = away ? -1 : 0;
}
