# Tasks

Open tasks only, one block each (format in `pipeline/README.md`). A task that lands leaves this file in its records
commit, before its pull request merges (CI's scope gate finds the block in the branch's history): its REVIEWS line, its
ROADMAP row and the CHANGELOG line are the record. The planning thread writes blocks; the build thread
keeps `status` and `attempts` current.

## G2 · Replica and part models, item pictures (graphics overhaul, 0.1 Dev 5)
tier: core
perf: skip
touches: src/render/replicaModels.ts, src/render/replicaBuilder.ts, src/render/replicaParts.ts, src/render/itemPictures.ts, src/config/itemPictures.ts, src/config/replicaFinish.ts, src/config/schemes.ts
contract: none (the part tables keep every name; every hand point, the handguard envelope, the optic axis and the muzzle layouts stay as they are)
acceptance:
  1. The rifle, Gas Pistol and Cyber Pistol and every part in their tables are the concept's blockier, two-tone builds: body, furniture, details, a thin accent line (glowing on Ghost) and steel in the replica's scheme; the Cyber Pistol a white slab with glowing cyan lines and a magenta core over a dark frame, grey and unlit under Realistic colours.
  2. Low draws no more triangles than before G2 (rifle 10,844, pistol 7,944 at once) and stays plain (no texture coordinates, vertex colours or maps); High stays within its budget (rifle 17,500, pistols 11,000) and every part stays at most four draw calls.
  3. Aiming, reloads and muzzles work as before: the red dot's window holds the view centre at the strongest kick, the BB leaves each fitted device's front face, the support hand reaches each magazine's base.
  4. An item-picture renderer draws a replica (with any parts fitted, in any scheme) or one part on its own off screen, from the same models without hands, at most one a frame, kept for the visit; a failed draw is retried on the next ask.
status: building
attempts: 0

