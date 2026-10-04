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
attempts: 1

## M31 · Save system: automatic browser save, download and load a save file, restore points, version migrations
tier: ui
perf: skip
touches: src/save/, src/config/save.ts, src/settings/storage.ts, src/input/keyBindings.ts, src/stats/records.ts, src/pool/collection.ts, src/config/menus.ts, src/ui/menus/icons.ts, src/ui/menus/settingsScreen.ts, src/ui/menus/menus.ts, src/ui/saveSettings.ts, src/ui/saveDialog.ts, src/ui/otherTabNotice.ts, src/game.ts, src/main.ts, src/style.css, e2e/, docs/
contract: the settings store keys (unchanged: no key renamed; `browserStorage()` may return the save layer's guarded storage); a new contract, the save file format (`save/saveFile.ts`, `SAVE_FORMAT`)
acceptance:
  1. Settings, key bindings, Loadout picks, Dev settings, the Armory collection (FC, Tokens, items, Shot seed), records and the tutorial flag keep saving automatically as they change; the Save tab says when it last saved
  2. Settings → Save (a new tab, last before Dev) downloads the whole save as readable JSON `airsoft-save-YYYY-MM-DD.json` with the game's version, the date, a summary and a SHA-256 checksum; it works with storage blocked (the session's data)
  3. Load save file (button or a file dropped on the tab) shows this browser's save beside the file's (date, version, FC, Tokens, items, matches) and replaces it only on Replace; the replaced save is kept for Undo; the game reloads; refused mid-match (from the pause menu), for a file that isn't a save, a file over the size limit and a save from a newer format ("update the game"); a checksum mismatch asks "Load anyway?"
  4. Forward compatibility: the save carries a format number; older formats are migrated step by step (one function per step, tested), anything a build doesn't recognise is kept on load and on the next save (settings, records, collection, key bindings); a test fails if a store's version changes without SAVE_FORMAT following
  5. Three daily restore points in the browser, restorable from the Save tab; Undo last load or delete; Delete save and start over with a confirm that offers a download first
  6. A browser save written by a newer format is never overwritten by this build (changes last for the visit, the Save tab and title say so); blocked or failing storage is shown on the Save tab and the title screen
  7. A second tab shows "Airsoft is open in another tab" with Play here; taking over makes the first tab write what's pending and stop saving
  8. Protect from automatic clearing asks the browser for persistent storage only when pressed, and shows the answer
  9. Only standard APIs available in current Chrome, Edge and Firefox (Blob download, file input, drag and drop, BroadcastChannel, StorageManager); PLAYTEST lists the Firefox checks
status: building
attempts: 0
