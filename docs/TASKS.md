# Tasks

Open tasks only, one block each (format in `pipeline/README.md`). A task that lands leaves this file in its records
commit, before its pull request merges (CI's scope gate finds the block in the branch's history): its REVIEWS line, its
ROADMAP row and the CHANGELOG line are the record. The planning thread writes blocks; the build thread
keeps `status` and `attempts` current.

## M64 · Perf harness Use key and HUD write trims (Audit 2 UI-C: UI-05, UI-11, UI-13, UI-14)
tier: ui
perf: required
touches: src/input/scriptedInput.ts, src/config/perfScript.ts, src/config/render.ts, src/matchSession.ts, src/ui/timedFill.ts, src/ui/hud.ts, src/ui/casePrompt.ts, src/ui/scoreboard.ts, src/ui/keySettings.ts, src/ui/testSupport.ts, src/render/screenMarker.ts, src/render/matchPresentation.ts, src/style.css, docs/DECISIONS.md, docs/KNOWN_ISSUES.md
contract: none
acceptance:
  1. A scripted Extraction run on Depot (seed 1) holds Use beside the first case and opens it (`perfScript.test.ts`); `PERF_SCRIPT` and an Elimination run are unchanged.
  2. The reload, case-opening and count bars are written a few times per run, not once per percent (`hud`, `casePrompt`, `scoreboard`, `timedFill` tests); under Reduced motion (class or system setting) they step per percent, and they keep their colours in forced colours (`styleSheet.test.ts`).
  3. `projectMarker` never recomputes the camera's world matrix; `MatchPresentation.frame` does it once per frame.
  4. The Key Bindings wheel listener exists only while a key box waits, and is gone when binding ends, the screen hides or it is disposed.
status: qa
attempts: 0
