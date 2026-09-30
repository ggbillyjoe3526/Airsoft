# Known issues

Classified as **fix now / document / can wait**.

| Issue | Class | Notes |
|---|---|---|
| Automated browsers can't take pointer lock | document | Use the dev-only `?nolock` URL flag. |
| Ledges 0.2–0.3 m tall are climbable only sometimes (sprinting yes, crouching no) | document | Rapier autostep with capsules; keep map ledges ≤ 0.15 m or ≥ uncrossable cover height (tested for Depot). |
| Firefox ignores `unadjustedMovement` (raw mouse input) | can wait | Sensitivity may feel different vs Chrome/Edge when OS acceleration is on. |
| Chrome refuses pointer re-lock for ~1 s after Esc | document | Start screen shows a "click again" hint (promise rejection or `pointerlockerror`). Firefox path untested. |
| Jump pressed 1-2 ticks before landing is ignored (no jump buffering) | can wait | Deliberate for a "limited hop"; revisit after playtesting. |
| Rapier capsule controller sinks into cuboid colliders along their diagonals | document | Worked around: level blocks are trimeshes (see DECISIONS). Never add cuboid level colliders. |
| A capsule spawned overlapping a block is trapped inside it | document | Spawns and bot placement must never overlap level geometry. |
| `probeGround` allocates one small hit object per standing character per tick (Rapier's castShape API) | can wait | ~360 short-lived objects/s with 6 characters; profile before optimising. |
| Long diagonals remain between off-grid points: e.g. Blue spawn yard SW corner (-19.6, -13.6) → divider centre gap → Orange north lane (5.4, 12.9), 36.4 m; 654 lines > 30 m on a 0.25 m scan | fix now | The 30 m test samples a 1 m grid. Make it exact (corner-to-corner) or ≤ 0.25 m, then block these. |
| 0.6–0.67 m slits between blockers: stacks at depot.ts (-3.6,-5) vs (-5.4,-6.4); crate (-12.4,-5.9) vs office wall; crate window | fix now | Look walkable but aren't (capsule 0.64 m + skin); snag and peek slits. Close to < 0.3 m or widen to ≥ 0.9 m; consider a gap-width test. |
| Diagonal sightline from the west room through both office doors into mid (~18 m) | document | Minor; a jog in the room entrance would remove it. |
| First-person hand poses are hand-tuned numbers and only checked by screenshot | document | Poses live in replicaModels.ts (palm/across/back + finger curls). Check in the browser that fingers wrap the grip/handguard without clipping; adjust poses rather than the hand builder. |
| **Feature 3 critic attempt 1: 7.2 (Rework) — fixes for attempt 2 of 3** | fix now | All listed items done: own BBs start at the muzzle; BBs keep a minimum on-screen size (BB_VISUALS.minAngularRadius ≈ 4 px at 1080p) so they stay visible at 10–30 m; semi-auto press buffer; dry click + auto-reload; Firefox audio; wheel step; olive gloves; forearm sleeve now overlaps the glove cuff (checked at 1280×720); viewmodel numbers moved to VIEWMODEL; replica model/hold/shot sound come from `ReplicaConfig.look`, not string ids; unused `isReloading` removed; tests for sprint→canFire and per-tick event clearing. Still optional: shorter spinDecayTime; hoist per-tick armCtx; character LOADOUT default parameter. |
| **Feature 3 critic attempt 2: 7.5 (Rework) — fixes for attempt 3 of 3** | fix now | Done: reload lifts and cants the replica about its grip (stays on screen) while the magazine slides out and back in (VIEWMODEL.reload); pistol held at arm's length and turned to show its side, sleeves in front of the camera, smoother fingers; own-BB muzzle blend finishes at 70% of the estimated flight time so close-range BBs arrive at the puff; puffs bigger, brighter and ≥ ~20 px at 1080p; package-lock churn reverted; viewmodel frozen while paused; listener uses plain values; HUD/wheel/viewmodel numbers moved to config. Still open: sfx recipe numbers in code; per-event vec3 allocations and per-tick armCtx; AEG arc barely visible within 30 m (tuning); the support hand doesn't leave the replica during reloads (Phase 2 reload animations). |
