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
