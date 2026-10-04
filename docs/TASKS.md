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
status: accepted
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

## FA4 · Bots: spacing, cover, behaviour, difficulty and fairness
tier: core
perf: required
touches: src/ai/bot.ts, src/ai/botBrain.ts, src/ai/botCombat.ts, src/ai/botController.ts, src/ai/botMovement.ts, src/ai/botSenses.ts, src/ai/cover.ts, src/ai/testSupport.ts, src/nav/navGrid.ts, src/config/bots.ts, src/config/nav.ts, src/map/depot.ts, src/ui/menus/savedChoices.ts, src/ui/menus/menus.ts
contract: none
acceptance:
  1. Hot path (audit AI-07, AI-10, AI-11, AI-16): at most one route search per tick including walk-offs; a failed bot route is not re-requested for routeRetryDelay; the search's open list is 2× the cells and grows instead of failing, with no closure per search; a bot's move command is projected on the view it ends the tick with (tests in botTactics.test.ts and navGrid.test.ts)
  2. Spacing and cover (AI-01, AI-08, AI-12, AI-13): bots steer apart and never pick a teammate's cover spot or lane spot; two characters inside each other on < 0.5 % of live ticks over seeds 1–3 (depotMatch.spacing.test.ts); jittered points stay on their floor; route legs keep a body radius from blocks; no crouch while waiting for a cover route
  3. Behaviour (AI-02, AI-04, AI-05, AI-06, AI-14, AI-15): holding bots crouch where that still sees and sweep their view; a near miss is heard at any range; sidesteps never go into a wall or out of sight of the target; in Attack / Defend one bot raises and the others guard from cover; a search ends with a look round; a second enemy heard mid-fight is searched afterwards
  4. Difficulty and fairness (AI-03, AI-17, AI-18, AI-09, SIM-13): Easy reshaped with Easy rounds no longer than 1.6× Normal's (depotMatch.difficulty.test.ts), and teammates Normal against Easy opponents until a teammate level is picked; Hard uses cover and flanks more, Easy less (BotSkill); a hit call gives a bearing, not the shooter's spot; Depot's ends reach the dock and the Main Gate within 8 m of route of each other, with the Depot match guards passing; AI-18 recorded in DECISIONS
  5. KNOWN_ISSUES rows 30 (merged), 33 (re-measured), 49, 90, 93, 94 and 95 struck or reworded, each fix with a test; rows 87 and 43/44 left with the reason in DECISIONS
status: gates
attempts: 1
