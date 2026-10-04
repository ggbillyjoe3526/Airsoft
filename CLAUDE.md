# Airsoft FPS — Project Guide for Claude

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
- Later: a **medic mode** with a bleed-out timer, where a medic revives a hit player (owner, 2026-10-03: a future feature, proposed for v0.2).

**Replicas (Phase 1 needs only two)**
- **AEG rifle**: full auto, medium range, medium magazine.
- **Gas pistol**: semi auto, short range, fast handling, small magazine.
- All weapon stats are data files (JSON or TS config), not hardcoded.

**Movement**
- Walk, sprint, crouch, and limited jump. Sprinting disables shooting briefly.
- Responsive, grounded, no wall-running or superhero movement.

## 6. Phase 1 Goal: Playable Single-Player Slice

### Definition of done

- Game loads in the browser from `npm run dev` and from a static production build.
- Click to play, pointer lock, WASD + mouse controls.
- One small greybox map (warehouse or CQB arena) with cover, 2–3 routes, and clear sightlines.
- Two replicas (AEG + pistol) with reloads, ammo counter, and weapon switching.
- BB projectiles with travel time, arc, and visible trails.
- One-hit elimination with hit calling for players and bots.
- Bots that patrol, take cover roughly, spot the player, and shoot with human-like reaction time and inaccuracy.
- Round flow: 3v3 (player + 2 bots vs 3 bots), elimination wins the round, first to 5 rounds wins the match.
- Minimal HUD: crosshair, ammo, round timer, score, hit feedback.
- Runs at a stable **60 FPS** on a mid-range laptop with integrated graphics.
- Unit tests pass for ballistics, hit rules, and round state.

### A player must be able to

Spawn, understand the goal, move naturally, fire BBs, feel the replica, hit a bot, understand when they themselves were hit, finish a round, and want to play another.

**Out of scope for Phase 1:** multiplayer, objectives, progression, cosmetics, menus beyond a start screen, real art assets.

## 7. Roadmap After Phase 1

Move on only when the previous phase is actually fun. Validate before expanding.

Phases and milestones are development steps, not versions: all of Phases 1–4 build the initial **v0.1** product.
**Current focus: alpha.** The game stays in alpha through Phase 4, until the owner calls it feature complete.
Detailed plan and build status: `docs/ROADMAP.md`.

v0.1 is the core game with strong foundations (owner, 2026-10-01): two replicas (AEG, gas pistol), Depot,
Elimination and Attack / Defend.

1. **Phase 2 — Core gameplay (alpha, ships as `v0.1-alpha.2`):** controls, footsteps and sound, reload animations, hit reactions, smarter bots, the Attack / Defend objective mode, all on Depot.
2. **Phase 3 — Core foundations (alpha, `v0.1-alpha.3`):** leaning (Q / E peek), magazines and meaningful reloads (limited ammunition), a BB physics pass, movement and positioning over raw weapon stats, the audit fixes and elevation support (ramps, raised floors).
3. **Phase 4 — Feel, presentation and onboarding (alpha):** weapon handling from the owner's `v0.1-alpha.3` playtest (fire modes, faster reloads, crouch toggle, steadier aim when still, optics as accessories with aiming down sights), a Depot rework to the field checklist (moved from Phase 3, owner, 2026-10-02), the Loadout (owner, 2026-10-03: primary and secondary replica, BB weight, hop-up, optics, grips, magazines), an audio rework, comfort, accessibility and browser basics (owner, 2026-10-03: invert mouse, reduced motion, aim and sprint toggles, colour-blind options, sound cues, pause on a hidden tab, fullscreen), match info (hit feed, teammate markers, scoreboard, end-of-match summary, local records, crosshair options), custom matches (rounds, round time, team size, teammate and opponent difficulty, a ricochets setting off by default), a practice range, three squad orders for bot teammates, art pass, VFX and lighting, proper menus and a full settings screen (incl. accessibility options), onboarding.
4. **Beta (when the owner calls the game feature complete):** optimisation, final balance and tuning, bug fixing, stability, UX/QoL and polish.

