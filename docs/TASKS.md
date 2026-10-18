# Tasks

Open tasks only, one block each (format in `pipeline/README.md`). A task that lands leaves this file in its records
commit, before its pull request merges (CI's scope gate finds the block in the branch's history): its record
(`docs/records/<id>.md`) and its CHANGELOG line remain. The planning thread writes blocks; the build thread sets
`status` and `attempts` once, in its records commit (no status-only commits).

**Frozen after 0.1 Beta 1 (owner, 2026-10-18).** It is this repository's last build: no block below has started, and
none will be built here (`docs/HANDOFF.md`).

**0.1 Beta 1 (owner, 2026-10-16).** Fixes, balance, performance and polish, with no features. The blocks come from
`docs/ROADMAP.md` › Beta, `docs/KNOWN_ISSUES.md` and the owner's Dev 6 playtest (2026-10-16, rulings in
`docs/DECISIONS.md`). The draft and the backlog triage are in the project's shared files
(`plans/beta-1-task-draft.md`, `triage/known-issues-triage-2026-10-16.md`), and so are the playtest blocks
(`playtest/dev6-playtest-blocks.md`).

- **Order.** Highest priority first. A block marked *after playtest* waits until the owner has played the parts it
  tunes, and PF2 also waits for his laptop baseline.
- **Placed in a later update.** NH1 and NH2 go with the Maps Update, because Neon Heights stays dev in 0.1 (NH2: owner,
  2026-10-17). HV1 goes with the
  rigged figures leaving the Dev switches, which BD1 now does in Beta 1, so HV1 lands with BD1 or straight after it.
- **Numbers are first guesses.** Numeric targets can be changed by the owner. Note 19 applies to every balance block:
  tune on Normal, then check that Easy, Hard and Pro still scale.
- **`touches` are first guesses.** The build thread confirms them before it starts.

**The owner's Dev 6 playtest list (2026-10-16).** These are his 34 items, taken in Beta 1 on his word, small
additions included (`docs/DECISIONS.md`). Seven threads build them, one block each, and they come before the blocks
below. The item numbers are his. Where an older block overlaps one of these, the owner's item wins.

MS1 shows the owner concept images and waits for his approval before any code changes.

## BL1 · Attack / Defend: fewer attacker wins, more rounds won at the pole (after playtest)
tier: core
perf: skip
touches: src/sim/flag.ts, src/config/modes.ts, src/ai/teamPlan.ts, src/ai/personality.ts, src/config/botPersonalities.ts, src/ai/balance/depotFlag.balance.ts, src/ai/balance/depotRicochetFlag.balance.ts
contract: none
acceptance:
  1. Bot-only Depot Attack / Defend with personalities and ricochets on: attackers win 40–60 % over seeds 1–48 (today 64.6 %).
  2. At least 1 round in 4 is won at the pole (today 1 in 7), using the roadmap's levers: raise time, defender holds and retakes.
  3. When the flag is tagged, at most one defender leaves its post, so one player can't bait two away.
  4. Woodland's Attack / Defend is WL1's, so two threads don't tune the same map.
  5. The KNOWN_ISSUES rows for personalities, ricochets and pole captures close as one. ROADMAP's "1 in 10" is corrected.
status: open
attempts: 0

