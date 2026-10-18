# BP6d · Beta 1 bug pass: the known issues backlog and William's checklist

**Review:** 3 attempts · 8/8 · Accept (Opus)

## Attempts

| Date | Attempt | Worker model | build | tests | smoke | perf | scope | changelog | Critic | Retry reason | Wall time | Worker tokens |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 2026-10-18 | 1 | Opus 5.5 (build thread) | ✓ 17 s | ✓ 501 s | ✗ 1089 s (Reduced motion check, load) | ✓ 3218 s | ✓ | ✗ (the changelog agent ran after the gate; its line is in) | – (failed gate) | smoke under load, changelog | ~2 h 30 min | QA 37k, changelog 20k, performance 17k, four row audits 377k |
| 2026-10-18 | 2 | Opus 5.5 (build thread) | ✓ 24 s | ✗ 536 s (`matchSessionResultDue.test.ts` after #276's held-fire call) | ✗ 1304 s (Woodland torch check, load) | – stopped | – | – | – (failed gate) | BP6b's merge broke the result-timing test's stub | ~1 h 30 min (a run before it was cut by a container restart) | – |
| 2026-10-18 | 3 | Opus 5.5 (build thread) | ✓ 17 s | ✓ 538 s | ✓ 1229 s | ✓ 3087 s | ✓ | ✓ | 8/8 Accept (Opus) | – | ~1 h 30 min | QA 30k, performance 25k, critic 71k |

## Decisions

- **One of four threads.** The Beta 1 bug pass (TASKS' BP6) ran as BP6a (gunplay, movement, HUD), BP6b (bots, modes,
  maps), BP6c (menus, settings, browser) and this one (the known issues backlog and the owner's checklist). This
  record's commit clears the BP6 block with its own; each other part has its block.
- **Every row was checked against the code** by four read-only audits, one per group of sections, each row marked holds,
  stale or wrong in a detail with a `file:line`; the browser checks of playable rows are BP6a–c's. None was fixed by
  accident. One row went (`Game`'s 30 settings, gone with DX5) and 33 were put right: notes cut mid-sentence by the 300-character trim restored, numbers
  and paths that later work moved (RE1's round-end timing, PF4's Neon Heights draw calls, RM9's name tag, DX7's config
  files, "Medium and High" that Ultra shares).
- **The Red Laser's text, not its effect, changed.** `pool/kit.ts` scales the replica's whole spread, aimed included,
  while the blurb said "steadier from the hip". A hip-only laser would be a balance change, so the words follow the game.
- **The mouse-look test was withdrawn.** `e2e/pointerLock.spec.ts` turned the view by mouse counts and picked Follow Me on
  the order wheel under the real lock, and passed in the cloud container's Chromium, but on CI's headless shell
  (Chromium 156) the view never turned, even with raw input off and the round's clock running: four CI runs red. It
  went rather than hold the paused project's last pull request; the two rows it closed are back, with that finding.
- **The HUD overflow check waits longer for the ammo count.** With that spec gone the shards regrouped, and on one
  a 2560 × 1440 frame took over 10 s twice in `uiOverflow.spec.ts`; its count now waits 30 s and the test 300 s. A test
  change only.
- **The bush's drawn lumps were left as they are.** MS1's look puts them from about 17 % inside the BBs' ellipsoid to
  30 % outside; re-centring them would change how bushes look, which wants the owner's eye on a picture first. The row
  says so.
- **The smoke gate's two failures were load, not this change.** `webgpuWorld.qa.spec.ts`' Reduced motion check (the
  gate ran beside the QA suite; alone 15 of 15) and `woodland.spec.ts`' torch check (alone 6 of 6); the third run passed.
- **BP6b's measurements closed seven rows and rewrote eight.** Bot personalities' and Pro's Attack / Defend leans, the
  doorway stall, Neon Heights' east end, Neon by Day's and Elimination's Pro bands and Extraction's XP all sit in band
  or were not seen in its 128-match soak (`bugpass/BP2-results.md`); the rest take its numbers.

## Known issues left

- None added. The rows BP6a–c add are theirs (BP6a logged the Firefox lock hang its review found).
