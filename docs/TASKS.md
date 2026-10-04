# Tasks

Open tasks only, one block each (format in `pipeline/README.md`). A task that lands leaves this file: its REVIEWS
line, its ROADMAP row and the CHANGELOG line are the record. The planning thread writes blocks; the build thread
keeps `status` and `attempts` current.

## M27 · probeGround without a per-tick allocation
tier: core
perf: required
touches: src/physics/physicsWorld.ts, src/physics/physicsWorld.test.ts, docs/KNOWN_ISSUES.md
contract: CharacterMover
acceptance:
  1. `probeGround` allocates no object per call in steady state: a test steps six standing characters for 600 ticks and the heap (after a forced collection) grows by less than 1 MB, and the hit result is read into a reused object
  2. Standing characters still rest 0.04 m above the floor and `probeGround` returns the same heights as before (existing physicsWorld tests pass unchanged)
  3. The perf gate passes: draw calls, triangles and heap growth within budget and not more than 10 % worse than the container baseline
  4. The KNOWN_ISSUES row about `probeGround` is removed
status: open
attempts: 0

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
