# Tasks

Open tasks only, one block each (format in `pipeline/README.md`). A task that lands leaves this file: its REVIEWS
line, its ROADMAP row and the CHANGELOG line are the record. The planning thread writes blocks; the build thread
keeps `status` and `attempts` current.

## M27 · Walk-off route searches rationed to one per tick
tier: core
perf: required
touches: src/sim/elimination.ts, src/sim/elimination.test.ts, src/sim/character.ts, src/sim/simulation.ts, docs/KNOWN_ISSUES.md
contract: GameState (a field on Character is allowed), stepSimulation (its phase order is unchanged)
acceptance:
  1. A hit no longer runs the victim's walk-off route search inside the hit itself: the search happens in the elimination step over the following ticks, at most one route search per tick across all victims (two hits in one tick: one search that tick, one the next; a test counts the searches)
  2. A victim reaches its dead zone as before (the existing elimination and depot match tests pass unchanged); while its route is not found yet it stands calling, which the 1.4 s call already covers
  3. No new per-tick allocation: the route array and the pending flag live on the character and are reused
  4. The KNOWN_ISSUES row about the walk-off route search inside the tick is removed
status: done
attempts: 1

## M28 · Impact puffs start at half size
tier: trivial
perf: skip
touches: src/render/impactPuffs.ts, src/config/render.ts, docs/KNOWN_ISSUES.md
contract: none
acceptance:
  1. A puff's first drawn frame is at least 50 % of its full size (today about 28 %), so a close-range hit shows a puff at once
  2. The puff's full size and lifetime are unchanged (its tuning values stay in config)
  3. The KNOWN_ISSUES row about the first frame of a puff is removed
status: open
attempts: 0

## FA1 · Crash handling, simulation hot paths and correctness
tier: core
perf: required
touches: src/physics/physicsWorld.ts, src/sim/elimination.ts, src/sim/simulation.ts, src/sim/accuracy.ts, src/sim/character.ts, src/sim/movement.ts, src/sim/armament.ts, src/sim/rangeTargets.ts, src/sim/round.ts, src/config/sim.ts, src/config/movement.ts, src/config/hits.ts, src/config/crash.ts, src/render/viewmodel.ts, src/render/combatPresentation.ts, src/render/spectatorCamera.ts, src/core/crashReport.ts, src/ui/roundBanner.ts, src/ui/clipboard.ts, src/ui/crashScreen.ts, src/ui/devSettings.ts, src/stats/settleMatch.ts, src/matchFlow.ts, src/matchSession.ts, src/game.ts, src/main.ts, src/style.css, vite.config.ts, e2e/boot.spec.ts, e2e/crash.spec.ts
contract: GameState (fields on Character: jumpWanted, groundRise; on RoundState: draws), stepSimulation (one skip: a parked out-of-play character goes straight to the elimination step; the phase order is otherwise unchanged and the headless guards pass); ArmamentContext gains an optional fireHoldOff. WorldQuery and CharacterMover are unchanged
acceptance:
  1. Crash handling (CORE-04, UI-02, CORE-11, CORE-28, CORE-32): an exception in the game loop stops the loop, pauses, releases the pointer lock and shows a "Something went wrong" pane styled like the menus with the seed and a copyable report; a boot failure shows the same pane with WebGL advice when it fits; production builds emit hidden source maps and the chunk budgets pass; the README lists the URL flags as a set; Dev settings can copy a diagnostics report (two e2e tests, a crashReport unit test)
  2. Hot paths (SIM-04, SIM-14, SIM-15, REN-11, REN-12): no Vector3 or hit object per move/probe, parked out-of-play characters skip movement and probing, the stepper catches up at most 10 ticks a frame, one muzzle position per shot with no rig matrix update, the spectator wall cast runs once per tick pose
  3. Correctness (SIM-02, SIM-03, SIM-05, SIM-06, SIM-08, SIM-10, SIM-11, SIM-12, SIM-17, SIM-19, CORE-06): air spread waits out a walkable ledge, a click just after a sprint fires when the lockout ends, a 100 ms jump buffer, a walk-off budget every Depot spot meets, Play Again builds a new match with a new seed, crouch-walking costs a little accuracy, eliminated characters send an idle command, the range figure's hit volume matches the match one, ramps keep their pace, a drawn round is replayed, and a decided match is recorded and paid by a pure, tested settleMatch
  4. The KNOWN_ISSUES rows these close are struck or reworded; DECISIONS and PLAYTEST carry the FA1 entries
status: gates
attempts: 1
