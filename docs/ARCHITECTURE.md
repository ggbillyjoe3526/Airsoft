# Architecture

How the code is laid out and the contracts a task must not break. Each `src/` folder has a `README.md` with its files,
tuning and tests: read the folder's README before grepping across `src/`.

## Layers

```
input ──► PlayerCommand ──┐
ai (bots) ─► PlayerCommand ┤   (ai/ and walk-offs use nav/: a walkability grid + A*)
                           ▼
                   sim (pure, fixed 60 Hz) ◄── physics (Rapier: level collision)
                           │ plain-data GameState + events
                           ▼
          render (Three.js) · audio (Web Audio) · ui (DOM HUD)
```

- **The simulation is plain data.** `GameState`, `Character` and the BB pool hold no Three.js object and no DOM
  reference, and no code in `sim/` calls `Math.random`: randomness comes from the seedable `state.rng` (bots have
  their own seeded streams). The fixed tick, command-driven characters and seeded RNG are kept because they make the
  simulation deterministic and unit-testable (headless bot matches). There is no multiplayer.
- **One way in.** The simulation advances only through `stepSimulation(state, commands, ctx, dt)`, fed fixed ticks by
  `core/fixedStepper.ts`. Every character, the player and each bot, is driven by one `PlayerCommand` per tick, passed
  in a `Map` keyed by character id. View angles are absolute, so a lost or duplicated command cannot accumulate drift.
- **Bots are just another controller.** They read game state and never write it, through the same commands as the
  player. Physics implements the simulation's `CharacterMover` and `WorldQuery`; the simulation never calls Rapier.
- **Presentation reads, never writes.** After each tick it consumes `state.events` (shots, impacts, reloads and so on;
  cleared every tick). Render interpolates between `prevPosition` and `position` with the stepper's alpha; the local
  camera uses the latest input angles, so aim is never a tick behind.

## Module map

A task that adds, renames or moves a file keeps its folder's `README.md` current.

