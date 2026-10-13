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

## SL1 · Saved loadouts (Dev 6 item 19)
tier: ui
perf: skip
touches: src/pool/loadoutModel.ts, src/pool/savedLoadouts.ts, src/config/savedLoadouts.ts, src/save/saveFile.ts, src/save/stores.ts, src/ui/menus/savedLoadoutsBar.ts, src/ui/menus/loadoutPicker.ts, src/ui/menus/loadoutScreen.ts, src/ui/menus/setupScreen.ts, src/ui/menus/menus.ts, src/ui/menus/menusOptions.ts, src/ui/menus/contextMenu.ts, src/ui/menus/menus.css, src/ui/menus/css/
contract: none
acceptance:
  1. The Loadout shows five saved loadout slots as tabs, the current one clearly marked; a tab (or keys 1 to 5) switches the loadout carried at once: replicas, parts, battery or gas, BB weight, hop-up, Glowing BBs and colours.
  2. Changes on the Loadout and in Customise go to the current saved loadout; the others keep what they hold.
  3. Rename, duplicate, replace with the loadout carried (overwrite) and delete, asking first before a delete or a replace; the last one can't be deleted, and deleting the current one carries the next.
  4. The Match screen's Your match picks a saved loadout from a list (the current one marked) and opens the Loadout to manage them; its kit shows the pick at once.
  5. Gear a saved loadout holds that isn't available now (not owned or unlocked, or dev gear with Dev content off) shows as locked with what plays in its place, plays as the defaults, and comes back when the gear does; availability is the Loadout's one ownership check.
  6. Saved in their own store of the save file (format 2, with its migration): a format 1 save, or a browser without the store, starts with one saved loadout, the one carried. Unlock all gear keeps a set of its own; bots are unaffected.
status: open
attempts: 0
