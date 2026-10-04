# Tasks

Open tasks only, one block each (format in `pipeline/README.md`). A task that lands leaves this file in its records
commit, before its pull request merges (CI's scope gate finds the block in the branch's history): its REVIEWS line, its
ROADMAP row and the CHANGELOG line are the record. The planning thread writes blocks; the build thread
keeps `status` and `attempts` current.

## FA8 · Visual overhaul: figures, replicas, attachments, hands and effects
tier: core
perf: required
touches: src/config/render.ts, src/config/graphics.ts, src/config/characters.ts, src/config/replicaFinish.ts, src/render/figureFinish.ts, src/render/characterModels.ts, src/render/characterRenderer.ts, src/render/matchPresentation.ts, src/matchSession.ts, src/render/handModels.ts, src/render/replicaFinish.ts, src/render/replicaModels.ts, src/render/viewmodel.ts, src/render/combatPresentation.ts, src/render/bbRenderer.ts, src/render/impactGrit.ts
contract: QualitySettings and QUALITY (fields added additively, as FA2's contract line allows: figureDetail, replicaDetail, handDetail, bbGlow, impactGrit, laserBeam; a value on every preset, a Custom row each, a `graphics.<field>` store key each)
acceptance:
  1. Third-person figures and kit (row 17, Player detail): on `high` the figures get a shaped head, goggle rims with a glossy lens, a glossy helmet shell, gloves with a thumb, boots with soles, cuffs, pouch lids, edge highlights and baked occlusion, in one draw call a figure as before (gloss per vertex, one program); `low` builds exactly today's figure; under 2× Low's triangles; team tape is never shaded; the HIT! sign keeps its on-screen size past 6 m (figureDetail.test.ts, effectsDetail.test.ts); with M29b, a silencer on a figure's rifle shows in place of its flash hider on `high` (its front at the muzzle), rebuilt when parts change between rounds (figureDetail.test.ts)
  2. First-person replicas (Replica detail): on `high` the AEG and pistol take a moulded speckle (shared roughness and normal DataTextures), bevelled and edge-lit boxes, worn edges, real rail slots and the extra parts (selector, sights, serrations, grip panels); `low` draws today's triangles (AEG 10,844, pistol 7,944) and makes no texture; High is under 1.35× Low (replicaDetail.test.ts)
  3. Attachments: every part is drawn by name from one per-part builder table (`REPLICA_PART_TABLES`), magazines by kind (standard with a witness window, hi-cap with its wheel, low-cap steel), optics with glass, the laser with a glowing lens; a later part is one table entry (replicaDetail.test.ts); M29b's barrels (Long, Tight-Bore) and silencers (AEG, pistol) are table entries drawn on Low as M29b drew them and modelled on High, the muzzle mount on the fitted barrel's end and the BB exit point on the fitted device's front face at every detail level (replicaDetail.test.ts, viewmodel.test.ts)
  4. Hands (row 18, Hand detail): on `high` a knuckle pad, joint seams, a rubber strap and metal buckle and a sleeve fold; under 400 extra triangles a hand and under 2,800 in all (REN-10's budget kept); `low` unchanged (replicaDetail.test.ts)
  5. BB glow (row 19): a camera-facing additive glow at every BB in flight, one instanced draw sharing the puffs' program, its texture made only when first turned on; BBs shaded two-tone (effectsDetail.test.ts)
  6. Impact grit (row 20): a seeded few chips of the surface's tint thrown towards the shooter's side, falling and gone after their lifetime, and a faint ring puff; pooled, one draw each, nothing thrown or made while off (effectsDetail.test.ts)
  7. Laser beam (row 23): a fading line from the Red Laser's lens, off on every preset (config/render.test.ts, replicaDetail.test.ts)
  8. Low keeps today's cost: every FA8 field is `low`/off on Low (config/render.test.ts) and the measured draw calls, triangles and textures on Low are not above the base build's; Medium and High's change is recorded in DECISIONS
status: gates
attempts: 2
