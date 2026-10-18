# Salvage map

What carries from the browser game into the Godot project: where each piece lives here, where it goes in the new
repository and what it becomes in Godot. The first threads in the new project work from it. Paths on the left are in
this repository at the tag `0.1-beta.1`; paths on the right are proposals for the new one.

## How to use it

- **Read the old repository from its tag.** The new Claude project lists this repository beside the new one
  ([SETUP.md](SETUP.md)), so a thread can read any file here. Check out `0.1-beta.1` (`git checkout 0.1-beta.1`) so
  nothing later is read by mistake. Never push to this repository.
- **Copy, don't link.** What carries over is copied into the new repository in the pull request that needs it, so the
  old repository can later leave the project's list without anything breaking.
- **Reference code is read, never run.** The TypeScript under `legacy/` (below) is the tested original of each rule.
  A thread rewrites a system in Godot from it and from its tests, then deletes nothing: `legacy/` stays as the record.
- **Where this map and a doc disagree,** the doc wins: it is what the game did. Each `src/` folder here has a
  `README.md` naming its files, tuning and tests; read that before grepping.

## The new repository's layout

A proposal; the bootstrap thread may change it and records why in the new `docs/DECISIONS.md`.

```
CLAUDE.md                 the repository guide (from NEW_CLAUDE.md)
project.godot
docs/                     live docs: VISION, ART, DECISIONS, ROADMAP, PROCESS, ARCHITECTURE, ASSETS, IDEAS,
                          KNOWN_ISSUES, PLAYTEST, HANDOFF, FEATURES; records/; content/
data/                     the owner's six tables, copied as they are
game/                     Godot scripts and scenes by system: sim/, ai/, nav/, map/, config/, pool/, progress/,
                          stats/, save/, settings/, input/, audio/, render/, ui/
assets/models/            the Blender models (glb) and their sidecars
assets/fonts/             Inter and its OFL licence
tests/                    the unit and scene tests (GUT or gdUnit4)
tools/blender/            the Blender scripts that build the figures
legacy/browser/           read-only reference: the gameplay TypeScript, its tests and the old docs archive
.claude/                  agents, skills and hooks, rewritten for Godot
```

## Design docs and rulings

Copy these into the new `docs/`. Most go across whole; a few need their browser-only parts cut.

