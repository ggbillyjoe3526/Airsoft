# src/ai/balance

Test-only: the bot balance figures (token plan item 22). Each `*.balance.ts` plays headless bot matches or Extraction
runs over many seeds and hands its figures to the balance report; nothing here asserts or ships. Vitest project
`balance`, which exists only when `AIRSOFT_BALANCE` is set: `node pipeline/balance.mjs [filter]` (`npm run balance`)
sets it and writes `pipeline/out/balance-report.md`, each figure judged against its band and standard error
(`pipeline/balanceReport.mjs`). The gate, CI and `vitest run` never run these files.

- `balanceSupport.ts`: a figure (`BalanceMeasure`: label, value, the count it is a share of, band, unit), `reportMeasure`
  (into the test's `task.meta`, which vitest's JSON report carries), `reportTally` (a match tally's side or end share and
  its rounds on time), the bands (`PRO_BAND`, `LEVELS_BAND`, `ON_TIME_BAND`).
- `extractionBalance.ts`: `describeExtractionBalance`, every map's Extraction figures at each level (get-out rate, FC a
  minute, the levels' order).
- Figures: Depot's ends, flag, difficulty, custom 1v1 and 2v2, ricochets and Pro (`depot*.balance.ts`); Woodland's Pro
  and below-Pro levels (`woodland*.balance.ts`); Neon Heights by Day and Night at Normal and Pro, and the east's first
  hits (`neonHeights*.balance.ts`); Extraction on each map (`*Extraction.balance.ts`); a bot's first hit up close, in duels at 5 and 10 m and in
  Depot matches (`closeRange.balance.ts`, G11). Each file's comments keep the
  measures since the figure was first a guard.
- The pass/fail half of each, what must never happen, is the `slow` guards in `src/ai` (`depotMatchSupport.ts` ›
  `expectRoundsPlayed`, `expectCustomMatchesPlayable`, `expectRicochetsPlayable`; `extractionRunSupport.ts` ›
  `expectRunsEndByRules`). They reuse the same tallies (`tallyBalance`, `tallyCustomMatches`, `tallyRicochetMatches`).
