# Decisions

The owner's rulings and the project-wide decisions still in force. Every task must respect them: if one has to change,
ask the owner first, then replace its line.

A task's own tuning values and small defaults don't go here; they go in its record, `docs/records/<id>.md`. History
before 2026-10-08 is in `docs/archive/0.1-dev/DECISIONS.md`. Rulings cut to their decision on 2026-10-17 keep their full
wording, with the reason and the numbers, in `docs/archive/0.1-beta/DECISIONS.md`: grep it for the reason behind a value.

Line format: `- **What was decided (owner, 2026-10-07).** Why, or the detail that matters.` A decision that wasn't the
owner's carries only its date: `(2026-10-04)`. A new line goes at the end of its section. A ruling that replaces another
replaces its line; the old one stays findable in the archive or in git. Keep a line to its decision and the detail that
binds; the rest goes in the task's record. When this file nears 50 KB, move superseded rulings to the archive.

## Product and scope

- **Single-player against bots only: no multiplayer, networking, servers or matchmaking (owner, 2026-09-30; confirmed
  2026-10-03, "absolutely none").** The simulation stays command-driven and deterministic, so it stays testable.
- **Design rules (owner, 2026-10-01).** Movement and positioning matter more than weapon stats. Replicas differ
  mechanically (loading, cycling, sound, handling), never in damage: one hit is one hit. Every field is built to a
  checklist: cover, barricades, buildings, windows, doorways, choke points, flanking routes, objectives, dead zones and
  spawn areas.
- **Progression is levels: matches give XP, and each level unlocks replicas and gear for good (owner, 2026-10-13).**
  Parts are trade-offs, never a damage upgrade.
- **Friendly hits count (2026-09-30).** Custom matches can switch it off (`HITS.friendlyFire`).
- **Public in 0.1: Depot's modes, Easy to Hard, Woodland and Pro (owner, 2026-10-05).** Every public map, mode and
  difficulty multiplies beta's work. Neon Heights stays dev until the Maps Update and Extraction until the Modes Update
  (`docs/ROADMAP.md`).
- **Cut features (owner, 2026-10-05).** Supply weekends and dated events; the Tone mapping choice; tracer BBs as an
  option (glowing BBs do it); Bomb and Intel grab; Free-for-all and the overshooting rule; cosmetic gear as its own
  system; a separate progression plan.
- **Kept features (owner, 2026-10-05).** Grenades (Replica Update) and skins (Progression Update), with greyed Loadout
  placeholders; suppressor sounds (Replica Update); Capture the Flag as a possible Modes Update mode. The content that
  left Dev 6 was placed by the owner (optics, sniper) and Claude (the rest, list in `docs/ROADMAP.md`); he can move any.
- **Extraction (Modes Update): solo against bots, more and more aggressive opponents, quicker and closer waves, a
  longer extract timer and no respawn (owner, 2026-10-06).**
- **Battle royale (Modes Update, dev first) is an experimental dev mode, the exception to the Free-for-all cut (owner,
  2026-10-06).** His answers on loot, zone and pay: `docs/archive/0.1-dev/ROADMAP.md`, Dev 4 playtest table.
- **The code is MIT-licensed, copyright "ggbillyjoe3526" (owner, 2026-10-05).** Third-party assets keep their own
  licences (`docs/ASSETS.md`).
- **Libraries, tools and assets follow `docs/ASSETS.md` › Adding a library or tool, and never anything on its Do not
  use list (owner, 2026-10-18).** Every build ships `third-party-licences.txt`, linked from the title (LC1).
- **The game moves from the browser to an installable desktop game built with Godot and Blender, in a new repository
  (owner, 2026-10-18).** The same game, not a sequel; a new repository rather than a fork. Design, rulings, data,
  layouts, models and the gameplay code as a reference carry over: `docs/handover/` is the pack the new project starts
  from.

## Versions, releases and branches

- **Names read "0.1 Dev 5" and "0.1 Beta 1" with no "v"; tags are `0.1-dev.5`, `0.1-beta.1`, `0.1.0` (owner,
  2026-10-05).** A GitHub release is titled "Airsoft 0.1 Dev N". Policy: `docs/PROCESS.md`.
- **The number is the product, the stage its state (owner, 2026-10-01).** Everything up to the first feature-complete
  game is 0.1: Dev builds, then Beta builds, then 0.1.0 as the first stable public release. Never move to 0.2 because
  a phase ends.
- **Dev builds continue until the owner calls the game feature complete; Beta then adds no features (owner,
  2026-10-06).** Beta is fixes, QoL, balance, refinement and polish.
