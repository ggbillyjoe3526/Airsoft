# Tasks

Open tasks only, one block each (format in `pipeline/README.md`). A task that lands leaves this file in its records
commit, before its pull request merges (CI's scope gate finds the block in the branch's history): its record
(`docs/records/<id>.md`) and its CHANGELOG line remain. The planning thread writes blocks; the build thread sets
`status` and `attempts` once, in its records commit (no status-only commits).

**The owner's 0.1 Dev 4 playtest notes (2026-10-06).** Recorded on his ask, not built yet; they follow the rest
of the paused 0.1 Dev 5 work. His words and the per-item reasoning are in the project's shared
files (`plans/playtest-feedback-0.1-dev-4.md`); `docs/ROADMAP.md` › Playtest notes: 0.1 Dev 4 maps all 26 notes. M80–M91
and M96 are 0.1 Dev 5 fixes and changes, M92–M95 suggested 0.1 Dev 6 features. Notes 5 and 22 are now the Replica
Update, notes 20, 21 and 23 the Modes Update (owner, 2026-10-12; ROADMAP).
Every block below carries note 19: tune on Normal, then check that Easy, Hard and Pro still scale. `touches` are
first guesses; the build thread confirms them before it starts. The owner ruled on every conflict on 2026-10-06
(ROADMAP, under the playtest table).

**The owner's playtest notes on main (2026-10-07).** Recorded on his ask, not built yet. His words, the type and the
defaults per note are in the project's shared files (`plans/playtest-feedback-2026-10-07.md`);
`docs/ROADMAP.md` › Playtest notes: main after G3 maps all eight. M97–M99 join the Dev 4 notes batch (Dev 5 item 6); M100 is the graphics work's (Dev 5
item 5, with the G4 HUD restyle); note 3 was a bug, fixed in BP2; note 2 is already in the game
(Settings › Controls › Aim button). Note 19 of the Dev 4 notes still applies.

**0.1 Dev 6 (confirmed with the roadmap, 2026-10-06).** M92–M95, the holster and the practice upgrades, are done
(2026-10-13); the blocks for the rest of `docs/ROADMAP.md` › 0.1 Dev 6 are written when that work starts.

## RM10 · Robot figure redesign, with its rest-on-cover and vault clips (owner, 2026-10-13)
tier: core
perf: required
touches: src/assets/models/characters/, src/config/figureRig.ts, src/matchSession.ts, src/render/figureLegs.ts, src/render/figurePose.ts, src/render/figureRig.ts, src/render/riggedFigure.ts, src/sim/figureLegs.ts, tools/blender/bot-figure/
contract: none
acceptance:
  1. The robot is rebuilt from the owner's reference pictures and his first review: every robot wears the old sensor head made over with a visor and a headset with square headphones; the team-coloured shoulders are part of the arm, not sticking out; no plus marks; boxier and more mechanical, with more detail. He approves it from review pictures before it merges.
  2. Same skeleton and clip names as v11; the hands hold the replicas naturally (`check/arms-check.mjs`: 0 over the limits).
  3. Team colour shows through its highlights (Alpha 0x3d8bff, Beta 0xff8a2a); no pouches, holsters, magazines or packs.
  4. At most 20,000 triangles for the whole figure and 2,500 for the head.
  5. Rest-on-cover clips and a Vault clip, every existing clip kept; a file without them keeps today's placeholders.
  6. The hit volume is no further from the robot than before on any pose (`render/riggedHitVolume.test.ts`), and its legs follow the robot's vault.
  7. Behind the Dev model switches, packed with `pack.mjs`; the first-person body still hides the head.
status: building
attempts: 0
