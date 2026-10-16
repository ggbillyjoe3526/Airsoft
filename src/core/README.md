# src/core

Loop and session plumbing: small pure modules with no Three.js.

- `fixedStepper.ts`: turns frame time into fixed ticks, at most `SIM.maxTicksPerFrame` (10) a frame, with frame time
  capped at `SIM.maxFrameDt` (0.25 s). Below about 6 frames/s the rest is dropped and the whole game runs in slow
  motion; only the debug overlay's "sim ticks/s" shows it. A browser drawing in software starts on Low to stay above it.
- `math.ts`: `clamp`, `clamp01` and `lerp`, the number helpers the simulation, the bots and the textures share (DX0).
- `seed.ts`: the visit's seed (fresh each page load, or `?seed=N`) and the exact 32-bit derivation of the streams made
  from it (bot plans, each bot, runs, cases). `matchFlow.ts` at `src/` derives each match's seed.
- `sessionPlan.ts`: what Play does (build a match or the range, rebuild the range, reuse what is loaded), pure.
- `onDemand.ts`: code fetched the first time it is needed (IM1): the Loadout, Armory and Settings screens
  (`ui/menus/lazyScreens.ts`) and the practice range (`rangeSession.ts`), preloaded once the page is idle after start-up.
- `framePacer.ts`: the frame-rate cap; it skips draws, never ticks. `awayWatch.ts`: a hidden tab or lost focus pauses.
- `escSkip.ts`: once you are out, Esc skips the round without the pause menu (the browser takes the mouse back, so the
  skip runs without it and a click takes it again); Esc again opens the menu.
- `crashReport.ts`, `reportFields.ts`: the copyable crash report (seed, map, mode, tick, GPU, settings, stack), shown by
  `ui/crashScreen.ts`; Dev › Diagnostics copies the same fields. `buildTiming.ts`: match build phases (`?perf`).
- What a report adds of the moments before it (IM7), each a fixed ring filled as things happen and read only when a
  report is made: `errorLog.ts` (the console's last errors and warnings; `src/consoleLog.ts`, which `main.ts` imports
  first, taps the console), `eventLog.ts` (the last shots, hits, rounds, the player's reloads and draws and bot mode
  changes; each session records after every tick) and `frameWindow.ts` (frame times of the last 10 s of play).
  `bugIssue.ts`: Report a Bug's GitHub new-issue address, the report cut to fit it.
- Tuning: `config/sim.ts`, `config/crash.ts`. Tests: one `*.test.ts` per file.
