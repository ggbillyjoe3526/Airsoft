# Decisions

The owner's rulings and the project-wide decisions still in force. Every task must respect them: if one has to change,
ask the owner first, then replace its line.

A task's own tuning values and small defaults don't go here; they go in its record, `docs/records/<id>.md`. History
before 2026-10-08 is in `docs/archive/0.1-dev/DECISIONS.md`: grep it for the reason behind a number.

Line format: `- **What was decided (owner, 2026-10-07).** Why, or the detail that matters.` A decision that wasn't the
owner's carries only its date: `(2026-10-04)`. A new line goes at the end of its section. A ruling that replaces another
replaces its line; the old one stays findable in the archive or in git.

## Product and scope

- **Single-player against bots only: no multiplayer, networking, servers or matchmaking (owner, 2026-09-30; confirmed
  2026-10-03, "absolutely none").** The simulation stays command-driven and deterministic, so it stays testable.
- **Design rules (owner, 2026-10-01).** Movement and positioning matter more than weapon stats. Replicas differ
  mechanically (loading, cycling, sound, handling), never in damage: one hit is one hit. Every field is built to a
  checklist: cover, barricades, buildings, windows, doorways, choke points, flanking routes, objectives, dead zones and
  spawn areas.
- **Progression is earned by unlocking replicas and gear, never by levels (owner, 2026-10-01).** Rarity and parts are
  small trade-offs, never a damage upgrade.
- **Friendly hits count (2026-09-30).** As at real sites; custom matches can switch it off (`HITS.friendlyFire`).
- **Public in 0.1, after the owner's playtest: Depot's modes, Easy to Hard, Woodland (night play, the torch, glowing
  BBs) and Pro (feature triage, owner, 2026-10-05).** Every public map, mode and difficulty multiplies beta's balance
  and bug work, so 0.1 ships the set that already plays well. Neon Heights stays dev until 0.2 and Extraction until 0.3;
  `docs/ROADMAP.md` holds the current placement.
