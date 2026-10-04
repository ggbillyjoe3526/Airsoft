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

## M30 · BB flight model from fluid dynamics: real drag, Magnus lift from the hop-up's spin, wind
tier: core
perf: required
touches: src/config/ballistics.ts, src/sim/air.ts, src/sim/ballistics.ts, src/sim/bbs.ts, src/sim/ricochet.ts, src/sim/hopUp.ts, src/sim/wind.ts, src/sim/state.ts, src/sim/simulation.ts, src/matchSession.ts, src/rangeSession.ts, src/ai/depotMatchSupport.ts, src/ai/botCombat.ts, src/render/bbRenderer.ts, src/render/dustMotes.ts, src/render/combatPresentation.ts, src/config/render.ts, src/config/tutorial.ts, src/config/replicas.ts, docs/KNOWN_ISSUES.md
contract: GameState (a `wind` field is allowed); stepSimulation (its phase order is unchanged; the wind is worked out just before BBs fly); M29 owns what leaves the muzzle (energy, velocity, BB mass) and reads none of this
acceptance:
  1. Drag is real sphere drag: ½·ρ·Cd·A·v² with Cd from the Reynolds number (a published sphere fit), ρ and μ from the air's temperature and pressure; no game scale on it (a test checks the table against the formula and the air against 1.204 kg/m³ and 1.81e-5 Pa·s)
  2. Hop-up lift is Magnus lift from a spinning BB: the dial sets the backspin, CL follows the spin ratio ω·r / v, the spin decays under the air's torque (faster on a lighter BB), and the axis follows the barrel so the lift is the same whichever way a shot is fired (tests)
  3. Wind: one breeze per match from its seed, 0.3–1.8 m/s from any direction with gentle gusts, level; BBs feel drag and lift against the air, so a crosswind drifts them downwind more and more with distance (tests: a few cm at 10 m, a torso's width at 34 m in 1.5 m/s); players never feel it; the practice range has one too
  4. The factory dials keep their reach within a couple of metres (rifle ~38 m on target, pistol ~26 m), the BB-weight trade-off still holds, and the Loadout's readouts (hopUpReach, flightTime) fly the same model in still air
  5. One flight step a tick with a second-order integrator: within 1 cm of a 100-substep flight at 50 m; the per-BB step costs no more than before (benchmark in the PR) and allocates nothing
  6. Bots lead targets with the BB's flight time under drag (flightTimeEstimate, within 5% of the full model), not distance / muzzle speed; the KNOWN_ISSUES row about under-leading is removed; bots don't allow for wind; the headless match guards stay green
  7. The dust in the air drifts with the wind, so it can be read; nothing on the HUD
status: building
attempts: 1
