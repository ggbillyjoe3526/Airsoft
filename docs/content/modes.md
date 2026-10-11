# Game modes

The rulebook and brief for a new mode or field rule set, and the checks a mode gets (toolkit part 3). The steps are in
`docs/content/README.md`.

## Rules

Must:

- **Says what it needs.** Which maps can host it and what it needs from them (a flag spot, cases and exits, capture
  points).
- **Bots understand it.** A mode the bots play as Elimination is not finished.
- **Wired everywhere.** The round rules, the bots' plan, the briefing, the round banner, the end screen, pay, records,
  the menus and the performance run each have an answer for it.
- **A fixed id, dev first.** Its id never changes once given (saved picks and records use it). Tagged `dev` until the
  owner makes it public.
- **Fair sides.** Each side wins 40 to 60 % on every map it lists; the objective decides some rounds; pay per minute
  in line with the other modes.

A field rule set (Tournament, Pro CQB, later Skirmish, CQB, Speedsoft, Milsim) is not a mode: it is one data entry in
`src/config/matchRules.ts`, with the rules and a short balance run.

## Brief

The questions Claude asks, with the default in brackets:

1. **How a round is won.** (By the objective, or by eliminating the other team.)
2. **What each team does.** (One attacks, one defends.)
3. **Which maps.** (Every public map that has what it needs.)
4. **Team sizes.** (Each map's own.)
5. **How bots play each side.**
6. **How it pays.** (In line with Elimination per minute.)
7. **Anything new on screen.** (The banner, briefing and end screen in the existing style.)

## Checks

Every mode in `MATCH_MODES` (`src/config/modes.ts`) gets levels 1 and 2's fast checks in every test run
(`src/content/modeChecks.test.ts`), and each mode's short match in the browser runs in the smoke test
(`e2e/modeMatch.spec.ts`). `node pipeline/content-check.mjs mode:<id>` runs levels 1 to 3 for one mode, with
`--balance` level 4; `mode:all` runs levels 1 and 2 for every mode. A mode's numbers are in `src/config/contentRules.ts`
(`MODE_PLAY_TEST`, `MODE_BALANCE_BANDS`, `MODE_PERF_STAND_INS`, `PUBLIC_MODES`, `SHIPPED_MODE_IDS`).

| Level | What is checked |
|---|---|
| Rules | Registered with a name and blurb, no brand, a one-word camel-case id used by no other mode, and an entry in `MODE_SHAPES` (rounds or one run; what it needs from a map) and `MODE_FIT`; `dev`, or `public` and in `PUBLIC_MODES`; its id pinned in `SHIPPED_MODE_IDS` once public, and no pinned id ever gone. Wiring: the briefing, the round banner, the pause line, the end screen and the perf run's script each answer for it, the briefing and banner in its own words (the same words as Elimination fail: it is Elimination by another name); every other place answers at compile time (each is a `switch` with the never-check, so a new mode does not build until it answers) or by its id (pay, records, the Mode button). At least one map has what it needs (a public one for a public mode). |
| Fit | Every ruleset it offers exists, the default among them; every match row it hides exists. Then on every map that hosts it, 40 s of each pairing plays headless: the standard match, each other ruleset, each other level, each other team size the map offers, each other Rounds to win, and Custom with each switch flipped and 90 s rounds. Each starts with the teams it should, nobody falls through or is lost, nothing stops it. And the bots play it their own way: from the same start, in 30 s they stand at least 1 m on average from where they stand in Elimination. |
| Spec test | A short match in the browser (`e2e/modeMatch.spec.ts`): it starts, a round ends both ways, the end screen shows, nothing errors. The perf gate measures it, or a mode it is drawn like stands in with a reason (`MODE_PERF_STAND_INS`; Attack / Defend is Elimination with a flagpole); on demand, the perf run on each map that hosts it on the budget preset. |
| Balance run | On demand, the map balance run in this mode on every map that hosts it, each lighting and every level (`docs/content/maps.md` › Checks). A mode in rounds: each end 40 to 60 % at Pro (35 to 65 % below), under 1 round in 10 on time, the objective decides at least 1 decided round in 10, and Field Credits a minute in the standard match within × 0.75 to × 1.25 of Elimination's on the same map, lighting and level. A run (Extraction): the runs the squad gets out of and what it gets out with, against each map's bands (`src/ai/balance/extractionBands.ts`), under 1 run in 10 on time, and each harder level harder to get out from. Judged on a public map, mode and level; shown as figures otherwise. |

A new mode adds its case at each place that fails to compile, its words in the briefing and banner, a short match in
`e2e/modeMatch.spec.ts` (`playFor`), its matches in `src/content/modePlay.ts` and, played as runs, its bands.
