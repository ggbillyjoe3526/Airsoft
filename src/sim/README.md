# src/sim

The gameplay rules: plain data and pure functions, with no Three.js, no DOM and no `Math.random` (use `state.rng`).

- `simulation.ts`: `stepSimulation`, the fixed 60 Hz step and the order of its phases.
- `state.ts`, `events.ts`, `commands.ts`, `character.ts`: `GameState`, `state.events`, `PlayerCommand`, `Character`.
- `movement.ts`, `aiming.ts`, `lean.ts`, `accuracy.ts`, `footsteps.ts`: the per-tick stance rules. Lean is one geometry
  (`HITS.lean`): eye, BB origin, hit volume, drawn figure and what bots see all use it.
- `vault.ts` (M102): Jump at a low obstacle vaults it. `planVault` reads the level's rays (height, depth, a floor to land
  on, the body's height clear over it), `tryVault` starts one in place of the jump (a `vault` footstep), `stepVault`
  moves the body along it through `CharacterMover` in place of the movement step, and `stepVaultReady` answers each
  tick whether a press would vault (`VaultState.ready`, read by the prompt, DX6). Tuning: `config/vault.ts`.
- `armament.ts`: fire, switch, holster (M92: put away for a faster run, never past the sprint, drawn back slower), reload by magazine
  swap, `WorldQuery`. `shotHeardScale` is the one place a shot's reach is read (bots, minimap, sound cues).
- `magShare.ts` (MG1): a teammate's magazine. `PlayerCommand.tossMag` names who gets one; `canTossTo` (teammates in
  play, in reach and sight, a spare of the right class with room), `tossMag` takes the BBs out of the thrower's pouch
  into `GameState.magTosses`, `stepMagTosses` lands them in the catcher's emptiest spares (`magToss`, `magCaught`,
  `magLost`). BBs move, never appear. `lowOnMags` is the one "low on BBs" rule. Tuning: `config/magShare.ts`.
- `ballistics.ts`, `air.ts`, `wind.ts`, `hopUp.ts`: BB flight. Gravity, drag by Reynolds number and Magnus lift from the
  hop-up's decaying backspin, one midpoint step a tick; `wind.ts` writes `GameState.wind` from the match seed. What
  leaves the muzzle (`muzzleVelocity`, `bbMass` in `config/replicas.ts`) is the boundary: flight only reads it.
- `bbs.ts`, `hitbox.ts`, `ricochet.ts`, `levelRay.ts`: BBs against the level (through `WorldQuery`) and against
  character hit volumes (`hitbox.ts`: chest, hips and swinging legs, matched to the drawn figure by
  `render/figures/figureHitVolume.test.ts`; with the rigged figures drawn the legs sit on theirs, `figureLegs.ts` blending their
  leg clips by the figure's own rules, IM8, and the head, chest, shoulders and hips on theirs, `figureBody.ts`
  blending their upper-body points the same way, HV1; every match since BD1). Every body stops a BB; only one in play is knocked out (M85). A ricochet knocks
  someone out only if `HitConfig.ricochetsCount`. `levelRay.ts` is the
  allocation-free slab test that answers Rapier's static ray casts. `leaves.ts` (FO1): a BB that runs into a bush
  (`WorldQuery.foliage`) stops once it has crossed `stopDepth` of leaves (`BB.leaf`), and one out of an edge is thrown
  off and slowed by how much it crossed.
- `propNoise.ts` (NP1): noisy props. `stepPropBump` (after the move) knocks the noisy prop a run or sprint hit hard
  (`propNoise` from its face), `ringProp` (from `bbs.ts`) rings steel a BB lands on fast; each prop at most once per
  `NOISE.quiet` (`GameState.propQuiet`). `footsteps.ts` puts the ground underfoot on a step (`WorldQuery.surfaceUnder`)
  so the bots and the audio read how far it carries. Tuning: `config/noise.ts`.
- `elimination.ts`: hit calling, alive → calling → walkingOff → out (`leaving` for a walk-off that gets stuck). A hit
  character follows a built-in command and can't fire or be hit.
- `round.ts`, `flag.ts`, `extraction.ts`: the match mode, round clock, score, `restartMatch(mode)`, who attacks, the
  pole, and the Extraction run (exits, cases, waves, grace). `overtimeFlag.ts` (OT1): Elimination's overtime flag, up
  after a time-out nobody wins; the first team to touch it takes the round. `roster.ts`: who plays on which team (M98: the player,
  character 0, on the picked team, Alpha or Beta); nothing else may take the player's team to be team 0.
- `rangeTargets.ts` (the practice range's targets, still and moving; `SimServices.practice` skips the round flow),
  `rangeChallenge.ts` (Practice's timed challenge, stepped after the simulation by `RangeSession`; on a map it lights
  only targets in your sight, M94), `torch.ts`,
  `soundPath.ts` (wall rays for hearing), `hitFacts.ts` (the "what got you" card), `rng.ts`, `vec.ts`.
- Tuning, in `config/`: `sim.ts`, `movement.ts`, `hits.ts`, `ballistics.ts`, `replicas.ts`, `modes.ts`, `extraction.ts`.
  Tests: `*.test.ts` beside each file; `testSupport.ts` has `OPEN_FIELD`, a 100 m empty floor.
- Changing it: `stepSimulation`'s phase order, `PlayerCommand`, `GameState` and `state.events` are contracts
  (`docs/ARCHITECTURE.md › Contracts`).
