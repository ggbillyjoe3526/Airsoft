# Decisions

One line each: decision, then why.

- **2026-09-28 · TypeScript 5.9 (not 7.x).** Stable, well-known compiler API; TS 7 is newly released. Revisit later.
- **2026-09-28 · Node 24 LTS installed via winget.** Nothing was installed; LTS is the safe default.
- **2026-09-28 · Crouch is bound to C only, not Ctrl.** Ctrl+W closes the tab and can't be blocked outside fullscreen.
- **2026-09-28 · Crouch lowers eyes/hitbox but not the movement capsule.** No crawl spaces in Phase 1; avoids stand-up-inside-geometry bugs.
- **2026-09-28 · Characters don't physically collide with each other in Rapier.** The sim handles spacing and BB hits; keeps physics simple and deterministic.
- **2026-09-28 · Gravity 20 m/s², jump apex ~0.73 m with 0.55 s cooldown.** Snappier than real gravity; jump is a hop, not a traversal tool.
- **2026-09-28 · Level materials are MeshLambert with merged geometry per texture.** Cheap on integrated GPUs; a few draw calls for the whole map.
- **2026-09-28 · Pixel ratio capped at 1.5.** High-DPI laptops with iGPUs can't afford native resolution at 60 FPS.
- **2026-09-28 · Rapier compat build (inlined WASM) accepted, ~1.4 MB gzip.** Simplest loading; well under the 30 MB budget.
- **2026-09-28 · Dev-only `?nolock` flag.** Automated browsers can't take pointer lock; needed for verification.
