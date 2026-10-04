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

## FA5 · Input, key bindings and HUD fixes
tier: ui
perf: skip
touches: src/config/controls.ts, src/config/menus.ts, src/config/matchInfo.ts, src/config/minimap.ts, src/input/keyBindings.ts, src/input/keyboard.ts, src/input/keyboardLayout.ts, src/input/pointerLock.ts, src/input/sensitivity.ts, src/settings/storage.ts, src/ui/keySettings.ts, src/ui/keyNotes.ts, src/ui/restartAnimation.ts, src/ui/hitFeedback.ts, src/ui/roundBanner.ts, src/ui/squadOrderLine.ts, src/ui/minimap.ts, src/ui/minimapView.ts, src/ui/orderWheel.ts, src/ui/crosshair.ts, src/ui/crosshairSettings.ts, src/ui/hud.ts, src/ui/hudSettings.ts, src/ui/controlsSettings.ts, src/ui/fullscreen.ts, src/ui/menus/menuParts.ts, src/ui/menus/menuNav.ts, src/ui/menus/menus.ts, src/ui/menus/settingsScreen.ts, src/ui/menus/savedChoices.ts, src/render/matchPresentation.ts, src/game.ts, src/style.css
contract: the settings store keys, additively only (new fields hudSize, rawInput, crosshair customColor / opacity / dynamic; a `migrate` scaffold keyed on the version; a newer saved object is never read or overwritten)
acceptance:
  1. Key names (UI-01): bindings stay KeyboardEvent.code; labels follow the player's layout via navigator.keyboard.getLayoutMap() and update on a layout change; where the API is missing (Firefox) a note says names follow a US keyboard (tests: keyBindings, keyboardLayout)
  2. Bindings (UI-05, UI-07, UI-08, UI-17): each action has a main and a second key; taking another action's key moves it and says so ("F was Reload: Reload is now …") with a flash on that row; Backspace / Delete clears a key; an essential action can't be left with no key; wheel up / down are bindable and override replica switching; browser keys (F5, F11, F12 …) are refused with a reason; Reset All needs a second click within 3 s; focus stays on the box after binding (tests: keyBindings, keyNotes)
  3. Pointer and pause (UI-09, UI-10, UI-19, UI-20, row 122): Esc on the pause screen resumes (a repeat or a press within 400 ms of pausing does not); the first mouse move after a lock and any absurd jump are dropped; raw (unadjusted) mouse input is a setting with its status shown; leaving fullscreen by its key re-locks instead of pausing (tests: pointerLock, menus, fullscreen)
  4. Sensitivity (UI-24): a typed cm/360 value is kept exactly (only clamped) and the slider step is 0.01 (test: sensitivity)
  5. HUD size (UI-04): Settings → HUD has a HUD size slider (0.8–1.5); every HUD block scales by --hud-scale times an automatic factor above 1080p; the minimap canvas follows the scale and device pixel ratio (max 2) and re-lays out on resize; nothing overlaps at 1280x720, 1920x1080 or 2560x1440 (tests: matchInfo hudScale, minimap, minimapView)
  6. Markers (UI-13, UI-14): teammate markers hide behind the minimap circle and all markers hide while the scoreboard is up (tests: minimapView insideCircle, minimap covers)
  7. Readability and accessibility (UI-03, UI-15, UI-16, UI-18, UI-21, UI-22, UI-23, rows 105, 137, 138, 140, 145): order wheel shows each order's key; crosshair custom colour, opacity and a static-gap option; hit, out and round messages reach screen readers through live regions; forced-colors and prefers-contrast styles; setup tiles never break a word at 1181–1400 px; long Settings pages show a fade while more is below (tests: orderWheel, crosshair, roundBanner, menus moreBelow)
  8. Settings writes (UI-11, CORE-12, UI-25, row 99): the stored object is parsed once per text and cached; sliders write after 400 ms of quiet and flush on pagehide / hidden tab; legacy keys fill only missing fields and are removed on the next write (test: storage)
  9. DECISIONS, KNOWN_ISSUES and PLAYTEST updated under FA5
status: gates
attempts: 1

