# src/sim

The gameplay rules: plain data and pure functions, with no Three.js, no DOM and no `Math.random` (use `state.rng`).

- `simulation.ts`: `stepSimulation`, the fixed 60 Hz step and the order of its phases.
- `state.ts`, `events.ts`, `commands.ts`, `character.ts`: `GameState`, `state.events`, `PlayerCommand`, `Character`.
- `movement.ts`, `aiming.ts`, `lean.ts`, `accuracy.ts`, `footsteps.ts`: the per-tick stance rules. Lean is one geometry
  (`HITS.lean`): eye, BB origin, hit volume, drawn figure and what bots see all use it.
- `armament.ts`: fire, switch, reload by magazine swap, `WorldQuery`. `shotHeardScale` is the one place a shot's reach
  is read (bots, minimap, sound cues).
- `ballistics.ts`, `air.ts`, `wind.ts`, `hopUp.ts`: BB flight. Gravity, drag by Reynolds number and Magnus lift from the
  hop-up's decaying backspin, one midpoint step a tick; `wind.ts` writes `GameState.wind` from the match seed. What
  leaves the muzzle (`muzzleVelocity`, `bbMass` in `config/replicas.ts`) is the boundary: flight only reads it.
- `bbs.ts`, `hitbox.ts`, `ricochet.ts`, `levelRay.ts`: BBs against the level (through `WorldQuery`) and against
  character capsules. A ricochet knocks someone out only if `HitConfig.ricochetsCount`. `levelRay.ts` is the
  allocation-free slab test that answers Rapier's static ray casts.
- `elimination.ts`: hit calling, alive → calling → walkingOff → out (`leaving` for a walk-off that gets stuck). A hit
  character follows a built-in command and can't fire or be hit.
- `round.ts`, `flag.ts`, `extraction.ts`: the match mode, round clock, score, `restartMatch(mode)`, who attacks, the
  pole, and the Extraction run (exits, cases, waves, grace).
- `rangeTargets.ts` (the practice range; `SimServices.practice` skips the round flow), `torch.ts`, `soundPath.ts` (wall
  rays for hearing), `hitFacts.ts` (the "what got you" card), `rng.ts`, `vec.ts`.
- Tuning, in `config/`: `sim.ts`, `movement.ts`, `hits.ts`, `ballistics.ts`, `replicas.ts`, `modes.ts`, `extraction.ts`.
  Tests: `*.test.ts` beside each file; `testSupport.ts` has `OPEN_FIELD`, a 100 m empty floor.
- Changing it: `stepSimulation`'s phase order, `PlayerCommand`, `GameState` and `state.events` are contracts
  (`docs/ARCHITECTURE.md › Contracts`).
