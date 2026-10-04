# Tasks

Open tasks only, one block each (format in `pipeline/README.md`). A task that lands leaves this file: its REVIEWS
line, its ROADMAP row and the CHANGELOG line are the record. The planning thread writes blocks; the build thread
keeps `status` and `attempts` current.

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
status: done

## M29b · Barrels, the silencer, and Hard opponents on kit of their own
tier: core
perf: required
touches: stats.md, pool.md, src/config/statsFile.ts, src/config/attachments.ts, src/config/menus.ts, src/config/bots.ts, src/pool/pool.ts, src/pool/kit.ts, src/pool/armory.ts, src/pool/botKit.ts, src/sim/armament.ts, src/ai/botController.ts, src/audio/sfx.ts, src/audio/audioEngine.ts, src/render/replicaModels.ts, src/render/viewmodel.ts, src/render/matchPresentation.ts, src/ui/soundCues.ts, src/ui/minimapView.ts, src/ui/performanceSheet.ts, src/ui/loadoutChoice.ts, src/ui/menus/loadoutScreen.ts, src/ui/menus/armoryScreen.ts, src/matchSession.ts, src/style.css, src/ai/depotMatchSupport.ts, CHANGELOG.md, docs/
contract: pool.md's format (two new sections, Barrels and Muzzle parts; new tags barrel-mount and muzzle-thread); stats.md's format (two new tables, Barrels and Muzzle parts; Barrel and Muzzle in Tier scaling)
acceptance:
  1. Customise has Barrel and Muzzle rows: the AEG takes barrels and the silencer, the Gas Pistol the silencer only (its Barrel row says it has a fixed barrel); the Tight-Bore Barrel (000016), Long Barrel (000017) and Silencer (000018) come from Shots, with their numbers in stats.md
  2. Tight-Bore Barrel: 15 % less spread, 3 % more energy; Long Barrel: 8 % more energy, 15 % slower draw and aim raise; Silencer: 5 % less energy, 10 % slower draw and aim raise, shots heard from half as far; each tier improves their handling (and a barrel's spread) by stats.md's shares; the site limit still holds
  3. A silenced shot carries half as far for bots (22 m to 11 m, and behind a wall the same share), for the minimap's heard markers and for sound cues, and it sounds muffled
  4. The fitted barrel and muzzle part show on the first-person replica, and BBs leave from the end of whatever is fitted
  5. The Performance sheet shows "Shots heard from" and marks the barrel's and silencer's changes better or worse
  6. On Hard, each of the other team's bots carries its own kit, rolled from the pool by the match's seed: a tier for each replica and each part by the Armory's odds, a power source always, any part slot filled or left empty, only parts that fit; BB weight and hop-up as the replica comes; your teammates, and Easy and Normal opponents, carry the replicas as they come
  7. The headless match guards pass unchanged and Low still holds its frame budget
status: accepted
attempts: 1

## M33a · Woodland shown as Coming soon in the Map pop-up
tier: ui
perf: skip
touches: src/map/maps.ts, src/ui/menus/choiceDialog.ts, src/ui/menus/menus.ts, src/style.css, e2e/boot.spec.ts, docs/
contract: none
acceptance:
  1. New game's Map pop-up lists Woodland under Depot, greyed out, with a "Coming soon" tag and a short blurb
  2. Woodland can't be picked: its entry is disabled, it is not a MapId, and nothing can save or load it as the map
  3. Depot stays the default and picking it works as before
  4. ROADMAP has the M33 entry and status row; DECISIONS has the owner's decision
status: building
attempts: 1
