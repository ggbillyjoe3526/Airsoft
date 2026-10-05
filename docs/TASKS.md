# Tasks

Open tasks only, one block each (format in `pipeline/README.md`). A task that lands leaves this file in its records
commit, before its pull request merges (CI's scope gate finds the block in the branch's history): its REVIEWS line, its
ROADMAP row and the CHANGELOG line are the record. The planning thread writes blocks; the build thread
keeps `status` and `attempts` current.

## M53 · Extraction's announcements and the sound mix (Audit 2 UI-A + AUD PR 1: UI-01, UI-02, AUD-02, AUD-03, AUD-04, AUD-05, AUD-07, AUD-12)
tier: core
perf: required
touches: src/audio/sfx.ts, src/config/audio.ts, src/config/matchRules.ts, src/config/render.ts, src/matchSession.ts, src/rangeSession.ts, src/render/combatPresentation.ts, src/render/matchPresentation.ts, src/ui/hitFeedback.ts, src/ui/menus/menus.ts, src/ui/menus/rulesText.ts, src/ui/runStatus.ts, docs/DECISIONS.md
contract: none
acceptance:
  1. With Extraction on a map that has Extraction data, the Match pop-up hides Rounds to win, Round time, Overtime and Time-out; the rules paragraph and the Match button name the semi-only, realcap, factory-kit and minimap switches when they are set (menus.test, rulesText.test).
  2. `exitOpened` and `runWarning` reach the polite live region once per tick and show on the banner for `HUD.runNewsTime`; the respawn banner keeps priority (whatGotYouWiring.test).
  3. The neon bed's two copies sum to within 10 % of twice one copy's hum power; a channel moved from 59 to 61 m changes its filter target by less than an octave and casts no ray; the listener's up is perpendicular to forward at the pitch limit (citySound, sfx, combatPresentation tests).
  4. The count beep plays at −16 ± 1 dBFS with every interface cue within 20 dB of the hit tick (owner decision 18); a late exit plays two dry, undipped beeps 120 ms apart; ambience calls differ by match seed and keep the old timing at seed 0 (audio.test, sfx.test).
status: gates
attempts: 0
