# src/ai

The bots: they play through the same `PlayerCommand` as the player, read game state and never write it. Randomness is
seeded per bot.

- `botController.ts`: `BotController` runs before each tick (`think` fills every bot's command, one route search a tick)
  and after it (`observe` reads `state.events`). `giveOrder` takes a player's squad order. It keeps the hunt's sector
  memory and the route searches; the two parts below were split out of it (DX7).
- `hearing.ts`: what the bots hear and feel of a tick's events (`hearEvent`): shots, near misses, hit calls and
  footsteps; NP1: a run into a noisy prop like a step, to the prop's range, steps on gravel or steel plate further, and a
  BB ringing off steel only when nothing fresher is on their mind, kept to themselves.
- `roundPlanner.ts`: `RoundPlanner`, each round's plan per team (where it starts, its plan and lanes from `teamPlan.ts`,
  how far each bot walks its lane, a bot back mid-round set on a lane again; its own seeded stream), with `inEnemyHalf`
  and `aheadOfTeam`; `pickRetakers` and `pickRaiser` hand out Attack / Defend's flag jobs each tick.
- `bot.ts`: a bot's plain-data state (one contact record per enemy seen, `skill`, `role`, `post`, `patrol`, and its
  `personality` and `style`).
- `botRoster.ts`, `personality.ts` (BN1): who the bots are. `drawIdentities` deals each bot a name off `bots.md`'s
  roster (a team takes different personalities first; a stream of its own off the match's seed); the name always plays
  its personality. `personalSkill` lays the personality over the level's `BotSkill` when the bot is made (never its
  senses, reaction, turning or aim); the habits no level has are read from `Bot.style` where they apply: `pushesIn`
  (rushers, with no run job and no squad order), `anchorHolding` (an anchor in Elimination short of the middle until its
  mark on the clock), Own lane (`teamPlan.ts takeOwnLanes`), Aims from cover (`botBrain.ts`).
- `callouts.ts` (CL1): `CalloutDirector` puts what the bots just did into words for their team after each tick
  (`callouts.md`: sightings, hits, reloads, noises, searches, holds, the flag), at the file's pace and one call a team at
  a time. It reads the bots and the state and never writes either, so callouts never change how anyone plays. It also
  has one teammate answer a ping (Going to / Watching your ping) and marks some sightings for the team (PG1), and says
  the magazine hand-off's ask, answer and thanks (MG1).
- `pings.ts` (PG1): `aimPing` finds what a player's ping marks (the floor where the view meets the field, or an enemy
  under the crosshair the bots' sight rules let them see), and `takePing` hands it to a bot teammate as a noise heard
  exactly there (`BotController.ping`), kept in mind `pingMemory` (`bot.ts pingInMind`).
- `magShare.ts` (MG1): `MagShare`, the bots' side of a magazine hand-off. A bot low on BBs asks the nearest teammate
  with one to spare (`hasMagFor`, which keeps the giver a full spare); a bot giver walks over (`Bot.magFor`, mode
  `mag`) and names the asker in `tossMag`; an asker waits where it is, or walks to a player it asked. `ask` takes the
  player's ask (`BotController.askForMag`). The callouts say the ask, the answer and the thanks.
- `botBrain.ts`: the per-tick decision and mode choice (lane → fight → cover → search; also `order` and `flag`). It
  calls `botSenses.ts` (target choice, contacts, reaction), `botMovement.ts` (lane points, hunting, strafing, and one
  glance a tick into the view for the team's hunt memory, M87: a spot seen empty isn't walked to),
  `routes.ts` (asking for and following a route, the last step onto a spot; a bot pushed off a leg walks back to it
  rather than over a ledge, G11; a leg over a low obstacle sets `vaultLeg`, and the brain presses Jump at it, M102;
  shared with `squadOrders.ts`, so the two files don't import each other) and `botCombat.ts` (aim, bursts, reloads; bots lead a target with `flightTimeEstimate`, and hold fire through more bush than `foliageFireThrough`, Easy as far as a BB gets through, FO1); `botTorch.ts` handles weapon
  lights at night, and `botHolster.ts` the holster (M92: put away on a calm sprint through its own half).
- `perception.ts`, `aim.ts`, `cover.ts`: view cone and static ray casts (sight also stops on the body of someone already
  hit, KI1); turn rate and aim error (a fresh contact's first aim starts wide
  to one side and settles from the trigger, G11; the sight on the replica in hand scales it, `BOT_SIGHT_AIM`, BG1); hidden spots, low
  cover and wall corners (a bot leans out at a corner). `angles.ts`, `angleFeatures.ts`: held angles.
- `squadOrders.ts`, `squadFollow.ts`: Follow me, Hold here, Regroup (default keys F, X, V, or the order wheel on Z); in
  Extraction the runner's bot teammates follow and cover. `extractionRoles.ts`: home-team guards, patrols and hunters.
- In Attack / Defend defenders hold the first one or two lane points and the two nearest the pole run to it once the
  flag is off the bottom; attackers go to the pole from midfield and crouch by it. Nobody hunts.
- Elimination's overtime flag (OT1) uses flag mode too: on the `overtime` event each bot draws its reaction
  (`overtimeReaction`) and whether it flanks (`flankChance`), then runs to the flag's foot; a personality with Watches
  the flag first (`personality.ts overtimeWatching`) guards it from cover for its seconds before going in.
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
  over `depotMatchSupport.ts` and `extractionRunSupport.ts`, which play with the rigged figures' hit rules from
  `riggedHitsSupport.ts`, as a match does since BD1) are the `slow` project: they check what must never happen
  (rounds played and settled, nobody stuck, falling or hit by a teammate, each mode's rules). They are seed-sensitive:
  re-measure over 16 seeds before changing a threshold (`docs/DECISIONS.md`). `testSupport.ts` (the small worlds and
  the one-bot duel the unit tests share) and the other files named `*Support.ts` here are test-only.
- `balance/`: the bot balance figures (who wins, the first hit, Extraction's get-out rates), measured on demand by
  `node pipeline/balance.mjs`, never asserted (`balance/README.md`).
