# Handover to the Godot project

The pack the new Airsoft repository starts from. It is written for a reader who has never seen this repository: the
owner, and every Claude Code session in the new project. Read this file first, then the one your job needs.

## What happened

- **The game is moving from the browser to an installable desktop game (owner, 2026-10-18).** It is built with Godot
  and Blender, by Claude Code, in a new repository. It is the same game, not a sequel: the owner's words were "I don't
  want to build Airsoft 2 and simply change the course of development for this project".
- **A new repository, not a fork (owner, 2026-10-18).** A fork would carry about 960 TypeScript files and 280 pull
  requests of browser history that Godot never runs. The new repository starts clean and copies what carries over,
  listed in [SALVAGE.md](SALVAGE.md).
- **This repository is frozen at the tag `0.1-beta.1` and dormant.** The owner tags 0.1 Beta 1 here; after that nothing
  is built, fixed or merged in it. It stays readable as the reference: a working, tested original of every system.
- **The new project restarts at 0.1 Dev 1** with the same version format ([VERSIONING.md](VERSIONING.md)).

## What carries over

The design, not the engine. Every rule the owner has made, the data tables, the maps' layouts, the bots' design, the
replicas' numbers, the Blender models and their scripts, and the gameplay code as a reference to rewrite from. The
browser parts (Three.js rendering, Rapier physics, Web Audio, Pointer Lock input, the HTML menus and HUD, and the Vite,
Vitest and Playwright pipeline) are rebuilt the Godot way. That is most of the lines but not most of the thinking.

## The files

| File | For | What it holds |
|---|---|---|
| [SETUP.md](SETUP.md) | The owner, after he tags 0.1 Beta 1 | Numbered steps: the new repository, the GitHub App, the new Claude project, the first threads |
| [VERSIONING.md](VERSIONING.md) | Every session | The restart at 0.1 Dev 1, the version names and tags, and what this repository's versions mean |
| [SALVAGE.md](SALVAGE.md) | The first threads | What carries over, where it lives here, where it goes in the new repository and what it becomes in Godot |
| [PROJECT_INSTRUCTIONS.md](PROJECT_INSTRUCTIONS.md) | The owner, pasted into the new Claude project's settings | The project instructions, rewritten for Godot |
| [NEW_CLAUDE.md](NEW_CLAUDE.md) | The first thread, copied to the new repository as `CLAUDE.md` | The repository guide, rewritten for Godot |

## Open decisions for the owner

Each has a recommended default, so the first threads can start without waiting; the owner can change any of them.

1. **GDScript or C#.** Recommended: **GDScript with static typing everywhere**, because it is Godot's first-class
   language, needs no .NET toolchain and is what most Godot documentation and examples use.
2. **What 0.1 is in the new project.** Recommended: the browser game's 0.1 rebuilt in Godot, its core slice first
   (Depot, the AEG and the GBB Pistol, bots, Elimination), then the rest of `docs/FEATURES.md` across the Dev builds.
   The themed updates after 0.1.0 stay as `docs/ROADMAP.md` › Early Access plans them.
3. **Platforms.** Recommended: Windows first (the owner's PC), Linux exports from CI; macOS when the owner wants it.
4. **Where players get it.** Not needed until 0.1.0; itch.io and Steam are the usual choices.

## What the owner's reference sheets are

Seven concept pictures the owner gave for a possible future look ("Project Depot": a first-person Depot shot, a
visual design sheet, weapon handling, player models, an A-site shot and a Depot overview) are in the old Claude
project's shared files, `concepts/graphics-overhaul/reference/`. They are AI-generated style targets, not licensed
art, and nothing in them may ship. A first attempt at matching them in the browser game was dropped (2026-10-18):
the owner expects such a concept to show the whole look prototyped (figures, hands, props, layout), not a palette.
Act on them only when he raises them.
