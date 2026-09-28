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

- **sim/**: all gameplay rules. Plain data (`GameState`, `Character`), no Three.js, no DOM, no `Math.random`.
  Advances only via `stepSimulation(state, commands, ctx, dt)`. Randomness comes from the seedable `state.rng`.
- **Commands**: every character (player, bot, later remote players) is driven by one `PlayerCommand` per tick,
  passed to the sim in a Map keyed by character id.
  View angles are absolute, so a lost or duplicated command can't accumulate drift.
- **physics/**: `PhysicsWorld` implements the sim's `CharacterMover` interface (Rapier kinematic character
  controller). Characters collide only with level geometry, never each other. Level blocks collide as
  closed triangle meshes to avoid a Rapier capsule-vs-cuboid bug. The sim returns anything below `killY` to its spawn.
- **core/fixedStepper**: accumulator that turns variable frame time into fixed ticks (max 5 catch-up ticks per frame).
- **render/**: reads `GameState` and interpolates between `prevPosition` and `position` using the stepper alpha.
  The local camera uses the latest input angles directly, so aim is never a tick behind.
- **input/**: `Keyboard` and `PointerLock` collect raw input; `PlayerInput` latches one-shot actions (currently jump) until a tick consumes them.
- **ui/**: DOM overlays (start/pause screen, debug overlay, HUD).
- **game.ts**: composition root and main loop. The only place that knows about every layer.

## Map data

Maps are plain data (`map/mapTypes.ts`): axis-aligned blocks with a visual kind and spawns (later also
waypoints/cover points). The same data builds Rapier colliders and merged Three.js meshes
(one draw call per surface texture).

## Multiplayer readiness (not implemented)

Fixed tick, command-driven characters, plain-data state and seeded RNG are in place so an authoritative
server can later run the same `stepSimulation`.
