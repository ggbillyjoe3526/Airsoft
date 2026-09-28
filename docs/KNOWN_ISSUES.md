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
| The spawn walls are not needed for the spawn-to-spawn sightline rule (other cover already guarantees it) | document | They stay as cover for leaving spawn and to stop mid looking into spawn yards; no test covers that yet. |
| **Feature 2 rework pending (critic attempt 2: 8.1, Rework; not committed)** | fix now | (a) break 33–37 m mid diagonals (e.g. near the centre container ends) and add an any-direction sightline cap (~28–30 m) to depot.test.ts; (b) raise SPAWN_ZONE_RADIUS to ~5 m so spawn walls are test-guarded, then drop the spawn-wall row above; (c) symmetric, non-team prop tints (mapMeshes.ts); (d) offset mid→corridor door (depot.ts x -9..-7.8) from the room door (x -8.5..-7.3); (e) record crouched-hitbox top ≤ ~1.15 m in DECISIONS. Then re-run the critic (attempt 3 of 4). |
