# Tasks

Open tasks only, one block each (format in `pipeline/README.md`). A task that lands leaves this file in its records
commit, before its pull request merges (CI's scope gate finds the block in the branch's history): its REVIEWS line, its
ROADMAP row and the CHANGELOG line are the record. The planning thread writes blocks; the build thread
keeps `status` and `attempts` current.

## M65 · A field's sounds rendered in the title screen's idle time (Audit 2 AUD PR 2: AUD-01)
tier: core
perf: required
touches: src/audio/audioEngine.ts, src/audio/soundBank.ts, src/audio/soundscape.ts, src/config/audio.ts, src/game.ts, src/matchSession.ts, docs/DECISIONS.md, docs/KNOWN_ISSUES.md, docs/ARCHITECTURE.md
contract: none
acceptance:
  1. With the picked field's sounds rendered in idle time before Play, `AudioEngine.prepare` makes no new buffer and renders no map cue or loop again; Play before the prefetch ends completes the rest synchronously, with bit-identical samples (sfx.test M65).
  2. A map or Day / Night change during the prefetch carries on with the sounds both fields share and lets go of the old pick's unplayed ones; played fields' sounds are kept as before. Nothing renders ahead while a match is played; a dev map is prefetched only with Dev content on and picked.
  3. The match build line has its own `sound` phase, so a `?perf` run shows the sound work left at Play.
  4. No new SOUNDS entries or MAP_CUE_SEEDS changes; the fast project and `tsc` are clean.
status: qa
attempts: 0
