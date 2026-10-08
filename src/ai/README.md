# src/ai

The bots: they play through the same `PlayerCommand` as the player, read game state and never write it. Randomness is
seeded per bot.

- `botController.ts`: `BotController` runs before each tick (`think` fills every bot's command, one route search a tick)
  and after it (`observe`: bots hear shots, near misses, hit calls and footsteps from `state.events`). `giveOrder` takes
  a player's squad order. Each round it deals a team's bots onto lanes by a plan (`teamPlan.ts`).
- `bot.ts`: a bot's plain-data state (one contact record per enemy seen, `skill`, `role`, `post`, `patrol`).
- `botBrain.ts`: the per-tick decision and mode choice (lane → fight → cover → search; also `order` and `flag`). It
  calls `botSenses.ts` (target choice, contacts, reaction), `botMovement.ts` (lane points, hunting, strafing),
  `routes.ts` (asking for and following a route, the last step onto a spot; shared with `squadOrders.ts`, so the two
  files don't import each other) and `botCombat.ts` (aim, bursts, reloads; bots lead a target with `flightTimeEstimate`); `botTorch.ts` handles weapon
  lights at night.
- `perception.ts`, `aim.ts`, `cover.ts`: view cone and static ray casts; turn rate and aim error; hidden spots, low
  cover and wall corners (a bot leans out at a corner). `angles.ts`, `angleFeatures.ts`: held angles.
- `squadOrders.ts`, `squadFollow.ts`: Follow me, Hold here, Regroup (default keys F, X, V, or the order wheel on Z); in
  Extraction the runner's bot teammates follow and cover. `extractionRoles.ts`: home-team guards, patrols and hunters.
- In Attack / Defend defenders hold the first one or two lane points and the two nearest the pole run to it once the
  flag is off the bottom; attackers go to the pole from midfield and crouch by it. Nobody hunts.
- Tuning: `config/bots.ts` (shared `BotWorld.cfg` plus one difficulty's `Bot.skill`; one `BotConfig` per team through
  `BotControllerOptions.teamCfg`), `config/squad.ts`.
- Tests: `ai.test.ts`, `botTactics.test.ts` and one file per behaviour. The match guards (`depotMatch.*`, `*Match.*`
  over `depotMatchSupport.ts` and `extractionRunSupport.ts`) are the `slow` project: they check what must never happen
  (rounds played and settled, nobody stuck, falling or hit by a teammate, each mode's rules). They are seed-sensitive:
  re-measure over 16 seeds before changing a threshold (`docs/DECISIONS.md`). Files named `*Support.ts` here are
  test-only.
- `balance/`: the bot balance figures (who wins, the first hit, Extraction's get-out rates), measured on demand by
  `node pipeline/balance.mjs`, never asserted (token plan item 22; `balance/README.md`).
