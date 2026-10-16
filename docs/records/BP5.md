# BP5 · Full bug pass (Dev 6)

**Review:** 2 attempts · 7/8 · Accept (Opus)

## Attempts

| Date | Attempt | Worker model | build | tests | smoke | perf | scope | changelog | Critic | Retry reason | Wall time | Worker tokens |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 2026-10-16 | 1 | Opus 5.5 (build thread) | ✓ 33 s | ✓ 703 s | ✗ 1147 s (Settings → Save downloads the save and loads it back, with…) | ✓ 1960 s | ✓ | ✓ | – gate failed | The save smoke test pinned the summary's old count | ~3 h 30 min (with the browser runs and balance) | QA 35k, changelog 27k |
| 2026-10-16 | 2 | Opus 5.5 (build thread) | – unchanged since attempt 1 | – unchanged since attempt 1 | ✓ 1179 s | – unchanged since attempt 1 | – unchanged since attempt 1 | – unchanged since attempt 1 | 7/8 Accept (Opus) | – | ~40 min | critic 157k |

## Decisions

- **Played in the browser by a scripted player on every map, light, mode and difficulty (16 runs, Practice and the
  Tutorial included), with every Dev 6 action on the keys.** Chromium with software graphics; each run checked the
  clock, falls and NaN every 2 s, forced an overtime flag in timed Elimination and quit and played again. All clean;
  the approved pictures are in the project files (`concepts/bp5-dev6-bug-pass-2026-10-16/`).
- **A vault keeps what you press during it, and a trigger held through it is the same pull.** A semi-auto pull held
  over a wall fired a second BB and a trigger held holstered drew on landing; presses made mid-vault were lost
  (also in DECISIONS).
- **An anchor sent hunting hunts, and still means no sidestep.** It stood where an ended order left it until its
  mark, and aimed down sights while strafing in an open fight (also in DECISIONS).
- **A timed challenge run with a Dev setting that changes play (Game speed, Bottomless magazines) is never a best and
  says "not kept (Dev settings)".** Such a run set a best no fair run could beat; matches with them go into no records
  either (also in DECISIONS).
- **Markers moved off the minimap stack a step apart: 48 px down, 96 px across (`MINIMAP.pinStep`), from the panel's
  foot afresh each frame.** A label's height or width plus a gap; a flag and a ping pinned past the panel in one frame
  sat on one spot.
- **The Neon Heights Plaza landing starts where its stair ends (x −6, was −6.6).** The slab overhung the stair's top by
  0.6 m: walking up met its edge overhead, running down dropped for 0.4 s, and the nav had no link. The map's art,
  nav and dressing fingerprints are re-pinned and its stated dressing cost is 9 630 triangles (was 9 654).
- **Pro Woodland Attack / Defend is not tuned: 56.0 % attackers over seeds 1–32 (139 of 248), in the 40–60 % band.**
  Seeds 1–16 lean most; the owner's Woodland playtest decides. Normal is unchanged.
- **Balance on the branch, all 105 figures: 0 outside their band, 3 outside within noise, 5 near an edge (main the
  same counts).** Hard's 5 m duel (15.8 %, as on main) is the owner's call and unchanged; Depot Normal Attack / Defend
  with ricochets read 65.5 % (main 62.4 %) on its 16 seeds, and 57.6 % on seeds 17–48 (main 61.4 %), so noise;
  Woodland Normal Attack / Defend moved from 67.8 % to 51.7 % (in band).
- **The save summary counts what the game holds on load: every level's items up to the player's, plus the saved
  list.** A save from before the first XP said Items unlocked 0 though the game gives the starting kit; the save smoke
  test now reads the count from the game.
- **Attempt 2 re-ran only the browser tests.** Its one commit changed only `e2e/save.spec.ts`, so attempt 1's build,
  tests and perf stand; CI runs them again on the pull request.
- **Hard's close-range figure (19 % against 15 %) is not changed.** The owner's call.
- **The tutorial's aiming card names the optics on the Loadout rather than bringing the Optics card back.** One line
  keeps the tutorial's length; the card stays no longer than the longest other.

## Known issues left

- The session's first overtime flag, first tossed magazine and first 2x scope aim may each hitch once as their shaders
  compile (KNOWN_ISSUES › Graphics and performance, can wait).
- Edge markers in almost the same direction overlap on the screen's edge (KNOWN_ISSUES › Menus, HUD and input, can
  wait).
- Pro Woodland Attack / Defend at 56 % attackers (KNOWN_ISSUES › Pro bots and the "what got you" card, playtest).
- Kept from BP4 with why: a holstered rigged figure that vaults keeps its right hand closed, and far rigged figures
  draw no parts (KNOWN_ISSUES › Figures and art, can wait).
- Kept from BP3 with why: the first frame on Medium and up builds the post stack's pipelines and the shadow shaders
  (KNOWN_ISSUES › Graphics and performance, can wait).
