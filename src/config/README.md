# src/config

Every tunable number and data table, as exported constants with units in the comments. Gameplay code reads them here and
holds no magic numbers.

- Simulation: `sim.ts`, `movement.ts`, `vault.ts` (vaulting, and the maps' vault wall height), `physics.ts`, `hits.ts` (`HITS`, `ROUNDS`), `ballistics.ts` (air, `spinPerHop`,
  `WIND`, `leaves`: how bushes stop and throw off BBs, FO1), `footsteps.ts`, `modes.ts` (`MATCH_MODES`, `MODE_SHAPES`, the never-check `unknownMode`), `extraction.ts`, `matchRules.ts` (match rules, `RULESETS` and `MODE_FIT`, what fits each mode), `range.ts`, `practice.ts` (Practice on a map: where its targets stand and which kind, M94), `noise.ts` (NP1: which props are noisy, how hard a run must hit one, how far each knock and BB ring carries, and how far steps carry on each ground).
- Replicas and gear: `replicas.ts`, `glowBBs.ts` (glowing BBs: on night fields, always or never, M33b), `attachments.ts`
  (grips, magazines, barrels, muzzles), `optics.ts`, `lasers.ts`,
  `torches.ts`; `schemes.ts`, `characters.ts`, `figureRig.ts` (the rigged Blender figures, BF1), `replicaFinish.ts` for
  how they look. `statsFile.ts` reads `data/stats.md` and
  `gameStats.ts` holds `GAME_STATS`; the modules above lay it over their built-in numbers (`withStats`, `overlay`).
- Bots: `bots.ts` (the difficulties, `BOT_BEHAVIOUR` and `botConfig`; import from it) gathers the tuning split by
  concern (DX7): `botsSenses.ts` (sight, hearing, reaction, aim, firing), `botsMovement.ts` (lanes, hunting, cover,
  strafing, the holster), `botsSquad.ts` (team plans, routes, the flag, overtime, Pro's tuning), `botsExtraction.ts`
  (the home team's guards, patrols and hunters) and `botsSkill.ts` (`BotSkill`, `BOT_SKILL` per difficulty). Also
  `adaptiveDifficulty.ts` (adaptive difficulty's steps, limits, weights and words, and which skill numbers blend, AD1),
  `squad.ts` (orders, order wheel), `nav.ts`. `botsFile.ts` reads
  `bots.md` (BN1: the roster of names and what each personality changes) and `botPersonalities.ts` holds
  `BOT_PERSONALITIES`. `calloutsFile.ts` reads `callouts.md` (CL1: what the bots call and how often) and
  `calloutLines.ts` holds `CALLOUT_LINES`; `callouts.ts` has the feed's and radio click's numbers and the setting.
  `pings.ts` (PG1): how far a ping reaches, what counts as an enemy under it, the markers' life and the Ping markers
  setting. `magShare.ts` (MG1): the magazine hand-off's reach, flight, "low", what a giver keeps, the bots' ask gaps,
  the tossed magazine's look, the HUD's lines and the Mag hand-off setting.
- Rendering: `render.ts` re-exports `renderQuality.ts`, `renderEffects.ts`, `renderLighting.ts`, `renderSurfaces.ts` and
  `renderView.ts`: import from `render.ts`. Also `graphics.ts` (the Custom rows), `post.ts`, `look.ts`, `weathering.ts`,
  `bake.ts`, `dressing.ts`, `materials.ts`, `gpuDressing.ts` (W5: the node path's GPU grass and tree stand-ins, capped
  per preset). The Renderer row (W1): `rendererPick.ts` (the picks boot reads, in the main
  chunk) and `renderBackend.ts` (the row's texts and the back ends' tuning, read only by the lazy renderer chunks).
- Sound, input and UI: `audio.ts`, `sounds.ts`, `controls.ts`, `menus.ts`, `menuArt.ts`, `savedLoadouts.ts` (slot count and words, SL1), `minimap.ts`, `matchInfo.ts`, `hudText.ts` (the HUD's words),
  `teams.ts`, `tutorial.ts`, `accessibility.ts`, `itemPictures.ts`.
- Content and saving: `content.ts` (public or dev tags), `contentRules.ts` (the content checks' ranges, budgets,
  balance band and exception registers: `docs/content/README.md`), `dev.ts` (Dev settings), `dataTables.ts` (the six `data/` tables' problems, for the console and the Dev tab, DX7), `save.ts`, `assets.ts`.
- Build and pipeline: `buildVersion.ts` (the version comes from git through `vite.config.ts` and `.git_archival.txt`;
  nothing to bump), `chunkBudget.ts`, `page.ts`, `precompress.ts`, `rapierWasm.ts` (Rapier's WebAssembly as a plain
  file in builds, IM3), `thirdPartyLicences.ts` (the build's licences file and the notices Vite can't see, LC1), `perfScript.ts`, `crash.ts`, `loading.ts`.
- Tests: `render.test.ts`, `graphics.test.ts`, `stats.test.ts`, `content.test.ts`, `dev.test.ts`, `botsTuning.test.ts`,
  `rulesets.test.ts`, `matchRules.test.ts`, `attachments.test.ts`, `dataTables.test.ts` (a bad row in each `data/`
  table reaches the Dev tab and the console), `statsDrift.test.ts` (the built-in numbers equal `stats.md`'s, audit B5).
- Rules: a new Dev setting goes in `dev.ts`, then `Game.applyDev` reads it. A new replica or part number is a `stats.md`
  column plus a `Column` in `statsFile.ts`. A new quality field is a value on every preset, a row in `graphics.ts` and a
  `graphics.<field>` key. A default key that moves goes in `MOVED_DEFAULTS` (`controls.ts`). Match code reads
  `MatchSession.rounds` / `.hits`, never `ROUNDS` / `HITS`.
