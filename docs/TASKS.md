# Tasks

Open tasks only, one block each (format in `pipeline/README.md`). A task that lands leaves this file in its records
commit, before its pull request merges (CI's scope gate finds the block in the branch's history): its record
(`docs/records/<id>.md`) and its CHANGELOG line remain. The planning thread writes blocks; the build thread sets
`status` and `attempts` once, in its records commit (no status-only commits).

**The owner's 0.1 Dev 4 playtest notes (2026-10-06).** Recorded on his ask, not built yet; they follow the rest
of the paused 0.1 Dev 5 work. His words and the per-item reasoning are in the project's shared
files (`plans/playtest-feedback-0.1-dev-4.md`); `docs/ROADMAP.md` › Playtest notes: 0.1 Dev 4 maps all 26 notes. M80–M91
and M96 are 0.1 Dev 5 fixes and changes, M92–M95 suggested 0.1 Dev 6 features. Notes 5 and 22 are now the Replica
Update, notes 20, 21 and 23 the Modes Update (owner, 2026-10-12; ROADMAP).
Every block below carries note 19: tune on Normal, then check that Easy, Hard and Pro still scale. `touches` are
first guesses; the build thread confirms them before it starts. The owner ruled on every conflict on 2026-10-06
(ROADMAP, under the playtest table).

**The owner's playtest notes on main (2026-10-07).** Recorded on his ask, not built yet. His words, the type and the
defaults per note are in the project's shared files (`plans/playtest-feedback-2026-10-07.md`);
`docs/ROADMAP.md` › Playtest notes: main after G3 maps all eight. M97–M99 join the Dev 4 notes batch (Dev 5 item 6); M100 is the graphics work's (Dev 5
item 5, with the G4 HUD restyle); note 3 was a bug, fixed in BP2; note 2 is already in the game
(Settings › Controls › Aim button). Note 19 of the Dev 4 notes still applies.

**0.1 Dev 6 (confirmed with the roadmap, 2026-10-06).** M92–M95, the holster and the practice upgrades, are done
(2026-10-13); the blocks for the rest of `docs/ROADMAP.md` › 0.1 Dev 6 are written when that work starts.

## BG1 · Bots' gear keeps up with yours
tier: core
perf: required
touches: bot-kits.md, src/ai/balance/botKits.balance.ts, src/pool/botKit.ts, src/pool/gameBotKits.ts, src/pool/kit.ts, src/matchSession.ts, src/newGamePicks.ts, src/game.ts, src/config/bots.ts, src/config/characters.ts, src/config/matchRules.ts, src/ai/aim.ts, src/ai/botCombat.ts, src/ai/botSenses.ts, src/ai/depotMatchSupport.ts, src/content/contentInputs.ts, src/content/gameContent.ts, src/content/replicaChecks.ts, src/render/characterRenderer.ts, src/render/figureReplicas.ts, src/render/replicaModels.ts, src/render/replicaParts.ts, src/render/riggedFigure.ts, src/progress/levels.ts
contract: bot-kits.md's format (new), MatchSetup (the earned-replica carrier goes: `earnedReplicas`, before LV1 `chaseOwned`)
acceptance:
  1. `bot-kits.md` at the root lists named kits: a primary and a secondary replica, each with its parts and power
     source by pool.md Name or ID, and a weight per difficulty. The game reads it at start; a row it can't read is
     left out with a console warning, and the tests name its line.
  2. Every opponent picks its own kit by its difficulty's weights, seeded by the match and its id, so a replay keeps
     them. Teammates, and everyone under the factory kit rule, carry the replicas as they come; at night the torch is
     still fitted by rule. What the player owns or carries never changes a bot's kit.
  3. Kits scale with difficulty: Easy mostly factory, more and better matched gear each level up, Pro never factory,
     the Cyber Pistol now and then from Hard up. A kit holding dev gear is picked only with Dev content on, and the
     records rule says so before the match.
  4. A bot aims through the sight on the replica in its hands: a scope holds finer at range but settles later, finds
     someone close later and loses a crossing target; a red dot is a little finer and quicker; iron sights aim as
     before. Gear never changes what a bot sees or hears.
  5. A bot's silencer, laser, barrel, magazine and power source work as the player's do (heard nearer, spread, rate,
     capacity, energy under the site limit).
  6. Bots show their gear: the built-in figures carry the rifle's optic at every detail; the rigged figures (behind
     the Dev switches) hold each replica's model with its optic, grip, laser and barrel, the muzzle device at a longer
     barrel's end. A kit change between rounds rebuilds only that figure.
  7. The content check warns when no kit in `bot-kits.md` brings a replica.
status: open
attempts: 0
