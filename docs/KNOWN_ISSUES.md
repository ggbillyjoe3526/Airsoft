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
| Diagonal sightline from the west room through both office doors into mid (~18 m) | document | Minor; a jog in the room entrance would remove it. |
| First-person hand poses are hand-tuned numbers and only checked by screenshot | document | Poses live in replicaModels.ts (palm/across/back + finger curls). Check in the browser that fingers wrap the grip/handguard without clipping; adjust poses rather than the hand builder. |
| Reload: the dropped magazine is mostly below the frame (AEG) or behind the hands (pistol) | fix now (Phase 2 reload animations) | Feature 3 critic, attempt 3. Have the support hand carry the mag into view. After the review, the pose was tuned so the replica no longer covers the crosshair and the mag seats at 97% (in time with the seat click). |
| Pistol glove fingers look thick; the pistol armband is off screen | can wait | Slim the finger radii / proportions in handModels.ts during the art pass. |
| An impact puff is only ~28% of full size in its first frame | can wait | Consider starting puffs at ~50% scale so a close-range hit doesn't show a near-empty frame. |
| The BB path and near puffs sit on the crosshair's lower arm | can wait | Consider a smaller lower arm or a dot-only crosshair option. |
| AEG BBs fly nearly flat within Depot's 34 m (hop-up 0.12, spinDecayTime 0.55) | can wait | Tuning: playtest a shorter spinDecayTime so the drop shows within 34 m. |
| Sound recipe numbers are hardcoded in sfx.ts; one vec3 per shot/impact event; per-tick armCtx; `muzzle` looked up by name per shot; viewmodel `setAspect` every frame; untyped `userData.axis` | can wait | Minor code debt; profile before optimising. |
| Third-person figures are greybox: crouching squashes the legs, the walk cycle is a simple leg swing, no turn interpolation | can wait | Art pass / Phase 2 animations. |
| Other players' yaw isn't interpolated between ticks | can wait | Bots turn at most 4.5 rad/s (≈4.3° per tick); check turning bots look smooth on high-refresh screens. |
| Hit volume is round, so from the side it's deeper than the figure (0.4 m vs ~0.28 m chest): a BB ~6 cm in front of the chest counts | can wait | Playtest flank shots; consider a slimmer lower capsule or an elliptical test. |
| The hit-direction wedge is cut off at the end of calling (its 2.2 s fade is longer than the 1.4 s call) | can wait | Match the wedge fade to HITS.callTime. |
| Bots only use the AEG, never switch to the pistol, and don't jump | can wait | Fine for Phase 1. |
| Bots hear gunfire through walls within 22 m and know roughly where it came from (off by up to 30% of the distance) | document | Deliberate simplification; hearing never skips a bot's reaction delay. |
| A walk-off that can't reach the dead zone within 14 s, or gets stuck, fades out where it is and reappears in the dead zone | document | Rare now that walk-offs follow nav routes. |
| Each hit runs one route search for the victim's walk-off inside the simulation tick (~2 ms worst case on Depot, not rationed) | can wait | Hits are rare (a few per round); profile before rationing. |
| Bots crouch-peek only over crouch-high cover; at full-height cover they wait, then move on (no leaning or stepping out to peek a corner), and they don't push to close distance | can wait | M4b covers low cover only. Corner peeking would be a later alpha bot task. |
| Difficulty numbers are first guesses tuned against headless duels (measured, not tested: Normal bots hit with ~13% of BBs in bot-only matches, was ~30%) | can wait | Playtest each level; tune BOT_SKILL in config/bots.ts. |
| At 10–16 m, a strafing target is still hit about as fast as a standing one (the BB stream sweeps across it) | can wait | Up close strafing clearly helps; raise aimErrorTracking if mid-range strafing should help more. |
| Bot-only rounds are still quick (median ~14 s on Normal, was ~11 s before M4b), yet a last 1v1 can wander for ~40–100 s: the two last bots hunt each other's half of the map and keep missing each other (seen on Easy, seed 11) | can wait | Hunting, not cover: revisit hunting pace with the objective mode (M5). |
| `sim/testSupport.ts` (test fixture) lives in the source tree | can wait | Harmless (tree-shaken from the build); move under a test folder if more fixtures appear. |
| No pre-round freeze: everyone can move and fire from the round-start whistle | can wait | Spawns are hidden from each other (tested), so nobody can be shot at spawn; revisit with playtesting. |
| config/render.ts and config/audio.ts hold small derived helpers (whistle schedule, result-screen delay) and render imports audio | can wait | Fine at this size; move derived timing into a module if config grows more logic. |
| Bots hear footsteps and gunfire through walls (no occlusion); only range limits it, and the guess is vague (±30% of distance) | document | Deliberate simplification; playtest whether bots feel spooky. Occlusion could halve range through walls later. |
| Bots walk only for the last 12 m of a search; they run (and are heard) everywhere else, and never crouch-move | can wait | Playtest whether bots are too easy to hear coming, or too sneaky (BOTS.searchWalkDistance). |
| Team pacing ignores the player: bots wait for bot teammates only | document | Deliberate (DECISIONS 2026-10-01); a player who holds back must never stall the bots. |
| Footstep ranges are first guesses: bots hear run 11 m, sprint 16 m, land 12 m; you hear other players' steps to 22 m | can wait | Tune from playtesting (the player's range is deliberately a bit longer than the bots'). |
| Arm hits don't count (only body capsule and head) | document | Owner playtested and kept it (DECISIONS 2026-10-01). |
| A difficulty change waiting for the next round is tracked twice (ai/difficultyChoice.ts `next` and BotController's pending config), kept in step by game.ts | can wait | M4a critic. Both sides are tested; the glue isn't. Give the pending level one owner if this grows. |
| While a mid-match difficulty change waits, the picker highlights the new level; only the "Starts next round." note says the bots are still on the old one | can wait | M4a critic. Playtest whether that's clear enough. |
| A bot re-acquiring a recent contact keeps the aim-error direction it had on its other target | can wait | Cosmetic: the error keeps wandering anyway. |
| A bot fighting from crouch cover stops when its own target goes down, even if a second enemy is about | can wait | It re-acquires the next enemy through normal sight. Playtest whether bots leave good cover too readily. |
