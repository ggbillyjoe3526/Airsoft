# Architecture

## Layers

```
input ──► PlayerCommand ──┐
ai (bots) ─► PlayerCommand ┤
                           ▼
                   sim (pure, fixed 60 Hz) ◄── physics (Rapier: level collision + ray casts)
                           │ plain-data GameState + events
                           ▼
          render (Three.js) · audio (Web Audio) · ui (DOM HUD)
```

- **sim/**: all gameplay rules. Plain data (`GameState`, `Character`), no Three.js, no DOM, no `Math.random`.
  Advances only via `stepSimulation(state, commands, ctx, dt)`. Randomness comes from the seedable `state.rng`.
- **Commands**: every character (player, bot, later remote players) is driven by one `PlayerCommand` per tick.
  View angles are absolute, so a lost or duplicated command can't accumulate drift.
- **physics/**: `PhysicsWorld` implements the sim's `CharacterMover` interface (Rapier kinematic character
  controller) and provides static-geometry ray casts. Characters collide only with level geometry.
- **core/fixedStepper**: accumulator that turns variable frame time into fixed ticks (max 5 catch-up ticks per frame).
- **render/**: reads `GameState` and interpolates between `prevPosition` and `position` using the stepper alpha.
  The local camera uses the latest input angles directly, so aim is never a tick behind.
- **input/**: `Keyboard` and `PointerLock` collect raw input; `PlayerInput` latches one-shot actions (jump,
  reload, switch, trigger press) until a tick consumes them.
- **ui/**: DOM overlays (start/pause screen, debug overlay, HUD).
- **game.ts**: composition root and main loop. The only place that knows about every layer.

## Map data

Maps are plain data (`map/mapTypes.ts`): axis-aligned blocks with a visual kind, spawns, and later
waypoints/cover points. The same data builds Rapier colliders and merged Three.js meshes
(one draw call per surface texture).

## Multiplayer readiness (not implemented)

Fixed tick, command-driven characters, plain-data state and seeded RNG are in place so an authoritative
server can later run the same `stepSimulation`.