- **Cut features (owner, 2026-10-05).** Supply weekends and dated events; the Tone mapping choice in Graphics (the
  best-looking becomes everyone's); tracer BBs as an option (glowing BBs do it); Bomb and Intel grab; Free-for-all and
  the overshooting rule; cosmetic gear as its own system; a separate progression plan (the Armory is the progression).
- **Kept features (owner, 2026-10-05).** Grenades (0.3) and skins (0.5) stay planned, with their Loadout placeholders
  (the empty Grenades slot, the greyed Skins row). Suppressors get a sound of their own in 0.3. Capture the Flag stays a
  possible mode in 0.4. Every deferred feature has a version; the owner can move any.
- **26 features move into 0.1 from 0.2 to 0.5, Beta and new ideas (owner, 2026-10-06).** Smaller items on today's
  systems (presets, the chrono, gas, sights, bot names and gear, skins) and bigger systems (medic, the Extraction
  rework, grenades, rigs, the sniper, comms, weather, sound, foliage); all land in Dev 6. Claude placed them and the
  owner can move any (list: `docs/ROADMAP.md`).
- **Extraction (0.3): solo against bots, with more and more aggressive opponents, quicker and closer waves, a longer
  extract timer and no respawn (owner, 2026-10-06).** Replaces his 2026-10-04 picks (a squad of three, one respawn) and
  the paused "one opponent fewer on Normal".
- **Battle royale (0.4, dev first) goes ahead as an experimental dev mode, the exception to the Free-for-all cut (owner,
  2026-10-06).** His answers on loot, zone and pay are in `docs/ROADMAP.md`, under the 0.1 Dev 4 playtest table.
- **The code is MIT-licensed, copyright "ggbillyjoe3526" (owner, 2026-10-05).** The repository is public and free to
  read and copy; third-party assets keep their own licences (`docs/ASSETS.md`).

## Versions, releases and branches

- **Names read "0.1 Dev 5" and "0.1 Beta 1": Dev replaces Alpha, and there is no "v" (owner, 2026-10-05).** Tags can't
  hold spaces, so they are `0.1-dev.5`, `0.1-beta.1` and `0.1.0`; a GitHub release is titled "Airsoft 0.1 Dev N". The
  policy table is in `docs/PROCESS.md`.
- **The number is the product, the stage its state (owner, 2026-10-01).** Everything up to the first feature-complete
  game is 0.1: Dev builds, then Beta builds once the owner calls it feature complete, then 0.1.0 as the first stable
  public release. Never move to 0.2 because a phase ends.
- **Dev builds continue until the owner calls the game feature complete; Beta then adds no features (owner,
  2026-10-06).** Beta is bug fixes, QoL, balance, refinement and polish, so features once parked in Beta moved into Dev
  builds or became maybes.
- **Dev 5 order (owner, 2026-10-06).** Docs rewrite with token step 2, token step 3, token step 4, bug pass BP2,
  graphics, the playtest notes, the content toolkit (all four parts, mode checks included), bug pass BP3, then the tag.
  Dev 7 is folded into Dev 6, which holds all 26 picked features after M92 to M95 and is the last planned Dev build
  unless he adds more ("I want bigger builds"). The order is in `docs/ROADMAP.md`.
- **Only full releases are tagged, and only the owner creates tags (owner, 2026-10-01).** No letter checkpoints.
  Playtests between releases use plain pushed commits.
- **After the owner tags, the release checklist is due in the next pull request (owner, 2026-10-03).** Steps:
  `docs/PROCESS.md`.
- **Release notes are plain patch notes (owner, 2026-10-05).** New and Fixed, plus Changed only when something existing
  behaves differently; one short line per item, in player words. No version line, summary, counts, file names, phases,
  audits, tests or "next up": the release title carries the version.
- **`main` holds the latest stable release (owner, 2026-10-01).** It changes only through pull requests. About when v0.1
  is done and 0.2 starts (the owner decides when), day-to-day work moves to an `alpha` branch, tested builds go to
  `beta`, and only tested releases reach `main` and get tagged.
- **The title screen's version comes from `git describe` as the game is built (2026-10-04).** There is no constant to
  bump. A zip without `.git` carries it in `.git_archival.txt`; a clone without tags reads the release from
  `README.md`'s download link plus "+?".

## How work runs

- **Every change is a pull request from a new branch made from the latest `main`; never push to `main` (owner,
  2026-10-02).** A pull request built through the pipeline is merged by its own thread once CI is green and the critic
  accepted (owner, 2026-10-04: "Claude merges"); so are docs-only pull requests (owner, 2026-10-06: "just you handle
  it"). Any other pull request waits for the owner.
- **When unsure about a design decision, ask the owner first; for a small, easy-to-change detail, pick a default and
  record it with a one-line reason (owner, 2026-10-02).** The record is the task's own, `docs/records/<id>.md`. A check
  that can only pass by changing an acceptance criterion goes to the owner at once (owner, 2026-10-06).
- **Every task runs through scripted gates and a binary critic (owner's design, 2026-10-04).** `pipeline/gate.mjs`
  decides build, tests, smoke, perf, scope and changelog; the critic judges only on green gates, with eight pass/fail
  checks instead of a 0 to 10 score. Four attempts, then auto-accept at 6 of 8 with checks 1 and 2 passing (owner), else
  a report to the owner. Details: `docs/PROCESS.md › The pipeline`.
- **The build thread is the worker (2026-10-04).** The coordinator starts each task's thread on the tier's model (Opus
  5.5 high for core, Sonnet 5.5 medium for UI and trivial); QA, performance, triage, critic and changelog are agents it
  spawns.
- **The triage and changelog agents run on Haiku 5.5, pinned by full id (`model: claude-haiku-5-5`) (owner,
  2026-10-08).** The bare `haiku` alias follows whatever the installed CLI maps it to. Opus and Sonnet roles are
  unchanged; this replaces "models stay as they are" for Haiku only.
- **QA never edits production code, and the scope gate enforces it, not the harness (2026-10-04).** A QA commit (trailer
  `Agent: qa`) that touches anything but tests fails the gate.
- **Contracts are listed in `docs/ARCHITECTURE.md` and changed only by a plan step (2026-10-04).** Parallel threads
  start only when their `touches` don't overlap: overlapping docs and settings files cost the 2026-10-04 batch time.
- **CI runs the gate script (`--ci`) as four jobs: `check` (build, fast tests, smoke, scope, changelog) and three `slow`
  shards of the headless bot-match guards (2026-10-05, audit decision 2).** Splitting one 25-minute job lets a failure
  name its share. Job limit 20 minutes. There is no perf gate on a runner: it has no baseline and no GPU.
- **A changelog agent keeps `CHANGELOG.md`, `docs/FEATURES.md` and `docs/patch-notes/<tag>.md` (owner asked,
  2026-10-04).** It runs in every pull request and once more after a tag; patch notes are written when the owner tags.
  Edit those files by hand only to fix a mistake.
- **`docs/HANDOFF.md` is rewritten once per batch by the planning thread, not per pull request (owner, 2026-10-04).**
  Threads carry their own context, and a per-PR rewrite conflicted across parallel pull requests. Since TE2 it is a
  short "now" (about 1.5 KB); engine facts live in `docs/ARCHITECTURE.md` and the `src/` folder READMEs.
- **A bug pass follows each batch of feature pull requests, before the owner's playtest (owner, 2026-10-04).** Claude
  reminds the owner and starts it only when he says go. It is a pipeline task (`BP<n>`); how: `docs/PROCESS.md`.
- **Token efficiency: the owner approved the recommended plan; models and effort levels stay as they are (owner,
  2026-10-06).** TE1 first, TE2 in the docs rewrite, then TE3 (pipeline) and TE4 (plan items 8, 21 and 22, approved at
  23:27 the same night), in the order under Versions. TE1 added a read guard for text files over 40 KB
  (`.claude/hooks/read-guard.mjs`) and quiet test output (`npm run t`). Plan: `docs/ROADMAP.md`.
- **`CLAUDE.md` stays about 10 KB (owner, 2026-10-06).** It is loaded on every turn of every thread and agent;
  versioning, releases, sessions, the bug pass and the critic table live in `docs/PROCESS.md`. Section numbers stay, so
  § references work.
- **The 34 decisions of the 2026-10-05 full audit went ahead on their defaults (owner, 2026-10-05, 10:03: "happy with
  all those choices. go ahead").** The ones that bind future work are in their topic sections.
- **No status-only commits: one push with the work and its records (2026-10-06).** Each push re-runs CI and wakes the
  thread; M75 spent attempts 2 to 4 on a check only a changed criterion could pass.
- **Live docs hold only the current state; finished history moves word for word to `docs/archive/` (owner, 2026-10-05
  and 2026-10-06).** The docs rewrite (TE2, 2026-10-08) archived the Dev 1 to Dev 4 history to `docs/archive/0.1-dev/`
  and set one house style for every doc (`docs/PROCESS.md › Writing docs`). Archived files are never edited.
- **Each task keeps one record file, `docs/records/<id>.md`, instead of appending to shared tables (owner, 2026-10-06,
  token plan items 3 and 4).** It holds the review line, a row per attempt (the gate writes the row's gate cells), the
  task's own decisions and the issues it left. `docs/REVIEWS.md` and `docs/METRICS.md` are retired to the archive;
  `docs/KNOWN_ISSUES.md` stays the shared list of open issues. Format: `docs/records/README.md`.
- **A task that adds, renames or moves a file keeps its folder's `README.md` current (2026-10-08, TE2).** The module
  map (`docs/ARCHITECTURE.md`) and the folder READMEs replace grep sweeps across `src/`; the scope gate allows a
  `src/` folder README in any task.

## Art direction and graphics

- **Every graphic is an engine feature, never map-exclusive (owner, 2026-10-04: "any new graphics should be universal
  and not exclusive to one map ... All maps use the same engine").** Lighting, sky, effects, materials, prop styles and
  every Graphics setting are built into the renderer and read from map data; a map supplies only its layout and content.
  No map name appears in render code, and maps that don't use a feature draw exactly as before (pinned by tests).
- **The graphics overhaul is pulled forward from 0.2 into 0.1 Dev 5 (owner, 2026-10-05, 20:39: "implement this as soon
  as possible").** The plan is in the project files (`plans/graphics-overhaul-0.2.md`).
- **Art direction v3: a bold, vibrant palette with grit (approved by the owner, 2026-10-05, 20:39).** Valorant is the
  main reference, with Marathon's blocky geometry and Breath of the Wild's colour and light. No bare faces. Maps get set
  dressing only, with no layout changes.
- **Look settings (owner, 2026-10-05, 20:47).** A Robots setting mixes humans and robots on both teams each match; off
  makes everyone human. A Realistic colours setting. Eight two-tone replica colour schemes; the player picks each
  replica's colour in Customise. Skins come later.
- **WebGPU is a complete overhaul, not a renderer switch (owner, 2026-10-07).** WebGPU draws every preset; WebGL2 stays
  only as the automatic fallback through the same code; every material, shader and post pass is rebuilt on Three.js's
  node material system; GPU compute handles particles, Woodland's grass and culling. It replaces G10 and drops its "only
  if the perf run shows a gain". BB flight stays in the simulation (pure and tested); the GPU only draws it. New perf
  rule: on the owner's laptop and desktop, WebGPU is no slower than his WebGL baseline on any map, mode and preset, and
  Low still holds 60 fps at 1080p on the laptop. Until he says otherwise, Low runs on WebGPU too and a Renderer row
  (Auto, WebGPU, WebGL) joins `Settings › Graphics`. Milestones: `docs/ROADMAP.md`.
- **The laser beam stays off on every preset (owner, 2026-10-05, 07:06).** A beam with no dot stops short of what it
  points at.
- **Torches cast shadows on High and Ultra only; Low keeps today's beams (owner, 2026-10-06).** Keeps Low's 60 fps; an
  exception to the graphics plan's shadow-light limit on the higher presets (M91).
- **The Retro look goes public as soon as possible, not in 0.5 (owner, 2026-10-06).** He tested the Dev-tab "Retro
  pixels" filter and is happy with it. It changes only the picture, on every map and the range.
- **What you see is what stops you and your BBs (owner rule, 2026-10-05).** Art never strays more than 8 cm from its
  collision block (`NATURE_SHAPES.maxGap`), so trunks are straight posts, not tapered. Detail is drawn inside each
  block's own bounds, and sloping ground is one heightfield shared by physics, BB rays, nav and the mesh (2026-10-04).
- **Night is one lighting preset that every night map shares (2026-10-04).** Its moon and fill are the audit's candidate
  B (owner, 2026-10-05, decision 5), so earth, wood and faces stay readable under Neutral tone mapping; Neon Heights'
  neon stays emissive. Under a night preset Medium's shadow map follows the view (owner decision 7). The owner checks
  the street isn't washed out in his playtest.
- **High's shadow map follows the view: one light, no cascades (owner, 2026-10-04).** A fixed 40 m square round a point
  8 m ahead of the eye, moved in whole texels; a Custom row gives the whole-field map back.
- **The first start picks a quality preset from the GPU name; only an automatic pick steps down, never a player's choice
  (2026-10-04).** Software rendering starts on Low. A step down follows sustained slow frames, happens between rounds
  and is never saved.
- **Art is procedural today: canvas textures and geometry built in code (2026-10-04).** CC0 models and textures may
  replace parts later; each is recorded file by file in `docs/ASSETS.md`, even though CC0 needs no credit.

## Gameplay and feel

- **Hit volume is a body capsule plus a head sphere (2026-09-30); arms and the replica don't count, and arm hits stay
  off (owner, 2026-10-01).** The drawn figure is built from the same numbers (a test checks it), so hits look fair. A
  crouched head top stays at or below 1.15 m, because crouch cover is 1.2 m.
- **Hit calling stays a raised hand and a sign, with no dead rag, night light or shouted "HIT!" for now (owner,
  2026-10-06).** The hit system is good enough; he may revisit. Reverses the triage's Beta place for the night light.
- **A hit player calls HIT for 1.4 s, then walks to their team's dead zone along nav routes (2026-09-30).** A walk that
  can't finish fades out in place and reappears in the dead zone. Once a round is decided it is a cease-fire: nobody can
  fire and BBs in flight hit no one.
- **BB flight is built from fluid dynamics at full strength (owner, 2026-10-04).** Drag from the Reynolds number, Magnus
  lift from the hop-up's backspin, every force against the airflow. The owner asked for real trajectories and accepted
  full real drag. Replicas are rated like at a site, by muzzle energy and BB weight.
- **Wind: one breeze per match from the match's seed, 0.3 to 1.8 m/s, moving BBs only (owner accepted the defaults,
  2026-10-04).** Nothing on the HUD; the dust rides it.
- **BBs always ricochet; the Ricochets count setting only decides whether a ricochet knocks someone out, and it is off
  by default (owner, 2026-10-03 and 2026-10-04).** Fields differ, and a bounce knocking you out can feel unfair in a
  game. Your own ricochets can hit you and, with the setting on, knock you out (owner, 2026-10-05, 07:06).
- **Accuracy depends on stance and movement, by one rule for bots and the player (2026-10-02).** Still and crouched is
  tightest; running, sprinting and the air are loosest. The aim locks on almost at once when you stop (owner,
  2026-10-03: "too slow and smooth", he wanted an "instant lock").
- **Crouch toggles by default, with a setting for hold; sprinting or jumping stands you up (owner, 2026-10-03).** Lean
  stays hold. Aim and sprint are hold by default, with toggle settings.
- **Hold Q / E to lean around cover (owner, 2026-10-01); replicas switch with 1, 2 and the mouse wheel, with no swap key
  (owner, 2026-10-02).** One geometry (`sim/lean.ts`) drives the eye, BB origin, hit volume, camera, drawn figure and
  bot vision, so you are hit only where you appear and never through walls.
- **Walk is Shift (slow, quiet) and sprint is Left Alt (owner, 2026-09-30).** Ctrl was rejected because Ctrl+W closes
  the tab and can't be blocked outside fullscreen.
- **Walking pace is silent; running, sprinting and landing a jump make noise that bots hear (2026-09-30).** It gives the
  walk key a clear purpose. Players walking off after a hit make no bot-audible noise.
- **Limited ammunition means a set of magazines (owner, 2026-10-01).** A reload swaps in the fullest spare and keeps the
  old magazine as it is, with no topping up; nothing refills during a round. An empty trigger pull clicks dry and
  reloads at once.
- **Fire modes follow the real-world type each replica is modelled on, with a selector key (B, rebindable) (owner,
  2026-10-03).** A Glock-style pistol is semi only; an AR-pattern AEG has single, 3-round burst and full auto. Names
  stay generic (CLAUDE.md §4).
- **Every replica aims down sights, through iron sights when no optic is fitted (owner, 2026-10-06).** Replaces his
  2026-10-03 rule that aiming needs a fitted optic. Optics and other attachments stay accessories, never part of a
  replica's model (owner, 2026-10-03).
- **Up a ramp the pace loss stays: the speed fix is built but off (`MOVEMENT.rampPace` 0) (owner, 2026-10-05, 07:06).**
  Turning it on moved Attack / Defend balance on Depot, so a change needs the owner's call.
- **Cover heights: full cover is at least 2.4 m and crouch cover exactly 1.2 m; no walkable ledge sits between 0.15 m
  and jump height (2026-09-28).** Crouched eyes (1.09 m) hide behind 1.2 m cover and standing eyes (1.66 m) shoot over
  it, a readable peek-and-duck rhythm. Crouch cover is unclimbable (tested), and vaulting stays parked (owner,
  2026-10-01; "Maybe", 2026-10-06).

## Bots and balance

- **Bots are ordinary characters driven by the same commands as the player, with human limits (2026-09-30).** A 120°
  view, sight checks 10 times a second, a reaction delay, a capped turn rate and aim error. They never fire with a
  teammate in the line of fire. A test plays each level twice with a hidden, silent enemy and needs identical commands,
  so no bot aims at someone it hasn't seen or heard (M37).
- **Difficulty is skill plus a few tactics, never different senses (2026-10-01).** Easy, Normal, Hard and Pro see and
  hear alike. Opponents and teammates have separate difficulties (owner, 2026-10-03).
- **Normal is the baseline (owner, 2026-10-06, playtest note 19).** Tune on Normal, then check that Easy, Hard and Pro
  still scale. Extraction wants more opponents, not fewer.
- **Against Easy opponents, teammates play Normal (owner, 2026-10-05, 07:06).** Otherwise teammates follow the
  opponents' level. That default pair counts as the standard match for the records.
- **Pro is careful, not twitchier (owner approved the plan and all fourteen defaults, 2026-10-04).** Pro bots hold and
  pre-aim angles, clear corners, trade and set crossfires. They react fast (about 0.2 s) only to someone appearing near
  where they already aim, with the same sight and hearing as the player. Pro pays ×2, and its rewards are cosmetic only:
  no gear is locked behind the hardest level. A "what got you" card exists on every difficulty and is on by default only
  on Pro.
- **Difficulty is balanced with the maps; any map rework it needs is raised with the owner first (owner, 2026-10-04).**
- **On Hard and Pro, opponents roll their own random but compatible kits (owner, 2026-10-04: "the enemy bots can have
  their own random (but compatible) loadouts").** Seeded by the match seed, so a seed replays. Your teammates stay
  factory, so they don't outgun you by luck. BB weight and hop-up stay factory.
- **In Attack / Defend one attacker raises the flag while the others guard the pole from cover (owner's call,
  2026-10-04).** A second raiser adds nothing: the rope goes up no faster.
- **Every level hunts the middle of the map; Normal, Hard and Pro keep out of the light at night; Easy stands where its
  lane says (owner, 2026-10-05, decisions 4 and 13).** Below Pro, both teams swept to the far end and passed each other,
  and rounds ran out of time (M71).
- **Balance is guarded by headless bot-match tests with bands (2026-09-28).** A change that moves a band records its
  measure in the test. Owner ruling 2026-10-06 (M73): the Normal guards are judged at 45 to 55 %, the Pro guards at
  their usual 40 to 60 %.

## Maps and modes

- **A match is first to 5 round wins by default, with 2:30 rounds (2026-09-30).** A drawn round, such as an Elimination
  time-out, is replayed in both modes (owner default, 2026-10-04), because a draw can't decide a match. Half-time comes
  after `winsNeeded - 1` rounds, so the decider is always in the second half.
- **Teams swap ends at half-time in both modes (owner, 2026-10-03).** Maps define spawns, dead zones and lanes per end,
  not per team, so an asymmetric map is fair; in Attack / Defend the attackers always start at end 0.
- **Attack / Defend is the flag mode, named so Capture the Flag can be its own mode later (owner, 2026-10-01).** One
  team attacks a flagpole in the other's half. Standing within 1.6 m for 5 s raises the flag; defenders at the pole pull
  it down. A raised flag wins the round for the attackers, a time-out for the defenders. If attackers are working the
  rope at the buzzer, overtime lasts at most 15 s. The pole is visual only: no collider, and BBs pass through.
- **Team Deathmatch, when it comes, is respawn TDM: hit players walk back and re-enter (owner, 2026-10-01).**
  Elimination stays its own mode. An easy introduction where you are never out for long.
- **Rule sets: Skirmish, Tournament, Pro CQB and Custom (owner approved the plan, 2026-10-04).** Skirmish is today's
  rules exactly, the default (owner). A match counts for the records only as its ruleset's standard match; Custom pays
  at most ×1.5. Tournament and Pro CQB are dev and fold into the field rule presets (owner, 2026-10-05).
- **Maps may have elevation (owner, 2026-10-02).** Walkable surfaces are the tops of floors and ramps; ramps slope at
  most 1:2; stairs are drawn as steps and collide as the ramp underneath; a height change over 0.15 m between nav cells
  is not walkable. Floors may lie over one another, with a body's height of headroom (2026-10-04).
- **A map's layout rules are tests (2026-09-28).** Cover heights, unclimbable crouch cover, spawns hidden from each
  other, sightline caps, and per-map rules such as a pole every lane can reach or two ways up to every raised floor. A
  layout change keeps them or needs a decision line.
- **Depot is asymmetric (layout sketch approved by the owner, 2026-10-03).** The attackers' yard is in the west, the
  defenders' spawn in the north-east, with one flagpole in a walled loading bay and three lanes: Dock Road, Container
  Alley and the Office.
- **Depot's west end stays at 48 % of decided Elimination rounds (owner, 2026-10-05, 07:06).** The ends are not evened
  further.
- **Woodland is the second field: night only, much more open and larger than Depot, with a free weapon torch and glowing
  BBs (owner, 2026-10-04).** He picked it from five concepts: no prone yet, a gentle end-to-end slope, one much higher
  end with the flag. It plays 5v5 by default, allows 6v6 and offers only those two (owner, 2026-10-06; replaces 4v4 with
  Custom up to 5v5). Its long open lines are intended (owner decision 11, 2026-10-05); the longest clear line stays
  under 141 m.
- **Neon Heights is the third field: a vertical futuristic city with Day and Night (owner, 2026-10-04).** The concept
  was approved with all twelve defaults: 46 × 30 m, three playable floors, roofs not playable, stairs only, open windows
  with a 1.2 m sill, 4v4, both modes and Night first.
- **Team size belongs to the map: picking a map sets its standard size, and the Match pop-up offers up to the map's
  spawns (owner default, 2026-10-04).**
- **Bushes hide but BBs pass (owner approved, 2026-10-04).** Concealment, not cover: whoever is more than 0.6 m inside
  or behind a bush is hidden from bots.
- **The practice range is its own small map (2026-10-04).** Practice is the last mode on the Match screen, and the
  Tutorial shows on the title screen only on a clean save, with Replay tutorial in Settings (owner, 2026-10-07; replaces
  his 2026-10-04 rulings that put the range and an always-shown Tutorial button on the title screen).

## Replicas, Loadout, Armory and economy

- **The next replica is a spring sniper rifle, and the owner is asked how to build it and its specs before work starts
  (owner, 2026-10-06).** The SMG and shotgun come after it.
- **The Cyber Pistol is the owner's own design and a chase item (owner, 2026-10-04).** It has its own chance per Shot
  item (0.25 %, owner approved) and stays inside the pistol class's 1.0 J chrono limit: rifle power with pistol
  handling, the tightest spread and almost no kick. It borrows its colours from his photo (mint, hot pink, black), never
  its logo, lettering or outline (CLAUDE.md §4).
- **Loadout and Armory change only between matches, never from the pause menu (owner, 2026-10-03: "I don't want it in
  the pause menu").** The practice range's pause menu offers the Loadout, because a range has no match.
- **`pool.md` (what exists: IDs, tags, rarity, economy) and `stats.md` (how it shoots) are hand-edited data the game
  reads (owner's picks, 2026-10-04).** A row the game can't read is skipped with a warning and fails its test. Item IDs
  are six digits, in the order assets are added; they are permanent and only added to. Tags (`gas`, `top-rail`) decide
  what fits.
- **Every customisable item is an asset at a rarity tier from pool.md's table (2026-10-04).** A higher tier improves
  handling by its Bonus % (at most 15 % at Legendary) and adds energy and rate of fire at half of it (owner's pick).
  Never damage.
- **A battery sets the rate of fire, not the energy; stronger gas kicks harder; parts are trade-offs, never straight
  upgrades (owner's picks, 2026-10-04).** Red and Black Gas add +10 % and +20 % recoil; a Silencer, Long Barrel and
  Tight-Bore Barrel each trade something away.
- **Site chrono limit per class: 1.20 J for rifles, 1.00 J for pistols, on the rated energy at the factory BB weight
  (owner's pick, 2026-10-04).** It keeps stacked bonuses and later items in check. Silencers yes and barrels no on the
  pistol (owner).
- **A silencer shortens how far its shot is heard, for everyone the same way (2026-10-04).** Bots' hearing, the minimap
  patches and the sound cues all take the shooter's `heardScale`; the shot sounds muffled.
- **BB weight is a slider from 0.20 to 0.30 g in 0.01 g steps (the owner's range, 2026-10-04); hop-up is a dial per
  replica.** Both are set before a match, kept per replica, and bots use the factory settings. Weight is a small honest
  trade-off from the flight model, never an extra rule.
- **The Loadout lists only what you own (owner, 2026-10-04); a new unlock is never fitted for you.** What the Armory can
  give is on the Armory's own screen.
- **Shots: an Epic or rarer within 20 Shots and a Legendary within 100, counted per tier across visits (owner,
  2026-10-04).** Duplicate protection weights an unowned asset ×2 at its tier (owner). Tokens stay, and Shot buttons
  show their FC price ("1 Shot · 160 FC").
- **Economy numbers live in `pool.md` for the owner to tune (2026-10-04).** Field Credits pay per match, round won and
  hit, scaled by match length and the lower of the opponents' and teammates' multipliers. Every match pays, custom rules
  included, except the range, the tutorial and any match using dev content or a cheat, so none can farm FC.
- **Rarer items still count for the records (2026-10-04).** Their bonuses are small and handling only; the owner can
  rule otherwise once he has played the Armory.
- **Disable Armory and Unlock all gear are Dev switches (owner: the Armory "can be disabled in settings", 2026-10-04).**
  Disable Armory greys out the Armory and pays no FC (the collection is kept). Unlock all gear lends the Loadout every
  asset at every tier without touching the collection, and keeps the match out of the records and unpaid.

## Menus, HUD, settings and accessibility

- **The menu and UI redesign is approved (owner, 2026-10-05, 21:35); the HUD is restyled in place, with the same
  positions.**
- **The menus use Inter instead of Barlow (owner, 2026-10-07).** He finds Barlow hard to read, numbers above all; Inter
  (SIL OFL) has clear, even-width figures. Replaces the G3 font approved on 2026-10-06.
- **The tagline is "Call your hit. Go again." (owner, 2026-10-07).** It replaces the old tagline, "Call your hit. Walk
  it off. Go again."
- **The teams are Alpha (blue) and Beta (orange), although Beta is also the name of the Beta builds (owner,
  2026-10-07).** Both colour sets stay. The hit feed reads "Beta 2 called HIT · Alpha 3": who called the hit, then whose
  BB it was, and the player is "You" (the owner's wording). Replaces Blue and Orange.
- **Team colours come in Standard and High contrast sets, and props, kit and paint never use a team colour's hue
  (tested) (2026-10-04).** Colour is never the only cue: names carry a bar, exits a glyph and a distance. The exit green
  stays one colour in every set until a colour-blind playtester asks (owner decision 17, 2026-10-05).
- **Menu headings and labels are in capitals, descriptions as written (owner, 2026-10-03, on the menu sketch).** Done
  in the stylesheet (`text-transform`), so the text in code stays readable and searchable.
- **Menus are opaque (owner, 2026-10-03: nothing of the game should show through).** The controls list lives under
  Settings, not on New game or the pause menu (owner). The pause menu is Resume, Settings and Quit.
- **No map is loaded until Play (owner asked, 2026-10-03).** A match is a session built when Play is pressed and
  disposed when the player leaves it, so the next Play can load another map.
- **A hidden tab or a window that loses focus pauses the match (2026-10-04).**
- **Unbuilt menu items are listed greyed out with a LATER tag (owner, 2026-10-03).** He wants the menus laid out for
  what is coming; the list is data in `config/menus.ts`.
- **Menus at 4K with 100 % OS scaling stay as they are (owner decision 16, 2026-10-05).** Scaling them from the window
  height like the HUD is a Beta task.
- **The minimap shows teammates, and the other team only as patches where they were last heard ("approximate, from the
  last noise", owner, 2026-10-04).** A hit call removes that player's patch.
- **The order wheel is on Z (owner, 2026-10-04); Hold here is X, Regroup is V and Follow me is F.** Orders end when the
  player who gave them is hit and at each round start. A teammate's radio double-click confirms an order.
- **Key bindings: a key belongs to one action, and taking a used key swaps the two (2026-09-30).** Esc, F5, F11, F12,
  the browser navigation keys, PrintScreen, Pause and the debug keys (backtick, F3 and ]) can't be bound. Fire and the
  four move keys can never be left keyless.

## Audio

- **Every sound is a recipe synthesised in code and rendered once into buffers (2026-10-03).** Replicas sound like toys:
  mechanical and plasticky. CC0 samples may be added where synthesis falls short (owner, 2026-10-03), each recorded in
  `docs/ASSETS.md`.
- **A replica's shot follows its power source: electric, gas or spring (owner, 2026-10-03).** Impactful, but still an
  airsoft replica. An empty AEG still cycles; an empty gas pistol only clicks.
- **Footsteps are information, so gameplay audio comes first (owner rule, 2026-10-05).** Every ground's step stays
  within 1.5 dB of concrete overall and within 3 dB in the 0.7 to 4 kHz band, so a soft ground never hides anyone. Bots'
  hearing is unchanged and surface-blind.
- **A field's ambience is map data, with a day and a night variant picked by the lighting preset, never a map name
  (owner rule, 2026-10-05).** Calls are no louder than a bird and beds no louder than the yard's, with no more in the
  footstep band than Depot's bed (tested).
- **Every existing cue buffer is pinned by a fingerprint (2026-10-05).** Changing one needs a decision line; the one
  exception so far is trimming the silent tails (owner decision 19).
- **Sound memory is budgeted: about 7 MB per field beyond the title bank, and 12 MB for every map sound together
  (2026-10-05).**

## Save and settings storage

- **Save keys and fields are permanent and only added to (2026-10-04).** Settings live in one versioned object,
  `airsoft.settings`; the collection (`airsoft.collection`), the records (`airsoft.records`) and the key bindings keep
  their own keys. A rename or retype is a migration step. The collection is progress, not a setting.
- **A save is readable JSON with the stores as stored; an integer `SAVE_FORMAT` drives migrations (2026-10-04).** A
  store's version can't change without it (a test fails). Every store keeps fields it doesn't know. A format newer than
  the build is refused, and a store written by a newer build is never read or overwritten.
- **Loading replaces the whole save, with no merging (2026-10-04).** A side-by-side check comes first, the replaced save
  is kept for Undo, and the page reloads. A SHA-256 checksum is checked in code; there is no signature. Three restore
  points are kept, one per day the game opens.
- **One tab plays at a time (2026-10-04).** An exclusive Web Lock, with BroadcastChannel as fallback; Play here hands
  over. Two tabs could otherwise write over each other's FC.
- **Records count finished standard matches only (2026-10-04).** 3v3, first to 5, 2:30 rounds, friendly fire on,
  ricochets not counting, both teams at one difficulty. Quitting counts as nothing. A named ruleset files under its own
  cell.
- **Each page load gets a fresh simulation seed, and each match in a visit its own (owner approved, 2026-10-02).**
  `?seed=N` replays one and the debug overlay shows it. The simulation stays deterministic for a given seed and inputs.

## Content tags and dev content

- **Every map, mode, difficulty and pooled asset is tagged public or dev; dev content shows only with one Dev tab
  switch, Dev content (owner, 2026-10-04).** The owner wants Dev settings to be how new maps, weapons and features are
  tried before release. With the switch off, dev content is not visible at all, not even greyed out (owner, 18:57). With
  it on, it looks like the rest. Making content public means changing its tag.
- **A match that uses dev content stays out of the records and pays no Field Credits (owner kept the defaults,
  2026-10-04).** Dev gear never drops from Shots (try it with Unlock all gear). Bots carry it only with the switch on.
  Owned dev gear stays in the save, hidden, and a dev pick plays as the default until the switch is back on. A match
  counts as using dev content when Hard opponents could roll dev gear.
- **Woodland and Neon Heights stay dev content until the owner has playtested them; he makes each public himself (owner,
  2026-10-05, 07:04).** Woodland was dev from the start (owner, 2026-10-04, 18:10: "until the map is complete and I say
  so, this map is not accessible"). Its weapon torch stays dev until Woodland is public (owner, 2026-10-04, 18:56).
- **Dev settings apply only while their box is ticked (owner asked, 2026-10-04).** Game speed, Bottomless magazines,
  Ghost and Unlock all gear keep a match out of the records and unpaid, for the rest of that match. Debug info, BB paths
  and Retro pixels change only what you see. One click reaches them and one click puts everything back.

## Performance budgets and technical foundations

- **The Low preset must hold 60 fps on weak hardware (owner, 2026-10-04).** `pipeline/perf-budget.json`, measured on the
  owner's laptop: p95 ≤ 14 ms and p99 ≤ 20 ms; Low draw calls ≤ 100 and triangles ≤ 150k; GPU memory ≤ 300 MB; heap
  growth ≤ 5 MB over 60 s; nothing more than 10 % worse than the baseline. His ceilings of 150 draw calls and 250k
  triangles stay on High. Dynamic resolution scaling is not in the budget (owner: no). Raising any line needs a decision
  line.
- **Medium has map-scoped draw-call lines: Woodland 115 and Neon Heights 140 (owner, 2026-10-06, audit decision 4).**
  The other Medium lines (200k triangles, memory, heap) and every Low line stay the presets'.
- **Real light counts per quality are fixed: Low none, Medium 2, High 4 (owner rule, 2026-10-04).** Three.js rebuilds
  every lit shader when the count changes. Low holds 60 fps with no real lights.
- **Frame times are judged only on hardware rendering (2026-10-04).** The cloud container draws with SwiftShader, so
  there the gate judges counts, memory and the relative check. The perf gate runs a matrix of maps and modes, a
  combination only when the diff reaches it; baselines are reset in the pull request that changes what they measure
  (2026-10-05).
- **Chunk size budgets fail the build on CI, and growth is a deliberate bump with a decision line (2026-10-04).** The
  game chunk's default is 950 kB (warning from 90 %) and Rapier's 4,550 kB.
- **Production builds ship Brotli and gzip copies of their files (owner, 2026-10-04: Brotli now, `.wasm` later).**
- **Level blocks collide as closed triangle meshes with `FIX_INTERNAL_EDGES`, not cuboids (2026-09-28).** Rapier's
  capsule controller sinks into any cuboid along its diagonals, and without the flag face-diagonal edges give ghost
  contacts.
- **Only the ground probe decides "grounded" (2026-09-28).** The controller reports ground when the capsule's rounded
  bottom touches the top edge of cover, which let players hang on and hop over 1 m barriers.
- **Characters don't collide with each other in Rapier (2026-09-28).** The simulation handles spacing (bots steer apart)
  and BB hits, which keeps physics simple and deterministic.
- **Bot navigation is a 0.2 m grid built from the map's blocks, with one node per floor, not recast (2026-09-30).** Maps
  are box-built, so a grid is exact, has no dependency and needs no authoring. CLAUDE.md §3 allowed either.
- **An error in the game loop stops the loop for good and shows a "Something went wrong" pane with a copyable report
  (2026-10-04).** A half-stepped simulation can't be trusted, so there is no resume.
- **`?nolock` and `?script=perf` exist only on the dev server and the e2e build (2026-09-28, 2026-10-04).** A release
  build compiles `?nolock` away.
- **A new random feature draws from its own seeded stream, never the simulation's (2026-10-04).** Wind, chase kits,
  Extraction cases and presentation effects each have one, so seeds that already replay still replay.
- **Player-only preferences, such as toggles, live in the input layer (2026-10-03).** The simulation sees the same
  command it sees from a bot.
