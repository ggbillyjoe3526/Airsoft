# DX5 · App root: one preferences object and one session interface (audit A1 step one, A2, B7)

**Review:** 1 attempt · 0/8 · Escalated (pending) · placeholder: critic not run yet, the thread rewrites this line

## Attempts

| Date | Attempt | Worker model | build | tests | smoke | perf | scope | changelog | Critic | Retry reason | Wall time | Worker tokens |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 2026-10-17 | 1 | Opus 5.5 (worker) | ✓ 18 s | ✓ 997 s (both projects; 1 load timeout, passes alone) | – CI | – pending | – | – | pending | – | – | – |

## Decisions

- **`HudPrefs` is plain data with a version counter** (`src/settings/hudPrefs.ts`). `setHudPref` bumps `version`;
  each session's `syncPrefs()` shows the preferences when the version moved, as play runs again and first thing in
  `draw()`. No listeners to unhook on dispose, and a preference changed on the pause menu shows on resume as before.
- **The system's reduce-motion setting is a field of `HudPrefs`** (`systemReducedMotion`), kept current by
  `ui/hudLook.ts`, so `motionReduced(prefs)` answers for the menus, both sessions and the presentations alike.
- **`Session.kind` (`'match' | 'range'`) tells the sessions apart** instead of `instanceof`: a discriminated union
  narrows where only one has the answer (a match's skip and result, the range's tutorial), and `game.ts` has none left.
- **The report and debug-overlay glue moved to `src/gameReport.ts`**, reading the game through `GameReadout`; it was
  needed to bring `game.ts` under 1,300 lines. This overlaps DX8's "dev glue": DX8 starts from it, not from game.ts.
- **New game's picks are one `NewGamePicks` object (`loadNewGamePicks`) and the controls are read onto
  `PlayerInput` by `loadControls`**; Menus reads and writes both by reference, so `game.ts` lost its picks fields and
  their forwarders. Same keys and the same fallbacks.
- **The HUD's CSS look moved to `src/ui/hudLook.ts`** (the CSS variables, the motion classes, resize and the system
  setting), out of `game.ts`.
- **IN1's Fullscreen-key handling moved to `src/ui/fullscreenPlay.ts` (`FullscreenPlay`) at the merge with main.**
  IN1 brought `game.ts` back to 1,349 lines; the key's time, the hold for the lock and the pause menu's click moved as
  they were, so `game.ts` stays under 1,300 (1,293). Outside the block's touches, which had left TASKS.md by then.
- **A result due now calls `stopPlay()`**, which did the same steps inline; one path, no behaviour change.
- **`loadChoice` moved from `ui/optionPicker.ts` to `settings/storage.ts`** and `hexColour` to `settings/hudPrefs.ts`:
  loaders live under `settings/` (acceptance 3); the UI files keep what draws.
- **`whatGotYou.test.ts`'s session block was rewritten** against a `MatchPresentation` stub: the session no longer has
  `setWhatGotYouMode`. The rule it checks (the what-got-you card follows the mode and the opponents' level) is kept,
  plus a source pin on `usePrefs`. `gameSettleMatch.test.ts`'s source pin reads `s.kind === 'match'`.
- **Two e2e helpers reach the new fields** (`e2e/uiOverflow.spec.ts`, `e2e/webgpuWorldHarness.ts`): they set
  `game.prefs` and call `game.hudLook.show()` in place of the removed private fields; what they check is unchanged.

## Known issues left

- None. Under heavy load (other worktrees' gates) a few tests hit vitest's 5 s timeout and pass alone; test speed is
  DX4's.