- **0.1 Beta 1 has begun and carries the owner's Dev 6 playtest list (owner, 2026-10-16).** His 34 items include a few
  small additions (an in-match hop-up control, a home-screen fullscreen button, one feed with a placement setting, WON
  or LOST at a round's end) and removals (resting on cover, Voices, the Skins option). Each is a block in
  `docs/TASKS.md`.
- **0.1 Beta 1 is this repository's last build (owner, 2026-10-18).** Once he tags `0.1-beta.1`, nothing more is
  built here; the repository stays frozen at the tag as the reference for the Godot project.
- **The Godot project's versions restart at 0.1 Dev 1, in this format (owner, 2026-10-18).** Its first build is tagged
  `0.1-dev.1`; this repository's tags stay the browser game's history (`docs/handover/VERSIONING.md`).
- **Only full releases are tagged, and only the owner creates tags (owner, 2026-10-01).** After he tags, the release
  checklist is due in the next pull request (owner, 2026-10-03): `docs/PROCESS.md › Releases`.
- **The release path: 0.1 Dev 6, 0.1 Beta, then 0.1.0 opens Early Access; themed updates follow; 1.0 is the full
  launch (owner, 2026-10-12).** Early Access is feature complete but light on content. The updates (Replica, Modes,
  Maps, Progression: planned as 0.2 to 0.5; more can follow) come in an order the owner picks; version numbers only go
  up, so the next update shipped takes the next number.

## How work runs

The pipeline's protocol is `pipeline/README.md`; its policy `docs/PROCESS.md`.

- **Every change is a pull request from a new branch made from the latest `main`; never push to `main` (owner,
  2026-10-02).** Each pull request is merged by its own thread once CI is green and, for code, the review agents
  passed (owner, 2026-10-16: "You should be merging. Not me").
- **When unsure about a design decision, ask the owner first; for a small detail, pick a default and record it with a
  one-line reason in the task's record (owner, 2026-10-02).** A check that can only pass by changing an acceptance
  criterion goes to the owner at once (owner, 2026-10-06).
- **Every task runs through scripted gates and a binary critic (owner's design, 2026-10-04).** `pipeline/gate.mjs`
  decides build, tests, smoke, perf, scope and changelog; the critic judges only on green gates, with eight pass/fail
  checks. Four attempts, then auto-accept at 6 of 8 with checks 1 and 2 passing, else a report to the owner.
- **Every code change gets all three review agents: critic, QA and performance (owner, 2026-10-16: "I need everything
  to go through a critic agent, qa agent, and performance agent").** Any pull request touching code, config, assets or
  gameplay data is marked ready and merged only once each says Pass and its description's `Review:` line gives the
  verdicts (`pipeline/review.mjs` checks it). Docs-only changes skip them.
- **Agents run only where they can change the outcome, from the gate's own summaries (owner, 2026-10-06, to save
  tokens).** The triage agent runs only for a failure the summary can't place; a near miss is re-run on Opus only when
  its failed check is a judgment, never a measured number. The triage and changelog agents run on Haiku 5.5, pinned by
  full id (`claude-haiku-5-5`; owner, 2026-10-08).
- **CI runs the gate script (`--ci`) as `check` plus `slow` shards of the headless bot-match guards (2026-10-05).** No
  perf gate on a runner: it has no baseline and no GPU. Off CI the slow guards run only when the diff reaches a file
  they load.
- **A bug pass follows each batch of feature pull requests, before the owner's playtest (owner, 2026-10-04).** Claude
  starts it only when he says go (`BP<n>`; `docs/PROCESS.md`).
- **Live docs hold only the current state; finished history moves word for word to `docs/archive/` (owner, 2026-10-05
  and 2026-10-06).** Archived files are never edited. House style: `docs/PROCESS.md › Writing docs`.
- **Each task keeps one record file, `docs/records/<id>.md` (owner, 2026-10-06, to save tokens).** Format:
  `docs/records/README.md`. `docs/KNOWN_ISSUES.md` stays the shared list of open issues.
- **QA may commit `pipeline/*.qa.test.mjs` files, its own tests of the pipeline's code, but no other pipeline file (PF3,
  2026-10-17).** A pipeline task gets QA like any code change, and its tests live beside the module; the gate's own
  tests (`scope.test.mjs` and the rest) stay out of QA's reach (`pipeline/scope.mjs` QA_ALLOWED).
- **Fable 5.1 runs only with the owner's explicit approval, asked for each time, and only where it would do
  significantly better than Opus (owner, 2026-10-08).** It costs far more; candidates are audits and reviews of a major
  architectural change or redesign. Other jobs keep their models (`docs/PROCESS.md › Models`).

## Art direction and graphics

- **Every graphic is an engine feature, never map-exclusive (owner, 2026-10-04: "All maps use the same engine").**
  Lighting, sky, effects, materials, prop styles and every Graphics setting live in the renderer and read from map
  data. No map name appears in render code; maps that don't use a feature draw exactly as before (pinned by tests).
- **Art direction v3: a bold, vibrant palette with grit (owner, 2026-10-05).** Valorant is the main reference, with
  Marathon's blocky geometry and Breath of the Wild's colour and light. No bare faces. Maps get set dressing only.
- **Look settings (owner, 2026-10-05).** A Robots setting mixes humans and robots on both teams; off makes everyone
  human. A Realistic colours setting. Eight two-tone replica colour schemes, picked per replica in Customise.
- **WebGPU is a complete overhaul and the default renderer (owner, 2026-10-07 and 2026-10-08).** One node-material
  renderer draws every preset; `Settings › Graphics › Renderer` offers Auto, WebGPU and WebGL (its WebGL2 back end, used
  when the browser has no WebGPU, the player picks it, or the GPU is lost). BB flight stays in the simulation. On the
  owner's laptop and desktop WebGPU is no slower than his WebGL baseline, and Low holds 60 fps at 1080p on the laptop.
  A software adapter is judged on the look bar's pixel share only; a change that should draw nothing new is checked
  against the commit before it (`webgpu-compare.mjs --reference <commit>`).
- **Torches cast shadows on High and Ultra only; Low keeps its beams (owner, 2026-10-06).** The laser beam stays off on
  every preset (owner, 2026-10-05): a beam with no dot stops short of what it points at.
- **The Retro look is public (owner, 2026-10-06), then back on the Dev tab since the Dev 6 playtest (owner,
  2026-10-16; ST1).** It changes only the picture.
- **What you see is what stops you and your BBs (owner, 2026-10-05).** Art never strays more than 8 cm from its
  collision block (`NATURE_SHAPES.maxGap`), so trunks are straight posts. Sloping ground is one heightfield shared by
  physics, BB rays, nav and the mesh.
- **Night is one lighting preset that every night map shares (2026-10-04).** Earth, wood and faces stay readable under
  Neutral tone mapping; Neon Heights' neon stays emissive. Under night Medium's shadow map follows the view.
- **The first start picks a quality preset from the GPU name; only an automatic pick steps down, never a player's choice
  (2026-10-04).** Software rendering starts on Low. A step down follows sustained slow frames, happens between rounds
  and is never saved.
- **The Blender models are the default everywhere (owner, 2026-10-16, Dev 6 playtest item 1; BD1).** Replicas, parts,
  the menus' pictures and the rigged figures load at start. The Dev switches "Disable figure models" and "Disable all
  models" are gone; the code-built models stay only as what is drawn when a file can't be loaded. Low with the models
  measured inside every budget line (Depot, container: 35 draw calls of 100, 54k triangles of 150k, 78 MB of 300); its
  frame time on the owner's laptop is still to be measured (PF2). Medium's Player detail is Low.
- **The Blender figures (owner, 2026-10-10; approved 2026-10-12).** Hands hold the replica naturally; robots wear no
  vest, holsters, magazines or accessories, their team shown by colour on their highlights. Your own figure is never
  drawn in first person, looking down or vaulting included (owner, 2026-10-17, Beta 1 playtest item 24; MV2, replacing
  BD1's body drawn when you look well down). A reload pulls the old magazine and throws it (owner, 2026-10-11). The
  aim clips turn the replica through 55 % of their ±60 degrees (BF1). Files are packed losslessly after each export
  (`tools/blender/bot-figure/pack.mjs`; no gltfpack: it renames what the game reads). Attachments sit on a sight line
  3.05 cm over the rail; a parts file's optic marks its own (RM8).
- **The human and robot figures were redesigned in the owner's own Blender, from his reference pictures (owner,
  2026-10-13; RM9, RM10).** Both share the rest-on-cover and vault clips. The robot is boxy and mechanical with a visor
  head and its team colour on the arm. The human has four heads picked by figure id (`config/figureRig.ts`); its vest,
  armbands, patches and hat bands show the team colour. A human is at most 20,000 triangles and its packed file under
  3.5 MB. A BB has no glow round it; Glowing BBs keep a lit green ball and longer streak (owner, 2026-10-13).
- **Every figure keeps its team-colour plate carrier (owner, 2026-10-17, AX1).** Shown the options on the real
  figure, he kept the carriers rather than dress four of six in a combat shirt with armbands only: the carrier reads like
  a site's team bib and is the strongest team cue at range, and the bare shirt looks more military, not less. A
  civilian outfit (a new texture from Blender) is in `docs/IDEAS.md`.
## Gameplay and feel

- **Hit volume is a body capsule plus a head sphere, no arms or replica (2026-09-30; owner, 2026-10-01).** The drawn
  figure is built from the same numbers; a crouched head top stays at or below 1.15 m, because crouch cover is 1.2 m.
  `render/figures/figureHitVolume.test.ts` measures it against the drawn figure on every pose (M85). **Every body stops a BB
  (2026-10-06):** a hit BB knocks the player out and stops, with no bounce off bodies.
- **The hit area is fitted to each rigged figure (owner, 2026-10-16, Dev 6 playtest; HV1, IM8).** Head, chest,
  shoulders, hips and legs sit on each figure's own bones (`FIGURE_HIT_SHAPES`, read from the clips as the figures
  load); `render/figures/riggedHitVolume.test.ts` holds every pose of both figures to M85's bar (4 % missed, 3 % thin air). A
  new figure must pass it; the built-in figures keep the built-in volume.
