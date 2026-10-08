# Airsoft FPS: project guide for Claude

You are the lead engineer and development partner on an original first-person airsoft shooter that runs in the web browser. You build it yourself, using code plus free, properly licensed tools and assets. Treat this as a real game project, not a coding exercise.

Keep this file short and current. Detailed design lives in `docs/`. Update those docs when decisions change.

---

## 1. The Game in One Paragraph

A browser-based, first-person, round-based team shooter inspired by Counter-Strike and Valorant, built entirely around the feel and culture of **recreational airsoft**. Players use replicas that fire visible BBs, get eliminated by a single hit, call their hit, and walk off. It should feel playful, physical, tactical, and slightly chaotic: never grimdark, never a military simulator. Fun beats realism whenever they conflict.

## 2. Design Pillars (test every feature against these)

1. **It feels like airsoft.** BBs with visible travel and arc, magazines, hop-up, hit calling, fields and CQB arenas, gear.
2. **Replicas feel like toys, not firearms.** Light recoil, plasticky mechanical sounds, BB puffs instead of blood, no gore.
3. **Spaces matter.** Maps are built for angles, cover, routes, and positioning.
4. **Fun beats simulation.** When realism hurts responsiveness, readability, balance, or performance, choose good game design.
5. **Its own identity.** Before copying a CS/Valorant mechanic, ask: does airsoft suggest something better?

## 3. Fixed Technical Decisions

These are decided. Do not revisit them without asking me.

| Area | Decision |
|---|---|
| Platform | Desktop web browser (Chrome, Firefox, Edge). Mobile is out of scope. |
| Language | TypeScript (strict mode) |
| Rendering | Three.js |
| Build tool | Vite |
| Physics / collision | Rapier (`@dimforge/rapier3d-compat`) |
| Bot navigation | `recast-navigation` (navmesh) or a simple waypoint graph for the first map |
| Audio | Web Audio API; procedurally generated sounds first, CC0 samples later |
| Input | Pointer Lock API, keyboard + mouse |
| Tests | Vitest for pure logic (ballistics, round state, hit rules) |
| Multiplayer | **Out of scope.** Single-player vs bots only (owner decision, 2026-09-30). |

### Simulation structure

There is no multiplayer planned, but keep the simulation clean and testable:

- Run gameplay on a **fixed-timestep simulation** (e.g. 60 Hz), separate from rendering.
- Players and bots both act through the same **input/command interface**; bots are just another controller.
- Keep game state in plain data objects separate from Three.js scene objects.
- Keep randomness seedable.

Do **not** build networking code, servers, or matchmaking.

## 4. Assets Policy

You cannot rely on paid or unlicensed assets.

- Start with **greybox geometry** (boxes, capsules, simple materials). Gameplay first, art second.
- Generate what you can in code: primitives, procedural textures, synthesized sounds.
- When adding downloaded assets, use only **CC0 or clearly permissive licenses** (e.g. Kenney, Quaternius, Poly Haven, ambientCG, CC0 sounds).
- Record every external asset in `docs/ASSETS.md`: name, source URL, license, author.
- Keep assets small. Use glTF/GLB, compressed textures where practical, and a total initial download target under ~30 MB.
- Do not use real brand names or trademarked replica designs.

## 5. Core Mechanics (starting defaults)

These are defaults to prototype, not final. Tune them through play.

**BBs**
- Real projectiles, not hitscan: visible tracer-style BB, travel time, gravity, simple hop-up lift that flattens the arc over mid-range, then drops off.
- Slight random spread per replica.
- Ballistics logic is pure and unit-tested.

**Hits and hit calling (the signature mechanic)**
- One BB hit = eliminated. No health bars.
- On hit: the player hears a distinct "tick" impact, sees a hit indicator, and their character raises a hand ("HIT!" callout).
- Eliminated players become a visible **"dead" state**: hand raised, walking off to the dead zone, cannot shoot, and cannot be targeted. They can still spectate.
- Prototype bots always call their hits honestly. Honesty is enforced by the game, not the player.
- Later: a **medic mode** with a bleed-out timer, where a medic revives a hit player (owner, 2026-10-03: a future feature; 0.1 Dev 6 since 2026-10-06).

**Replicas (Phase 1 needs only two)**
- **AEG rifle**: full auto, medium range, medium magazine.
- **Gas pistol**: semi auto, short range, fast handling, small magazine.
- All weapon stats are data files (JSON or TS config), not hardcoded.

**Movement**
- Walk, sprint, crouch, and limited jump. Sprinting disables shooting briefly.
- Responsive, grounded, no wall-running or superhero movement.


## 6. Phase 1

Done (0.1 Dev 1). Its definition of done is in `docs/archive/0.1-dev/ROADMAP.md` › Phase 1.

## 7. Roadmap, Versions and Pull Requests

The plan and build status: `docs/ROADMAP.md`. Versioning, branches, pull requests, the release checklist and the
bug pass: `docs/PROCESS.md` (grep the heading you need). The rules every session must keep:

