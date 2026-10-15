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


## MG1 · Ask a teammate for a magazine, and toss one (Dev 6 item 43)
tier: core
perf: required
touches: README.md, callouts.md, src/ai/, src/audio/sfx.ts, src/config/calloutsFile.ts, src/config/controls.ts, src/config/dev.ts, src/config/magShare.ts, src/config/replicas.ts, src/config/sounds.ts, src/config/squad.ts, src/config/tutorial.ts, src/game.ts, src/input/playerInput.ts, src/input/scriptedInput.ts, src/magHandoff.ts, src/matchSession.ts, src/render/combatPresentation.ts, src/render/magTosses.ts, src/render/matchPresentation.ts, src/settings/storage.ts, src/sim/commands.ts, src/sim/elimination.ts, src/sim/events.ts, src/sim/magShare.ts, src/sim/simulation.ts, src/sim/state.ts, src/ui/botIntentLabels.ts, src/ui/hud.css, src/ui/hudCss/mags.css, src/ui/hudSettings.ts, src/ui/magPrompt.ts, src/ui/orderWheel.ts, src/ui/teammateMarkers.ts
contract: PlayerCommand (`tossMag`), GameState (`magTosses`) and three events (`magToss`, `magCaught`, `magLost`), stepSimulation's phase order (a toss after the torch, the landings after the BBs), ReplicaConfig (`siteClass`), the key bindings (`askMag`), the order wheel's items (a fifth, Need a Mag), the settings store (key `magPrompts`), the Dev settings (`botsRunLow`) and callouts.md's format (three events: Need a mag, Mag coming, Thanks for the mag)
acceptance:
  1. In a match, the Mag key (H by default, Settings › Controls) or the order wheel's Need a Mag, pressed while low (the pouch for the replica in hand holds less than one full magazine of it): the nearest bot teammate within MAG_SHARE.askRange that is free (in play, not bringing one or asking itself, not off to the pole) and has a spare of the same class (a rifle's for a rifle, a pistol's for a pistol), keeping a full spare of the replica it fights with, brings you one. The HUD names it. Not low, nobody to ask, one already coming, out of play or between rounds: a notice says so and nothing else happens.
  2. A toss leaves the thrower's hand once canTossTo allows (teammates in play, within MAG_SHARE.tossRange hand to chest, no level geometry between): its BBs leave the spare it took at once and land after flightBase + flightPerMetre × distance in the catcher's emptiest spares for the replica it had in hand. No BB is made: what fits moves, and nothing more. A catcher out of play by then, or a round decided meanwhile: the magazine is lost (`magLost`).
  3. A bot low for the replica it fights with asks the nearest teammate within askRange with one to spare: a bot comes over and tosses it while the asker waits; you, it walks up to within MAG_SHARE.walkUpTo of you and waits. You see "{name} needs a mag · N m", then "H · Toss {name} a mag" once you can toss (the Mag key, or the wheel's item, then reading Toss a Mag), which tosses it. An ask lapses after askTime; a bot asks again no sooner than botAskGap after an ask ends or finds nobody, you no sooner than playerAskGap.
  4. A fight or cover comes first; bringing one comes before a squad order, the pole and the team plan; waiting for one after them. The same at every difficulty, both teams alike.
  5. callouts.md has Need a mag, Mag coming and Thanks for the mag with lines in each personality's voice (48 characters at most); a bot calls its ask and its answer once each, as soon as its own gap allows, and Talks (×) never makes them less likely. The callouts still never change play.
  6. The tossed magazine flies as a small code-made box (a rifle's or a pistol's) on an arc to the catcher's chest, turning end over end, with a toss and a catch sound from where they happen; no new model file. The line under the crosshair is at the HUD's size and opacity, a toss in your team's colour, and the teammate's name tag reads "· mag"; Settings › HUD › Mag hand-off (On by default, saved) hides both, and the hand-off still works.
  7. Dev settings › Bots run low on BBs (a cheat, off by default): MAG_SHARE.devLowAfter into each round (round 1 too), one bot of each team in turn is put on its last magazine, so the hand-off can be watched.
  8. Nothing is allocated per tick or per frame for it; with nobody low the bot-match guards and the simulation's determinism are as they were; the main chunk stays at or under 1,250 kB.
status: open
attempts: 0