| Folder | What it owns | Key files |
|---|---|---|
| `src/` (root) | The app that outlives matches; one match or range session at a time | `main.ts`, `game.ts`, `matchSession.ts`, `rangeSession.ts`, `matchFlow.ts`, `newGamePicks.ts` |
| `src/sim/` | Gameplay rules, pure, fixed 60 Hz | `simulation.ts`, `state.ts`, `commands.ts`, `armament.ts`, `ballistics.ts`, `round.ts` |
| `src/ai/` | Bots: senses, decisions, cover, squad orders, Extraction roles | `botController.ts`, `botBrain.ts`, `bot.ts`, `perception.ts`, `cover.ts`, `squadOrders.ts` |
| `src/nav/` | The layered walkability grid, A* routes, walk-off fields | `navGrid.ts` |
| `src/physics/` | Rapier: level collision and the character mover | `physicsWorld.ts` |
| `src/map/` | Map data (blocks, spawns, lanes, flag, Extraction) and map helpers | `mapTypes.ts`, `maps.ts`, `depot.ts`, `woodland.ts`, `neonHeights.ts`, `range.ts` |
| `src/input/` | Keyboard, pointer lock, key bindings, order wheel; builds the player's command | `playerInput.ts`, `keyBindings.ts`, `keyboard.ts`, `pointerLock.ts` |
| `src/render/` | Three.js: field meshes, figures, replicas, lighting, effects, post stack, cameras | `renderer.ts`, `matchPresentation.ts`, `combatPresentation.ts`, `mapMeshes.ts`, `characterRenderer.ts`, `viewmodel.ts` |
| `src/audio/` | Web Audio: synthesised sounds, mix, 3D positioning, ambience | `audioEngine.ts`, `sfx.ts`, `dsp.ts`, `soundBank.ts`, `audioMix.ts` |
| `src/ui/` | DOM HUD, overlays and settings tabs; the menus in `ui/menus/` | `hud.ts`, `scoreboard.ts`, `minimap.ts`, `debugOverlay.ts`, `menus/menus.ts` |
| `src/config/` | Every tunable number and data table | `replicas.ts`, `bots.ts`, `hits.ts`, `render.ts`, `controls.ts`, `dev.ts` |
| `src/core/` | Loop and session plumbing: stepper, seeds, frame pacer, crash report | `fixedStepper.ts`, `seed.ts`, `sessionPlan.ts`, `crashReport.ts`, `framePacer.ts` |
| `src/pool/` | The asset pool, the Loadout, the Armory economy, Extraction cases | `pool.ts`, `kit.ts`, `loadoutModel.ts`, `armory.ts`, `collection.ts`, `caches.ts` |
| `src/stats/` | Match stats, local records, settling a finished match | `matchStats.ts`, `records.ts`, `settleMatch.ts` |
| `src/save/` | The save system: guarded storage, file format, migrations, tab lock | `saveFile.ts`, `stores.ts`, `guardedStorage.ts`, `saveManager.ts`, `tabLock.ts` |
| `src/settings/` | The saved settings object and the Dev settings' saved values | `storage.ts`, `dev.ts` |
| `src/tutorial/` | The tutorial tracker | `tutorial.ts` |
| `src/assets/` | Bundled fonts and the optional character model | `fonts/`, `models/characters/` |
| `pool.md`, `stats.md` | Hand-edited tables the game and its tests read: assets and economy, replica and part numbers | read by `pool/poolFile.ts`, `config/statsFile.ts` |
| `public/` | Static files: icon, manifest, menu stills (from `pipeline/map-stills.mjs`) | `menu/` |
| `pipeline/` | Gates, perf runs, light bakes, build cache, task records: the task pipeline's scripts | `README.md`, `gate.mjs`, `perf-run.mjs`, `records.mjs`, `bake-light.mjs` |
| `e2e/` | Playwright smoke tests on the `e2e` build; `release.spec.ts` on `dist/` | `boot.spec.ts`, `crash.spec.ts`, `release.spec.ts` |
| `docs/` | The plan, process, rulings, open issues, playtest guide, task records; history in `archive/` | `ROADMAP.md`, `PROCESS.md`, `DECISIONS.md`, `KNOWN_ISSUES.md`, `TASKS.md`, `records/` |
| `.claude/` | Pipeline agents and skill, session hooks, shared settings | `agents/`, `skills/pipeline/SKILL.md`, `hooks/` |

The root files in more detail:

- **`main.ts`** starts the save system first (a second tab waits behind a notice), then downloads and starts Rapier
  behind the loading bar, reads the URL flags, probes the GPU and builds `Game`. An error before the game runs shows the
  crash pane.
- **`Game`** (`game.ts`) is the composition root and main loop: the app that outlives matches (renderer, input, menus,
  debug overlay, audio engine) and New game's picks. No map is loaded on the title and New game screens.
- **`MatchSession`** (`matchSession.ts`) is one match on one map: the field's meshes and lighting, physics, nav, the
  simulation, the bots, and the combat and match presentation. `Game` builds it on Play and disposes it when the player
  leaves; Play Again builds a new one with its own seed (`matchFlow.ts` `matchSeed`). What Play does is the pure
  `core/sessionPlan.ts`. A decided match is recorded and paid once, the frame it is decided (`stats/settleMatch.ts`).
  Its `MatchSetup` carries New game's Match rules (`config/matchRules.ts`), a bot difficulty per team and the Rules
  picker's ruleset (`RULESETS`, laid over the match panel's picks by `playedPicks` in `newGamePicks.ts`).
- **`RangeSession`** (`rangeSession.ts`) is the practice range: the player alone on `map/range.ts`, no bots and no
  rounds, with the tutorial. Changing the loadout from its pause menu rebuilds the range where you stood.

## Map data

