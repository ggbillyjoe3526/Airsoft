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
| `src/` (root) | The app that outlives matches; one match or range session at a time | `main.ts`, `game.ts`, `playFlow.ts`, `session.ts`, `matchSession.ts`, `rangeSession.ts`, `matchFlow.ts`, `newGamePicks.ts` |
| `src/sim/` | Gameplay rules, pure, fixed 60 Hz | `simulation.ts`, `state.ts`, `commands.ts`, `armament.ts`, `ballistics.ts`, `round.ts` |
| `src/ai/` | Bots: senses, hearing, round plans, decisions, cover, squad orders, Extraction roles | `botController.ts`, `hearing.ts`, `roundPlanner.ts`, `botBrain.ts`, `bot.ts`, `perception.ts`, `cover.ts`, `squadOrders.ts` |
| `src/nav/` | The layered walkability grid, A* routes, walk-off fields, vault links | `navGrid.ts`, `vaultLinks.ts` |
| `src/physics/` | Rapier: level collision and the character mover | `physicsWorld.ts` |
| `src/map/` | Map data (blocks, spawns, lanes, flag, Extraction) and map helpers | `mapTypes.ts`, `maps.ts`, `depot.ts`, `woodland.ts`, `neonHeights.ts`, `range.ts` |
| `src/input/` | Keyboard, pointer lock, key bindings, order wheel; builds the player's command | `playerInput.ts`, `keyBindings.ts`, `keyboard.ts`, `pointerLock.ts` |
| `src/render/` | Three.js, by subfolder (DX6): `field/` (with `mapPieces/`), `dressing/`, `light/`, `figures/`, `replicas/`, `effects/`, `match/`, `post/`, `webgpu/` | `renderer.ts`, `match/matchPresentation.ts`, `match/combatPresentation.ts`, `field/mapMeshes.ts`, `figures/characterRenderer.ts`, `replicas/viewmodel.ts` |
| `src/audio/` | Web Audio: synthesised sounds, mix, 3D positioning, ambience | `audioEngine.ts`, `sfx.ts`, `dsp.ts`, `soundBank.ts`, `audioMix.ts` |
| `src/ui/` | DOM HUD, overlays and settings tabs; the menus in `ui/menus/` | `hud.ts`, `scoreboard.ts`, `minimap.ts`, `debugOverlay.ts`, `menus/menus.ts` |
| `src/config/` | Every tunable number and data table | `replicas.ts`, `bots.ts`, `hits.ts`, `render.ts`, `controls.ts`, `dev.ts` |
| `src/core/` | Loop and session plumbing: stepper, seeds, frame pacer, crash and bug reports | `fixedStepper.ts`, `seed.ts`, `sessionPlan.ts`, `crashReport.ts`, `framePacer.ts` |
| `src/pool/` | The asset pool, the Loadout, bot kits, Extraction cases | `pool.ts`, `item.ts`, `kit.ts`, `loadoutModel.ts`, `botKit.ts`, `caches.ts` |
| `src/progress/` | Levels, XP and the player's unlocks; the Armory's level track | `levels.ts`, `gameLevels.ts`, `xp.ts`, `progress.ts`, `track.ts` |
| `src/content/` | The content checks: rules, compatibility, spec test and balance run for a new replica, part, map, mode or skin | `gameContent.ts`, `replicaChecks.ts`, `partChecks.ts`, `mapChecks.ts`, `modeChecks.ts`, `skinChecks.ts`, `specSheet.ts`, `report/` |
| `src/stats/` | Match stats, local records, settling a finished match | `matchStats.ts`, `records.ts`, `settleMatch.ts` |
| `src/save/` | The save system: guarded storage, file format, migrations, tab lock | `saveFile.ts`, `stores.ts`, `guardedStorage.ts`, `saveManager.ts`, `tabLock.ts` |
| `src/settings/` | The saved settings object, the typed loaders of every setting, the HUD and accessibility preferences, the Dev settings' saved values | `storage.ts`, `savedChoices.ts`, `hudPrefs.ts`, `dev.ts` |
| `src/tutorial/` | The tutorial tracker | `tutorial.ts` |
| `src/assets/` | Bundled fonts and the optional character model | `fonts/`, `models/characters/` |
| `data/` | Hand-edited tables the game and its tests read (DX7): `pool.md` (assets and Extraction's cases), `stats.md` (replica and part numbers), `levels.md` (levels and XP), `bots.md` (bot names and personalities), `bot-kits.md` (the bots' kits), `callouts.md` (the bots' callouts). A row the game can't read is left out and listed in the console and in Settings › Dev › Data tables (`config/dataTables.ts`) | read by `pool/poolFile.ts`, `config/statsFile.ts`, `progress/levels.ts`, `config/botsFile.ts`, `pool/botKit.ts`, `config/calloutsFile.ts` |
| `public/` | Static files: icon, manifest, menu stills (from `pipeline/map-stills.mjs`) | `menu/` |
| `pipeline/` | Gates, perf runs, light bakes, build cache, task records, the content check: the task pipeline's scripts | `README.md`, `gate.mjs`, `perf-run.mjs`, `records.mjs`, `content-check.mjs` |
| `e2e/` | Playwright smoke tests on the `e2e` build; `release.spec.ts` on `dist/` | `boot.spec.ts`, `crash.spec.ts`, `release.spec.ts` |
| `docs/` | The plan, process, rulings, open issues, playtest guide, task records, content rulebooks (`content/`); history in `archive/` | `ROADMAP.md`, `PROCESS.md`, `DECISIONS.md`, `KNOWN_ISSUES.md`, `TASKS.md`, `records/` |
| `.claude/` | Pipeline agents, the pipeline and new-content skills, session hooks, shared settings | `agents/`, `skills/pipeline/SKILL.md`, `skills/new-content/SKILL.md`, `hooks/` |

The root files in more detail:

- **`main.ts`** imports `consoleLog.ts` before anything else (the console's errors and warnings kept for the reports,
  IM7), starts the save system (a second tab waits behind a notice), then downloads and starts Rapier behind the
  loading bar, reads the URL flags, probes the GPU and builds `Game`. An error before the game runs shows the crash
  pane.
- **`Game`** (`game.ts`) is the composition root and main loop: the app that outlives matches (renderer, input, menus,
  debug overlay, audio engine), its lifecycle (start, dispose, the crash pane) and the wiring of the parts below. No map
  is loaded on the title and New game screens. Split out of it (DX8, audit A1):
  - **`PlayFlow`** (`playFlow.ts`): play, enter, resume, pause, stop and leave. Play asks for the mouse lock, then builds
    or reuses a session (`core/sessionPlan.ts`); the lock taken resumes, dropped it pauses, or skips the round once you
    are out (`core/escSkip.ts`), or holds while the Fullscreen key's change takes it again (`ui/fullscreenPlay.ts`, IN1);
    also the range's pause-menu buttons and the graphics context's loss. It holds the
    session loaded (`Game.session` reads it for the console and the browser tests).
  - **`PlaySetup`** (`playSetup.ts`): what the next Play builds from: New game's picks as they play, Practice's place,
    each map's Day or Night, the Look settings, the Loadout and the level progress, and the flags saying they changed
    since the session was built.
  - **`PlayResults`** (`playResults.ts`): a decided match's records, XP and adaptive line, settled the frame it is decided
    and shown on its result screen, and the range's timed challenge best.
  - **`GameDev`** (`gameDev.ts`): the Dev settings in force, the Retro look and Settings › Dev's buttons.
- **`MatchSession`** (`matchSession.ts`) is one match on one map: the field's meshes and lighting, physics, nav, the
  simulation, the bots, and the combat and match presentation. The play flow builds it on Play and disposes it when the
  player leaves; Play Again builds a new one with its own seed (`matchFlow.ts` `matchSeed`). What Play does is the pure
  `core/sessionPlan.ts`. A decided match is recorded and its XP given once, the frame it is decided
  (`stats/settleMatch.ts`). Skip to next round (M83) runs the same per-tick body as watched play flat out over a few
  frames, showing only the round's end and the next start (`matchFlow.ts` `skipOffer`, `skipTickCap`; `config/sim.ts`
  `SKIP_ROUND`). Your side of a magazine hand-off (MG1: the Mag key and the wheel's Mag item, the toss it puts in
  your command, the HUD's line) is `magHandoff.ts`'s `MagHandoff`.
  Its `MatchSetup` carries New game's Match rules (`config/matchRules.ts`), a bot difficulty per team and the Rules
  picker's ruleset (`RULESETS`, laid over the match panel's picks by `playedPicks` in `newGamePicks.ts`). With the Dev
  tab's Adaptive difficulty on (AD1) it also carries the other team's starting rating (`adaptivePicks.ts`): the session
  drifts it a little after each round (`ai/adaptiveRun.ts`), and the results (`playResults.ts`) save the next match's
  when the match is decided.