**After v0.1 (later versions, proposed in `docs/ROADMAP.md`):** more modes (TDM, Capture the Flag,
Domination, Bomb), more fields, replica platforms that differ mechanically (GBBR, spring sniper, SMG,
shotgun, DMR, LMG …), bigger loadouts (gear, pouches and more parts, free from the start), chrono and tracer BBs, gas
simulation, grenades, smoke and flash bombs, a medic mode, bigger teams (4v4 / 5v5), day and night maps, customisation,
unlock-based progression (never levels), and team communication (wheel, pings, hand signals) once the bots are good enough. Don't build these during v0.1.

**Placing work:** new systems, modes and content (maps, replicas, menus, art) are alpha; fixing, balance,
performance, stability, UX/QoL, polish and final tuning are beta. During alpha, note beta-type work in
`docs/ROADMAP.md` (Beta) or `docs/KNOWN_ISSUES.md` unless it blocks alpha work.

### Versioning (authoritative policy)

The number describes the product; an `-alpha`/`-beta` suffix describes its development state. Never move to
`v0.2` just because a phase ends, time passes or small improvements pile up.

| Version | Meaning |
|---|---|
| `v0.1-alpha`, `v0.1-alpha.2`, `v0.1-alpha.3` … | **Alpha**: building the game. Systems and content can be added, gameplay can change a lot, breaking changes are fine, not feature complete. Each build number (`.2`, `.3`) is a full alpha release. In-between playtests use plain commits, never a tag. |
| `v0.1-beta`, `v0.1-beta.2`, `v0.1-beta.3` … | **Beta**: starts when the owner calls the planned game feature complete. Bug fixes, balance, performance, stability, UX/QoL, polish, final tuning; no major new systems unless the owner approves. Open-ended number of builds. |
| `v0.1` | First public release of the completed initial game, when the owner considers it a stable public product (not when a phase ends). |
| `v0.1.1`, `v0.1.2` … | Fixes, performance, balance, small UI/UX or accessibility improvements, minor tuning, small content additions, maintenance. |
| `v0.2`, `v0.3` … (each with `.x` maintenance) | A substantially expanded or evolved product: major new systems or modes, a large content expansion across systems, a core-loop redesign. No feature-count threshold; contents are not predefined. |
| `v1.0` | The release the owner considers fully mature and stable. |

- Milestones and critic cycles give development granularity; they don't each get a version.
- Git tags use the dotted forms above, always with a dot (e.g. `v0.1-alpha.2`, never `v0.1-alpha-2`). Only full
  releases are tagged (owner, 2026-10-01): no letter checkpoints (`.2a`, `.2b`); the old ones are removed.
  The owner creates tags; don't create, rename or move them unless asked.
- **After the owner tags a release** (owner, 2026-10-03), the docs move to the new tag without being asked. The
  first pull request after a new tag (or a small docs-only one, if no other work is open) updates, to match the
  owner's release description:
  1. `README.md`: the title, the intro paragraph and its "New since …" list, the download link
     (`.../archive/refs/tags/<tag>.zip`), the unzipped folder name (`Airsoft-<tag without the v>`, e.g.
     `Airsoft-0.1-alpha.3`) and the "What's in …" section.
  2. `docs/ROADMAP.md`: the builds table and the status rows that mention the release.
  3. Any other "latest release" mention: run `grep -rn "alpha\.[0-9]\|beta\.[0-9]" README.md docs/ CLAUDE.md src/config/`
     and update each line that names the previous release as current (history and policy examples stay as they are).
     The title screen's version needs nothing: it comes from `git describe` as the game is built (M24).
  4. The change records (owner, 2026-10-04): run the changelog agent (`.claude/agents/changelog.md`) with
     `--release <tag>`. It closes the `Unreleased` section of `CHANGELOG.md` under the tag, writes the player-facing
     `docs/patch-notes/<tag>.md` and the README's "New since …" paragraph.
