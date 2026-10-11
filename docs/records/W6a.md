# W6a · One renderer: the old WebGL path deleted, perf lines per back end (WebGPU overhaul step 6, part 1; scope `plans/webgpu-overhaul-scope.md`)

**Review:** 1 attempt · 7/8 · Accept (Opus) · Medium draw lines raised on the owner's card

## Attempts

| Date | Attempt | Worker model | build | tests | smoke | perf | scope | changelog | Critic | Retry reason | Wall time | Worker tokens |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 2026-10-11 | 1 | Opus 5.5 (build thread) | ✓ 45 s | ✓ 669 s | ✓ 1296 s (re-run) | ✓ 2088 s | ✓ | ✓ | 7/8 Accept (Opus) | – | ~11 h | QA (Sonnet) ~110k, changelog 2 × ~25k, critic (Opus) 96k |

- **Attempt 1:** five gate runs, logs in `pipeline/runs/W6a/attempt-1/`.
  - Gate 1 (a20fa0f): three e2e checks still read the old renderer's counters (`info.render.calls` counts render() calls
    on the node renderer and is never reset; `info.programs` is the old renderer's), a Neon Heights WebGPU frame error,
    and Neon WebGL2 perf runs timing out on the Start click. All fixed: the specs read `Renderer.stats` and count the
    programs built through the back end's `createProgram`; `deferredFrees.ts` (below); the Start click waits 120 s.
  - The specs' new program count found two shaders built mid-match on Medium at 5v5: a spawn pool's compute pass,
    first built at its first puff. `ParticleTwins.warm` now builds every pool's pass in the warm-up compile.
  - Gate 2 (69a9201, after main's RM4 and M96-M98): the release build's Play failed to take the mouse. The click's
    build and first frames held the page past the click's user activation before the raw-input retry. Play now asks
    for the lock first and builds once the browser answers (`game.ts` play/enter). The boot spec's edge smoothing check
    read the old renderer's new context; on the node renderer it applies from the next load, as the Graphics tab says.
  - Gate 2's perf: Woodland Medium 115.3 (WebGL2) and 116.5 (WebGPU) draws against 115, Neon Heights Medium on WebGPU
    142 against 140. Per-object draw lists against main's old renderer: the node path draws the grass and stand-ins
    (2 draws the old path never had) and RM4's built-in models add about 5 on both (main itself: 113.3). The owner
    raised the lines on a card (Woodland 120, Neon Heights 145; DECISIONS).
  - After main's M88 made Woodland 5v5, its six baselines were recorded again on both back ends. Low on WebGL2 stays
    under main's old-renderer numbers: Elimination 42.5 draws against 43.7, Extraction 41.1 against 43.5.
  - Gate 3 (9cc2362): green but for `perfMatrix.test.mjs`, which pinned the old Neon line; gate 4 (tests only) green
    after that test followed it.
  - Gate 5 (c36c732, main's M87, M88 and CT4 merged, Woodland's baselines re-recorded): green but for Neon Heights'
    yard check, which read live places a bot had already left by 0.3 m (as in gate 1; it passes alone). It now reads
    the spawns the match was built with; the whole browser suite then passed on 4a4bb83 (83 of 83, `smoke-rerun.log`).
- **Critic** (Opus, 7/8 Accept): check 8 failed on `src/render/README.md` not naming `webgpu/deferredFrees.ts`; the
  line was added before the merge. Two doubts, not failures: `play()` now unlocks audio after the lock's answer,
  outside the click's transient activation (Chrome needs only sticky activation; the owner checks Firefox's sound),
  and a preset that drew the grass in a second pass would read the dressing at twice its caps (none does today).

- **Picture compare** (`pipeline/webgpu-compare.mjs`, against a build of b10c006, the last commit with the WebGL path):
  every map, light and preset, both node back ends, 232 pairs.
  - 166 pass the whole bar. 46 WebGPU pairs pass on the pixel share and 12 retro views are judged by eye (owner's
    rulings W3 and W4, now applied by the tool itself: `judgedBy`).
  - 8 pairs on Woodland by night on Medium (and Neon Heights' before its re-run) drew one call more on the node page. Traced with a
    per-object draw list: the kicked-dust pool, alive on one page only because a footfall fell before the clock
    stopped (one page ran 20 ticks, the other 40). The tool now hides kicked dust; Neon Heights re-run: all pass.
  - Woodland's W5 views (the grass and stand-ins) on Medium and High: counts at their caps, as W5 recorded.
    Ultra's W5 views did not run: the Start click timed out at 30 s under load before the click got its 120 s.
- **Perf baselines:** all 16 matrix entries re-recorded in the container, the 8 WebGL ones (now the node renderer's
  WebGL2 back end) and 8 new WebGPU ones. Four WebGL runs first timed out on the Start click while the picture compare
  loaded the machine; alone they ran clean. Low is no dearer on WebGL than the old WebGLRenderer's baselines (same or
  fewer draws and triangles, same memory). WebGPU's averages run a few draws higher on Low with the same maximum (it
  samples about twice the frames, so more of the busy moments).

## Fixes found on the way