| Here | There | How |
|---|---|---|
| `docs/VISION.md` | `docs/VISION.md` | As is: pillars, design rules, tone, visual language. |
| `docs/ART.md` | `docs/ART.md` | As is, except `## Where it lives in the code`, which is rewritten once Godot's renderer exists. |
| `docs/DECISIONS.md` | `docs/DECISIONS.md` | Every gameplay, bot, map, mode, replica, menu, audio and art ruling carries. Cut or rewrite the rulings about Vite, WebGPU and WebGL, the browser, the play link, CI timings and `src/` paths; keep the owner's words and dates. Add this move as the first new ruling. |
| `docs/archive/0.1-beta/DECISIONS.md`, `docs/archive/0.1-dev/DECISIONS.md` | `legacy/browser/docs/` | As is: the full reasons and numbers behind cut-down rulings. |
| `docs/ROADMAP.md` | `docs/ROADMAP.md` | Keep `## What 0.1 is`, its design rules, `## Feature triage`, `## Early Access: the themed updates` (0.2 to 0.5, and what isn't tied to an update), `## 1.0` and `## Parked ideas`. Replace `## Where we are` and `## Builds` with the new project's (it starts at 0.1 Dev 1). |
| `docs/FEATURES.md` | `docs/FEATURES.md` and the 0.1 plan | Every feature the browser game has, by area. It is the parity list: each line is a feature to rebuild, change on the owner's word, or drop. Start the new file empty and fill it as features land. |
| `docs/IDEAS.md` | `docs/IDEAS.md` | As is. |
| `docs/content/*.md` | `docs/content/` | The rulebooks for new maps, modes, replicas, attachments and skins. The rules carry; the commands and file paths in them are rewritten when the content toolkit is. |
| `docs/PLAYTEST.md` | `docs/PLAYTEST.md` | Its headings are what the owner plays, by area. Keep the structure and the "what should happen" lines; rewrite "Get the game running" and "Browsers and builds". |
| `docs/KNOWN_ISSUES.md` | `legacy/browser/docs/` | Reference only. The balance and design rows (`## Bot behaviour`, `## Modes and rules`, `## Pro bots …`) are worth reading before tuning those systems; the engine rows don't apply. The new file starts empty. |
| `docs/PROCESS.md` | `docs/PROCESS.md` | Rewrite: keep Versioning ([VERSIONING.md](VERSIONING.md)), Placing work, Releases (without the play link), Pull requests, Sessions, Models, Decisions and records, Bug pass and Writing docs. Replace Dev tools and The pipeline. |
| `docs/ASSETS.md` | `docs/ASSETS.md` | Keep External assets, Made for the game, Adding a library or tool, Do not use and Licences. Replace the npm Libraries table with the Godot add-ons used. |
| `docs/CC0_ASSETS.md` | `docs/CC0_ASSETS.md` | Keep where to find CC0 assets, formats, Blender step by step, size limits and licences; rewrite the folders section for Godot's import. |
| `docs/ARCHITECTURE.md` | `legacy/browser/docs/` | Reference: the contracts and the map, save and data-table formats below. The new file is written fresh. |
| `docs/records/*.md`, `docs/archive/` | `legacy/browser/docs/` | Reference: why each value is what it is. A record's Decisions section is the place to look before changing a number. |
| `CHANGELOG.md`, `docs/patch-notes/` | `legacy/browser/docs/` | History. The new changelog starts empty under 0.1 Dev 1. |

## The owner's data tables

`data/` holds six Markdown tables the game reads at start; the owner edits them by hand. Copy the folder as it is and
keep the files Markdown: each documents itself, and the format of each is in `docs/ARCHITECTURE.md` › Contracts.

| Table | What it holds | Parser to port | Format |
|---|---|---|---|
| `data/pool.md` | Every replica, power source and part: id, name, tags | `src/pool/poolFile.ts` | `### The pool.md format` |
| `data/stats.md` | How each one shoots and handles: muzzle energy, BB weight, rate of fire, magazines, handling | `src/config/statsFile.ts`, `gameStats.ts` | `### The stats.md format` |
| `data/levels.md` | Levels, XP per match, difficulty multipliers, what each level unlocks | `src/progress/levels.ts` | `### The levels.md format` |
| `data/bots.md` | The bot roster: names and what each personality changes | `src/config/botsFile.ts` | `### The bots.md format` |
| `data/bot-kits.md` | What each bot carries | `src/pool/botKit.ts` | `### The bot-kits.md format` |
| `data/callouts.md` | What the bots call out, and how often | `src/config/calloutsFile.ts` | `### The callouts.md format` |

- **Loading in Godot.** Read each with `FileAccess.get_file_as_string("res://data/<file>")` and port its parser to a
  script under `game/config/` with the same rules: an unreadable cell keeps its built-in number and warns, so a typo
  never stops the game. The parsers' tests (`src/config/stats.test.ts`, `botsFile.test.ts`, `calloutsFile.test.ts`,
  `src/pool/pool.test.ts`, `botKitTable.test.ts`, `src/progress/levels.test.ts`, `src/config/dataTables.test.ts`)
  become the new tests.
- **Export gotcha.** Godot's exporter leaves out files it doesn't import. Add `data/*.md` to the export preset's
  non-resource include filter, or the exported game has no tables.

## Tuning constants

`src/config/` holds every other number, as TypeScript constants with units in comments (`src/config/README.md` lists
them by area). In Godot each area becomes a typed `Resource` script with `@export` fields and a `.tres` holding its
values, so they show in the inspector and stay out of gameplay code. Port the numbers as they are; they were tuned
by play.

