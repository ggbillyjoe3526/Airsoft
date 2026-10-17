# DX7 · Bots: the hub files split, two sources of truth closed (audit A8 part, B5, B6, B13)

**Review:** 1 attempt · 8/8 · Accept (Opus)

## Attempts

| Date | Attempt | Worker model | build | tests | smoke | perf | scope | changelog | Critic | Retry reason | Wall time | Worker tokens |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 2026-10-17 | 1 | Opus 5.5 (worker) | ✓ 21 s | ✓ 624 s (both) | – CI | ✓ 3279 s | ✓ (after the rebuild) | ✓ | 8/8 Accept (Opus) | – | ~3 h | QA · performance 22k · critic 54k |

## Decisions

- **Hearing is `ai/hearing.ts` (`hearEvent`), round planning `ai/roundPlanner.ts` (`RoundPlanner`).** The
  controller's `observe` keeps the round start, overtime, returned, case-opened and the "what got you" record, and hands
  every other event to `hearEvent`; the plan's spawn ends, lanes, `sendBack` and the plan stream moved with
  `RoundPlanner`. Pure moves: the same statements in the same order on the same random streams.
- **Attack / Defend's retaker and raiser picks went to `roundPlanner.ts` too.** Hearing and planning alone left
  `botController.ts` at about 650 lines; the picks are the round's flag jobs, so they sit with the plan (581 lines now).
  The hunt's sector memory and the route searches stay in the controller.
- **The hearing functions read `BotWorld` (`w.bots`, `w.query`, `w.nav`, `w.hits`, `w.body`), not the controller's
  options.** They are the same objects the options hold, so nothing changes, and the module needs no controller.
- **`config/bots.ts` keeps the difficulties, `BOT_BEHAVIOUR`'s assembly, `botConfig` and the small tables after it.**
  `BOT_BEHAVIOUR` spreads `BOT_SENSES`, `BOT_MOVEMENT`, `BOT_SQUAD`, `BOT_EXTRACTION` in the old key order and keeps
  `pathsPerTick` last; `bots.ts` re-exports `botsSkill.ts`. Checked value for value and key for key against the old file.
- **Pro's tuning block went whole into `botsSquad.ts`.** Its own comment asks for every Pro-only number in one place;
  `botsTuning.test.ts` now reads the four files in spread order to find it.
- **The data tables' problems are a Dev tab row of their own, "Data tables", just above Diagnostics.** It reads
  `config/dataTables.ts` (`DATA_TABLES`, gathered from the six loaders' `errors`), lists up to 20 lines and says how
  many more, and says all six read cleanly when they do. The loaders' console warnings are unchanged. The copied
  diagnostics report is unchanged: its recent warnings already keep them (`consoleLog.ts` taps the console first).
- **`build-cached.mjs` hashes all of `data/`, and `review.mjs` counts any `data/` file as code.** A new table there
  is a build input and needs the review line without anyone listing it.
- **B5: `config/statsDrift.test.ts` loads the replica and part configs with `stats.md` unread and fails on any number
  that differs.** No built-in changed (none had drifted). B13 needed nothing: `think` and `observe` already take
  `Readonly<GameState>`.

- **The branch was rebuilt on DX4 (owner, 2026-10-17, decision card).** The first gate failed scope: QA's data/
  reach test went into `pipeline/testReach.test.mjs`, which neither QA commits nor this block's touches allowed.
  `touches` now lists that file, the thread wrote its own version of the test, and the old branch `dx7-work` keeps
  the original commits.

## Known issues left

- None.
