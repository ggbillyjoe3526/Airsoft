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
| Reload: the dropped magazine is mostly below the frame (AEG) or behind the hands (pistol) | fix now (Phase 2 reload animations) | Feature 3 critic, attempt 3. Have the support hand carry the mag into view. After the review, the pose was tuned so the replica no longer covers the crosshair and the mag seats at 97% (in time with the seat click). |
| Pistol glove fingers look thick; the pistol armband is off screen | can wait | Slim the finger radii / proportions in handModels.ts during the art pass. |
| An impact puff is only ~28% of full size in its first frame | can wait | Consider starting puffs at ~50% scale so a close-range hit doesn't show a near-empty frame. |
| The BB path and near puffs sit on the crosshair's lower arm | can wait | Consider a smaller lower arm or a dot-only crosshair option. |
| AEG BBs fly nearly flat within Depot's 30 m (hop-up 0.12, spinDecayTime 0.55) | can wait | Tuning: playtest a shorter spinDecayTime so the drop shows within 30 m. |
| Sound recipe numbers are hardcoded in sfx.ts; one vec3 per shot/impact event; per-tick armCtx; `muzzle` looked up by name per shot; viewmodel `setAspect` every frame; untyped `userData.axis` | can wait | Minor code debt; profile before optimising. |
| Walk-off goes in a straight line; anyone blocked by cover (slower than 0.5 m/s for 0.5 s) fades off the field over 0.6 s and reappears in the dead zone | document | Use the bots' waypoint graph for walk-off once it exists. |
| Third-person figures are greybox: crouching squashes the legs, the walk cycle is a simple leg swing, no turn interpolation | can wait | Art pass / Phase 2 animations. |
| Other players' yaw isn't interpolated between ticks | can wait | Invisible at 60 Hz for standing dummies; revisit with bots turning. |
| Hit volume is round, so from the side it's deeper than the figure (0.4 m vs ~0.28 m chest): a BB ~6 cm in front of the chest counts | can wait | Playtest flank shots; consider a slimmer lower capsule or an elliptical test. |
| Arms don't count as hits (most sites count them; replica hits don't) | can wait | Playtest whether BBs visibly striking an arm with no hit feel unfair. |