## WL1 · Woodland Attack / Defend: attackers reach the pole, the ends even out (after playtest)
tier: core
perf: required
touches: src/map/woodland.ts, src/map/woodlandDressing.ts, src/map/woodland.test.ts, src/map/woodlandTeams.qa.test.ts, src/ai/balance/woodlandLevelsFlag.balance.ts, src/ai/balance/woodlandProFlag.balance.ts, src/ai/balance/woodlandLevels.balance.ts
contract: none
acceptance:
  1. Before changing anything, the record shows where attackers are knocked out on the way to the pole (bot-only, Normal, seeds 1–32, both halves) and how many rounds end before the attackers reach it. That decides the fix.
  2. Fewer rounds end with the attacking team wiped out before any attacker reaches the pole: target at most half of today's figure. The approach gets cover and at least one route that isn't in the open, in that order before the camps or the pole move; the map grows only if those fail, and the record says why.
  3. The uphill / downhill lean closes: in Attack / Defend and in Elimination neither end wins more than 55 % of decided rounds at Normal over seeds 1–32 (Elimination today: the downhill west end 57.4 %).
  4. Attack / Defend stays in its 40–60 % band at every difficulty, Pro included (today 56.0 %), and Extraction on Woodland stays in its bands.
  5. Hidden starts still hold (M88): neither camp sees the other from its first steps out.
  6. The Woodland rows in `docs/KNOWN_ISSUES.md` (Elimination at 5v5, Pro Attack / Defend) close or carry the new numbers. If William later wants more players instead, that is his call; this block does not raise the team size.
status: open
attempts: 0

## NH1 · Neon Heights: a reason to go up (Maps Update, with its new look)
tier: core
perf: required
touches: src/map/neonHeights.ts, src/map/neonHeightsDressing.ts, src/map/neonHeights.test.ts, src/map/neonHeightsData.test.ts, src/ai/balance/neonHeights.balance.ts, src/ai/balance/neonHeightsFlag.balance.ts, src/ai/balance/neonHeightsPro.balance.ts
contract: none
acceptance:
  1. The record measures today's split first: the share of time and of knockouts on Level 1 and Level 2 against the street, bot-only, Normal, seeds 1–32, Elimination and Attack / Defend.
  2. The upper floors earn their climb: sight lines from them onto the lanes and the flag's approach that the street can't match, and at least one route across the map at height (the Sky Bridge, balconies, galleries) that is quicker or safer than its street route. Every upper-floor spot that sees the street is seen back from somewhere, so height is an edge, not a lock.
  3. Bots use height: anchors and careful bots hold upper-floor spots, and flankers take the high routes. At least a third of knockouts involve a player above the street (first guess; tune in play).
  4. The ends stay even: neither wins more than 55 % of decided Elimination rounds by Day or by Night, and Attack / Defend stays in its 40–60 % band at every difficulty.
  5. The stairs and the Plaza stair still climb without a jump (BP5), and Extraction on Neon Heights stays in its bands.
status: open
attempts: 0

