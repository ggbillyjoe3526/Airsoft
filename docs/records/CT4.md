# CT4 · Content toolkit part 4: skin checks

**Review:** 3 attempts · 8/8 · Accept (Opus)

## Attempts

| Date | Attempt | Worker model | build | tests | smoke | perf | scope | changelog | Critic | Retry reason | Wall time | Worker tokens |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 2026-10-11 | 1 | Opus 5.5 (build thread) | ✗ | ✓ | ✗ | ✓ | ✓ | ✓ | – | A QA test's type error (exactOptionalPropertyTypes); smoke failed with the build | ~3 h | QA (Opus) 44k, changelog (Haiku) 24k |
| 2026-10-11 | 2 | Opus 5.5 (build thread) | ✓ 29 s | ✗ 339 s, ✓ 326 s re-run | ✓ 630 s | ✓ 577 s | ✓ | ✓ | – | 1 of 4671: a heap count in a file this task doesn't touch (`worldTwins.qa.test.ts:251`), under load; passed on the re-run and alone | ~30 min | – |
| 2026-10-11 | 3 | Opus 5.5 (build thread) | ✓ 30 s | ✓ 336 s (but the format test on this record's draft, on disk) | ✓ 647 s | ✓ 588 s | ✓ | ✓ | 8/8 Accept (Opus) | – | ~30 min | critic (Opus) 119k |

- **Logs** are in the project's shared files under `pipeline/runs/CT4/`.
- **Perf** ran because the diff touches `src/render/replicaBuilder.ts` (each material is named once when built) and
  `src/ui/menus/customiseView.ts`; every matrix run passed. The gate's stale container baselines warning (129 commits
  behind) is its own (CORE-12).
- **End to end** (2026-10-11): `node pipeline/content-check.mjs skin:signal` 0 fail, 1 warn, 17 pass in 153 s (4
  pictures, each map's colours measured on Depot, Woodland and Neon Heights); `skin:cobalt` 18 pass in 120 s;
  `skin:all` 0 fail, 1 warn, 98 pass in 5 s.

## Decisions

- **The numbers are Claude's defaults** (`SKIN_RULES`, in DECISIONS): colours cover at least 60 % of the replica; a
  colour counts at a distance at 10 % of a bot figure's replica; the orange tip stands 20 apart in colour (CIEDE2000),
  closer is a look; a skin blends into a map within 10 of its common colours (5 % of the surface or more).
- **A skin fits every replica that takes one** (the Cyber Pistol keeps its own colours): today's schemes carry no list
  of replicas, so the claim is derived, not declared.
- **Team colours:** Cobalt, Signal and Coral are the bots' own team colours; Hazard (orange, players only) is in
  `TEAM_COLOUR_SKINS` as it was before the toolkit. The owner may overrule.
- **Dev skins:** a `tag` on each scheme; a dev one shows in Customise only with Dev content on, and a saved pick of it
  plays as the replica's default without. All eight shipped schemes are public and pinned.
- **"Looks only" is proved two ways:** the kit is identical with and without a skin, and the play modules (sim, bots,
  physics, nav, the kit's numbers) reach the schemes only through names that pass an id along (today `matchRules.ts`
  imports `defaultScheme`).
- **Map colours are measured as painted, before light,** in the browser (material colour × texture mean × vertex and
  instance colours, by area): a map's block tints are white where a texture carries the colour.
- **Figure colours by ray, not area:** the bot figure's replica is ray-cast from 14 directions, so a thin accent line
  inside the body counts as what shows (2 to 5 %), not its full surface.

## Known issues left

- Signal's orange furniture sits against the Gas Pistol's orange tip (about 5 apart): a playtest row in KNOWN_ISSUES.
- The map check's team-colour rule reads block tints, white for textured blocks (CT2): a can-wait row in KNOWN_ISSUES.
- The heap-count tests that run over under load: a can-wait row in KNOWN_ISSUES.
- Optional (critic): `skinFit.ts` `drawn()`'s memo key leaves out `tipReach` and which model files were given (one
  game context today); `skin.orangeTip`'s "no tip drawn" fail has no fault test (only its warning). Can wait.
