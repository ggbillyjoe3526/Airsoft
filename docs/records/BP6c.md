# BP6c · Beta 1 bug pass: menus, settings and browser

**Review:** 1 attempt · 8/8 · Accept (Opus)

## Attempts

| Date | Attempt | Worker model | build | tests | smoke | perf | scope | changelog | Critic | Retry reason | Wall time | Worker tokens |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 2026-10-18 | 1 | Opus 5.5 (build thread) | ✓ 18 s | ✓ 113 s (fast) | ✓ 1157 s | ✓ 2977 s | ✓ | ✓ (changelog agent after the critic) | 8/8 Accept (Opus) | – | ~6 h | QA 25k, performance 20k, critic 32k |

## Decisions

- **The results, one line per checklist item, are in the project's shared files (`bugpass/BP3-results.md`).** The
  checklist itself is the guide thread's; this pass doesn't edit it.
- **Three things kept about 18 MB a match quit or Play Again, and each is let go now.** The shader warm-up's limit
  timer held the session for its minute; Three 0.186's WebGL2 vertex-array cache never dropped an entry; and Three's
  shared bind groups keep the viewmodel's lights, which held its scene. Heap with forced collection over ten quits:
  53 → 63 MB, settling (was 64 → 191 MB over eight).
- **The vertex arrays leave only Three's cache; the browser deletes them as it collects.** A live draw keeps its own
  reference, so deleting the GL object could break a draw still made with it. Guarded like the other private-API
  patches (`privateApiMissing`).
- **The Match screen's rules note scrolls with the fade the long lists use, and Start practice drops to 18 px under
  1000 px wide.** At 1280×720 the note scrolled with no sign of more; at 900 px the button ran 16 px past its column.
- **The HUD overflow check waits three frames past the first live one.** SwiftShader takes 10 s and more over that
  frame at 2560×1440 in its GPU process (no shader is linked then, measured), which turned main's CI red three times.
  A test change only.
- **Perf on all four presets, container, Depot Elimination on WebGL2: every line holds and none was raised.** Draw
  calls max 48 / 90 / 90 / 93, triangles max 64k / 128k / 123k / 125k, heap growth under 1.5 MB.

## Known issues left

- Three's WebGL2 vertex-array cache still grows by about 5 entries a match (KNOWN_ISSUES › Graphics and performance,
  can wait).
- SwiftShader's slow first live frame at 2560×1440 (KNOWN_ISSUES › Graphics and performance, document).
- The Match screen's map stills are soft at 4K, and with Ammo counter off the replica panel keeps its width
  (KNOWN_ISSUES › Menus, HUD and input, can wait).
- For William (real GPU or real mouse lock): F10 and the pause menu's Fullscreen in Chrome and Edge, AX1's dark corners
  and night look, PF4's replica shadows, PF1's wait and hitch checks, DX6's props and edge marker stacking, and the
  pistol glove beside the ammo panel at HUD 150 %.
