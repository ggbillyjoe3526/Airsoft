# Assets

Every external asset must be listed here with name, source URL, license and author.
Only CC0 or clearly permissive licenses. No real brand names or trademarked replica designs.

## External assets

No models, textures or sounds yet (the menus' fonts below are the only external files). All geometry is built in code and all textures are generated on a canvas at runtime. The M14 art pass
is procedural too (DECISIONS 2026-10-04: the CC0 asset sites were unreachable from the build environment): the
surface textures (`src/render/proceduralTextures.ts`), Depot's prop detail (`src/render/mapMeshes.ts`), the sky and
trees (`src/render/atmosphere.ts`), the figures (`src/render/characterModels.ts`), the replicas and hands, and the
puffs and dust. The replica's sheen uses Three.js's built-in `RoomEnvironment` scene (part of the `three` package).
CC0 models and textures can replace parts of this later; record each one here (the how-to: [CC0_ASSETS.md](CC0_ASSETS.md);
a player model goes in `src/assets/models/characters/figure.glb`, M25a). Use this format, one row per file:

| File | Asset | Source URL | Licence | Author |
|---|---|---|---|---|
| `src/assets/fonts/Barlow-500.woff2`, `Barlow-700.woff2` | Barlow (Medium, Bold), the menus' text face (G3) | https://fonts.google.com/specimen/Barlow | SIL OFL 1.1 (`src/assets/fonts/OFL.txt`) | Jeremy Tribby, The Barlow Project Authors |
| `src/assets/fonts/BarlowCondensed-600.woff2`, `-700.woff2`, `-800.woff2` | Barlow Condensed (SemiBold, Bold, ExtraBold), the menus' headings, labels and buttons (G3) | https://fonts.google.com/specimen/Barlow+Condensed | SIL OFL 1.1 (`src/assets/fonts/OFL.txt`) | Jeremy Tribby, The Barlow Project Authors |

The fonts are the only external files (graphics overhaul G3), served with the game since the page's policy loads
fonts from itself only; the licence travels beside them.

## Made by the project

The menus' pictures in `public/menu/` (G3) are the game's own frames: `pipeline/map-stills.mjs` renders each map
still (one per map and time of day), each mode's picture, the title's backdrop and the one pre-blurred backdrop from the
built game, and saves them as small JPEGs (`src/config/menuArt.ts` lists them and their byte budgets). Run it again
when a map, its lighting or the renderer's look changes. No outside source; same licence as the code.

All sounds are synthesised in code when audio starts
(recipes in `src/config/sounds.ts`, rendered by `src/audio/dsp.ts`); there are no audio files.

## Libraries (npm)

| Package | License | Use |
|---|---|---|
| three | MIT | Rendering |
| @dimforge/rapier3d-compat | Apache-2.0 | Collision / character controller |
| vite (dev) | MIT | Build tool |
| vitest (dev) | MIT | Unit tests |
| typescript (dev) | Apache-2.0 | Type checking |