| Area | Files here |
|---|---|
| Simulation and movement | `sim.ts`, `movement.ts`, `vault.ts`, `physics.ts`, `footsteps.ts`, `noise.ts` |
| BBs, hits and rounds | `ballistics.ts` (air, hop-up spin, wind, leaves), `hits.ts` (`HITS`, `ROUNDS`), `replicas.ts`, `glowBBs.ts` |
| Modes and matches | `modes.ts`, `matchRules.ts` (rulesets and what fits each mode), `extraction.ts`, `range.ts`, `practice.ts` |
| Bots | `bots.ts` and its parts `botsSenses.ts`, `botsMovement.ts`, `botsSquad.ts`, `botsExtraction.ts`, `botsSkill.ts` (each difficulty); `adaptiveDifficulty.ts`, `squad.ts`, `nav.ts`, `pings.ts`, `magShare.ts`, `callouts.ts` |
| Gear | `attachments.ts`, `optics.ts`, `lasers.ts`, `torches.ts`, `schemes.ts`, `characters.ts`, `figureRig.ts` |
| Words, teams, HUD and controls | `hudText.ts`, `teams.ts`, `controls.ts` (default keys), `menus.ts`, `minimap.ts`, `matchInfo.ts`, `tutorial.ts`, `accessibility.ts` |
| Sound | `sounds.ts` (every synthesised sound's recipe), `audio.ts` |
| Content rules | `content.ts`, `contentRules.ts` (the content checks' ranges, budgets and balance band) |

Rendering, WebGPU, chunk, page and build files (`render*.ts`, `graphics.ts`, `post.ts`, `chunkBudget.ts`,
`rapierWasm.ts`, `page.ts`, `precompress.ts`) don't carry.

## Gameplay code to rewrite from

Copy these folders, tests included, to `legacy/browser/src/` as the reference. Each is pure logic (no Three.js, no DOM)
and unit-tested, which is why it ports well.

| System | Files here | What to keep exactly |
|---|---|---|
| The simulation loop | `src/sim/simulation.ts`, `state.ts`, `events.ts`, `commands.ts`, `character.ts`, `src/core/fixedStepper.ts` | The 60 Hz fixed step and its phase order; one `PlayerCommand` per character per tick with absolute view angles; events as the only channel to presentation |
| Seeded randomness | `src/sim/rng.ts`, `src/core/seed.ts` | Same seed, same match: bots and wind have their own streams |
| BB flight and hop-up | `src/sim/ballistics.ts`, `air.ts`, `hopUp.ts`, `wind.ts`, `bbs.ts`, `ricochet.ts`, `leaves.ts` | Gravity, drag by Reynolds number, Magnus lift from decaying backspin, one midpoint step a tick; bushes that stop BBs |
| Hit calling | `src/sim/elimination.ts`, `hitbox.ts`, `hitFacts.ts`, `figureBody.ts`, `figureLegs.ts` | alive, calling, walking off, out; a hit player can't shoot or be hit; every body stops a BB; hit areas follow the drawn figure |
| Movement | `src/sim/movement.ts`, `aiming.ts`, `lean.ts`, `accuracy.ts`, `vault.ts`, `footsteps.ts`, `armament.ts`, `magShare.ts`, `torch.ts`, `propNoise.ts` | Stances, sprint, lean geometry, vaulting, reloads by magazine, holstering, the magazine hand-off |
| Rounds and modes | `src/sim/round.ts`, `flag.ts`, `overtimeFlag.ts`, `extraction.ts`, `roster.ts`, `rangeTargets.ts`, `rangeChallenge.ts`; `src/matchFlow.ts`, `src/matchSession.ts` | Round clock, score, side swaps, Attack / Defend's flag, Elimination's overtime flag, Extraction's run, the match's flow between rounds |
| Bots | all of `src/ai/` (`src/ai/README.md` is the map), with `src/ai/balance/` | Bots play through `PlayerCommand`, read state and never write it; senses, cover, lanes, team plans, squad orders, callouts, personalities, adaptive difficulty |
| Navigation | `src/nav/navGrid.ts`, `vaultLinks.ts` | The layered 0.2 m grid, 8-neighbour A* pulled into straight legs, step and drop rules, vault links |
| Maps as data | `src/map/` (`mapTypes.ts` is the format) | See Maps below |
| Loadout, levels and records | `src/pool/`, `src/progress/`, `src/stats/` | Kits, saved loadouts, cases, XP and unlocks, match stats and records |
| Saving and settings | `src/save/`, `src/settings/`, `src/input/keyBindings.ts`, `sensitivity.ts` | Which settings exist and their defaults; the save's shape. No migration is needed: no player has a browser save worth carrying |
| The content toolkit | `src/content/`, `pipeline/content-check.mjs`, `.claude/skills/new-content/` | The checks every map, mode, replica and skin passes before going public |

- **Godot shape.** Keep the simulation in plain classes (`RefCounted` or `Object`, not nodes), stepped from one
  `_physics_process` at 60 ticks a second (`physics/common/physics_ticks_per_second`). Bots fill commands before the
  step, as here. Nodes in the scene only read the state and its events, so the simulation still runs headless in tests.
- **Coordinates match.** Three.js and Godot are both right-handed, Y up, metres, with -Z forward, so positions and
  yaw carry without conversion. Depot is written in plan coordinates and turned in `src/map/depot.ts`: export after
  that turn.
- **Physics.** Here Rapier answers the simulation's ray casts and moves the character (`src/physics/physicsWorld.ts`,
  behind `WorldQuery` and `CharacterMover`). In Godot, Jolt (built in since Godot 4.4) or Godot Physics answers the
  same two interfaces. Keep the interfaces; the simulation never calls the physics engine directly.
- **Navigation.** Recommended default: port the nav grid as it is, because bots' routes, drop rules and vault links are
  tuned to it and it runs headless. Godot's `NavigationServer3D` with navigation links for vaults is the alternative,
  worth weighing once a map is built in Godot.

## Maps

Three fields and the practice range, as plain data: `src/map/depot.ts`, `woodland.ts`, `neonHeights.ts`, `range.ts`,
with `woodlandExtraction.ts`, `neonHeightsExtraction.ts`, `extractionBlock.ts` and each map's `*Dressing.ts`. The
format is `src/map/mapTypes.ts` and `docs/ARCHITECTURE.md` › Map data.

- **What a map holds.** Blocks (axis-aligned boxes and ramps with a visual kind), the kill height, spawns and dead
  zones per end, bot lanes, the flagpole, the overtime flag, storeys, overlooks, named areas for callouts, bushes,
  terrain, lights, signs, decor, ground surfaces, ambience, night, the Extraction block (insertions, exits, home-team
  starts, case spots, regen points) and set dressing.
- **Getting it out.** Several maps are computed (plan coordinates turned, dressing placed from a seed), so export the
  finished data rather than copying the TypeScript. Recommended: a throwaway Vitest file in a checkout of the tag
  (never committed here) that calls `mapData(id)` from `src/map/maps.ts` for each map and writes it as JSON into the
  new repository's `data/maps/`. Vitest runs it because it already resolves the map modules' imports.
- **What it becomes.** A Godot importer builds each map's greybox scene (meshes and static colliders) from the JSON,
  and the same JSON feeds the nav grid, spawns and modes. Art replaces the greybox later, in Blender, around the same
  layout: the layouts were playtested and are the part to keep.
- **The rules every map keeps** (on the floor, ramps, team colours, sightlines, walk times, an overtime flag each end
  reaches about equally fast) are `src/content/mapChecks.ts`; port them as the new map checks.

## Models and assets

| Here | There | Notes |
|---|---|---|
| `src/assets/models/characters/human.glb`, `robot.glb` | `assets/models/characters/` | The rigged figures: a 65-bone skeleton shared by both, LOD1 and LOD2, 32 clips. Packed with meshopt (`EXT_meshopt_compression`; the human's textures are WebP). Unpack each first with `node tools/blender/bot-figure/unpack.mjs <packed.glb> <plain.glb>` (run from this repository's root after `npm ci`), then import the plain file. |
| `src/assets/models/characters/human.json`, `robot.json` | beside the figures | Sidecars: clip lengths, loops and speeds, `fitTo`, first-person parts to hide, `replicaOnGrip` (where each replica sits on `Grip_R`), `magazineInHand`. |
| `src/assets/models/replicas/aeg.glb`, `pistol.glb`, `cyber.glb` | `assets/models/replicas/` | First-person and figure versions with their animations (fire, selector, reload, inspect, slide lock). Plain glTF. |
| `src/assets/models/replicaParts/*.glb` | `assets/models/replicaParts/` | Sights, scopes, grips, barrels, silencers, torches, lasers, magazines. |
| `src/assets/models/powerSources/*.glb` | `assets/models/powerSources/` | Batteries and the gas bottle. |
| `src/assets/fonts/*.woff2`, `OFL.txt` | `assets/fonts/` | Inter, SIL OFL 1.1. Godot reads WOFF2; the full TTF from the Inter project is also fine. |
| `tools/blender/bot-figure/` | `tools/blender/bot-figure/` | Every script that builds the figures, in load order (its `README.md`). `pack.mjs` is for the web build only and stays behind. |
| `docs/ASSETS.md` rows | the new `docs/ASSETS.md` | Every model is the project's own work ("Made for the game"); copy each row with its file path changed. |

- **The .blend sources.** The owner keeps `cyber_pistol_v2.blend`, `aeg_rifle_v2.blend` and `gbb_pistol.blend`; the
  figures' and the attachments' .blend files were in earlier Claude project files and aren't in this project's shared
  folder (checked 2026-10-18). The glb files above carry every mesh, rig and clip, and Blender imports them, so nothing
  is lost if a .blend is missing.
- **Menu pictures** in `public/menu/` are renders of the browser game and don't carry: Godot renders its own.
- **No sound files exist.** Every sound is synthesised from a recipe in `src/config/sounds.ts` by `src/audio/dsp.ts`.
  Recommended: render each recipe to a WAV once (an offline audio render of the old build) and import those as the
  first sounds, then replace them with CC0 or recorded ones. Positional playback, attenuation and the mix
  (`src/audio/audioMix.ts`, `occlusion.ts`, `voiceLimit.ts`) are reference for Godot's `AudioStreamPlayer3D` and
  audio buses.

## Tests as specs

The tests say what each system must do. When a system is rewritten, its tests are rewritten with it, in the same
pull request, and pass before it merges.

- **Unit tests** beside each file here (`*.test.ts`): ballistics, hop-up, hit calling, rounds, flag, overtime,
  Extraction, nav grid, bots' senses and tactics, the data-table parsers.
- **The match guards** (`src/ai/depotMatch*.test.ts`, `*Match*.test.ts`): whole headless matches that check what must
  never happen (rounds unsettled, bots stuck, falling or hit by a teammate, each mode's rules). They are
  seed-sensitive; re-measure over 16 seeds before changing a threshold. Rebuild them early: they are what lets bots
  change safely.
- **The bot balance report** (`pipeline/balance.mjs`, `src/ai/balance/`): who wins, the first hit, Extraction's get-out
  rates. Measured, never asserted.
- **Browser specs** (`e2e/*.spec.ts`) describe what the screens do; read them for behaviour, not for code.

## Process and agents

| Here | There | How |
|---|---|---|
| `.claude/agents/critic.md`, `qa.md`, `performance.md` | `.claude/agents/` | Keep each agent's job, checks and verdict; rewrite the tools (GUT or gdUnit4 instead of Vitest and Playwright, Godot's profiler and monitors instead of the browser's frame timings). |
| `.claude/agents/changelog.md`, `triage.md`, `worker.md` | `.claude/agents/` | Nearly as is; change paths and the game's description. |
| `.claude/skills/pipeline/`, `new-content/` | `.claude/skills/` | Keep the steps and the attempt rule; rewrite the commands. |
| `.claude/hooks/read-guard.mjs` | `.claude/hooks/` | As is if Node is installed in the cloud environment: it stops whole-file reads of big files. |
| `pipeline/README.md` | the new pipeline's README | The protocol (roles, the eight steps, verdicts and attempts, the Review line) carries; the gate scripts are rewritten for headless Godot. |
| `pipeline/perf-budget.json` | reference | The targets carry (below); the browser numbers don't. |
| `.github/workflows/check.yml` | `.github/workflows/` | Rewritten: run the tests with `godot --headless`, export a Windows and a Linux build, check the Review line. |

- **Performance targets (owner, 2026-10-16).** The Low preset holds 60 FPS on modern low-powered hardware. Ultra
  targets a 4K, 240 Hz class PC (the owner's: Ryzen 9 9950X3D, 64 GB, RTX 5090). Frame-time consistency and input
  latency matter more than peak FPS. Budget lines are set from a measured Godot baseline and are never raised to pass
  a check.

## What doesn't carry

| Here | Becomes in Godot |
|---|---|
| Three.js rendering, WebGL2 and WebGPU back ends, post effects, baked light probes (`src/render/`, `src/map/bakes/`) | Godot's Forward+ renderer, its `Environment`, lightmaps or SDFGI, mesh LOD, occlusion culling and visibility ranges. The quality presets' intent (what each drops) is in `docs/DECISIONS.md` › Performance budgets |
| Rapier (`src/physics/`) | Jolt or Godot Physics behind the same `WorldQuery` and `CharacterMover` |
| Web Audio (`src/audio/`) | `AudioStreamPlayer3D` and buses, with the rendered or CC0 sounds |
| Pointer Lock and DOM input (`src/input/pointerLock.ts`, `keyboard.ts`) | Godot's input map and `Input.mouse_mode` captured |
| The HTML and CSS menus and HUD (`src/ui/`, `src/style.css`) | `Control` scenes with one `Theme`; the words (`src/config/hudText.ts`) and the approved layouts carry |
| The browser's state handling (hidden tabs, focus, fullscreen, the other-tab lock, `localStorage`) | Godot's window and focus notifications, and saves under `user://` |
| Vite, the chunk budget, the play link (`vite.config.ts`, `src/config/chunkBudget.ts`, `.github/workflows/pages.yml`) | Godot's export presets and an install size budget |
| Vitest, Playwright, the gate scripts (`pipeline/*.mjs`, `e2e/`) | GUT or gdUnit4 tests run headless, and a rewritten gate |
| The npm libraries and `third-party-licences.txt` | Godot's own licence and notices (`Engine.get_license_text()`, `Engine.get_copyright_info()`) plus each add-on's, shown from a credits screen |
