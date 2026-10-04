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
