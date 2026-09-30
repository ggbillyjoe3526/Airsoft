# Roadmap

Agreed with the project owner on 2026-09-30 after v0.1 (Phase 1). CLAUDE.md §7 holds the original outline;
this file is the current detailed plan. Every milestone goes through the critic (CLAUDE.md §12) and is
pushed when accepted. Move on only when the previous part is fun.

## Phase 2: Core gameplay (Depot only), target v0.1-alpha.2

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

## Phase 3: Content, target v0.3

- New replica categories: shotgun, DMR, SMG. Loadout screen (primary + sidearm).
- Shooting range. Basic unlockable cosmetics (gloves, goggles, patches).
- Decide on parked ideas (docs/IDEAS.md): adjustable hop-up, medic revive, dead rag + voiced hit calls,
  bang-bang surrender.
- Second map (woodland) once Depot and the core game feel right.

## Phase 4: Multiplayer, target v0.4 (plan with the owner before starting)

- Authoritative Node.js server reusing the deterministic simulation.
- Client prediction, lag compensation for BB projectiles.
- Private lobbies with invite links; bots fill empty slots.

## Phase 5: Polish, target v1.0

- Art pass (CC0 assets only), VFX, lighting, proper menus.
- Onboarding / short tutorial.
- Accessibility and full settings (FOV, volume, colour-blind team colours), optimisation, final balance.
