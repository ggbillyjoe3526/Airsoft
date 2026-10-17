# IN1 · Mouse lock and Firefox

**Review:** 2 attempts · 8/8 · Accept (Opus; the follow-up, PR #262, Sonnet)

## Attempts

| Date | Attempt | Worker model | build | tests | smoke | perf | scope | changelog | Critic | Retry reason | Wall time | Worker tokens |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 2026-10-17 | 1 | Opus 5.5 (build thread) | ✓ 16 s | ✓ 468 s | ✓ 1066 s | ✓ 2432 s | ✓ | ✓ | 8/8 Accept (Opus) | – | ~2 h 30 min (the perf matrix ~41 min) | QA 55k, performance 25k, critic 74k, changelog 25k |
| 2026-10-17 | 1 (follow-up, PR #262) | Opus 5.5 (build thread) | ✓ 32 s | ✓ 198 s | ✓ on CI (Firefox 223 s) | – not required | ✓ | ✓ | 8/8 Accept (Sonnet) | – | ~1 h 45 min (two CI diagnostic runs) | QA 16k, performance 14k, critic 17k |

## Decisions

- **Browser behaviour was measured, not assumed.** Firefox 136 and Chromium 140 ran headed under xvfb with Playwright 1.50 in the container: Firefox returns no promise from `requestPointerLock`, drops the lock as fullscreen changes and refuses it back until `fullscreenchange`, and gives function keys and Esc no user activation; Chromium keeps the lock across fullscreen. Synthetic Esc exits the lock in neither, so the real Esc flow stays a playtest item.
- **A refused lock on the pause menu makes the whole screen the click target.** Off its buttons, any click resumes (or, after F10 in Firefox, goes fullscreen and resumes); the buttons keep their own action.
- **Firefox's F10 with no recent click asks for one click instead of doing nothing.** Firefox refuses fullscreen from a function key; a click is the only gesture it accepts.
- **While Firefox changes fullscreen, play holds without the pause menu** for up to `FULLSCREEN_RELOCK_MS`, then pauses if the lock hasn't come back, so a hold can't stick.
- **The Firefox CI job runs headed under xvfb-run through the gate's smoke step** (`E2E_FIREFOX=1`), about four minutes; boot.spec skips its download-once check in Firefox, which reports a revalidated (304) response with the full body's transfer size.
- **Firefox's actions and waits time out after 30 s each.** The save spec's first test hung once on CI's `firefox` job (it had passed there before, on unchanged game code) and the gate could name only the test's line; the container can't fetch CI's artifacts or run Playwright's own Firefox, so a repeat now names the step that hung.
- **Firefox's e2e run uses one worker.** The save spec's Display tab click timed out on CI now and then (main, DX4, PF3). Run alone, ten repeats passed; run in two workers, the window without focus drew about one frame a second (`requestAnimationFrame` gaps of 1.0 to 1.4 s), and Playwright's click waits for steady frames. With one worker the whole Firefox job passed in 223 s, as fast as before (follow-up PR #262).
- **The task's touches grew** to the menus, their options and CSS, `config/menus.ts`, `config/controls.ts`, `game.ts`, `pipeline/workflow.test.mjs` and `pipeline/README.md`, which the click state, the fullscreen hold and the CI job needed.

## Known issues left

- In Firefox the Fullscreen key asks for a click unless you clicked or fired in the last few seconds (KNOWN_ISSUES › Save and browsers, document).
- Firefox gives no raw mouse input (KNOWN_ISSUES › Save and browsers, document).
- Only the boot and save specs run in Firefox (KNOWN_ISSUES › Save and browsers, document).
