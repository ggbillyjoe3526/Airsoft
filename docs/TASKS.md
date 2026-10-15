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

## NP1 · Noisy ground and props (Dev 6 item 41)
tier: core
perf: required
touches: src/ai/botController.ts, src/audio/sfx.ts, src/audio/soundMaterials.ts, src/audio/soundscape.ts, src/config/audio.ts, src/config/noise.ts, src/config/renderEffects.ts, src/config/sounds.ts, src/map/groundSurfaces.ts, src/map/underfoot.ts, src/physics/physicsWorld.ts, src/render/combatPresentation.ts, src/sim/armament.ts, src/sim/bbs.ts, src/sim/events.ts, src/sim/footsteps.ts, src/sim/propNoise.ts, src/sim/simulation.ts, src/sim/state.ts, src/ui/soundCues.ts
contract: GameState (`propQuiet`) and the events (`propNoise`, `footstep.surface`), WorldQuery (`noisyProps`, `surfaceUnder`, both optional), stepSimulation's phase order (a knock after the move, a ring in the BB step: `stepBBs`' `noise` context, `SimContext.propNoise`)
acceptance:
  1. Running into a noisy prop (`NOISE.props`: skips, containers, the van; generators, IBCs; racks, stalls, vending machines; phone booths; site toilets, arcade cabinets; crates, pallet loads, Woodland's board fence) at NOISE.bumpSpeed or more into its face (a run or sprint straight in) knocks it once, from the face hit (`propNoise`, `shot: false`). Walking, crouching, glancing along it (under about 45° at a run), pushing on against it, standing on it or a wall beside it never do. A prop sounds at most once per NOISE.quiet, whoever sets it off.
  2. A BB landing at NOISE.shotMinSpeed or faster on steel that rings (`shot` above 0) rings it where it stopped (`propNoise`, `shot: true`), sharing the prop's quiet.
  3. The other team's bots hear a knock to the prop's `bumped` range (every one further than a run's 11 m), placed on whoever hit it, walls muffling it as any sound, shared by teamPlay bots as a step is. A ring is heard to its `shot` range, where it rang, only by a bot with nobody in sight and nothing seen or heard within hearingContactTime, and is not shared. The same at every difficulty.
  4. A run, sprint or landing carries the ground it came down on (`footstep.surface` from `WorldQuery.surfaceUnder`, the same answer the audio plays): on gravel or steel plate bots hear it NOISE.ground times as far and you hear it that much louder and further; walking stays silent on every ground; anything else as before.
  5. You hear a knock from where it happened, in its prop's sound (steel, clank, rattle, glass, plastic, wood), within AUDIO.propNoise.maxDistance, with a puff of the prop's dust; a ring plays as the BB's impact only. The Sound cues ring and the minimap mark an enemy's knock as a step out to that range. Prop sounds are map cues rendered only for maps with that prop, each within the map sound budget; the title screen renders nothing more and no fingerprinted cue changes.
  6. Every number is data (`config/noise.ts`, AUDIO.levels.propBump, AUDIO.propNoise, PROP_BUMP_DUST). Nothing is allocated per tick or per frame unless a prop sounds; determinism and the bot-match guards hold; the balance figures stay in their bands (or within noise) on all three maps; the main chunk stays at or under 1,250 kB.
status: open
attempts: 0