## NH2 · Neon Heights: doors you open and close, and furnished interiors (Maps Update, after NH1)
tier: core
perf: required
touches: src/sim/, src/physics/, src/ai/, src/audio/, src/render/, src/config/, src/map/neonHeights.ts, src/map/neonHeightsDressing.ts, src/map/neonHeights.test.ts, src/ai/balance/neonHeights.balance.ts, src/ai/balance/neonHeightsFlag.balance.ts
contract: needed (a new door system: its state, the open and close command, what it blocks, what bots hear)
William's Beta 1 playtest, 2026-10-17 (item 32), placed with the Maps Update on his pick: "neon heights map looks much
better. however some changes to the map i'd like to make. buildings have doors that the player must open/close. this
affects gameplay because it's a visual cue to see where players have been. also if a door is closed the player needs
to be careful as there may be an enemy behind it. the player can close the door behind them too. also interiors need
to be more detailed. they should look like normal interiors like shops, offices, storage rooms, cafes, hotels, etc."
acceptance:
  1. Neon Heights' building doorways have hinged doors that players and bots open and close with one bindable key,
     through the same command interface; a door stays as it was left, so it shows where someone went, and it makes a
     sound bots hear.
  2. A closed door blocks sight and BBs. Bots open doors to pass, sometimes close them behind, and treat a closed door
     they haven't seen through with care.
  3. Interiors are furnished by type (shops, offices, storage rooms, cafes, a hotel lobby) in the house style
     (`docs/ART.md`), with cover that plays and nothing a player can never see (MS1's ruling), inside Neon Heights'
     triangle and draw-call lines.
  4. The ends stay even (neither over 55 % of decided Elimination rounds by Day or by Night) and Attack / Defend stays
     in its 40–60 % band at every difficulty. Built after NH1, so the doors and rooms fit its upper floors.
status: open
attempts: 0

## BL2 · Difficulty spread: Easy plays easier than Normal (after playtest)
tier: core
perf: skip
touches: src/config/bots.ts, bots.md, src/ai/balance/depotDifficulty.balance.ts, src/ai/balance/closeRange.balance.ts
contract: none
acceptance:
  1. On Depot Elimination, Easy hits at most 75 % of Normal's share of its BBs (today 6.8 % against 6.9 %).
  2. Easy's first hit at 5 m stays slower than Normal's, and Hard and Pro stay above Normal on both figures.
  3. Hard's 5 m duel figure follows William's call from his playtest (BP5 left it to him).
  4. Adaptive difficulty's steps (a Dev setting) are re-checked against the new spread (`balance.mjs adaptive` in band).
status: open
attempts: 0

## PF2 · The laptop pass (after William's laptop baseline)
tier: core
perf: required
touches: src/render/, src/map/, src/config/renderQuality.ts
contract: none
acceptance:
  1. Starts once `pipeline/baseline/laptop*.json` is committed (PLAYTEST › Only you can do these).
  2. Profile first. The record ranks the top causes of frame time on Low and Medium on Depot and Woodland, by day and by night.
  3. Fix the top causes until Low holds 60 FPS on modern low-powered hardware (the owner's ruling, 2026-10-16), Medium too where it can, on the laptop baseline's scenes. If a fix would cost too much, say what and why.
  4. Add a High or Ultra night run to the perf gate, so the torch shadow map's cost is measured.
status: open
attempts: 0

## BT1 · Bot quirks from the backlog (after playtest)
tier: core
perf: skip
touches: src/ai/botCombat.ts, src/ai/cover.ts, src/ai/botMovement.ts, src/ai/squadFollow.ts
contract: none
acceptance:
  1. A bot fighting from crouch cover keeps fighting a second enemy in sight after its target goes down.
  2. (KI1 retried it alone: it failed `depotMatch.overtime` and `depotMatch.stackHouse`'s follow check.) The pause between bursts counts down while the line of fire is blocked, bundled with the spacing fix BP2 named (teammates inside each other in tight spots). Re-measured over 48 seeds, and every guard stays green.
  3. Done in KI1: `ai/coverCycle.test.ts` covers the cycle; M72's `holdLeanSweep.test.ts` already covers AI-05 and AI-06.
  4. The old soak rows (long rounds, friendly hits, the office doorway) are measured again, then either closed or updated.
status: open
attempts: 0

## TU1 · Final tuning of first-guess values (after playtest)
tier: core
perf: skip
touches: src/config/footsteps.ts, src/config/noise.ts, src/config/ballistics.ts, src/config/movement.ts, src/map/foliage.ts, stats.md
contract: none
acceptance:
  1. Each value William flags in his playtest is tuned: footstep ranges, hop-up arcs, bush stopping, noisy props and ramp pace (`MOVEMENT.rampPace`).
  2. The values he doesn't flag stay as they are, and their playtest rows become document rows. The callouts' pace is fine (playtest, 2026-10-16).
  3. Overtime rarely comes up, because rounds end in wipe-outs before the clock (playtest, 2026-10-16). The instant take stays as it is unless BL1 or WL1 makes rounds run to time. Round time isn't changed here.
  4. Magazines carried (4 × 60 AEG, 4 × 18 pistol) change only if he asks.
  5. Still untested by William, so parked: Adaptive difficulty's steps, the laptop and Ultra baselines (PF2), and Save in Firefox and Edge.
status: open
attempts: 0

**The repository audit (2026-10-16; owner: "go ahead").** DX1–DX8 come from
`/mnt/project-files/audit/repo-audit-2026-10-16.md`, in the order to run them. Each one waits until the playtest
threads' branches it touches have merged (ST1, MR1, HD1, MV1, BD1, MS1, TT1), so none conflicts with them. DX2 takes
over DC1's known-issues tidy-up. DX0, the quick wins, is the audit thread's own pull request.
