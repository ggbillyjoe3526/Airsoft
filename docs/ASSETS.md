# Assets

The register of every external asset in the game: name, source URL, licence and author. Only CC0 or clearly permissive
licences. No real brand names or trademarked replica designs.

## External assets

The menus' fonts are the only external files. The game's own model files (made for it, listed below) are the only
models; there are no external textures or sounds yet: the rest of the geometry is built in code and all textures are
generated on a canvas at runtime.

The art is procedural too (M14; DECISIONS 2026-10-04: the CC0 asset sites were unreachable from the build environment):

- **Surface textures:** `src/render/field/proceduralTextures.ts`.
- **Depot's prop detail:** `src/render/field/mapMeshes.ts`.
- **The sky and trees:** `src/render/light/atmosphere.ts`.
- **The figures:** `src/render/figures/characterModels.ts`.
- **Replicas, hands, puffs and dust.**
- **The replica's sheen:** lit by the game's own sky (`src/render/replicas/replicaSheen.ts`).

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
| `src/assets/models/replicas/cyber.glb` | The Cyber Pistol redesigned from the owner's reference pictures (RM5, 2026-10-12; first made in M101, RM1, 2026-10-10): in the hands (2,688 triangles) with its magazine, slide, trigger and fire selector, its figure version (148 triangles), and its fire, selector, reload and inspect animations | Blender 5.2, built through the owner's Blender connection; source `cyber_pistol_v2.blend` kept by the owner | Claude for William (owner) |
| `src/assets/models/replicas/aeg.glb` | The AEG rifle redesigned from the owner's reference photos (RM6, 2026-10-12; first made in RM1, 2026-10-10): in the hands (8,090 triangles) with its magazine and flash hider, its figure version (252 triangles), and eight moving parts with their animations: trigger, fire selector, folding sights, magazine release, charging handle, dust cover, hop-up dial | Blender 5.0, built from scripts in a separate Blender (not the owner's); source `aeg_rifle_v2.blend` kept by the owner | Claude for William (owner) |
| `src/assets/models/replicas/pistol.glb` | The GBB Pistol redesigned from the owner's six reference photos (RM7, 2026-10-12; first made as the gas pistol in RM1, 2026-10-10): in the hands (3,190 triangles) with its magazine, slide, trigger and magazine release, its figure version (180 triangles), and its fire (the blowback), reload, inspect and slide-lock animations | Blender 5.2, as above; source `gbb_pistol.blend` kept by the owner | Claude for William (owner) |
| `src/assets/models/powerSources/standardBattery.glb`, `lipoBattery.glb`, `gasBottle.glb` | The menus' pictures of the Standard Battery (744 triangles), the 11.1 V LiPo Battery (484) and the gas bottle (808; its `Label` is painted per gas: Green, Red and Black Gas) in Customise, the Loadout and the Armory (RM3, 2026-10-10) | Blender 5.2, as above | Claude for William (owner) |
| `src/assets/models/characters/human.glb`, `robot.glb`, with `human.json`, `robot.json` | The rigged bot figures (BF1, approved by the owner 2026-10-12): a human player, redesigned from the owner's reference photos (RM9, approved 2026-10-13: 19,966 triangles with the largest of its four heads, a texture atlas baked from procedural materials in Blender, 2.8 MB) and a bare robot (17,092, team-colour panels; its textures, canvas, ripstop and stipple weaves, generated in Blender; 2.4 MB), each with LOD1 and LOD2 meshes, a 65-bone skeleton and 23 clips (moving, aiming, reloads, the switch, the hit call, the walk-off, the trigger press); packed losslessly with `tools/blender/bot-figure/pack.mjs` (IM5; 4.2 and 4.5 MB as exported), fetched only with the Dev model switches off | Blender 5.2, from the scripts in `tools/blender/bot-figure/` | Claude for William (owner) |
| `src/assets/models/replicaParts/aeg.glb`, `pistol.glb`, `cyber.glb` | The fittable parts: the AEG's red dot, 2x scope, two foregrips, long and tight-bore barrels, silencer, weapon torch, low-cap and hi-cap magazines; the GBB Pistol's laser, torch, silencer and extended magazine (RM1, 2026-10-10; refitted to the GBB Pistol in RM7, 2026-10-12); the red dot, 2x scope, silencers and torches redesigned and the Cyber Pistol's torch added (RM8, 2026-10-12, built headless in Blender 5.0; source `attachments_v1.blend` in the project files); the 2x scope given a dark core behind its glass (PT1, 2026-10-13; source `attachments_v2.blend`) | Blender 5.2, as above | Claude for William (owner) |

The font is served with the game (graphics overhaul G3, Inter since M100) because the page's policy loads fonts from
itself only. Its licence ships in the build's licences file (Libraries, below).

## Made by the project

