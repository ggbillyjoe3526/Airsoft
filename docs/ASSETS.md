# Assets

The register of every external asset in the game: name, source URL, licence and author. Only CC0 or clearly permissive
licences. No real brand names or trademarked replica designs.

## External assets

The menus' fonts are the only external files. The game's own model files (made for it, listed below) are the only
models; there are no external textures or sounds yet: the rest of the geometry is built in code and all textures are
generated on a canvas at runtime.

The art is procedural too (M14; DECISIONS 2026-10-04: the CC0 asset sites were unreachable from the build environment):

- **Surface textures:** `src/render/proceduralTextures.ts`.
- **Depot's prop detail:** `src/render/mapMeshes.ts`.
- **The sky and trees:** `src/render/atmosphere.ts`.
- **The figures:** `src/render/characterModels.ts`.
- **Replicas, hands, puffs and dust.**
- **The replica's sheen:** lit by the game's own sky (`src/render/replicaSheen.ts`).

CC0 models and textures can replace parts of this later. Record each one here, one row per file, in the format below
([CC0_ASSETS.md](CC0_ASSETS.md) is the how-to). A player model goes in `src/assets/models/characters/figure.glb` (M25a),
a replica's in `src/assets/models/replicas/<replica id>.glb` (M101).

| File | Asset | Source URL | Licence | Author |
|---|---|---|---|---|
| `src/assets/fonts/Inter-500.woff2`, `Inter-600.woff2`, `Inter-700.woff2`, `Inter-800.woff2` | Inter (Medium, SemiBold, Bold, ExtraBold; latin subset, from @fontsource/inter 5.3.0), the menus' and the HUD's face for all text and numbers (M100; replaces Barlow and Barlow Condensed, owner 2026-10-07) | https://github.com/rsms/inter | SIL OFL 1.1 (`src/assets/fonts/OFL.txt`) | Rasmus Andersson, The Inter Project Authors |
| `src/assets/fonts/Inter-marks-500.woff2`, `Inter-marks-600.woff2`, `Inter-marks-700.woff2`, `Inter-marks-800.woff2` | Inter's three symbols the latin subset lacks, ← → ✓ (about 0.6 KB a weight; cut from the same four weights of Inter 4.1.1 in the `inter-ui` npm package, because `@fontsource/inter` 5.3.0 has no subset with them), loaded only where one is printed (`unicode-range`, `src/ui/menus/css/fonts.css`; M100) | https://github.com/rsms/inter | SIL OFL 1.1 (`src/assets/fonts/OFL.txt`) | Rasmus Andersson, The Inter Project Authors |

**Made for the game** (original work, no external source; licensed with the game's code):

| File | Asset | Made with | Author |
|---|---|---|---|
| `src/assets/models/replicas/cyber.glb` | The Cyber Pistol in the hands (1,352 triangles), its magazine and its figure version (112 triangles) (M101, 2026-10-10) | Blender 5.2, built through the owner's Blender connection; source `.blend` kept by the owner | Claude for William (owner) |

The font is served with the game (graphics overhaul G3, Inter since M100) because the page's policy loads fonts from itself only. The
licence travels beside them.

## Made by the project

- **The menus' pictures** in `public/menu/` (G3) are the game's own frames. `pipeline/map-stills.mjs` renders each map
  still (one per map and time of day), each mode's picture and the one pre-blurred backdrop (every screen but the title,
  which is plain navy drawn by the stylesheet) from the built game, and saves them as small JPEGs
  (`src/config/menuArt.ts` lists them and their byte budgets). Run it again when a map, its lighting or the renderer's
  look changes. No outside source; same licence as the code.
- **All sounds** are synthesised in code when audio starts (recipes in `src/config/sounds.ts`, rendered by
  `src/audio/dsp.ts`). There are no audio files.

## Libraries (npm)

| Package | Licence | Use |
|---|---|---|
| three | MIT | Rendering |
| @dimforge/rapier3d-compat | Apache-2.0 | Collision / character controller |
| vite (dev) | MIT | Build tool |
| vitest (dev) | MIT | Unit tests |
| typescript (dev) | Apache-2.0 | Type checking |
| @playwright/test (dev) | Apache-2.0 | Browser (end-to-end) tests |
| @types/three (dev) | MIT | Three.js type definitions |
