# Tasks

Open tasks only, one block each (format in `pipeline/README.md`). A task that lands leaves this file in its records
commit, before its pull request merges (CI's scope gate finds the block in the branch's history): its REVIEWS line, its
ROADMAP row and the CHANGELOG line are the record. The planning thread writes blocks; the build thread
keeps `status` and `attempts` current.

## FA10 · Armory, economy, records and tutorial
tier: core
perf: skip
touches: pool.md, src/pool/poolFile.ts, src/pool/pool.ts, src/pool/collection.ts, src/pool/armory.ts, src/pool/loadoutModel.ts, src/stats/matchStats.ts, src/stats/settleMatch.ts, src/stats/records.ts, src/matchSession.ts, src/rangeSession.ts, src/game.ts, src/config/menus.ts, src/config/tutorial.ts, src/tutorial/tutorial.ts, src/settings/storage.ts, src/sim/armament.ts, src/style.css, src/ui/performanceSheet.ts, src/ui/menus/armoryScreen.ts, src/ui/menus/confirmDialog.ts, src/ui/menus/summaryScreen.ts, src/ui/menus/loadoutScreen.ts, src/ui/menus/menus.ts, src/ui/menus/pauseScreen.ts, src/ui/menus/savedChoices.ts
contract: pool.md's format (a Pity table, `| Guarantee | Shots |`, and an "Unowned item weight" row in Tokens and Shots); the collection's stored object (`airsoft.collection`, still version 1) gains optional `pity` (Shots since each pity tier, by tier id) and `rev` (save revision); the settings store gains fields only: `tutorialStep` (a step id), `hopUp.<asset id>`, `bbWeight.<asset id>` and their `hopUp.dev.*` / `bbWeight.dev.*` sandbox copies (the old `hopUp.<config id>` keys are still read)
acceptance:
  1. Collection integrity and confirmations (POOL-02, 03, 06, 07, 17, 18, 19, 20, 21): a spend in one tab and an earning in another both survive (revision stamp, sync before change, no save over a newer revision); 10 Shots and Scrap all spares ask first, the keyboard starts on Cancel and a held Enter takes one Shot; a Rarity table listed rarest first, a duplicate column, an escaped pipe, a mis-cased heading, a duplicate Name, extra cells and money cells over 1,000,000 are named with their line; an over-large saved balance loads as the largest exact one; each Shot mixes fresh entropy; dials are keyed by replica asset and sandboxed under Unlock all gear; record keys of the wrong shape are dropped (tests)
  2. Gacha design (POOL-01, 04, 05, 10, 11, 12, 13, 26): an Epic or rarer within 20 Shots and a Legendary within 100, counted across visits and shown on the Armory; the ten-Shot Rare guarantee stays; an asset not owned at the tier drawn is twice as likely; a lower tier can be scrapped once a rarer copy of the asset is owned (picks move to the best copy); the catalogue lists every asset with its tiers and the completion; the reveal is rarest first with a summary line, staggered (not with reduced motion) and read out from the first Shot; the Shot buttons show their FC price; the odds caption and the per-asset line say what the numbers mean; Customise and every tile say what a tier adds (tests)
  3. Economy and records (POOL-08, 09, 22, 25): Round won pays only rounds the player took part in, scaled by match length, at the lower of the two teams' multipliers; the summary says why a match paid nothing; the once-only record and pay takes are a pure, tested `MatchTakes` (tests)
  4. Tutorial (POOL-14, 15, 16): Skip step and Skip tutorial on the range's pause menu while coaching; the tutorial resumes at the saved step; new fire selector, sprint-then-shoot and "In a match" steps; the switch-replica step is left out with one replica (tests)
  5. SIM-09: shot spread is the same angle sideways as up and down at any pitch, never past vertical; the headless guards hold (one re-measured over 32 seeds and recorded)
  6. FA6 follow-up: the silencer's muffled copies are filtered at `AUDIO.renderRate` (test); POOL-23 and POOL-24 are in docs/IDEAS.md for Beta
status: gates
attempts: 1
