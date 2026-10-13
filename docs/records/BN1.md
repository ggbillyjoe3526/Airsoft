# BN1 · Bot names and personalities (Dev 6 item 21)

**Review:** 2 attempts · 8/8 · Accept (Opus)

## Attempts

| Date | Attempt | Worker model | build | tests | smoke | perf | scope | changelog | Critic | Retry reason | Wall time | Worker tokens |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 2026-10-13 | 1 | Opus 5.5 (build thread) | ✓ 19 s | ✓ 489 s | ✓ 946 s | ✗ 1834 s (neon extraction low) | ✗ | ✓ | – | perf: Neon Heights Extraction Low draws 44.3 calls a frame, 10.2 % over a baseline main is already 9.5 % over; scope: the physics config the ground fix changed | ~2.5 h | QA (Sonnet) 44k, changelog (Haiku) 19k |
| 2026-10-13 | 2 | Opus 5.5 (build thread) | ✓ 20 s | ✓ 189 s (fast) | – skipped | ✓ 1892 s | ✓ | ✓ | 8/8 Accept (Opus) | – | ~1 h | critic (Opus) 140k |

- **Before attempt 1:** the balance report put two figures outside their bands; both were re-measured on more seeds
  (below) and left as they are. The quick gate failed the Neon Heights match guard's ground check (both lights): fixed
  (the ground settle, below). Reports in `pipeline/runs/BN1/` (project files).
- **Attempt 2** re-ran the gates but smoke, with the fast tests: it differs from attempt 1 by the re-recorded perf
  baseline and the task's touches alone; attempt 1 ran smoke and the slow guards green on the same code.
