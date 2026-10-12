# BP3a · Bug pass 3: the HUD and the menus

**Review:** 2 attempts · 8/8 · Accept (Opus)

## Attempts

| Date | Attempt | Worker model | build | tests | smoke | perf | scope | changelog | Critic | Retry reason | Wall time | Worker tokens |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 2026-10-12 | 1 | Opus 5.5 (build thread) | ✓ 29 s | ✓ 384 s | ✓ 815 s | ✓ 1283 s | ✓ | ✓ | 7/8 Retry (Opus) | AC3: two deleted rows had no test or browser check named | ~2 h | QA 114k, changelog 27k, critic (Opus) 73k |
| 2026-10-12 | 2 | Opus 5.5 (build thread) | – same tree as attempt 1 | – same tree as attempt 1 | – same tree as attempt 1 | – same tree as attempt 1 | ✓ | ✓ | 8/8 Accept (Opus) | – | ~20 min | critic (Opus) 24k |

## Decisions

- **Two browser checks stand for the two deleted rows with no test (attempt 2).** On the e2e build at 1280 × 720,
  Depot Elimination, `pipeline/runs/BP3a/attempt-2/bp3a-checks.mjs` in the project's shared files: (1) Team colours
  set to High Contrast from the pause menu's Settings mid-match leave the HUD on the standard set (`--team-0`
  `#3d8bff`), and after Quit the Your team swatches read `rgb(140, 207, 255)` and `rgb(224, 96, 26)` (before the
  match: `rgb(61, 139, 255)` and `rgb(255, 138, 42)`); (2) during a reload, the caret under the next spare magazine
  runs 653.8–658.8 px and the reload bar starts at 660.8 px, 2 px clear in all 12 samples (the gap scales with the
  HUD, as both sit in the same panel).
- **The round message waits while you call a hit.** HIT! shows alone; the result and countdown follow, and the
  message's gap under the stamp scales with the HUD.
- **The Tab board scales down to fit the window (never below 0.6) and goes compact before that.** Its rows stay
  readable at 5v5 and in Extraction at 1280 × 720.
- **Start match and Continue stick to their panel's foot, over a strip of the panel's colour.** At 1280 × 720 both
  panels are taller than the window.
- **The hit feed keeps clear of the score bar as it is, not its widest form.** The bar publishes its half-width
  (`--sb-half`), so a plain line fits one row at 1280 and 1366 px.
- **The minimap caption grows to fit the map's name, up to 1.6 × the minimap.** Neon Heights by Night was cut.
- **Every two-way On / Off choice reads Off then On.** Owner's note on the menus. Robots (Mixed / Humans only), the
  crosshair (Dynamic / Static) and the minimap (Heard / Teammates only) are named choices, not On / Off, and keep
  their order.
- **Extraction's reserve pips show only once the reserve joins, and the summary leaves out a reserve that never
  played.** They counted as players waiting from the first second.
- **Team colours changed mid-match reach the menus when the match ends.** One call where the session is unloaded.
- **The tutorial's pause menu focuses Resume, as every pause does.** The UI review's note was not a bug.
- **The teammate's name tag stays where it is during a hit call.** Lifting it over the raised hand puts it on the
  HIT! callout.

## Known issues left

- Two teammates standing close show their name tags over each other (KNOWN_ISSUES › Menus, HUD and input, can wait).
- At 1280 px with HUD size over about 120 %, the widest score bar can come within the minimap's gap (KNOWN_ISSUES ›
  Menus, HUD and input, can wait).
- At 1280 × 720 the held pistol's grip sits partly under the ammo panel (KNOWN_ISSUES › Menus, HUD and input, can
  wait).
- A long hit-feed line (friendly fire with a ricochet tag) still wraps to two rows (KNOWN_ISSUES › Menus, HUD and
  input, can wait).
- A teammate's name tag sits over their raised hand up close (KNOWN_ISSUES › Figures and art, can wait).