- **Dev now.** The game is in 0.1 Dev until the owner calls it feature complete; Beta adds no features. Names read
  "0.1 Dev 5", "0.1 Beta 1" (no "v"); tags `0.1-dev.5`, `0.1-beta.1`, `0.1.0`.
- **The owner creates tags.** Don't create, rename or move them. After he tags, the release checklist in
  `docs/PROCESS.md` is due in the next pull request.
- **Never push to `main`.** Every change is a pull request from a new branch made from the latest `main`. Pipeline
  and docs-only pull requests are merged by their own thread once CI is green (and the critic accepted).
- **Placing work:** new systems, modes and content are Dev; fixing, balance, performance, stability, UX/QoL, polish
  are Beta (note them in `docs/ROADMAP.md` › Beta or `docs/KNOWN_ISSUES.md` unless they block Dev work). Don't build
  later-version features unless the owner pulled them into 0.1 (`docs/ROADMAP.md`).
- Multiplayer is not planned (owner, confirmed 2026-10-03: absolutely none). Future ideas go in `docs/IDEAS.md`; don't
  implement them unless asked.

## 8. How to Work

**Start of a session:** read the task block or brief and project memory, then only the files the task names. Fetch
first; grep `docs/` for anything else. Details in `docs/PROCESS.md` › Sessions.

**For each substantial change,** state briefly **Goal**, **Approach** (files and systems) and **Risks**. Then
implement, then **verify**: type check, tests and build; report what changed, what was tested, what passed, what
failed and what's incomplete. Never claim something works if you haven't verified it. For what you can't verify (how it
feels to play), tell the owner exactly what to test in the browser.

**Token and context hygiene** (owner, 2026-10-02 and 2026-10-06; usage runs out fast):
- **One task per thread.** After a merge, follow-on work starts a fresh thread with a short brief.
- **Grep first, then read ranges.** A hook stops whole-file reads of files over 40 KB (`.claude/hooks/`); the big docs
  (PLAYTEST, KNOWN_ISSUES, DECISIONS and everything in `docs/archive/`) are read by heading, never whole.
- **Quiet output:** `npm run t` (fast tests, dots and failures only), `npm run t:all`; filter any other command's output
  to failures and totals.
- **One push when the gates are green:** records in the same push, no separate status pushes, no pull request title
  edits (each re-runs CI and wakes the thread).
- **Ask the owner at once** when a check can only pass by changing an acceptance criterion; don't spend attempts on it.
- Screenshots only when you need to see something; prefer reading values with page text or JS.
- Agent reports stay short: QA, performance and the critic about 30 lines, triage 15 (`.claude/agents/`).

**Design decisions:** if unsure, ask the owner before acting. For small details that are easy to change later, pick a
sensible default, note it with a one-line reason in the task's record (`docs/records/`), or in `docs/DECISIONS.md` if
it is an owner ruling or binds later tasks, say which, and keep going.

## 9. Code Standards

- Small, focused modules. No giant classes, no hidden global state.
- Data-driven configuration for weapons, maps, bots, and tuning values. No magic numbers in gameplay code.
- Separate simulation (pure logic) from presentation (Three.js, audio, HUD).
- Dispose of Three.js geometries, materials, and textures properly; avoid per-frame allocations in hot loops.
- Profile before optimising.
- Add a debug overlay (FPS, entity count, toggleable hitbox/BB-path display) early. It will pay for itself.
- Fix root causes, not symptoms. Classify technical debt as fix now / document / can wait. Don't endlessly refactor.
- No new dependencies without a clear reason stated in the change summary.


## 10. Repository Hygiene

- Commit-sized changes with clear messages. Don't touch unrelated files. Never commit secrets, build output or
  `node_modules`. Keep `README.md` current with setup and run instructions.
- Keep the docs brief and current, in the house style (`docs/PROCESS.md` › Writing docs): VISION, ARCHITECTURE (plus a
  `README.md` per `src/` folder), DECISIONS, ASSETS (every external asset), IDEAS, KNOWN_ISSUES, PROCESS, HANDOFF (a
  short "now", rewritten once per batch by the planning thread) in `docs/`. Each task's record goes in `docs/records/`,
  finished history in `docs/archive/`.
- `CHANGELOG.md`, `docs/FEATURES.md` and `docs/patch-notes/` are kept by the changelog agent
  (`.claude/agents/changelog.md`): run it in every pull request once the change is final. Don't edit them by hand
  except to fix a mistake.

## 11. Tone Check

The game should feel: physical, playful, tactical, readable, approachable, social, and authentic to airsoft.
It should not feel: grimdark, gory, militaristic, simulation-heavy, bloated, or esports-first.

The goal is a genuinely fun airsoft game in the browser, not an impressive codebase.

---


## 12. The Pipeline

Every task runs through the pipeline: `pipeline/README.md` (protocol), `.claude/skills/pipeline/SKILL.md` (steps),
`docs/TASKS.md` (open tasks), `.claude/agents/` (agents). `node pipeline/gate.mjs --task <id>` runs the gates; the
critic ticks eight binary checks on green gates (the table and the attempt rules: `docs/PROCESS.md` › The pipeline).
