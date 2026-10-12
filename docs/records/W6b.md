# W6b · The world's shaders as node patches the materials carry (WebGPU overhaul step 6, part 2)

**Review:** 2 attempts · 8/8 · Accept (Opus)

## Attempts

| Date | Attempt | Worker model | build | tests | smoke | perf | scope | changelog | Critic | Retry reason | Wall time | Worker tokens |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 2026-10-11 | 1 | Opus 5.5 (build thread) | ✓ 34 s | ✓ 480 s | ✓ 960 s | ✓ 1838 s | ✓ | ✓ | 7/8 Retry (Opus) | AC4 chunk line kept at 1,050 kB; AC3 no compare scores | ~3 h | QA (Sonnet) ~90k, changelog ~25k, critic (Opus) ~110k |
| 2026-10-12 | 2 | Opus 5.5 (build thread) | ✓ 35 s | ✓ 447 s | ✓ 903 s | ✓ 1614 s | ✓ | ✓ | 8/8 Accept (Opus) | – | ~6 h | critic (Opus) ~70k |

- **Attempt 1:** gate green on 1b5a1cc; logs in `pipeline/runs/W6b/attempt-1/` (project files). The critic failed
  check 1 on two counts. The chunk line stayed at 1,050 kB though the chunk had room (975 kB): it is back at 1,000 kB
  (below). The picture compare isn't a gate and had no scores: they are below.
- **Attempt 2:** main's M91 and M81 merged in first; full gate green on 31be731 (logs in
  `pipeline/runs/W6b/attempt-2/`), then main's M91b merged in (its torch shadow fix alone) and a quick gate on d25e2a2
  passed. The critic accepted on its intent: "as it did after W6a" can't be read literally since W6a's own merge now
  fails against b10c006 on the same pairs (the compare below). Its one note, a DECISIONS line for checking against the
  commit before, is written.

## The picture compare

`pipeline/webgpu-compare.mjs`; bar mad ≤ 0.5 and at most 1 % of pixels over 24, WebGPU pairs judged on the pixel share
(W3). Scores per pair in `pipeline/runs/W6b/attempt-2/compare/` (project files).

- **Against the commit before** (`--reference <commit>`): the check that says W6b draws nothing new. First against
  4003644 (W6a's merge), WebGL2 back end, W2's and W3's views, every map: 50 of 50 pass, the largest mean difference
  0.029. Then, after main's M91 and M81 merged in, against 0e1a417 on both back ends, W2's, W3's and W4's post views,
  every map, light and preset: **242 of 244 pass**. On the WebGL2 back end every pair is the same picture (largest mean
  difference 0.062, at most 0.04 % of pixels over); WebGPU pairs pass on the pixel share and the retro views by eye, as
  in W6a. The two that failed were the WebGPU torch views at night on High, M91's destroyed shadow texture on main
  itself (main's own tool showed it at 0e1a417); M91b fixed it, and after merging it the night figure and torch views
  against 6d43d0f pass on both back ends (22 of 22). One Woodland Medium post pair drew one call more once and not on
  its re-run (40 of 40), the timing case W6a found.
- **Against WEBGL_REFERENCE (b10c006, the last commit with the WebGL path):** Depot's and Neon Heights' world views
  pass on both back ends (8 of 8 and 20 of 20). The figure views (W3) on every map and all of Woodland fail, and fail
  the same way at 4003644: since b10c006, RM4's built-in replicas draw part by part (first person 68 draws against 64,
  the figures' pixels moved) and M88 rebuilt Woodland for 5v5 (the camera sees a different scene). W6b draws the
  pictures 4003644 draws (above), so the drift is content's, not this change's (KNOWN_ISSUES row).
- **The tool itself:** its night views pin the fixtures' clock through the flames' node patch (they read the GLSL
  uniform before), and `--reference <commit>` draws a later node-renderer commit in WEBGL_REFERENCE's place, both pages
  without the GPU grass and stand-ins (`pipeline/README.md`).

## Decisions

- **A material carries its node patch** (`render/nodePatch.ts`): a typed kind (`surface` with its recipe, or `stars`,
  `embers`, `fireflies`, `motes`, `flames`, `smoke`, `torch-beam`, `figure-finish`, `sleeve-camo`) and its uniforms,
  set where the material is made. The material stays a plain Three material; the node renderer's library hook
  (`worldTwins.ts`) switches on the kind. The node path never ran the GLSL, so the pictures are the same by construction (the compare
  above checks it).
- **M91's soft beam** came in from main with a program key of its own and no patch; it now carries the `torch-beam`
  patch like the rest (same key, same twin).
- **Checking against the commit before** (`--reference`) when b10c006's content has moved on: DECISIONS 2026-10-11.
- **Program keys** read from the patch: a kind's name, or `surface:<wear|none>:<probes|none>` with `:dressing-junk`
  (`-neon`) and `:sky-host`. A Lambert and a Standard surface can share a key: Three adds every material property,
  `type` among them, after `customProgramCacheKey`, so they never share a program.
- **`withoutEnvironment` deleted:** node Lambert and Basic materials never read `scene.environment` (only `envMap`), so
  it did nothing on the node path.
- **The game chunk's budget back at 1,000 kB** (warning from 900): the chunk is 975 kB, down from W6a's 982
  (DECISIONS › Chunk size budgets).
- **The source guard** (`nodePatch.qa.test.ts`): no `onBeforeCompile`, GLSL include, `gl_` built-in, `ShaderMaterial`,
  `ShaderChunk` or uniform and varying declaration in `src/` outside tests.

## Known issues left

- WEBGL_REFERENCE (b10c006) no longer matches Woodland or the figures; later steps check against the commit before them
  with `--reference` (KNOWN_ISSUES › Build, tests and pipeline; DECISIONS 2026-10-11).
- Medium's draws still sit close to the lines (attempt 2: Woodland 117.0 of 120 on WebGPU, Neon Heights 139.5 of 145
  on WebGL2; attempt 1 had Neon Heights at 144.1 on WebGPU), as W6a left them.

## Browser checks for the owner

1. Depot on High: the weathered walls, the steel tread plates' sheen and the puddles look as before.
2. Neon Heights at night: the neon signs flicker and the junk's glow strips are lit.
3. Woodland at night on WebGPU, High: your torch's soft beam and shadows, other players' beams, fireflies and dust motes.
4. At night: the fires' flames sway and flicker, embers rise, chimney smoke and vent steam fade out.
5. Player detail High: the figures' camo and finish (glossy goggles, steel barrels); your sleeves' camo with Hand detail High.
6. Switch Low and High mid-session on WebGPU and on WebGL: no missing or flat white surfaces.

## Left for the map pictures

- The menus' map and mode pictures (`public/menu/*.jpg`, made by `pipeline/map-stills.mjs`) were last drawn before
  the node renderer; they are redrawn from it next. Woodland's dates from before M88's 5v5 layout.
