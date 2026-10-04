# Using CC0 models and textures

How to bring free CC0 assets (public domain: free to use, change and ship, no credit required) into the game,
starting with the player models (M25a). Everything in the game is still built in code; this is the path for
replacing parts of it with downloaded art.

## 1. How the files get into the repository

The cloud environment that builds the game can't reach the asset sites (its network policy blocks Kenney,
ambientCG, Poly Haven and Quaternius), so a file reaches the repository one of two ways:

1. **You download it and commit it** (or upload it to the project and ask Claude to commit it). This always works.
2. **The asset sites are allowed in the environment's network policy** (Project settings, Cloud environment, the gear
   beside the environment, Network access: Custom with `kenney.nl`, `ambientcg.com`, `polyhaven.com`,
   `quaternius.com` and their download hosts under Allowed domains). Then Claude can fetch, convert and commit them
   itself. Steps: <https://code.claude.com/docs/en/cloud-environments#network-access>.

## 2. Where to find CC0 assets

| Source | What's there | Good for | Notes |
|---|---|---|---|
| [Quaternius](https://quaternius.com) | Low-poly characters, many rigged and animated, plus props | **Player models** (the "Ultimate Modular Characters", "Universal Base Characters" packs) | glTF / FBX; small, stylised, fits the toy-like tone |
| [Kenney](https://kenney.nl/assets) | Low-poly kits: characters, props, crates, barriers, buildings | Props, map dressing, simple figures ("Blocky Characters", "Mini Characters") | glTF in most packs; tiny files |
| [Kay Lousberg](https://kaylousberg.com/game-assets) | Stylised low-poly packs (the free tiers are CC0) | Characters and props with a clean, toy look | Check each pack says CC0 |
| [Poly Haven](https://polyhaven.com) | Photo-scanned models, PBR textures, HDRI skies | Realistic props, surface textures, a sky | Heavy at 4K: take 1K or 2K |
| [ambientCG](https://ambientcg.com) | PBR texture sets (concrete, metal, wood, ground) | Surface textures for walls, floors, crates | Take the 1K or 2K JPG set |
| [OpenGameArt](https://opengameart.org) (CC0 filter) | Mixed | Odd one-offs | Licences vary per item: only take ones marked CC0 |

Stylised low-poly (Quaternius, Kenney, Kay Lousberg) suits the game better than photo-scans: it matches the
procedural look, stays readable at a distance and keeps the download small. No real brands or trademarked replica
designs, whatever the licence (CLAUDE.md §4).

## 3. Formats

- **Models: glTF binary (`.glb`)**, one file with the meshes, materials and textures inside. If a pack only has
  FBX or OBJ, open it in Blender (free) and export glTF 2.0, format "glTF Binary".
- **Compression:** meshopt is supported (run `npx gltfpack -i in.glb -o out.glb -cc`, or glTF-Transform's
  `meshopt`). Draco and KTX2 / Basis textures are not supported yet (they need decoder files the game doesn't ship);
  a file using them falls back to the built-in figures with a warning in the console.
- **Textures:** the PBR metal-roughness set glTF uses:
  - base colour (albedo), sRGB;
  - normal map (OpenGL style, +Y up; ambientCG's `_NormalGL`, not `_NormalDX`);
  - ORM: ambient occlusion, roughness and metalness packed in the R, G and B channels (or separate roughness
    and metalness maps, which Blender packs on export).
  - 1K (1024 px) for props and figures, 2K at most for large surfaces; power-of-two sizes; JPG for colour, PNG
    for normal maps; WebP inside a GLB is fine. KTX2 is a later step if texture memory becomes a problem.

## 4. Where the files go, and what the game does with them

```
src/assets/models/characters/figure.glb   the player and bot model (M25a, wired up)
src/assets/models/props/                  props (not wired up yet)
src/assets/textures/                      loose surface textures (not wired up yet)
```

**The figure model** (`src/render/externalModels.ts`, settings in `src/config/assets.ts`):

- The game looks for `figure.glb` when it's built (or the dev server starts). Without it nothing is fetched and the
  built-in figures are drawn, exactly as today. With it, the model loads once at start and every player and bot
  uses it. A broken or unsupported file logs a warning and the built-in figures are drawn instead.
- **Scale and facing are automatic:** the model is scaled so it stands as tall as the hit volume (1.73 m, feet to
  the top of the head; the hitbox doesn't change), its feet are put on the ground, and it is turned a half turn
  (glTF models face +Z, the figures face -Z; set `FIGURE_MODEL.yaw` to 0 for a model that already faces -Z).
- **Team colours:** any material whose name starts with `team` (for example `TeamTape`, `team_vest`) is painted
  in each figure's team colour (including the colour-blind palettes). Name the armband, vest or tape that way in
  Blender.
- **Two levels of fit:**
  1. **Whole model** (straight from a pack, nothing renamed): a preview. It is drawn as one static body that
     turns and moves with the figure and squashes down when crouching (to the hit volume's height), but doesn't
     walk or lean. The built-in arms and replica are drawn as well, so the model's own arms show beside them (in a
     T-pose, for most rigged pack models). A quick way to see a model in game, not one to play with.
  2. **Named parts** (the proper way): split the model in Blender into objects named exactly as below. Each one is
     moved like the built-in part it replaces; any part left out is drawn by the built-in figure.

| Node name | What it is | Pivots at |
|---|---|---|
| `body` | Torso, head and kit: everything above the hips | Hips (drops when crouching, rolls when leaning) |
| `legL`, `legR` | Each leg, hip to boot (the model's left is `legL`) | Its hip (swings when walking) |
| `aimRifle` | Arms holding the rifle | The shoulder line (pitches with the aim) |
| `aimPistol` | Arms holding the pistol | The shoulder line |
| `hitPose` | Hit calling: one hand up, the replica hanging | Hips |

Author the parts in place, in one scene, standing as they would on the figure: metres, feet at the origin, +Y up.
The game cuts them at those pivots itself. Skinned (rigged) meshes load and are turned into plain meshes in the pose
the rig is saved in (its rest pose), so a part can be cut from a rigged character and its bones are left behind:
the game doesn't play glTF animations yet (a later step: a walk cycle and the hit-call animation from a rigged pack).

## 5. Blender, step by step (a Quaternius or Kenney character)

1. File, Import, glTF 2.0 (or FBX). Apply the pose you want as rest pose if it's rigged.
2. Separate the mesh into the parts above (Edit Mode, select, `P`, Selection) and rename each object in the
   Outliner. Hands can stay with `body` if you don't make the aim parts.
3. Rename the team-coloured material to start with `Team`.
4. Check the size budget below; decimate (Modifier, Decimate) if the triangle count is high.
5. File, Export, glTF 2.0: format glTF Binary, Include "Selected Objects" off, Apply Modifiers on, Compression off
   (or meshopt via gltfpack afterwards).
6. Save it as `src/assets/models/characters/figure.glb`, run `npm run dev`, and play: the figures should be the model.
   The console says if anything was wrong with it.
7. Add a line to `docs/ASSETS.md` and commit both.

## 6. Size limits for the web

The whole first download aims to stay under ~30 MB (CLAUDE.md §4); the game is about 5.4 MB today, 2 MB
compressed, most of it the physics engine.

| What | Budget |
|---|---|
| The figure model | **≤ 3 MB** (the loader warns above that), ≤ 15,000 triangles, ≤ 4 materials, 1K textures |
| A prop | ≤ 300 KB, ≤ 2,000 triangles, sharing textures with other props where possible |
| A surface texture set | ≤ 1.5 MB at 1K (colour, normal, ORM) |
| Everything external | ≤ 25 MB, so the game stays under 30 MB |

Every figure on the field (six in a 3v3) shares the model's geometry; each has its own copy of the materials only (so
one can fade on its own), so the model's triangle count, not the team size, sets the cost.

## 7. Licences and attribution

CC0 needs no credit, but **every external file is still recorded in [`ASSETS.md`](ASSETS.md)**: name, source URL,
licence and author, plus the file it went into. That keeps the repository auditable (proof each file was CC0 when
taken), lets the game credit the authors anyway if it ever goes public, and makes a file easy to swap out. Keep
a copy of the pack's `License.txt` next to the file if the pack ships one. Never take an asset whose page doesn't
say CC0 (or a clearly permissive licence agreed in `DECISIONS.md`).

## 8. What isn't wired up yet

- Props and surface textures from files: Depot's props and textures are built in code (`src/render/mapMeshes.ts`,
  `src/render/proceduralTextures.ts`). Swapping one in means a small loader like the figure's, per kind of block.
- glTF animations (walk cycle, hit call) for rigged models.
- Draco and KTX2 compression.
