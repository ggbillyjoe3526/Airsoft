# Roadmap

Agreed with the project owner on 2026-09-30 after v0.1-alpha (Phase 1). CLAUDE.md §7 holds the outline;
this file is the current detailed plan.

## Versioning

The policy is in CLAUDE.md §7 (authoritative). This plan has three separate layers:

| Layer | What it is | Now |
|---|---|---|
| **Product version** | What the game is. | **v0.1**, the initial game (not released yet). All of Phases 1–4 build it. |
| **Builds** (alpha → beta → release) | Development state, as tagged builds. | **Alpha.** Builds so far are listed below. |
| **Phases and milestones** | Units of work, each reviewed by the critic. Not versions. | Phase 2, M4b next. |

The path to v0.1:
1. Alpha builds while Phases 2–3 (and possibly 4) add the game.
2. `v0.1-beta` builds once the owner calls the planned game feature complete.
3. `v0.1` when the owner calls it ready to be the first stable public product.

What comes after v0.1 (`v0.1.x` maintenance, a future `v0.2`) is deliberately not planned yet.

| Build | Date | What it was | Git tag |
|---|---|---|---|
| `v0.1-alpha` | 2026-09-30 | Phase 1, the playable single-player slice | `v0.1-alpha` |
| `v0.1-alpha.2a` | 2026-09-30 | Interim checkpoint of alpha 2: Phase 2 M1–M3, for the owner's playtest | `v0.1-alpha-2a` (historical spelling with a hyphen) |

**Multiplayer is not planned** (owner decision, 2026-09-30). The game is single-player against bots.

Every milestone goes through the critic (CLAUDE.md §12) and is pushed when accepted. Move on only when
the previous part is fun.

## Progress (updated 2026-10-01)

Milestones are development steps; only the rows marked as builds become tagged releases.

| Milestone | Status | Critic score |
|---|---|---|
| Phase 1 (all) | Done → **build `v0.1-alpha`** | see REVIEWS.md |
| Phase 2 · M1 Controls and map | Done | 8.6 |
| Phase 2 · M2 Sound you can play by | Done | 8.8 |
| Phase 2 · M3 Feel and feedback | Done (owner playtested 2a: no issues; arm hits stay off) | 8.8 |
| **Build `v0.1-alpha.2a`** (interim checkpoint) | M1–M3, played by the owner | |
| Phase 2 · M4a Difficulty levels, close-range lethality | Done | 8.7 |
| Phase 2 · M4b Crouch-peeking, team movement, varied routes, walking | **Next** | |
| Phase 2 · M5 Objective mode | To do | |
| Final bug pass (before M6) | To do | |
| Phase 2 · M6 Wrap-up → **build `v0.1-alpha.2`** | Owner assesses | |
| Phase 3 (alpha; ships as the next numbered alpha build or builds) | Later | |
| Phase 4 (polish; alpha or beta, see below) | Later | |
| Feature complete → **`v0.1-beta`** builds | Owner decides | |
| **`v0.1`** first public release | Owner decides | |

Remaining in Phase 2: M4b, M5, the bug pass and M6. Interim builds (`v0.1-alpha.2b` …) are cut only when
the owner wants something to playtest.

## Phase 2: Core gameplay (Depot only) → Alpha 2 (`v0.1-alpha.2`)

Focus: make the existing loop feel great on one map. No second map yet.

- **M1. Controls and map**
  - Shift = walk (slow, quiet); Left Alt = sprint (browser menu suppressed).
  - Key-bindings settings screen (saved in the browser). Other settings wait.
  - Depot enlarged and opened up: ~15–20% larger, ~20% less clutter, wider lanes, same identity;
    all layout tests kept (sightline cap may rise to ~34 m).
- **M2. Sound you can play by**
  - Positional footsteps: running and sprinting are heard; walking and moving crouched are silent
    (CS/Valorant rule, see DECISIONS). Bots hear footsteps.
  - Sound pass: per-shot and per-impact pitch variation, AEG motor whirr, a short yard reverb.
    Indoor/outdoor acoustics are out of scope while Depot is the only map (it's roofless); revisit
    with the second map in Phase 3.
- **M3. Feel and feedback**
  - Reload animation (support hand swaps the magazine).
  - Hit reactions (flinch), clearer hit confirmation at range.
  - Smooth turning of other players (yaw interpolation); playtest whether arm hits count.
- **M4. Bots that feel fair** (split in two, each its own critic cycle)
  - M4a: difficulty levels (easy / normal / hard); normal less deadly up close; per-enemy contacts.
  - M4b: crouch-peeking over low cover, moving as a team, varied routes, walking when closing in on a sound.
- **M5. Objective mode**
  - Attack/defend a flag on Depot: capture, wipe-out or time; sides swap at half-time.
  - Mode choice on the start screen (elimination stays).
- **M6. Wrap-up:** owner playtest, 60 FPS check on the target laptop, bug pass, tag v0.1-alpha.2.

## Phase 3: Content (alpha)

- New replica categories: shotgun, DMR, SMG. Loadout screen (primary + sidearm).
- Shooting range. Basic unlockable cosmetics (gloves, goggles, patches).
- Decide on parked ideas (docs/IDEAS.md): adjustable hop-up, medic revive, dead rag + voiced hit calls,
  bang-bang surrender.
- Second map (woodland) once Depot and the core game feel right.

## Phase 4: Polish (alpha or beta)

Whether this phase is late alpha or beta depends on whether the owner calls the game feature complete
after Phase 3. Polish, accessibility, optimisation and balance are beta work. Proper menus, onboarding and the
art pass may count as new systems, which beta only allows with the owner's approval.

- Art pass (CC0 assets only), VFX, lighting, proper menus.
- Onboarding / short tutorial.
- Accessibility and full settings (FOV, volume, colour-blind team colours), optimisation, final balance.
