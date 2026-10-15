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

## FO1 · Bushes stop and throw off BBs (Dev 6 item 44)
tier: core
perf: required
touches: src/ai/botCombat.ts, src/audio/sfx.ts, src/audio/soundMaterials.ts, src/config/adaptiveDifficulty.ts, src/config/audio.ts, src/config/ballistics.ts, src/config/bots.ts, src/config/minimap.ts, src/config/renderEffects.ts, src/config/renderView.ts, src/config/sounds.ts, src/content/mapLayout.ts, src/content/mapLayoutChecks.ts, src/map/foliage.ts, src/map/mapTypes.ts, src/physics/physicsWorld.ts, src/render/combatPresentation.ts, src/render/leafFlecks.ts, src/sim/armament.ts, src/sim/ballistics.ts, src/sim/bbs.ts, src/sim/events.ts, src/sim/leaves.ts
contract: WorldQuery (`foliage`, optional: the map's bushes), the BB pool (`BB.leaf`), two events (`bbImpact.leaves`, new `bbLeaves`), BallisticsConfig (`leaves`), ImpactMaterial (`leaves`, a new title cue `impact.leaves` appended last) and BotSkill (`firesIntoLeaves`, taken from the level under adaptive difficulty)
acceptance:
  1. A BB that runs into a bush (MapData.foliage, the same ellipsoid bots' sight uses) stops once it has crossed BALLISTICS.leaves.stopDepth of leaves, counted over its whole flight (`BB.leaf`), at the point where it reached it, and reports `bbImpact` with `leaves: true`. stopDepth equals BOT_BEHAVIOUR.foliageSeeThrough (a test holds them equal). Someone standing behind a bush's middle is never hit through it; someone whose body starts less than stopDepth into the leaves still is. A BB fired from deep inside a bush stops before it gets out.
  2. A BB that comes out of a bush having crossed less flies on from where its path leaves the leaves, its speed and backspin times keptPerMetre^depth, its direction turned by at most scatterPerMetre × depth (from the simulation's seeded stream, any way round its line), and reports `bbLeaves`. A crossing that spans ticks counts every piece. A BB that misses every bush, and every BB on a map with none (Depot), flies exactly as before.
  3. People walk through bushes as before; bushes still hide whoever is more than foliageSeeThrough inside or behind one from bots, and never block hearing.
  4. Bots hold fire when the line to their target runs through more than BOT_BEHAVIOUR.foliageFireThrough of bush; Easy (BotSkill.firesIntoLeaves) fires through as much as a BB could cross. Both teams alike; the bot-match guards on Woodland still pass.
  5. A BB stopped by leaves plays a soft leafy rustle (`impact.leaves`, appended last among the title cues so every other cue's sound is unchanged) and knocks a few green leaves out that drift down and fade; one through an edge plays it quieter (AUDIO.levels.leafBrush) with fewer leaves. A BB landing in the top of a Neon Heights planter (its shrubs) rustles the same way; the planter still stops it as before. Your own BB stopped within HUD.leavesNoticeNear of you shows "Leaves in the way · step clear to shoot".
  6. The leaves are one instanced draw at every quality, pooled, with nothing allocated per frame or per tick for them; the BB step allocates nothing for bushes. Every tunable is in config (`BALLISTICS.leaves`, `BOT_BEHAVIOUR.foliageFireThrough`, `LEAF_FLECKS`, `AUDIO.levels.leafBrush`, `HUD.leavesNotice`); the main chunk stays at or under 1,250 kB.
status: open
attempts: 0