- **The menus' pictures** in `public/menu/` (G3) are the game's own frames. `pipeline/map-stills.mjs` renders each map
  still (one per map and time of day, and the range's, drawn from Practice since M94), each mode's picture and the one pre-blurred backdrop (every screen but the title,
  which is plain navy drawn by the stylesheet) from the built game, and saves them as small JPEGs
  (`src/config/menuArt.ts` lists them and their byte budgets), drawn on WebGPU by the node renderer since W7
  (2026-10-12). Run it again when a map, its lighting or the renderer's look changes. No outside source; same licence as
  the code.
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
| prettier (dev) | MIT | Formatting |
| meshoptimizer, inside three | MIT | The packed models' decoder (`three/examples/jsm/libs/meshopt_decoder.module.js`) |
| fast-check (dev) | MIT | Property tests: generated inputs for ballistics, routes and round rules (TL1) |
| @fast-check/vitest (dev) | MIT | Runs fast-check properties as Vitest tests (TL1) |
| knip (dev) | ISC | Finds unused files, exports and dependencies: `npm run knip` (TL1) |
| chrome-devtools-mcp (dev tool, not installed) | Apache-2.0 | MCP server for performance traces and console errors, run by `npx` from `.mcp.json` (TL1) |
| @playwright/mcp (dev tool, not installed) | Apache-2.0 | MCP server for clicking through the game in a bug pass, run by `npx` from `.mcp.json` (TL1) |

Every build writes `third-party-licences.txt` beside the page, linked from the title screen's Licences (LC1). Vite's
`build.license` fills it with each bundled package and its licence text; `vite.config.ts` › `vendoredLicences()` adds
what ships from inside a package or from the repo (`src/config/thirdPartyLicences.ts`: meshoptimizer's decoder and
Inter's OFL). Dev packages never ship, so they aren't in it. Code bundled from inside a package, or a font or other
file the game serves, gets a `VENDORED_NOTICES` entry; an npm package needs nothing more.

## Adding a library or tool

Every third-party package, tool or asset follows these rules (owner, 2026-10-18).

1. **npm only.** Libraries the game runs go in `dependencies`, tools and test helpers in `devDependencies`, with the
   lockfile committed. Never copy a library's source into `src/` when a package exists.
2. **A reason in the pull request.** Say why it is needed (CLAUDE.md §9). The fixed stack (CLAUDE.md §3), the nav grid
   and the synthesised audio change only with the owner.
3. **A row here.** Add it to Libraries (package, licence, use) in the same pull request.
4. **Dev-only code stays out of the release.** Debug overlays and test tools load only in dev builds
   (`import.meta.env.DEV`) or as dev packages, so they never reach players and need no notice.
5. **Tools stay out of the repo.** MCP servers, editors and asset tools are installed on the owner's PC or listed in
   `.mcp.json`. Only what they make (models, textures, sounds) comes into the repo.
6. **No GPL or LGPL code in the game.** GPL programs are fine as tools, but none of their code is bundled: GPL would
   make the whole game GPL, and LGPL can't practically be complied with in a bundled web game.
7. **Assets carry their own licences.** CC0 or clearly permissive only (CLAUDE.md §4), each with its source URL,
   licence and author in External assets. For anything an AI model made (a mesh, a voice, music), the trained model's
   licence decides, not the repo's.
8. **Within the budgets.** Anything that ships fits the first download of about 30 MB (`src/config/chunkBudget.ts`)
   and passes the performance agent.

## Do not use

They look free, but their terms conflict with releasing the game. Never recommend or install them.

| Repo or source | Why not |
|---|---|
| coqui-ai/TTS's XTTS-v2 voices | The model is under the Coqui Public Model License: non-commercial use of it and its output only, and Coqui has shut down, so no other licence can be bought |
| Piper voices (OHF-Voice/piper1-gpl) | Each voice has its own licence in its `MODEL_CARD`, some restrictive; use one only after checking that voice's licence |
| microsoft/TRELLIS and TRELLIS.2 | The repo is MIT, but it depends on nvdiffrast, licensed for research and evaluation only |
| Tencent-Hunyuan/Hunyuan3D-2 and 2.1 | The licence excludes the EU, the UK and South Korea; this includes the Blender connection's Hunyuan3D option |
| facebookresearch/audiocraft (MusicGen) | The code is MIT, but the trained models are CC BY-NC 4.0 (non-commercial) |
| Sketchfab and Poly Pizza models | Licences vary per model: some need credit, some ban commercial use; use one only after checking that model's licence |

## Licences: what each asks

What a licence needs in the repo and in the shipped game. A guide, not legal advice.

| Licence | In the repo | In the shipped game |
|---|---|---|
| MIT, ISC | Nothing extra; npm keeps each package's `LICENSE` | Its copyright line and licence text in the licences file |
| Apache-2.0 | Mark any file you change | As MIT, plus the package's `NOTICE` text if it has one (Rapier has none) |
| SIL OFL 1.1 | Keep `OFL.txt` beside the font files | Its text in the licences file; never sell the font alone, and rename it if modified |
| Zlib, CC0, Unlicense | Keep any notice already in the source | Nothing; credit is optional |
| CC BY | A row in External assets | Credit the creator |
| GPL, LGPL | Tools only; never copy their code in | Nothing, as long as none of their code is in the game |
