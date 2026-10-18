# src/render/effects

Pooled effects: nothing in flight uploads nothing.

- `impactPuffs.ts`, `impactGrit.ts`, `bbRenderer.ts`, `dustMotes.ts`, drawn with `softDot.ts`'s dot; `gpuPools.ts`
  registers the particle pools the GPU drives (`webgpu/compute/particleTwins.ts`).
- `bbPathsDebug.ts` draws the last BBs' flight paths for the debug overlay; `ownShotStarts.ts` holds your shots until
  the frame's camera is placed, so your BB starts at the muzzle you see (KI1); `bbFlightTime.ts` is how soon a new BB
  meets the level (one ray a shot, for its muzzle convergence).
- `magTosses.ts` (MG1: a code-made box on an arc, one mesh a slot of `GameState.magTosses`), `leafFlecks.ts` (FO1: the
  leaves a BB knocks out of a bush, CPU only, one instanced draw).
