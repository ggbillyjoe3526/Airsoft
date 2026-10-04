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

## BP1 · Bug pass and KNOWN_ISSUES sweep (2026-10-04, before the owner's playtest)
tier: core
perf: required
touches: src/sim/armament.ts, src/sim/movement.ts, src/config/replicas.ts, src/config/materials.ts, src/config/minimap.ts, src/audio/audioEngine.ts, src/audio/soundBank.ts, src/input/pointerLock.ts, src/input/playerInput.ts, src/matchSession.ts, src/game.ts, src/style.css, src/ui/hitFeedback.ts, src/ui/keySettings.ts, src/ui/minimap.ts, src/ui/minimapView.ts, src/ui/menus/menus.ts, src/ui/menus/pauseScreen.ts, src/ui/menus/rulesText.ts, pipeline/baseline/container.json, docs/
contract: none
acceptance:
  1. The bugs found by playing every mode and reviewing the code added since the last bug pass are fixed, each with a test where the code allows one: stacked crates draw as tall cover on the minimap; Dev help switched off before play begins no longer keeps a match out of the records; the debug panel sits below the minimap; pallet racks soak BBs up; the perf script restarts with each match and ignores the mouse
  2. KNOWN_ISSUES rows fixed and removed, each with a test or a browser check: the hit-direction wedge fades over the hit call; sprint resumes once the lean key is let go; a BB never goes past vertical; a semi or burst double-tap is never a tick early; the seed shows on the pause screen; New game says which end you start at; a double-click on Play sends one lock request; a quick double-click on a key box says why it cancelled; the sounds are held once; the 200% scoreboard fits a 768 px screen (measured); the dot-only crosshair exists (M19)
  3. Every test passes; the headless bot guards pass (seed 11's round floor re-measured over 16 seeds)
status: building
attempts: 1

