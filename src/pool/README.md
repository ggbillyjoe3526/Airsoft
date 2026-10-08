# src/pool

The asset pool, the Loadout, the Armory and Extraction's cases. `pool.md` at the repository root is the asset register
the game reads: a new asset is a row there, and a new behaviour (a Key) needs code in `config/` first.

- `poolFile.ts` pulls the Markdown tables out of `pool.md` (bundled as text, read once at start). `pool.ts` turns them
  into `Asset`s, `RarityTier`s and an `Economy`, listing each unreadable row by line and leaving it out. `gamePool.ts`
  holds `GAME_POOL`. An asset's Key links it to `config/` (`REPLICA_KEYS`, optic, grip, laser and magazine ids);
  compatibility is by tags (`fits`).
- `collection.ts`: what the player owns (a count per asset at a tier), FC, Tokens and the Shots' random state, saved as
  `airsoft.collection`. `syncCollection` and `saveOrReload` guard against another tab's newer save.
- `loadoutModel.ts`: the player's loadout without a DOM (a replica per gear slot, what is fitted, BB weight, hop-up),
  saved in the settings store and read back against an `Ownership`. `kit.ts` turns a replica item and its fit into a
  `KitSlot` (power source, laser, tier shares and the energy limit applied). `Game` passes `loadout.kit()` to each
  match.
- `tables.ts`: what `pool.ts` reads that the files built on it also need (`tierId`, the Caches table's `CaseKind`s and
  `readCaseKinds`), below `pool.ts` so no two pool files import each other (`pipeline/cycles.mjs` checks).
- `armory.ts`: pure rules over a `Collection`: `matchEarnings`, `buyTokens`, `takeShots`, `scrapSpares`.
- `botKit.ts`: Hard opponents' seeded kits. `caches.ts` and `supplyEvents.ts`: Extraction's cases (placing and rolling them) and supply events.
  `contentPool.ts`: the pool as seen with Dev content on or off. `oldPicks.ts`: carries pre-pool picks over once.
- Tuning: `pool.md` (economy, odds, scrap values) and `stats.md` (numbers, through `config/statsFile.ts`).
- Tests: `pool.test.ts` (pins every shipped ID: IDs are save keys), `kit.test.ts`, `armory.test.ts`,
  `loadoutModel.test.ts`, `caches.test.ts`, `contentPool.test.ts`.
- Rules: `pool.md`'s format is a contract (`docs/ARCHITECTURE.md › Contracts`). Read `Armament.replicas` and
  `Armament.handling`, never `LOADOUT`. The Dev tab's Disable Armory and Unlock all gear are read in `Game`
  (`gameOwnership`, the Armory's wallet).
