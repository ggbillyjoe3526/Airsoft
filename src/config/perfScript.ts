/**
 * The perf harness's player (pipeline/perf-run.mjs, `?script=perf` in the e2e build): about 75 s of a Depot match that
 * sees the whole field (the same steps play Woodland with `--map woodland`, M33i). Ticks at 60 Hz: 60 ticks is one second. The run is measured from the harness's warm-up (a few
 * seconds in) for 60 s, so the script runs past that. It assumes the player's round-start facing (the sim resets the
 * view each round); a round ending mid-script only moves the player back to a spawn, which is fine for a benchmark.
 */
import type { ScriptStep } from '../input/scriptedInput';
import type { MatchMode } from './modes';

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

/** The first tick of PERF_SCRIPT an Extraction run keeps: everything before it is replaced by the walk to a case. */
const EXTRACTION_REJOIN = 1080;

/**
 * An Extraction run's player (M64, audit UI-05): the same script from tick 1080, but the first 18 s walk to a case and
 * hold Use there until it opens, so a perf run measures the case path (the opening noise and the hunters it draws, the
 * carried find on the strip) that no run measured before. PERF_SCRIPT itself is untouched: Elimination's numbers are
 * the baseline. The walk is for Depot at seed 1, the perf harness's: from the east yard's spawn out through its gap
 * (+z is south), west along the lane, north between the rack and the containers to the ammo can at (12.4, -11.6), whose
 * opening takes 2 s (Use is held for 3). The bots are seeded too, but they shoot: the stand at the start is timed so the
 * home team is not looking down the lane as the runner crosses it (a different wait, or a change to the bots, can have
 * the runner hit on the way). On another map or seed the walk goes nowhere in particular and Use opens nothing;
 * perfScript.test.ts fails if Depot's case moves out of the walk's reach.
 */
export const PERF_SCRIPT_EXTRACTION: readonly ScriptStep[] = [
  { fromTick: 0 }, // stand at the spawn while the home team settles in
  { fromTick: 240, turn: 2.48 }, // turn left, to the south
  { fromTick: 271, forward: 1 }, // out through the yard's gap
  { fromTick: 378, turn: -2.51 }, // turn right, to the west
  { fromTick: 408, forward: 1 }, // along the lane
  { fromTick: 508, turn: -2.48 }, // turn right, to the north
  { fromTick: 544, forward: 1 },
  { fromTick: 598, turn: 2.5 }, // turn left, to the west, round the rack
  { fromTick: 633, forward: 1 },
  { fromTick: 662, turn: -2.52 }, // turn right, to the north, between the containers
  { fromTick: 698, forward: 1 },
  { fromTick: 732, turn: -2.65 }, // a last small turn, to the can
  { fromTick: 736, forward: 1 },
  { fromTick: 755, use: true }, // beside the can: Use held until it is open (2 s) and a second more
  { fromTick: 935 }, // stand
  ...PERF_SCRIPT.filter((step) => step.fromTick >= EXTRACTION_REJOIN),
];

/** The script the perf harness plays in `mode` (Extraction has its own opening, the rest play PERF_SCRIPT). */
export function perfScriptFor(mode: MatchMode): readonly ScriptStep[] {
  return mode === 'extraction' ? PERF_SCRIPT_EXTRACTION : PERF_SCRIPT;
}
