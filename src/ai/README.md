# src/ai

The bots: they play through the same `PlayerCommand` as the player, read game state and never write it. Randomness is
seeded per bot.

- `botController.ts`: `BotController` runs before each tick (`think` fills every bot's command, one route search a tick)
  and after it (`observe`: bots hear shots, near misses, hit calls and footsteps from `state.events`). `giveOrder` takes
  a player's squad order. Each round it deals a team's bots onto lanes by a plan (`teamPlan.ts`).
- `bot.ts`: a bot's plain-data state (one contact record per enemy seen, `skill`, `role`, `post`, `patrol`, and its
  `personality` and `style`).
- `botRoster.ts`, `personality.ts` (BN1): who the bots are. `drawIdentities` deals each bot a name off `bots.md`'s
  roster (a team takes different personalities first; a stream of its own off the match's seed); the name always plays
  its personality. `personalSkill` lays the personality over the level's `BotSkill` when the bot is made (never its
  senses, reaction, turning or aim); the habits no level has are read from `Bot.style` where they apply: `pushesIn`
  (rushers, with no run job and no squad order), `anchorHolding` (an anchor in Elimination short of the middle until its
  mark on the clock), Own lane (`teamPlan.ts takeOwnLanes`), Aims from cover (`botBrain.ts`, so it rests on cover).
- `botBrain.ts`: the per-tick decision and mode choice (lane → fight → cover → search; also `order` and `flag`). It
  calls `botSenses.ts` (target choice, contacts, reaction), `botMovement.ts` (lane points, hunting, strafing, and one
  glance a tick into the view for the team's hunt memory, M87: a spot seen empty isn't walked to),
  `routes.ts` (asking for and following a route, the last step onto a spot; a bot pushed off a leg walks back to it
  rather than over a ledge, G11; a leg over a low obstacle sets `vaultLeg`, and the brain presses Jump at it, M102;
  shared with `squadOrders.ts`, so the two files don't import each other) and `botCombat.ts` (aim, bursts, reloads; bots lead a target with `flightTimeEstimate`); `botTorch.ts` handles weapon
  lights at night, and `botHolster.ts` the holster (M92: put away on a calm sprint through its own half).
- `perception.ts`, `aim.ts`, `cover.ts`: view cone and static ray casts; turn rate and aim error (a fresh contact's first aim starts wide
  to one side and settles from the trigger, G11; the sight on the replica in hand scales it, `BOT_SIGHT_AIM`, BG1); hidden spots, low
  cover and wall corners (a bot leans out at a corner). `angles.ts`, `angleFeatures.ts`: held angles.
- `squadOrders.ts`, `squadFollow.ts`: Follow me, Hold here, Regroup (default keys F, X, V, or the order wheel on Z); in
  Extraction the runner's bot teammates follow and cover. `extractionRoles.ts`: home-team guards, patrols and hunters.
- In Attack / Defend defenders hold the first one or two lane points and the two nearest the pole run to it once the
  flag is off the bottom; attackers go to the pole from midfield and crouch by it. Nobody hunts.
- Tuning: `config/bots.ts` (shared `BotWorld.cfg` plus one difficulty's `Bot.skill`; one `BotConfig` per team through
  `BotControllerOptions.teamCfg`), `config/squad.ts`.
- Adaptive difficulty (AD1, a Dev setting): `adaptiveSkill.ts` is the arithmetic (a rating on the difficulty scale, 0
  Easy to 3 Pro; `skillAt` blends the numbers of the two levels around it and takes the switches from the level the
  match plays as; how a round and a match move it), `adaptiveRun.ts` one match's rating (it drifts a little after each
  round; `MatchSession` hands the other team's bots the new skill through `BotController.setTeamSkill`, which lays each
  bot's personality over it again). It layers over
  `BOT_SKILL` and never changes it; tuning in `config/adaptiveDifficulty.ts`, the saved rating in
  `settings/adaptiveRating.ts`, the between-matches part in `src/adaptivePicks.ts`.
- Tests: `ai.test.ts`, `botTactics.test.ts` and one file per behaviour. The match guards (`depotMatch.*`, `*Match.*`
  over `depotMatchSupport.ts` and `extractionRunSupport.ts`) are the `slow` project: they check what must never happen
  (rounds played and settled, nobody stuck, falling or hit by a teammate, each mode's rules). They are seed-sensitive:
  re-measure over 16 seeds before changing a threshold (`docs/DECISIONS.md`). Files named `*Support.ts` here are
  test-only.
- `balance/`: the bot balance figures (who wins, the first hit, Extraction's get-out rates), measured on demand by
  `node pipeline/balance.mjs`, never asserted (token plan item 22; `balance/README.md`).
