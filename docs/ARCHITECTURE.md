# Architecture

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

- **sim/**: all gameplay rules. Plain data (`GameState`, `Character`, the BB pool), no Three.js, no DOM, no `Math.random`.
  Each tick: move characters, handle replicas (`armament.ts`: fire, switch, reload by magazine swap; spawns BBs), then fly BBs
  (`ballistics.ts` flight model, M30: gravity, drag by Reynolds number and Magnus lift from the hop-up's decaying backspin, all against the airflow, one midpoint step a tick; `air.ts` the air's density, viscosity and drag table; `wind.ts` the match's breeze from its seed, into `GameState.wind` each tick; replicas are rated in joules and BB weight, `bbs.ts` collision with the level via the `WorldQuery` ray cast and with
  characters via `hitbox.ts` capsules; `ricochet.ts` bounces a BB off a hard surface, using the normal and material
  `WorldQuery.raycastSurface` reports, and a ricochet only knocks someone out if `HitConfig.ricochetsCount`), then match flow (`round.ts`: the match mode, round clock, wipe-out or time-out, score, first to
`winsNeeded`, `restartMatch(mode)`; in Attack / Defend also who attacks (swapping at half-time) and the pole, stepped by
`flag.ts`: attackers in play at the pole raise the flag, defenders pull it down, both hold it still; a raised flag
ends the round). A hit character is eliminated
  (`elimination.ts`: alive → calling → walkingOff → out) and from then on follows a built-in command instead of its
  controller's, can't fire and can't be hit. Anything presentation needs
  to react to is pushed to `state.events` (shots, impacts, reloads), cleared every tick.
  Advances only via `stepSimulation(state, commands, ctx, dt)`. Randomness comes from the seedable `state.rng`.
- **Commands**: every character (the player and the bots) is driven by one `PlayerCommand` per tick,
  passed to the sim in a Map keyed by character id.
  View angles are absolute, so a lost or duplicated command can't accumulate drift.
- **physics/**: `PhysicsWorld` implements the sim's `CharacterMover` interface (Rapier kinematic character
  controller). Characters collide only with level geometry, never each other. Level blocks collide as
  closed triangle meshes to avoid a Rapier capsule-vs-cuboid bug. Standing characters move horizontally,
  then `probeGround` (a downward sphere cast) rests them 0.04 m above the floor. Its static ray casts (`raycastStatic`,
  `raycastSurface`) are answered by `sim/levelRay.ts` (FA12): a slab test against the axis-aligned blocks and ramp wedges
  through a 1 m column grid, allocation-free, held to Rapier's answer by `physics/levelRay.rapier.test.ts`.
  The sim returns anything below `killY` to its spawn.
- **nav/**: `navGrid.ts` builds a 0.2 m walkability grid from map blocks (clearance = body radius + margin) and finds
  routes (8-neighbour A*, string-pulled into straight legs). The grid is layered (M34b): each cell holds one node per
  floor over it (the floor and ramp tops at its centre, and a terrain's ground (M33c), with body height clear above), stored flat (`cellStart`,
  `nodeCell`, `walkable`, `floorY`). Blocks are judged per node against its floor, neighbouring nodes connect only if
  their floors differ by at most `maxStep` (0.15 m), drops get the same clearance as walls on the floor they edge, and
  waypoints carry the floor height. Every query takes a height (`nodeAt`, `floorAt`, `isWalkableAt`,
  `nearestWalkable`, `clearLine`, `dropOnLine`): it picks the highest floor at most `NODE_PICK_ABOVE` above that
  height, so a character on a balcony and one in the hall under it get different answers. A map with one floor per
  cell builds the same grid as before. `dropOnLine` tells bots' off-route steps (combat
  sidesteps, the last step to a lean spot) where a floor ends, so they never walk off an open edge. Pure; used by bots
  and by the sim for walk-offs.
- **ai/**: bots. `BotController` runs before each tick (fills every bot's `PlayerCommand`, rations route searches to one
  per tick) and after it (bots hear shots, near misses, hit calls and footsteps from `state.events`). `bot.ts` holds a bot's state
  (plain data, including one contact record per enemy seen); `botBrain.ts` is its per-tick decision and mode choice
  (advance along a lane → fight → cover → search), calling `botSenses.ts` (what it sees: target choice, contacts and
  reaction), `botMovement.ts` (routes, jittered lane points, waiting for the team, hunting, strafing) and `botCombat.ts` (aim, bursts,
  reloads). In cover a bot ducks; at crouch-high cover it stands up to look, and at a wall corner it leans out (`cover.lean`), then fights from the spot (`fromCover`) before
  ducking (leaning back) again. `cover.ts` also tries the spot behind each low block (`lowCoverBlocks`) and just round each outline corner of each full-height block (`tallCoverBlocks`) as cover; a fresh contact at
  range sends a bot to close cover it can peek from first (a narrowed `CoverSearch`). Each round the controller deals each team's bots onto lanes by a plan (`teamPlan.ts`: split, pair or stack). These build on
  `perception.ts` (view cone + static ray casts), `aim.ts` (turn rate, settling aim error, hasty first aim, tracking error)
  and `cover.ts` (random nearby spots hidden from the threat). Tuning is shared behaviour (`BotWorld.cfg`) + one difficulty's
  skill per bot (`Bot.skill`; config/bots.ts), fixed for a match: the session builds the controller with the levels picked
  for each team on New game (`BotControllerOptions.teamCfg`: one `BotConfig` per team).
  Bots read game state, never write it; their randomness is seeded per bot. In Attack / Defend (`BotWorld.round`, `flagRole`
  / `wantsFlag` in `bot.ts`) defenders walk only the first one or two points of their lane and hold there, chase
  noises only near the pole, and the two nearest it run to the pole (mode `flag`) once the flag is off the bottom; attackers go to
  the pole once they have walked their lane to midfield, crouch by it and stay. Nobody hunts.
  Squad orders (M22, `squadOrders.ts`, `config/squad.ts`): `BotController.giveOrder` hands Follow me, Hold here or Regroup
  from a player to its bot teammates; between fights an ordered bot is in mode `order` (before the pole, noises and its
  lane), and `orderOf` tells the HUD's squad line (`ui/squadOrderLine.ts`) what is in force. The order wheel (M23):
  `PlayerInput` owns a `WheelPointer` (`input/orderWheel.ts`) that takes the mouse while the wheel key is held, and
  hands the pick to `takeOrder` like an order key; `ui/orderWheel.ts` draws it. The minimap (M23, `ui/minimap.ts`)
  draws the map's blocks once per match on a canvas and each frame the teammates and `HeardPlayers`
  (`ui/minimapView.ts`), fed by the same heard sounds as the sound cues. Hearing (`hear`) casts the
  same wall rays as the audio's muffling (`sim/soundPath.ts`): through walls a bot hears at `wallHearing` of the range.
- **core/fixedStepper**: accumulator that turns variable frame time into fixed ticks (max `SIM.maxTicksPerFrame`, 10, catch-up ticks per frame; 5 before FA1, audit SIM-14). Consequence (audit L-34): at 60 ticks/s, 10 ticks cover 167 ms, so below about 6 frames/s the rest of each frame's time is dropped and the whole game (round clock, reloads, BB flight, bots) runs in slow motion rather than spiralling into ever longer catch-up frames (frame time is also capped at `SIM.maxFrameDt`, 0.25 s). Only the debug overlay's "sim ticks/s" shows it; a browser drawing in software starts on Low to stay above it (M-02).
- **core/crashReport** and **ui/crashScreen** (FA1, audit CORE-04/CORE-28): an error in the game loop or at start-up stops the game for good and shows a pane with a copyable report (seed, map, mode, tick, GPU, settings, stack); Dev › Diagnostics copies the same fields on demand.
- **core/seed**: the game's seed (a fresh one each page load, or `?seed=N`) and the exact 32-bit derivation of the
  streams made from it (the bots' plans, each bot).
- **render/**: reads `GameState` and interpolates between `prevPosition` and `position` using the stepper alpha.
  Quality (`config/render.ts`): a preset (`QUALITY`) or the player's Custom mix (`resolveQuality` over High, one row
  per `QualitySettings` field in `config/graphics.ts`, the Graphics tab in `ui/graphicsSettings.ts`), picked on Settings
  → Graphics and saved, `?quality=` for a visit, or else the GPU's preset (`gpuCheck.ts` `probeGpu`/`gpuTier`: Low in
  software, Medium on integrated graphics, High on a discrete card), which steps down by itself on slow frames
  (`qualityStepDown.ts`, never saved). It sets the render scale and DPI cap (`effectivePixelRatio`), antialiasing,
  shadows, the figures' shading, surface relief, texture size and filtering, dust and the replica's sheen:
  `Game.changeQuality` applies new settings at once through `Renderer.setQuality` (a new WebGL context on a new canvas
  when antialiasing changes; the pointer lock is on the container, so it survives) and `MatchSession.setQuality` (the
  daylight, `restyleMap`, the figures and `CombatPresentation.setQuality`). The frame-rate cap
  (`core/framePacer.ts`) skips draws, never ticks. The art pass (M14) is procedural:
  `lighting.ts` (sun and sky fill; on High the sun's shadow map follows the view, `Daylight.follow` each frame, moved
  in whole texels, normal bias in texels) adds `atmosphere.ts` (the sky dome, the tree ring at the Trees setting, the
  clouds and sun disc; the dome is drawn after the opaque field so only sky pixels shade it; the renderer's fog matches
  the horizon); `proceduralTextures.ts` draws the surface textures, owned by the `Renderer` and drawn and uploaded in
  the title screen's idle time (`Renderer.warmUp`), with normal maps worked out from them on demand
  (`surfaceNormals.ts`). The visual overhaul (FA7, `docs/ART.md`) adds the sky-derived environment map
  (`replicaSheen.ts`: the dome's own colours over a concrete disc, prefiltered once per context and per
  `EnvironmentLook` passed to `Renderer.setEnvironmentLook`, freed while off; the `Renderer` sets it as `scene.environment` with Environment lighting, and the map's and trees' Lambert materials opt
  out, `surfaceMaterials.ts`) and the tone mapping choice (`Renderer.setToneMapping`). Night lighting (M33f): a map
  names its lighting presets in its data (`MapData.lighting`, absent means day; `config/render.ts` `LIGHTING_PRESETS`),
  `lightingPreset.ts` resolves one (`resolveLighting`, the key light turned to the map's `moonOver`), every session
  passes it to `Renderer.setLighting` (haze, background, exposure, environment) and `addLighting` (key light, fill, sky,
  clouds), and `lightPools.ts` draws the map's light pools (`MapData.lights`): one glow mesh, one additive ground mesh
  and, on Medium and High, a fixed number of point lights on the pools nearest the eye (`QualitySettings.poolLights`). `mapMeshes.ts` turns each block
  into pieces (container frames, wall copings, pallets, all inside the block's bounds) merged per texture by
  `cuboidMesh.ts`, with grime shading near the ground; with Map detail the boxes are bevelled with a lighter edge,
  tiled, shaded by baked vertex occlusion (`vertexOcclusion.ts`) and ground noise, the props get extra pieces, the signs
  are one alpha-tested mesh (`mapDecals.ts`), and the shadow map draws each mesh's plain boxes from a second index range
  of the same geometry. `contactShadows.ts` lays a soft disc under every figure on every preset (one instanced draw).
  Effects are pooled: `impactPuffs.ts` (impact dust tinted by material, hit puffs, a gas pistol's puffs; soft dots from
  `softDot.ts`), `bbRenderer.ts` (balls and camera-facing streak quads of a fixed on-screen width) and `dustMotes.ts`
  (faded out near the camera, size-capped in device pixels times the pixel ratio, hidden with Reduced motion); a pool
  with nothing in flight uploads nothing.
  The debug overlay shows the quality in force, pixel ratio, sim / draw / GPU milliseconds (`gpuTimer.ts`), the
  multisampling granted, draw calls and GPU object counts; Show FPS keeps its first line on screen. `Renderer.setFov` applies the
  Field of view setting (horizontal degrees on 16:9) at once; an optic's zoom narrows whatever is set.
  `Renderer.setRetro` (M42, Dev › Retro pixels) draws the field and the held replica into a small half-float target
  (`retroFilter.ts`, a texel per retro pixel) and shows it through one pass that tone maps, crushes colours to a few levels
  with a 4×4 Bayer dither and samples with no smoothing; the page's HUD and menus are untouched, and `BBRenderer` keeps
  balls and streaks at least `RETRO.bbMinPixels` / `trailMinPixels` retro pixels wide. Off under the perf script.
  The local camera uses the latest input angles directly, so aim is never a tick behind.
- **input/**: `Keyboard` and `PointerLock` collect raw input (mouse buttons go into the keyboard as binding codes, `Mouse0` …, so every action binds to a key or a button); `PlayerInput` latches one-shot actions (jump, reload, switch, trigger clicks) until a tick consumes them, and runs the hold or toggle modes of crouch, aim and sprint. `sensitivity.ts` converts the sensitivity to cm/360.
- **ui/**: DOM overlays (the menus in `ui/menus/`, debug overlay, ammo HUD), the on-screen sound cue ring `ui/soundCues.ts`, fed by
  `MatchPresentation` from the tick's events). Team colours (M18b) are a picked set (`config/teams.ts`): the 3D figures,
  flag and armband take its colours at Play, and the HUD reads `--team-0` / `--team-1`, which `Game.play` sets on the
  container. The `Renderer` reports a lost and restored graphics context (`onContextChange`) and whether it draws in
  software (`render/gpuCheck.ts`); `Game` pauses on either a lost context or a hidden tab.
- **render/combatPresentation.ts**: after each tick consumes `state.events` (puffs, viewmodel kick, sound);
  each frame draws BBs (instanced, interpolated), puffs, the held replica (second render pass) and the HUD.
- **audio/** (reworked in M13): every effect is a recipe of layers in `config/sounds.ts` (filtered noise, gliding
  tones, struck resonances), rendered by the pure `audio/dsp.ts` into a few variants each and played back from
  buffers. The `Game` keeps one `AudioEngine` (`audio/audioEngine.ts`) for the page: the audio context (made suspended
  at start, running only while a match is played), the volume buses and every sound's buffers, rendered a cue at a
  time in the title screen's spare time. Each match's `Sfx` builds only its own graph on it and disconnects it when
  the match goes. A replica's shots follow its power source (`ReplicaConfig.power`: electric, gas;
  spring is ready for the v0.3 armoury); an AEG winds its motor up on a fresh trigger pull and down after the last
  shot (`audio/motor.ts`). `Sfx` keeps one channel per other character (an HRTF panner that follows them, then a
  low-pass and gain muffling them by how much level geometry blocks two rays from the listener, `audio/occlusion.ts`);
  one-off world sounds (BB impacts, the flag's rope) get a panner of their own, disconnected when they end. Footsteps
  sound by the surface underfoot (`MapBlock.surface`), BB impacts by the block they hit (`audio/soundMaterials.ts`),
  and crouching, standing and leaning rustle (`audio/foley.ts`, presentation only: bots hear what they did before).
  Buses: master, effects (in-world, with the yard's reverb) and interface (hit tick, hit marker, whistle, dry), set
  by the Settings → Audio sliders (`audio/audioMix.ts`, saved in the settings store). Since FA6 the limiter and the
  ducking (your own hit, the whistles) sit on effects only; interface goes straight to master. Sounds render at
  `AUDIO.renderRate` whatever the device's rate; one-off sounds beyond `maxDistance` aren't played; while you're out
  the world is muffled; a seeded outdoor bed and birds (`audio/ambience.ts`) play into the world.
- **sim/lean.ts**: leaning (hold Q / E). One geometry: the upper body tilts about a hip pivot (`hits.lean`), so
  `leanOffset` moves any point above the hips sideways and a little down. `stepLean` (after movement) eases the lean
  in and out, drops it in the air and clamps it with sideways rays so the head and shoulders stay clear of walls.
  The eye and BB origin (`leanedEye`), the hit volume (`hitbox.ts`: body, a head and shoulder sphere and a hips-to-shoulder torso capsule that
  swing out), the camera (`render/cameraRig.ts`, plus a small roll), the drawn figure (`figureLeanRoll`) and what
  bots see and aim at (`ai/perception.ts`) all use it. Leaning slows you towards walking pace (quiet from half a lean) and blocks sprinting.
- **sim/accuracy.ts**: accuracy by stance and movement. `stepAccuracy` (after leaning) keeps `Character.spreadScale`,
  the multiplier on the replica's spread (`MOVEMENT.accuracy`): steadier crouched, shakier walking, running, sprinting and
  in the air; it jumps up at once and locks back on within a few ticks once you stop (slower for a moment after a sprint or a landing). The muzzle carries it into `armament.ts`; the HUD crosshair opens to show it.
- **sim/aiming.ts**: aiming down sights (hold right click). `stepAiming` (before movement) sets `Character.aiming` only
  with an optic fitted to the replica in hand (`Armament.optics`, fitted per slot by `fitOptic` from the Loadout screen's
  pick at each round start; `config/optics.ts`), and not while reloading or drawing. Aiming moves you at walking pace
  (quiet, no sprint) and adds no accuracy. Presentation raises the sight (`render/viewmodel.ts`, the replica's `aimHold`
  puts the optic on the view's centre line), narrows the view (`Renderer.setZoom`) and swaps the crosshair for the red
  dot; `input/playerInput.ts` turns at the aiming sensitivity meanwhile. Bots never aim down sights.
- **sim/footsteps.ts**: after movement, emits `footstep` events every stride while running/sprinting and on hard
  landings; walking and crouched movement are silent.
- **render/matchPresentation.ts**: other players (`characterRenderer.ts` + `characterModels.ts`: vertex-coloured
  figures in casual airsoft kit with the team colour as tape, six looks by id (`FIGURE.looks`), six merged meshes
  each on one material per figure, four drawn at once: legs, body, and the rifle, pistol or hit-call arms), hit feedback (`ui/hitFeedback.ts`), the spectator camera used once
  you're out, round messages (`ui/roundBanner.ts`, worded from your side) and the scoreboard (`ui/scoreboard.ts`:
  score, clock, who's still in; in Attack / Defend ATK/DEF tags and the flag strip, `ui/flagStatus.ts`). In Attack / Defend
  also the pole (`flagRenderer.ts`: pole, rippling cloth at the sim's height, ring at the rope's reach) and its
  screen marker (`screenMarker.ts` projects it, pinned to the screen edge when out of view; `ui/flagMarker.ts`).
- **Match info (M19):** `stats/matchStats.ts` keeps every player's numbers for the match and the round (hits on
  opponents, times hit, friendly hits, BBs fired, time in play while live) from each tick's events, in `MatchSession`
  after every tick; it reads the simulation and never writes it. `ui/statsRows.ts` (pure) turns them into team blocks
  for `ui/statsTable.ts`, shown over the field by `ui/matchBoard.ts` (Tab held: the match so far; between rounds: the
  round) and on the summary screen. `MatchPresentation` also feeds the hit feed (`ui/hitFeed.ts`, lines on simulation
  time) and projects the teammate markers (`ui/teammateMarkers.ts`, through `screenMarker.ts`). `stats/records.ts`
  keeps the local records under their own browser key (`airsoft.records`); `Game` adds a finished match once
  (`MatchSession.takeMatchResult`). The crosshair (`ui/crosshair.ts`) is built and styled from Settings → Crosshair
  (`ui/crosshairSettings.ts`, saved as `crosshair.<part>`); the HUD opens its gap with the spread.
- **ui/menus/** (M15, M15b): `Menus` shows one opaque screen at a time and reports choices to `game.ts`:
  the title screen, New game (`setupScreen.ts`: Map, Mode, Difficulty, Loadout, Settings, the rules from `rulesText.ts`,
  Back and Play) with `ChoiceDialog` pop-ups (a `<dialog>`: Esc or × closes it) for map, mode and difficulty, the Loadout
  screen (`loadoutScreen.ts`: slots, optic, hop-up dials, LATER rows), the Settings screen (`settingsScreen.ts`: tabs;
  Key bindings reuses `ui/keySettings.ts`), the pause menu, the match summary (`summaryScreen.ts`, M19) and the result.
  `menuNav.ts` holds where Back goes and which menu opens when play stops (title before the first match, pause during
  one, the summary and then the result after it); leaving a match
  (Quit to title screen, Change setup, Title screen) calls `onLeaveMatch`, which unloads it. The placeholder lists and
  labels are data in `config/menus.ts`; choices are saved in the browser (`savedChoices.ts` reads them back). Map,
  mode, difficulty and loadout are picked only on New game, with no match loaded, so Play always uses them as they are.
- **Loadout (M17a):** `config/replicas.ts` `LOADOUT_SLOTS` lists the replicas that fit each slot (primary, secondary);
  the session's loadout is the player's picks, and every character in the match carries those replicas (bots with
  factory setups). Each replica has a hop-up dial (`Armament.hopUps`, 0..1; `setHopUps`) that scales its `hopUpMax`
  lift (`hopUpLift`), and a BB weight (`Armament.bbWeights`, grams from `BB_WEIGHT.choices`; `setBbWeights`) that
  sets the BB's mass and, through `muzzleEnergy` / `muzzleVelocity`, its speed. Both are kept between rounds; bots keep
  the factory `hopUpDial` and `bbWeight`. `sim/hopUp.ts` flies a level shot to word the Loadout screen's readout
  ("on target to about N m") for the picked weight and dial.
- **Attachments (M17b):** `config/attachments.ts` holds the grips and magazines; a replica says which it takes
  (`gripMount`, `magazines`). `Armament.parts` (per slot, `fitParts`) and `Armament.handling` (`handlingOf`: magazine
  size and count, reload, draw, sight raise, shake, rattle) are what the armament, accuracy, footsteps, HUD, viewmodel
  and bots read instead of the replica's own `magSize` / `mags` / `reloadTime` / `drawTime`. A hi-cap makes quiet moves
  emit `footstep` events of kind `rattle`. Optics (`config/optics.ts`) carry their zoom, raise time and whether they
  are a scope (the HUD's eyepiece; the viewmodel hides while looking through one). Parts on the model are named
  `optic:<id>`, `grip:<id>`, `magazine:<id>` and shown when fitted.
- **Asset pool (M26a):** `pool.md` at the repository's root is the register of every asset the player can own (replicas,
  power sources, optics, grips, lasers, magazines; grenades later) and the Armory's numbers (FC earned, Tokens, Shots,
  rarity tiers and odds, scrap values). It is bundled as text (`?raw`) and read once at start: `pool/poolFile.ts`
  pulls out its Markdown tables, `pool/pool.ts` turns them into `Asset`s, `RarityTier`s and an `Economy` (with each
  unreadable row listed by line and left out), and `pool/gamePool.ts` holds the game's `GAME_POOL`. An asset's Key
  links it to its behaviour in `config/` (`REPLICA_KEYS`, the optic, grip, laser and magazine ids); compatibility is by
  tags (`fits`). `pool/collection.ts` keeps what the player owns (a count per asset at a tier, `000002@epic`), their FC
  and Tokens and the Shots' random state under its own browser key (`airsoft.collection`).
- **Loadout (M26b):** `pool/loadoutModel.ts` `LoadoutModel` is the player's loadout without a DOM: the replica item in
  each gear slot, what is fitted to each replica (`ReplicaFit`: an owned item or nothing per slot), each replica's BB
  weight and hop-up, all saved in the settings store and read back against an `Ownership` (the collection; everything,
  under the M26d Dev setting). `pool/kit.ts` turns a replica item and its fit into a `KitSlot`: the replica as carried
  (rarity, power source and laser worked into its numbers) and its parts (with a `PartTune` for the optic's, grip's and
  magazine's tiers, which `handlingOf` multiplies in). `Game` passes `loadout.kit()` to each match and range visit;
  `MatchSession` gives the player those replicas (`createCharacter(..., kit replicas)`) and bots `LOADOUT`. Every
  character's `Armament.replicas` is what it carries, and the sim, renderer and HUD read that, never `LOADOUT`.
  `ui/menus/loadoutScreen.ts` draws the gear column and Customise view; `ui/loadoutChoice.ts` holds its readouts.
- **Performance numbers (M29):** `stats.md` beside `pool.md` holds every replica's and part's numbers (energy, BB
  weight, rate of fire, magazines, handling), what each power source adds, the Tier scaling (which stats a tier's
  Bonus improves, and by what share) and the site's energy limits. `config/statsFile.ts` reads it (pure, by Key or
  pool ID, every unreadable cell listed by line) and `config/gameStats.ts` holds `GAME_STATS`; `config/replicas.ts`
  (`withStats`, which also sets `ReplicaConfig.energyLimit`), `attachments.ts`, `optics.ts` and `lasers.ts` lay it over
  their built-in numbers when they load, so bots and the sim see the file's numbers too. `pool/kit.ts` applies the
  power stats and tier shares (`KitStats`, injectable for tests) and caps the energy at the limit (`energyCapped`).
  Barrels and muzzle parts (M29b, `BARRELS` / `MUZZLES` in `config/attachments.ts`) add to the energy and spread in
  `kitReplica` and to the handling in `handlingOf` (`heardScale`, `muffled`); `sim/armament.ts` `shotHeardScale` is
  the one place bots (`ai/botController.ts`), the minimap and sound cues read a shot's reach. On Hard,
  `pool/botKit.ts` rolls each opponent a seeded kit (`randomKit`, `kittedCharacter`; `BOT_LOADOUTS` in config/bots.ts).
  The muzzle is the boundary: `muzzleEnergy` / `muzzleVelocity` / `bbMass` (config/replicas.ts) are what leaves the
  barrel; everything after it is `config/ballistics.ts` and `sim/ballistics.ts`. `ui/performanceSheet.ts` builds the
  Customise screen's Performance sheet (against `LoadoutModel.asItComes`), the gear slots' line and the Armory's
  tier line.
- **Armory (M26c):** `pool/armory.ts` holds its rules, pure, over a `Collection`: `matchEarnings` (the FC a finished
  match pays, from `MatchSession.takeOutcome`), `buyTokens`, `takeShots` (paid in Tokens, then FC; the draws carry on
  from the collection's saved `sim/rng.ts` state mixed with fresh entropy per Shot, replayable with a fixed one; pity
  counts kept in the collection, FA10) and `scrapSpares` (one copy kept per asset, its best tier). `stats/settleMatch.ts`
  pays and records a decided match once (`MatchTakes`); `Game` syncs the collection with storage before changing it
  (`syncCollection`: another tab's newer revision wins) and saves it; `ui/menus/armoryScreen.ts` is the screen, opened
  from New game's Armory tile, with `confirmDialog.ts` before big spends.
- **render/replicaModels.ts + handModels.ts**: first-person replicas (AR-pattern AEG, polymer pistol) and gloved hands built in code from extruded profiles, capsules and lathe shapes, merged per material; poses are data. The viewmodel's scene can reflect a prefiltered room environment (`Viewmodel.setEnvironment`, the replica's sheen).
- **game.ts**: composition root and main loop: the app that outlives matches (renderer, input, menus, debug overlay)
  and New game's choices. No map is loaded on the title and New game screens (M15b).
- **matchSession.ts**: one match on one map (`map/maps.ts` lists the maps): the field's meshes and lighting, physics,
  navigation, the simulation, the bots, and the combat and match presentation. `Game` builds it on Play and disposes it
  when the player leaves the match, so the next Play can load another map; Play Again builds a new one with its own seed (`matchFlow.ts` `matchSeed`; audit SIM-08). What Play does (build a match or the range, rebuild the range, reuse what is loaded) is the pure `core/sessionPlan.ts` `nextSessionAction`; the result and pause screens' text is `ui/matchStopText.ts`, through `MatchSession.resultView` / `pauseLine` (FA11b, audit CORE-05). The field's meshes come from `Renderer.mapMeshes` (`render/mapMeshCache.ts`), which keeps the last map's between sessions, so the same map again reuses them (audit CORE-33). A decided match is recorded and paid once, the frame it is decided, by the pure `stats/settleMatch.ts` (audit CORE-06). Its
  `MatchSetup` carries New game's Match rules (M20, `config/matchRules.ts`: team size, rounds to win, round time,
  friendly fire, ricochets), turned into the match's own round and hit rules, and a bot difficulty per team. Since M39
  it also carries the Rules picker's ruleset (`RULESETS`: one data entry each, laid over the Match pop-up's picks by
  `playedPicks`) and its switches (win by two and the Elimination time-out in `RoundRules`, the minimap's heard
  patches, semi only and realcap through `kitUnderRules` / `replicaUnderRules`, the factory kit); a named ruleset's
  standard match files its records under `<difficulty>.<mode>.<ruleset>`, and custom rules pay at most ×1.5.
- **rangeSession.ts**: the practice range (M21): `map/range.ts` with the targets of `config/range.ts`, the player alone,
  no bots and no rounds. `SimServices.practice` makes `stepSimulation` skip the round flow, step the targets
  (`sim/rangeTargets.ts`: `GameState.targets`, tested by `stepBBs`, which emits `targetHit`) and keep the spare
  magazines full. `render/rangeTargetsRenderer.ts` draws the plates, figures and distance markers (one instanced mesh per kind
  of moving part, one merged mesh per material for the rest) and
  `ui/rangeReadout.ts` the last BB's distance. `Game` holds a `MatchSession` or a `RangeSession`; changing the loadout
  from the range's pause menu rebuilds the range where you stood.
  With a tutorial (M16) it also holds a `tutorial/tutorial.ts` `TutorialTracker`, which watches the player and the
  tick's events against the steps of `config/tutorial.ts`, and a `ui/coachPanel.ts` panel that shows the current step
  (the range readout takes over once it's finished); `Game` saves `tutorialDone` when it reports the end.
- **The save (M31), `src/save/`:** every store (the settings object, key bindings, records, the collection; listed in
  `save/stores.ts`) keeps its own key and module, and writes through `browserStorage()`, which after start-up is the
  visit's `GuardedStorage` (`save/guardedStorage.ts`): it notices writes (the Save tab's "Last saved"), keeps refused
  writes in memory for the visit (a full or blocked browser store, warned on the Save tab and the title) and can be
  frozen (another tab, a newer build's save, a load about to reload). `main.ts` starts it first, then the tab lock
  (`save/tabLock.ts`, a BroadcastChannel: one tab plays, a second waits behind `ui/otherTabNotice.ts`), then the
  `SaveManager` (`save/saveManager.ts`: today's restore point, the Undo slot, load, delete), handed to `Game` for
  Settings → Save (`ui/saveSettings.ts`, `ui/saveDialog.ts`). The file format and migrations are pure, in
  `save/saveFile.ts`. Stores keep fields they don't know when they save (`save/overStored.ts`).

## Map data

Maps are plain data (`map/mapTypes.ts`): axis-aligned blocks with a visual kind (a `ramp` is a wedge sloping up
along its `rise`; `map/surfaces.ts` gives the walkable height of floors and ramps; walkable surfaces may stack
when body height is clear between them), spawns and dead-zone spots
per end of the map (0 west, 1 east), bot lanes from end 0 to end 1, and optionally one flagpole at end 1 (maps
without one are elimination only) and an Extraction block (M43: insertions, exits, home-team starts, run time and base
opponents; `map/playableMode.ts` falls back to Elimination on a map without the data a mode needs). Teams don't own an end: `round.ts` (`teamEnd`, `placeTeams`) puts each team
at an end every round start (in Attack / Defend the attackers start at end 0; in Elimination Blue starts at
`RoundRules.eliminationFirstEnd`, the east on Depot)
and swaps them at half-time, and `Character.end` says where a character started, for its dead zone and its bot's
lane direction. Depot is written in plan coordinates (north = +z, as on the layout sketch) and turned into world
coordinates (north = -z in three.js) in `map/depot.ts`. The same data builds Rapier colliders and merged Three.js meshes
(one draw call per surface texture).

## Simulation structure

Multiplayer is not planned. The fixed tick, command-driven characters (bots drive the same commands as
the player), plain-data state and seeded RNG stay because they make the simulation deterministic and
unit-testable (headless bot matches in tests).

## Contracts

The interfaces a task may not change unless its block in `docs/TASKS.md` says so (the pipeline's critic checks,
`pipeline/README.md`). A contract change is a plan step: the planning thread updates this list in the same pull
request. Each line names where it lives and what pins it.

- **`PlayerCommand`** (`sim/commands.ts`): one command per character per tick, absolute view angles; the only way
  input or bots drive the simulation. Pinned by `sim/simulation.test.ts`, `input/playerInput.test.ts`.
- **`GameState` and `state.events`** (`sim/state.ts`, `sim/events.ts`): plain data, no Three.js or DOM; events are
  the only channel to presentation and are cleared each tick. Since M43 `RoundState.run` holds an Extraction run
  (`sim/extraction.ts`: exits, respawns used, the exit count, its outcome), and the events `respawned`, `exitCount`,
  `exitOpened` and `runWarning` report it. Pinned by `sim/simulation.test.ts`, `sim/extraction.test.ts`.
- **`stepSimulation(state, commands, ctx, dt)`** (`sim/simulation.ts`): the fixed 60 Hz step and the order of its
  phases (a parked out-of-play character goes straight to the elimination step, FA1); randomness only from `state.rng`. Pinned by the `sim/*.test.ts` files and the `ai/depotMatch*.test.ts` guards.
- **`WorldQuery` and `CharacterMover`** (`sim/`, implemented by `physics/physicsWorld.ts`): ray and shape casts and
  the character controller the simulation sees; the simulation never calls Rapier. Pinned by `physics/physicsWorld.test.ts`.
- **`MatchSession.advance(dt)` / `draw(dt)` / `afterTick()`** (`matchSession.ts`): simulation first, presentation
  after; `afterTick` is where stats, the HUD and sound read the tick's events. Pinned by the smoke test.
- **`QualitySettings`, `QUALITY`, `QualityChoice`, `resolveQuality`, `qualityChoiceOf`** (`config/render.ts`): the
  fields a preset or the Custom rows may set (every preset sets every field; `QUALITY` is the preset table; a choice is
  a preset or `'custom'`, which resolves to High overlaid with the saved rows); `Renderer.setQuality` and
  `MatchSession.setQuality` apply them at once, antialiasing included. Fields are added, never renamed: a new field
  takes a value on every preset, a row in `config/graphics.ts` and a `graphics.<field>` store key, with no further
  contract change. Pinned by `config/render.test.ts`, `config/graphics.test.ts`, `render/renderer.test.ts`.
- **The settings store keys** (`settings/storage.ts`, `settings/dev.ts`): saved under `airsoft.*`, versioned;
  renaming a key needs a migration: one `case` in `migrate` (FA5; the per-setting keys of the first builds are its
  "version 0"), and an object from a newer version is never read or overwritten. Fields are only ever added: `quality`
  holds a `QualityChoice`; `graphics.<field>` holds a Custom row (an option id or a slider position), `frameRateCap`
  and `showFps` the two Graphics rows outside the presets (FA2), all read with a fallback, so version 1 stands. Pinned
  by `settings/storage.test.ts`. Since M31 `browserStorage()` returns the save system's guarded storage once it has
  started (same keys, same values).
- **The save file format** (`save/saveFile.ts`, M31): `{ game, format, build, savedAt, summary, stores, checksum }`,
  the stores as their own modules store them. A save from any earlier `format` loads (one `MIGRATIONS` step per
  format); a later one is refused. `SAVE_FORMAT` goes up with any store's version or a new store (`STORES_BY_FORMAT`).
  Pinned by `save/saveFile.test.ts`.
- **`pool.md`'s format** (`pool/poolFile.ts`): the hand-edited asset register the game reads. Power sources carry a Type, not a Power % (M29: what they do is in stats.md). A Pity table (`| Guarantee | Shots |`) and an "Unowned item weight" row in Tokens and Shots (FA10). Replicas have two optional columns, Tiers (the tiers an asset comes in) and Drop % (a chase item's own chance per Shot item), and the `built-in-power` tag for a replica whose power source is fixed (M32). An Access column on every asset table, `public` or `dev` (M35; blank reads as public, any other word leaves the row out). Pinned by `pool/pool.test.ts`.
- **`stats.md`'s format** (`config/statsFile.ts`, M29): the hand-edited performance numbers (replicas and parts by Key,
  power sources by pool ID, Barrels and Muzzle parts by Key (M29b), Tier scaling, Site limits) the config modules lay
  over their built-in ones. Pinned by
  `config/stats.test.ts`.
- **Content tags** (`config/content.ts`, M35): every map, mode, difficulty, ruleset (`tag` on `MAPS`, `MATCH_MODES`,
  `DIFFICULTIES`, `RULESETS` since M39) and pooled asset (`Asset.tag`, pool.md's Access) is `public` or `dev`; Match pop-up choices may carry
  one (untagged is public). `isAvailable(tag, devContent)` is the one check; `devContent` is the Dev tab's Dev content
  switch (`dev.devContent`, applying only while Dev settings is ticked). Dev content is not shown anywhere while it is
  off (`contentPool`, `playedPicks`, `ChoiceDialog`/`OptionPicker.setDevContent`), never drops from Shots
  (`dispensable`), and a match using any of it (`MatchSetup.devContentUsed` from `matchUsesDev`: its picks, the
  player's kit, or dev gear the opponents may roll) stays out of the records and pays nothing (`matchStanding`,
  `NotCounted` 'devContent'). Pinned by `config/content.test.ts`, `pool/contentPool.test.ts`.
- **The map block format** (`map/mapTypes.ts`): what `navGrid`, `mapMeshes` and the physics read. Optional blocks
  are only added (M43 `extraction`). Pinned by `map/mapData.test.ts`, `nav/navGrid.test.ts`, `map/extractionData.test.ts`.
