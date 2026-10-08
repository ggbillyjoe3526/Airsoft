# src/stats

Match numbers, local records and the settling of a finished match. It reads the simulation and never writes it.

- `matchStats.ts`: every player's numbers for the match and the round (hits on opponents, times hit, friendly hits, BBs
  fired, time in play while live), updated from each tick's events by `MatchSession`.
- `records.ts`: local records in the browser (`airsoft.records`): wins and losses per difficulty and mode, best
  accuracy, longest win streak. An Extraction run counts as a run and an extraction, with its own bests (best haul,
  extractions in a row, fastest extraction with a find). Records only, never levels or unlocks.
- `settleMatch.ts`: pure; records and pays a decided match once (`MatchTakes`). A match that used Dev content is not
  counted and pays nothing (`matchStanding`).
- Shown by `ui/statsRows.ts`, `ui/statsTable.ts`, `ui/matchBoard.ts` and `ui/recordsView.ts`.
- Tuning: `config/matchInfo.ts`. Tests: `matchStats.test.ts`, `records.test.ts`, `settleMatch.test.ts`.
- Rules: records are a save store: a version bump needs `SAVE_FORMAT`, `STORES_BY_FORMAT` and a `MIGRATIONS` step
  (`src/save/`). A named ruleset's standard match files its records under `<difficulty>.<mode>.<ruleset>`; custom rules
  pay at most ×1.5 (`CUSTOM_RULES_PAY_CAP` in `config/matchRules.ts`).
