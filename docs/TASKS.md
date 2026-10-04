# Tasks

Open tasks only, one block each (format in `pipeline/README.md`). A task that lands leaves this file in its records
commit, before its pull request merges (CI's scope gate finds the block in the branch's history): its REVIEWS line, its
ROADMAP row and the CHANGELOG line are the record. The planning thread writes blocks; the build thread
keeps `status` and `attempts` current.

## M35 · Public and dev content tags: dev content only with the Dev content switch on
tier: core
perf: skip
touches: src/config/content.ts, src/config/dev.ts, src/settings/dev.ts, src/config/modes.ts, src/config/bots.ts, src/config/matchRules.ts, src/map/maps.ts, pool.md, src/pool/pool.ts, src/pool/contentPool.ts, src/pool/armory.ts, src/pool/botKit.ts, src/pool/loadoutModel.ts, src/matchSession.ts, src/game.ts, src/ui/recordsView.ts, src/ui/optionPicker.ts, src/ui/menus/choiceDialog.ts, src/ui/menus/menus.ts, src/ui/menus/armoryScreen.ts, src/ui/menus/summaryScreen.ts, src/config/menus.ts, src/ui/devSettings.ts, src/newGamePicks.ts, e2e/, docs/
contract: pool.md's asset tables gain a Tag column (public or dev; blank reads as public); Asset, MAPS, MATCH_MODES and DIFFICULTIES entries gain `tag: ContentTag`; the settings store gains `dev.devContent` (a new field, no version change); MatchSetup gains `devContent` and `devContentUsed`
acceptance:
  1. Every map, mode, difficulty and pooled asset carries a tag, public or dev (`ContentTag`, config/content.ts); choice lists (team size and the other Match pop-up options) may carry one, untagged meaning public; pool.md has a Tag column the game reads, with a bad value leaving the row out
  2. One Dev tab switch, Dev content (off by default, `dev.devContent`; a save holding the Woodland thread's `dev.mapsInDevelopment` carries over), applying only while Dev settings is ticked; `isAvailable(tag, devContent)` is the one check every menu and system uses
  3. With it off, dev content is not shown anywhere (owner, 18:57): dev maps (and the Coming soon list), modes, difficulties and choices are hidden, dev gear is hidden from the Loadout and the Armory's collection (kept in the save, picks remembered), a saved dev pick plays as the default, bots never carry dev gear, and Unlock all gear lends no dev gear; with it on, all of it is offered looking like the rest (no badge)
  4. Dev gear never drops from Shots, whatever the switch
  5. A match that uses any dev content (map, mode, either difficulty, the player's kit or a bot's) stays out of the records and pays no Field Credits; New game says so beforehand and the summary says why
  6. Today everything is public; the decision is recorded in DECISIONS
status: building
attempts: 0