- **Pull requests** (owner, 2026-10-02): every change lands as a pull request that the owner reviews and merges.
  Work on a new branch made from the latest `main` (one per milestone or batch), push that branch, and open a pull
  request into `main`. **Never push to `main` and never merge a pull request yourself**, whatever else in this
  repo says. One pull request may hold several commits.
- **Branches** (owner, 2026-10-01): `main` holds the latest stable release.
  - **Now (the v0.1 cycle):** work reaches `main` only when the owner merges its pull request, and the tagged
    commits on `main` are the releases.
  - **Later (about when v0.1 is done and v0.2 starts; the owner decides when):** day-to-day work happens on an
    `alpha` branch. A build ready for testing is merged into `beta`; once tested, it is merged into `main` and tagged.
    From then on, never push unreleased work to `main`.

Multiplayer is not planned (owner, confirmed 2026-10-03: absolutely none).

Future ideas (modes, clans, community scenarios, etc.) go in `docs/IDEAS.md`. Do not implement them unless asked.

## 8. How to Work

**At the start of the project** (nothing exists yet):
1. Propose the folder structure and initial setup in a few lines.
2. Scaffold the Vite + TypeScript + Three.js + Rapier project.
3. Get a single scene running: a floor, a box, and a first-person camera that moves.
4. Then build Phase 1 in small steps, each leaving the game runnable.

**At the start of every later session:** read `docs/HANDOFF.md` first, then this file and `docs/`, check the repository state and git log (and `git ls-remote --tags origin`: a tag newer than the one `README.md` names means the release checklist in §7 is due), then continue from where we left off.

**At the end of every session** (or when the owner says usage is running out): rewrite `docs/HANDOFF.md` for the next session (where we are, what's next and any half-made plans, open questions, gotchas; about a screen; replace it, don't append), then commit it on the working branch and push it with the rest, so it is part of the pull request.

**For each substantial change,** state briefly:
- **Goal:** what it achieves
- **Approach:** which files/systems change
- **Risks:** anything technical or gameplay-related worth flagging

Then implement, then **verify**: run the type checker, tests, and build, and report what changed, what was tested, what passed, what failed, and what's incomplete. Never claim something works if you haven't verified it. For things you can't verify yourself (how it feels to play), tell me exactly what to test in the browser.

**Context hygiene** (owner, 2026-10-02; the context window fills up fast on long sessions):
- **One milestone per session.** After a milestone is accepted and committed on its branch, rewrite `docs/HANDOFF.md` on the same branch, push, open the pull request (or update it), and tell the owner it's ready to review and a good point to start a fresh session.
- Read files in ranges (grep first, then only the lines you need), and filter command and test output (e.g. only failures and totals).
- Take screenshots only when you need to see something; prefer reading values with page text or JS.
- Keep critic reports short (`.claude/agents/critic.md` caps them at ~300 words).

**Design decisions:** if you're unsure about something, ask me before acting (owner, 2026-10-02). For small details that are easy to change later, choose a sensible default, note it in `docs/DECISIONS.md` with a one-line reason, say which you chose, and keep going.

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

- Commit-sized changes with clear messages. Don't touch unrelated files.
- Never commit secrets, build output, or `node_modules`.
- Keep `README.md` current with setup and run instructions.
- Maintain these docs, briefly:
  - `docs/VISION.md` — pillars and tone
  - `docs/ARCHITECTURE.md` — how systems fit together
  - `docs/DECISIONS.md` — decisions and why
  - `docs/ASSETS.md` — asset sources and licenses
  - `docs/IDEAS.md` — future features, not yet approved
  - `docs/KNOWN_ISSUES.md`
  - `docs/HANDOFF.md` — where the last session left off (rewritten each session)
  - `CHANGELOG.md`, `docs/FEATURES.md`, `docs/patch-notes/` — kept by the changelog agent
    (`.claude/agents/changelog.md`, owner, 2026-10-04): run it in every pull request once the change is final, with
    the task id, the pull request title, a short diff summary and any new DECISIONS lines; it adds the `Unreleased`
    line(s) and the feature list's line. Don't edit those three by hand except to fix a mistake.

