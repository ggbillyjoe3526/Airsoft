# Roadmap

The plan and the build status: what is being built now, in what order, and what comes in later versions. The owner and
every session read it. The process rules (versioning, branches, pull requests, the release checklist, the bug pass) are
in `docs/PROCESS.md`.

## Where we are

- **Building 0.1 Dev 5.** The game stays in Dev until the owner calls it feature complete (owner, 2026-10-06). Beta then
  adds no features.
- **Last tag:** `0.1-dev.4`, on 2026-10-06. The owner creates tags.
- **Next:** the Dev 5 plan below. Item 1 is the docs rewrite, then token step 3, token step 4 and bug pass BP2.
- **Single player against bots.** There is no multiplayer, ever (owner, 2026-09-30, confirmed 2026-10-03).
- **How work moves.** Every task goes through the pipeline and the critic, and lands as a pull request into `main`.
  Each pull request says which parts of the playtest guide (`docs/PLAYTEST.md`) to play. The owner's playtest notes set
  the priorities. Move on only when the previous part is fun.

## Builds

| Build | Date | What it brought | Tag |
|---|---|---|---|
| 0.1 Dev 1 | 2026-09-30 | The playable single-player slice: Depot, the AEG and the pistol, bots, 3v3 rounds | `0.1-dev.1` |
| 0.1 Dev 2 | 2026-10-01 | Elimination and Attack / Defend on Depot, with sound, difficulty levels and smarter bots | `0.1-dev.2` |
| 0.1 Dev 3 | 2026-10-03 | Leaning, magazines and reloads, BB physics, movement and positioning, ramps and raised floors | `0.1-dev.3` |
| 0.1 Dev 4 | 2026-10-06 | Loadout, Customise and Armory, new menus, fire modes and aiming down sights, real BB flight, a rebuilt Depot and a new look, new sounds; Woodland, Neon Heights, Extraction and Pro in development | `0.1-dev.4` (commit `63e6500`) |

Only full releases are tagged (owner, 2026-10-01): playtests in between are plain commits. Two checkpoint tags,
`v0.1-alpha.2a` (commit `d8c4568`) and `v0.1-alpha.2b` (commit `08b37e3`), were removed after `0.1-dev.2`. The
versioning policy (what Dev and Beta mean, tag names, branches) is in `docs/PROCESS.md › Versioning`.

## 0.1 Dev 5: the plan

