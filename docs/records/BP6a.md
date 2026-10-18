# BP6a · Beta 1 bug pass, part 1: gunplay, movement, hit calling, replicas and the HUD

**Review:** 2 attempts · 8/8 · Accept (Opus)

## Attempts

| Date | Attempt | Worker model | build | tests | smoke | perf | scope | changelog | Critic | Retry reason | Wall time | Worker tokens |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 2026-10-18 | 1 | Opus 5.5 (build thread) | ✓ 18 s | ✓ 570 s | ✓ 1444 s | ✓ 3156 s | ✓ | – records step | 7/8 Retry (Opus) | AC2: the click line's fix (CSS only) had no test | ~5 h (with the browser play) | QA 33k, performance 29k, critic (Opus) 55k |
| 2026-10-18 | 2 | Opus 5.5 (build thread) | ✓ 8 s | ✓ 134 s | – tests and docs only since attempt 1 | – tests and docs only since attempt 1 | ✓ | ✓ | 8/8 Accept (Opus) | – | ~20 min | critic (Opus) 22k, changelog 24k |

## Decisions

- **Played by a scripted player in the browser (e2e build, Chromium in software), state and HUD read from the page.**
  Depot Elimination and Attack / Defend, Low and Medium, 1280 × 720 and 960 × 540, HUD 100 / 120 / 150 %. Feel, sound
  and frame rate are the owner's; the results, item by item, are in the project's shared files
  (`bugpass/BP1-results.md`).
- **The round banner waits while WON, LOST or DRAW is up (`HUD.roundResultTime`), then shows over the table.** At
  1280 × 720 the stamp sat on the banner; the stamp is the news for its 2 s.
- **Round 1's start whistle is owed until the held shader warm-up settles, and the view holds the spawn's meanwhile.**
  The round only starts then (PF1); a mouse moved during the wait turned the player before the first tick.
- **Hop-up taps count every press in a frame (`pressCount`), as the fire selector does since KI1.**
- **An edge marker moved along the left or top edge never goes back above the minimap's foot or left of its side
  (`Minimap.pinFloor`).**
- **Three browser tests wait longer, none checks less.** The banner now comes after the 2 s stamp (20 s in the mode
  tests); the HUD overflow test waits past round 1's first frame, about 8 s in software drawing at 2560 × 1440 on main
  too; the reduced-motion check waits for the frame that hides the dust motes.
- **A held warm-up that rejects leaves the whistle owed.** The round never starts then either (MatchSession's `warm`).

## Known issues left

- A long notice in the compact replica panel wraps to 3 to 6 lines (KNOWN_ISSUES › Menus, HUD and input, can wait).
- The bottom-left feed overlaps the Spectating line at 1280 × 720, HUD 150 %, while out (KNOWN_ISSUES › Menus, HUD and input, can wait).
- The pointer lock's `lockOnce` could wait for ever on the event-only path (KNOWN_ISSUES › Menus, HUD and input, can wait).
- `stepVaultReady` casts its rays for bots too (KNOWN_ISSUES › Movement and shooting, can wait).
