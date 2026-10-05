/**
 * A scripted player for the perf harness (pipeline/perf-run.mjs): the player's command comes from a table keyed by
 * tick instead of the keyboard and mouse, so a benchmark run walks the same path, turns the same way and fires at
 * the same moments every time (the bots are seeded already). Pure: nothing here touches the DOM.
 */
import type { PlayerCommand } from '../sim/commands';

/** One stretch of the script: from `fromTick` until the next step's `fromTick`, the player does this. */
export interface ScriptStep {
  fromTick: number;
  /** -1..1, forward positive (default 0). */
  forward?: number;
  /** -1..1, right positive (default 0). */
  right?: number;
  /** Turn rate in radians per second, positive turns left (default 0). */
  turn?: number;
  /** Absolute pitch in radians, positive looks up (default 0). */
  pitch?: number;
  sprint?: boolean;
  crouch?: boolean;
  /** -1 left, 1 right (default 0). */
  lean?: number;
  /** Trigger held. */
  fire?: boolean;
  /** Aim down sights (needs an optic). */
  aim?: boolean;
  /** A reload pressed on this step's first tick. */
  reload?: boolean;
  /** A jump pressed on this step's first tick. */
  jump?: boolean;
  /** A loadout slot to switch to on this step's first tick. */
  switchTo?: number;
}

/** The step in force at `tick`: the last one whose `fromTick` is at or before it (null before the first). */
export function stepAt(script: readonly ScriptStep[], tick: number): ScriptStep | null {
  let current: ScriptStep | null = null;
  for (const step of script) {
    if (step.fromTick > tick) break;
    current = step;
  }
  return current;
}

/**
 * Fills `cmd` for `tick` from the script, turning `yaw` by the step's rate over `dt`, and returns the new yaw. One-shot
 * actions (reload, jump, a switch) fire on the first tick of their step only. Before the script starts, the player
 * stands still, looking along `yaw`.
 */
export function fillScriptedCommand(script: readonly ScriptStep[], tick: number, yaw: number, dt: number, cmd: PlayerCommand): number {
  const step = stepAt(script, tick);
  const first = step !== null && step.fromTick === tick;
  const newYaw = yaw + (step?.turn ?? 0) * dt;
  cmd.forward = step?.forward ?? 0;
  cmd.right = step?.right ?? 0;
  cmd.yaw = newYaw;
  cmd.pitch = step?.pitch ?? 0;
  cmd.sprint = step?.sprint ?? false;
  cmd.walk = false;
  cmd.crouch = step?.crouch ?? false;
  cmd.lean = step?.lean ?? 0;
  cmd.jump = first && (step?.jump ?? false);
  cmd.aim = step?.aim ?? false;
  cmd.fire = step?.fire ?? false;
  cmd.reload = first && (step?.reload ?? false);
  cmd.switchTo = first ? (step?.switchTo ?? -1) : -1;
  cmd.cycleFireMode = false;
  cmd.toggleTorch = false;
  return newYaw;
}