- **`RangeSession`** (`rangeSession.ts`) is Practice: the player alone, no bots and no rounds, on `map/range.ts` (with
  the tutorial) or on any map (M94), whose targets stand where the other team's bots would play
  (`map/practiceSpots.ts`, kinds by `map/practiceLayout.ts`). Changing the loadout from its pause menu, or from the
  Loadout key in play (M95), rebuilds it where you stood, the same slot in your hands (`RangePose`).
- **`Session`** (`session.ts`, DX5) is what `Game` asks of either session (advance, draw, pause, quality, Dev
  settings, the result's timing, dispose); `kind` (`'match'` or `'range'`) tells them apart where only one has the
  answer. Both read the HUD and accessibility preferences (`settings/hudPrefs.ts` `HudPrefs`) by reference and show a
  change as play runs again (their `syncPrefs`, on `setPlaying(true)` and each frame drawn), so `Game` forwards none.
- **`gameReport.ts`** (DX5) is the debug overlay's lines and the crash and diagnostics reports (`diagnosticsText`, DX8),
  read off the game through `GameReadout` (`Game.readout`) only when asked.

## Map data

Maps are plain data (`map/mapTypes.ts`). One source builds both the Rapier colliders and the merged Three.js meshes
(one draw call per surface texture). `map/maps.ts` lists the maps; the dev maps' data is a chunk of its own
(`map/devMaps.ts`).

- **Blocks.** Axis-aligned boxes with a visual kind. A `ramp` is a wedge sloping up along its `rise`;
  `map/surfaces.ts` gives the walkable height of floors and ramps. Walkable surfaces may stack when body height is
  clear between them.
- **Ends.** Spawns and dead-zone spots per end of the map (0 west, 1 east) and bot lanes from end 0 to end 1.
  Teams do not own an end: `round.ts` (`teamEnd`, `placeTeams`) puts each team at an end at every round start and
  swaps them at half-time. In Attack / Defend the attackers start at end 0; in Elimination Alpha starts at
  `RoundRules.eliminationFirstEnd` (the east on Depot). The player is character 0 on the picked team, Alpha or Beta
  (M98, `sim/roster.ts`): nothing reads team 0 as "yours". `Character.end` says where a character started, for its dead
  zone and its bot's lane direction.
- **Flag.** Optionally one flagpole at end 1. A map without one is Elimination only.
- **Overtime flag.** Optionally `overtimeFlag`, Elimination's overtime flag spot near the middle (OT1): each end walks
  there about equally fast (the content check `map.overtimeFlag`). A map without one plays a time-out as before.
- **Extraction block.** Optional: insertions, exits, home-team starts, run time and base opponents; case spots (each
  names the kinds of case it suits); the home team's regen points and how far from the squad they must be; optionally
  `insertionBerth`, the metres the home team's bots keep from the insertion at the start (Woodland 30). Woodland's and
  Neon Heights' blocks are files of their own (`map/woodlandExtraction.ts`, `map/neonHeightsExtraction.ts`), placed on
  the layout through the shared helpers in `map/extractionBlock.ts`. `map/playableMode.ts` falls back to Elimination
  on a map without the data a mode needs (`config/modes.ts` `MODE_SHAPES` says what each mode needs). Every place that
  answers for a mode is a `switch` ending in `unknownMode` (a never-check), so a new mode does not build until each
  answers (the content toolkit's mode checks, `content/modeChecks.ts`).
- **Look-only data.** `signs`, `decor`, `dressing` and `bakedLight` are drawn but never read by physics, nav, cover or
  sight.
  - **`dressing`** (`MapDressing`) is a map's set dressing, in a file of its own per map (`map/depotDressing.ts`,
    `map/woodlandDressing.ts`, `map/neonHeightsDressing.ts`). `render/dressing/mapDressing.ts` turns it into a placement the
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

### PlayerCommand

- **`PlayerCommand`** (`sim/commands.ts`). One command per character per tick, with absolute view angles; the only way
  input or bots drive the simulation. `toggleTorch` switches the weapon light in hand (`sim/torch.ts`); `holster` puts
  the replica in hand away, and a slot in `switchTo`, a fresh trigger pull, aim press or reload draws it again (M92,
  `sim/armament.ts`). `tossMag` names a teammate (a character id, -1 none) to toss a magazine to (MG1,
  `sim/magShare.ts`): the bots set it when they bring one, MatchSession when your Mag key tosses one, never the keys
  straight.
  Pinned by `sim/simulation.test.ts`, `input/playerInput.test.ts`, `sim/magShare.test.ts`.
### GameState and its events

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
  - Every body stops BBs (M85): a BB that reaches someone already hit, a teammate with friendly fire off, or anyone in
    the cease-fire after a round is decided stops there and reports `bbImpact`, no hit; only a Ghost lets BBs through.
    `Character.walkCycle` (and `prevWalkCycle`) is the legs' walk cycle, which the hit volume and the drawn legs share.
  - Events: `respawned`, `exitCount`, `exitOpened` and `runWarning` report the run; `caseNoise` (bots hear it),
    `caseOpened` and `caseDropped` report the cases; `returned` reports an opponent back in a wave; `torch` reports a
    weapon light switched on or off.
  - `Character.vault` holds a vault over a low obstacle (`sim/vault.ts`, M102): its plan and how far through it is,
    whether a Jump press would vault now (`ready`, the tick's answer the vault prompt reads, DX6), and the one-shot
    presses made during it (`held`, BP5: reload, slot, holster, fire selector, torch, magazine, hop-up), kept for the
    first command after it. A `footstep` of kind `vault` reports one starting (the loudest step: bots hear it
    from `footstepHearingVault`).
  - `GameState.magTosses` holds the magazines in the air (MG1, `sim/magShare.ts`; MAG_SHARE.maxTosses slots, made
    once): who threw it to whom, the catcher's loadout slot, its BBs, the replica it came from, its age and flight and
    where it left the hand. `magToss` reports one leaving a hand (its BBs already out of the thrower's spare),
    `magCaught` one landing (with the BBs that went into the catcher's spares) and `magLost` one lost (the catcher out
    of play, or the round decided while it flew). No BB is ever made.
  - `BB.leaf` counts the metres of bush a BB has pushed through (FO1, `sim/bbs.ts`, `sim/leaves.ts`; 0 at spawn).
    At `BALLISTICS.leaves.stopDepth` it stops there and reports `bbImpact` with `leaves: true`; one that comes out of
    a bush having crossed less is thrown off and slowed and reports `bbLeaves` (presentation's rustle and leaves).
    Bushes come from `WorldQuery.foliage`; a world without it flies BBs as before.
  - `bbImpact.from` and `bbLeaves.from` (optional, KI2) say where a bounced BB's path began that tick; presentation's
    grit and leaves fly back towards it. Before a bounce they are unset and the shooter's side stands in.
  - `GameState.propQuiet` is, per noisy prop (`WorldQuery.noisyProps`, by index), the time until which it makes no
    noise (NP1, `sim/propNoise.ts`; grown once to one slot per prop). `propNoise` reports a noisy prop sounding: run
    into (`shot: false`, from its face; bots hear it to the prop's `bumped` range, from the one who hit it) or rung by a
    BB landing hard on steel (`shot: true`, where the BB stopped; heard only by idle bots, to its `shot` range).
    `footstep.surface` (optional) is the ground a run, sprint or landing came down on (`WorldQuery.surfaceUnder`), which
    the bots, the audio and the sound cues read for how far it carries (`NOISE.ground`).
  - `RoundState.overtimeFlag` is Elimination's overtime flag (OT1, `sim/overtimeFlag.ts`): whether it is up, its foot,
    its seconds left and whether both teams are at it (`contested`). It goes up when an Elimination clock runs out with
    the time-out rule giving nobody the round, on a map with `SimServices.overtimeFlag` (`RoundContext.overtimeFlag`),
    and stays up through the pause after the round. `overtime` reports it going up (where); a team touching it first
    ends the round with `RoundEndReason` `overtimeFlag`; untouched, its time out ends it as `time`. `RoundRules.overtime`
    holds its time and reach (`OVERTIME`); `runOutRound` (Dev settings › End the round now) runs it out too.

  Pinned by `sim/simulation.test.ts`, `sim/overtimeFlag.test.ts`, `sim/extraction.test.ts`, `sim/extractionCases.test.ts`,
  `sim/extractionWaves.test.ts`, `sim/torch.test.ts`, `sim/vault.test.ts`,
  `sim/magShare.test.ts`, `sim/bbsLeaves.test.ts`, `sim/propNoise.test.ts`, `sim/propNoisePhysics.test.ts`.
### stepSimulation

- **`stepSimulation(state, commands, ctx, dt)`** (`sim/simulation.ts`). The fixed 60 Hz step and the order of its
  phases (a parked out-of-play character goes straight to the elimination step); randomness only from `state.rng`.
  Per character: aim, move, walk cycle, lean, accuracy, the vault answer (`stepVaultReady`, DX6), then footsteps, replicas, the torch and a magazine toss
  (MG1, while the round is live); then BBs, the magazines in the air (they land or are lost) and the round. A character
  in play whose move ran hard into a noisy prop knocks it right after the move (`stepPropBump`, NP1; not during a
  vault), and a BB stopped on a ringing prop rings it in the BB step (`ringProp`, through `stepBBs`' `noise` context,
  `SimContext.propNoise`). A Jump
  press at a low obstacle starts a vault before the aim (`tryVault`, M102), and a vault in progress steps in place of
  the move (`stepVault`, through the same `CharacterMover`). While vaulting a character follows the view of its
  command, with the trigger and aim as the vault found them (`vaultingCommand`, BP5: one held through it is no new
  pull after it); presses made meanwhile play into its first command after the vault (`withVaultPresses`), and a
  walk-off route is planned only once it is down. Pinned by the `sim/*.test.ts` files (`sim/vaultPresses.test.ts`)
  and the `ai/depotMatch*.test.ts` guards.
### WorldQuery and CharacterMover

- **`WorldQuery` and `CharacterMover`** (`sim/armament.ts`, `sim/movement.ts`; implemented by
  `physics/physicsWorld.ts`). The ray and shape casts and the character controller the simulation sees; the
  simulation never calls Rapier. `WorldQuery.foliage` (optional, FO1) is the map's bushes, read by the BBs and by the
  bots' check for leaves in their line of fire. `WorldQuery.noisyProps` (optional, NP1) lists the map's noisy props
  (`sim/propNoise.ts noisyPropsOf`, from `NOISE.props`), and `WorldQuery.surfaceUnder` (optional, NP1) names the ground
  under a pair of feet (`map/underfoot.ts`, the same answer the audio plays); a world without them makes no prop noise
  and steps carry as on concrete. Pinned by `physics/physicsWorld.test.ts`, `physics/levelRay.rapier.test.ts`.
### MatchSession advance, draw and afterTick

- **`MatchSession.advance(dt)` / `draw(dt)` / `afterTick()`** (`matchSession.ts`). Simulation first, presentation
  after. `afterTick` (private, run after every tick) is where stats, the HUD and sound read the tick's events;
  `draw` also takes `boardHeld`. Pinned by the smoke test.
### Quality settings

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
  - A field whose effect the game no longer draws is taken out with its row; its saved `graphics.<field>` key is left
    unread and never used again (`bbGlow`, PT1: the owner took the BB halo away in his Dev 5 playtest).

  Pinned by `config/render.test.ts`, `config/graphics.test.ts`, `render/renderer.test.ts`.
### The renderer back end

- **The renderer back end** (WebGPU overhaul W1, one renderer since W6a; `config/renderBackend.ts`,
  `render/rendererStart.ts`). Graphics › Renderer picks Auto (the default), WebGPU or WebGL (owner, 2026-10-08: WebGPU
  is the default, behind no Dev setting). `Game.create` loads `render/rendererStart.ts` (a small chunk with the adapter
  probe, the pick's rules and texts and the Renderer row's builder), `render/webgpu/nodeBackend.ts` and `three/webgpu`
  (their own chunks, never the main one) alongside the physics; the main chunk holds only the saved pick
  (`config/rendererPick.ts`) and the empty row. The game draws with `WebGPURenderer` on node materials, always: on
  Auto or WebGPU on a WebGPU device when the browser gives an adapter (on Auto, a hardware one: a software adapter is
  slower than WebGL2) and a device, and on its WebGL2 back end otherwise (no `navigator.gpu`, no adapter, no device;
  quietly) and on the WebGL pick, which never asks. The container, CI and every gate here draw on WebGL2 unless a run
  asks for WebGPU. Three's `WebGLRenderer` path, its GLSL post passes and retro filter went in W6a; when neither back end
  starts, the boot fails with the reason. `Renderer.backend` says what drew (`webgpu` or `webgl`, the WebGL2 back end;
  `?forceWebGL` asks for it in the e2e build), and `Renderer.stats` gives the draw counts read the same on either. A
  pick applies from the next load. Each world material that draws more than Three's own carries a node patch (W6b, `render/nodePatch.ts`;
  they were GLSL patches the node renderer translated until then): what it draws and the uniform objects it reads,
  set where the material is made. Three's node library asks the patch for its node material before building its own
  (`render/webgpu/worldTwins.ts`), and that material reads the patch's uniforms per drawn object (`twinUniforms.ts`); sized points draw as instanced sprites (`pointSprites.ts`) and the
  prefiltered sky is made by the node renderer. Since W3 the figures' per-vertex finish has its twin
  (`figureNodes.ts`), the held replica reflects the same prefiltered sky, and on a real WebGPU device the night is lit
  by clustered lights (`nightLights.ts`, built on three/webgpu's Forward+ `ClusteredLightsNode`, with spot lights
  added): every lamp and fire near the eye has a real light beside the fixed pool; the WebGL2 back end keeps the fixed
  pool alone. Where a browser's WebGPU differs from what Three expects (Chromium 141's
  swizzle member and its 3D-texture layer writes), `webgpuCompat.ts` tests the device and fits it. Since W4 every preset's post stack and the
  retro filter draw as node passes (`render/webgpu/post/`), with the draws, targets and uniforms the WebGL path's had
  (recorded from it before W6a deleted it: `render/webgpu/post/webglReference.ts`). `pipeline/webgpu-compare.mjs`
  scores the node renderer's pictures of fixed views against the WebGL path's, drawn by the e2e build of its last commit
  (W3: figures, first person and a torch too, on both back ends; W4: each preset's post views and the retro filter)
  against a pinned bar. A lost device (at boot or mid-match) is replaced by a new one, or by the WebGL2 back end when
  no WebGPU device can be made: the post stack, retro filter and sheen come back, `Renderer.lostToWebGL` is set and the
  row says so until the next load. Pinned by `render/rendererStart.test.ts`, `render/rendererNode.test.ts`, `render/webgpu/nodeBackend.test.ts`,
  `render/webgpuFoundation.qa.test.ts`, `render/webgpu/worldTwins.test.ts`, `render/webgpu/figureTwins.test.ts`,
  `render/webgpu/nightLights.test.ts`, `e2e/webgpu.spec.ts`, `e2e/webgpuDevice.spec.ts`, `e2e/webgpuWorld.spec.ts`,
  `e2e/webgpuLights.spec.ts`.
### The settings store keys

- **The settings store keys** (`settings/storage.ts`, `settings/dev.ts`). Saved under `airsoft.*` and versioned
  (`SETTINGS_VERSION` 1). Renaming a key needs a migration: one `case` in `migrate` (the per-setting keys of the first
  builds are its "version 0"). An object from a newer version is never read or overwritten. Fields are only ever
  added, each read with a fallback, so version 1 stands (a Custom row taken away leaves its key unread, as
  `graphics.bbGlow` since PT1): `quality` holds a `QualityChoice`; `graphics.<field>` holds a
  Custom row (an option id or a slider position); `frameRateCap` (Unlimited, 30, 60, 120, 144 or 240; an older number
  reads as the nearest) and `showFps` are the two Graphics rows outside the presets; `renderer` (`auto`, `webgpu` or
  `webgl`, W1) is the Renderer row; `callouts`, `pingMarkers`, `magPrompts` and `ammoCounter` (CL1, PG1, MG1, AC1) are `on` or `off`.
  `browserStorage()` returns the save system's guarded storage once it has started (same keys, same values). Pinned by `settings/storage.test.ts`.
### The save file format

- **The save file format** (`save/saveFile.ts`). `{ game, format, build, savedAt, summary, stores, checksum }`, the
  stores as their own modules store them. A save from any earlier `format` loads (one `MIGRATIONS` step per format);
  a later one is refused. `SAVE_FORMAT` goes up with any store's version or a new store (`STORES_BY_FORMAT`). Format 3
  holds the settings, key bindings, records, progress and saved loadouts (format 2 added the saved loadouts, SL1); a
  format 1 or 2 save (which held the old Armory's collection) loads at level 0, its collection dropped (owner,
  2026-10-13). `SaveSummary` is `{ level, xp, unlocked, matches }`. In
  every store module (the settings, the progress, the records) an object from a newer version is never read or
  overwritten (`save/overStored.ts` `storedIsNewer`). Pinned by `save/saveFile.test.ts`, `pool/pool.test.ts`,
  `stats/records.test.ts`.
### The progress store

- **The progress store** (`progress/progress.ts`). `Progress { xp, unlocked, rev }` under `airsoft.progress`
  (`PROGRESS_VERSION` 1). `unlocked` lists pool asset ids and is only ever added to, never worked out again from the
  level: an item `levels.md` moves up stays with whoever has it, and one it moves down reaches everyone past that level
  on the next load (`grantReached`). `rev` lets `syncProgress` and `saveProgress` keep another tab's newer save. Ids
  `pool.md` no longer has stay in the save but are never offered. Pinned by `progress/progress.test.ts`.
### The levels.md format

- **`levels.md`'s format** (`progress/levels.ts`). The hand-edited level plan the game reads against the pool
  (`loadLevels`, never throws).
  - A Levels table (`| Level | XP | Unlocks |`): levels from 0 with no gaps, the last row the cap. XP is what a level
    takes on top of the one before (level 0 none). Unlocks names items by pool.md Name, comma separated; every pooled
    item is in exactly one row.
  - An XP table (`| Event | XP |`: Match played, Match won, Round won, Hit on an opponent) and a Difficulty multiplier
    table (at least 0.1). A missing number falls back to `DEFAULT_XP`.
  - The first unreadable Levels row ends the table there (no readable level 0 unlocks everything); an unknown name is
    left out of its row alone. Each problem is listed with its line.
  - What a match gives is `progress/xp.ts` `matchXp`: no XP for the practice range, the tutorial, or a match with dev
    content or Dev settings that change play (`stats/settleMatch.ts` `matchStanding`, `NoXp`).

  Pinned by `progress/levels.test.ts`, `progress/xp.test.ts`, `stats/settleMatch.test.ts`.
### The pool.md format

- **`pool.md`'s format** (`pool/poolFile.ts`). The hand-edited asset register the game reads.
  - Power sources carry a Type, not a Power %; what they do is in `stats.md`.
  - An item is its asset id alone (`pool/item.ts` `ItemRef { asset }`); `parseItemKey` reads a legacy `ID@tier` key
    and drops the tier. Which level unlocks an item is in `levels.md`, not here.
  - Replicas may carry the `built-in-power` tag for a replica whose power source is fixed.
  - Every asset table has an Access column, `public` or `dev`: blank reads as public, any other word leaves the row
    out.
  - A Caches table (`| Case | Key | Per run | Open s | Heard m | XP | BB resupply % |`, read as `Pool.caseKinds`). A
    case holds XP (a range) or a BB resupply, never parts (`CaseFind { xp, resupply }`). The Key is what map data's
    case spots name. A missing or unreadable table falls back to the shipped rows.
  - A Lights table: category `light`, slot `light`, Fits by tag like the other parts.
  - Every shipped ID is pinned to its asset in `pool/pool.test.ts` (IDs are save keys).

  Pinned by `pool/pool.test.ts`, `pool/caches.test.ts`.
### The bot-kits.md format

- **`bot-kits.md`'s format** (`pool/botKit.ts` `readBotKits`, BG1). The hand-edited kits the other team's bots carry:
  one table, `| Kit | Primary | Primary parts | Secondary | Secondary parts | Easy | Normal | Hard | Pro |`. Replicas
  and parts by pool.md Name or ID, parts comma-separated, one per slot and fitting their replica; a weapon torch is
  never listed (fitted by rule at night). An optional Suits column names the bot personalities that lean to a kit
  (`kitWeights`: × `BOT_KIT_SUIT_LEAN` against the other kits with Suits, which keep their total; a kit without Suits
  keeps its weight; 0 stays 0). A weight per difficulty column (by `DIFFICULTIES` label), 0 or more,
  empty 0. A row it can't read is left out with its line in `errors`; a missing column reads nothing. Each opponent
  picks with `pickBotKit` (seed `botKitSeed(match seed, id)`, its personality) from a `contentPool`; teammates and the factory kit rule carry
  `LOADOUT`; nothing of the player's collection or loadout enters. Pinned by `pool/botKitTable.test.ts`,
  `pool/botKit.test.ts`.
### The stats.md format

- **`stats.md`'s format** (`config/statsFile.ts`). The hand-edited performance numbers the config modules lay over
  their built-in ones: replicas and parts by Key, power sources by pool ID, Barrels and Muzzle parts by Key, Lights by
  Key, and Site limits, one row per item. Pinned by `config/stats.test.ts`.
### The bots.md format

- **`bots.md`'s format** (`config/botsFile.ts`, BN1). The bots' names and personalities, found by their `##` headings:
  Roster (Name, Personality: a made-up name of at most 12 letters, spaces, hyphens or apostrophes, unique, always
  playing that personality), Personalities (Personality, Card note with `{name}`), How they move (scales × of the
  level's BotSkill numbers, Flank chance + , Watch where you ducked a range or –) and Habits (yes, no or –; Holds until
  seconds left or –; Watches the flag first, seconds or –, an optional column, OT1). A cell it can't read plays neutral and is reported
  with its line; it never throws. A personality changes how a bot plays, never its senses, reaction, turning or aim
  (`ai/personality.ts personalSkill`). Pinned by `config/botsFile.test.ts`.
### The callouts.md format

- **`callouts.md`'s format** (`config/calloutsFile.ts`, CL1). What the bots call and how often, found by their `##`
  headings: When they call (Event, Chance 0 to 1, Team gap (s); the row order is the urgency), Pace (four named
  seconds), Marks (Rule, Value: the chance a Contact call marks its enemy and the team's seconds between marks, PG1),
  Personalities (Talks (×), one row per bots.md personality; never lowers the ping answers, Going to your ping and
  Watching your ping, nor a magazine's ask and answer, Need a mag and Mag coming, MG1) and Lines (Event, Who: Any or a
  personality, Line with `{area}`, `{count}` or `{left}` where the event fills them; OT1 added the Overtime event). An event without a row is never called; a line it can't read is left out and reported with its
  line; it never throws. The callouts read the bots and the state and never write either (`ai/callouts.ts`); a mark
  is presentation only, on its own random stream. Pinned by `config/calloutsFile.test.ts`, `ai/callouts.test.ts`.
### Content tags

- **Content tags** (`config/content.ts`). Every map, mode, difficulty and ruleset (`tag` on `MAPS`, `MATCH_MODES`,
  `DIFFICULTIES`, `RULESETS`) and every pooled asset (`Asset.tag`, from pool.md's Access) is `public` or `dev`; Match
  panel choices may carry one too (untagged is public). `isAvailable(tag, devContent)` is the one check. `devContent`
  is the Dev tab's Dev content switch (`dev.devContent`, applying only while Dev settings is ticked).
  - While it is off, dev content is shown nowhere (`contentPool`, `playedPicks`, `ChoiceCards` /
    `OptionPicker.setDevContent`).
  - A match using any of it stays out of the records and gives no XP (`matchStanding`, `NoXp` 'devContent').
    `MatchSetup.devContentUsed` comes from `matchUsesDev`: the match's picks, the player's kit, or dev gear a kit in
    bot-kits.md the difficulty weights may bring (`kitsMayHoldDev`).
  - The dev maps' data is a chunk of its own (`map/devMaps.ts`), fetched by `loadDevMaps` once Dev content is on (at
    start when it was left on). `MapEntry` carries no data; `mapData(id)` reads what is loaded (the default map's for
    a dev map not loaded yet). Dev content applies only once the dev maps are in (`gameDev.ts` `devInForce`), so a dev
    map is never listed or played without its data.
  - The unit tests register every map before each file (`src/testSetup.ts`).

  Pinned by `config/content.test.ts`, `pool/contentPool.test.ts`, `map/maps.test.ts`.
### The map block format

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
  - `keepClear`: boxes no decal or wall mark is placed over; the range keeps its distance boards clear with them
    (`map/rangeDressing.ts`, M81).
  - `areas` (CL1): named places for the bots' callouts and the minimap's label, each a world box and optionally a
    floor band; the first that holds a spot names it (`map/areas.ts`). The content check `map.areas` fails a walkable
    spot outside every one.
  - `overtimeFlag` (OT1): Elimination's overtime flag spot (see Map data › Overtime flag).

  Pinned by the content toolkit's map checks on every map (`content/mapChecks.test.ts`), `nav/navGrid.test.ts`, `map/neonHeights.test.ts`, `map/extractionData.test.ts`,
  `render/field/depotLook.test.ts` (a map using none of the woodland look's fields, M33i, builds as before),
  `render/field/cityLook.test.ts` and `map/neonHeightsArt.test.ts` (Neon Heights' boxes, materials and floors).

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