- **After merging M102 (vaulting, #214)** all tests ran again: four thresholds that are sample sizes, not rates, moved
  with personalities and were set from measures. The route budget probe (`botRouteBudget.test.ts`) and the hunt
  re-pick (`huntMemory.qa.test.ts`) measure a mechanism and now play neutral bots (with personalities the longest
  search was 6,857 nodes against the 8,000 budget, and the blind bots' longest stale walk 1.45 s). The Stack House
  guard takes at least 4 rounds a match and 66 over its 12 (6.4 a match over seeds 1–24 with and without
  personalities; seed 11 played 4), and its follow test counts more than 400 ticks (seed 3: 490, all near).

## Decisions

- **Names and personalities live in `bots.md`, read when the game starts as `pool.md` and `stats.md` are (also in DECISIONS).** 32 made-up names, 8 a personality, at most 12 letters; a match deals them from its own seed, each team takes different personalities before any comes twice, and a name always plays its personality. Your teammates get names and personalities too. A cell the game can't read plays neutral and is reported with its line.
- **A personality changes how a bot plays, never how well (also in DECISIONS).** It scales the level's cover chances, contact cover distance, search walk, flank chance, bursts and peek watch, and sets four habits (pushes in, waits for the team, own lane, holds until) plus aims from cover, holds angles and slices corners; never sight, hearing, reaction, turning or aim (`ai/personality.ts personalSkill`, pinned by `personality.test.ts`).
- **A run's jobs and your squad orders come first (also in DECISIONS).** A guard holds its case, a patrol keeps its partner and the level's pause, a hunter hunts, and a bot under your order does what you asked: a rusher pushes in only with no job and no order.
- **Anchors aim from cover, so they rest on it (also in DECISIONS; M104's open question).** They raise the sight where they stand still to fight, peek over cover or hold, and get the player's aimed and rested spread; the other three still fire from the hip. In Elimination an anchor walks its lane only to the last point short of the middle and holds there, leashed to it as a defender to its pole, until 60 s are left or it is its team's last in play.
- **Flankers take a lane of their own on attack (`teamPlan.ts takeOwnLanes`), never when defending the pole.** Rushers and flankers don't wait for teammates at a lane point (`waitsForTeam`).
- **Measured, 6 bots of one personality on Depot at Normal, seeds 1 and 2, 40 s (`ai/personalities.test.ts`):** first shot rusher 6.7 s, flanker 8.1, careful 12.1, anchor 12.6; holding 16 / 22 / 38 / 56 % of live ticks and moving 79 / 61 / 53 / 29 %; the anchor anchoring 97 %, aiming 61 % and resting 23 %; flankers on three lanes every round (6 of 6); careful bots walking their corners 22 % of their ticks, no other personality at all.
- **A lean-post guard's sweep stops 4° short of where its leaned eye loses its way in (`BOTS.holdLeanSweepBackDeg`), and a leaning guard doesn't aim at held angles.** An anchor guard (Pro holds angles; anchors always do) turned its leaned eye back behind the cover it leans past.
- **Corner slicing in the enemy's half is for bots on their lanes only (`role` none).** A careful guard on the home team walked to its post.
- **Extraction's guard-cover test keeps neutral bots (`playRun({ personalities: false })`).** It measures where M46's guards take cover; personalities on top would test the roster's draw, not the cover.
- **Loadouts come with the bot gear table (Dev 6 item 23; also in DECISIONS).** The two threads split the roadmap line: item 23's kit table reads `Bot.personality`; this task changes no kit roll.
- **The ground settle is 7 cm (was 6), pinned deeper than the fastest pace drops in a tick down the steepest ramp (`physicsWorld.test.ts`).** M92's holstered sprint, 6.8 m/s, drops 5.7 cm a tick down a 1:2 ramp; with the probe rounding the crest an anchor left the ground for 0.33 s over the top of a Neon Heights stair and the match guard's ground check failed. A new test runs both sprints down every Neon Heights stair from its landing; all six hold. The west stair's lower flight is left out of it: its landing overhangs the ramp, a 30 cm step on main too (KNOWN_ISSUES › Maps).
- **Balance (`node pipeline/balance.mjs`, all 92 figures on this branch):** 82 in band, 7 near an edge, 2 outside, 1 outside within noise (Hard's quick first hits at 5 m, 15.8 %, as on main).
  - Depot Attack / Defend with ricochets counting, attackers' share: 73.8 % on the figure's seeds 1–16 (58.3 % on main, band 35–65 %). Over seeds 1–48: 64.6 % with personalities, 59.0 % without, 61.8 % with only attackers pushing in, 64.4 % with only defenders: the first 16 seeds are a high block (55.8–73.8 % across the three blocks). Without ricochets 63.6 % (61.3 %). Left as it is, KNOWN_ISSUES.
  - Neon Heights Extraction against Normal, FC a minute: 50.0 on seeds 1–48 (33.1 on main, band 9–49). Seeds 49–96 give 32.5; without personalities 22.1 and 38.9. Over 96 runs the share that gets out is the same either way (42 against 40). Left as it is, KNOWN_ISSUES.
  - Elsewhere on the way: Depot Normal Elimination west end 52.7 → 42.2 % (band 35–60), Woodland Pro downhill end 54.2 → 42.1 % (40–60), Neon Heights Extraction easy runs out 60.4 → 52.1 % (52–82); Woodland's two Elimination ends and both Neon Heights Pro Elimination ends moved off their edges.
- **The Neon Heights Extraction Low perf baseline is re-recorded (`pipeline/baseline/container-neon-extraction.json`).** Draw calls a frame: baseline 40.15, main (dcd5ce4) 43.95, this branch 44.3 to 44.9 over three runs, this branch without personalities 43.9: bots standing elsewhere add about 1 %, the rest is main's drift since the baseline. Triangles −2 %, GPU memory 10.6 MB as before.
- **Start-up file 940.7 kB to 951.2 kB (76 % of the 1,250 kB limit):** `bots.md` (6 kB) and its reader ride in the game chunk, read at start like `pool.md`. Match load works out the map's angle features whenever a bot holds angles or slices corners (now anchors and careful bots at any level, before only the levels that do), 11–50 ms.

## Known issues left

- Depot Attack / Defend with ricochets counting reads over its band on the balance figure's 16 seeds (KNOWN_ISSUES › Bot behaviour, can wait).
- Neon Heights' Extraction haul against Normal reads over its band on its 48 runs (KNOWN_ISSUES › Extraction, document).
- Neon Heights' west stair: the landing overhangs the lower flight, a 30 cm step (KNOWN_ISSUES › Maps, can wait).