- **WebGPU frames dropped on Neon Heights at Low** (KNOWN_ISSUES row deleted): Three 0.186 rebuilds a draw whose
  material's cache key changed inside the pass and frees its uniform buffers there; an earlier draw in the same pass
  (the steel plates' shared `render` group) still used one, so the submit was refused. `webgpu/deferredFrees.ts` holds
  those buffers until the frame is submitted (flushed in `NodeBackend.frameDone` and on dispose); WebGL2 untouched.
- **Menu pictures and a match's warm-up compile overlapped** on the WebGL2 back end (Woodland Ultra's start 35 s
  against 17 s at b10c006): `ItemPictures` waits for `Renderer.afterCompiles()` before each picture (19.5 s).
- **The dressing's triangles** were first read as the info's change across a draw; on the WebGL2 back end Three can
  draw other objects between a mesh's `onBeforeRender` and its own draw (seen looking up at 5v5: +12k). They are now
  counted from each draw's geometry, as Three's info counts them.
- **CI's first run counted the warm-up's shaders** (Woodland's spins, 6 and 12 built): Three compiles a match's
  shaders over many frames, and on the runner that was still going when the check began counting. The count now starts
  once the warm-up is done (checked locally with the CPU slowed 4x) and leaves out the item pictures' own draws: waiting
  for those to finish took over 2 minutes on CI's second run (not seen locally, even with the CPU slowed 6x).

## Decisions

- **One renderer.** The node renderer draws every preset, the item pictures and the retro filter; "WebGL" is its
  WebGL2 back end (`?forceWebGL`), chosen when the browser has no WebGPU, the player picks it, or a lost device brings
  no new WebGPU device (`NodeBackend.replacement` tries the same options, then once on WebGL2). `Renderer.lostToWebGL`
  tells the menus.
- **The deleted classes' numbers are kept.** The tests that compared the node post stack and retro filter against the
  WebGL ones read the values those classes produced, recorded at b10c006 (`render/webgpu/post/webglReference.ts`).
- **The compare keeps a WebGL side** by building b10c006 in a worktree of its own (`WEBGL_REFERENCE`), so later steps
  can still check pictures against the old renderer.
- **Triangles: the GPU dressing on a line of its own, the scene on the owner's.** Three counts the grass and stand-ins'
  indirect draws at their caps, so a raised Woodland line (about 261k Medium, 375k High, 637k Ultra) would have hidden
  any other growth. `DrawStats.dressingTriangles` counts what Three counts for each of those draws (from its
  geometry, in `onAfterRender`); the harness subtracts it from `triangles` and judges it against a per-preset line
  at the caps plus 2 % (pinned against the caps by `gpuDressing.test.ts`). Woodland Extraction Medium: 132k scene
  triangles (max 140k) under 200k. No line was raised; `backends` stays empty (DECISIONS 2026-10-11).
- **Chunks:** the game chunk is 982 kB against main's 1,007 kB (946 against 951 before main's M80, M82 and RM4); the 1,050 kB line stays until W6b removes the world's GLSL.
- **Medium draw lines raised on the owner's card** (Woodland 120, Neon Heights 145; the 5v5 spin check 140).
- **Edge smoothing applies from the next load on both back ends:** the node renderer's multisampling is fixed for its
  life; the old path's new context went with it.
- **Owed DECISIONS lines written:** WebGPU as default with the public Renderer row (2026-10-08), the software
  adapter's pixel-share bar (W3), its retro views by eye (W4), Woodland's lines kept (W5), weaker bounces (G12).

## Known issues left

- The world's `onBeforeCompile` GLSL still ships for the node twins to translate (W6b).
- `deferredFrees.ts` leans on Three's private `destroyUniformBuffer`, `get` and `delete`; it says so once if an upgrade
  renames them.
- Medium's draws sit close to the raised lines (Woodland 115 of 120, Neon Heights 140 of 145): RM4's built-in replicas
  draw part by part; merging a replica's static parts would win several back (Beta, performance).
- A figure's HIT! sign builds its shader the first time anyone is hit (hidden objects aren't warmed; the old renderer
  did the same). One small build per match (Beta, performance).

## Browser checks for the owner

1. Chrome on WebGPU, Neon Heights on Low: start a few matches; the first frames never stutter.
2. Start match: the mouse locks at once and the match appears; Esc then Resume locks again.
3. Firefox: sound plays from the first Start match.
4. Woodland on Medium (WebGPU): grass and trees draw; the first BB puff or grit doesn't hitch.
5. Graphics › Renderer › WebGL, reload: menu pictures, High's post effects and the Retro look all draw.
6. Change edge smoothing: Settings says it applies from the next load; after a reload the edges are smooth.

## Left for W6b

- If a later preset draws the grass in a second pass, `dressingTriangles` counts it twice: its line then needs that pass.

- The world's `onBeforeCompile` patches (night sky, light fixtures, dust motes, dressing meshes, sky, smoke, figure
  camo and finish, surfaces, fireflies) still carry GLSL that only the node twins translate (`worldTwins.ts`,
  `twinUniforms.ts`). W6b turns them into node patches and deletes the GLSL.
- Then the map pictures (`pipeline/map-stills.mjs`, `public/menu/*.jpg`).
