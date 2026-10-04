# Tasks

Open tasks only, one block each (format in `pipeline/README.md`). A task that lands leaves this file in its records
commit, before its pull request merges (CI's scope gate finds the block in the branch's history): its REVIEWS line, its
ROADMAP row and the CHANGELOG line are the record. The planning thread writes blocks; the build thread
keeps `status` and `attempts` current.

## FA4 · Bots: spacing, cover, behaviour, difficulty and fairness
tier: core
perf: required
touches: src/ai/bot.ts, src/ai/botBrain.ts, src/ai/botCombat.ts, src/ai/botController.ts, src/ai/botMovement.ts, src/ai/botSenses.ts, src/ai/cover.ts, src/ai/testSupport.ts, src/ai/depotMatchSupport.ts, src/nav/navGrid.ts, src/config/bots.ts, src/config/nav.ts, src/map/depot.ts, src/config/matchRules.ts, src/ui/menus/savedChoices.ts, src/ui/menus/menus.ts
contract: none
acceptance:
  1. Hot path (audit AI-07, AI-10, AI-11, AI-16): at most one route search per tick including walk-offs; a failed bot route is not re-requested for routeRetryDelay; the search's open list is 2× the cells and grows instead of failing, with no closure per search; a bot's move command is projected on the view it ends the tick with (tests in botTactics.test.ts and navGrid.test.ts)
  2. Spacing and cover (AI-01, AI-08, AI-12, AI-13): bots steer apart and never pick a teammate's cover spot or lane spot; two characters inside each other on < 0.5 % of live ticks over seeds 1–3 (depotMatch.spacing.test.ts); jittered points stay on their floor; route legs keep a body radius from blocks; no crouch while waiting for a cover route
  3. Behaviour (AI-02, AI-04, AI-05, AI-06, AI-14, AI-15): holding bots crouch where that still sees and sweep their view; a near miss is heard at any range; sidesteps never go into a wall or out of sight of the target; in Attack / Defend one bot raises and the others guard from cover; a search ends with a look round; a second enemy heard mid-fight is searched afterwards
  4. Difficulty and fairness (AI-03, AI-17, AI-18, AI-09, SIM-13): Easy reshaped with Easy rounds no longer than 1.6× Normal's (depotMatch.difficulty.test.ts), and teammates Normal against Easy opponents until a teammate level is picked; Hard uses cover and flanks more, Easy less (BotSkill); a hit call gives a bearing, not the shooter's spot; Depot's ends reach the dock and the Main Gate within 8 m of route of each other, with the Depot match guards passing; AI-18 recorded in DECISIONS
  5. KNOWN_ISSUES rows 30 (merged), 33 (re-measured), 49, 90, 93, 94 and 95 struck or reworded, each fix with a test; rows 87 and 43/44 left with the reason in DECISIONS
  6. Records (attempt 2): the game's default pair (opponents X, teammates defaultTeammateDifficulty(X), so Easy with Normal teammates) counts as the standard match, filed under the opponents' level; equal levels still count, any other pair stays custom (matchRules.test.ts); the KNOWN_ISSUES row about it is removed
  7. Ends even in play (attempt 2, SIM-13): bot-only Elimination on Depot, the west end wins 47–53 % of decided rounds over seeds 1–64 (measured, DECISIONS), with FA1's walk-off budget and every depotMatch guard passing
status: gates
attempts: 2
