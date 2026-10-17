# BD1 · Blender models by default (playtest item 1)

**Review:** 3 attempts · 7/8 · Accept (Opus) · qa Pass · performance Pass

## Attempts

| Date | Attempt | Worker model | build | tests | smoke | perf | scope | changelog | Critic | Retry reason | Wall time | Worker tokens |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 2026-10-16 | 1 | Opus 5.5 (build thread) | ✓ 17 s | ✗ 493 s (3 bot-match tests under the rigged hits) | ✗ 1057 s (boot shader error under load; Woodland 5v5 Medium 204,881 of 200,000) | ✓ 1843 s | ✓ | ✓ | – no critic on a red gate | your own body drawn looking level; seed-sensitive extraction and follow tests | ~2 h | QA ~60k, changelog ~20k |
| 2026-10-16 | 2 | Opus 5.5 (build thread) | ✓ 17 s | ✓ 482 s | ✗ 1026 s (Woodland 5v5 Medium 257,287 of 200,000) | ✓ 1804 s | ✓ | ✓ | – no critic on a red gate | four teammates at full detail at the spawn on Medium | ~1.5 h | – |
| 2026-10-17 | 3 | Opus 5.5 (build thread) | ✓ 16 s | ✓ 472 s | ✓ 1017 s | ✓ 1802 s | ✓ | ✓ | 7/8 Accept (Opus) | – | ~1.5 h | QA ~24k, performance ~59k, critic ~162k |

## Decisions

- **The code-built models are not kept for Low; they stay only as the fallback when a model file can't load.** Low with
  the Blender models measured 35 draw calls of 100, 54,000 triangles of 150,000 and 78 MB of 300 in the container, so
  nothing in the budget asks for them (also in DECISIONS).
- **One load at the start.** `render/modelFiles.ts` fetches the figures, rigs, replicas and parts once as the game
  starts (12.8 MB for the whole build, under the 30 MB target), and every menu picture draws the Blender model.
- **Each rigged figure casts its shadow from one twin.** The twin is the body at its coarsest level in one draw, on a
  layer only the shadow cameras see (`FIGURE_RIG.shadowLayer`), because the body's own materials cost a shadow draw each
  and put Woodland and Neon Heights Extraction on Medium over their draw-call lines (127 of 120, 165 of 145).
- **The robot's plain materials share one vertex-coloured finish** (`render/figureRigFinish.ts`): its visor and gloss,
  with each vertex's roughness and metalness, in one draw. Textured, glowing and team-coloured materials keep their own.
- **Your own body is drawn only while the bottom of your view reaches it, or you vault** (`FIGURE_RIG.firstPerson`):
  no part of it comes higher than 72° below the eyes standing, 53° crouched (measured over the clips, with a 10° margin
  for lean and bob), so looking level it was 20,000 triangles off screen, and Neon Heights Extraction and Woodland 5v5
  on Medium were over their 200,000. The test that holds the angles: `riggedFigure.test.ts`.
- **The Medium preset's Player detail is Low** (`QUALITY.medium.figureDetail`): its figures take Low's level-of-detail
  distances (middle detail beyond 6 m, the coarsest beyond 16 m), because four teammates at full detail at the spawn put
  Woodland 5v5 on Medium at 205,000 to 257,000 triangles of its 200,000; with Low's distances 140,000 to 145,000. High
  and Ultra keep 12 m and 28 m, and anyone on Medium can still pick High.
- **The menus' pictures wait for a lost device's replacement** (`Renderer.afterCompiles`): CI's boot test lost and
  restored the context while a Blender replica's picture was queued, and drawn on the old renderer its new pipeline
  linked that context's dead shaders (3 failures in 6 runs under load; main 0 of 6). With the wait, 6 of 6 and the whole
  boot spec 24 of 24.
- **The skin check's play modules leave out test-only files** (`*Support.ts`, `*.test.ts`, `src/ai/balance/`): the
  headless matches now read the figure files for their hit rules, and none of that ships.
- **The perf baselines are re-recorded with the Blender models drawn** (all 19 container files).

## Known issues left

- Low's frame time with the Blender figures is measured in the container only; the owner's laptop check is PF2's
  (KNOWN_ISSUES › Graphics and performance, playtest).
- Neon Heights Extraction on Medium averages 195,000 triangles of its 200,000 (main with the code figures: 166,000), so
  any more Neon detail needs a trim first (performance review). GPU memory went from single digits to 79 to 136 MB of
  300 with the models loaded: worth a look at texture sizes on integrated graphics.
