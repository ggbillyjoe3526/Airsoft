# Tasks

Open tasks only, one block each (format in `pipeline/README.md`). A task that lands leaves this file: its REVIEWS
line, its ROADMAP row and the CHANGELOG line are the record. The planning thread writes blocks; the build thread
keeps `status` and `attempts` current.

## M27 · Walk-off route searches rationed to one per tick
tier: core
perf: required
touches: src/sim/elimination.ts, src/sim/elimination.test.ts, src/sim/character.ts, src/sim/simulation.ts, docs/KNOWN_ISSUES.md
contract: GameState (a field on Character is allowed), stepSimulation (its phase order is unchanged)
acceptance:
  1. A hit no longer runs the victim's walk-off route search inside the hit itself: the search happens in the elimination step over the following ticks, at most one route search per tick across all victims (two hits in one tick: one search that tick, one the next; a test counts the searches)
  2. A victim reaches its dead zone as before (the existing elimination and depot match tests pass unchanged); while its route is not found yet it stands calling, which the 1.4 s call already covers
  3. No new per-tick allocation: the route array and the pending flag live on the character and are reused
  4. The KNOWN_ISSUES row about the walk-off route search inside the tick is removed
status: done
attempts: 1

## M28 · Impact puffs start at half size
tier: trivial
perf: skip
touches: src/render/impactPuffs.ts, src/config/render.ts, docs/KNOWN_ISSUES.md
contract: none
acceptance:
  1. A puff's first drawn frame is at least 50 % of its full size (today about 28 %), so a close-range hit shows a puff at once
  2. The puff's full size and lifetime are unchanged (its tuning values stay in config)
  3. The KNOWN_ISSUES row about the first frame of a puff is removed
status: open
attempts: 0

## FA4 · Bots: spacing, cover, behaviour, difficulty and fairness
tier: core
perf: required
touches: src/ai/bot.ts, src/ai/botBrain.ts, src/ai/botCombat.ts, src/ai/botController.ts, src/ai/botMovement.ts, src/ai/botSenses.ts, src/ai/cover.ts, src/ai/testSupport.ts, src/nav/navGrid.ts, src/config/bots.ts, src/config/nav.ts, src/map/depot.ts
contract: none
acceptance:
  1. Hot path (audit AI-07, AI-10, AI-11, AI-16): at most one route search per tick including walk-offs; a failed bot route is not re-requested for routeRetryDelay; the search's open list is 2× the cells and grows instead of failing, with no closure per search; a bot's move command is projected on the view it ends the tick with (tests in botTactics.test.ts and navGrid.test.ts)
  2. Spacing and cover (AI-01, AI-08, AI-12, AI-13): bots steer apart and never pick a teammate's cover spot or lane spot; two characters inside each other on < 0.5 % of live ticks over seeds 1–3 (depotMatch.spacing.test.ts); jittered points stay on their floor; route legs keep a body radius from blocks; no crouch while waiting for a cover route
  3. Behaviour (AI-02, AI-04, AI-05, AI-06, AI-14, AI-15): holding bots crouch where that still sees and sweep their view; a near miss is heard at any range; sidesteps never go into a wall or out of sight of the target; in Attack / Defend one bot raises and the others guard from cover; a search ends with a look round; a second enemy heard mid-fight is searched afterwards
  4. Difficulty and fairness (AI-03, AI-17, AI-18, AI-09, SIM-13): Easy reshaped with Easy rounds no longer than 1.6× Normal's (depotMatch.difficulty.test.ts); Hard uses cover and flanks more, Easy less (BotSkill); a hit call gives a bearing, not the shooter's spot; Depot's ends reach the dock and the Main Gate within 8 m of route of each other, with the Depot match guards passing; AI-18 recorded in DECISIONS
  5. KNOWN_ISSUES rows 30 (merged), 33 (re-measured), 49, 90, 93, 94 and 95 struck or reworded, each fix with a test; rows 87 and 43/44 left with the reason in DECISIONS
status: gates
attempts: 1
