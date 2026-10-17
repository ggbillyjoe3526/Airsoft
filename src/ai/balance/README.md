# src/ai/balance

Test-only: the bot balance figures, reported and never asserted, since noise across seeds made pass/fail bands cost
re-measure loops. Each `*.balance.ts` plays headless bot matches or Extraction runs over many seeds and hands its
figures to the balance report; nothing here asserts or ships. Vitest project `balance`, which exists only when
`AIRSOFT_BALANCE` is set: `node pipeline/balance.mjs [filter]` (`npm run balance`) sets it and writes
`pipeline/out/balance-report.md`, each figure judged against its band and standard error (`pipeline/balanceReport.mjs`).
The gate, CI and `vitest run` never run these files.

- `balanceSupport.ts`: a figure (`BalanceMeasure`: label, value, the count it is a share of, band, unit), `reportMeasure`
  (into the test's `task.meta`, which vitest's JSON report carries), `reportTally` (a match tally's side or end share and
  its rounds on time), the bands (`PRO_BAND`, `LEVELS_BAND`, `ON_TIME_BAND`).
- `extractionBalance.ts`: `describeExtractionBalance`, every map's Extraction figures at each level (get-out rate, XP a
  minute, the levels' order).
- `extractionBands.ts`: each map's Extraction bands, seeds and levels' order (`EXTRACTION_BALANCE`), shared by the
  `*Extraction.balance.ts` files and the content toolkit's mode and map balance run (CT3).
- Figures: Depot's ends, flag, difficulty, custom 1v1 and 2v2, ricochets and Pro (`depot*.balance.ts`); Woodland's Pro
  and below-Pro levels (`woodland*.balance.ts`); Neon Heights by Day and Night at Normal and Pro, and the east's first
  hits (`neonHeights*.balance.ts`); Extraction on each map (`*Extraction.balance.ts`); a bot's first hit up close, in duels at 5 and 10 m and in
  Depot matches (`closeRange.balance.ts`, G11); what the bots' kits are worth against the factory loadout at Easy,
  Normal and Hard (`botKits.balance.ts`, BG1); adaptive difficulty's in-between levels and its rating following a
  stronger or weaker side in Depot matches (`adaptive.balance.ts`, AD1). Each file's comments keep the
  measures since the figure was first a guard.
- The pass/fail half of each, what must never happen, is the `slow` guards in `src/ai` (`depotMatchSupport.ts` ›
  `expectRoundsPlayed`, `expectCustomMatchesPlayable`, `expectRicochetsPlayable`; `extractionRunSupport.ts` ›
  `expectRunsEndByRules`). They reuse the same tallies (`tallyBalance`, `tallyCustomMatches`, `tallyRicochetMatches`).
