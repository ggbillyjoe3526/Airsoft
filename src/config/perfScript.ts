/**
 * The perf harness's player (pipeline/perf-run.mjs, `?script=perf` in the e2e build): about 75 s of a Depot match that
 * sees the whole field (the same steps play Woodland with `--map woodland`, M33i). Ticks at 60 Hz: 60 ticks is one second. The run is measured from the harness's warm-up (a few
 * seconds in) for 60 s, so the script runs past that. It assumes the player's round-start facing (the sim resets the
 * view each round); a round ending mid-script only moves the player back to a spawn, which is fine for a benchmark.
 */
import type { ScriptStep } from '../input/scriptedInput';

export const PERF_SCRIPT: readonly ScriptStep[] = [
  { fromTick: 0 }, // stand at the spawn while everything settles
  { fromTick: 120, forward: 1 }, // walk out of the yard
  { fromTick: 360, forward: 1, sprint: true }, // sprint the lane
  { fromTick: 600, forward: 0.3, turn: 0.9 }, // a slow turn round the field, looking at everything
  { fromTick: 1020, turn: 0 },
  { fromTick: 1080, fire: true }, // a magazine downrange
  { fromTick: 1200, reload: true },
  { fromTick: 1320, crouch: true, turn: -0.6 }, // crouch and scan back
  { fromTick: 1620, crouch: true, lean: 1, fire: true }, // peek and fire
  { fromTick: 1740, crouch: true, lean: -1 },
  { fromTick: 1860, forward: 1, right: 1 }, // diagonal strafe
  { fromTick: 2100, switchTo: 1, fire: true }, // the pistol, a few shots
  { fromTick: 2220, switchTo: 0, forward: 1, sprint: true, turn: 0.3 },
  { fromTick: 2520, jump: true, forward: 1 },
  { fromTick: 2580, forward: -1, turn: 1.4 }, // back up with a fast spin
  { fromTick: 2880, aim: true, fire: true }, // aimed fire (iron sights: aim does nothing without an optic)
  { fromTick: 3000, reload: true, crouch: true },
  { fromTick: 3120, forward: 1, turn: -0.5 },
  { fromTick: 3600, forward: 0.5, right: -1, turn: 0.8 },
  { fromTick: 4200, fire: true },
  { fromTick: 4500 }, // stand
];
