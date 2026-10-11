# src/content

The content checks (the content toolkit): what makes a new replica or part fit to ship, in four levels. The rulebooks
they enforce are in `docs/content/`; the command that runs them and writes the report is `pipeline/content-check.mjs`.

- **Inputs.** `contentInputs.ts` names everything a check reads (`ContentInputs`: the pool, `stats.md`, the replica
  configs, the model tables, the sound cues, the code keys, a part's effects), so a test can hand in a fault.
  `gameContent.ts` builds the game's own (`gameInputs`) and runs levels 1 and 2 (`checkAsset`, `checkAllAssets`).
- **Results.** `checks.ts`: a `CheckResult` is a level, a check name (`replica.model`), the item, a verdict (pass,
  warn, fail, info) and what was found in plain words.
- **Levels 1 and 2.** `assetRules.ts` (name, brands, access), `replicaChecks.ts`, `partChecks.ts`, and `kitGrid.ts`
  (every kit of parts a replica can wear, at its commonest and rarest tier, memoised per pool).
- **Level 3.** `specSheet.ts` (the chrono and range table, from the game's own BB flight), `census.ts` (model cost
  and shot sound), `specChecks.ts` (their verdicts), `kits.ts` (a replica as it comes, and as carried).
- **Runners.** `report/item.report.ts` (levels 1 to 3, the pictures to draw and the balance plan) and
  `report/balance.report.ts` (level 4, headless bot matches through `ai/depotMatchSupport.ts` `playMatch`). They run
  only in vitest's `content` project, which exists when `AIRSOFT_CONTENT` is set; `pipeline/content-check.mjs` sets it.
  `report/reportSupport.ts` reads the environment and the replica model files.
- **Tuning.** `config/contentRules.ts`: the normal ranges, budgets, the balance band and the registers of exceptions,
  allowed-stronger items and public items.
- **Tests.** `content.test.ts` (every shipped asset passes levels 1 and 2; each check fails on its fault),
  `specSheet.test.ts` (the spec sheet, census and verdicts). `pipeline/contentReport.test.mjs` tests the report.
- **Rules.** The checks are pure over their inputs and never change the game. A new check gets a fault test. A new
  content type's checks get their own file here and a rulebook in `docs/content/`.
