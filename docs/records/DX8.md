# DX8 · Game: the play flow and the dev glue out of the composition root (audit A1 step two)

**Review:** 1 attempt · 8/8 · Accept (Opus)

## Attempts

| Date | Attempt | Worker model | build | tests | smoke | perf | scope | changelog | Critic | Retry reason | Wall time | Worker tokens |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 2026-10-17 | 1 | Opus 5.5 (worker) | ✓ 21 s | ✓ 142 s (fast; guards on CI) | – CI | ✓ 3057 s | ✓ | ✓ | 8/8 Accept (Opus) | – | ~6 h | QA 40k · performance 21k · critic 54k |

## Decisions

- **Four modules rather than one `PlayFlow`.** `playFlow.ts` (`PlayFlow`: play, enter, resume, pause, stop, leave, the
  round skipped without the mouse, the lost graphics context, the range's pause-menu buttons) would have been about 900
  lines with what it reads. So: `playSetup.ts` (`PlaySetup`: what the next Play builds from, New game's picks as played,
  Practice's place, Day or Night, Look, the Loadout and the progress, and the changed flags), `playResults.ts`
  (`PlayResults`: settling a decided match, its result summary, the range's challenge best) and `gameDev.ts` (`GameDev`).
  That is what brings `game.ts` to 556 lines and 46 imported modules (552 after merging DX5, DX6 and main).
- **The Dev glue is `gameDev.ts`, not more of `gameReport.ts`.** The Dev settings in force, the Retro look, the Dev
  tab's buttons and its menu options are a different concern from reading the game for reports; the report glue left
  in `game.ts` (`diagnostics()`) moved to `gameReport.ts` (`diagnosticsText`).
- **The flow gets its parts by constructor (`PlayParts`) and Game wires the page's events to it** (mousedown, keydown,
  the lock, fullscreen, the context, the audio block). The flow touches no DOM itself (only `document`'s focus, as
  before), so `playFlow.test.ts` plays it on stand-in parts and sessions.
- **Three hooks back to Game** (`crashed`, `built`, `resumed`): the crash pane and the automatic quality step-down stay
  in Game with the loop, as acceptance 1 and 3 ask.
- **The menus' play buttons come from `playMenus(() => this.flow)`**: the flow is built after the menus (it shows them),
  so each button reads it when pressed. Each module hands its own slice of the menus' options (`setup.menuOptions()`,
  `dev.menuOptions()`); `Menus` itself is unchanged.
- **`Game.session` is a getter on the flow's session**, as `Game.state` is: the browser tests and the pipeline's
  scripts read `airsoft.session` in about 30 places. The few other reaches moved with their fields:
  `e2e/boot.spec.ts` reads `airsoft.flow.escSkipAt`, `e2e/save.spec.ts` `airsoft.setup.progress`,
  `pipeline/perf-run.mjs` `airsoft.setup.playedPicks()`, `pipeline/webgpu-compare.mjs` `airsoft.dev.inForce`, and
  `pipeline/content-pictures.mjs` `airsoft.setup.loadout`.
- **`gameSettleMatch.test.ts` became `playResults.test.ts`**, against a real `PlayResults` on a stand-in session; its
  source pin now finds the settle after `advance` in `game.ts` and before the result screen in `playFlow.ts`.
  `sessionPaint.test.ts`'s Look pin reads `playSetup.ts` and `playFlow.ts`.
- **Dispose order:** the range code's preload is cancelled and the prompt, notice and session disposed in
  `flow.dispose()`, where the session was disposed before; each is independent of what moved past it.
- **RV1's and RV2's touches** name the files their code moved to (`playSetup.ts` and `playFlow.ts` for supply events,
  `gameDev.ts` for the Dev tab).
- **Merging DX5, DX6 and main:** IN1's `ui/fullscreenPlay.ts` is the play flow's (`flow.fullscreen`: its "in a match"
  reads the flow's started flag), with the Fullscreen-click button in `playMenus`; RV2's tone mapping is set and changed
  by `GameDev`; RV1's supply event and DX5's dropped replica pictures leave `playSetup.ts` and `playFlow.ts`; render
  imports take DX6's subfolders.

## Known issues left

- Under heavy load a few tests hit their timeouts and pass alone (`audio/citySound.test.ts` this run); test speed is
  DX4's.
- Critic note: `Game.crash` sets `flow.unlockedPlay` directly and `escSkip`/`escSkipAt` are public on the flow; a
  `flow.crashed()` method would keep that state inside `playFlow.ts` (602 lines, near the top for a small module).
