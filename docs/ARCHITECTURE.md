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
  (`ballistics.ts` flight model: gravity, drag and hop-up lift by BB mass; replicas are rated in joules and BB weight, `bbs.ts` collision with the level via the `WorldQuery` ray cast and with
  characters via `hitbox.ts` capsules), then match flow (`round.ts`: the match mode, round clock, wipe-out or time-out, score, first to
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
  then `probeGround` (a downward sphere cast) rests them 0.04 m above the floor. It also offers static ray casts.
  The sim returns anything below `killY` to its spawn.
- **nav/**: `navGrid.ts` builds a 0.2 m walkability grid from map blocks (clearance = body radius + margin) and finds
  routes (8-neighbour A*, string-pulled into straight legs). Pure; used by bots and by the sim for walk-offs.
- **ai/**: bots. `BotController` runs before each tick (fills every bot's `PlayerCommand`, rations route searches to one
  per tick) and after it (bots hear shots, near misses, hit calls and footsteps from `state.events`). `bot.ts` holds a bot's state
  (plain data, including one contact record per enemy seen); `botBrain.ts` is its per-tick decision and mode choice
  (advance along a lane → fight → cover → search), calling `botSenses.ts` (what it sees: target choice, contacts and
  reaction), `botMovement.ts` (routes, jittered lane points, waiting for the team, hunting, strafing) and `botCombat.ts` (aim, bursts,
  reloads). In cover a bot ducks; at crouch-high cover it stands up to look, and at a wall corner it leans out (`cover.lean`), then fights from the spot (`fromCover`) before
  ducking (leaning back) again. `cover.ts` also tries the spot behind each low block (`lowCoverBlocks`) and just round each outline corner of each full-height block (`tallCoverBlocks`) as cover; a fresh contact at
  range sends a bot to close cover it can peek from first (a narrowed `CoverSearch`). Each round the controller deals each team's bots onto lanes by a plan (`teamPlan.ts`: split, pair or stack). These build on
  `perception.ts` (view cone + static ray casts), `aim.ts` (turn rate, settling aim error, hasty first aim, tracking error)
  and `cover.ts` (random nearby spots hidden from the threat). Tuning is `BotConfig` = shared behaviour + one difficulty's
  skill (config/bots.ts); `BotController.setConfig` swaps it now or at the next round start, as decided by
  `difficultyChoice.ts` (pure: which level is in play, which one waits; game.ts calls it from the start-screen picker).
  Bots read game state, never write it; their randomness is seeded per bot. In Attack / Defend (`BotWorld.round`, `flagRole`
  / `wantsFlag` in `bot.ts`) defenders walk only the first one or two points of their lane and hold there, chase
  noises only near the pole, and the two nearest it run to the pole (mode `flag`) once the flag is off the bottom; attackers go to
  the pole once they have walked their lane to midfield, crouch by it and stay. Nobody hunts.
- **core/fixedStepper**: accumulator that turns variable frame time into fixed ticks (max 5 catch-up ticks per frame).
- **core/seed**: the game's seed (a fresh one each page load, or `?seed=N`) and the exact 32-bit derivation of the
  streams made from it (the bots' plans, each bot).
- **render/**: reads `GameState` and interpolates between `prevPosition` and `position` using the stepper alpha.
  `Renderer` and the sun's shadow take a quality preset (`config/render.ts` `QUALITY`, `?quality=low|medium|high`,
  fixed for the session); the debug overlay shows the preset, pixel ratio, draw calls and GPU object counts.
  The local camera uses the latest input angles directly, so aim is never a tick behind.
- **input/**: `Keyboard` and `PointerLock` collect raw input; `PlayerInput` latches one-shot actions (jump, reload, switch, trigger clicks) until a tick consumes them.
- **ui/**: DOM overlays (start/pause screen, debug overlay, ammo HUD).
- **render/combatPresentation.ts**: after each tick consumes `state.events` (puffs, viewmodel kick, sound);
  each frame draws BBs (instanced, interpolated), puffs, the held replica (second render pass) and the HUD.
- **audio/**: synthesised Web Audio effects; positional for everything but the local player's own sounds. In-world
  sounds feed a short procedural reverb (the yard's echo); UI sounds (hit tick, hit marker, whistle) stay dry.
- **sim/lean.ts**: leaning (hold Q / E). One geometry: the upper body tilts about a hip pivot (`hits.lean`), so
  `leanOffset` moves any point above the hips sideways and a little down. `stepLean` (after movement) eases the lean
  in and out, drops it in the air and clamps it with sideways rays so the head and shoulders stay clear of walls.
  The eye and BB origin (`leanedEye`), the hit volume (`hitbox.ts`: body plus a head and shoulder sphere that
  swing out), the camera (`render/cameraRig.ts`, plus a small roll), the drawn figure (`figureLeanRoll`) and what
  bots see and aim at (`ai/perception.ts`) all use it. Leaning slows you towards walking pace (quiet from half a lean) and blocks sprinting.
- **sim/accuracy.ts**: accuracy by stance and movement. `stepAccuracy` (after leaning) keeps `Character.spreadScale`,
  the multiplier on the replica's spread (`MOVEMENT.accuracy`): steadier crouched, shakier walking, running, sprinting and
  in the air; it jumps up at once and settles back. The muzzle carries it into `armament.ts`; the HUD crosshair opens to show it.
- **sim/footsteps.ts**: after movement, emits `footstep` events every stride while running/sprinting and on hard
  landings; walking and crouched movement are silent.
- **render/matchPresentation.ts**: other players (`characterRenderer.ts` + `characterModels.ts`: vertex-coloured greybox
  figures, a few meshes each on one material per figure), hit feedback (`ui/hitFeedback.ts`), the spectator camera used once
  you're out, round messages (`ui/roundBanner.ts`, worded from your side) and the scoreboard (`ui/scoreboard.ts`:
  score, clock, who's still in; in Attack / Defend ATK/DEF tags and the flag strip, `ui/flagStatus.ts`). In Attack / Defend
  also the pole (`flagRenderer.ts`: pole, rippling cloth at the sim's height, ring at the rope's reach) and its
  screen marker (`screenMarker.ts` projects it, pinned to the screen edge when out of view; `ui/flagMarker.ts`).
- **ui/startScreen.ts**: title/pause/result overlay with the rules for the picked mode and two `OptionPicker`s
  (match mode, bot difficulty; saved in the browser).
- **render/replicaModels.ts + handModels.ts**: first-person replicas (AR-pattern AEG, polymer pistol) and gloved hands built in code from extruded profiles, capsules and lathe shapes, merged per material; poses are data.
- **game.ts**: composition root and main loop. The only place that knows about every layer.

## Map data

Maps are plain data (`map/mapTypes.ts`): axis-aligned blocks with a visual kind (a `ramp` is a wedge sloping up
along its `rise`; `map/surfaces.ts` gives the walkable height of floors and ramps), spawns and dead-zone spots
per team, bot lanes, and optionally a flagpole spot per team (the pole that team defends; maps without one are
elimination only). The same data builds Rapier colliders and merged Three.js meshes
(one draw call per surface texture).

## Simulation structure

Multiplayer is not planned. The fixed tick, command-driven characters (bots drive the same commands as
the player), plain-data state and seeded RNG stay because they make the simulation deterministic and
unit-testable (headless bot matches in tests).