## G3 · Menu and UI redesign (graphics overhaul, 0.1 Dev 5)
tier: ui
perf: required
touches: src/ui/, src/style.css, src/config/menus.ts, src/config/menuArt.ts, src/config/save.ts, src/render/itemPictures.ts, src/game.ts, src/main.ts, src/assets/fonts/, public/menu/, pipeline/map-stills.mjs, pipeline/perf-run.mjs, index.html
contract: Content tags (the Map and Mode pop-ups become inline cards on Play: `ChoiceDialog` becomes `ChoiceCards`, with the same `setDevContent` and `limit` rules); no settings key renamed or dropped
acceptance:
  1. Every screen (title, Play, Loadout, Customise, Armory, Settings, pause, match summary, result, the loading screen, the pop-ups; the Tab scoreboard's frame is G4's, with the HUD) takes the approved concept's look: Barlow and Barlow Condensed (woff2 in the game, the OFL beside them, listed in docs/ASSETS.md), deep navy panels with cut corners, orange for the chosen item and the main action, a top bar (Play, Loadout, Armory, Range, Settings, Field Credits and Tokens, the version) on the screens between matches, and key hints along the foot that are real buttons or real keys. No text under 15 px; notes in sentence case at full contrast (a stylesheet test pins both).
  2. Title: Play, Tutorial (tagged until played through), Practice range, Loadout, Armory (tagged while Tokens wait), Settings; your next match (its map still, mode, teams, opponents and rounds) and your kit (the carried replicas' pictures); a tip; the build version.
  3. Play: Map as picture cards (one still per map and time of day, Day | Night on a map that offers both, a Dev badge on dev maps, which show only with Dev content on), Mode as cards with a picture each, the Match rows inline (Rules, rounds to win, team size, opponents and teammates, and every rule a ruleset leaves to you), and a Your match panel (the map still, mode, rules, teams, your replicas' pictures, the rules note, Play). Every rule, limit and dev-content behaviour of the old pop-ups is kept.
  4. `pipeline/map-stills.mjs` renders, from the built game, one still per map and time of day (about 480 × 270 JPEG, under 40 KB each), a picture per mode, the title's backdrop and one pre-blurred menu backdrop into `public/menu/`; they are committed and listed in docs/ASSETS.md as made by the project.
  5. Loadout: the carried replicas large with their pictures (scheme and fitted parts), your replicas as picture tiles, a Selected panel with the replica's numbers; picking a replica changes only the tiles and slot it affects, never rebuilding the grid.
  6. Customise: a part list (Colour first, then the parts, BB weight, hop-up, glowing BBs and Skins later) beside the picked part's options as picture tiles, the replica's picture large and the Performance sheet. Colour shows the eight schemes as pictures of that replica in each, the current one marked, saved through `setScheme`; under Realistic colours the plain family pictures instead; the Cyber Pistol has no Colour row and says why in a line. Picking an option updates only what it changes (its tiles, its line in the list, the picture and the sheet).
  7. Armory: pictures on the Shot's reveal and on the collection; every action, price, guarantee, odds line and confirmation kept.
  8. Settings: Graphics, Display, Audio, Controls, Gameplay, Accessibility, Look, then Save and Dev; every row kept on its saved key (Crosshair and HUD under Gameplay; Fullscreen, field of view, tone mapping and Show FPS under Display; Key Bindings under Controls); a search box that filters rows across every group; a note on every row (a test builds every group and checks).
  9. Speed: a screen is built the first time it opens and reused; one pre-blurred backdrop image and no `backdrop-filter` anywhere (a stylesheet test pins it); pictures never hold a screen up (a placeholder until each arrives); the game owns one ItemPictures made from its renderer (following a replaced context) and disposes it.
  10. Keyboard and screen readers: every control keeps a role and a name, focus returns where it was, and the browser tests drive the new screens by role and name and pass.
status: building
attempts: 0

## G4 · HUD restyle (graphics overhaul, 0.1 Dev 5)
tier: ui
perf: required
touches: src/ui/, src/style.css, src/main.ts, src/config/hudText.ts, src/config/minimap.ts, src/config/matchInfo.ts, src/render/combatPresentation.ts, src/render/matchPresentation.ts, src/game.ts
contract: none (every HUD setting keeps its key and meaning; the HUD keeps its layout and positions)
acceptance:
  1. Score bar (top centre): each team's name and a slanted pip per player (dimmed once out) on a navy panel with a cut outer corner, the score on a solid block in the team's colour, the clock between them with the match's aim under it ("First to 5"; the run's line in Extraction); "You" on your side, ATK / DEF, the flag strip, the low clock and the Scoreboard size setting kept.
  2. Minimap (top left): a framed navy panel with rounded corners holding the turned field (teammates pinned to its edge), with the map and round under it ("Depot · Round 2"); the canvas is drawn again only when something on it changed (where you stand or look, a teammate, the hold spot, the flag, an exit, a heard patch still fading, its size), a test counting the draws.
  3. Hit feed (top right): one navy row per hit, the shooter, a BB mark and who called it in their team colours, with a Hit tag; your own rows marked with an acid edge; friendly and ricochet tags, Fade and Keep kept; a screen reader still hears "<who> called HIT · <shooter>".
  4. Replica panel (bottom right): the carried replica's picture in its scheme with its parts (ItemPictures, the drawing until it arrives), its name, a chip per fire mode it has with the current one orange, the loaded BBs large, the BBs in the spare magazines and how many there are, and a bar per spare magazine filled to its BBs with the one a reload takes marked; the reload bar and the status line kept.
  5. Squad line (bottom left): a card per player on your side (You first) with a head icon (src/ui/headIcon.ts) in the team colour, the name and what they are doing (In play, the order in force, Hit), greyed once hit; under it the order keys as the player bound them; the order line's notices kept for screen readers.
  6. The Tab scoreboard (.match-board): a navy panel with a cut corner, each team under a bar in its colour with its score, your row marked; same rows and columns.
  7. Every HUD setting still works (HUD size, Scoreboard size, Hit feed, What got you, sound cues, crosshair); no per-frame allocation, DOM written only on a change; Low draws the same.
status: building
attempts: 0