Maps are plain data (`map/mapTypes.ts`). One source builds both the Rapier colliders and the merged Three.js meshes
(one draw call per surface texture). `map/maps.ts` lists the maps; the dev maps' data is a chunk of its own
(`map/devMaps.ts`).

- **Blocks.** Axis-aligned boxes with a visual kind. A `ramp` is a wedge sloping up along its `rise`;
  `map/surfaces.ts` gives the walkable height of floors and ramps. Walkable surfaces may stack when body height is
  clear between them.
- **Ends.** Spawns and dead-zone spots per end of the map (0 west, 1 east) and bot lanes from end 0 to end 1.
  Teams do not own an end: `round.ts` (`teamEnd`, `placeTeams`) puts each team at an end at every round start and
  swaps them at half-time. In Attack / Defend the attackers start at end 0; in Elimination Blue starts at
  `RoundRules.eliminationFirstEnd` (the east on Depot). `Character.end` says where a character started, for its dead
  zone and its bot's lane direction.
- **Flag.** Optionally one flagpole at end 1. A map without one is Elimination only.
- **Extraction block.** Optional: insertions, exits, home-team starts, run time and base opponents; case spots (each
  names the kinds of case it suits); the home team's regen points and how far from the squad they must be; optionally
  `insertionBerth`, the metres the home team's bots keep from the insertion at the start (Woodland 30). Woodland's and
  Neon Heights' blocks are files of their own (`map/woodlandExtraction.ts`, `map/neonHeightsExtraction.ts`), placed on
  the layout through the shared helpers in `map/extractionBlock.ts`. `map/playableMode.ts` falls back to Elimination
  on a map without the data a mode needs.
