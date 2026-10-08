# src/physics

Rapier (`@dimforge/rapier3d-compat`): level collision and the character controller. The simulation never calls Rapier.

- `physicsWorld.ts`: `initPhysics()` loads the WASM; `PhysicsWorld` implements the sim's `CharacterMover` and
  `WorldQuery`, built from a map's blocks.
- Characters collide only with level geometry, never each other. Level blocks collide as closed triangle meshes, which
  avoids a Rapier capsule-vs-cuboid bug.
- Standing characters move horizontally, then `probeGround` (a downward sphere cast) rests them 0.04 m above the floor;
  Rapier's snap-to-ground is deliberately not used.
- The static ray casts (`raycastStatic`, `raycastSurface`) are answered by `sim/levelRay.ts`, held to Rapier's answer by
  `levelRay.rapier.test.ts`. The sim returns anything below `killY` to its spawn.
- Tuning: `config/physics.ts`. Tests: `physicsWorld.test.ts`, `levelRay.rapier.test.ts`.
- Rapier is its own chunk with a size budget (`vite.config.ts`, `config/chunkBudget.ts`).
