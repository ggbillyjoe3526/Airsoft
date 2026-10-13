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

**0.1 Dev 6 (confirmed with the roadmap, 2026-10-06).** M94–M95, the rest of the practice upgrades, come before the
rest of `docs/ROADMAP.md` › 0.1 Dev 6, whose blocks are written when that build starts (M92, the holster, and M93,
the practice targets, done 2026-10-13).

## M95 · Practice with any unlocked replica (playtest note 12)
tier: ui
perf: skip
touches: src/rangeSession.ts, src/ui/menus/loadoutScreen.ts, src/ui/loadoutChoice.ts, src/config/dev.ts
contract: none
acceptance:
  1. In Practice the player picks any replica they own and can Customise it freely.
  2. With Dev settings on (Unlock all gear), every replica and part is available.
status: open
attempts: 0


## LV1 · Levelling up in place of the Armory's Shots (owner, 2026-10-13)
tier: core
perf: required
touches: src/, pool.md, stats.md, levels.md, pipeline/, .claude/skills/new-content/SKILL.md
contract: the save file format (format 2: the progress store in place of the collection), pool.md's format (no Rarity or economy tables), stats.md's format (no tier shares), the settings store keys (rarity.* and dev.disableArmory retired)
acceptance:
  1. The gacha is gone: no Field Credits, Tokens, Shots, rarity tiers, pity, spares or scrap in the game, the save or the data files; the Armory stays on the top bar.
  2. Players start at level 0 with the starting kit; matches give XP, and levels up to a cap of 10 unlock attachments and the Cyber Pistol for good.
  3. `levels.md` at the repository's root lists what each level unlocks and the XP rules, easy to read and edit by hand; the game reads it, and a mistake is reported with its line and never stops the game.
  4. The Armory shows the player's level and XP, what they have unlocked, and what every level still to reach unlocks.
  5. Settings › Dev › Disable levelling unlocks every replica and part.
  6. Raising the cap and adding rewards (future replicas, attachments, skins) is adding rows to `levels.md`.
  7. With rarity gone, every replica and part is rebalanced to one set of numbers, checked with the balance runs.
status: open
attempts: 0
