# Roadmap

Agreed with the project owner on 2026-09-30 after v0.1-alpha (Phase 1). CLAUDE.md §7 holds the outline;
this file is the current detailed plan.

**Releases:** the game stays in alpha at least until Phase 3 is complete. Each phase is one alpha on the
v0.1 line: Phase 1 = Alpha 1 (`v0.1-alpha`), Phase 2 = Alpha 2 (`v0.1-alpha.2`), Phase 3 = Alpha 3
(`v0.1-alpha.3`), and Phase 4 possibly Alpha 4 (`v0.1-alpha.4`). Git tags can't contain spaces, hence the dots.

**Multiplayer is not planned** (owner decision, 2026-09-30). The game is single-player against bots. Every milestone goes through the critic (CLAUDE.md §12) and is
pushed when accepted. Move on only when the previous part is fun.

## Phase 2: Core gameplay (Depot only) → Alpha 2 (`v0.1-alpha.2`)

Focus: make the existing loop feel great on one map. No second map yet.

- **M1. Controls and map**
  - Shift = walk (slow, quiet); Left Alt = sprint (browser menu suppressed).
  - Key-bindings settings screen (saved in the browser). Other settings wait.
  - Depot enlarged and opened up: ~15–20% larger, ~20% less clutter, wider lanes, same identity;
    all layout tests kept (sightline cap may rise to ~34 m).
- **M2. Sound you can play by**
  - Positional footsteps: loud running, quiet walking, silent crouched. Bots hear footsteps.
  - Sound pass: replica sounds, impacts, indoor/outdoor feel.
- **M3. Feel and feedback**
  - Reload animation (support hand swaps the magazine).
  - Hit reactions (flinch), clearer hit confirmation at range.
  - Smooth turning of other players (yaw interpolation); playtest whether arm hits count.
- **M4. Bots that feel fair**
  - Difficulty levels (easy / normal / hard); normal less deadly up close.
  - Crouch-peeking over low cover, moving as a team, varied routes.
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
