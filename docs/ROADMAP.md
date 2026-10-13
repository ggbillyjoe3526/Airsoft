# Roadmap

The plan and the build status: what is being built now, in what order, and what comes in later versions. The owner and
every session read it. The process rules (versioning, branches, pull requests, the release checklist, the bug pass) are
in `docs/PROCESS.md`.

## Where we are

- **Building 0.1 Dev 6.** The game stays in Dev until the owner calls it feature complete (owner, 2026-10-06). Beta then
  adds no features.
- **Last tag:** `0.1-dev.5`, on 2026-10-13. The owner creates tags.
- **Next:** the owner playtests 0.1 Dev 5, and [0.1 Dev 6](#01-dev-6-the-last-planned-dev-build) starts with M92–M95.
- **The release path** (owner, 2026-10-12): 0.1 Dev 6, 0.1 Beta, then 0.1.0 opens Early Access to the public. Themed
  updates follow (Replica, Modes, Maps, Progression and any more), up to 1.0, the full launch. See
  [Early Access](#early-access-the-themed-updates).
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
| 0.1 Dev 5 | 2026-10-13 | New menus and HUD, a play link in the browser, iron sights and Inspect, the GBB Pistol, new players and hands, Ultra and WebGPU, a dressed Depot, faster loading; Blender models in testing behind the Dev switches | `0.1-dev.5` (commit `6bbb680`) |

Only full releases are tagged (owner, 2026-10-01): playtests in between are plain commits. Two checkpoint tags,
`v0.1-alpha.2a` (commit `d8c4568`) and `v0.1-alpha.2b` (commit `08b37e3`), were removed after `0.1-dev.2`. The
versioning policy (what Dev and Beta mean, tag names, branches) is in `docs/PROCESS.md › Versioning`.

## 0.1 Dev 5: the plan

Confirmed by the owner on 2026-10-06: the token-efficiency steps and the docs rewrite come first, the content toolkit is
pulled into Dev 5, and Dev 7 is folded away (its mode checks join the toolkit here, its features go to
[0.1 Dev 6](#01-dev-6-the-last-planned-dev-build)). The order:

1. **Docs rewrite with token step 2** (TE2 below).
2. **Token step 3** (TE3, a pipeline pull request). Done (2026-10-08).
3. **Token step 4** (TE4, approved 2026-10-06). Done (2026-10-08).
4. **Bug pass BP2** (the Dev 4 rows in `docs/KNOWN_ISSUES.md`). Done (2026-10-08; `docs/records/BP2.md`). The last
   Audit 2 tasks M77–M79 followed it (done 2026-10-08), before BP3.
5. **Graphics** (the overhaul the owner pulled forward from 0.2 on 2026-10-05). G1–G3 and G5–G8 are merged. Left: G4,
   G9, WebGPU as a complete overhaul (W0–W6) and the map pictures (see Graphics below).
6. **The owner's playtest notes:** the Dev 4 notes M80–M91 and M96, and the 2026-10-07 notes M97–M99 (M100 is part of
   the graphics work, item 5; tables below). Done so far: M80, M81, M82, M83, M84, M85, M86, M87, M88, M89, M90, M91, M96, M97, M98, M99 (2026-10-11).
7. **The content toolkit, all four parts** (plan `plans/content-toolkit-concept.md`, approved with all defaults
   2026-10-05; about six to eight pull requests): 1 rulebooks and briefs, replica and attachment checks and the report
   with pictures (CT1, done 2026-10-11: `docs/content/`, `node pipeline/content-check.mjs`); 2 map checks (CT2, done 2026-10-11: `map:<id>`); 3 mode
   checks (CT3, done 2026-10-11: `mode:<id>`); 4 skin checks (CT4, done 2026-10-11: `skin:<id>`).
8. **Bug pass BP3**, then the owner tags 0.1 Dev 5 and playtests it. In two parts: BP3a, the HUD and the menus (done
   2026-10-12; `docs/records/BP3a.md`), and BP3b, gameplay, graphics, WebGPU and the rest of the KNOWN_ISSUES sweep (done 2026-10-12;
   `docs/records/BP3b.md`).
9. **The Cyber Pistol redesign** (RM5, the owner's ask 2026-10-12, pulled into Dev 5 on his pick): the model redesigned
   from his reference pictures, with small iron sights and a slide that kicks back on each shot (done 2026-10-12;
   `docs/records/RM5.md`).
10. **The attachment redesigns** (RM8, the owner's ask 2026-10-12, into Dev 5 on his word the same day): the red dot,
   2x scope, silencers and weapon torches remodelled lower, rounder and smaller in Blender, behind "Disable all models"
   (done 2026-10-12; `docs/records/RM8.md`).
11. **The Blender figures in the game** (BF1, pulled into Dev 5 by the owner 2026-10-12): the rigged human and robot as
   every player and bot, behind the Dev switches (done 2026-10-12; `docs/records/BF1.md`). All eleven items are done,
   and the owner tagged 0.1 Dev 5 on 2026-10-13.

### Audit 2: the last tasks

Audit 2 is the full audit of 2026-10-05 (91 findings: 0 critical, 1 high, 18 medium, 51 low, 21 improvements). The owner
confirmed all 34 decisions on their defaults. It was built as tasks from M50 on; the last three are done (2026-10-08,
records in `docs/records/`), after bug pass BP2 and before BP3.

| Task | What | Audit findings | Status |
|---|---|---|---|
| M77 | Hot-path trims | SIM-06, SIM-07, REN-10 | Done |
| M78 | Splits: replica models, render config and city texture size | REN-09, REN-11 | Done |
| M79 | Small leaks and import cycles | CORE-07, CORE-08, CORE-14, AUD-06 (CORE-13 and the report's section 5 docs went into TE2) | Done |

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
| W6 | The switch, in two parts: W6a deletes the old renderer and its post passes and gives each renderer its own perf lines; W6b turns the world's GLSL patches into node patches; done (W6a and W6b, 2026-10-11) |
| W7 | The map pictures, from the new renderer on WebGPU; done (W7, 2026-10-12) |

### Playtest notes: 0.1 Dev 4

The owner's notes of 2026-10-06. Open: none of it is built yet. His words, the type and the reasoning per item are in
the project's shared files (`plans/playtest-feedback-0.1-dev-4.md`). The tasks are blocks M80–M96 in `docs/TASKS.md`:
M80–M91 and M96 are Dev 5 item 6, M92–M95 are in [0.1 Dev 6](#01-dev-6-the-last-planned-dev-build). **Normal
difficulty is the baseline** for every change (note 19): tune on Normal, then check that Easy, Hard and Pro still
scale. He ruled on every conflict with an earlier decision on 2026-10-06 (below the table and in `docs/DECISIONS.md`).

| # | Note | Goes to |
|---|---|---|
| 1 | The tutorial shows the scoreboard and the comm wheel when it names them; plainer but complete wording; a finish pop-up offering the practice range or the menu | M80 (0.1 Dev 5); done (2026-10-11) |
| 2 | Keep the Retro filter | M96 (0.1 Dev 5): public as soon as possible (ruled 2026-10-06; was 0.5 in the triage); done (2026-10-11) |
| 3 | Holster on 3 (1 primary, 2 secondary); sprinting holstered is faster but drawing to aim is slower; sprinting with the replica ready aims faster | M92 (0.1 Dev 6); done (2026-10-13) |
| 4 | Sort and filter replicas by rarity in the Loadout, and parts by rarity in Customise | M82 (0.1 Dev 5, after G3); done (2026-10-11) |
| 5 | A 2–4x variable scope (mouse wheel while aiming) and a holographic sight | The Replica Update (feature pick 15; moved from 0.1 Dev 6, 2026-10-12) |
| 6 | Skip to the next round from the spectator camera | M83 (0.1 Dev 5); done (2026-10-11) |
| 7 | A setting for a fixed or rotating minimap | M83 (0.1 Dev 5); done (2026-10-11) |
| 8 | Walking (Shift) while aiming down sights slows you further | M84 (0.1 Dev 5): done (2026-10-11) |
| 9 | The practice range and tutorial area in the new graphics | M81 (0.1 Dev 5, after G5 and G6; the graphics plan re-dresses only the three maps); done (2026-10-11) |
| 10 | Practice: moving targets, more target types, a timed high-score challenge (off by default) | M93 (0.1 Dev 6); done (2026-10-13) |
| 11 | Practice on any map with targets instead of bots; rename the range "Practice" | M94 (0.1 Dev 6); done (2026-10-13) |
| 12 | Practice with any unlocked replica and Customise; everything with Dev on | M95 (0.1 Dev 6) |
| 13 | Woodland: too open, the far team visible from the start, the blue end's height edge; hidden starts; 5v5 default, 6v6, maybe Woodland only for 5v5 and 6v6 | M88 (0.1 Dev 5): 5v5 default, 6v6 allowed, Woodland only for those two (ruled 2026-10-06); done (2026-10-11) |
| 14 | More varied, less distracting ambience; an Ambience volume | M86 (0.1 Dev 5): done (2026-10-11) |
| 15 | Bots on both teams check spots that are plainly empty (corners); refine on every level | M87 (0.1 Dev 5, after M71); done (2026-10-11) |
| 16 | Every replica aims down sights: iron sights without an optic; hip fire stays viable | M84 (0.1 Dev 5): iron sights now, beside scopes (ruled 2026-10-06; replaces his 0.1 Dev 3 note 3); done (2026-10-11) |
| 17 | BBs seem to pass through the nearer bot and hit the one behind; check, and tighten hit detection | M85 (0.1 Dev 5): done (2026-10-11) |
| 18 | Modes and match settings make sense together (no Tournament rules in Extraction) | M89 (0.1 Dev 5): done (2026-10-11) |
| 19 | Normal difficulty is the baseline for all feedback; check every change on the other levels | Standing rule for M80–M95 |
| 20 | Extraction loot looks like loot: crates and chests with a glow | The Modes Update, with the Extraction rework (feature pick 7) |
| 21 | Battle royale: pick a map and spawn point, a shrinking zone with a countdown outside it, start with nothing, weapons lie on the map as models, 10 players; experimental dev mode first | The Modes Update, dev first: an exception to the Free-for-all cut (ruled 2026-10-06); his answers below |
| 22 | An inventory: owned items in the menus, carried items on I in a match; a small carry limit in Extraction; currency takes one slot | The Replica Update (feature pick 38, the inventory); the carry limit comes with the Extraction rework |
| 23 | Extraction: solo against bots, more of them, quicker and closer waves, bots that hunt, guard and converge on an extraction, a longer extract timer, no respawn; a duo / trio revive later | The Modes Update, the Extraction rework (feature pick 7): replaces his 2026-10-04 picks (squad of 3, one respawn) and M72's idea of one opponent fewer on Normal (ruled 2026-10-06); the revive goes with Medic |
| 24 | More Dev settings for playtesting, starting with field credits and tokens on demand | M90 (0.1 Dev 5); done (2026-10-11) |
| 25 | With the Armory turned off in Dev, hide it instead of greying it | M83 (0.1 Dev 5); done (2026-10-11) |
| 26 | Softer, diffused torch beams that cast shadows | M91 (0.1 Dev 5, with the graphics work): shadows on High and Ultra only, Low as today for 60 fps (ruled 2026-10-06); done (2026-10-11) |

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
| 1 | A setting for the red X hit marker, Off by default | M97 (Dev 5 item 6); done (2026-10-11) |
| 2 | Aim down sights by Hold or Toggle, Hold by default | Already in the game: `Settings › Controls › Aim button` (Hold by default) |
| 3 | Customise won't take "No light" on the AEG rifle; check every replica | Fixed in BP2 (Dev 5 item 4), on every replica |
| 4 | Teams renamed Alpha (blue) and Beta (orange); the player picks a team | M98 (Dev 5 item 6): done (2026-10-11) |
| 5 | A plain title screen (Airsoft, the tagline, START, the version small at the bottom left); Play renamed Match; the top bar is the navigation (Match, Loadout, Armory, Settings; FC and Tokens on the right; no version); no key prompts along the bottom; Practice as the last mode; a more readable font | M100 (Dev 5 item 5, the graphics work, with the G4 HUD restyle) |
| 6 | Replica pictures in "Your replicas" are cropped | M99 (Dev 5 item 6); done (2026-10-11) |
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
| TE3 | 15 review packet for the critic and QA, 16 performance agent only on a flagged perf run, 17 (a) leaner changelog agent, 18 near-miss re-run only for judgment checks, 19 failures-only gate summary | Dev 5 item 2 | Done |
| TE4 | 8 fewer chat lines, 21 lighter local test run, 22 bot balance as a report | Dev 5 item 3 (approved 2026-10-06, 23:27 UTC) | Done |
| Gradual | 26 split the largest files when a task already edits them | Ongoing | Open |

## 0.1 Dev 6: the last planned Dev build

Dev 6 is the last planned Dev build, though the owner may add more (owner, 2026-10-12). It holds the systems the game
still needs to be feature complete; the content once planned here moved to its themed update
([below](#what-moved-out-of-dev-6)). Beta then adds no features: bug fixes, QoL, balance, refinement and polish
(owner, 2026-10-06).

M92–M95, the holster and the practice upgrades, come first (their blocks are in `docs/TASKS.md`); the other blocks
are written when the build starts. Numbers are from the owner's list of 50 candidates
(`plans/dev6-plus-feature-candidates.md` in the project files).

| # | Feature | Area |
|---|---|---|
| M92 | Holster on 3, and two kinds of sprint: holstered is faster, but drawing to aim takes longer; done (2026-10-13, `docs/records/M92.md`) | Movement |
| M93 | Practice: moving targets, new target types and a timed challenge (off by default); done (2026-10-13, `docs/records/M93.md`) | Practice |
| M94 | Practice on any map, with targets instead of bots; done (2026-10-13, `docs/records/M94.md`) | Practice |
| M95 | Practice with any replica you own, and everything with Dev on | Practice |
| – | Vaulting over low obstacles (0.7–0.9 m), with a few added to the maps where they open a route; crouch cover stays peek-only (owner, 2026-10-12) | Movement |
| 40 | Rest your replica on cover (a ledge, crate or window) for steadier aim; done (2026-10-13, `docs/records/M104.md`) | Movement |
| 19 | Saved loadouts, picked from the Map pop-up as well as the Loadout screen | Loadout |
| 21 | Bot names, personalities (rusher, anchor, flanker, careful) and loadouts | Bots |
| 23 | Bots' gear keeps up with yours (audit POOL-24: a tier dial per difficulty, or higher tiers that trade) | Bots |
| 48 | Auto difficulty as a Dev setting: bots get a little better when you win, a little easier when you lose | Bots |
| 22 | Location callouts: named areas, and teammates calling "Contact, Dock!" or "Two left" (text first) | Team play |
| 24 | Pings: mark a spot and bots act on it | Team play |
| 43 | Ask a teammate for a magazine, from the comms wheel (owner) | Team play |
| 44 | Bushes and leaves can stop or deflect BBs | World |
| 41 | Noisy ground and props: gravel, cans, pallets and fences rattle, and bots hear it | World |
| 45 | Overtime: when the clock runs out, a flag appears in the middle and the first team to touch it wins | Rounds |
| 46 | An option to hide the ammo counter (no mag-check key: owner) | HUD |
| – | Figure redesign: more realistic human and robot figures, from the owner's reference photos, built in his Blender, with the figures' animations for Dev 6's new moves such as vaulting; waits for him (owner, 2026-10-13) | Art |

Built in Dev 5 instead: the blowback pistol (pick 14) is the GBB Pistol (RM7), and the AEG Rifle redesign (RM6) gave
the built-in rifle its small, low iron sights.

### What moved out of Dev 6

The owner moved content to the themed updates (owner, 2026-10-12). He named the optics and the sniper; Claude placed the
rest, and the owner can move any back.

| # | Feature | Goes to | Placed by |
|---|---|---|---|
| 15 | A 2–4x variable scope and a holographic sight | Replica Update | Owner |
| 11 | The spring sniper rifle | Replica Update | Owner |
| 10 | Grenades, smoke and flash | Replica Update | Claude: items |
| 18 | Chest rigs and pouches | Replica Update | Claude: items |
| 38 | The inventory | Replica Update | Claude: it holds the new items |
| 16 | Gas cooling | Replica Update | Claude: how replicas behave |
| 17 | The chrono and field limits | Replica Update | Claude: it matters once the sniper brings a higher limit |
| 20 | A suppressor sound of its own | Replica Update | Claude: an attachment's sound |
| 1 | Field rule presets and house rules | Modes Update | Claude: ways to play |
| 2 | Medic | Modes Update | Claude: it changes how a match plays |
| 7 | The Extraction rework | Modes Update | Claude: Extraction goes public there |
| 31 | Weather | Maps Update | Claude: a map condition, beside Day and Night |
| 35 | Replica skins and kit looks | Progression Update | Claude: rewards to earn |

0.1 ships without them: the Loadout's Grenades slot and Skins row stay greyed ("Later") until their updates. Ideas the
owner said no to for now, slide into cover among them (owner, 2026-10-12), are listed in `docs/IDEAS.md`.

## What 0.1 is

The owner's definition (2026-10-01): 0.1 focuses on core gameplay and foundations. Later content builds on those
foundations. The owner has since pulled more into 0.1: see the Dev 5 plan and 0.1 Dev 6 above, and the feature triage
below. 0.1.0 opens Early Access (owner, 2026-10-12): feature complete, but light on content.

- **Replicas:** the AEG Rifle and the GBB Pistol (the starting kit), and the Cyber Pistol from the Armory. More
  platforms come with the Replica Update.
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
  Rifle, GBB Pistol, Standard Battery, Green Gas) is a full loadout, and BBs are always free.

## Beta: finishing 0.1 (not scheduled yet)

Beta adds no features (owner, 2026-10-06). It starts once he calls the game feature complete, and is for bug fixes,
QoL, balance, refinement and polish. Its likely work, collected here so the Dev builds stay focused:

- **Optimisation.** Profile, then fix. The "can wait" performance items in `docs/KNOWN_ISSUES.md` land here. The
  "60 FPS on an integrated-graphics laptop" target is unmeasured: the owner plays on a high-end desktop, so someone with
  such a laptop compares the quality presets here. From the audit: a lint / format tool if a second person joins
  (D-02); the smaller Rapier download (D-01) was done early, on the owner's word (IM3, 2026-10-12).
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
  Easy, Normal and Hard; Woodland with night play, the weapon torch, glowing BBs and 5v5 / 6v6 (M88, owner 2026-10-06); Pro.
- **Stays dev, public later:** Neon Heights (the Maps Update, with its new look), Extraction (the Modes Update, once
  reworked), the Tournament and Pro CQB rule sets (the Modes Update, folded into the field rule presets). The Retro
  pixel filter, once 0.5, went public in 0.1 Dev 5 (M96).
- **Cut:** supply weekends and events, the Tone mapping choice, tracer BBs as their own option (glowing BBs do it),
  Bomb, Intel grab, Free-for-all (battle royale is the owner's exception, 2026-10-06), the overshooting rule, gear that
  only changes looks as its own system (it joins kit looks), a separate progression plan (the Armory is the
  progression), and the ideas listed under Declined in `docs/IDEAS.md`.

## 0.1.0: Early Access opens

The first public release (owner, 2026-10-12): the game is feature complete but light on content, and players get it as
Early Access. The owner decides when it is ready. Small fixes after it are 0.1.1, 0.1.2 and so on.

## Early Access: the themed updates

After 0.1.0 the game grows through themed updates, each a mini expansion (owner, 2026-10-12):

| Update | What it adds |
|---|---|
| 0.2 · Replica Update | New replicas, attachments and items |
| 0.3 · Modes Update | New modes and ways to play |
| 0.4 · Maps Update | New maps and map conditions |
| 0.5 · Progression Update | Challenges, badges and things to earn |
| More updates | Any theme the owner wants |

- **The owner picks the order.** Version numbers always go up, so whichever update ships next takes the next number:
  if the Maps Update comes first, it is 0.2 (2026-10-12). The numbers above are the planned order.
- **Each update is built like 0.1:** Dev builds, then Beta builds (balance, fixes, QoL, performance), then the release
  (0.2 Dev 1, 0.2 Beta 1, 0.2.0).
- **Early Access is feature complete but light on content.** The updates mostly add content, and a new feature can
  still come in any update (owner, 2026-10-12).
- **Every later feature has a place** (feature triage, owner, 2026-10-05): none is dropped by being left unplaced.
  "From 0.1 Dev 6" marks the content moved out of Dev 6 on 2026-10-12.
- **No real brand names or trademarked designs, ever** (CLAUDE.md §4).

### 0.2 · Replica Update: replicas, attachments and items

- **The spring sniper rifle, the next replica** (from 0.1 Dev 6). One shot per bolt cycle, high velocity, long reach
  and a loud crack. Before building it, ask the owner how he wants it built and its specs (owner, 2026-10-06).
- **A 2–4x variable scope and a holographic sight** (from 0.1 Dev 6; Dev 4 note 5). The mouse wheel zooms while
  aiming.
- **Grenades, smoke and flash** (from 0.1 Dev 6). Airsoft-style throwables for the Loadout's Grenades slot: a CO2
  sound grenade (a bang, no shrapnel), smoke for cover and a flash bomb, used by bots too. How each one knocks players
  out or blinds them, and how many you carry, are designed when they come.
- **Chest rigs, belts and pouches** (from 0.1 Dev 6). They decide what you carry, such as another magazine or a grenade
  (owner, 2026-10-03). The Milsim rules need them.
- **An inventory** (from 0.1 Dev 6; Dev 4 note 22). Owned items in the menus, carried items on I in a match. The
  Extraction rework uses it for its carry limit, so it moves with Extraction if the Modes Update comes first.
- **Gas cooling** (from 0.1 Dev 6). Gas cools in the magazine as it is used, so rapid fire lowers a gas replica's
  muzzle velocity (shorter, droopier shots) until it recovers (owner, 2026-10-03).
- **The chrono and field limits** (from 0.1 Dev 6). Check your loadout's muzzle velocity before a match; each field and
  replica class has a limit, as at real sites, and a replica over it doesn't pass. Today's per-class limits (1.20 J
  rifles, 1.00 J pistols) already cap the Armory's upgrades; the sniper and the DMR bring higher ones, and the DMR's
  minimum engagement distance comes from here.
- **A suppressor sound of its own** (from 0.1 Dev 6). The Silencer already makes shots duller and about half as loud;
  this gives suppressed replicas their own sound.
- **More parts:** receivers, handguards, stocks, more optics, muzzle devices, lasers, lights and bipods, pistol barrels
  and more barrel lengths, and the parts the new types need. Free from the start, through the pool and the Armory.
- **More replica types after the sniper** (the table below). Too many for one update, so a second Replica Update can
  take the rest. Each type feels mechanically different, not like a damage model, and sounds like its power source
  (electric, gas, spring), using the sound profiles from M13.

| Platform | What sets it apart | When |
|---|---|---|
| AEGs | Electric full-auto with a motor whirr; mid- or hi-cap mags | In the game |
| GBB pistols | Blowback slide; the slide locks back on empty; gas mags (the gas pistol became the GBB Pistol, RM7) | In the game |
| Spring sniper rifles | One shot per bolt cycle; high velocity and long reach; a loud crack | Replica Update, next |
| DMRs | Semi-auto only; high velocity; a minimum engagement distance, as at real sites | Maybe |
| SMGs | Compact and quick to handle; high rate; short range | Maybe, after the sniper |
| Shotguns | Several BBs per shell; pump every shot; shells loaded one by one | Maybe, after the sniper |
| GBBRs | Gas blowback kick; the bolt locks back on empty; small gas mags that run out fast | Later |
| LMGs | Huge box mags; slow to move and aim; covering fire; a bipod | Later |

### 0.3 · Modes Update: new modes and ways to play

- **Extraction goes public, with its rework** (from 0.1 Dev 6; Dev 4 notes 20, 22 and 23). Built (M43–M49) and kept
  dev until it is balanced. The rework: solo against more and more aggressive bots that hunt, guard and converge on the
  extraction, quicker and closer waves, a longer extract timer, no respawn, loot that looks like loot (crates and chests
  with a glow) and a small carry limit through the inventory.
- **Medic** (from 0.1 Dev 6). A hit player goes down and calls for a medic, who brings them back before a bleed-out
  timer runs out (real events use 5–10 minutes; the game, seconds). It brings the duo and trio revive to Extraction.
- **Field rule presets and house rules** (from 0.1 Dev 6). One picker beside Mode sets a whole rule set the way real
  sites do: Skirmish (today's rules, the default), CQB (semi auto only, a bang rule), Speedsoft (semi only, no minimum
  distance, short rounds) and Milsim (realcap 30-BB magazines, a BB allowance per round, no hi-caps, a bleed-out
  instead of an instant out; it needs medic and the pouches). The Tournament and Pro CQB sets (M39) fold in. House
  rules such as pistols only or one magazine a round. Builds on M20's custom match settings.
- **Battle royale,** an experimental dev mode first (Dev 4 note 21; the exception to the Free-for-all cut). Pick a map
  and a spawn point, a shrinking zone, start with nothing and find gear, 10 players. The owner's answers are under the
  Dev 4 playtest table above.
- **Survival:** you and your teammates hold a building against waves of bots that grow each wave. Needs bots that push,
  which they don't yet (`docs/KNOWN_ISSUES.md`).
- **Rush:** Attack / Defend in stages: attackers take point A, then the front moves to B. Needs a field bigger than
  Depot.
- **Team Deathmatch** (maybe). Hit players walk back to their spawn and re-enter; the team with the most hits when time
  runs out (or the first to N) wins. Elimination stays its own mode.
- **Domination** (maybe). Capture and hold physical locations.
- **Capture the Flag** (maybe). Each team grabs the other's flag and carries it home; a carrier who is hit drops it.
  Needs bots that carry, chase and return flags.

### 0.4 · Maps Update: new maps and map conditions

- **New fields** (maybe). Each is built to the field checklist: an abandoned hospital (multi-floor CQB), a trench line
  with forts and a quarry (elevation) first (owner, 2026-10-04); from the wider list, a CQB warehouse, urban streets, an
  industrial site, a village, a milsim-style compound, an indoor arena, a speedsoft arena and mixed terrain. Which, and
  in what order, is the owner's pick.
- **Neon Heights goes public** with its new look, once its open map findings are fixed (overlapping blocks, cases that
  open through walls, the east end winning first fights at night).
- **Weather** (from 0.1 Dev 6). A general weather system, not only rain and fog, picked like Day / Night: rain masks
  footsteps and drops BBs a little sooner; fog shortens how far you can see.
- **Day and Night on every map** (maybe). The Day / Night switch (M34d) for every map, not only those built for both.
- **Prone,** with a field built for it: lie down behind low cover or in long grass, slow to get up, a small target.
  Bots use it too.
- **A speedsoft arena that changes** (maybe). Its bunkers are re-placed from a seed each match, as real speedsoft fields
  move their inflatables; every layout still passes the field checklist tests.
- **Depot layouts** (maybe). Alternative cover layouts for Depot.
- **Ground cover on terrain maps** (M33i plan): tufts of grass, ferns and leaf piles scattered from `MapData.ground`'s
  grid, as instanced cards on Medium and up. Needs a cheaper figure or a culled instance pass first.

### 0.5 · Progression Update: things to earn

- **Challenges and badges** (the owner's example for this update). Tasks that pay Field Credits ("win a round in under
  45 s", "3 hits with the pistol", "win on Hard") and a badge list kept in the browser, like Counter-Strike: Condition
  Zero's Tour of Duty. A daily challenge could come from a date seed (offline, no online board).
- **Armory milestones** (maybe; audit POOL-23). Today everything is owned at some tier in about 20 Shots, then a long
  tail of small tier gains. Ideas: completion on the Armory tile ("23 / 84 · 3 Legendary"), milestones in `pool.md`
  ("Every optic owned → +1 Token"), more assets before tuning odds.
- **Replica skins and kit looks** (from 0.1 Dev 6). Skins: colour, furniture, tape and markings, filling the Loadout's
  Skins row. Kit looks: camouflage, plate carrier, pouches, helmet, goggles, face protection, gloves, boots, backpacks,
  patches and armbands. Gear that only changes looks lives here, not as its own system (triage).
- Ideas that would fit here, not placed: clutch moments and match wagers (`docs/IDEAS.md`).

### Not tied to an update

These land in whichever update the owner likes:

- **A desktop download** (owner, 2026-10-05): the game in a desktop wrapper (Electron or Tauri, Steam), whenever he
  wants one.
- **Higher-detail models** (owner, 2026-10-05 and 2026-10-09). A Blender art pass over figures, replicas, attachments,
  props and set dressing, using the headroom WebGPU gives. It keeps art direction v3, the download target (about 30 MB
  to start), Low's 60 fps at 1080p on a laptop and the WebGL fallback. The Blender figures, replicas and attachments
  built in 0.1 Dev 5 stay behind the Dev switches until the owner is happy with them. The figures come first, in
  [0.1 Dev 6](#01-dev-6-the-last-planned-dev-build) (owner, 2026-10-13).
- **Hand signals and more team calls,** with bots that act on them. Three orders and their wheel are in (M22, M23);
  pings and asking for a magazine come in 0.1 Dev 6.

## 1.0: the full launch

When the owner considers the game complete: Early Access ends and the game is ready for everyone (owner, 2026-10-12).

## Parked ideas

Not approved yet; see `docs/IDEAS.md`. Ideas the feature triage cut are listed there under Declined.
