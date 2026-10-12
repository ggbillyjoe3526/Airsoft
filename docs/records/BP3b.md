# BP3b · Bug pass 3: gameplay, graphics, WebGPU and the KNOWN_ISSUES sweep

**Review:** 2 attempts · 8/8 · Accept (Opus)

## Attempts

| Date | Attempt | Worker model | build | tests | smoke | perf | scope | changelog | Critic | Retry reason | Wall time | Worker tokens |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 2026-10-12 | 1 | Opus 5.5 (build thread) | ✓ 30 s | ✓ 382 s | ✓ 720 s | ✓ 1370 s | ✓ | ✓ | 7/8 Retry (Opus) | AC2: outgrown light lists freed while built draws might bind them; the retro warm-up built for the canvas's grid | ~4 h | QA 123k, changelog 28k, critic (Opus) 174k |
| 2026-10-12 | 2 | Opus 5.5 (build thread) | ✓ 31 s | ✓ 367 s (re-run: the first failed only on this record's draft, left in docs/records during the gate) | ✓ 705 s | ✓ 1346 s | ✓ | ✓ | 8/8 Accept (Opus) | – | ~1.5 h | critic (Opus) 39k |

## Decisions

- **Bug pass 3 ran as two pull requests.** BP3a (the HUD and the menus, the owner's note) merged first as #186;
  BP3b carries the rest, so each stays reviewable.
- **Bots lead and judge their line by the replica in their hands and its BBs.** A pistol out led like the factory
  AEG; `BotWorld.loadout` stays (about 34 call sites build worlds with it) with a note that aim no longer reads it.
- **Past the target, only a teammate a miss could knock out holds a bot's fire.** With friendly fire off a teammate
  beyond the target can't be hit, so only one between bot and target blocks the shot.
- **A round ended from Dev settings keeps the match out of the records whatever the switches say afterwards.**
  Turning the cheats off before the next round used to count the match.
- **Starting a skip settles the AEG motors.** A wind-down owed from before the skip played into the next round.
- **The spectator eye takes the watched player's lean, and its wall check casts from the leaned eye.**
- **The passing plane flies inside 0.9 of the sky dome's radius and scales in and out over the first and last 8 % of
  its line** (`PLANE.dome`, `PLANE.ends`); Neon Heights' flies at 85 m (was 130) and the range's at 90 m (was 180),
  where it read as a speck.
- **The mode content check plays each map from its smallest team size.** Run modes start at 1, so the grid no longer
  asked for sizes a map refuses.
- **Elimination's first end goes by team (Alpha east), not by the player's pick (owner, 2026-10-12).** The
  `eliminationFirstEnd` note was wrong since M98 and is corrected; asked on a decision card, the owner kept the start as
  it is (also in DECISIONS).
- **WebGPU:** the clustered lights' grid follows the target drawn into (the retro look's small target lost the lamp
  pools); warm-up compiles build for the context the frames draw with (Low built the world twice); the last pass keeps
  one material with and without the held replica (spectating on Medium compiled mid-match); a new renderer after a
  lost device re-arms the torch shadow and re-asks whether lights cluster; the compile gate is let go on dispose; grit
  restarts cleanly and turning it off clears the GPU's chips; dust motes fade over the ground under the eye. Warming
  each map's post stack (about 20 pipelines on Medium's first frame) is left as a row.
- **An outgrown light list is freed after the frame, which is safe because a new grid rebuilds every lit draw
  (attempt 2).** The critic held that draws built against the old grid keep binding the freed list. Three's
  `customCacheKey` adds the new grid's compute pass to the node's key, every lit draw's key holds it, and a draw whose
  key moved is rebuilt before it draws: a test pins the key moving with the grid, and a resize mid-match on WebGPU at
  night (Medium, with and without the retro look) logs no error, while the same run with that key stripped logs 952
  "used in submit while destroyed" errors (`pipeline/runs/BP3b/attempt-2/resize-check.md`).
- **The clusters' grid is sized when the world's lights are first set (attempt 2).** Three sets them as a compile
  begins, with its target in force; its builds run later with none, so the retro look's warm-up built for the canvas's
  grid and the first frame rebuilt every lit draw. webgpu-compare's retro night views were not re-run: the unit test
  and the owner's browser check on a real GPU stand in for them.
- **Every row of `docs/KNOWN_ISSUES.md` was cross-checked.** Deleted with a test: the spectator lean
  (`render/spectatorLean.test.ts`), the two bot-lead rows (`ai/botHeldReplica.test.ts`), dust motes over raised
  ground (`render/dustMotesQA.test.ts`), the Practice neon flicker (`rangeSessionMapGroup.test.ts`; fixed at M91, the
  row was stale), the lost-device lamps (`render/webgpu/nightLights.qa.test.ts`), the deferred free on a lost device
  (`render/webgpu/nodeBackend.test.ts`), and "bots hear suppressed and open shots at the same range" (stale since
  M29b, `ai/ai.test.ts:474`). Reworded: the skip row (the motor hum is fixed), the silencer row, the empty-pools row
  (about 6 draws now), the private-API row and `bodyInLine`'s name.
- **The scripted player (e2e build at 941526b, 1280 × 720, `pipeline/runs/BP3b/scripted-player.md`):** every mode on
  Depot, Woodland and Neon Heights by Day and by Night, Practice and the tutorial; Low, Medium mid-match, Low, quit and
  play again; no console or page error, nobody fell.
- **The balance report (on 941526b): 92 figures, 0 outside, 2 outside within noise, 7 near an edge.** Both are the same
  on main before this pass. Duel at 5 m, Hard: re-measured over 360 duels, 18.9 % ±2.1 inside 0.75 s against ≤ 15 %
  (logged on the G11 row; Hard is meant to be quick). Woodland Extraction, Easy: 70.8 % on seeds 1-48, already
  re-measured at M87 as 64.6 % over 96.
- **Perf baselines are not re-recorded.** No combination moves on purpose. Against BP3a's run the WebGPU lines draw
  1-2.3 fewer calls on average (the empty streak mesh); the WebGL2 lines move -2 to +1.4, except Neon Heights
  Extraction on Low, +4.4 (43.5, peak 81, against its baseline's 40.2, peak 84), where Low draws no dressing and the
  bots' changed aim plays the run differently.

## Known issues left

- Each match's first frame on Medium and up builds the post stack's pass pipelines at once (KNOWN_ISSUES › Graphics
  and performance, can wait).
- Duel at 5 m, Hard: 18.9 % of first hits inside 0.75 s (KNOWN_ISSUES › Bot behaviour, document).
- Skip to next round shows nothing of the skipped stretch (KNOWN_ISSUES › Modes and rules, can wait).
- Empty particle pools still issue about 6 draws a frame (KNOWN_ISSUES › Graphics and performance, can wait).
- In the container's software WebGPU, growing the window mid-match on Medium without the retro look stops the frames;
  the same on main (KNOWN_ISSUES › Graphics and performance, can wait).