- **Hit calling stays a raised hand and a sign, with no dead rag, night light or shouted "HIT!" for now (owner,
  2026-10-06).**
- **A hit player calls HIT for 1.4 s, then walks to their team's dead zone along nav routes (2026-09-30).** A walk that
  can't finish fades out in place and reappears in the dead zone. Once a round is decided it is a cease-fire: nobody can
  fire and BBs in flight hit no one.
- **BB flight is built from fluid dynamics at full strength (owner, 2026-10-04).** Drag from the Reynolds number, Magnus
  lift from the hop-up's backspin, every force against the airflow. Replicas are rated like at a site, by muzzle energy
  and BB weight.
- **BBs always ricochet; the Ricochets count setting only decides whether a ricochet knocks someone out, and it is off
  by default (owner, 2026-10-03 and 2026-10-04).** A bounce knocking you out can feel unfair. Your own ricochets can
  hit you (owner, 2026-10-05). Bounces are weaker since G12 (owner, 2026-10-10): concrete gives back 0.3 of the speed
  into it, steel 0.41. The cap on the share of hits that are ricochets stays 0.25 (`ai/depotMatchSupport.ts`).
- **Accuracy depends on stance and movement, by one rule for bots and the player (2026-10-02).** Still and crouched is
  tightest; running, sprinting and the air are loosest. The aim locks on almost at once when you stop (owner,
  2026-10-03).
- **Walking with Shift is as steady as standing before the still bonus: ×1.0 against running's ×2.6 (owner, 2026-10-16,
  Dev 6 note 29; MV1).** Crouch-walking stays steadier than walking and shakier than standing still.
- **You can fire while sprinting, less accurately (owner, 2026-10-13, Dev 5 playtest note 9).** Sprint spread ×3.5 (walking
  ×1.15, running ×2.6), each shot kicks 1.5 times as hard (`MOVEMENT.accuracy.sprint`, `.sprintKick`); no lockout after
  a sprint. The replica comes up in 0.06 s and stays up 0.35 s after the trigger is let go. A vault still holds fire
  0.3 s after it. Bots still stop sprinting to fight.
- **Walk is Shift (slow, quiet) and sprint is Left Alt (owner, 2026-09-30);** running, sprinting and landing make noise
  bots hear, walking does not. Wind is one breeze per match from the seed, 0.3 to 1.8 m/s, moving BBs only (2026-10-04).
- **Crouch toggles by default, with a setting for hold; sprinting or jumping stands you up (owner, 2026-10-03).** Lean
  stays hold. Aim and sprint are hold by default, with toggle settings.
- **Hold Q / E to lean around cover (owner, 2026-10-01); replicas switch with 1, 2 and the mouse wheel (owner,
  2026-10-02).** One geometry (`sim/lean.ts`) drives the eye, BB origin, hit volume, camera, drawn figure and bot
  vision, so you are hit only where you appear and never through walls.
- **Nobody rests or leans on cover or any other object (owner, 2026-10-16, Dev 6 note 30; MV1).** Aiming at a ledge
  changes nothing. Leaning with Q and E stays. The figures' files still hold unused Rest clips (`docs/KNOWN_ISSUES.md`).
- **Limited ammunition means a set of magazines (owner, 2026-10-01).** A reload swaps in the fullest spare and keeps the
  old magazine as it is; nothing refills during a round. An empty trigger pull clicks dry and reloads at once.
