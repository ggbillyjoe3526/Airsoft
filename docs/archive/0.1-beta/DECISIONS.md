# Decisions archive: the full wording before the 2026-10-17 trim

`docs/DECISIONS.md` passed 99 KB, twice the 50 KB rule, so DX2 cut each ruling to its decision and the detail that still
binds. This file is the whole live file as it stood on 2026-10-16, kept word for word: the reasons, the numbers and the
rulings superseded since (the Dev 5 order, the audit's 34 decisions, the token-efficiency plan, the chunk-size bumps)
are here. Grep it for the reason behind a number; do not edit it.

---

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
- **Progression is levels: matches give XP, and each level unlocks replicas and gear for good (owner, 2026-10-13).**
  It replaced the Armory's Shots and rarity tiers, and the 2026-10-01 rule of unlocks "never by levels". Parts are
  trade-offs, never a damage upgrade.
- **Friendly hits count (2026-09-30).** As at real sites; custom matches can switch it off (`HITS.friendlyFire`).
- **Public in 0.1, after the owner's playtest: Depot's modes, Easy to Hard, Woodland (night play, the torch, glowing
  BBs) and Pro (feature triage, owner, 2026-10-05).** Every public map, mode and difficulty multiplies beta's balance
  and bug work, so 0.1 ships the set that already plays well. Neon Heights stays dev until the Maps Update and
  Extraction until the Modes Update; `docs/ROADMAP.md` holds the current placement.
- **Cut features (owner, 2026-10-05).** Supply weekends and dated events; the Tone mapping choice in Graphics (the
  best-looking becomes everyone's); tracer BBs as an option (glowing BBs do it); Bomb and Intel grab; Free-for-all and
  the overshooting rule; cosmetic gear as its own system; a separate progression plan (the levels are the progression).
- **Kept features (owner, 2026-10-05).** Grenades (the Replica Update) and skins (the Progression Update) stay planned,
  with their Loadout placeholders (the empty Grenades slot, the greyed Skins row). Suppressors get a sound of their own
  in the Replica Update. Capture the Flag stays a possible mode in the Modes Update. Every deferred feature has a
  version; the owner can move any.
- **0.1 Dev 6 holds the systems the game still needs; the content goes to the themed updates (owner, 2026-10-06 and
  2026-10-12).** Of the 26 features he pulled into 0.1 on 2026-10-06, Dev 6 keeps the systems (bot names and gear,
  auto difficulty, callouts, pings, asking for a magazine, resting on cover, foliage, noisy props, overtime, saved
  loadouts, hiding the ammo counter), with vaulting added. The owner sent the optics and the sniper to the Replica
  Update; Claude placed the rest (items, gas cooling, the chrono and the suppressor sound in the Replica Update;
  presets, medic and the Extraction rework in the Modes Update; weather in the Maps Update; skins in the Progression
  Update), and the owner can move any (list: `docs/ROADMAP.md`).
- **Extraction (the Modes Update): solo against bots, with more and more aggressive opponents, quicker and closer
  waves, a longer extract timer and no respawn (owner, 2026-10-06).** Replaces his 2026-10-04 picks (a squad of three,
  one respawn) and the paused "one opponent fewer on Normal".
- **Battle royale (the Modes Update, dev first) goes ahead as an experimental dev mode, the exception to the
  Free-for-all cut (owner, 2026-10-06).** His answers on loot, zone and pay are in `docs/ROADMAP.md`, under the 0.1 Dev 4 playtest table.
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
- **0.1 Beta 1 has begun, and it carries the owner's Dev 6 playtest list (owner, 2026-10-16).** He called the game out
  of Dev and tags 0.1 Beta 1 when it is complete. His 34 items are Beta 1 work, including the few small additions he
  asked for: an in-match hop-up control, a home-screen fullscreen button, one feed with a placement setting, and WON or
  LOST at a round's end. He also removes features: resting on cover, the Voices setting, and the Skins option (it
  moves into Colour). Blender models become the default. Each item is a block in `docs/TASKS.md`.
- **Dev 5 order (owner, 2026-10-06).** The docs rewrite and the token-saving pipeline changes (TE2 to TE4), bug pass
  BP2, graphics, the playtest notes, the content toolkit (all four parts, mode checks included), bug pass BP3, then the
  tag. Dev 7 is folded into Dev 6 ("I want bigger builds"). The order is in `docs/ROADMAP.md`.
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
- **The release path: 0.1 Dev 6, 0.1 Beta, then 0.1.0 opens Early Access to the public; themed updates follow; 1.0 is
  the full launch (owner, 2026-10-12).** Dev 6 is the last planned Dev build, though he may add more. Early Access is
  feature complete but light on content, and a new feature can still come in any update. The updates are mini
  expansions: the Replica Update (replicas, attachments, items), the Modes Update, the Maps Update and the Progression
  Update (challenges, badges), planned as 0.2 to 0.5, and more can follow. The owner picks their order; version numbers
  always go up, so the next update shipped takes the next number (2026-10-12).

## How work runs

- **Every change is a pull request from a new branch made from the latest `main`; never push to `main` (owner,
  2026-10-02).** Every pull request is merged by its own thread, code included: once CI is green and
  the review agents passed, or once CI is green for docs-only (owner, 2026-10-16: "You should be merging. Not me";
  before, 2026-10-04 and 2026-10-06, only pipeline and docs pull requests). The owner doesn't merge.
- **When unsure about a design decision, ask the owner first; for a small, easy-to-change detail, pick a default and
  record it with a one-line reason (owner, 2026-10-02).** The record is the task's own, `docs/records/<id>.md`. A check
  that can only pass by changing an acceptance criterion goes to the owner at once (owner, 2026-10-06).
- **Every task runs through scripted gates and a binary critic (owner's design, 2026-10-04).** `pipeline/gate.mjs`
  decides build, tests, smoke, perf, scope and changelog; the critic judges only on green gates, with eight pass/fail
  checks instead of a 0 to 10 score. Four attempts, then auto-accept at 6 of 8 with checks 1 and 2 passing (owner), else
  a report to the owner. Details: `docs/PROCESS.md › The pipeline`.
- **The build thread is the worker (2026-10-04).** The coordinator starts each task's thread on the tier's model (Opus
  5.5 at Extra effort for core, Sonnet 5.5 medium for UI and trivial); QA, performance, triage, critic and changelog
  are agents it spawns.
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
  to save tokens: shared tables cost every thread a read).** It holds the review line, a row per attempt (the gate
  writes the row's gate cells), the task's own decisions and the issues it left. `docs/REVIEWS.md` and `docs/METRICS.md`
  are retired to the archive; `docs/KNOWN_ISSUES.md` stays the shared list of open issues. Format:
  `docs/records/README.md`.
- **A task that adds, renames or moves a file keeps its folder's `README.md` current (2026-10-08, TE2).** The module
  map (`docs/ARCHITECTURE.md`) and the folder READMEs replace grep sweeps across `src/`; the scope gate allows a
  `src/` folder README in any task.
- **Agents start from the gate's own summaries, and an agent runs only where it can change the outcome (owner,
  2026-10-06, to save tokens; built 2026-10-08, TE3).** The critic and QA read the review packet first
  (`pipeline/out/review-packet.md`); the performance agent runs only when the perf gate fails (superseded 2026-10-16:
  it reviews every code change, below); the triage agent only for a failure the gate's summary
  (`pipeline/out/failures.md`) can't place; the changelog agent reads only `Unreleased` and one FEATURES heading; a near
  miss is re-run on Opus only when its failed check is a judgment, never a measured number. Models and effort levels
  are unchanged.
- **Every code change gets all three review agents: critic, QA and performance (owner, 2026-10-16: "I need everything
  to go through a critic agent, qa agent, and performance agent").** This replaces TE3's "the performance
  agent runs only when the perf gate fails" and the critic skip for trivial tasks. Any pull request touching code,
  config, assets or gameplay data, inside the pipeline or not, is marked ready and merged only once each agent says
  Pass (critic: Accept, or the 6/8 auto-accept) and its description's `Review:` line gives the verdicts; CI's `review`
  gate (`pipeline/review.mjs`) checks the line on every pull request out of draft. Docs-only changes (every file
  Markdown, and at the root only README, CHANGELOG and CLAUDE.md: the other root `.md` files are game data) skip them.
  Models and effort levels are unchanged.
- **Fewer messages and fewer slow runs (owner, 2026-10-06, to save tokens; built 2026-10-08, TE4).** The project chat
  carries only results, blockers and decisions, from threads and the coordinator alike (`docs/PROCESS.md` ›
  Sessions). Off CI the gate runs the slow bot-match guards only when the diff reaches a file they load (by their
  imports, not by folder: bot tuning in `src/config` and the pool reach them too); CI always runs every test. Balance
  figures are a report, not tests (Bots and balance, below). Test-only files are not perf paths.
- **Fable 5.1 runs only with the owner's explicit approval, asked for each time, and only where it would do
  significantly better than Opus (owner, 2026-10-08).** It costs far more. The candidates are audits and reviews of a
  major architectural change, a major redesign, or how a new system fits into the project; the planning thread runs
  on Opus unless he approves Fable. Every other job keeps its model: Opus 5.5 at Extra effort (his project setting)
  for the coordinator and core work, Sonnet 5.5 for UI, Haiku 5.5 for helper jobs (changelog, triage). Details:
  `docs/PROCESS.md` › Models.

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
- **WebGPU is the default renderer, not a Dev setting (owner, 2026-10-08).** A public Renderer row in
  `Settings › Graphics` offers Auto, WebGPU and WebGL. Since W6 (2026-10-11) there is one renderer: WebGL means the node
  renderer's WebGL2 back end, used when the browser has no WebGPU, the player picks it, or the GPU is lost and no new
  device comes. The old WebGLRenderer and its GLSL post passes are gone.
- **A software WebGPU adapter is judged on the look bar's pixel share only (2026-10-09, W3).** SwiftShader's WebGPU
  differs from its WebGL in noise, not in what is drawn, so the container checks that at most 1 % of pixels differ by
  more than 24; the mean is judged on hardware. The nearest fire's shadow, other players' torches as real lights and the
  neon signs' coloured light stay out of the node renderer.
- **On a software adapter the Dev retro filter's views are judged by eye (2026-10-10, W4).** Its 8-colour palette turns
  sub-pixel noise into whole steps, so the numbers say nothing there.
- **A change that should draw nothing new is checked against the commit before it (2026-10-11, W6b).** The WebGL
  reference (b10c006) no longer matches Woodland or the figures, so `webgpu-compare.mjs --reference <commit>` draws the
  commit before on both pages; a change that alters the look still checks Depot's and Neon Heights' world views against
  b10c006, and the rest by eye.
- **Woodland's triangle lines stayed as they were until the budgets split per renderer (owner, card, 2026-10-10, 15:18:
  "Keep for now"; W5).** W6a kept them: the scene's own triangles hold the owner's lines on both back ends, and the
  grass and stand-ins go on a line of their own (Performance budgets, below).
- **The laser beam stays off on every preset (owner, 2026-10-05, 07:06).** A beam with no dot stops short of what it
  points at.
- **Torches cast shadows on High and Ultra only; Low keeps today's beams (owner, 2026-10-06).** Keeps Low's 60 fps; an
  exception to the graphics plan's shadow-light limit on the higher presets (M91).
- **The Retro look goes public as soon as possible, not in 0.5 (owner, 2026-10-06).** He tested the Dev-tab "Retro
  pixels" filter and is happy with it. It changes only the picture, on every map and the range. Back on the Dev tab
  since the Dev 6 playtest (owner, 2026-10-16; ST1, Menus below).
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
- **Higher-detail models come later, after the WebGPU overhaul (owner, 2026-10-09: "I want to try improve characters
  and all other models in the future but this will be later").** Figures, replicas and every other model. It widens
  the Blender art pass the owner planned on 2026-10-05, now tied to no update (`docs/ROADMAP.md` › Not tied to an
  update); the Blender models built in Dev 5 are the game's own since 0.1 Beta 1 (below). The figures came
  forward to 0.1 Dev 6 (below).
- **The Blender models are the default everywhere (owner, 2026-10-16, Dev 6 playtest item 1: "Blender models default.
  Code models removed or on low settings only"; BD1).** Replicas, parts, the menus' battery and gas pictures and the
  rigged figures load as the game starts and every match and menu draws them. The Dev switches "Disable figure models"
  and "Disable all models" (RM4, 2026-10-11) are gone with the code behind them. The code-built models are not kept for
  Low: Low with the models in measured inside every budget line (Depot, container: 35 draw calls of 100, 54k
  triangles of 150k, 78 MB of GPU memory of 300); they stay only as what is drawn when a file can't be loaded. Low's
  frame time on the owner's laptop is still to be measured (PF2). The Medium preset's Player detail is Low, so its
  figures drop to their middle detail beyond 6 m as on Low (Woodland 5v5's spawn was over Medium's 200k triangles).
- **The Blender figures (owner, 2026-10-10; approved 2026-10-12: "happy with it for now").** The hands hold the
  replica naturally, the trigger finger in the guard; humans wore the high-cut helmet head only (four heads since
  2026-10-13, below); robots wear no vest,
  holsters, magazines or accessories, their team shown by its colour on their highlights; the figure is also the
  player's first-person body, without its head. A reload pulls the old magazine and throws it; bots drop it (owner,
  2026-10-11). Every match draws them (BD1), ahead of a CC0 `figure.glb`.
- **A rigged figure points its replica where the shot goes (2026-10-12).** The aim clips turn the replica through 55 %
  of their ±60 degrees: the game blends them by the replica's pitch, leans the upper body for the rest and twists out
  the rifle stance's 6 degrees, so a bot visibly aims at what it shoots (BF1).
- **The figure files are packed losslessly after each Blender export (owner, 2026-10-12: "Make all those 10 changes";
  IM5).** `tools/blender/bot-figure/pack.mjs` drops the clip tracks the game drops at load anyway (a bone within
  0.00001 of rest), stores the rest with meshopt's lossless codec and re-deflates the PNGs: 4.2 and 4.5 MB become 2.2
  and 2.4 MB (gzip 2.0 to 1.5 and 1.7 MB) and parse in a third of the time, and the game draws them pixel for pixel the
  same. No gltfpack: it renames and reorders what the game reads. Replaces BF1's "ship as exported"; the files are
  still fetched only with the switches off, so the default download is unchanged.
- **The attachments are redesigned lower and rounder (owner, 2026-10-12: "Perfect. Add them to the game."; RM8).** The
  red dot is a 29 mm micro tube and the 2x scope a 10.8 cm prism scope (was 18), both on a sight line 3.05 cm over the
  rail (0.104 m above the AEG's origin, was 0.126); a parts file's optic marks its own sight line and the aim follows
  it, so the built-in optics keep theirs. The silencers are round with the same lengths, so muzzles stay put. The
  pistol torch clips straight to the rail and, with the Red Laser fitted too, sits 1.6 cm lower under it (its
  `UnderLaser` marker). Behind "Disable all models", like every Blender model, until BD1 made them the default.
- **The human and robot figures are redesigned to look more realistic in 0.1 Dev 6 (owner, 2026-10-13: "In dev 6 I want
  to redesign the bot/player figures to be more realistic").** The owner does it himself at his PC, in his own Blender
  through the port 9876 bridge, from reference photos he shares first. The same session makes the figures' animations
  for Dev 6's new moves, such as vaulting (owner, 2026-10-13: "This will also give an opportunity to update animations
  for anything new like vaulting"), and a rest-on-cover animation in place of M104's placeholder lean (owner,
  2026-10-13: "Make sure the figure redesign notes it needs animations for this"). It waits on his photos and his
  Blender session: no thread starts it before he does. It brings the figures forward from the later higher-detail models
  (above), and they stay behind the Dev switches until he is happy with them.
- **The robot is redesigned in a cloud Blender, from his reference pictures (owner, 2026-10-13: "if you can connect to a
  cloud session of Blender then start now"; RM10).** His first review (2026-10-13): every robot wears the old "other
  head" made over ("the robot could have a visor/headset/square 'headphones'"); the team-coloured shoulders are part of
  the arm and don't stick out; no + symbol; "more mechanical and 'boxy'", with as much detail as the budgets allow.
  Approved on the second round of pictures ("perfect. add to the game."), with "make sure the bot has the animations for
  vaulting/resting on cover etc": the rest-on-cover and vault clips are shared by both figures
  (`tools/blender/bot-figure/scripts/bot18.py`), and the human's are spliced into its approved RM9 export.
- **A BB has no glow round it; a glowing BB is lit itself (owner, 2026-10-13, Dev 5 playtest note 3).** FA8's soft
  halo round every BB (and its Graphics quality field) is gone: a BB is its ball and its streak, and Glowing BBs keep
  their lit green ball and longer streak. Bloom doesn't pick a BB up (it is never brighter than its colour).
- **The redesigned human has four heads and shows the team colour on its vest (owner, 2026-10-13: "create a few
  different heads for the human model"; "go with the vests (and armbands/patches/helmet/hat) to show team colour. it's
  much easier to read"; RM9).** A figure's id picks its head (`config/figureRig.ts`): the high-cut helmet with ear
  defenders and a mesh mask, a cap with a headset and goggles, a boonie hat with a check scarf, or a full-cut helmet
  with goggles; each wears eye protection and a team marker, and is at most 2,500 triangles. The plate carrier and
  cummerbund are in the team colour, as on the built-in figures, with the armbands, patches and helmet or hat bands;
  the camo stays. A human is at most 20,000 triangles with its largest head (19,966) and its packed file under 3.5 MB
  (2.84). Built in his Blender (`bot20.py` to `bot22.py`), approved on review pictures before it entered the game.

## Gameplay and feel

- **Hit volume is a body capsule plus a head sphere (2026-09-30); arms and the replica don't count, and arm hits stay
  off (owner, 2026-10-01).** The drawn figure is built from the same numbers (a test checks it), so hits look fair. A
  crouched head top stays at or below 1.15 m, because crouch cover is 1.2 m. Since M85 (owner's playtest note 17,
  2026-10-06) the body is a chest, oval hips and two legs (thigh, shin, boot) that swing on the simulation's walk
  cycle, and `render/figureHitVolume.test.ts` measures it against the drawn figure on every pose; a new figure (the
  Blender remodel) must pass it. **Every body stops a BB (M85, default ruled 2026-10-06):** a BB that hits someone knocks
  them out and stops, with no bounce off bodies; one that reaches someone already hit stops on them with no second hit.
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
  game. Your own ricochets can hit you and, with the setting on, knock you out (owner, 2026-10-05, 07:06). Bounces are
  weaker since G12 (owner, decision card, 2026-10-10: "Bounced BBs lose more speed, so fewer of them knock players
  out"): concrete gives back 0.3 of the speed into it and steel 0.41, three quarters of M20's values; the cap on the
  share of hits that are ricochets stays 0.25 (`ai/depotMatchSupport.ts`), not raised.
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
  reloads at once. A teammate's tossed magazine (MG1, below) moves BBs from their pouch to yours and never makes any.
- **A teammate can toss you a magazine when you run low, and you them (2026-10-15, MG1, the owner's Dev 6 item 43;
  Claude's defaults, any can change).** Low means less than one full spare left for the replica in hand. A magazine
  fits by its replica's class in `stats.md` (a rifle's for a rifle, a pistol's for a pistol), so mixed kits share
  without a table of which replica takes which. The toss reaches 6 m, needs a clear line, flies 0.3 s plus 0.05 s a
  metre to the catcher's chest wherever they move, and its BBs fill the catcher's emptiest spares. It is lost if the
  catcher is hit or the round is decided while it flies. A toss takes only what the catcher's emptiest spare has room
  for; any that no longer fit when it lands (two landing together) go with it. One in the air to you counts as one
  coming: pressing again before it lands asks nobody. All the numbers are in `config/magShare.ts`.
- **A bot never gives away its last full spare of the replica it fights with (2026-10-15, MG1).** `keepMags`: giving
  must not make the giver the next one to ask. Its unused sidearm it gives freely.
- **Fire modes follow the real-world type each replica is modelled on, with a selector key (B, rebindable) (owner,
  2026-10-03).** A Glock-style pistol is semi only; an AR-pattern AEG has single, 3-round burst and full auto. Names
  stay generic (CLAUDE.md §4).
- **Every replica aims down sights, through iron sights when no optic is fitted (owner, 2026-10-06).** Replaces his
  2026-10-03 rule that aiming needs a fitted optic. Optics and other attachments stay accessories, never part of a
  replica's model (owner, 2026-10-03). Down any sight the spread is halved and Shift creeps below the aiming pace (M84,
  `MOVEMENT.accuracy.aimed`, `aimWalkScale`); bots fire from the hip.
- **Up a ramp the pace loss stays: the speed fix is built but off (`MOVEMENT.rampPace` 0) (owner, 2026-10-05, 07:06).**
  Turning it on moved Attack / Defend balance on Depot, so a change needs the owner's call.
- **Cover heights: full cover is at least 2.4 m and crouch cover exactly 1.2 m; no walkable ledge sits between 0.15 m
  and jump height (2026-09-28).** Crouched eyes (1.09 m) hide behind 1.2 m cover and standing eyes (1.66 m) shoot over
  it, a readable peek-and-duck rhythm. Crouch cover is unclimbable (tested); vaulting (0.1 Dev 6) clears only lower
  obstacles, 0.7 to 0.9 m (2026-10-12).
- **The Blender figures in the game (BF1) are part of 0.1 Dev 5 (owner, 2026-10-12: "This is for Dev 5").** They
  merge before the Dev 5 tag, still behind the Dev switches.
- **The rigged figures had to pass M85's hit-volume check before becoming the default (2026-10-12).** They do since
  HV1 (2026-10-16): `render/riggedHitVolume.test.ts` holds every pose of both figures to the bar (BF1, HV1).
- **With the rigged figures drawn, the hit volume's legs are the figures' own (owner, 2026-10-13: "Legs follow"; IM8).**
  Their thighs, shins and boots stand on the figure's leg joints from its clips, and the walk cycle steps at the clips'
  strides. The head, chest and hips followed in HV1 (below); the built-in figures keep the built-in volume.
- **Vaulting comes in 0.1 Dev 6; slide into cover is no for now (owner, 2026-10-12).** Vaulting goes over low
  obstacles of 0.7 to 0.9 m, with a few added to the maps where they open a route; slide waits in `docs/IDEAS.md`.
- **3 holsters the replica (1 primary, 2 secondary, rebindable): moving holstered is faster, never past the sprint, and
  the draw from the holster slower (owner, 2026-10-06, playtest note 3; Dev 6 note 27, 2026-10-16; M92, MV1).** The
  holstered run is 5.0 m/s against 4.2 with the replica out (`MOVEMENT.holsterRunSpeed`); the sprint is 6.3 m/s
  either way, as the holster never adds to it. A draw from the holster takes 1.8 times the replica's own
  (`HOLSTER.drawScale`: the rifle 0.81 s, the pistol 0.54 s). A slot key, a fresh trigger pull, an aim press or a
  reload draws it. Bots follow the same rules through the same command, holstering only on a calm sprint through their
  own half (`ai/botHolster.ts`).
- **Vaulting is Jump at a low obstacle, with no key of its own (M102, 2026-10-13).** Jump within reach of something
  0.6 to 0.95 m over your floor and at most 0.95 m over the floor past it (at most 1 m deep, your full height clear over
  it), heading within 70° of where you look, vaults it: only what is low from both sides, so crouch cover never is, not
  even from its uphill side on a slope. Anywhere else Jump is a jump, as before. The Controls list calls it "Jump / vault"
  and a prompt shows the key while a vault is there. A vault takes about 0.4 s, carries the replica and holds fire
  0.3 s after it; crouched, you can't vault (stand first). Values in `config/vault.ts`.
- **A vault keeps what you press during it, and a trigger held through it is the same pull (BP5, 2026-10-16; Claude's
  default).** Nothing starts mid-vault, as before, but a reload, slot, holster, fire selector, torch or magazine press
  made during it happens as you land (each once), and the trigger and aim count as they were when it began: a semi-auto
  pull held over a wall fires no second BB, and a trigger held holstered doesn't draw on landing. Hit mid-vault, you
  land first and walk off from there (`sim/vault.ts`).
- **Vaults are loud (owner, 2026-10-13: "Vaulting should create noise that makes enemies aware. Just like footsteps.
  Vaulting allows quick movement but at the cost of making noise.").** A vault is the loudest step there is: bots hear
  its hands and kit on the obstacle from 18 m (a sprint 16, a landing 12, a run 11), and its landing as well.
- **Running into a noisy prop gives you away, and a BB ringing off steel draws a look (2026-10-15, NP1, the owner's Dev
  6 item 41; Claude's defaults, any can change).** A run or sprint straight into a skip, container, van, generator,
  IBC, rack, stall, vending machine, phone booth, site toilet, arcade cabinet, crate, pallet load or Woodland's board
  fence (3 m/s or more into its face) knocks it: you hear its boom, clank, rattle or knock from where it was hit, with
  a puff of dust, and the other team's bots hear it from 13 to 20 m by prop, placed on you, like a step. Walking,
  crouching, glancing along it, leaning on it or standing on it stay quiet, and a prop sounds at most once every 1.2 s.
  A BB landing hard on steel (a skip, container or the van 12 m; a generator or IBC 10 m) rings: only a bot with nothing
  fresher on its mind turns to check it, and it tells nobody, so a ring is a distraction, never a pull off a fight.
  Walls, floors, ramps, barriers, gabions, sandbags, logs, boulders, trees and planters are silent; a timber or plastic
  prop only knocks when run into. All the numbers are in `config/noise.ts`, beside the bots' hearing ranges they scale.
- **Steps on gravel and steel plate carry 1.35 times as far (2026-10-15, NP1).** A run, sprint or landing on
  Woodland's creek gravel, Depot's dock ramps or Neon Heights' metal stairs is heard by bots that much further and
  plays that much louder (+2.6 dB) to you, yours included; walking stays silent on every ground. The simulation names
  the ground (`WorldQuery.surfaceUnder`), so the bots hear exactly the ground you hear.
- **Nobody rests or leans on cover or any other object (owner, 2026-10-16, Dev 6 note 30: "It doesn't add anything to
  the game"; MV1).** M104's rest on cover is gone for the player and the bots: aiming at a ledge changes nothing, and
  there is no "Rested" tag. Leaning with Q and E (peeking) stays. The figures' files still hold their unused Rest clips
  until they are next exported (`docs/KNOWN_ISSUES.md`).
- **Walking with Shift pays off in accuracy: ×1.0 against running's ×2.6 (owner, 2026-10-16, Dev 6 note 29: picked
  "Steadier walk"; MV1).** Shift already walked at 2.3 m/s against 4.2; its spread was ×1.15. Now a
  walk is as steady as standing before the still bonus (×0.7), so the crosshair visibly closes. Crouch-walking stays
  steadier than walking and shakier than standing still.
- **You can fire while sprinting, less accurately (owner, 2026-10-13, Dev 5 playtest note 9).** On the run the spread
  is ×3.5 (walking ×1.15, running ×2.6) and each shot kicks 1.5 times as hard (`MOVEMENT.accuracy.sprint` and
  `.sprintKick`); the 0.2 s lockout after a sprint is gone. The replica comes up out of the sprint carry in 0.06 s to
  fire and stays up 0.35 s after the trigger is let go. A toggled sprint still ends on a fire press, which now fires at
  once. A vault still carries the replica, with no shot until 0.3 s after it (M102). Bots still stop sprinting to
  fight; whether bold bots spray on the run is for the bot personalities.
- **The hit area is fitted to each figure (owner, 2026-10-16, Dev 6 playtest: "fit to each figure").** The head,
  chest, shoulders and hips sit on each rigged figure's own bones, as the legs do, with a shape fitted per figure
  (`FIGURE_HIT_SHAPES`, read from the clips as the figures load). Done in HV1: every pose of both figures is within
  M85's bar (4 % missed, 3 % thin air); a character's volume takes the shape of the figure it is drawn as.

## Bots and balance

- **Bots are ordinary characters driven by the same commands as the player, with human limits (2026-09-30).** A 120°
  view, sight checks 10 times a second, a reaction delay, a capped turn rate and aim error. They never fire with a
  teammate in the line of fire. A test plays each level twice with a hidden, silent enemy and needs identical commands,
  so no bot aims at someone it hasn't seen or heard (M37).
- **Bots hold fire through more than 0.25 m of bush; Easy fires into the leaves as far as a BB could get through
  (2026-10-15, FO1).** Through more, BBs come out well off their line or not at all, so Normal and up wait for a clearer
  shot and Easy wastes BBs in the leaves (`foliageFireThrough` in `config/bots.ts`, `firesIntoLeaves` per level). Bushes
  still block bots' sight past 0.6 m and never block hearing.
- **Difficulty is skill plus a few tactics, never different senses (2026-10-01).** Easy, Normal, Hard and Pro see and
  hear alike. Opponents and teammates have separate difficulties (owner, 2026-10-03).
- **Normal is the baseline (owner, 2026-10-06, playtest note 19).** Tune on Normal, then check that Easy, Hard and Pro
  still scale. Extraction wants more opponents, not fewer.
- **Adaptive difficulty is a Dev setting that layers over the fixed levels (owner, 2026-10-06: "auto difficulty as a
  Dev setting"; AD1, 2026-10-13).** It never changes a level's own numbers: the other team's skill is a rating between
  the levels whose numbers blend, with the switches of the level nearest it. Your teammates never adapt, Extraction
  doesn't, and its matches stay out of the records and give no XP, like the other Dev settings that change play. A
  later change to a level's skill (bot gear) reaches it through `BOT_SKILL`, each bot's personality (BN1) lays over the
  adapted numbers as over a fixed level's, and a new skill field goes in one of its two lists
  (`config/adaptiveDifficulty.ts`).
- **Against Easy opponents, teammates play Normal (owner, 2026-10-05, 07:06).** Otherwise teammates follow the
  opponents' level. That default pair counts as the standard match for the records.
- **Pro is careful, not twitchier (owner approved the plan and all fourteen defaults, 2026-10-04).** Pro bots hold and
  pre-aim angles, clear corners, trade and set crossfires. They react fast (about 0.2 s) only to someone appearing near
  where they already aim, with the same sight and hearing as the player. Pro pays ×2, and its rewards are cosmetic only:
  no gear is locked behind the hardest level. A "what got you" card exists on every difficulty and is on by default only
  on Pro.
- **Difficulty is balanced with the maps; any map rework it needs is raised with the owner first (owner, 2026-10-04).**
- **Opponents on every level carry kits from `bot-kits.md`, picked by each level's weights (2026-10-13, BG1; Dev 6 item
  23, audit POOL-24).** It keeps the owner's 2026-10-04 wish, "the enemy bots can have their own random (but
  compatible) loadouts", which gave Hard and Pro a random part per slot: each opponent still picks its own, seeded by
  the match seed and its id, so a seed replays. Named kits that make sense (a scope with a tight-bore barrel, a
  silencer with a low-cap magazine) replace the per-slot roll, and the owner edits what bots carry and how often in one
  table. Easy is mostly factory, each level up carries more, Pro never factory; the weights are first guesses for his
  playtest. Your teammates stay factory (owner, 2026-10-04), so they don't outgun you by luck. BB weight and hop-up stay
  factory. What you have unlocked never changes a bot's kit: the Cyber Pistol is a kit of its own from Hard up, no
  longer carried only once you have one (M32; earned by levelling after LV1).
- **A bot aims through the sight on its replica; gear never changes what it sees or hears (2026-10-13, BG1).** A 2x
  scope holds 40 % finer once settled but settles 10 % later, starts 40 % wider up close and loses a crossing target
  50 % more; a red dot is 15 % finer and 10 % quicker; iron sights are the level's own aim (`BOT_SIGHT_AIM`). Bots
  fire from the hip while they strafe (anchors aim, BN1), so the error on the move stays the level's. A silencer, laser, barrel, magazine
  or power source works on a bot as on the player.
- **Bots' figures show their kit (2026-10-13, BG1).** The built-in figures draw the rifle's optic at every detail, so a
  scoped bot reads at a glance; grips, lasers and barrels show on the rigged figures (the default since BD1), where
  each replica's own model takes its fitted parts. No new model files.
- **Bots have names and personalities, read from `bots.md` (BN1, 2026-10-13; Claude's defaults, Dev 6 item 21).** Each
  match every bot draws a made-up name off the roster, and a name always plays the same personality (rusher, anchor,
  flanker, careful), so you learn who to watch; a team takes different personalities before any comes twice. A
  personality changes how a bot plays (pauses, cover, pushing in, lanes, holding, bursts, corners), never how it sees,
  hears, reacts, turns or aims: the level stays the level. The tables are the owner's to edit; a cell the game can't
  read plays neutral. A run's jobs and your squad orders come first: guards, patrols and hunters work their jobs, and a
  bot under your order does what you asked.
- **Anchors aim from cover; every other bot still fires from the hip (BN1).**
  An anchor raises its sight when it stands still to fight, look over its cover or hold, with the player's aimed
  spread. Still means no sidestep either (BP5): a fight's strafe sets no route, and anchors aimed through it at
  walking pace, playing worse, not differently. An anchor sent hunting (a squad order ended mid-round, or the late
  push) hunts and no longer holds (BP5: it stood where the order left it until its mark).
- **What a personality carries belongs to the bot gear table, not to bots.md (BN1, Dev 6 item 23).** The roadmap's
  "loadouts" for item 21 come with item 23's data-driven bot loadout table, which reads `Bot.personality`; bots.md
  holds names and play only. `bot-kits.md`'s Suits column names the personalities each kit suits, and a bot picks a
  kit that suits it three times as often as the other kits with Suits (BG1, `BOT_KIT_SUIT_LEAN`): rushers Support,
  Pointman and the Cyber Pistol, anchors Marksman and Support, flankers Stealth and Pointman, careful bots Rifleman and
  Marksman. The Factory kit, with no Suits, keeps its chance: the level decides how often a bot carries gear, its
  personality which (with a plain lean Easy's factory share fell from 60 to about 45 in 100).
- **In Attack / Defend one attacker raises the flag while the others guard the pole from cover (owner's call,
  2026-10-04).** A second raiser adds nothing: the rope goes up no faster.
- **Every level hunts the middle of the map; Normal, Hard and Pro keep out of the light at night; Easy stands where its
  lane says (owner, 2026-10-05, decisions 4 and 13).** Below Pro, both teams swept to the far end and passed each other,
  and rounds ran out of time (M71).
- **Hunting bots check by eye, and a team shares what its bots checked (M87, owner's note 15, 2026-10-06).** A spot a
  bot sees empty, or a teammate stood in, counts as checked for the level's `huntMemory` (Easy 20 s, Normal 40, Hard
  50, Pro 60; `config/bots.ts`); older, it counts as never checked, so the middle keeps drawing the hunt. A bot that
  sees its hunt spot empty turns off for the next before it gets there.
- **Balance is measured by headless bot matches against bands (2026-09-28), in a report since TE4 (owner, 2026-10-06;
  built 2026-10-08), since noise across seeds made pass/fail bands cost re-measure loops.** Who wins, who lands the
  first hit, how often the squad gets out of Extraction and the levels' order are figures in `src/ai/balance/`, judged
  by `node pipeline/balance.mjs` against their bands and standard errors; they never fail a build, and the bug pass
  reads the report. The `slow` guards keep what must never happen (rounds played and settled, nobody stuck, falling or
  hit by a teammate, the rules of each mode). A change that moves a figure records its measure beside it. Owner ruling
  2026-10-06 (M73): the Normal figures are judged at 45 to 55 %, the Pro ones at their usual 40 to 60 %.
- **Bot callouts are text and a radio click, never voices, and never change play (2026-10-13, CL1).** A teammate's
  call shows bottom left with the walkie-talkie click an order gets (no new sound to render), panned to where they
  are; an enemy's is only its click, from them, within 15 m. The callouts read the bots and never write them, on a
  random stream of their own, so seeds still replay. Hit players never talk: hit calling stays the raised hand.
- **Callouts keep a slow, readable pace (2026-10-13, CL1; the owner found it OK in play, 2026-10-16).** A team says
  one call at a time, 1.5 s apart, a bot its own 4 s apart and the same enemy 10 s apart; the most urgent first, and a call kept waiting over 1.5 s is dropped. About
  5 to 11 calls a team a minute in the headless matches. All of it, and every line, is in `callouts.md`.
- **A ping marks a spot or an enemy for your team, and your bot teammates play it their way (2026-10-15, PG1; Claude's
  defaults, any can change).** The Ping key marks where the crosshair meets the field within 120 m. An enemy under it
  counts only if the bots' own sight rules let you see them (not in a bush, not in the dark), so a ping never finds the
  hidden. Teammates take it as a noise heard exactly there: a rusher runs, a flanker may go round, a careful bot walks
  in, an anchor or defender far off watches from its post, one under your order keeps it; one in a fight ignores it.
  They keep it in mind 20 s (`pingMemory`), past their usual 6 s.
- **One teammate answers each ping, and some sightings come back marked (2026-10-15, PG1).** "Going to your ping" from
  one that set off, else "Watching your ping": always said (Talks never lowers it), after a hit's call and before every
  other, and its Checking is not called as well. A teammate calling Contact may mark the enemy for you (35 %, a team's
  marks 12 s apart) on the callouts' own random stream, so marks change neither what is said nor how anyone plays.
- **Bots ask the nearest teammate within 30 m for a magazine, and bring one when asked (2026-10-15, MG1).** A bot
  asking a bot waits where it is while the giver comes to it; a bot asking you walks to you and waits by you. Fights and
  cover come first, then bringing one, then a squad order, then waiting for one. A bot asks again no sooner than 20 s
  after an ask ends, and an ask lapses after 15 s. The same at every difficulty, and for both teams.
- **Bots with factory magazines rarely run low, so Dev settings › Bots run low on BBs shows the bot side (2026-10-15,
  MG1).** In headless matches bots fired 15 to 61 BBs a round out of the AEG's 240, so none ran low on Normal pace, and
  only one bot-round in nine Realcap matches (30 × 3), with no teammate in reach. A bot with a Hi-Cap magazine (the
  Support kit: one 120-BB spare) is low after its first reload and asks; only the other team carries kits (your
  teammates stay plain), so you mostly hear theirs. The switch (a cheat, off) puts one bot of each team on its last
  magazine 8 s into each round, once the teams have spread out: at the whistle teammates stand within a toss, so the
  giver's walk over would not show. Smaller bot pouches or more bot fire to make it common is his call.
- **The mag calls keep the callouts' pace (2026-10-15, MG1).** "Need a mag", "Mag coming" and "Thanks for the mag" wait
  for the bot's own 4 s gap and the team's 1.5 s gap and are then said once, so a call never jumps the queue or is
  dropped for waiting. Talks never lowers the ask or the answer (like a ping's answer); it scales the thanks.

## Maps and modes

- **What no player can see is not drawn (owner, 2026-10-16, MS1).** Beyond a map's walls only what shows over them from
  a lane, a spawn or a raised floor is built: no ground, hedge or low prop out there (`render/skylineSeen.test.ts`
  fails on a skyline piece nobody sees). Look-only fixtures hung over the field (Neon Heights' wall units and cables)
  stay out of the room a player takes up, so none reads as cover a BB passes through. Woodland's bushes are small and
  decorative (0.9 to 1.25 m tall): crouch cover, never full cover, never in the way.

- **The maps' vault walls are 0.9 m, at most 0.4 m deep, open above (M102, 2026-10-13).** The top of the owner's 0.7
  to 0.9 m: over 0.85 m a plain jump rides over one time in nine (Rapier's capsule slides up the edge), over 0.9 m one
  in thirty, and nobody stands on a wall thinner than a body. Not cover: a crouched player's eyes are over it. One per
  map where it opens a route: Depot's office hall onto Container Alley (its window broken down), Woodland's cabin from
  the west (its west window), the Capsules onto Neon Heights' balcony (a window); and a sandbag wall on the range for
  the tutorial. A window keeps its lintel, so it is never vaulted: a vault needs the body's full height over the top.

- **A match is first to 5 round wins by default, with 2:30 rounds (2026-09-30).** A drawn round, such as an Elimination
  time-out, is replayed in both modes (owner default, 2026-10-04), because a draw can't decide a match. Half-time comes
  after `winsNeeded - 1` rounds, so the decider is always in the second half.
- **Teams swap ends at half-time in both modes (owner, 2026-10-03).** Maps define spawns, dead zones and lanes per end,
  not per team, so an asymmetric map is fair; in Attack / Defend the attackers always start at end 0.
- **Elimination's first end goes by team, not by the Your team pick (owner, 2026-10-12, BP3).** Alpha starts at the
  east end, which wins a little over half of bot-only rounds on Depot; a player who picks Beta starts in the west, and
  the ends swap at half-time as usual. Attack / Defend already follows the pick.
- **Attack / Defend is the flag mode, named so Capture the Flag can be its own mode later (owner, 2026-10-01).** One
  team attacks a flagpole in the other's half. Standing within 1.6 m for 5 s raises the flag; defenders at the pole pull
  it down. A raised flag wins the round for the attackers, a time-out for the defenders. If attackers are working the
  rope at the buzzer, overtime lasts at most 15 s. The pole is visual only: no collider, and BBs pass through.
- **Elimination's overtime flag: a time-out with nobody ahead puts a flag up near the middle, and the first team to
  touch it wins the round (2026-10-15, OT1, the owner's Dev 6 item 45; Claude's defaults, any can change).** "Nobody
  ahead" is every time-out under the Draw rule (now called Overtime flag) and a level one under More players left. The
  flag stands at the map's `overtimeFlag` spot, which each end reaches about equally fast (within 15 %, a map check):
  Depot in front of the Main Gate (30 m from each end), Woodland in the east meadow (58 m), Neon Heights on Neon Avenue
  (29 m). A touch is a hand on it, no hold: anyone in play within 1 m of its foot, on its floor (`OVERTIME`); both teams
  at it hold each other off. A wipe-out still wins at once. Untouched after 30 s (Woodland's walk is 14 s at a run),
  the time-out rule decides, a draw played again by default; never in Attack / Defend or Extraction, and a map with no
  spot plays as before. Bots go for it after a reaction that scales with the level (Easy 1.2 to 2.4 s, Normal 0.5 to
  1.2, Hard 0.3 to 0.7, Pro 0.2 to 0.5); anchors watch it from cover for 12 s first and careful bots for 5 (bots.md ›
  Habits), unless last of their team or with 10 s left; a flanker may go round the side. The Rules picker's old
  Overtime row (win by two) is now called Win by two.
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
  under 141 m. Its starts are hidden from each other: nobody within 8 m of one camp's spawns sees anyone within 8 m of
  the other's, and the east end stands at most 2 m above the west at the start (owner's note 13, 2026-10-06; M88, the
  West Rise; tested in `map/woodland.test.ts`).
- **Neon Heights is the third field: a vertical futuristic city with Day and Night (owner, 2026-10-04).** The concept
  was approved with all twelve defaults: 46 × 30 m, three playable floors, roofs not playable, stairs only, open windows
  with a 1.2 m sill, 4v4, both modes and Night first.
- **Team size belongs to the map: picking a map sets its standard size, and the Match pop-up offers up to the map's
  spawns (owner default, 2026-10-04).**
- **Bushes hide you and stop BBs, but not people: a BB stops 0.6 m into the leaves, and one through an edge flies on,
  thrown off and slowed (2026-10-15, FO1, the owner's Dev 6 item 44; Claude's defaults, any can change; replaces
  "Bushes hide but BBs pass", owner 2026-10-04).** Whoever is more than 0.6 m inside or behind a bush is still hidden
  from bots, and the same 0.6 m of leaves, counted over a BB's whole flight, stops it (a test holds the two equal): if
  you can't see through it, a BB can't get through it. A BB that crosses less comes out off its line by up to 0.5 rad a
  metre of leaves and keeps 0.35 of its speed and spin a metre, so a shot through a bush's edge is a gamble. Someone at
  a bush's edge, less than 0.6 m in, can still be hit. People walk through bushes as before. A BB into leaves rustles
  and knocks out a few leaves; firing from deep inside one says "Leaves in the way". The numbers are in
  `config/ballistics.ts` (`leaves`). Woodland has the bushes; Neon Heights' planters were always solid and only sound
  and look like leaves where a BB lands in their tops; Depot has no plants.
- **The practice range is its own small map (2026-10-04).** Practice is the last mode on the Match screen, and the
  Tutorial shows on the title screen only on a clean save, with Replay tutorial in Settings (owner, 2026-10-07; replaces
  his 2026-10-04 rulings that put the range and an always-shown Tutorial button on the title screen).
- **Practice's moving targets and timed challenge (2026-10-13, M93, the owner's playtest note 10; Claude's defaults,
  the owner may change any).** The range adds two figures on rails, a swinging plate, four small plates at 15 m and
  four pop-ups (one crouched), each placed where nothing hides it from the spawn, moving or not (a test checks it).
  Targets are placed from data with a facing (`RangeTargetSpec`), so a map can place them too (M94). The timed
  challenge is off by default and switched in Practice's pause menu (saved): a START plate stands near the line; shoot
  it, wait out a 3 s countdown, then hit as many orange-lit targets as you can in 60 s, two lit at a time, each for
  3 s plus 0.04 s a metre (`RANGE_CHALLENGE`). The score is lit targets hit; the best is kept in the records per
  course (`bestChallenge.range`), and the Tutorial never offers it. A run with a Dev setting that changes play on at
  any point from the START plate (Game speed, Bottomless magazines: `devCheating`) is never a best and says "not kept
  (Dev settings)", as such a match goes into no records (BP5).
- **A map's checks measure it against Depot (2026-10-11, CT2; the standard is the owner's, 2026-10-05).** The numbers are
  `MAP_STANDARD` and `MAP_BALANCE_BANDS` (`src/config/contentRules.ts`): 3 lanes (2 a look, 1 a fail), the longest
  clear sightline 34 m, spawn yards 5 m round, each end's walk to the middle of the walkable ground within 15 % (25 % a
  look). The flag is not held to 15 %: the attackers walk at least 1.6 times the defenders' way, Depot's own rule. Bots
  that never leave spawn under 1 in 20, stuck under 1 per 10 bot-minutes. A map that differs for a reason goes into
  `MAP_EXCEPTIONS` with the owner's word, as Woodland's 141 m sightline and Neon Heights's four block clashes did.
- **A mode's checks hold it to Elimination's numbers (2026-10-11, CT3; the bands are the owner's, 2026-10-05).** A new
  mode does not build until every wiring point answers for it (a `switch` with a never-check), and the briefing and
  round banner must not say what Elimination says. Its bots must play it their own way: from the same start they stand
  at least 1 m on average from where they stand in Elimination after 30 s. The objective decides at least 1 decided
  round in 10, and the pay a minute in the standard match stays within × 0.75 to × 1.25 of Elimination's on the same
  map, lighting and level (`MODE_PLAY_TEST`, `MODE_BALANCE_BANDS`). A mode drawn like another may let that mode's perf
  gate runs stand for it, with a reason (`MODE_PERF_STAND_INS`: Attack / Defend is Elimination with a flagpole). Ids in
  players' saves are pinned in `SHIPPED_MODE_IDS`.
- **A skin's checks (2026-10-11, CT4; Claude's defaults, the owner may change any).** A skin is a replica colour scheme
  and fits every replica that takes one (the Cyber Pistol keeps its own). The numbers are `SKIN_RULES`: its colours
  cover at least 60 % of the replica; a colour counts at a distance when it is 10 % of a bot figure's replica; the
  orange tip stands at least 20 apart in colour (CIEDE2000) from what is around it, and closer is a look, not a fail;
  a skin blends into a map within 10 of its common colours (5 % of the surface or more, as painted before light), a
  look only when bots carry it. A colour reading as a team's needs a reason in `TEAM_COLOUR_SKINS`: Cobalt, Signal and
  Coral are the bots' own team colours, and Hazard (orange, players only) stays as it was before the toolkit. A dev
  skin (`tag: 'dev'`) shows in Customise only with Dev content on, and a saved pick of it plays as the default
  without. "Nothing that decides play reads a skin" is proved over the imports of the sim, bots, physics, nav and the
  kit's numbers: only names that pass a scheme's id along may reach them.
- **Practice plays on the range or any map, its place picked apart from the match's map (2026-10-13, M94; the owner's
  playtest note 11).** On a map there are no bots: targets stand where the other team's bots would play, read from the
  map's own data (lane points, points along the lanes' long legs, the other team's starts, Extraction's home starts,
  the overlooks), so a new map gets them with no extra work. They are the range's kinds (M93's), picked by why a bot
  is there: behind low cover a crouched figure or pop-up, at an overlook a pop-up, on a lane's leg a slider, the rest
  standing figures (half of them moving) with every third one steel. A map has its own timed challenge best, its START
  plate a few steps in front of where you start (you face it), and a run lights only targets in your sight within 50 m,
  so it is played moving up through the map. The pick is saved as `practicePlace`; a dev map plays as the range while
  Dev content is off. The range's card reads "Range", the mode "Practice".

## Replicas, Loadout and levels

- **The next replica is a spring sniper rifle, and the owner is asked how to build it and its specs before work starts
  (owner, 2026-10-06).** The SMG and shotgun come after it.
- **The Cyber Pistol is the owner's own design and the level cap's reward (owner, 2026-10-04; level 10 since
  2026-10-13).** It stays inside the pistol class's 1.0 J chrono limit: rifle power with pistol handling, the tightest
  spread and almost no kick. Hard and Pro opponents now and then carry it once you have it. It borrows its colours from his photo (mint, hot pink, black), never
  its logo, lettering or outline (CLAUDE.md §4).
- **The AEG Rifle's redesign (owner, 2026-10-12).** Its long slotted handguard, collapsible stock, pistol grip and
  magazine come from his seven reference photos, with no text or logo copied (RM6). Small, minimal iron sights that are
  not tall or obstructive: a ring aperture and a post on one line 1.45 cm over the rail, on the model file and the
  built-in rifle alike. It keeps the old length, grip, magazine, rails and mounts, so every animation, attachment, hand
  pose and figure still fits.
- **The Loadout and the Armory open only between matches, never from the pause menu (owner, 2026-10-03: "I don't want it in
  the pause menu").** The practice range's pause menu offers the Loadout, because a range has no match.
- **Five saved loadouts, and the one carried follows your edits (2026-10-13, SL1; the count is Claude's default, one
  number in `config/savedLoadouts.ts`).** Every change on the Loadout and in Customise goes to the current saved
  loadout, so there is no Save button and nothing to lose; Replace copies the one carried over another. Gear a saved
  loadout holds that isn't available now stays picked: it plays as the default, shows as locked (with the level that
  unlocks it, LV1), and comes back with the gear. Availability is the Loadout's own ownership check, so unlocks of any
  kind work the same. Disable levelling keeps a set of its own, as it keeps its own picks.
- **`pool.md` (what exists: IDs, tags, Extraction's cases), `stats.md` (how it shoots) and `levels.md` (what each
  level unlocks, and the XP) are hand-edited data the game reads (owner's picks, 2026-10-04; levels.md 2026-10-13).** A row the game can't read is skipped with a warning and fails its test. Item IDs
  are six digits, in the order assets are added; they are permanent and only added to. Tags (`gas`, `top-rail`) decide
  what fits.
- **No rarity tiers: every item is one item, with one set of numbers (owner, 2026-10-13: "Good choice with removing
  rarities. Make sure weapons are rebalanced spec wise").** The rebalance: the Cyber Pistol keeps the numbers it had at
  Legendary, so it plays as before; the AEG Rifle and GBB Pistol were tuned at Common and stay; the Low-Cap Magazine
  carries two more (180 BBs) and changes and draws quicker, since 150 BBs for a quicker change alone helped nobody; the
  Long Barrel adds 10 % energy and groups 10 % tighter, the reach pick of level 9 where it was the Tight-Bore's weaker
  twin. Hard and Pro bots lose the small tier bonus their rolled kits had.
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
- **The Loadout and Customise offer what you have unlocked, and show what is still to unlock greyed, with the level
  that unlocks it (2026-10-13).** A new unlock is never fitted for you (owner, 2026-10-04). The Armory shows the whole
  track.
- **Levels (owner, 2026-10-13).** Everyone starts at level 0 with the GBB Pistol, the AEG Rifle and their power
  sources; the cap is 10, with the Cyber Pistol at the top. `levels.md` lists what each level unlocks, by name, for the
  owner to edit. The cap goes up by adding rows under the last, with new content in them (replicas, attachments, skins).
  Unlocks are never taken away: an item moved up stays with whoever has it, one moved down reaches everyone past it.
- **XP numbers live in `levels.md` for the owner to tune (2026-10-13, carrying the Field Credits rules of 2026-10-04).**
  XP for a match played, a match won, each round won and each hit, scaled by match length and multiplied by the lower
  of the opponents' and teammates' difficulty (custom rules at most ×1.5). Every match gives XP, except the range, the
  tutorial and any match using dev content or a cheat. The pace: about 250 XP a Normal match, level 10 after about 25.
- **The Armory is where you see your level (owner, 2026-10-13).** Your level and XP, what the next level unlocks, and
  every level with its items. It stays on the top bar; the level badge beside the places opens it too.
- **Disable levelling is a Dev switch (owner, 2026-10-13).** It unlocks everything for the Loadout without touching
  your level, and counts as a cheat: no XP, and the match stays out of the records. The Dev tab's XP buttons (+500 XP,
  Level up, Reset level) test the levels. Disable Armory went with the gacha.
- **Old Armory items, Field Credits and Tokens don't carry over (said to the owner, 2026-10-13).** Everyone starts the
  levels at level 0; a save file from before loads at level 0 with its settings and records.
- **The Cyber Pistol's redesign (owner, 2026-10-12).** Its shape comes from his three reference pictures, with no logo
  or lettering copied (RM5). Small, subtle iron sights: a notch and a post. The grip joins the fixed frame. On a shot
  only the dark grey slide kicks back and returns, though the replica is electric; the light grey shell and the
  muzzle block never move. It stays compatible with every animation, attachment and figure.
- **The Gas Pistol becomes the GBB Pistol, a blowback replica with the same numbers (owner, 2026-10-12).** Redesigned
  from his six reference photos of a polymer pistol, with no logo, lettering or exact copy (RM7): a slimmer slide flush
  with the frame, the ejection port further back, the trigger guard one piece with the frame, a shorter grip and small
  low sights. Its slide kicks back over the still barrel on every shot and stays locked back on an empty magazine until
  a reload (0.1 Dev 6 feature 14).
- **In Practice you change gear from play, and it is your one loadout (2026-10-13, M95).** The Loadout key (L, its own
  binding) opens the Loadout there on the slot in your hands; L again or Back to practice returns you where you stood,
  the new replica coming up. In a match the key does nothing. What you pick or customise in Practice is your loadout for
  matches too, so a replica tuned at the range goes into the next match, as at a real site; with Disable levelling on
  the picks are the sandboxed ones (M26d), and your own come back when it is off. The owner can rule for a separate
  practice loadout instead.
- **Aiming down the 2x scope looks like the red dot: the replica stays in view and the world shows round it (owner,
  2026-10-13, Dev 5 playtest note 5).** The whole view zooms 2× (as before) and the scope's rear glass shows the world
  (`render/eyepiece.ts`), with a fine crosshair and red dot over it; the dark surround that hid everything outside the
  eyepiece (M17b) is gone, so the scope's cost is its slower raise alone. Each glass reads as glass over black at the
  hip (a dark core in both scopes, note 6).

## Menus, HUD, settings and accessibility

- **Settings after the Dev 6 playtest (owner, 2026-10-16; ST1).** The groups run Display, Graphics, Gameplay, Looks,
  Audio, Controls, Accessibility, Save file, Dev, and Settings opens on Display. New defaults: sound cues red,
  scoreboard 100 %, aim Toggle, crouch Hold, volumes master 100 %, effects 80 %, power source 100 %, ambience 60 %,
  interface 50 %; a save that picked otherwise keeps its pick. The Retro look is a Dev setting again (it shows only
  while the Dev box is ticked), Realistic colours leaves Settings for the Loadout's Colour tab (MR1), and the Voices
  (hit calls) placeholder is gone. The top bar's level reads "LVL 3".
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
- **The minimap names the area you stand in, top left on the map (2026-10-13, CL1).** The same names the bots call, so
  "Contact, Dock!" means something by the second round. Every walkable spot on a map is in a named area.
- **Ping is the middle mouse button, and Settings › HUD › Ping markers is On by default (2026-10-15, PG1).** One ping
  each, 8 s on screen with its distance, on the minimap too; a contact is a diamond in the other team's colour, so it
  reads without colour. Off hides the markers only: pings still reach your teammates and are answered. With Callouts
  off, teammates mark nothing (a mark goes with its call).
- **The order wheel is on Z (owner, 2026-10-04); Hold here is X, Regroup is V and Follow me is F.** Orders end when the
  player who gave them is hit and at each round start. A teammate's radio double-click confirms an order.
- **Asking for a magazine is H and the order wheel's fifth item, Need a Mag (2026-10-15, MG1).** One press does what
  fits now: toss one to the nearest teammate asking you if they are in reach, else ask if you are low, else say why
  not. While a toss is in reach the item reads Toss a Mag. Five items sit 72° apart, Need a Mag upper left; the wheel's
  radius is unchanged. H was unbound; it is rebindable like every order.
- **Settings › HUD › Mag hand-off is On by default (2026-10-15, MG1).** One line under the crosshair (who needs one and
  how far, whose is on its way, a toss you can make underlined in your team's colour, a 5 s hint to ask each time you
  run low) and a "· mag" tag on the teammate's name. The line gives way to the open order wheel, whose Mag item says the
  same. Off hides the line and tags only; the key and the bots' calls still work.
- **Settings › Gameplay › HUD › Ammo counter is On by default; Off hides the BB counts, not the magazines (2026-10-15,
  AC1, Dev 6 item 46).** Off takes away the loaded count and the "/ N · M spare" line; each spare magazine keeps its
  bar, full while it holds any BBs and hollow once empty, with no fill level, low stripes or mark on the next one: on a
  field you feel how many magazines your pouches hold and which are empty, never how full. That hollow bar is the only
  "magazine changed" cue kept; the reload bar, the Empty, Last magazine and Out of BBs lines, the dry-fire click and
  the Mag key's Low on BBs hint stay, so the game stays playable. A caught magazine's notice drops its BB count. It
  applies in matches, Practice and the tutorial, whose Reload step then says to keep count yourself. No mag-check key
  (owner, 2026-10-06).
- **Key bindings: a key belongs to one action, and taking a used key swaps the two (2026-09-30).** Esc, F5, F11, F12,
  the browser navigation keys, PrintScreen, Pause and the debug keys (backtick, F3 and ]) can't be bound. Fire and the
  four move keys can never be left keyless.
- **Esc while you are out skips the round at once, with no pause menu (owner, 2026-10-13, Dev 5 playtest note 10).**
  The browser takes the mouse back on Esc, so the game holds after the skip with "Click to play · Esc for the menu": a
  click plays on, Esc again opens the pause menu. Its Skip button stays.
- **The hit marker is a bold red X with its own settings, still off by default (owner, 2026-10-13, Dev 5 playtest
  note 4).** Settings › Gameplay › Crosshair: on or off, scale, thickness, outline and colour (red unless changed; blue
  and orange left out as the teams'). Whether it starts on is his call.
- **The menus are compact, to concepts the owner approved (owner, 2026-10-16, Dev 6 playtest items 9 to 21; MR1).**
  Match, Loadout, Customise and the Armory use the 15 px step for small text and 32 to 40 px controls; the top bar and
  Settings keep their sizes. A mode is offered only on a map that hosts it, and a rule the mode doesn't read is hidden.
  The realistic colours are picked per replica in Customise › Colour. Saved loadouts are a dropdown.
- **Another UI redesign is planned for later, its version not set (owner, 2026-10-13).** Maybe a future Dev release,
  maybe after 1.0; parked in `docs/IDEAS.md` until he places it, with no redesign work before.
- **A Visual redesign, an Audio redesign and a Performance update are also planned for later, their versions not set
  (owner, 2026-10-16).** He asked for them to be logged next to the UI redesign, timing undecided; parked in
  `docs/IDEAS.md` until he places them, with no work before.

## Audio

- **Every sound is a recipe synthesised in code and rendered once into buffers (2026-10-03).** Replicas sound like toys:
  mechanical and plasticky. CC0 samples may be added where synthesis falls short (owner, 2026-10-03), each recorded in
  `docs/ASSETS.md`.
- **A replica's shot follows its power source: electric, gas or spring (owner, 2026-10-03).** Impactful, but still an
  airsoft replica. An empty AEG still cycles; an empty gas pistol only clicks.
- **Footsteps are information, so gameplay audio comes first (owner rule, 2026-10-05).** Every ground's step stays
  within 1.5 dB of concrete overall and within 3 dB in the 0.7 to 4 kHz band, so a soft ground never hides anyone. Bots'
  hearing was surface-blind until NP1 made gravel and steel plate carry further (Gameplay and feel); the step sounds
  themselves are unchanged.
- **A field's ambience is map data, with a day and a night variant picked by the lighting preset, never a map name
  (owner rule, 2026-10-05).** Calls are no louder than a bird and beds no louder than the yard's, with no more in the
  footstep band than Depot's bed (tested).
- **Every existing cue buffer is pinned by a fingerprint (2026-10-05).** Changing one needs a decision line; the one
  exception so far is trimming the silent tails (owner decision 19).
- **Sound memory is budgeted: about 7 MB per field beyond the title bank, and 12 MB for every map sound together
  (2026-10-05).**
- **Shots are louder and a replica's power source has its own slider (owner, 2026-10-13, Dev 5 playtest note 2).** Each
  shot's power-source layers (an AEG's motor and gears, the gas pop and hiss, the spring's twang) play as their own
  buffer, at Settings › Audio › Power source volume (under Effects), with the motor's wind-up and wind-down. Shots went
  from 1 to 1.4 (+2.9 dB), the power part plays at 1.4 and the motor at 1.1 (from 0.8); footsteps went up 1 dB (0.54)
  so a bot's sprint is still heard against your own shot (audit CORE-26). The three shot fingerprints changed for the
  split; every other cue's buffer is the same.

## Save and settings storage

- **Save keys and fields are permanent and only added to (2026-10-04).** Settings live in one versioned object,
  `airsoft.settings`; the level progress (`airsoft.progress`), the records (`airsoft.records`), the saved loadouts
  (`airsoft.loadouts`, SL1) and the key bindings keep their own keys. A rename or retype is a migration step. Progress
  is not a setting.
- **A save is readable JSON with the stores as stored; an integer `SAVE_FORMAT` drives migrations (2026-10-04).** A
  store's version can't change without it (a test fails). Every store keeps fields it doesn't know. A format newer than
  the build is refused, and a store written by a newer build is never read or overwritten.
- **Loading replaces the whole save, with no merging (2026-10-04).** A side-by-side check comes first, the replaced save
  is kept for Undo, and the page reloads. A SHA-256 checksum is checked in code; there is no signature. Three restore
  points are kept, one per day the game opens.
- **One tab plays at a time (2026-10-04).** An exclusive Web Lock, with BroadcastChannel as fallback; Play here hands
  over. Two tabs could otherwise write over each other's XP.
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
- **A match that uses dev content stays out of the records and gives no XP (owner kept the defaults, 2026-10-04).**
  Dev gear is offered at its level only with the switch on (try it with Disable levelling). Bots carry it only with
  the switch on. Unlocked dev gear stays in the save, hidden, and a dev pick plays as the default until the switch is back on. A match
  counts as using dev content when an opponent's kit could hold dev gear (BG1: a kit in `bot-kits.md` the difficulty
  weights).
- **Woodland and Neon Heights stay dev content until the owner has playtested them; he makes each public himself (owner,
  2026-10-05, 07:04).** Woodland was dev from the start (owner, 2026-10-04, 18:10: "until the map is complete and I say
  so, this map is not accessible"). Its weapon torch stays dev until Woodland is public (owner, 2026-10-04, 18:56).
- **Dev settings apply only while their box is ticked (owner asked, 2026-10-04).** Game speed, Bottomless magazines,
  Ghost and Disable levelling keep a match out of the records and give no XP, for the rest of that match. Debug info, BB paths
  and Retro pixels change only what you see. One click reaches them and one click puts everything back.
- **New replicas and parts go through the content toolkit (owner approved the concept with all eight defaults,
  2026-10-05).** `node pipeline/content-check.mjs` checks them (`docs/content/README.md`). A fail blocks going public;
  a warning needs the owner's OK. A new item's team wins 40 to 60 % of decided rounds, judged on public maps, modes and
  levels only. An item allowed stronger, a part better at everything, a number outside its range and a balance
  override each go into their register in `src/config/contentRules.ts` only on the owner's word, an override's reason
  also here. The ranges, budgets and band there change only on his word too.
- **What shipped before the toolkit stays as it is (owner, 2026-10-11).** Every public item is registered as public
  "before the toolkit". The 11.1 V LiPo Battery keeps its faster fire with no number made worse ("leave it for now"):
  its cost is that it empties a magazine sooner and is found only in Shots. A downside is a possible later change
  (`docs/IDEAS.md` › Maybe).

## Performance budgets and technical foundations

- **No ray or path tracing; the game keeps its current lighting (owner, 2026-10-11).** A Dev switch for ray traced
  light (RT1) was built and shown, then scrapped as too much work for what it adds. Its code is archived as a git
  bundle in the project's shared files (`archive/ray-tracing/`), not in the repository.
- **The Low preset must hold 60 fps on modern low-powered hardware (owner, 2026-10-04; restated 2026-10-16).** The
  absolute lowest settings are the floor. `pipeline/perf-budget.json`, measured on the
  owner's laptop: p95 ≤ 14 ms and p99 ≤ 20 ms; Low draw calls ≤ 100 and triangles ≤ 150k; GPU memory ≤ 300 MB; heap
  growth ≤ 5 MB over 60 s; nothing more than 10 % worse than the baseline. His ceilings of 150 draw calls and 250k
  triangles stay on High. Dynamic resolution scaling is not in the budget (owner: no). Raising any line needs a decision
  line.
- **Maxed-out settings target a PC built for 4K at 240 Hz (owner, 2026-10-16).** His own desktop is the reference: a
  Ryzen 9 9950X3D, 64 GB DDR5 and an RTX 5090 with 32 GB. Ultra at 3840×2160 aims for a 240 Hz frame (about 4.2 ms).
  The desktop run's frame times stay reported, not judged, until task PF3 sets the line in `pipeline/perf-budget.json`
  from his desktop baseline. Low's 60 fps floor above is unchanged.
- **Medium has map-scoped draw-call lines: Woodland 120 and Neon Heights 145 (owner, 2026-10-11, W6a; 115 and 140
  since 2026-10-06, audit decision 4).** The other Medium lines (200k triangles, memory, heap) and every Low line stay
  the presets'. Raised on the owner's card ("Raise a little"): with the old renderer gone, Woodland's GPU grass and
  stand-ins cost 2 draws on Medium, and the built-in models back since RM4 about 5 on every map (Woodland Extraction
  Medium 115.3 on WebGL2 and 116.5 on WebGPU; Neon Heights Extraction Medium 142 on WebGPU; main on the old renderer
  113.3). The Woodland 5v5 spin check (`e2e/woodland.spec.ts`) goes from 135 to 140 with it.
- **The GPU dressing's triangles have a line of their own; the scene keeps the owner's (2026-10-11, W6a).** Three counts
  Woodland's grass and tree stand-ins at their caps (every blade slot, whatever the GPU cull keeps), which put Woodland's
  node renderer at about 261k triangles on Medium against 200k, 375k on High and 637k on Ultra against 250k. The perf
  harness records them apart (`dressingTriangles`), each preset's line being its caps plus 2 % (Medium 130k, High 290k,
  Ultra 495k, Low 0); `triangles` is the rest of the scene and keeps its lines (Woodland Extraction Medium on WebGPU:
  132k, max 140k, against 200k). No line was raised. Both back ends hold the same lines (`backends` is empty).
- **Real light counts per quality are fixed: Low none, Medium 2, High 4 (owner rule, 2026-10-04).** Three.js rebuilds
  every lit shader when the count changes. Low holds 60 fps with no real lights.
- **Frame times are judged only on hardware rendering (2026-10-04).** The cloud container draws with SwiftShader, so
  there the gate judges counts, memory and the relative check. The perf gate runs a matrix of maps and modes, a
  combination only when the diff reaches it; baselines are reset in the pull request that changes what they measure
  (2026-10-05).
- **High and Ultra draw the city's flat finishes at 512², as Medium does (owner, 2026-10-05, audit decision 9; M78).**
  Plaster, cladding, asphalt, paving and glass (`SURFACES.maxSize`) gain nothing from 1024² but four times the memory;
  every other surface follows the quality's Texture detail. Ultra is capped too, as the drawings are the same. Neon
  Heights High holds 21 MB less (112.4 → 91.4 MB; the owner accepted 21 MB, 2026-10-08); the audit's ~28 MB counted
  the 1024² maps' whole size, not the difference. Screenshots match at play distances; pressed against a plaster wall
  its finest grain is a touch softer.
- **Chunk size budgets fail the build on CI, and growth is a deliberate bump with a decision line (2026-10-04).** The
  game chunk's default is 1,050 kB (warning from 90 %); Rapier's chunk has 236 kB and its `.wasm` 3,240 kB, each its
  measured size plus 5 % (IM3, 2026-10-12; 4,550 kB for the chunk with the WebAssembly inside before). Bumped from
  1,000 kB on 2026-10-11 (M80, M82): main's game chunk was 993.5 kB, and the tutorial's showcase and finish pop-up and the rarity bar made it 1,003.2.
  Bumped from 950 kB on 2026-10-10 (FP1):
  main's game chunk was 950.2 kB after G11 and G12, already over, and FP1's hand holds made it 951.1 (950.3 once W4
  moved WebGL's retro filter to a chunk of its own); the WebGPU overhaul's step 6 (the old renderer removed) is where it
  should shrink again. W6a (2026-10-11) took it from 1,007.1 to 982 kB (946 kB before main's M80, M82 and RM4), and
  W6b (2026-10-11, the world's GLSL patches gone) to 975 kB, so the line is back at 1,000 kB (warning from 900): a
  change that crosses it bumps it with a line here. Raised to 1,250 kB on 2026-10-12 (owner, IM1): main's start-up
  code was 990 kB (the game chunk 964, and 26 kB the bundler had split beside it since BF1's figures); the code fetched
  on first use (below) took it to 897 kB (72 %), and the owner asked why 1,000 and agreed 1,250 for room in Dev 6, a
  tripwire still (compressed, the chunk is about a third of its size). Since IM1 the game chunk is the `game` group
  (`vite.config.ts`: every module `main.ts` reaches by static imports), so all start-up code is counted in one chunk.
- **Menus stay smooth; what a menu opens is fetched on first use (owner, 2026-10-12; IM1).** "The UI should always
  feel smooth and responsive. However, for entering tutorial, practice range, maps, matches you can add a loading
  screen if it helps." The Loadout (with Customise), the Armory and Settings (`ui/menus/lazyScreens.ts`) and the
  practice range with the tutorial (`rangeSession.ts`) are fetched the first time they are needed and preloaded in the
  background once the title is up (`core/onDemand.ts`), so a menu never waits visibly; entering the range may wait for
  its code with the start of play. A new screen reached only from a menu joins `lazyScreens.ts`; one on the way to
  play (the title, the Match screen, pause, the summary and result) stays in the start-up code.
- **Production builds ship Brotli and gzip copies of their files (owner, 2026-10-04: Brotli now, `.wasm` later).**
- **Rapier's WebAssembly ships as a plain `.wasm` file, not as base64 inside its chunk (owner, 2026-10-12, IM3; changes
  the fixed decision in CLAUDE.md §3).** The build rewrites the one call where the compat bundle's `init()` decodes its
  inlined copy, so it fetches the package's own `rapier_wasm3d_bg.wasm` instead (`src/config/rapierWasm.ts`): the
  package, its API and every test stay the same, and the browser compiles the file as it streams in. The physics
  download falls from 4,335 kB (1,196 kB Brotli) to 225 + 3,082 kB (32 + 852 kB Brotli). A Rapier upgrade whose bundle
  no longer has that call fails the build rather than shipping the base64 again. The dev server and Vitest keep the
  inlined copy, where size doesn't matter.
- **Level blocks collide as closed triangle meshes with `FIX_INTERNAL_EDGES`, not cuboids (2026-09-28).** Rapier's
  capsule controller sinks into any cuboid along its diagonals, and without the flag face-diagonal edges give ghost
  contacts.
- **Only the ground probe decides "grounded" (2026-09-28).** The controller reports ground when the capsule's rounded
  bottom touches the top edge of cover, which let players hang on and hop over 1 m barriers.
- **A character still exactly where the last ground probe set it down is not probed again (2026-10-08, M77, audit
  SIM-06).** The level never moves, so the answer is "at rest": about 40 % of probes in a match, where a fresh cast
  would move the character by its tolerance (2 µm on average). The controller's own "grounded" was not used as the
  shortcut: the probe still moves a controller-grounded character by up to 4 cm on slopes.
- **Per-tick and per-frame paths take lengths with `length3` (`sim/vec.ts`) or `Math.sqrt`, never a three-argument
  `Math.hypot` (2026-10-08, M77, audit SIM-07, REN-10).** It makes garbage on every call until V8 optimises the
  caller and isn't rounded alike in every browser; `Math.sqrt` is exact everywhere. Build-time code may keep it.
- **Characters don't collide with each other in Rapier (2026-09-28).** The simulation handles spacing (bots steer apart)
  and BB hits, which keeps physics simple and deterministic.
- **Bot navigation is a 0.2 m grid built from the map's blocks, with one node per floor, not recast (2026-09-30).** Maps
  are box-built, so a grid is exact, has no dependency and needs no authoring. CLAUDE.md §3 allowed either.
- **An error in the game loop stops the loop for good and shows a "Something went wrong" pane with a copyable report
  (2026-10-04).** A half-stepped simulation can't be trusted, so there is no resume.
- **`?nolock` and `?script=perf` exist only on the dev server and the e2e build (2026-09-28, 2026-10-04).** A release
  build compiles `?nolock` away.
- **A new random feature draws from its own seeded stream, never the simulation's (2026-10-04).** Wind, the bots'
  kits (BG1), Extraction cases and presentation effects each have one, so seeds that already replay still replay.
- **Player-only preferences, such as toggles, live in the input layer (2026-10-03).** The simulation sees the same
  command it sees from a bot.
- **TypeScript 7 checks the code, on the same strict settings (owner, 2026-10-12; IM4).** It replaces 5.9, kept on
  2026-09-28 because 7 was then new. Same language and errors, on the native compiler: in a 4-core cloud container the
  type check takes about 3.5 s instead of 18.7 s, and `npm run build` 19.4 s instead of 34.5 s (2026-10-12). Nothing
  in the repository uses the compiler's JavaScript API, which 7 replaces with a new, unstable one (Vite and Vitest
  strip types themselves). A setting a later TypeScript drops goes to the owner, never a looser `tsconfig.json`.
