# DX6 · Render: the folder regrouped, the prop builders as data, no per-frame vault rays (audit A3, A8 part, B4, B9 part)

**Review:** 1 attempt · 7/8 · Accept (Opus)

## Attempts

| Date | Attempt | Worker model | build | tests | smoke | perf | scope | changelog | Critic | Retry reason | Wall time | Worker tokens |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 2026-10-17 | 1 | Opus 5.5 (worker) | ✓ 19 s | ✓ 606 s (both) | – CI | ✓ 3195 s | ✓ (touches widened for slow-times.json and a round.css comment) | ✓ | 7/8 Accept (Opus) | – | ~6 h | QA 50k · performance 28k · critic 77k |

## Decisions

- **Seven groups, not five:** `field/` (blocks, terrain, plants, signs, decals, textures; `field/mapPieces/` the
  builders), `dressing/` (set dressing, the skyline, their moving pieces: 13 files that would have made `field/` 32),
  `light/`, `figures/`, `replicas/`, `effects/`, and `match/` (the session-facing presentation: match and combat
  presentation, spectator camera, flag, exits, cases, camera rig, range targets). `render/README.md` is the index.
- **The renderer's core stays at the root:** `renderer.ts`, `rendererParts.ts`, `rendererStart.ts`, `webgpuProbe.ts`,
  `gpuCheck.ts`, `qualityStepDown.ts`, `retroFilter.ts`, `nodePatch.ts`, `testSupport.ts` (the QA scope rule
  `src/.*/testSupport.ts` still matches it).
- **Borderline files go where the old README described them:** `viewmodel.ts` and `eyepiece.ts` with the replicas
  (the held replica), `modelFiles.ts` with the figures, `contactShadows.ts` with the light, `smokePlumes.ts`,
  `fireflies.ts` and `passingPlane.ts` with the dressing (`dressingEffects.ts` owns them), `cityProps.ts` in
  `field/mapPieces/` (it is a prop builder).
- **Tests moved with their subject;** a test named after no file went with the group it imports most; the cross-cutting
  renderer, disposal and source-scanning QA tests stay at the root.
- **`post/` and `webgpu/` had no README:** each gets one with its part of the old render README, which became the
  index ("keep theirs" read as keeping their description).
- **Paths were rewritten by resolving every relative string** (imports, `vi.mock`, globs, `new URL`, template-literal
  prefixes) against the old layout, and every `src/render/<file>` / `render/<file>` in code comments, pipeline scripts,
  `vite.config.ts` SLOW_TESTS, the perf scope map and the live docs. `docs/archive/` and older records are history and
  keep their paths. The 64 files outside `touches` that name a moved path joined the block's touches in the first commit.
- **The piece table is a full `Record<BlockKind, PieceBuilder>`** (`mapPieces/pieceTable.ts`), so a new block kind must
  pick a builder; the two conditional kinds (a crate on a crate, a barrier with map detail) are small lambdas in the
  table, and a finished block (M34f) is still decided before it. `wallPieces` reads its finish from the block.
- **More than the builders left `mapMeshes.ts` to get it under 400 lines** (388): the block styles
  (`blockStyles.ts`), the piece shape and ground noise (`pieceShape.ts`) and the ramp wedge (`rampWedge.ts`). Their
  importers import from `mapPieces/` directly; no re-exports. Old against new `blockPieces` gave the same pieces for
  all 1,396 block and detail cases on every map (a temporary test, not committed).
- **The vault answer lives on the character's vault, `VaultState.ready`**, not in an event: the prompt needs the state
  every frame, not a change. `stepVaultReady` asks after the character's move with the tick's command (as a press next
  tick would be), puts the plan it finds into a context scratch (never `c.vault`), and is false out of play and after
  `cancelVault`. It runs for every character in play, bots included, so the simulation stays blind to who controls whom;
  its cost on a headless guard measured within noise (26.4 s without, 26.9 s with).
- **`CombatPresentation.frame` takes `ownView: boolean`** in place of the player's command, which only the prompt read.
- **The per-shot muzzle-convergence ray moved to `effects/bbFlightTime.ts`** (one ray a shot, as before), so
  `combatPresentation.ts` casts no rays at all; a small source test pins that and the `vault.ready` read.
- **`placeMarker(anchor, camera, edge, pin, out)` is the six markers' one step**, keeping each marker's own output slot
  (`EdgePins` lays out the frame's markers by reference) and the way to turn in `markerTowards`, read before the pin
  moves it. It now also takes that angle for the ping and hold markers (one `atan2`, unused there).

## Known issues left

- Import lists in moved files are no longer in path order in places (the rewrite kept each line where it was; no
  linter checks it).
- `matchPresentation.ts` is still 989 lines; the marker helper saved few lines, and splitting it was not in the block.
- The vault answer now runs in the simulation for every in-play character each tick, bots included (early returns,
  allocation-free; the guards ran 26.4 s against 26.9 s). Worth a look if a profile ever shows the sim tick heavy.
- `markerTowards` is shared between `placeMarker` and its callers; a caller reading it without `pin` gets a stale value.
- Critic check 8 (ARCHITECTURE's stepSimulation phase list) was fixed before merge.
- Perf is the build thread's: the vault answer adds up to one level ray a tick for each character in play with nothing
  in reach (more only at an obstacle), against one or more a rendered frame for the player before.