## 11. Tone Check

The game should feel: physical, playful, tactical, readable, approachable, social, and authentic to airsoft.
It should not feel: grimdark, gory, militaristic, simulation-heavy, bloated, or esports-first.

The goal is a genuinely fun airsoft game in the browser, not an impressive codebase.

---

## 12. Critic Agent (Quality Gate)

Every completed feature or substantial change goes through a critic review before it is considered done. The critic is a separate reviewing role whose only job is to find problems. It is not there to defend the work.

### How to run the critic

- Where possible, run the critic as a **separate subagent** (e.g. `.claude/agents/critic.md`) with fresh context, so it judges the result rather than remembering the intent behind it.
- The critic reviews the actual code, the diff, and test/build output. It must run the type checker, tests, and build itself instead of trusting earlier reports.
- The critic must be skeptical. An honest 7 is more useful than a generous 9.

### Scoring rubric

Score each criterion from 0–10, then compute the weighted total (one decimal place).

| Criterion | Weight | What a 10 looks like |
|---|---|---|
| **Correctness** | 25% | Does exactly what was intended; type check, tests, and build all pass; no known bugs. |
| **Design pillar fit** | 20% | Clearly strengthens the airsoft identity and tone (Section 2 and Section 11). |
| **Game feel & readability** | 20% | Responsive, clear feedback; a new player would understand it. |
| **Code quality** | 15% | Follows Section 9: small modules, data-driven, simulation separate from presentation. |
| **Performance** | 10% | No frame drops, leaks, or per-frame allocations in hot paths; still meets 60 FPS target. |
| **Scope discipline** | 10% | Does what was asked, nothing speculative, no unrelated changes. |

**Automatic caps** (these override the weighted total):
- Type check, tests, or build fail → score capped at **5**.
- Game no longer runs in the browser → score capped at **3**.
- Violates a fixed technical decision (Section 3) or the assets policy (Section 4) → capped at **6**.

### Score thresholds

Stricter thresholds and a fourth attempt since owner decision 2026-10-02.

| Score | Verdict | Action |
|---|---|---|
| **< 8.0** | Restart | Revert the attempt (e.g. `git stash`/reset to the pre-attempt commit) and try again with a different approach informed by the critic's feedback. |
| **8.0 – 8.9** | Rework | Keep the attempt and fix the specific issues the critic listed. |
| **9.0 – 10** | Accept | Commit and move on. |

### Attempt limit

- Maximum of **4 attempts** per feature to reach 9.0.
- If attempt 4 scores **8.0 or higher**, auto-accept it, commit it, and log the critic's remaining issues in `docs/KNOWN_ISSUES.md`.
- If attempt 4 scores **below 8.0**, do not accept it automatically. Restore the best-scoring attempt, stop, and report to me what went wrong across all attempts so we can decide together (the feature may be too large and need splitting, or the design may be wrong).

### Critic report format

After each review, the critic outputs:

```
Feature: <name>
Attempt: <n> of 4
Scores: Correctness x | Pillar fit x | Feel x | Code x | Performance x | Scope x
Caps applied: <none / which>
Total: x.x → <Restart / Rework / Accept>
Top issues (most important first):
1. ...
2. ...
Must-fix before next attempt: ...
```

Keep a one-line entry per feature in `docs/REVIEWS.md` (feature, attempts used, final score).

### Limits of the critic

- The critic cannot truly judge **how the game feels to play**. For game feel, it scores based on code evidence (feedback timing, tuning values, clarity) and lists specific things for **me** to test in the browser. My playtest feedback overrides the critic's score.
- Small changes (typo fixes, config tweaks, docs) skip the critic. Use it for features and meaningful system changes.
