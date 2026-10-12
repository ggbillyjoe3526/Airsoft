# IM1 · The main game file under its size limit (improvement 4, the owner's OK 2026-10-12)

**Review:** 2 attempts · 8/8 · Accept (Sonnet)

## Attempts

| Date | Attempt | Worker model | build | tests | smoke | perf | scope | changelog | Critic | Retry reason | Wall time | Worker tokens |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 2026-10-12 | 1 | Opus 5.5 (build thread) | ✓ 32 s | ✗ 406 s | ✓ 748 s | ✓ 1641 s | ✓ | ✗ | – | QA's new test left a spy on the fake setTimeout, hanging the next file's timers; the changelog lines not yet written | ~1 h 20 min | QA 22k |
| 2026-10-12 | 2 | Opus 5.5 (build thread) | ✓ 34 s | ✓ 418 s | ✓ 770 s | ✓ 1621 s | ✓ | ✓ | 8/8 Accept (Sonnet) | – | ~50 min | changelog 29k, critic 46k |

Main's start-up code was 990 kB against the 1,000 kB budget: the game chunk 964 kB and, since BF1's figures, 26 kB the
bundler had split into two chunks beside it. With IM1 it is 897 kB, all of it in the `game` chunk; the page's entry is a
0.7 kB stub. The Loadout, Armory and Settings chunk is 72 kB and the range's 25 kB. In a release build in the container
the title was up at 1.2 s and both chunks had arrived by 1.9 s; Settings then opened within 50 ms (Playwright's round
trips included). Merged main (BF1 #193, #194, #195) before attempt 2's gate, and IM6, IM2 and IM7 (#196 to #198)
after the critic: with IM7's reports the game chunk is 910 kB (73 %).

## Decisions

- **Menus stay smooth; what a menu opens is fetched on first use** (owner, 2026-10-12; `docs/DECISIONS.md` ›
  Performance budgets and technical foundations). A new screen reached only from a menu joins
  `ui/menus/lazyScreens.ts`; the title, the Match screen, pause, the summary and the result stay in the start-up code.
- **The game chunk's budget is 1,250 kB** (owner, 2026-10-12; DECISIONS, the chunk budget line), so the start-up code
  sits at 72 %, warning from 1,125 kB.
- **All start-up code is one chunk, the `game` group** (`vite.config.ts`, rolldown's `$initial` tag). Without it the
  bundler moved the modules the new on-demand chunks share with start-up into small chunks of their own (60, 31, 1 and
  0.5 kB here; BF1 had already split off 26 kB), so the budget no longer counted all that start-up runs.
- **One chunk for the three screens, one for the range.** The screens are preloaded together once the title is up, so
  splitting them further would only add requests; the range stays apart, as it belongs to the game, not the menus.
- **Preload once the page is idle, or 2 s after the title at the latest** (`LOADING.preloadWithinMs`), so it never
  competes with start-up and is in place well before a player's first click.
- **A screen opened before its code arrives keeps the one on show** (a progress cursor over the menus, `aria-busy`), and
  any later choice (another screen, Back, Play) cancels it, so input is never lost; a failed download says so by the play
  buttons and the next open fetches again. Entering the range waits for its code with the mouse lock.
- **`fcText` was the top bar's `MENU_TEXT.fc`**: the summary, run status and records now use that, so nothing outside
  the Armory imports it.

## Known issues left

None. The menus' wait-and-cancel path (`Menus.whenFetched`) and the range's failed-download path have no unit test of
their own (the critic's note): `Menus` has no unit harness, and the browser tests open every one of those screens and the
range.
