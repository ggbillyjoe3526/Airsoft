# src/config

Every tunable number and data table, as exported constants with units in the comments. Gameplay code reads them here and
holds no magic numbers.

- Simulation: `sim.ts`, `movement.ts`, `physics.ts`, `hits.ts` (`HITS`, `ROUNDS`), `ballistics.ts` (air, `spinPerHop`,
  `WIND`), `footsteps.ts`, `modes.ts`, `extraction.ts`, `matchRules.ts` (match rules and `RULESETS`), `range.ts`.
- Replicas and gear: `replicas.ts`, `attachments.ts` (grips, magazines, barrels, muzzles), `optics.ts`, `lasers.ts`,
  `torches.ts`; `schemes.ts`, `characters.ts`, `replicaFinish.ts` for how they look. `statsFile.ts` reads `stats.md` and
  `gameStats.ts` holds `GAME_STATS`; the modules above lay it over their built-in numbers (`withStats`, `overlay`).
- Bots: `bots.ts` (behaviour and difficulties), `squad.ts` (orders, order wheel), `nav.ts`.
- Rendering: `render.ts` re-exports `renderQuality.ts`, `renderEffects.ts`, `renderLighting.ts`, `renderSurfaces.ts` and
  `renderView.ts`: import from `render.ts`. Also `graphics.ts` (the Custom rows), `post.ts`, `look.ts`, `weathering.ts`,
  `bake.ts`, `dressing.ts`, `materials.ts`.
- Sound, input and UI: `audio.ts`, `sounds.ts`, `controls.ts`, `menus.ts`, `menuArt.ts`, `minimap.ts`, `matchInfo.ts`,
  `teams.ts`, `tutorial.ts`, `accessibility.ts`, `itemPictures.ts`.
- Content and saving: `content.ts` (public or dev tags), `dev.ts` (Dev settings), `save.ts`, `assets.ts`.
- Build and pipeline: `buildVersion.ts` (the version comes from git through `vite.config.ts` and `.git_archival.txt`;
  nothing to bump), `chunkBudget.ts`, `page.ts`, `precompress.ts`, `perfScript.ts`, `crash.ts`, `loading.ts`.
- Tests: `render.test.ts`, `graphics.test.ts`, `stats.test.ts`, `content.test.ts`, `dev.test.ts`, `botsTuning.test.ts`,
  `rulesets.test.ts`, `matchRules.test.ts`, `attachments.test.ts`.
- Rules: a new Dev setting goes in `dev.ts`, then `Game.applyDev` reads it. A new replica or part number is a `stats.md`
  column plus a `Column` in `statsFile.ts`. A new quality field is a value on every preset, a row in `graphics.ts` and a
  `graphics.<field>` key. A default key that moves goes in `MOVED_DEFAULTS` (`controls.ts`). Match code reads
  `MatchSession.rounds` / `.hits`, never `ROUNDS` / `HITS`.