## FA9 · UI polish: design tokens, menu chrome, HUD hierarchy
tier: ui
perf: required
touches: src/style.css, index.html, public/icon.svg, public/manifest.webmanifest, vite.config.ts, src/main.ts, src/physics/physicsWorld.ts, src/config/loading.ts, src/config/page.ts, src/config/minimap.ts, src/ui/loadingProgress.ts, src/ui/loadingScreen.ts, src/ui/hitFeed.ts, src/ui/minimap.ts, src/ui/keySettings.ts, src/ui/menus/icons.ts, src/ui/menus/menuParts.ts, src/ui/menus/setupScreen.ts, src/ui/menus/settingsScreen.ts, src/ui/menus/pauseScreen.ts, src/ui/menus/titleScreen.ts, src/ui/menus/resultScreen.ts
contract: none
acceptance:
  1. Tokens (audit section 6 items 1-4): style.css `:root` holds a type scale (`--fs-2xs` … `--fs-display`), three letter-spacings, a spacing scale (`--sp-1` … `--sp-8`), control heights 56/48/40/36/32, radii 4/8/12 and the colour tokens (`--menu-bg`, `--menu-line-soft`, `--hint`, `--danger`, `--warning`, `--success`, `--orange-hover`, `--hud-fg`, `--hud-panel`); no 10 px type is left and text no longer uses opacity for its secondary level
  2. Menu chrome (items 5-11): primary, secondary and ghost buttons each have hover, active, focus and disabled states with one transition group; one `:focus-visible` rule (2 px orange ring plus a 4 px `--menu-bg` gap, so it reads on orange); "the current place" is orange text plus a 3 px orange bar (settings tabs, the selected Loadout column); dialogs lift (shadow, top highlight, a blurred backdrop behind `@supports`, a short scale-in) and the Match dialog's labels share Settings' 200 px column; menu screens fade in; thin dark scrollbars; every duration is 0 with reduced motion (the setting or the system's)
  3. Copy (item 8): button labels in TS are sentence case where this task touches them ("Practice range", "Reset all", "Play again", "New game"); the uppercase is CSS; the wording is unchanged
  4. Title and loading (items 12-13, UI-12, CORE-10): the hardware warning is a slim banner with an icon in `--warning`; the page paints the dark loading screen (wordmark, 2 px bar, status line) from index.html before style.css, with `color-scheme`, `theme-color`, a `<noscript>` message, an SVG favicon and a web manifest; in a production build the bar fills from the physics chunk's real download (fetch progress, then the import answered by the cache: the chunk is downloaded once) and says why if starting fails (tests: loadingProgress)
  5. CSP (CORE-19): a production build carries a Content-Security-Policy `<meta>` (self only, `'wasm-unsafe-eval'` for the physics and mesh decoder WASM, blob workers, data/blob images and media, inline styles); the build boots under it with no violation; the dev server gets none (test: page)
  6. HUD (items 14-17, 20): three levels (crosshair full; replica panel and scoreboard 0.92; minimap, hit feed, markers and squad line 0.8), one `--hud-panel` and `--hud-radius` for every HUD panel (minimap backdrop from config), every corner at `--hud-margin` inside a 16:9 safe area on ultrawide screens; scoreboard pips 7 px with a dark ring, 11 px role and tag type, a 3 px objective bar; each hit-feed line has a 2 px bar in the hitter's team colour (colour-blind palette respected); the round banner is 22 px 700 and shrinks with narrower windows (`min(22px, 1.8vw)`); the fire mode reads as a key cap
  7. Tables and icons (items 18-19): result, summary and records tables share one head style, zebra rows and cell padding; static, `aria-hidden` SVG icons beside the Settings tab names, the New game tile labels, the pause buttons and the hit feed's friendly/ricochet tags, with the text kept as the accessible name (test: icons)
  8. Layout, element order and wording of every screen unchanged; the Graphics tab's rows, the Loadout stat sheet and the Armory tier line untouched; forced-colours and prefers-contrast styles kept (the new bars use Highlight)
  9. DECISIONS, KNOWN_ISSUES and PLAYTEST updated under FA9
status: gates
attempts: 1
