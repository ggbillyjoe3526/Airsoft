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

## M29a · Weapon performance data: stats.md, tier scaling, the Performance sheet
tier: core
perf: required
touches: stats.md, pool.md, src/config/statsFile.ts, src/config/gameStats.ts, src/config/replicas.ts, src/config/attachments.ts, src/config/optics.ts, src/config/lasers.ts, src/config/menus.ts, src/pool/pool.ts, src/pool/kit.ts, src/pool/loadoutModel.ts, src/ui/performanceSheet.ts, src/ui/menus/loadoutScreen.ts, src/ui/menus/armoryScreen.ts, src/style.css, docs/
contract: pool.md's format (Power % moves to stats.md); a new contract, stats.md's format
acceptance:
  1. Every performance number of the two replicas, the power sources, optics, grips, lasers and magazines is read from `stats.md` at the repository's root (a guide at its top, tables by Key or pool ID); the game's numbers as shipped are unchanged, and a cell it can't read keeps the built-in number with its line in `errors` (a test fails on any)
  2. A higher tier improves what stats.md's Tier scaling says: a Legendary replica has 15 % less spread, reload and draw and 7.5 % more energy and rate of fire; a battery's tier its rate of fire, a gas's its energy; parts as before
  3. A battery sets the rate of fire only (Standard 0 %, the new 11.1 V LiPo Battery 000015 +15 %, from Shots); Red and Black Gas add 10 % and 20 % energy and the same to the recoil
  4. A replica's energy stops at its class's site limit (rifle 1.20 J, pistol 1.00 J), and the sheet says "site limit" when it does
  5. The Customise screen shows a Performance sheet (energy, muzzle speed in m/s and fps on 0.20 g, BB weight, rate of fire, on-target range, time to 20 m, spread, recoil, magazines, reload, draw, aim raise), each change against the replica as it comes marked better or worse; it follows the BB weight and hop-up sliders
  6. Each gear slot shows "energy · rate of fire · magazine"; the Armory shows what each copy's tier adds (dispensed tiles and the collection list)
  7. Bots carry each replica as it comes: the headless match guards pass unchanged
status: building
attempts: 0