- **Look-only data.** `signs`, `decor`, `dressing` and `bakedLight` are drawn but never read by physics, nav, cover or
  sight.
  - **`dressing`** (`MapDressing`) is a map's set dressing, in a file of its own per map (`map/depotDressing.ts`,
    `map/woodlandDressing.ts`, `map/neonHeightsDressing.ts`). `render/mapDressing.ts` turns it into a placement the
    same way every time from `dressing.seed`; `config/dressing.ts` holds the sizes, colours and what each part costs.
    The fields: `clutter` (dirt, junk and litter along block feet, `mix` picking the yard's or the street's kinds),
    `marks` (logos and wall sprays), `posters`, `puddles` (`mud` for a mud patch), `woods` (leaf litter and fallen
    branches, twigs and logs on terrain), `moss` (damp growth on hard cover's vertex colours), `neon` (tube-letter
    signs, a few on a gentle flicker channel), `steam`, `fireflies`, `skyline` (towers, treelines and hills beyond the
    field, with the lights they carry and their chimneys' smoke), `plane`, `strips` (lit panels), `motes` and
    `kickedDust` (the tint of the dust in the air and underfoot). Everything new is look
    only: no collider, no cover, no nav change and nowhere to hide (each map's `*Dressing.test.ts` proves it).
- **Coordinates.** Depot is written in plan coordinates (north = +z, as on the layout sketch) and turned into world
  coordinates (north = -z in three.js) in `map/depot.ts`.

## Contracts

The interfaces a task may not change unless its block in `docs/TASKS.md` says so (the critic's check 2 reads this
list; `pipeline/README.md`). A contract change is a plan step: the planning thread updates this list in the same pull
request. Each entry says where the contract lives, what it holds today and what pins it.

- **`PlayerCommand`** (`sim/commands.ts`). One command per character per tick, with absolute view angles; the only way
  input or bots drive the simulation. `toggleTorch` switches the weapon light in hand (`sim/torch.ts`).
  Pinned by `sim/simulation.test.ts`, `input/playerInput.test.ts`.
- **`GameState` and `state.events`** (`sim/state.ts`, `sim/events.ts`). Plain data with no Three.js or DOM. Events are
  the only channel to presentation and are cleared each tick. For Extraction:
  - `RoundState.run` holds the run (`sim/extraction.ts`): exits, respawns used, the exit count, its outcome, the
    squad's team (`RunState.squadTeam`), the cases, what the runner carries and the case being opened. The cases are
    placed and filled before the run starts by `pool/caches.ts rollRunCases` and carried in `ExtractionContext.cases`.
  - `PlayerCommand.use` (held) becomes `Character.using` for a character in play while the round is live.
  - `ExtractionContext.waves` counts the home team's waves (regen points, the interval, the cap and its late extra,
    and the world query the out-of-sight check casts through); `ExtractionContext.reserveAt` is where the reserve
    past the cap waits.
  - `ExtractionContext.sight` (optional: the world query and body) lets a case open only in the runner's line of
    sight; without it cases open by reach alone.
  - `Character.grace` counts down a squad member's insertion grace: BBs neither hit it nor are hit by it, and a BB it
    stops reports `bbImpact`, no hit.
  - Events: `respawned`, `exitCount`, `exitOpened` and `runWarning` report the run; `caseNoise` (bots hear it),
    `caseOpened` and `caseDropped` report the cases; `returned` reports an opponent back in a wave; `torch` reports a
    weapon light switched on or off.

  Pinned by `sim/simulation.test.ts`, `sim/extraction.test.ts`, `sim/extractionCases.test.ts`,
  `sim/extractionWaves.test.ts`, `sim/torch.test.ts`.
- **`stepSimulation(state, commands, ctx, dt)`** (`sim/simulation.ts`). The fixed 60 Hz step and the order of its
  phases (a parked out-of-play character goes straight to the elimination step); randomness only from `state.rng`.
  Pinned by the `sim/*.test.ts` files and the `ai/depotMatch*.test.ts` guards.
- **`WorldQuery` and `CharacterMover`** (`sim/armament.ts`, `sim/movement.ts`; implemented by
  `physics/physicsWorld.ts`). The ray and shape casts and the character controller the simulation sees; the
  simulation never calls Rapier. Pinned by `physics/physicsWorld.test.ts`.
- **`MatchSession.advance(dt)` / `draw(dt)` / `afterTick()`** (`matchSession.ts`). Simulation first, presentation
  after. `afterTick` (private, run after every tick) is where stats, the HUD and sound read the tick's events;
  `draw` also takes `boardHeld`. Pinned by the smoke test.
- **`QualitySettings`, `QUALITY`, `QualityChoice`, `resolveQuality`, `qualityChoiceOf`** (`config/render.ts`, which
  re-exports them from `config/renderQuality.ts`: import from `config/render.ts`).
  - `QualitySettings` lists the fields a preset or the Custom rows may set. Every preset sets every field; `QUALITY`
    is the preset table.
  - A `QualityChoice` is a preset (Low to Ultra; Ultra is never the automatic pick) or `'custom'`, which resolves to
    High overlaid with the saved rows.
  - `Renderer.setQuality` and `MatchSession.setQuality` apply a change at once, antialiasing included (on the node
    renderer an antialiasing change waits for the next load).
  - Fields are added, never renamed. A new field takes a value on every preset, a row in `config/graphics.ts` and a
    `graphics.<field>` store key, with no further contract change (`bakedLight` and `weathering` were added so).

  Pinned by `config/render.test.ts`, `config/graphics.test.ts`, `render/renderer.test.ts`.
- **The renderer back end** (WebGPU overhaul W1; `config/renderBackend.ts`, `render/rendererStart.ts`). Graphics ›
  Renderer picks Auto (the default), WebGPU or WebGL (owner, 2026-10-08: WebGPU is the default, behind no Dev
  setting). `Game.create` loads `render/rendererStart.ts` (a small chunk with the adapter probe, the pick's rules and
  texts and the Renderer row's builder) alongside the physics; the main chunk holds only the saved pick
  (`config/rendererPick.ts`) and the empty row. On Auto or WebGPU it asks for a WebGPU adapter; only when one is given
  (on Auto, a hardware one: a software adapter is slower than WebGL) does it load `render/webgpu/nodeBackend.ts` and
  `three/webgpu` by a dynamic import (their own chunks, never the main one) and draw with `WebGPURenderer` on node
  materials. No `navigator.gpu`, no adapter, or no device made is Three's `WebGLRenderer`,
  quietly: the same renderer and draws as before W1, which is what the container, CI and every gate here run. The
  WebGL pick never asks. `Renderer.backend` says what drew (`webgl`, `webgpu`, or `webgpu-webgl2` for the node
  renderer on its WebGL2 back end under `?forceWebGL`), and `Renderer.stats` gives the draw counts read the same on
  either. A pick applies from the next load. On the node path the world draws with node twins of its GLSL patches (W2,
  `render/webgpu/worldTwins.ts`): Three's node library asks for a twin by the material's program key before building
  its own, and each twin reads the very uniform objects and config tuning its patch gives WebGL, per drawn object
  (`twinUniforms.ts`), so the two can't drift; sized points draw as instanced sprites (`pointSprites.ts`) and the
  prefiltered sky is made by the node renderer. Since W3 the figures' per-vertex finish has its twin
  (`figureNodes.ts`), the held replica reflects the same prefiltered sky, and on a real WebGPU device the night is lit
  by clustered lights (`nightLights.ts`, built on three/webgpu's Forward+ `ClusteredLightsNode`, with spot lights
  added): every lamp and fire near the eye has a real light beside WebGL's fixed pool; WebGL and the node renderer's
  WebGL2 back end keep the fixed pool alone. Only the post stack and retro filter (W4) are not there
  yet. `pipeline/webgpu-compare.mjs` scores both paths' pictures of the same views (W3: figures, first person and a
  torch too, on both node back ends) against a pinned bar. A lost device (at boot or mid-match) is replaced by a new one, or by WebGL when none can be made:
  the post stack, retro filter and sheen come back, `Renderer.lostToWebGL` is set and the row says so until the next
  load. Pinned by `render/rendererStart.test.ts`, `render/rendererNode.test.ts`, `render/webgpu/nodeBackend.test.ts`,
  `render/webgpuFoundation.qa.test.ts`, `render/webgpu/worldTwins.test.ts`, `render/webgpu/figureTwins.test.ts`,
  `render/webgpu/nightLights.test.ts`, `e2e/webgpu.spec.ts`, `e2e/webgpuWorld.spec.ts`, `e2e/webgpuLights.spec.ts`.
- **The settings store keys** (`settings/storage.ts`, `settings/dev.ts`). Saved under `airsoft.*` and versioned
  (`SETTINGS_VERSION` 1). Renaming a key needs a migration: one `case` in `migrate` (the per-setting keys of the first
  builds are its "version 0"). An object from a newer version is never read or overwritten. Fields are only ever
  added, each read with a fallback, so version 1 stands: `quality` holds a `QualityChoice`; `graphics.<field>` holds a
  Custom row (an option id or a slider position); `frameRateCap` (Unlimited, 30, 60, 120, 144 or 240; an older number
  reads as the nearest) and `showFps` are the two Graphics rows outside the presets; `renderer` (`auto`, `webgpu` or
  `webgl`, W1) is the Renderer row. `browserStorage()` returns the
  save system's guarded storage once it has started (same keys, same values). Pinned by `settings/storage.test.ts`.
- **The save file format** (`save/saveFile.ts`). `{ game, format, build, savedAt, summary, stores, checksum }`, the
  stores as their own modules store them. A save from any earlier `format` loads (one `MIGRATIONS` step per format);
  a later one is refused. `SAVE_FORMAT` goes up with any store's version or a new store (`STORES_BY_FORMAT`). In every
  store module (the settings, the collection, the records) an object from a newer version is never read or
  overwritten (`save/overStored.ts` `storedIsNewer`). Pinned by `save/saveFile.test.ts`, `pool/pool.test.ts`,
  `stats/records.test.ts`.
- **`pool.md`'s format** (`pool/poolFile.ts`). The hand-edited asset register the game reads.
  - Power sources carry a Type, not a Power %; what they do is in `stats.md`.
  - Tokens and Shots holds a Pity table (`| Guarantee | Shots |`) and an "Unowned item weight" row.
  - Replicas have two optional columns, Tiers (the tiers an asset comes in) and Drop % (a chase item's own chance per
    Shot item), and the `built-in-power` tag for a replica whose power source is fixed.
  - Every asset table has an Access column, `public` or `dev`: blank reads as public, any other word leaves the row
    out.
  - A Caches table (`| Case | Key | Per run | Open s | Heard m | FC | BB resupply % | Part % | Parts from |`, read as
    `Pool.caseKinds`). The Key is what map data's case spots name. A missing or unreadable table falls back to the
    shipped rows.
  - A Supply events table (`| Supply event | Key | When | FC % | Part % |`, read as `Pool.supplyEvents` by
    `pool/supplyEvents.ts`). When is two weekdays or two dates; the first row that applies wins; `MatchSetup.supply`
    carries it into `rollRunCases`. No table means no events. FC % and Part % are 0 or 10 to 1000, and a missing column
    is reported once, at the header.
  - A Lights table: category `light`, slot `light`, Fits by tag like the other parts.
  - The Odds % never rise down the Rarity table, and a Difficulty multiplier is at least 0.1.
  - Every shipped ID is pinned to its asset in `pool/pool.test.ts` (IDs are save keys).

  Pinned by `pool/pool.test.ts`, `pool/caches.test.ts`.
- **`stats.md`'s format** (`config/statsFile.ts`). The hand-edited performance numbers the config modules lay over
  their built-in ones: replicas and parts by Key, power sources by pool ID, Barrels and Muzzle parts by Key, Lights by
  Key, Tier scaling and Site limits. Pinned by `config/stats.test.ts`.
- **Content tags** (`config/content.ts`). Every map, mode, difficulty and ruleset (`tag` on `MAPS`, `MATCH_MODES`,
  `DIFFICULTIES`, `RULESETS`) and every pooled asset (`Asset.tag`, from pool.md's Access) is `public` or `dev`; Match
  panel choices may carry one too (untagged is public). `isAvailable(tag, devContent)` is the one check. `devContent`
  is the Dev tab's Dev content switch (`dev.devContent`, applying only while Dev settings is ticked).
  - While it is off, dev content is shown nowhere (`contentPool`, `playedPicks`, `ChoiceCards` /
    `OptionPicker.setDevContent`) and never drops from Shots (`dispensable`).
  - A match using any of it stays out of the records and pays nothing (`matchStanding`, `NotCounted` 'devContent').
    `MatchSetup.devContentUsed` comes from `matchUsesDev`: the match's picks, the player's kit, or dev gear the
    opponents may roll.
  - The dev maps' data is a chunk of its own (`map/devMaps.ts`), fetched by `loadDevMaps` once Dev content is on (at
    start when it was left on). `MapEntry` carries no data; `mapData(id)` reads what is loaded (the default map's for
    a dev map not loaded yet). Dev content applies only once the dev maps are in (`Game.devInForce`), so a dev map is
    never listed or played without its data.
  - The unit tests register every map before each file (`src/testSetup.ts`).

  Pinned by `config/content.test.ts`, `pool/contentPool.test.ts`, `map/maps.test.ts`.
- **The map block format** (`map/mapTypes.ts`). What `navGrid`, `mapMeshes` and the physics read. `MapData` fields are
  only added, and optional, so every map stays valid. Today's optional fields:
  - `storeys`: the floor heights the minimap draws one at a time. `overlooks`: each watched area and the spots above
    that see it, for bots and the layout tests.
  - `extraction`, with its `cases`, `regens` and `regenDistance`.
  - `signs`: neon signs and lit windows, presentation only. A `MapSign` with `facing: '+y'` and `kind: 'paint'` is a
    flat ground marking.
  - `ground`: the ground's patches, one grid (`map/groundSurfaces.ts`) that the terrain is painted from and the
    footsteps read.
  - `MapLight.kind` (`fire` or `lantern`): the light's fixture.
  - `ambience`: the field's sound; absent means the yard. `MapBlock.surface` keeps its two block values.
  - `MapBlock.finish` and `paint`: look only. Six city prop kinds, each with a `BLOCK_MATERIALS` ricochet material,
    collide as their box.
  - `decor`: look-only blocks, drawn but never collided, walked, seen through or heard.
  - `bakedLight`: the name of the map's probe file; look only. Each file is pinned to its map by
    `map/bakes/bakes.test.ts`, which names the bake command when they differ.

  Pinned by `map/mapData.test.ts`, `nav/navGrid.test.ts`, `map/neonHeights.test.ts`, `map/extractionData.test.ts`,
  `render/depotLook.test.ts` (a map using none of the woodland look's fields, M33i, builds as before),
  `render/cityLook.test.ts` and `map/neonHeightsArt.test.ts` (Neon Heights' boxes, materials and floors).

## Working notes

Cross-cutting rules; folder-specific ones are in that folder's `README.md`.

- **Input.** Read fire and aim through the bindings, never the mouse. A toggled sprint pressed before forward waits
  for forward. A default key that moves goes in `MOVED_DEFAULTS` (`config/controls.ts`) so old saved bindings follow.
- **Loadout.** Read `Armament.handling` and `Armament.replicas`, never `LOADOUT` (that is what bots carry). Match code
  reads `MatchSession.rounds` / `.hits`, never `ROUNDS` / `HITS`. Team colours come from `teamCss(team)`, never
  hard-coded.
- **Menus.** One screen at a time (`Menus.go`). `Menus.setBlocked` makes them inert (graphics reset).
- **Tests.** Files share a worker's modules (`isolate: false`), so a test that stubs a global or resets modules
  undoes it when it ends: restore what you stub. `npm run t` runs the fast project (about 2 minutes, 2026-10-08); the gate and CI run
  fast and slow. The slow project holds the headless bot-match guards, which are seed-sensitive: re-measure over
  16 seeds before changing a threshold.
- **Checks.** `npm run check` (all tests, then the build) takes about 20 minutes in a 4-core container (2026-10-08). In a cloud container set `PLAYWRIGHT_CHROMIUM=/opt/pw-browsers/chromium`
  for the smoke test and the gate (the session-start hook does it). The smoke test also loses and restores the WebGL
  context, opens and closes the order wheel (Z) and presses F twice for the squad line. It patches
  `airsoft.session.match.afterTick` to add a shot after each tick (a sound cue); that patch exists in the `e2e` build
  only.
- **URL flags.** `?seed=N` replays a match (any match's seed, shown on the pause screen). `?quality=` picks a preset
  for the visit. `?perf` logs the match build's phases in the console. `?nolock` plays without the pointer lock, and
  `?script=perf` drives the scripted player for the perf harness, and `?forceWebGL` puts the node renderer (on Auto or
  WebGPU) on its WebGL2 back end, how it runs in a container without WebGPU (W1); these work on the dev server and the `e2e`
  build only, never in a release build.
- **Ending a match quickly in a scratch script.** Set `airsoft.state.round.score` to 4-4 and one team's characters'
  `status` to `'out'`.
- **Lockfile.** Re-lock with npm 11 (`npx -y npm@11 install`) so the lockfile keeps its `libc` fields; otherwise Linux
  installs both the glibc and musl binaries. CI's npm 10 installs either lockfile.
