# Tasks

Open tasks only, one block each (format in `pipeline/README.md`). A task that lands leaves this file in its records
commit, before its pull request merges (CI's scope gate finds the block in the branch's history): its REVIEWS line, its
ROADMAP row and the CHANGELOG line are the record. The planning thread writes blocks; the build thread
keeps `status` and `attempts` current.

## M68 · Menu polish (Audit 2 UI-D: UI-09, UI-10, UI-12, UI-15)
tier: ui
perf: none
touches: src/ui/graphicsSettings.ts, src/style.css, e2e/boot.spec.ts, docs/DECISIONS.md, docs/KNOWN_ISSUES.md
contract: none (settings are saved and read as before)
acceptance:
  1. Settings → Graphics folds the Custom rows under a preset; they show when Custom is picked or the player opens "Custom settings", and saved settings are read and written exactly as before (`graphicsSettings.test.ts`; `e2e/boot.spec.ts` opens the fold first).
  2. `.settings-reload` and `.armory-row-count` are gone, and `styleSheet.test.ts` passes, with the fold's focus ring and chevron in forced colours.
  3. Owner decision 16 is recorded: menus are unchanged at 4K with 100 % OS scaling, auto scale in Beta (DECISIONS and a KNOWN_ISSUES row).
  4. Owner decision 17 is recorded: one exit green in every team colour set until a colour-blind playtester asks, colour never the only cue (DECISIONS and a KNOWN_ISSUES row); no change in the exit, team or minimap code.
status: gates
attempts: 0
