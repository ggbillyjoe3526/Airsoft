# Assets

Every external asset must be listed here with name, source URL, license and author.
Only CC0 or clearly permissive licenses. No real brand names or trademarked replica designs.

## External assets

None yet. All geometry is built in code and all textures are generated on a canvas at runtime. The M14 art pass
is procedural too (DECISIONS 2026-10-04: the CC0 asset sites were unreachable from the build environment): the
surface textures (`src/render/proceduralTextures.ts`), Depot's prop detail (`src/render/mapMeshes.ts`), the sky and
trees (`src/render/atmosphere.ts`), the figures (`src/render/characterModels.ts`), the replicas and hands, and the
puffs and dust. The replica's sheen uses Three.js's built-in `RoomEnvironment` scene (part of the `three` package).
CC0 models and textures can replace parts of this later; record each one here. All sounds are synthesised in code when audio starts
(recipes in `src/config/sounds.ts`, rendered by `src/audio/dsp.ts`); there are no audio files.

## Libraries (npm)

| Package | License | Use |
|---|---|---|
| three | MIT | Rendering |
| @dimforge/rapier3d-compat | Apache-2.0 | Collision / character controller |
| vite (dev) | MIT | Build tool |
| vitest (dev) | MIT | Unit tests |
| typescript (dev) | Apache-2.0 | Type checking |
