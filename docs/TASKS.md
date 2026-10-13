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

## RM9 · The human figure redesigned from the owner's references, with four heads (owner's ask, 2026-10-13)
tier: core
perf: required
touches: src/assets/models/characters/, src/config/figureRig.ts, src/render/riggedHitVolume.test.ts, tools/blender/bot-figure/
contract: none
acceptance:
  1. The human figure is rebuilt from the owner's reference pictures (body, gloved hands, gear): the hands hold both replicas naturally, and the owner approved the review sheets (turnaround, heads, hands, poses) before it entered the game.
  2. Four heads (high-cut helmet, cap with goggles, boonie, full-cut helmet), one per figure picked by its id; first person hides every head.
  3. Team colour reads from the plate carrier and cummerbund as well as the armbands, patches and helmet or hat bands (the owner's choice, 2026-10-13).
  4. Budgets: at most 20,000 triangles per figure (body, kit and its largest head), each head at most 2,500, the packed file under 3.5 MB (packed with `pack.mjs`); the clip set and its names are unchanged.
  5. `riggedHitVolume.test.ts` measures the human in every head and passes; the figures stay behind "Disable figure models" and "Disable all models", so the default game is unchanged.
  6. The build scripts are committed (`bot20.py`–`bot22.py` in the load order, beside the robot thread's), and the shared handoff file says how the two threads' scripts load together.
status: open
attempts: 0
