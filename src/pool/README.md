# src/pool

The asset pool, the Loadout's model, bot kits and Extraction's cases. `data/pool.md` is the asset
register the game reads: a new asset is a row there, and a new behaviour (a Key) needs code in `config/` first. Which
level unlocks an asset is in `levels.md` (`src/progress/`).

- `poolFile.ts` pulls the Markdown tables out of `pool.md` (bundled as text, read once at start). `pool.ts` turns them
  into `Asset`s and the case kinds, listing each unreadable row by line and leaving it out.
  `gamePool.ts` holds `GAME_POOL`. An asset's Key links it to `config/` (`REPLICA_KEYS`, optic, grip, laser and
  magazine ids); compatibility is by tags (`fits`).
- `item.ts`: an item is its asset id (`ItemRef { asset }`, `itemKey`, `inPool`); `parseItemKey` also reads a legacy
  `ID@tier` key and drops the tier.
- `loadoutModel.ts`: the player's loadout without a DOM (a replica per gear slot, what is fitted, BB weight, hop-up),
  saved in the settings store and read back against an `Ownership` (what the player has, what is offered, the level
  each locked item unlocks at). `kit.ts` turns a replica item and its fit into a `KitSlot` (power source, laser and
  the energy limit applied). `Game` passes `loadout.kit()` to each match. `picks`, `usePicks` and `over` read and play
  a saved loadout's record, and `missing` lists its gear that isn't available now, with the level that unlocks it
  (SL1, LV1).
- `savedLoadouts.ts`: the saved loadouts (SL1), five named slots, one of them the loadout carried, saved as
  `airsoft.loadouts`; Disable levelling keeps a set of its own. No DOM: `ui/menus/savedLoadoutsBar.ts` and
  `loadoutPicker.ts` show it.
- `tables.ts`: what `pool.ts` reads that the files built on it also need (the Caches table's `CaseKind`s and
  `readCaseKinds`), below `pool.ts` so no two pool files import each other (`pipeline/cycles.mjs` checks).
- `botKit.ts`: the bots' kits (BG1): reads `bot-kits.md`, picks each opponent's kit by its difficulty's weights
  (seeded, leaning to its personality), builds the bot carrying it and fits the night torch by rule; `gameBotKits.ts`
  reads the shipped file once.
  `caches.ts`: Extraction's cases (placing them and rolling their XP or BB resupply). `contentPool.ts`: the pool as seen with Dev content on or off.
- Tuning: `pool.md` (assets, cases), `stats.md` (numbers, through `config/statsFile.ts`) and
  `bot-kits.md` (what the other team's bots carry).
- Tests: `pool.test.ts` (pins every shipped ID: IDs are save keys), `kit.test.ts`, `loadoutModel.test.ts`,
  `savedLoadouts.test.ts`, `botKit.test.ts`, `botKitTable.test.ts`, `botKitQA.test.ts`, `caches.test.ts`,
  `contentPool.test.ts`; `testStorage.ts` and `testSupport.ts` are their helpers.
- Rules: `pool.md`'s format is a contract (`docs/ARCHITECTURE.md › Contracts`). Read `Armament.replicas` and
  `Armament.handling`, never `LOADOUT`. The Dev tab's Disable levelling (`unlockAllGear`) is read in `Game`
  (`gameOwnership`).