Confirmed by the owner on 2026-10-06: the token-efficiency steps and the docs rewrite come first, the content toolkit is
pulled into Dev 5, and Dev 7 is folded away (its mode checks join the toolkit here, its features go to
[0.1 Dev 6](#01-dev-6-the-feature-picks)). The order:

1. **Docs rewrite with token step 2** (TE2 below).
2. **Token step 3** (TE3, a pipeline pull request).
3. **Token step 4** (TE4, approved 2026-10-06).
4. **Bug pass BP2** (the Dev 4 rows in `docs/KNOWN_ISSUES.md`), after the last Audit 2 tasks M77–M79 in
   `docs/TASKS.md`.
5. **Graphics** (the overhaul the owner pulled forward from 0.2 on 2026-10-05). G1–G3 and G5–G8 are merged. Left: G4,
   G9, WebGPU as a complete overhaul (W0–W6) and the map pictures (see Graphics below).
6. **The owner's playtest notes:** the Dev 4 notes M80–M91 and M96, and the 2026-10-07 notes M97–M99 (M100 is part of
   the graphics work, item 5; tables below).
7. **The content toolkit, all four parts** (plan `plans/content-toolkit-concept.md`, approved with all defaults
   2026-10-05; about six to eight pull requests): 1 rulebooks and briefs, replica and attachment checks and the report
   with pictures; 2 map checks; 3 mode checks; 4 skin checks.
8. **Bug pass BP3**, then the owner tags 0.1 Dev 5 and playtests it.

### Audit 2: tasks left

Audit 2 is the full audit of 2026-10-05 (91 findings: 0 critical, 1 high, 18 medium, 51 low, 21 improvements). The owner
confirmed all 34 decisions on their defaults. It is built as tasks from M50 on; three are left, with their acceptance
criteria in `docs/TASKS.md`. They come before bug pass BP2.

| Task | What | Audit findings |
|---|---|---|
| M77 | Hot-path trims | SIM-06, SIM-07, REN-10 |
| M78 | Splits: replica models, render config and city texture size | REN-09, REN-11 |
| M79 | Docs, change records and small leaks | CORE-07, CORE-08, CORE-13, CORE-14, AUD-06, report section 5 |

### Graphics: what is left

The overhaul (plan `plans/graphics-overhaul-0.2.md` in the project files) is a stylised look, an Ultra preset and a
post-processing stack, with all three maps re-dressed. **WebGPU is now a complete overhaul** (owner, 2026-10-07;
replaces G10 and its "only if the perf run shows a gain"; scope `plans/webgpu-overhaul-scope.md`):

- WebGPU draws every preset, with WebGL2 only as the automatic fallback through the same code.
- Every material, shader and post pass is rebuilt on the node material system.
- GPU compute handles particles, Woodland's grass and culling.
- A performance gate covers every map and both back ends.

| Step | What |
|---|---|
| G4 | HUD restyle, with the menu redesign M100 (his 2026-10-07 notes) |
| G9 | Woodland and Neon Heights re-dressed |
| W0 | The owner's laptop and desktop WebGL baselines |
| W1 | Foundation |
| W2 | World materials |
| W3 | Figures, replicas and clustered lights |
| W4 | Post stack and retro filter |
| W5 | Compute |
| W6 | The switch (the old renderer is deleted) |
| Map pictures | Last, from the new renderer |

### Playtest notes: 0.1 Dev 4

The owner's notes of 2026-10-06. Open: none of it is built yet. His words, the type and the reasoning per item are in
the project's shared files (`plans/playtest-feedback-0.1-dev-4.md`). The tasks are blocks M80–M96 in `docs/TASKS.md`:
M80–M91 and M96 are Dev 5 item 6, M92–M95 are in [0.1 Dev 6](#01-dev-6-the-feature-picks). **Normal difficulty is the
baseline** for every change (note 19): tune on Normal, then check that Easy, Hard and Pro still scale. He ruled on every
conflict with an earlier decision on 2026-10-06 (below the table and in `docs/DECISIONS.md`).

| # | Note | Goes to |
|---|---|---|
| 1 | The tutorial shows the scoreboard and the comm wheel when it names them; plainer but complete wording; a finish pop-up offering the practice range or the menu | M80 (0.1 Dev 5) |
| 2 | Keep the Retro filter | M96 (0.1 Dev 5): public as soon as possible (ruled 2026-10-06; was 0.5 in the triage) |
| 3 | Holster on 3 (1 primary, 2 secondary); sprinting holstered is faster but drawing to aim is slower; sprinting with the replica ready aims faster | M92 (0.1 Dev 6) |
| 4 | Sort and filter replicas by rarity in the Loadout, and parts by rarity in Customise | M82 (0.1 Dev 5, after G3) |
| 5 | A 2–4x variable scope (mouse wheel while aiming) and a holographic sight | 0.1 Dev 6 (feature pick 15) |
| 6 | Skip to the next round from the spectator camera | M83 (0.1 Dev 5) |
| 7 | A setting for a fixed or rotating minimap | M83 (0.1 Dev 5) |
| 8 | Walking (Shift) while aiming down sights slows you further | M84 (0.1 Dev 5) |
| 9 | The practice range and tutorial area in the new graphics | M81 (0.1 Dev 5, after G5 and G6; the graphics plan re-dresses only the three maps) |
| 10 | Practice: moving targets, more target types, a timed high-score challenge (off by default) | M93 (0.1 Dev 6) |
| 11 | Practice on any map with targets instead of bots; rename the range "Practice" | M94 (0.1 Dev 6) |
| 12 | Practice with any unlocked replica and Customise; everything with Dev on | M95 (0.1 Dev 6) |
| 13 | Woodland: too open, the far team visible from the start, the blue end's height edge; hidden starts; 5v5 default, 6v6, maybe Woodland only for 5v5 and 6v6 | M88 (0.1 Dev 5): 5v5 default, 6v6 allowed, Woodland only for those two (ruled 2026-10-06) |
| 14 | More varied, less distracting ambience; an Ambience volume | M86 (0.1 Dev 5) |
| 15 | Bots on both teams check spots that are plainly empty (corners); refine on every level | M87 (0.1 Dev 5, after M71) |
| 16 | Every replica aims down sights: iron sights without an optic; hip fire stays viable | M84 (0.1 Dev 5): iron sights now, beside scopes (ruled 2026-10-06; replaces his 0.1 Dev 3 note 3) |
| 17 | BBs seem to pass through the nearer bot and hit the one behind; check, and tighten hit detection | M85 (0.1 Dev 5) |
| 18 | Modes and match settings make sense together (no Tournament rules in Extraction) | M89 (0.1 Dev 5) |
| 19 | Normal difficulty is the baseline for all feedback; check every change on the other levels | Standing rule for M80–M95 |
| 20 | Extraction loot looks like loot: crates and chests with a glow | 0.1 Dev 6, with the Extraction rework (feature pick 7) |
| 21 | Battle royale: pick a map and spawn point, a shrinking zone with a countdown outside it, start with nothing, weapons lie on the map as models, 10 players; experimental dev mode first | 0.4, dev first: an exception to the Free-for-all cut (ruled 2026-10-06); his answers below |
| 22 | An inventory: owned items in the menus, carried items on I in a match; a small carry limit in Extraction; currency takes one slot | 0.1 Dev 6 (feature pick 38, with the Extraction rework) |
| 23 | Extraction: solo against bots, more of them, quicker and closer waves, bots that hunt, guard and converge on an extraction, a longer extract timer, no respawn; a duo / trio revive later | 0.1 Dev 6, the Extraction rework (feature pick 7): replaces his 2026-10-04 picks (squad of 3, one respawn) and M72's idea of one opponent fewer on Normal (ruled 2026-10-06); the revive goes with Medic |
| 24 | More Dev settings for playtesting, starting with field credits and tokens on demand | M90 (0.1 Dev 5) |
| 25 | With the Armory turned off in Dev, hide it instead of greying it | M83 (0.1 Dev 5) |
| 26 | Softer, diffused torch beams that cast shadows | M91 (0.1 Dev 5, with the graphics work): shadows on High and Ultra only, Low as today for 60 fps (ruled 2026-10-06) |

**His rulings (2026-10-06, after the notes):**
- The Retro look goes public as soon as possible (M96).
- Woodland takes the new team sizes (5v5 default, 6v6, only those two).
- Iron sights come now, beside scopes.
- Torch shadows are for the higher presets only; Low stays as today.
- Extraction follows these notes (solo, more and harder opponents, no respawn). This replaces his 2026-10-04 picks and
  M72's idea of fewer Normal opponents.
- Battle royale goes ahead as an experimental dev mode, the exception to the Free-for-all cut.

**Battle royale, his answers:**
- A found replica holds one magazine and no spares, so BBs must be looted or it runs dry.
- Lootable replicas are rolled at random, with or without attachments that fit them (no loose attachments). Items show
  their rarity colour.
- One or two supply crates drop mid-match, announced by a flare.
- Four zone shrinks over about eight minutes, with a 10-second countdown outside the zone.
- Two replicas plus a small pack. Solo only for now.
- A placement screen, then spectating with Skip and Quit.
- No credits or records while it is dev, but both in the finished version.
- Throwables become loot once they exist.

### Playtest notes: main after G3

The owner's notes of 2026-10-07, on the latest `main` (with the G3 menus). Open: none of it is built yet. His words, the
type and the defaults per note are in the project's shared files (`plans/playtest-feedback-2026-10-07.md`). The tasks
are blocks M97–M100 in `docs/TASKS.md`. All of it is 0.1 Dev 5.

| # | Note | Goes to |
|---|---|---|
| 1 | A setting for the red X hit marker, Off by default | M97 (Dev 5 item 6) |
| 2 | Aim down sights by Hold or Toggle, Hold by default | Already in the game: `Settings › Controls › Aim button` (Hold by default) |
| 3 | Customise won't take "No light" on the AEG rifle; check every replica | BP2 (Dev 5 item 4; `docs/KNOWN_ISSUES.md`) |
| 4 | Teams renamed Alpha (blue) and Beta (orange); the player picks a team | M98 (Dev 5 item 6) |
| 5 | A plain title screen (Airsoft, the tagline, START, the version small at the bottom left); Play renamed Match; the top bar is the navigation (Match, Loadout, Armory, Settings; FC and Tokens on the right; no version); no key prompts along the bottom; Practice as the last mode; a more readable font | M100 (Dev 5 item 5, the graphics work, with the G4 HUD restyle) |
| 6 | Replica pictures in "Your replicas" are cropped | M99 (Dev 5 item 6) |
| 7 | The Armory's "Your collection" in columns, one per kind | M100 |
| 8 | The Tutorial under START on a clean save only; a Replay tutorial setting | M100 (the title) and M97 (the setting) |

**His rulings (2026-10-07, all four recommendations):**
- Inter replaces Barlow in the menus.
- The tagline becomes "Call your hit. Go again."
- The teams are Alpha and Beta even beside the Beta builds (colours unchanged).
- Practice and the Tutorial leave the title screen as his notes say, replacing his M21 and M16 rulings of 2026-10-04.

### Token efficiency

The owner approved the recommended set of the token-efficiency plan (`plans/token-efficiency-plan.md` in the project's
shared files; item numbers below are the plan's), and on 2026-10-06 put every step first in 0.1 Dev 5, step 4 included.
Models and effort levels stay as they are.

| Step | Items | When | Status |
|---|---|---|---|
| TE1 | 2 shorter CLAUDE.md (process detail in `docs/PROCESS.md`), 9 ask the owner at once, 10 lean thread start, 12 one push, 13 no status commits, 20 quiet test output, 23 session setup hook, 24 big-file read guard, 25 measure | Now (after M76) | Done |
| TE1 (memory) | 5 project memory at about 5 KB, 11 fresh threads for follow-ons, 14 pause on a branch, not in patch folders | With TE1, by the coordinator | Open |
| TE2 | 1 finished history to `docs/archive/`, 3 one record file per task, 4 one-line record formats, 6 HANDOFF shrunk or retired, 7 one-page module map | Inside the docs rewrite, Dev 5 item 1 | Done |
| TE3 | 15 review packet for the critic and QA, 16 performance agent only on a flagged perf run, 17 (a) leaner changelog agent, 18 near-miss re-run only for judgment checks, 19 failures-only gate summary | Dev 5 item 2 | Open |
| TE4 | 8 fewer chat lines, 21 lighter local test run, 22 bot balance as a report | Dev 5 item 3 (approved 2026-10-06, 23:27 UTC) | Open |
| Gradual | 26 split the largest files when a task already edits them | Ongoing | Open |

## 0.1 Dev 6: the feature picks

**Dev continues** (owner, 2026-10-06): more Dev builds add, tweak or remove features until he calls the game feature
complete. Only then does Beta start, and Beta adds no features: bug fixes, QoL, balance, refinement and polish.

He picked from a list of 50 candidates (`plans/dev6-plus-feature-candidates.md` in the project files; numbers as in
that list). Everything below is a yes. **Dev 7 is folded into Dev 6** (owner, 2026-10-06: "I want bigger builds";
grenades and the spring sniper by name), so Dev 6 holds all 26 and is the last planned Dev build unless he adds more.
Task blocks are written into `docs/TASKS.md` when the build starts.

Dev 6 comes after M92–M95 (the holster and the practice upgrades). The last twelve rows were Dev 7.

| # | Feature | Was |
|---|---|---|
| 1 | Field rule presets (Skirmish, CQB, Speedsoft; Milsim once medic and pouches exist), plus fun house rules such as pistols only or one magazine a round; Tournament and Pro CQB fold in | 0.3 |
| 14 | The gas pistol becomes a blowback pistol: the slide kicks and locks back on empty | 0.3 |
| 15 | A 2–4x variable scope (mouse wheel while aiming) and a holographic sight (Dev 4 note 5) | 0.3 |
| 16 | Gas cooling: rapid fire weakens gas replicas until they recover | 0.3 |
| 17 | The chrono and field limits: a replica over the field's limit doesn't pass | 0.3 |
| 19 | Saved loadouts | Beta |
| 20 | A suppressor sound of its own | 0.3 |
| 21 | Bot names, personalities (rusher, anchor, flanker, careful) and loadouts | 0.4 |
| 23 | Bots' gear keeps up with yours | Beta |
| 35 | Replica skins and kit looks | 0.5 |
| 40 | Rest your replica on cover (a ledge, crate or window) for steadier aim | New |
| 45 | Overtime: when the clock runs out, a flag appears in the middle and the first team to touch it wins | New |
| 46 | An option to hide the ammo counter (no mag-check key: owner) | New |
| 48 | Auto difficulty as a Dev setting: bots get a little better when you win, a little easier when you lose | New |
| 22 | Location callouts: named areas, and teammates calling "Contact, Dock!" or "Two left" | 0.4 |
| 24 | Pings: mark a spot and bots act on it | 0.4 |
| 43 | Ask a teammate for a magazine, from the comms wheel (owner) | New |
| 44 | Bushes and leaves can stop or deflect BBs | New |
| 41 | Noisy ground and props: gravel, cans, pallets and fences rattle, and bots hear it | New |
| 31 | Weather: a general weather system, not only rain and fog (owner) | 0.4 |
| 10 | Grenades, smoke and flash for the Grenades slot, used by bots too | 0.3 |
| 11 | **A spring sniper rifle, the next replica.** Before building it, ask the owner how he wants it built and its specs (owner) | 0.3 |
| 18 | Chest rigs and pouches: choose what you carry, such as another magazine or a grenade | 0.3 |
| 38 | An inventory: owned items in the menus, carried items on I in a match (with 7) | 0.3 |
| 2 | Medic mode: a hit player goes down and a teammate revives them before a bleed-out timer | 0.3 |
| 7 | The Extraction rework from Dev 4 notes 20, 22 and 23 (solo, loot that looks like loot, hunting bots, no respawn; the duo / trio revive with medic) | 0.3 |

**Maybe, to think about or leave for later** (they stay where they are on this roadmap):
- Team Deathmatch (0.3), Domination (0.4), Capture the Flag (0.4).
- The DMR (0.3), the SMG and shotgun (0.4; the owner wants them after the sniper).
- The changing speedsoft arena, a bigger new field, Day / Night on every map, Depot layouts, vaulting and slide into
  cover (0.4).
- Neon Heights public (0.2), challenges and badges and Armory milestones (0.5), briefing tips (was Beta).
- Two new ideas in `docs/IDEAS.md` (clutch moments, match wagers).

**No for now** (listed in `docs/IDEAS.md` so they aren't proposed again; the owner may change his mind):
- Bang-bang surrender or knife tag.
- The dead rag, a light on hit players at night and a shouted "HIT!" (the hit system is good enough as it is).
- Throwing a decoy.
- A mag-check key.
- Hand-made scenarios.
- A "good game" line-up after the match.

## What 0.1 is

The owner's definition (2026-10-01): 0.1 focuses on core gameplay and foundations. Later content builds on those
foundations. The owner has since pulled more into 0.1: see the Dev 5 plan and 0.1 Dev 6 above, and the feature triage
below.

- **Replicas:** the two that exist, the AEG rifle and the gas pistol. More platforms come later.
- **Loadout** (owner, 2026-10-03): a primary and a secondary replica, BB weight, hop-up and a first set of attachments
  (optics, grips, magazines), picked before a match. Gear and more parts come with later versions.
- **Match info and options** (owner, 2026-10-03): a hit feed, teammate markers, an end-of-match summary, crosshair
  options, custom match settings (rounds, round time, team size, a ricochets setting) and a practice range.
- **Comfort, accessibility and squad orders** (owner, 2026-10-03, second batch): the basic comfort and accessibility
  settings, browser basics (pause on a hidden tab, fullscreen, graphics problems handled), and three orders for your
  bot teammates.
- **Modes:** the two that exist, Elimination and Attack / Defend.
- **Field:** Depot, reworked to the field checklist below.
- **Foundations:** magazines and reloads, a BB physics pass, and movement and positioning.

### Design rules

- **Movement and positioning matter more than raw weapon stats** (owner). Where you stand, how you move and when you
  peek should decide fights, not a better gun.
- **Replicas differ mechanically, not in damage.** One hit is one hit with every replica. Platforms differ in how they
  load, cycle, sound, handle and run out.
- **Fields are built from a checklist** (owner). Every field has cover, barricades, buildings, windows, doorways, choke
  points, flanking routes, objective locations, and dead zones / spawn areas. Layout rules are tested in code, as for
  Depot.
- **Unlocks never block fun.** Progression is earned by unlocking replicas and gear, never by levels. Since M26 (owner,
  2026-10-04) replicas and parts are assets in a pool (`pool.md`) unlocked in the Armory with Field Credits earned by
  playing: completely free, never bought with money, marked beta, and it can be switched off. The starting kit (AEG
  Rifle, Gas Pistol, Standard Battery, Green Gas) is a full loadout, and BBs are always free.

## Beta: finishing 0.1 (not scheduled yet)

Beta adds no features (owner, 2026-10-06). It starts once he calls the game feature complete, and is for bug fixes,
QoL, balance, refinement and polish. Its likely work, collected here so the Dev builds stay focused:

- **Optimisation.** Profile, then fix. The "can wait" performance items in `docs/KNOWN_ISSUES.md` land here. The
  "60 FPS on an integrated-graphics laptop" target is unmeasured: the owner plays on a high-end desktop, so someone with
  such a laptop compares the quality presets here. From the audit: a smaller Rapier download (D-01, a fixed decision,
  the owner's call) and a lint / format tool if a second person joins (D-02).
- **Balance.** Replicas, how many magazines each carries (4 × 60 AEG, 4 × 18 pistol today), bot difficulty levels, and
  Attack / Defend (about 1 bot round in 10 is won at the pole today; raise time, holds and retakes).
- **Final tuning** of values that are first guesses today: footstep ranges, hop-up arcs, difficulty numbers.
- **Bug fixing and stability.** One audit item waits for a playtest: reset the reload bar of a player who is hit
  (W-07), if playtesting shows it frozen.
- **UX/QoL, polish and accessibility.**
- **Removals** (feature triage, 2026-10-05): small tasks, no pool item ID changes.
  - **Supply weekends and dated events** (M49) come out: calendar pressure suits online games, not an offline one.
    Their table in `pool.md` goes with care (the tests read it).
  - **The Tone mapping choice** leaves Graphics: the best-looking one becomes everyone's, and the switch moves to the
    Dev tab.
- **Small additions, now placed elsewhere** (owner, 2026-10-06; they were the 2026-10-04 picks and the 2026-10-05
  triage's Beta list):
  - **Saved loadouts** (0.1 Dev 6): several named loadouts (such as "CQB" and "Long range") to switch between, picked
    from the Map pop-up as well as the Loadout screen.
  - **Briefing tips** (maybe): loading and round-start lines in the voice of a site safety briefing ("Goggles on in the
    field", "Call your hits loud").
  - **Hit players light up at night** (no for now): a hit player switches on a light as they call the hit, as at real
    night games, so the walk-off reads in the dark and nobody shoots a player already out. Needed once Woodland is
    public.
  - **Bots' gear keeps up with yours** (0.1 Dev 6; audit POOL-24): the player's kit outgrows bots that carry factory
    gear on Easy and Normal (Hard opponents already roll kits, M29b). Either a tier dial per difficulty (read from
    `botConfig`), or higher tiers that trade rather than add (Legendary: tighter spread, a touch more recoil or a
    slower draw). Decided after the owner's playtest.

## Feature triage

The owner sorted every feature in the game and on this roadmap into Keep (in Beta), Defer (good, after Beta) and Cut
(more complexity than player value) on 2026-10-05, and confirmed it with his changes. The reasoning per item is in
`docs/DECISIONS.md`.

- **Public in 0.1** (after the owner's playtest, as before): Depot with Elimination, Attack / Defend and custom matches;
  Easy, Normal and Hard; Woodland with night play, the weapon torch, glowing BBs and 4v4 / 5v5; Pro.
- **Stays dev, public later:** Neon Heights (0.2, with its new look), Extraction (0.3, once balanced), the Tournament
  and Pro CQB rule sets (0.3, folded into the field rule presets), the Retro pixel filter (0.5, as a "Retro look"
  option; pulled forward to 0.1 Dev 5 on 2026-10-06, M96).
- **Cut:** supply weekends and events, the Tone mapping choice, tracer BBs as their own option (glowing BBs do it),
  Bomb, Intel grab, Free-for-all (battle royale is the owner's exception, 2026-10-06), the overshooting rule, gear that
  only changes looks as its own system (it joins kit looks), a separate progression plan (the Armory is the
  progression), and the ideas listed under Declined in `docs/IDEAS.md`.

## Release: 0.1.0

The first public release. The owner decides when the game is ready to be treated as a stable public product.

## After 0.1: later versions

Everything below is approved as a direction and deliberately not part of 0.1, except what the owner has pulled into
0.1 Dev 5 and Dev 6 (marked "Now"). The owner decides what goes into each version and can move anything; each one must
be a substantially bigger game (`docs/PROCESS.md › Versioning`). Within a version the work is again Dev (build), then
Beta (balance, fixes, QoL, performance), then release. Every deferred feature has a version (feature triage, owner,
2026-10-05): none is dropped by being left unplaced.

**The owner's third feature picks** (2026-10-04, from a researched list of 32; numbers as in that list) and where each
went, updated by the feature triage (2026-10-05) and his Dev 6 picks (2026-10-06):

| # | Pick | Goes to |
|---|---|---|
| 1 | Prone, kept for a later map | 0.4, with a field built for it |
| 2 | Location callouts | 0.1 Dev 6 |
| 3 | Bot names, personalities and loadouts | 0.1 Dev 6 |
| 4 | Field rules presets, for a later update | 0.1 Dev 6 |
| 5 | Overshooting rule | Cut (triage: bots never overshoot, so it only punishes the player) |
| 6 | Rubber-knife tag, maybe later | No for now (owner, 2026-10-06) |
| 7 | Slide into cover, maybe later beside prone | Maybe, 0.4 |
| 12–15 | Survival, Rush, Intel grab, Free-for-all (yes, later) | 0.3, 0.4, cut, cut (triage; battle royale is the Free-for-all exception, 0.4) |
| 17 | The chrono enforces the field's limit (yes, later) | 0.1 Dev 6, with the chrono |
| 18 | Saved loadouts | 0.1 Dev 6 |
| 22 | A speedsoft arena that changes (yes, later) | Maybe, 0.4 |
| 24 | Rain and fog (yes, later) | 0.1 Dev 6, as a general weather system |
| 25 | More field ideas: hospital, trenches, quarry (yes, later) | Maybe, 0.4 |
| 26 | Challenges and badges (yes, later) | Maybe, 0.5 |
| 31 | Briefing tips | Maybe (owner, 2026-10-06) |
| 8–11, 16, 19–21, 23, 27–30, 32 | Declined | Listed in IDEAS so they aren't proposed again |

### 0.2: The graphics update

- **Graphics overhaul.** Now 0.1 Dev 5 (owner, 2026-10-05: build now; see the Dev 5 plan; plan
  `plans/graphics-overhaul-0.2.md` in the project files). A stylised look (Valorant first; blocky, near-modular figures
  and replicas like Marathon; colour and light like Breath of the Wild; not realistic), an Ultra preset above High, a
  frame-rate option (30 / 60 / 120 / 144 / 240 / Unlimited), a WebGPU renderer, real materials, contact shadows and
  ambient occlusion, bloom and light beams, reflections, temporal anti-aliasing and a post-processing stack on Ultra,
  and all three maps re-dressed. Low still holds 60 fps at 1080p on a laptop with built-in graphics. Player, bot,
  replica and attachment models are built in code (no Blender, no borrowed packs) through the glTF loader (M25a). It
  was planned for after 0.1.0 is stable.
- **Neon Heights public.** Maybe (owner, 2026-10-06). It goes public with its new look, once its open map findings are
  fixed (overlapping blocks, cases that open through walls, the east end winning first fights at night). (triage)
- **Ground cover on terrain maps** (was in IDEAS; M33i plan): tufts of grass, ferns and leaf piles scattered from
  `MapData.ground`'s grid, as instanced cards on Medium and up. Needs a cheaper figure or a culled instance pass first.
- **Dead rag.** No for now (owner, 2026-10-06; in IDEAS). Hit players pull out a red dead rag, not just a raised hand
  (was in IDEAS).
- **A desktop download** (owner, 2026-10-05): the game in a desktop wrapper (Electron or Tauri, Steam), whenever the
  owner wants one; 0.2 by default.

### 0.3: The armoury and the rules

- **Medic mode.** Now 0.1 Dev 6 (owner, 2026-10-06). A hit player goes down and calls for a medic, who can bring them
  back before a bleed-out timer runs out (real events use 5–10 minutes; the game, seconds). Asked for on 2026-10-03;
  moved from 0.2 on 2026-10-05.
- **Team Deathmatch.** Maybe (owner, 2026-10-06). Respawn TDM: hit players walk back to their spawn and re-enter; the
  team with the most hits when time runs out (or the first to N) wins. Elimination stays its own mode. 4v4 and 5v5
  already exist for the maps with room. Moved from 0.2 on 2026-10-05.
- **Survival** (owner, 2026-10-04: yes, may come later): you and your teammates hold a building against waves of bots
  that grow each wave, as in Insurgency: Sandstorm's Survival. Needs bots that push, which they don't yet
  (`docs/KNOWN_ISSUES.md`).
- **Extraction public** (triage). Built (M43–M49) and kept dev until it is balanced. Audit 2 found every run is decided
  by the first patrol fight and a third of the guards can't see the way in. The rework from his Dev 4 notes is now
  0.1 Dev 6 (owner, 2026-10-06).
- **Field rule presets.** Now 0.1 Dev 6 (owner, 2026-10-06). One picker beside Mode that sets a whole rule set the way
  real sites do (owner, 2026-10-04): *Skirmish* (today's rules, the default), *CQB* (semi auto only, a bang rule),
  *Speedsoft* (semi only, no minimum distance, short rounds) and *Milsim* (realcap 30-BB magazines, a BB allowance per
  round, no hi-caps, a bleed-out instead of an instant out). The Tournament and Pro CQB sets built with Pro (M39) join
  it here. Builds on M20's custom match settings; Milsim needs the pouches and the medic mode first.
- **Bang-bang surrender or a rubber-knife tag.** No for now (owner, 2026-10-06; in IDEAS). It was in IDEAS (owner,
  2026-10-04: maybe later; one of the two, not both): tag out an unaware enemy within about 3 m without shooting, as a
  house-rule toggle; fits the CQB preset.
- **New replica types, the first three** (the full list is below; one or two per version, each earning its place): a
  blowback gas pistol (the gas pistol becomes it; 0.1 Dev 6), a spring sniper rifle (0.1 Dev 6; ask the owner how to
  build it and its specs first) and a DMR (maybe), all owner, 2026-10-06.
- **Weapon parts and gear that changes play:** receivers, handguards, stocks, more optics, muzzle devices, lasers,
  lights and bipods, pistol barrels and more barrel lengths (from M29b), and the parts the new types need; chest rigs,
  belts and pouches that decide what you carry, such as another magazine or a grenade (owner, 2026-10-03; rigs and
  pouches now 0.1 Dev 6, owner, 2026-10-06). Free from the start, through the pool and the Armory.
- **A suppressor sound of its own.** Now 0.1 Dev 6 (owner, 2026-10-06). Shots must be quieter with one (owner,
  2026-10-05): the Silencer (M29b) already makes shots duller and about half as loud; this gives suppressed replicas
  their own sound, built on the M9 groundwork.
- **Chrono before a match.** Now 0.1 Dev 6 (owner, 2026-10-06). Kept (owner, 2026-10-03): check your loadout's muzzle
  velocity.
  - **The chrono enforces the field's limit** (owner, 2026-10-04): each field and replica class has a limit, as at real
    sites (UK fields use about 1.3 J for full-auto and 2.5 J for DMRs and bolt-action rifles; US fields about 350–400
    fps), and a replica over it doesn't pass. This caps the Armory's Power % batteries and gas so upgrades can't
    snowball, and it is where the DMR's minimum engagement distance comes from.
- **Gas simulation.** Now 0.1 Dev 6 (owner, 2026-10-06). Fast shooting means less power (owner, 2026-10-03). Gas cools
  in the magazine as it is used, so rapid fire lowers a gas replica's muzzle velocity (shorter, droopier shots) until it
  recovers.
- **Grenades, smoke and flash bombs.** Now 0.1 Dev 6 (owner, 2026-10-06). Airsoft-style throwables (owner, 2026-10-03),
  such as a CO2 sound grenade (a bang, no shrapnel), smoke for cover and a flash bomb, for the Loadout's Grenades slot.
  How each one knocks players out or blinds them, how many you carry and how bots use them are designed when they come.
- **Blender models** (owner, 2026-10-05): a separate art pass after the code-built models of 0.2.
- **From the owner's 0.1 Dev 4 playtest** (2026-10-06, notes 5, 20, 22, 23; see the Dev 4 table above): a 2–4x variable
  scope and a holographic sight, Extraction loot that looks like loot, an inventory (owned items in the menus, carried
  items on I, a small carry limit in Extraction), and an Extraction rework (solo, more and harder opponents, no respawn;
  ruled 2026-10-06 over his earlier Extraction picks). All four are now 0.1 Dev 6.

### 0.4: More fields and ways to play

- **New fields.** Maybe (owner, 2026-10-06). Each is built to the checklist: an abandoned hospital (multi-floor CQB), a
  trench line with forts and a quarry (elevation) (owner, 2026-10-04), from the wider list: CQB warehouse, urban
  streets, industrial site, outdoor village, milsim-style compound, indoor arena, speedsoft arena and mixed terrain.
  Which, and in what order, is the owner's pick.
- **A speedsoft arena that changes.** Maybe (owner, 2026-10-06). Its bunkers are re-placed from a seed each match, as
  real speedsoft fields move their inflatables between events (owner, 2026-10-04); every layout still passes the field
  checklist tests.
- **Depot layouts.** Maybe (owner, 2026-10-06). Alternative cover layouts for Depot (was in IDEAS).
- **Day and night on every map.** Maybe (owner, 2026-10-06). The Day / Night switch (M34d) for every map, not only those
  built for both (owner, 2026-10-03).
- **Rain and fog.** Now 0.1 Dev 6, as a general weather system, not only rain and fog (owner, 2026-10-06). Picked like
  Day / Night. Rain masks footsteps and drops BBs a little sooner; fog shortens how far you can see. Asked for on
  2026-10-04.
- **Prone** (owner, 2026-10-04: kept for a later map): lie down behind low cover or in long grass: slow to get up, a
  small target. Comes with a field built for it, and bots use it too.
- **Slide into cover.** Maybe (owner, 2026-10-06). A short sprint slide that ends crouched behind a bunker, as
  speedsoft players do (was in IDEAS; owner, 2026-10-04: maybe later, beside prone).
- **Vaulting.** Maybe (owner, 2026-10-06). Over low obstacles of 0.7–0.9 m, with fields that have them (was in IDEAS;
  owner, 2026-10-01).
- **Rush** (owner, 2026-10-04): Attack / Defend in stages: attackers take point A, then the front moves to B, as
  Battlefield's mode, which real fields recreate with timer boxes. Needs a field bigger than Depot.
- **Domination.** Maybe (owner, 2026-10-06). Capture and hold physical locations. Moved from 0.2 on 2026-10-05.
- **Capture the Flag.** Maybe (owner, 2026-10-06). Each team grabs the other's flag and carries it home; a carrier who
  is hit drops it. Needs bots that carry, chase and return flags. A possible future mode (owner, 2026-10-05).
- **Location callouts.** Now 0.1 Dev 6 (owner, 2026-10-06). Named areas on each field ("Dock", "Main Gate", "Back Lot")
  shown under the minimap and in the hit feed, and bot teammates telling you what they know: "Contact, Dock!",
  "Reloading", "Two left". Text first, a voice later. Asked for on 2026-10-04; moved from 0.2.
- **A shouted "HIT!"** No for now (owner, 2026-10-06; in IDEAS). A voiced hit call (a CC0 recording) when someone is
  hit, beside the callouts (was in IDEAS).
- **Bot names, personalities and loadouts.** Now 0.1 Dev 6 (owner, 2026-10-06). Bots get names and a play style
  (rusher, anchor, flanker, careful), like Counter-Strike's bot profiles, and carry real loadouts from the asset pool.
  Today they're numbered and play alike (`docs/KNOWN_ISSUES.md`). Asked for on 2026-10-04; moved from 0.2.
- **New replica types, the next three:** an SMG, a shotgun and a gas blowback rifle. SMG and shotgun: maybe, after the
  sniper (owner, 2026-10-06).
- **Team communication** (once the bots can follow it; pings and asking a teammate for a magazine from the comms wheel
  are now 0.1 Dev 6, owner, 2026-10-06): an action wheel or menu, pings and hand signals, with bots that act on them.
  Three orders and their wheel are already in (M22, M23). Waits on the bot AI; it can move.
- **Battle royale** (owner's 0.1 Dev 4 playtest note 21, 2026-10-06): an experimental dev mode first: pick a map and a
  spawn point, a shrinking zone, start with nothing and find gear, 10 players. The owner made it the exception to the
  Free-for-all cut (2026-10-06); his answers are under the Dev 4 playtest table above.

### 0.5: Kit, looks and progression

- **Replica customisation and skins.** Now 0.1 Dev 6 (owner, 2026-10-06). The owner's "eventually skins" (2026-10-03;
  the Loadout's Skins row from M17b): colour, furniture, optic, handguard, stock, grip, magazine, muzzle device, tape
  and markings.
- **Kit looks (outfit skins).** Now 0.1 Dev 6 (owner, 2026-10-06). Camouflage, plate carrier, pouches, helmet, goggles,
  face protection, gloves, boots, backpacks, patches and armbands. Gear that only changes looks lives here, not as its
  own system (triage).
- **Challenges and badges.** Maybe (owner, 2026-10-06). Tasks that pay Field Credits ("win a round in under 45 s", "3
  hits with the pistol", "win on Hard") and a badge list kept in the browser, like Counter-Strike: Condition Zero's Tour
  of Duty tasks (owner, 2026-10-04). A daily challenge could come from a date seed (offline, no online board).
- **Armory milestones.** Maybe (owner, 2026-10-06). Audit POOL-23, was in IDEAS: today everything is owned at some tier
  in about 20 Shots, every asset at Rare or better in about 58, then a long tail of small tier gains with no
  milestones. Ideas: completion on the Armory tile ("23 / 84 · 3 Legendary"), milestones in `pool.md` ("Every optic
  owned → +1 Token"), more assets before tuning odds, Legendary 1 → 1.5 %, Easy ×0.5 → ×0.7.
- **The Retro look:** moved to 0.1 Dev 5 (M96) by the owner on 2026-10-06.
- **New replica types, the last:** an LMG (huge box mags, slow to move and aim, a bipod).
- No real brand names or trademarked designs, ever (CLAUDE.md §4).

### The replica types (for 0.3 to 0.5)

Platforms that feel mechanically different, not like damage models. Each one sounds like its power source (electric,
gas, spring; HPA if it comes), using the sound profiles from M13:

| Platform | What sets it apart | Version |
|---|---|---|
| AEGs | Electric full-auto with a motor whirr; mid- or hi-cap mags | In the game |
| GBB pistols | Blowback slide; the slide locks back on empty; gas mags (the gas pistol becomes this) | 0.1 Dev 6 |
| Spring sniper rifles | One shot per bolt cycle; high velocity and long reach; a loud crack | 0.1 Dev 6 |
| DMRs | Semi-auto only; high velocity; a minimum engagement distance, as at real sites | 0.3 |
| SMGs | Compact and quick to handle; high rate; short range | 0.4 |
| Shotguns | Several BBs per shell; pump every shot; shells loaded one by one | 0.4 |
| GBBRs | Gas blowback kick; the bolt locks back on empty; small gas mags that run out fast | 0.4 |
| LMGs | Huge box mags; slow to move and aim; covering fire; a bipod | 0.5 |

### Parked ideas

Not approved yet; see `docs/IDEAS.md`. Ideas the feature triage cut are listed there under Declined.
