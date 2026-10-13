# src/content

The content checks (the content toolkit): what makes a new replica, part, map, mode or skin fit to ship, in four levels. The rulebooks
they enforce are in `docs/content/`; the command that runs them and writes the report is `pipeline/content-check.mjs`.

- **Inputs.** `contentInputs.ts` names everything a check reads (`ContentInputs`: the pool, `stats.md`, the replica
  configs, the model tables, the sound cues, the code keys, a part's effects, the levels), so a test can hand in a
  fault. `gameContent.ts` builds the game's own (`gameInputs`) and runs levels 1 and 2 (`checkAsset`, `checkAllAssets`).
- **Results.** `checks.ts`: a `CheckResult` is a level, a check name (`replica.model`), the item, a verdict (pass,
  warn, fail, info) and what was found in plain words.
- **Levels 1 and 2.** `assetRules.ts` (name, brands, access), `replicaChecks.ts`, `partChecks.ts`, `levelChecks.ts`
  (`item.level`: a row of `levels.md` unlocks the item, so players can get it) and `kitGrid.ts` (every kit of parts a
  replica can wear, memoised per pool).
- **Level 3.** `specSheet.ts` (the chrono and range table, from the game's own BB flight), `census.ts` (model cost
  and shot sound), `specChecks.ts` (their verdicts), `kits.ts` (a replica as it comes, and as carried).
- **Maps (CT2).** `mapChecks.ts` (`checkMap`: levels 1 to 3 over any `MapData`, every check re-exported for its
  fault test) gathers `mapRules.ts` (level 1), `mapLayoutChecks.ts` (level 2, and `mapFigures` for the report) and the
  perf gate check; `mapCheckSupport.ts` holds their context and wording. They measure on `mapLayout.ts` (the map's nav
  grid and sight rays, memoised per map: stand points, who sees whom, the longest sightline stretched from a coarse
  grid to its full length, walk fields and routes).
- **Modes (CT3).** `modeChecks.ts` (`checkMode`: levels 1 to 3's fast checks over any mode, every check re-exported
  for its fault test; `modePairings`, the compatibility grid) gathers `modeRules.ts` (level 1: registered, access,
  pinned ids, the wiring probes, the maps that host it) and the fit and perf gate checks; `modeCheckSupport.ts` holds
  their context (`gameModeContext`), the places a mode answers in (`GAME_PROBES`, `COMPILED_PLACES`) and wording.
  `modePlay.ts` plays a short headless match of any mode (a switch over `MatchMode`), `modePlayChecks.ts` judges it
  (every pairing plays; the bots play it their own way) and `modePay.ts` prices a round mode's XP a minute.
- **Skins (CT4).** `skinChecks.ts` (`checkSkin`, `checkSkinList`: levels 1 to 3's fast checks over any skin, every
  check re-exported for its fault test) gathers `skinRules.ts` (level 1), `skinFit.ts` (level 2: drawn, the orange
  tip, Realistic colours, the kit's numbers, and `skin.looksOnly` over the play modules' imports), `skinSpec.ts` (the
  team colours, the texture budget) and `skinMaps.ts` (against a map's measured colours). `skinDraw.ts` draws a
  replica's viewmodel and measures the bot figure's visible colours by ray; `colour.ts` is CIEDE2000;
  `skinCheckSupport.ts` holds their context (`gameSkinContext`) and wording.
- **Runners.** `report/skin.report.ts` and `report/skinMaps.report.ts` (a skin's levels 1 to 3, every skin side by
  side, the pictures; its map colours judged; `report/playImports.ts` reads the play modules' imports),
  `report/mode.report.ts` (a mode's levels 1 to 3, every mode side by side, the places, and the plans for
  the browser match, perf runs and balance run), `report/map.report.ts` (a map's levels 1 to 3, every map's layout, the pictures, the perf runs and the
  balance plan), `report/mapBalance.report.ts` (its balance run, watched by `report/matchWatch.ts`),
  `report/item.report.ts` (levels 1 to 3, the pictures to draw and the balance plan) and
  `report/balance.report.ts` (level 4, headless bot matches through `ai/depotMatchSupport.ts` `playMatch`, and whole
  Extraction runs through `ai/extractionRunSupport.ts` `playRun`). They run
  only in vitest's `content` project, which exists when `AIRSOFT_CONTENT` is set; `pipeline/content-check.mjs` sets it.
  `report/reportSupport.ts` reads the environment and the replica model files.
- **Tuning.** `config/contentRules.ts`: the normal ranges, budgets, the balance band and the registers of exceptions,
  allowed-stronger items and public items.
- **Tests.** `content.test.ts` (every shipped asset passes levels 1 and 2; each check fails on its fault),
  `mapChecks.test.ts` (every map passes levels 1 to 3's fast checks; each fails on its fault), `modeChecks.test.ts`
  (the same for every mode), `skinChecks.test.ts` and `colour.test.ts` (every skin; CIEDE2000), `report/matchWatch.test.ts`,
  `specSheet.test.ts` (the spec sheet, census and verdicts). `pipeline/contentReport.test.mjs` tests the report.
- **Rules.** The checks are pure over their inputs and never change the game. A new check gets a fault test. A new
  content type's checks get their own file here and a rulebook in `docs/content/`.
