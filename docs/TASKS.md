# Tasks

Open tasks only, one block each (format in `pipeline/README.md`). A task that lands leaves this file in its records
commit, before its pull request merges (CI's scope gate finds the block in the branch's history): its REVIEWS line, its
ROADMAP row and the CHANGELOG line are the record. The planning thread writes blocks; the build thread
keeps `status` and `attempts` current.

## M54 · Accessibility and browser compat (Audit 2 UI-B: UI-03, UI-04, UI-06, UI-07, UI-08)
tier: ui
perf: none
touches: src/style.css, src/game.ts, src/ui/menus/savedChoices.ts, src/ui/minimap.ts, src/render/matchPresentation.ts, docs/DECISIONS.md, docs/KNOWN_ISSUES.md
contract: settings store: `reducedMotion` is saved exactly as before ('on' / 'off'); reading it gives null when nothing valid is saved
acceptance:
  1. With nothing saved, `#app` has neither `reduced-motion` nor `full-motion`, so a change to the system "reduce motion" setting takes effect without a reload; a saved On or Off still sets its class, and the stored `reducedMotion` field is unchanged.
  2. The debug overlay sits below the minimap through a `minimap-on` container class, and `style.css` has no `:has()` rule.
  3. The empty key box's dash is at least 4.5:1 on its panel, and the forced-colours list covers `.case-prompt`, `.coach` and `.range-readout`.
  4. The respawn fade restarts through `restartAnimation`, with no forced layout read.
status: gates
attempts: 0
