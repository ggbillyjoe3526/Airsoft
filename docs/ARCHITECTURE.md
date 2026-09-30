# Architecture

## Layers (target shape; ai, audio and the HUD arrive with their Phase 1 features)

```
input ──► PlayerCommand ──┐
ai (bots) ─► PlayerCommand ┤
                           ▼
                   sim (pure, fixed 60 Hz) ◄── physics (Rapier: level collision)
                           │ plain-data GameState + events
                           ▼
          render (Three.js) · audio (Web Audio) · ui (DOM HUD)
```

- **sim/**: all gameplay rules. Plain data (`GameState`, `Character`, the BB pool), no Three.js, no DOM, no `Math.random`.
  Each tick: move characters, handle replicas (`armament.ts`: fire, reload, switch; spawns BBs), then fly BBs
  (`ballistics.ts` flight model, `bbs.ts` collision with the level via the `WorldQuery` ray cast and with
  characters via `hitbox.ts` capsules), then round flow (`round.ts`). A hit character is eliminated
  (`elimination.ts`: alive → calling → walkingOff → out) and from then on follows a built-in command instead of its
  controller's, can't fire and can't be hit. Anything presentation needs
  to react to is pushed to `state.events` (shots, impacts, reloads), cleared every tick.
  Advances only via `stepSimulation(state, commands, ctx, dt)`. Randomness comes from the seedable `state.rng`.
- **Commands**: every character (player, bot, later remote players) is driven by one `PlayerCommand` per tick,
  passed to the sim in a Map keyed by character id.
  View angles are absolute, so a lost or duplicated command can't accumulate drift.
- **physics/**: `PhysicsWorld` implements the sim's `CharacterMover` interface (Rapier kinematic character
  controller). Characters collide only with level geometry, never each other. Level blocks collide as
  closed triangle meshes to avoid a Rapier capsule-vs-cuboid bug. Standing characters move horizontally,
  then `probeGround` (a downward sphere cast) rests them 0.04 m above the floor. It also offers static ray casts.
  The sim returns anything below `killY` to its spawn.
- **core/fixedStepper**: accumulator that turns variable frame time into fixed ticks (max 5 catch-up ticks per frame).
- **render/**: reads `GameState` and interpolates between `prevPosition` and `position` using the stepper alpha.
  The local camera uses the latest input angles directly, so aim is never a tick behind.
- **input/**: `Keyboard` and `PointerLock` collect raw input; `PlayerInput` latches one-shot actions (jump, reload, switch, trigger clicks) until a tick consumes them.
- **ui/**: DOM overlays (start/pause screen, debug overlay, ammo HUD).
- **render/combatPresentation.ts**: after each tick consumes `state.events` (puffs, viewmodel kick, sound);
  each frame draws BBs (instanced, interpolated), puffs, the held replica (second render pass) and the HUD.
- **audio/**: synthesised Web Audio effects; positional for everything but the local player's own replica.
- **render/matchPresentation.ts**: other players (`characterRenderer.ts` + `characterModels.ts`: vertex-coloured greybox
  figures, a few meshes each, one shared material), hit feedback (`ui/hitFeedback.ts`), the spectator camera used once
  you're out, and round messages.
- **render/replicaModels.ts + handModels.ts**: first-person replicas (AR-pattern AEG, polymer pistol) and gloved hands built in code from extruded profiles, capsules and lathe shapes, merged per material; poses are data.
- **game.ts**: composition root and main loop. The only place that knows about every layer.

## Map data

Maps are plain data (`map/mapTypes.ts`): axis-aligned blocks with a visual kind, spawns and dead-zone spots
per team (later also waypoints/cover points). The same data builds Rapier colliders and merged Three.js meshes
(one draw call per surface texture).

## Multiplayer readiness (not implemented)

Fixed tick, command-driven characters, plain-data state and seeded RNG are in place so an authoritative
server can later run the same `stepSimulation`.
