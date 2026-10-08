# src/core

Loop and session plumbing: small pure modules with no Three.js.

- `fixedStepper.ts`: turns frame time into fixed ticks, at most `SIM.maxTicksPerFrame` (10) a frame, with frame time
  capped at `SIM.maxFrameDt` (0.25 s). Below about 6 frames/s the rest is dropped and the whole game runs in slow
  motion; only the debug overlay's "sim ticks/s" shows it. A browser drawing in software starts on Low to stay above it.
- `seed.ts`: the visit's seed (fresh each page load, or `?seed=N`) and the exact 32-bit derivation of the streams made
  from it (bot plans, each bot, runs, cases). `matchFlow.ts` at `src/` derives each match's seed.
- `sessionPlan.ts`: what Play does (build a match or the range, rebuild the range, reuse what is loaded), pure.
- `framePacer.ts`: the frame-rate cap; it skips draws, never ticks. `awayWatch.ts`: a hidden tab or lost focus pauses.
- `crashReport.ts`, `reportFields.ts`: the copyable crash report (seed, map, mode, tick, GPU, settings, stack), shown by
  `ui/crashScreen.ts`; Dev › Diagnostics copies the same fields. `buildTiming.ts`: match build phases (`?perf`).
- Tuning: `config/sim.ts`, `config/crash.ts`. Tests: one `*.test.ts` per file.
