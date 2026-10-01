# Roadmap

Agreed with the project owner on 2026-09-30 after v0.1-alpha (Phase 1). CLAUDE.md §7 holds the outline;
this file is the current detailed plan.

**Releases:** the game stays in alpha at least until Phase 3 is complete. Each phase is one alpha on the
v0.1 line: Phase 1 = Alpha 1 (`v0.1-alpha`), Phase 2 = Alpha 2 (`v0.1-alpha.2`), Phase 3 = Alpha 3
(`v0.1-alpha.3`), and Phase 4 possibly Alpha 4 (`v0.1-alpha.4`). Git tags can't contain spaces, hence the dots.

**Multiplayer is not planned** (owner decision, 2026-09-30). The game is single-player against bots.

Every milestone goes through the critic (CLAUDE.md §12) and is pushed when accepted. Move on only when
the previous part is fun.

## Progress (updated 2026-10-01)

| Milestone | Status | Critic score |
|---|---|---|
| Phase 1 (all) | Done, released as `v0.1-alpha` | see REVIEWS.md |
| Phase 2 · M1 Controls and map | Done | 8.6 |
| Phase 2 · M2 Sound you can play by | Done | 8.8 |
| Phase 2 · M3 Feel and feedback | Done (owner playtested 2a: no issues; arm hits stay off) | 8.8 |
| **Checkpoint `v0.1-alpha.2a`** | M1–M3, played by the owner | |
| Phase 2 · M4a Difficulty levels, close-range lethality | **In progress** | |
| Phase 2 · M4b Crouch-peeking, team movement, varied routes, walking | Next | |
| Phase 2 · M5 Objective mode | To do | |
| Final bug pass (before M6) | To do | |
| Phase 2 · M6 Wrap-up → `v0.1-alpha.2` | Owner assesses | |
| Phase 3 → `v0.1-alpha.3` | Later | |
| Phase 4 (polish) → possibly `v0.1-alpha.4` | Later | |

Remaining in Phase 2: about half by milestone count (M4, M5, the bug pass, M6).

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

## Phase 3: Content → Alpha 3 (`v0.1-alpha.3`)

- New replica categories: shotgun, DMR, SMG. Loadout screen (primary + sidearm).
- Shooting range. Basic unlockable cosmetics (gloves, goggles, patches).
- Decide on parked ideas (docs/IDEAS.md): adjustable hop-up, medic revive, dead rag + voiced hit calls,
  bang-bang surrender.
- Second map (woodland) once Depot and the core game feel right.

## Phase 4: Polish → possibly Alpha 4 (`v0.1-alpha.4`)

- Art pass (CC0 assets only), VFX, lighting, proper menus.
- Onboarding / short tutorial.
- Accessibility and full settings (FOV, volume, colour-blind team colours), optimisation, final balance.
