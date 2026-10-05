# Tasks

Open tasks only, one block each (format in `pipeline/README.md`). A task that lands leaves this file in its records
commit, before its pull request merges (CI's scope gate finds the block in the branch's history): its REVIEWS line, its
ROADMAP row and the CHANGELOG line are the record. The planning thread writes blocks; the build thread
keeps `status` and `attempts` current.

## M70 · The Armory's odds caption and refused-save notice (Audit 2 POOL-C: POOL-05, POOL-08)
tier: ui
perf: none
touches: src/config/menus.ts, src/game.ts, src/pool/collection.ts, src/style.css, src/ui/menus/armoryScreen.ts, src/ui/menus/menus.ts, docs/DECISIONS.md, docs/ARCHITECTURE.md
contract: none (the saved collection's format is unchanged)
acceptance:
  1. The Armory's odds caption reads "Rarity odds (each item drawn, before pity)" (owner decision 24); pool.md, stats.md and the saved collection's bytes are unchanged.
  2. When a collection save is refused because another tab saved first, the collection is reloaded from that save at once and the Armory shows one plain-words line saying so and that the change was not kept; the line clears on the next change or when the screen opens again, and the stale Shot reveal is not shown.
  3. A full or blocked store and a newer game's file never show the notice, and a newer game's file is still never read or overwritten.
  4. `saveOrReload` and the Armory notice have tests that fail without the change; `tsc` and the fast project are clean.
status: qa
attempts: 0
