# Roadmap

The detailed plan. CLAUDE.md §7 holds the outline and the authoritative versioning policy. First agreed
with the owner on 2026-09-30 after `v0.1-alpha`; rewritten on 2026-10-01 around alpha → beta → `v0.1`.

**Current focus: alpha development.** Beta is not close yet.

**Multiplayer is not planned** (owner decision, 2026-09-30). The game is single-player against bots.

Every milestone goes through the critic (CLAUDE.md §12) and is pushed when accepted. Move on only when
the previous part is fun.

## Versioning

Three separate layers:

| Layer | What it is | Now |
|---|---|---|
| **Product version** | What the game is. | **v0.1**, the initial game (not released yet). Everything below builds it. |
| **Stage and builds** | Development state: alpha → beta → release, as tagged builds. | **Alpha.** |
| **Phases and milestones** | Units of work, each reviewed by the critic. Not versions. | Phase 2: M5 done; bug pass and M6 next. |

**Which stage a piece of work belongs to:**
- **Alpha:** new systems, modes, content, maps, replicas, menus, art and anything else that adds to the game or changes how it plays.
- **Beta:** bug fixing, balance, performance, stability, UX/QoL, polish and final tuning of a feature-complete game.

The path to v0.1:
1. **Alpha builds** while Phases 2–4 add the game.
2. **`v0.1-beta` builds** once the owner calls the planned game feature complete.
3. **`v0.1`** when the owner calls it ready to be the first stable public product.

What comes after v0.1 (`v0.1.x` maintenance, a future `v0.2`) is deliberately not planned yet.

**Builds so far** (future tags are dotted, e.g. `v0.1-alpha.2b`):

| Build | Date | What it was | Git tag |
|---|---|---|---|
| `v0.1-alpha` | 2026-09-30 | Phase 1, the playable single-player slice | `v0.1-alpha` |
| `v0.1-alpha.2a` | 2026-09-30 | Interim checkpoint of alpha 2: Phase 2 M1–M3, for the owner's playtest | `v0.1-alpha.2a` (on commit d8c4568) |

## Progress (updated 2026-10-01)

Milestones are development steps. Only the rows marked as builds become tagged releases.

| Stage · work | Status | Critic score |
|---|---|---|
| Alpha · Phase 1 (all) → **build `v0.1-alpha`** | Done | see REVIEWS.md |
| Alpha · Phase 2 · M1 Controls and map | Done | 8.6 |
| Alpha · Phase 2 · M2 Sound you can play by | Done | 8.8 |
| Alpha · Phase 2 · M3 Feel and feedback | Done (owner playtested 2a: no issues; arm hits stay off) | 8.8 |
| **Build `v0.1-alpha.2a`** (interim checkpoint) | M1–M3, played by the owner | |
| Alpha · Phase 2 · M4a Difficulty levels, close-range lethality | Done | 8.7 |
| Alpha · Phase 2 · M4b Crouch-peeking, team movement, varied routes, walking | Done | 8.2 |
| Alpha · Phase 2 · M5 Objective mode (Attack / Defend) | Done | 8.4 |
| Alpha · Phase 2 · bug pass and M6 wrap-up → **build `v0.1-alpha.2`** | To do | |
| Alpha · Phase 3 Content | Later | |
| Alpha · Phase 4 Presentation and onboarding → feature complete | Later | |
| Beta → **`v0.1-beta`** builds | Owner decides when | |
| **`v0.1`** first public release | Owner decides when | |

Interim builds (`v0.1-alpha.2b` …) are cut only when the owner wants something to playtest. Numbered
alpha builds for Phases 3 and 4 are assigned when they're cut.

## Alpha: building v0.1

### Phase 1: Playable single-player slice → build `v0.1-alpha` (done)

The CLAUDE.md §6 slice: Depot greybox, AEG and pistol, BB ballistics, one-hit elimination with hit calling,
bots, 3v3 rounds to 5, minimal HUD.

### Phase 2: Core gameplay on Depot → build `v0.1-alpha.2` (in progress)

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
    Indoor/outdoor acoustics wait for the second map (Phase 3); Depot is roofless.
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
- **Bug pass**, then **M6. Wrap-up:** owner playtest, 60 FPS check on the target laptop, tag `v0.1-alpha.2`.
  (A bug pass before each alpha build keeps it playable; it isn't beta work.)

### Phase 3: Content

- New replica categories: shotgun, DMR, SMG. Loadout screen (primary + sidearm).
- Shooting range.
- Basic unlockable cosmetics (gloves, goggles, patches) and the unlock system behind them.
- Decide on parked ideas (docs/IDEAS.md): adjustable hop-up, medic revive, dead rag + voiced hit calls,
  bang-bang surrender. Any that are approved are built here.
- Second map (woodland) once Depot and the core game feel right, with indoor/outdoor acoustics.

### Phase 4: Presentation and onboarding (the last alpha phase)

New content and systems that replace the greybox and placeholders. This is alpha work, even though it
makes the game look finished.

- Art pass (CC0 assets only), VFX, lighting.
- Proper menus and a full settings screen (FOV, volume, colour-blind team colours).
- Onboarding / short tutorial.

When the owner calls the game feature complete, alpha ends.

## Beta: finishing v0.1 (not scheduled yet)

Beta adds no major new systems unless the owner approves. Its likely work, collected here so alpha
phases stay focused:
- Optimisation pass: profile, then fix. The "can wait" performance items in KNOWN_ISSUES land here unless
  they block alpha work.
- Final balance: replicas, bot difficulty levels across both maps, round timer.
- Final tuning of values that are first guesses today: footstep ranges, hop-up arcs, difficulty numbers.
- Bug fixing and stability.
- UX/QoL, polish and accessibility refinements.

## Release: v0.1

The first public release. The owner decides when the game is ready to be treated as a stable public product.