- **A teammate can toss you a magazine when you run low, and you them (2026-10-15, MG1; Claude's defaults).** It moves
  BBs between pouches and never makes any; a bot never gives away its last full spare of the replica it fights with.
  Numbers: `config/magShare.ts`, `docs/records/MG1.md`.
- **Fire modes follow the real-world type each replica is modelled on, with a selector key (B, rebindable) (owner,
  2026-10-03).** A pistol is semi only; an AR-pattern AEG has single, 3-round burst and full auto. Names stay generic.
- **Every replica aims down sights, through iron sights when no optic is fitted (owner, 2026-10-06).** Optics and other
  attachments stay accessories, never part of a replica's model. Down any sight the spread is halved and Shift creeps
  below the aiming pace (`MOVEMENT.accuracy.aimed`, `aimWalkScale`); bots fire from the hip.
- **Up a ramp the pace loss stays: the speed fix is built but off (`MOVEMENT.rampPace` 0) (owner, 2026-10-05).** Turning
  it on moved Attack / Defend balance on Depot, so a change needs the owner's call.
- **Cover heights: full cover is at least 2.4 m and crouch cover exactly 1.2 m; no walkable ledge sits between 0.15 m
  and jump height (2026-09-28).** Crouched eyes (1.09 m) hide behind 1.2 m cover and standing eyes (1.66 m) shoot over
  it. Crouch cover is unclimbable (tested).
- **3 holsters the replica (1 primary, 2 secondary, rebindable): moving holstered is faster, never past the sprint, and
  the draw from the holster slower (owner, 2026-10-06, 2026-10-16 and 2026-10-17; M92, MV1, MV2).** Holstered run
  5.4 m/s against 4.2 with the replica out (`MOVEMENT.holsterRunSpeed`); sprint 6.3 either way. A draw takes 1.8 times the replica's own
  (`HOLSTER.drawScale`). A slot key, a fresh trigger pull, an aim press or a reload draws it. Bots holster only on a
  calm sprint through their own half (`ai/botHolster.ts`).
- **Vaulting is Jump at a low obstacle, with no key of its own (owner, 2026-10-12; M102).** Obstacles 0.6 to 0.95 m
  over your floor, at most 1 m deep, heading within 70° of where you look; crouch cover never qualifies. Anywhere else
  Jump is a jump. A vault takes about 0.4 s, carries the replica and holds fire 0.3 s after; crouched, you can't vault.
  Values in `config/vault.ts`. Slide into cover is no for now (`docs/IDEAS.md`).
- **A vault keeps what you press during it; a trigger held through it is the same pull (BP5, 2026-10-16).**
- **Vaults are loud (owner, 2026-10-13).** Bots hear a vault from 18 m (a sprint 16, a landing 12, a run 11).
- **Running into a noisy prop gives you away, and a BB ringing off steel draws a look (2026-10-15, NP1; Claude's
  defaults).** Props, ranges and times: `config/noise.ts`, `docs/records/NP1.md`.
- **Steps on gravel and steel plate carry 1.35 times as far (2026-10-15, NP1).** The simulation names the ground
  (`WorldQuery.surfaceUnder`), so bots hear exactly the ground you hear. Walking stays silent on every ground.
## Bots and balance

- **Bots are ordinary characters driven by the same commands as the player, with human limits (2026-09-30).** A 120°
  view, sight checks 10 times a second, a reaction delay, a capped turn rate and aim error. They never fire with a
  teammate in the line of fire. A test plays each level twice with a hidden, silent enemy and needs identical commands,
  so no bot aims at someone it hasn't seen or heard (M37).
- **Bots hold fire through more than 0.25 m of bush; Easy fires into the leaves (2026-10-15, FO1).**
- **Difficulty is skill plus a few tactics, never different senses (2026-10-01).** Easy, Normal, Hard and Pro see and
  hear alike. Opponents and teammates have separate difficulties (owner, 2026-10-03).
- **Normal is the baseline (owner, 2026-10-06).** Tune on Normal, then check that Easy, Hard and Pro still scale.
- **Adaptive difficulty is a Dev setting that layers over the fixed levels (owner, 2026-10-06; AD1).** It never changes a
  level's own numbers: the other team's skill is a rating that blends the levels' numbers. Your teammates never adapt,
  Extraction doesn't, and its matches stay out of the records and give no XP. A new skill field goes in one of the two
  lists in `config/adaptiveDifficulty.ts`.
- **Against Easy opponents, teammates play Normal (owner, 2026-10-05).** Otherwise teammates follow the opponents'
  level. That pair is the standard match for the records.
- **Pro is careful, not twitchier (owner, 2026-10-04).** Pro bots hold and pre-aim angles, clear corners, trade and set
  crossfires. They react fast (about 0.2 s) only to someone appearing near where they already aim. Pro pays ×2; its
  rewards are cosmetic only. A "what got you" card exists on every difficulty and is on by default only on Pro.
- **Difficulty is balanced with the maps; any map rework it needs is raised with the owner first (owner, 2026-10-04).**
- **Opponents on every level carry kits from `bot-kits.md`, picked by each level's weights (2026-10-13, BG1).** Seeded by
  the match seed and the bot's id. Easy is mostly factory, Pro never. Your teammates stay factory (owner, 2026-10-04); BB
  weight and hop-up stay factory. What you have unlocked never changes a bot's kit.
- **A bot aims through the sight on its replica; gear never changes what it sees or hears (2026-10-13, BG1).** Numbers:
  `BOT_SIGHT_AIM`. Bots fire from the hip while they strafe.
- **Bots have names and personalities, read from `bots.md` (BN1, 2026-10-13; Claude's defaults).** A name always plays
  the same personality (rusher, anchor, flanker, careful). A personality changes how a bot plays, never how it sees,
  hears, reacts, turns or aims. A cell the game can't read plays neutral. Anchors aim from cover when standing still;
  every other bot fires from the hip. Which kit suits which personality: `bot-kits.md`'s Suits column.

- **Every level hunts the middle of the map; Normal, Hard and Pro keep out of the light at night; Easy stands where its
  lane says (owner, 2026-10-05).** Below Pro, both teams swept to the far end and rounds ran out of time (M71).
- **Hunting bots check by eye, and a team shares what its bots checked (M87, owner, 2026-10-06).** A checked spot counts
  for the level's `huntMemory` (Easy 20 s, Normal 40, Hard 50, Pro 60; `config/bots.ts`), then as never checked.
- **Balance is measured by headless bot matches against bands, as a report (owner, 2026-10-06; TE4).** Noise across
  seeds made pass/fail bands cost re-measure loops. The figures in `src/ai/balance/` are judged by
  `node pipeline/balance.mjs` and never fail a build; the bug pass reads the report. The `slow` guards keep what must
  never happen (rounds settled, nobody stuck, falling or hit by a teammate). The Normal figures are judged at 45 to
  55 %, the Pro ones at 40 to 60 % (M73).
- **Bot callouts are text and a radio click, never voices, and never change play (2026-10-13, CL1).** Shown bottom left,
  panned to where the teammate is; an enemy's is only its click, within 15 m. One call at a time per team, 1.5 s apart,
  a bot its own 4 s apart (the owner found the pace OK, 2026-10-16). The callouts read the bots and never write them.
  Hit players never talk. Every line is in `callouts.md`.
- **A ping marks a spot or an enemy for your team, and your bot teammates play it their way (2026-10-15, PG1; Claude's
  defaults).** An enemy counts only if the bots' own sight rules let you see them. One teammate answers each ping.
  Numbers: `docs/records/PG1.md`.
- **Bots ask the nearest teammate within 30 m for a magazine, and bring one when asked (2026-10-15, MG1).** Fights and
  cover come first. Dev settings › Bots run low on BBs (a cheat, off) shows the bot side.
## Maps and modes

- **What no player can see is not drawn (owner, 2026-10-16, MS1).** Beyond a map's walls only what shows over them from
  a lane, a spawn or a raised floor is built (`render/dressing/skylineSeen.test.ts`). Look-only fixtures hung over the field stay
  out of the room a player takes up. Woodland's bushes are small and decorative (0.9 to 1.25 m): crouch cover, never
  full cover.
- **The maps' vault walls are 0.9 m, at most 0.4 m deep, open above (M102, 2026-10-13).** Not cover: a crouched
  player's eyes are over it. One per map where it opens a route; a window keeps its lintel, so it is never vaulted.
- **A match is first to 5 round wins by default, with 2:30 rounds (2026-09-30).** A drawn round is replayed in both
  modes (2026-10-04). Half-time comes after `winsNeeded - 1` rounds, so the decider is always in the second half.
- **Teams swap ends at half-time in both modes (owner, 2026-10-03).** Maps define spawns, dead zones and lanes per end,
  not per team; in Attack / Defend the attackers always start at end 0.
- **Elimination's first end goes by team, not by the Your team pick (owner, 2026-10-12, BP3).** Alpha starts at the
  east end; Beta starts in the west. Attack / Defend follows the pick.
- **Attack / Defend is the flag mode, named so Capture the Flag can be its own mode later (owner, 2026-10-01).** Standing
  within 1.6 m of the pole for 5 s raises the flag; defenders at the pole pull it down. A raised flag wins for the
  attackers, a time-out for the defenders; overtime lasts at most 15 s if attackers are on the rope at the buzzer. The
  pole is visual only: no collider, and BBs pass through.
- **Elimination's overtime flag: a time-out with nobody ahead puts a flag up near the middle, and the first team to
  touch it wins the round (2026-10-15, OT1; Claude's defaults).** Untouched after 30 s, the time-out rule decides.
  Never in Attack / Defend or Extraction. Spots and timings: `OVERTIME`, `docs/records/OT1.md`.
- **Rule sets: Skirmish, Tournament, Pro CQB and Custom (owner, 2026-10-04).** Skirmish is today's rules, the default. A
  match counts for the records only as its ruleset's standard match; Custom pays at most ×1.5. Tournament and Pro CQB
  are dev and fold into the field rule presets (owner, 2026-10-05).
- **Maps may have elevation (owner, 2026-10-02).** Ramps slope at most 1:2; stairs are drawn as steps and collide as the
  ramp underneath; a height change over 0.15 m between nav cells is not walkable. Floors may lie over one another with a
  body's height of headroom.
- **A map's layout rules are tests (2026-09-28).** Cover heights, unclimbable crouch cover, spawns hidden from each
  other, sightline caps, and per-map rules. A layout change keeps them or needs a decision line.
- **Depot is asymmetric (owner, 2026-10-03).** Attackers' yard west, defenders' spawn north-east, one flagpole in a
  walled loading bay, three lanes: Dock Road, Container Alley, the Office. Its west end stays at 48 % of decided
  Elimination rounds (owner, 2026-10-05); the ends are not evened further.
- **Woodland is the second field: night only, much more open and larger than Depot, with a free weapon torch and glowing
  BBs (owner, 2026-10-04).** No prone, a gentle slope, one much higher end with the flag. It plays 5v5 by default and
  allows 6v6 (owner, 2026-10-06). Its long open lines are intended (the longest clear line stays under 141 m). Its
  starts are hidden from each other and the east end stands at most 2 m above the west (M88; `map/woodland.test.ts`).
- **Woodland has no boulders, no lone oak, chest-high fort walls and a roofed hut (owner, 2026-10-17, Beta 1 playtest
  item 30 and his tweaks: "completely remove all boulders. I hate them.").** Logs give the cover instead: log piles on
  the fort's climbs, fallen trunks on the meadow. The fort's outer walls are 1.5 m (at 1.2 m Hard attackers won 76 % of
  Attack / Defend); the hut is 3 m under the cabin's grey tin roof, which he picked over roofing the whole fort (WL2).
- **Woodland's West Hill, a meadow swell and a dry ravine (owner, 2026-10-17: "a small hill (enough to stop the other
  side immediately seeing them)… one side of the map should have a more significant elevation change"; he picked "Land
  first" on the concept).** The West Rise's crest is 3.4 m at its middle and 2.2 m at its ends. One 0.6 m swell sits on
  the meadow; the concept's second, at (66, 37), tipped Pro Elimination to 37.5 % for the west end. The south creek is a
  dry ravine 2.2 m deep from plan x 40 east, easing to 1 m by the hill, so no slope passes a ramp's. The stream in its
  bed is a later step (WL3).
- **Neon Heights is the third field: a vertical futuristic city with Day and Night (owner, 2026-10-04).** 46 × 30 m,
  three playable floors, roofs not playable, stairs only, open windows with a 1.2 m sill, 4v4, both modes, Night first.
- **Bushes hide you and stop BBs, but not people (2026-10-15, FO1; Claude's defaults; replaces "Bushes hide but BBs
  pass").** The same 0.6 m of leaves, counted over a BB's whole flight, hides a player from bots and stops the BB (a
  test holds the two equal); a BB crossing less is thrown off its line. Numbers: `config/ballistics.ts` (`leaves`).
- **Practice has moving targets and a timed challenge, on the range or any map (2026-10-13, M93, M94; Claude's
  defaults).** The timed challenge is off by default, switched in Practice's pause menu: a START plate, a 3 s
  countdown, then 60 s of lit targets (`RANGE_CHALLENGE`). On a map there are no bots: targets stand where the other
  team's bots would play, read from the map's own data. Each map has its own best (`bestChallenge`); a run with a Dev
  setting that changes play on is never a best (BP5). The place is saved as `practicePlace`.

- **A map's checks measure it against Depot (2026-10-11, CT2; the standard is the owner's, 2026-10-05).**
  `MAP_STANDARD` and `MAP_BALANCE_BANDS` (`src/config/contentRules.ts`): 3 lanes, the longest clear sightline 34 m, each
  end's walk to the middle within 15 %. A map that differs for a reason goes into `MAP_EXCEPTIONS` with the owner's word
  (Woodland's 141 m sightline, Neon Heights's four block clashes).
- **A mode's checks hold it to Elimination's numbers (2026-10-11, CT3; the bands are the owner's, 2026-10-05).** A new
  mode does not build until every wiring point answers for it; its bots must play it their own way; the objective
  decides at least 1 round in 10 and the pay stays within × 0.75 to × 1.25 of Elimination's (`MODE_BALANCE_BANDS`).
  Ids in saves are pinned in `SHIPPED_MODE_IDS`.
- **A skin's checks (2026-10-11, CT4; Claude's defaults).** A skin is a replica colour scheme. `SKIN_RULES` holds the
  numbers (coverage, distance legibility, the orange tip's contrast, blending into a map); a colour reading as a team's
  needs a reason in `TEAM_COLOUR_SKINS`. Nothing that decides play reads a skin (proved over the imports).
## Replicas, Loadout and levels

- **The next replica is a spring sniper rifle, and the owner is asked how to build it and its specs before work starts
  (owner, 2026-10-06).** The SMG and shotgun come after it.
- **The Cyber Pistol is the owner's own design and the level cap's reward (owner, 2026-10-04; level 10 since
  2026-10-13).** It stays inside the pistol class's 1.0 J chrono limit: rifle power with pistol handling, the tightest
  spread and almost no kick. Hard and Pro opponents now and then carry it. It borrows its colours from his photo (mint,
  hot pink, black), never its logo or lettering (CLAUDE.md §4). Redesigned from his three pictures (owner, 2026-10-12;
  RM5): small iron sights, and only the dark grey slide kicks back.
- **The AEG Rifle and the GBB Pistol are redesigned from the owner's reference photos, with no text or logo copied
  (owner, 2026-10-12; RM6, RM7).** Small, minimal iron sights; the old length, grip, magazine, rails and mounts stay, so
  animations, attachments and figures still fit. The Gas Pistol became the GBB Pistol, a blowback replica with the same
  numbers.
- **The Loadout and the Armory open only between matches, never from the pause menu (owner, 2026-10-03).** The practice
  range's pause menu offers the Loadout, because a range has no match.
- **Five saved loadouts, and the one carried follows your edits (2026-10-13, SL1; Claude's default, one number in
  `config/savedLoadouts.ts`).** Every change goes to the current saved loadout, so there is no Save button; Replace
  copies the one carried over another. Gear not available now stays picked, plays as the default and shows as locked
  with the level that unlocks it. Disable levelling keeps a set of its own.
- **`pool.md` (what exists), `stats.md` (how it shoots) and `levels.md` (what each level unlocks, and the XP) are
  hand-edited data the game reads (owner, 2026-10-04 and 2026-10-13).** A row the game can't read is skipped with a
  warning and fails its test. Item IDs are six digits, permanent and only added to. Tags (`gas`, `top-rail`) decide what
  fits.
- **No rarity tiers: every item is one item, with one set of numbers (owner, 2026-10-13).** The Cyber Pistol keeps its
  Legendary numbers; the AEG Rifle and GBB Pistol keep their Common ones; the Low-Cap Magazine carries 180 BBs and
  changes quicker; the Long Barrel adds 10 % energy and groups 10 % tighter.
- **A battery sets the rate of fire, not the energy; stronger gas kicks harder; parts are trade-offs, never straight
  upgrades (owner, 2026-10-04).** Red and Black Gas add +10 % and +20 % recoil.
- **Site chrono limit per class: 1.20 J for rifles, 1.00 J for pistols, on the rated energy at the factory BB weight
  (owner, 2026-10-04).** Silencers yes and barrels no on the pistol.
- **The Loadout and Customise offer what you have unlocked and show what is still to unlock greyed, with the level that
  unlocks it (2026-10-13).** A new unlock is never fitted for you (owner, 2026-10-04). The Armory shows the whole track.
- **Levels (owner, 2026-10-13).** Everyone starts at level 0 with the GBB Pistol, the AEG Rifle and their power
  sources; the cap is 10, with the Cyber Pistol at the top. `levels.md` lists what each level unlocks. The cap goes up by
  adding rows. Unlocks are never taken away: an item moved up stays with whoever has it.
- **XP numbers live in `levels.md` for the owner to tune (2026-10-13).** Every match gives XP except the range, the
  tutorial and any match using dev content or a cheat. About 250 XP a Normal match, level 10 after about 25.
- **Disable levelling is a Dev switch (owner, 2026-10-13).** It unlocks everything for the Loadout without touching your
  level and counts as a cheat: no XP, and the match stays out of the records.
- **In Practice you change gear from play, and it is your one loadout (2026-10-13, M95).** The Loadout key (L) opens it
  there on the slot in your hands; what you pick at the range goes into the next match. With Disable levelling on the
  picks are the sandboxed ones. The owner can rule for a separate practice loadout.
- **Aiming down the 2x scope looks like the red dot: the replica stays in view and the world shows round it (owner,
  2026-10-13, Dev 5 playtest note 5).** The view zooms 2× and the scope's rear glass shows the world
  (`render/replicas/eyepiece.ts`); the dark surround is gone, so the scope's cost is its slower raise alone.

## Menus, HUD, settings and accessibility

- **Settings after the Dev 6 playtest (owner, 2026-10-16; ST1).** Groups: Display, Graphics, Gameplay, Looks, Audio,
  Controls, Accessibility, Save file, Dev; Settings opens on Display. Defaults: sound cues red, scoreboard 100 %, aim
  Toggle, crouch Hold, volumes master 100 %, effects 80 %, power source 100 %, ambience 60 %, interface 50 %; a save
  that picked otherwise keeps its pick. The Retro look is a Dev setting again, Realistic colours moved to the Loadout's
  Colour tab (MR1), and the Voices placeholder is gone. The top bar's level reads "LVL 3".
- **Small menu rulings (owner, 2026-10-03 to 2026-10-07).** The tagline is "Call your hit. Go again." Menu headings and
  labels are in capitals (in the stylesheet), descriptions as written. Unbuilt items are listed greyed out with a LATER
  tag (`config/menus.ts`).
- **The menus grow with a tall window as the HUD does (UX1, 2026-10-17; replaces decision 16's "as they are").**
  `menuScale` zooms `.menus` by the window height over 1080, up to 1.5× at 4K, held back so the layout keeps 1500 px of
  width; 1080p and smaller draw as before. Heights inside use `--vh`, since the zoom multiplies `vh`.
- **A menu page is pinned to the window; only its long part scrolls (UX1, 2026-10-17).** The top bar, the heading and the
  main button always show; the Match choices, a Settings group's rows, the Loadout's numbers, the Armory's levels and
  Customise's lists scroll inside (`.menu-scroll`, fading at the foot while more lies below). A window under 821 px high
  draws spacing and controls a step closer. Below 901 px wide only the Match screen stays pinned.
- **The order wheel is on Z (owner, 2026-10-04); Hold here X, Regroup V, Follow me F.** Orders end when their giver is
  hit and at each round start. A hidden tab or a window that loses focus pauses the match. Esc while you are out skips the
  round at once (owner, 2026-10-13).
- **The menu and UI redesign is approved (owner, 2026-10-05); the HUD is restyled in place, with the same positions.**
- **The menus use Inter (owner, 2026-10-07).** He finds Barlow hard to read, numbers above all.
- **The teams are Alpha (blue) and Beta (orange), although Beta is also the name of the Beta builds (owner,
  2026-10-07).** The hit feed reads "Beta 2 called HIT · Alpha 3": who called the hit, then whose BB it was; the player
  is "You".
- **Team colours come in Standard and High contrast sets, and props, kit and paint never use a team colour's hue
  (tested) (2026-10-04).** Colour is never the only cue: names carry a bar, exits a glyph and a distance. Exits take
  their set's colour (owner, 2026-10-17, AX1; replaces decision 17 of 2026-10-05, one green in every set): Standard
  keeps the green, High Contrast's are hi-vis yellow, as the green sits close to the orange team for a deuteranope. On day
  fields High Contrast's team paint glows faintly (0.3 of its colour; owner, 2026-10-17, AX1: "HC only"), so its dark
  orange holds in shaded corners; Standard's paint has none.
- **Menus are opaque (owner, 2026-10-03).** The controls list lives under Settings. The pause menu is Resume, Settings
  and Quit.
- **No map is loaded until Play (owner, 2026-10-03).** A match is a session built on Play and disposed on leaving.
- **The minimap shows teammates, and the other team only as patches where they were last heard (owner, 2026-10-04).** A
  hit call removes that player's patch. It names the area you stand in, with the names the bots call (CL1).
- **Ping is the middle mouse button, and Settings › HUD › Ping markers is On by default (2026-10-15, PG1).** One ping
  each, 8 s on screen with its distance, on the minimap too; a contact is a diamond in the other team's colour. Off
  hides the markers only. With Callouts off, teammates mark nothing.
- **Asking for a magazine is H and the order wheel's fifth item, Need a Mag (2026-10-15, MG1).** One press does what
  fits now: toss one to the nearest teammate asking you in reach, else ask if you are low, else say why not. H was
  unbound; it is rebindable like every order.
- **Settings › HUD › Mag hand-off is On by default (2026-10-15, MG1).** One line under the crosshair (who needs one,
  whose is on its way, a toss you can make) and a "· mag" tag on the teammate's name. Off hides the line and tags only.
- **Settings › Gameplay › HUD › Ammo counter is On by default; Off hides the BB counts, not the magazines (2026-10-15,
  AC1).** Each spare magazine keeps its bar, full while it holds any BBs and hollow once empty, with no fill level: on a
  field you feel how many magazines you hold, never how full. The reload bar, the Empty, Last magazine and Out of BBs
  lines, the dry-fire click and the Low on BBs hint stay. No mag-check key (owner, 2026-10-06).
- **Key bindings: a key belongs to one action, and taking a used key swaps the two (2026-09-30).** Esc, F5, F11, F12,
  the browser navigation keys, PrintScreen, Pause and the debug keys can't be bound. Fire and the four move keys can
  never be left keyless.
- **The hit marker is a bold red X with its own settings, off by default (owner, 2026-10-13, Dev 5 playtest note 4).**
  Settings › Gameplay › Crosshair: on or off, scale, thickness, outline and colour. Whether it starts on is his call.
- **The menus are compact, to concepts the owner approved (owner, 2026-10-16, Dev 6 playtest items 9 to 21; MR1).**
  Match, Loadout, Customise and the Armory use the 15 px step for small text and 32 to 40 px controls. A mode is offered
  only on a map that hosts it, and a rule the mode doesn't read is hidden.
- **The mode cards' pictures are deleted (owner, 2026-10-17; KI2).** The cards are text boxes since MR1, so the pictures
  were never shown; a picture the player never sees doesn't ship.
- **The tutorial teaches leaning, and its read cards last 10 s (owner, 2026-10-17, Beta 1 playtest item 33; TT2).** The
  lean step comes back after Crouch: hold Q and E (or their bindings) to peek either way, ticked once both sides are
  done. It teaches peeking, not resting on cover (note 30). Every read card stays up 10 s with its filling bar, in place
  of TT1's 5 to 8 s.
- **A UI redesign, a Visual redesign, an Audio redesign and a Performance update are planned for later, their versions
  not set (owner, 2026-10-13 and 2026-10-16).** Parked in `docs/IDEAS.md` until he places them, with no work before.

## Audio

- **Every sound is a recipe synthesised in code and rendered once into buffers (2026-10-03).** Replicas sound like toys:
  mechanical and plasticky. CC0 samples may be added where synthesis falls short, each recorded in `docs/ASSETS.md`.
- **A replica's shot follows its power source: electric, gas or spring (owner, 2026-10-03).** An empty AEG still cycles;
  an empty gas pistol only clicks.
- **Footsteps are information, so gameplay audio comes first (owner, 2026-10-05).** Every ground's step stays within
  1.5 dB of concrete overall and 3 dB in the 0.7 to 4 kHz band, so a soft ground never hides anyone.
- **A field's ambience is map data, with a day and a night variant picked by the lighting preset, never a map name
  (owner, 2026-10-05).** Calls are no louder than a bird and beds no louder than the yard's (tested).
- **Shots are louder and a replica's power source has its own slider (owner, 2026-10-13, Dev 5 playtest note 2).**
  Settings › Audio › Power source volume covers the motor, the gas pop and hiss, the spring's twang. Shots 1.4 (+2.9
  dB), the power part 1.4, the motor 1.1, footsteps 0.54 so a bot's sprint is still heard against your own shot.

## Save and settings storage

- **Save keys and fields are permanent and only added to (2026-10-04).** Settings live in one versioned object,
  `airsoft.settings`; progress (`airsoft.progress`), records (`airsoft.records`), saved loadouts (`airsoft.loadouts`)
  and key bindings keep their own keys. A rename or retype is a migration step.
- **A save is readable JSON; an integer `SAVE_FORMAT` drives migrations (2026-10-04).** A store's version can't change
  without it (a test fails). Every store keeps fields it doesn't know. A format newer than the build is refused.
- **Loading replaces the whole save, with no merging (2026-10-04).** A side-by-side check comes first, the replaced save
  is kept for Undo, and the page reloads. A SHA-256 checksum, no signature. Three restore points, one per day.
- **One tab plays at a time (2026-10-04).** An exclusive Web Lock, with BroadcastChannel as fallback; Play here hands
  over. Two tabs could otherwise write over each other's XP.
- **Records count finished standard matches only (2026-10-04).** 3v3, first to 5, 2:30 rounds, friendly fire on,
  ricochets not counting, both teams at one difficulty. Quitting counts as nothing. A named ruleset files under its own
  cell.
- **Each page load gets a fresh simulation seed, and each match in a visit its own (owner, 2026-10-02).** `?seed=N`
  replays one; the debug overlay shows it.

## Content tags and dev content

- **Every map, mode, difficulty and pooled asset is tagged public or dev; dev content shows only with the Dev tab's Dev
  content switch (owner, 2026-10-04).** With the switch off, dev content is not visible at all, not even greyed out.
  Making content public means changing its tag.
- **A match that uses dev content stays out of the records and gives no XP (owner, 2026-10-04).** Dev gear is offered at
  its level only with the switch on; bots carry it only then. Unlocked dev gear stays in the save, hidden, and a dev
  pick plays as the default until the switch is back on. A match counts as using dev content when an opponent's kit
  could hold dev gear (BG1).
- **Woodland and Neon Heights stay dev content until the owner has playtested them; he makes each public himself (owner,
  2026-10-05).** Woodland's weapon torch stays dev until Woodland is public.
- **Dev settings apply only while their box is ticked (owner, 2026-10-04).** Game speed, Bottomless magazines, Ghost
  and Disable levelling keep a match out of the records and give no XP for the rest of that match. Debug info, BB paths
  and Retro pixels change only what you see.
- **New replicas and parts go through the content toolkit (owner, 2026-10-05).** `node pipeline/content-check.mjs`
  (`docs/content/README.md`). A fail blocks going public; a warning needs the owner's OK. A new item's team wins 40 to
  60 % of decided rounds on public maps, modes and levels. An item allowed stronger, a part better at everything, a
  number outside its range and a balance override each go into their register in `src/config/contentRules.ts` only on
  the owner's word.
- **What shipped before the toolkit stays as it is (owner, 2026-10-11).** Every public item is registered as public
  "before the toolkit". The 11.1 V LiPo Battery keeps its faster fire ("leave it for now"); a downside is a possible
  later change (`docs/IDEAS.md` › Maybe).

## Performance budgets and technical foundations

- **No ray or path tracing; the game keeps its current lighting (owner, 2026-10-11).** The Dev switch built for it
  (RT1) was scrapped; its code is a git bundle in the project's shared files, not in the repository.
- **The Low preset must hold 60 fps on modern low-powered hardware (owner, 2026-10-04; restated 2026-10-16).**
  `pipeline/perf-budget.json`, measured on the owner's laptop: p95 ≤ 14 ms and p99 ≤ 20 ms; Low draw calls ≤ 100 and
  triangles ≤ 150k; GPU memory ≤ 300 MB; heap growth ≤ 5 MB over 60 s; nothing more than 10 % worse than the baseline.
  His ceilings of 150 draw calls and 250k triangles stay on High. No dynamic resolution scaling. Raising any line needs a
  decision line.
- **Maxed-out settings target a PC built for 4K at 240 Hz (owner, 2026-10-16).** His desktop is the reference (Ryzen 9
  9950X3D, 64 GB, RTX 5090). Ultra at 3840×2160 aims for about 4.2 ms. Low's 60 fps floor is unchanged.
- **The desktop's Ultra line at 4K is today's baseline, not the 240 Hz aim (owner, 2026-10-17, PF3).** His first
  baseline ran Ultra at 200 to 230 FPS (p95 5.4 to 6.0 ms on WebGPU), so the gate judges Ultra at 3840×2160 against
  p95 ≤ 6.5 ms and p99 ≤ 9 ms (`envs.desktop.ultra` in `pipeline/perf-budget.json`): Ultra can't get slower, and
  nothing in the game was cut to reach 240 Hz. The 240 Hz aim stands and is unmet (KNOWN_ISSUES). Only Ultra's frame
  times are judged there; its other lines are the preset's. WebGL2, the fallback, measured slower on Depot (p95 6.7,
  p99 10.6 ms), so it holds its own baseline too: 7.2 and 11.5 ms (`envs.desktop.backends.webgl`; PF3's reading,
  confirmed by the owner 2026-10-18).
- **Round 1 waits for every shader to be built before it goes live (owner, 2026-10-17, PF1).** A short wait on a still
  field beats a stutter in round 1; the time to round 1 may grow for it (PF1's 10 % load line was dropped for this).
  A 60 s limit (`RENDER.warmUpLimitMs`) only guards against a build that never settles.
- **Medium has map-scoped draw-call lines: Woodland 120 and Neon Heights 145 (owner, 2026-10-11, W6a).** Other Medium
  lines and every Low line stay the presets'. Woodland's GPU grass and stand-ins cost 2 draws on Medium. The GPU
  dressing's triangles have a line of their own (`dressingTriangles`, `pipeline/perf-budget.json`).
- **Frame times are judged only on hardware rendering (2026-10-04).** The cloud container draws with SwiftShader, so
  there the gate judges counts, memory and the relative check. The perf gate runs a matrix of maps and modes, a
  combination only when the diff reaches it; baselines are reset in the pull request that changes what they measure.
- **High and Ultra draw the city's flat finishes at 512², as Medium does (owner, 2026-10-05; M78).**
  `SURFACES.maxSize`: 1024² gains nothing there for four times the memory.
- **Chunk size budgets fail the build on CI, and growth is a deliberate bump with a decision line (2026-10-04).** The
  game chunk's line is 1,250 kB (warning from 90 %), raised from 1,000 kB with the owner's word at IM1 (2026-10-12) once
  start-up code was counted in one chunk, the `game` group in `vite.config.ts`; it is a tripwire (compressed, about a
  third). Rapier's chunk has 236 kB and its `.wasm` 3,240 kB, each its measured size plus 5 % (IM3). History of the
  earlier bumps: `docs/archive/0.1-beta/DECISIONS.md`.
- **Menus stay smooth; what a menu opens is fetched on first use (owner, 2026-10-12; IM1).** "The UI should always feel
  smooth and responsive", with a loading screen allowed for the tutorial, range, maps and matches. The Loadout, the
  Armory and Settings (`ui/menus/lazyScreens.ts`) and the range (`rangeSession.ts`) load on first use and preload once
  the title is up (`core/onDemand.ts`). A new screen reached only from a menu joins `lazyScreens.ts`.
- **Rapier's WebAssembly ships as a plain `.wasm` file, not as base64 inside its chunk (owner, 2026-10-12, IM3; changes
  the fixed decision in CLAUDE.md §3).** The build rewrites the one call where the compat bundle's `init()` decodes its
  inlined copy, so it fetches `rapier_wasm3d_bg.wasm` instead (`src/config/rapierWasm.ts`). A Rapier upgrade whose
  bundle no longer has that call fails the build. The dev server and Vitest keep the inlined copy.
- **Small technical rulings.** Real light counts per quality are fixed: Low none, Medium 2, High 4 (owner, 2026-10-04).
  Production builds ship Brotli and gzip copies (owner, 2026-10-04). TypeScript 7 checks the code on the same strict
  settings; a setting a later version drops goes to the owner, never a looser `tsconfig.json` (owner, 2026-10-12).
  Characters don't collide with each other in Rapier; the simulation handles spacing and BB hits (2026-09-28). A game
  loop error stops the loop for good with a copyable report. `?nolock` and `?script=perf` exist only on the dev server
  and the e2e build.
- **Level blocks collide as closed triangle meshes with `FIX_INTERNAL_EDGES`, not cuboids (2026-09-28).** Rapier's
  capsule controller sinks into any cuboid along its diagonals.
- **Only the ground probe decides "grounded" (2026-09-28).** The controller's own flag let players hang on the top edge
  of cover and hop over 1 m barriers. A character still exactly where the last probe set it down is not probed again
  (M77, SIM-06).
- **Per-tick and per-frame paths take lengths with `length3` (`sim/vec.ts`) or `Math.sqrt`, never a three-argument
  `Math.hypot` (2026-10-08, M77).** It allocates on every call until V8 optimises the caller and isn't rounded alike in
  every browser. Build-time code may keep it.
- **Bot navigation is a 0.2 m grid built from the map's blocks, with one node per floor, not recast (2026-09-30).** Maps
  are box-built, so a grid is exact and needs no dependency.
- **A new random feature draws from its own seeded stream, never the simulation's (2026-10-04).** Wind, the bots' kits,
  Extraction cases and presentation effects each have one, so seeds that already replay still replay.
- **Player-only preferences, such as toggles, live in the input layer (2026-10-03).** The simulation sees the same
  command it sees from a bot.
