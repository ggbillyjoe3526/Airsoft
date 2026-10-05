# Tasks

Open tasks only, one block each (format in `pipeline/README.md`). A task that lands leaves this file in its records
commit, before its pull request merges (CI's scope gate finds the block in the branch's history): its REVIEWS line, its
ROADMAP row and the CHANGELOG line are the record. The planning thread writes blocks; the build thread
keeps `status` and `attempts` current.

## M69 · Owner-approved audio polish (Audit 2 AUD PR 4: AUD-08, AUD-09, AUD-10, AUD-11)
tier: core
perf: required
touches: src/audio/dsp.ts, src/audio/soundBank.ts, src/audio/audioEngine.ts, src/audio/sfx.ts, src/audio/soundscape.ts, src/config/audio.ts, src/config/sounds.ts, docs/DECISIONS.md, docs/ARCHITECTURE.md, docs/KNOWN_ISSUES.md
contract: none
acceptance:
  1. Every cue's buffer ends at most 64 samples after its last sample above −60 dB of its peak, with its samples before that unchanged; `count.beep` renders one variant and every other title cue matches the old stream; the fingerprints are re-baked with the tests' own helper, and a DECISIONS line records owner decision 19's exception to the M33j rule.
  2. Woodland and Neon Heights play their own echo from `Ambience.reverb`, rendered in New game's spare time (Play makes no buffer for it); Depot and the range keep the yard's echo and wet level, and Depot's graph differs only in its shortened one-shot buffers.
  3. The neon hum has under 20 % of its power below 150 Hz and over 65 % between 150 and 500 Hz, and its two bed copies still sum to about twice one copy (within 10 %).
  4. No new SOUNDS entries or MAP_CUE_SEEDS changes; `tsc` and the fast project are clean.
status: qa
attempts: 0
