# src/render

Three.js presentation, all procedural. It reads `GameState` and `state.events`, interpolates with the stepper's alpha
and never writes the simulation. Grouped by what it draws (DX6); each folder's README names its files.

| Folder | What it draws |
|---|---|
| `field/` | The map's blocks merged per texture, the prop builders (`field/mapPieces/`), terrain, foliage, signs, decals and the surface textures |
| `dressing/` | Set dressing (look only, placed from its seed), the skyline beyond the field and its moving pieces |
| `light/` | Sun, sky, night, torches, lamp pools, fixtures, the baked bounce light and the surfaces' node patch |
| `figures/` | The players and bots: the rigged figures, their poses, finish and camo, the built-in figures |
| `replicas/` | The replicas, their parts, files and rigs, the held replica and its hands, the menus' pictures |
| `effects/` | Pooled effects: BBs, puffs, grit, dust, leaf flecks, tossed magazines |
| `match/` | A match's presentation: combat and HUD wiring, spectator camera, flag, exits, cases, range targets |
| `post/` | The post stack's plan and chain |
| `webgpu/` | The node renderer: its back end, the materials' node twins, compute passes and the post passes in TSL |

## At the root

- `renderer.ts`: `Renderer` owns the scene, camera, quality (`setQuality`), lighting and environment, tone mapping,
  field of view and zoom, the retro filter (the node renderer's, `webgpu/post/nodeRetro.ts`; Settings › Dev › Retro
  look), `warmUp` and `warmShaders` (which also compiles what is hidden at a session's start but shows later: the
  overtime flag, a tossed magazine, a scope's eyepiece; `rendererParts.ts` `withShown`, KI1; and the post stack's
  passes, `nodePostStack.ts` `compilePasses`; with nothing culled, then draws the frame once more, never shown, for
  what only a draw builds, under each of the session's poses, such as `figures/characterRenderer.ts` `warmPoses`, PF1;
  a match's round waits for it, its first picture held). `field/mapMeshCache.ts` keeps the last map's meshes. `rendererParts.ts`
  holds its helpers (field of view, tone mapping, idle warm-up, handing GPU resources to a new renderer). The Renderer
  draws with the node renderer (`webgpu/nodeBackend.ts`) and recovers a lost device itself (`nodeLost`): a new device,
  or the WebGL2 back end, with the post stack, retro filter and sheen back. `retroFilter.ts` is the retro view's size
  maths (pure), read by the Renderer and `nodeRetro.ts`.
- `rendererStart.ts` decides at load which back end draws (WebGPU overhaul W1; Graphics › Renderer, Auto by default),
  in a chunk of its own loaded at boot with the Renderer row (`ui/rendererRow.ts`) and `webgpu/nodeBackend.ts` (with
  `three/webgpu`, never in the main chunk). On Auto or WebGPU, `webgpuProbe.ts` asks for an adapter first, and only
  when one is given (on Auto, not a software one) is WebGPU tried; with none, or on the WebGL pick, it is the WebGL2
  back end.
- `nodePatch.ts` (W6b): the world's materials carry node patches, what each draws beyond Three's own material and the
  uniforms it reads, set where the material is made (`webgpu/README.md`).
- Quality: `gpuCheck.ts` rates the GPU, `qualityStepDown.ts` steps down on slow frames (never saved).
  `Game.changeQuality` → `Renderer.setQuality` → `MatchSession.setQuality`. Changing antialiasing waits for the next
  load (`Renderer.antialiasPending`).
- `testSupport.ts`: the tests' shared fixtures (a canvas stub, a scene with a built map, an allocation measure, the
  model files from disk). Tests: `renderer.test.ts`, `disposal.test.ts` here, one per feature beside its file.

## Tuning and rules

- Tuning, in `config/`: `render.ts` (re-exports the `render*.ts` files), `graphics.ts`, `post.ts`, `look.ts`,
  `characters.ts`, `weathering.ts`.
- Every graphical effect is an engine feature read from quality settings and map data, never map-exclusive (owner,
  2026-10-04). A new quality field takes a value on every preset, a row in `config/graphics.ts` and a
  `graphics.<field>` key. Dispose geometries, materials and textures; no per-frame allocation in hot loops.
