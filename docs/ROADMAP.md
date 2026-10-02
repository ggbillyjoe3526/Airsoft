# Roadmap

The detailed plan. CLAUDE.md §7 holds the outline and the authoritative versioning policy.
First agreed with the owner on 2026-09-30. **Rewritten on 2026-10-01** from the owner's feature list:
v0.1 is the core game with strong foundations, and new content comes in later versions.

**Current focus: alpha.** We build first. Balance, bug fixing, QoL and performance come in beta.
**Multiplayer is not planned** (owner decision, 2026-09-30). The game is single-player against bots.

Every milestone goes through the critic (CLAUDE.md §12), is committed on its own branch when accepted, and is
opened as a pull request that the owner reviews and merges into `main`. GitHub runs the checks on every pull
request. Each pull request says which parts of the playtest guide (`docs/PLAYTEST.md`) to play; the owner's
playtest notes set the priorities for what comes next. Move on only when the previous part is fun.

## Versioning

There are three separate layers:

| Layer | What it is | Now |
|---|---|---|
| **Product version** | What the game is. | **v0.1**, the core game (not released yet). Everything up to the v0.1 release builds it. |
| **Stage and builds** | Development state: alpha → beta → release, as tagged builds. | **Alpha.** |
| **Phases and milestones** | Units of work, each reviewed by the critic. Not versions. | Phase 2: done (`v0.1-alpha.2` tagged). Phase 3: M7 (leaning), M8 (magazines), M9 (BB physics), M10 (movement and positioning), a code review pass, the audit fixes and elevation support done or in review; the bug pass and the `v0.1-alpha.3` tag are left (the owner tags when ready). M11 (Depot rework) moved to Phase 4 (owner, 2026-10-02). |

The path:
1. **Alpha builds** while Phases 2–4 build v0.1.
2. **`v0.1-beta` builds** once the owner calls v0.1 feature complete.
3. **`v0.1`**, the first public release, when the owner calls it ready.
4. **Later versions** (`v0.2`, `v0.3` …): new modes, fields, replica platforms, loadouts, customisation,
   progression and team comms (see [After v0.1](#after-v01-later-versions)). Each later version gets its
   own alpha → beta → release cycle. `v0.1.x` releases are for fixes and small changes.

**Branches** (owner, 2026-10-01). `main` holds the latest stable release. During the v0.1 cycle every change
lands on `main` as a pull request the owner reviews and merges (owner, 2026-10-02; nothing is pushed to `main`
directly), and its tagged commits are the releases. Later (about when v0.1 is done and
v0.2 starts; the owner decides when), work moves to an `alpha` branch: builds ready for testing are merged into
`beta`, then, once tested, into `main` and tagged.

**Builds so far.** The owner creates tags. They are dotted (e.g. `v0.1-alpha.2`), and only full releases are
tagged (owner, 2026-10-01): playtests in between are plain commits.

| Build | Date | What it was | Git tag |
|---|---|---|---|
| `v0.1-alpha` | 2026-09-30 | Phase 1, the playable single-player slice | `v0.1-alpha` |
| (playtest) | 2026-09-30 | Phase 2 M1–M3, for the owner's playtest (commit d8c4568) | was `v0.1-alpha.2a`; removed after `v0.1-alpha.2` |
| (checkpoint) | 2026-10-01 | Phase 2 M1–M4b (commit 08b37e3) | was `v0.1-alpha.2b`; removed after `v0.1-alpha.2` |
| `v0.1-alpha.2` | 2026-10-01 | Phase 2 complete: Elimination and Attack / Defend on Depot | `v0.1-alpha.2` |

## What v0.1 is (owner decision, 2026-10-01)

v0.1 focuses on core gameplay and foundations. Later content builds on those foundations.

- **Replicas:** the two that exist, the AEG rifle and the gas pistol. More platforms come later.
- **Modes:** the two that exist, Elimination and Attack / Defend.
- **Field:** Depot, reworked to the field checklist below.
- **Foundations:** magazines and reloads, a BB physics pass, and movement and positioning.

### Design rules for everything on this roadmap

- **Movement and positioning matter more than raw weapon stats** (owner). Where you stand, how you
  move and when you peek should decide fights, not a better gun.
- **Replicas differ mechanically, not in damage.** One hit is one hit with every replica. Platforms
  differ in how they load, cycle, sound, handle and run out.
- **Fields are built from a checklist** (owner). Every field has cover, barricades, buildings, windows,
  doorways, choke points, flanking routes, objective locations, and dead zones / spawn areas. Layout
  rules are tested in code, as for Depot.
- **Unlocks never block fun.** Until progression is designed, everything is free from the start. When
  progression comes, it is earned by unlocking replicas and gear, never by levels.

## Progress (updated 2026-10-02)

Milestones are development steps. Only the rows marked as builds become tagged releases.

| Stage · work | Status | Critic score |
|---|---|---|
| Alpha · Phase 1 (all) → **build `v0.1-alpha`** | Done | see REVIEWS.md |
| Alpha · Phase 2 · M1 Controls and map | Done | 8.6 |
| Alpha · Phase 2 · M2 Sound you can play by | Done | 8.8 |
| Alpha · Phase 2 · M3 Feel and feedback | Done (owner playtested 2a: no issues; arm hits stay off) | 8.8 |
| Alpha · Phase 2 · M4a Difficulty levels, close-range lethality | Done | 8.7 |
| Alpha · Phase 2 · M4b Crouch-peeking, team movement, varied routes, walking | Done | 8.2 |
| Alpha · Phase 2 · M5 Objective mode: Attack / Defend | Done | 8.4 |
| Alpha · Phase 2 · bug pass and M6 wrap-up → **build `v0.1-alpha.2`** | Done (tagged; owner playtesting) | |
| Alpha · Phase 3 · M7a Controls for leaning (swap key removed; Q / E free) | Done (small change, no critic) | |
| Alpha · Phase 3 · M7b Leaning (peek left / right) | Done | 8.6 |
| Alpha · Phase 3 · M8 Magazines and reloads | Done | 8.7 |
| Alpha · Phase 3 · M9 BB physics pass | Done | 8.5 |
| Alpha · Phase 3 · M10 Movement and positioning | Done (auto-accepted, attempt 4) | 8.4 |
| Alpha · Phase 3 · Code review pass (owner, 2026-10-02) | Done (auto-accepted, attempt 4) | 8.4 |
| Alpha · Phase 3 · Audit fixes 1: automatic checks on every pull request (Fable audit C-02, C-03) | Done | 9.0 |
| Alpha · Phase 3 · Audit fixes 2: in-air spread debounce, render quality presets (C-01, C-04) | In review | 9.1 |
| Alpha · Phase 3 · Elevation support: ramps and raised floors for bots and players (C-05) | In review | 9.0 |
| Alpha · Phase 3 · bug pass → **build `v0.1-alpha.3`** (owner tags when ready) | To do | |
| Alpha · Phase 4 · M11 Depot rework (moved from Phase 3, owner, 2026-10-02) | Later | |
| Alpha · Phase 4 Presentation and onboarding → feature complete | Later | |
| Beta → **`v0.1-beta`** builds | Owner decides when | |
| **`v0.1`** first public release | Owner decides when | |

Playtests between releases use the latest merged commit on `main`; they are not tagged. Phase 4's
build number is assigned when it's cut.

## Alpha: building v0.1

### Phase 1: Playable single-player slice → build `v0.1-alpha` (done)

The CLAUDE.md §6 slice: Depot greybox, AEG and pistol, BB ballistics, one-hit elimination with hit calling,
bots, 3v3 rounds to 5, and a minimal HUD.

### Phase 2: Core gameplay on Depot → build `v0.1-alpha.2` (in progress)

- **M1–M4b (done):** controls and a bigger Depot; sound you can play by (footsteps, positional sound);
  reload animation, hit reactions and smooth turning; difficulty levels; smarter bots (crouch-peeking,
  team movement, varied routes, walking).
- **M5. Objective mode (done):** Attack / Defend. A flagpole stands in each half. The attackers raise their
  flag at the defenders' pole, and the defenders pull it down. Rounds end by capture, wipe-out or time,
  with overtime while the rope is being worked. Sides swap at half-time. The mode is picked on the start
  screen, and Elimination stays.
- **Bug pass**, then **M6. Wrap-up:** the owner playtests both modes, a 60 FPS check on the target laptop,
  and the owner tags `v0.1-alpha.2`. A bug pass before each alpha build keeps the game playable; it
  isn't beta work.
  - Bug pass (2026-10-01): a soak of 48 long bot matches (both modes, all difficulties) found no crashes,
    NaNs or stuck rounds; bots now mind teammates moving into their line of fire.
  - Performance in the dev build: about 0.3 ms of CPU per frame, 48–58 draw calls and up to ~35k triangles
    in either mode; GPU memory is stable across match restarts (no leaks). The 60 FPS check on the target
    laptop is the owner's.

### Phase 3: Core foundations → build `v0.1-alpha.3`

These systems shape how every later replica, mode and field plays, so they come before any new
content. The game keeps the AEG and the gas pistol.

- **M7. Leaning: peek left / right** (owner request after the v0.1-alpha.2 playtest)
  - **M7a (done):** the "switch replica" key (Q) is removed, so Q and E are free. You switch replicas
    with 1, 2 or the mouse wheel.
  - **M7b (done):** hold Q / E to lean left / right and see around cover and corners without stepping
    out (hold, not toggle). The design:
    - The upper body pivots at the hips by up to about 34°, so the eyes move about 0.4 m sideways and
      drop a little. It eases in over about 0.18 s and works crouched too, for leaning around crouch cover.
    - The lean stops short of walls: rays from the upright eye and shoulder decide how far you can go,
      so you can never see or shoot through geometry.
    - BBs leave from the leaned eye, and the hit volume follows the lean: the head and a shoulder
      shape shift sideways while the legs stay put, so only what pokes out can be hit.
    - While leaning you move at walking pace (quiet) and can't sprint; there's no leaning in the air.
    - The camera shifts and rolls; other players' figures tilt from the hips, matching the hit volume
      (tested).
    - Bots see and aim at where a leaning player's head and shoulder actually are. Bots leaning
      themselves comes in M10.
- **M8. Magazines and reloads** (limited ammunition, meaningful reloads)
  - Each replica carries a set number of magazines per round, instead of today's pooled reserve count.
  - A reload swaps in the next magazine. The old one goes back in the pouch with whatever is left in it,
    so there is no topping up, and partly used mags come round again.
  - Running dry is a real risk: there is no refill during a round (resupply is a later idea for respawn modes).
  - The HUD shows your magazines and how full each one is.
  - Bots count their magazines and reload from cover.
- **M9. BB physics pass**
  - Reassess travel time, drop and hop-up against real airsoft behaviour, keeping the game readable.
  - Each replica has its own muzzle velocity.
  - BB weight (e.g. 0.20 g or 0.25 g) becomes a real parameter of the flight model: it changes speed,
    drop and how the hop-up lifts.
  - Review tracer visibility per replica.
  - The sound model gets room for suppressed versus unsuppressed shots, so suppressors can plug in later.
  - Deferred: wind (it comes with outdoor fields), and player options for BB weight and tracers (they
    come with loadouts).
  - The ballistics stay pure and unit-tested.
- **M10. Movement and positioning**
  - Make position and movement count for more than replica stats.
  - Accuracy depends on movement and stance: standing still and crouching are steady; running,
    jumping and just after sprinting are not.
  - Peeking and holding angles behind cover should be rewarding.
  - Bots play by the same rules.
  - Bots learn to lean (M7b gives the player leaning) and to peek full-height corners with it.
- **Code review pass** (owner request, 2026-10-02; right after M10, in the same session)
  - A quick pass over all existing code for bugs and quality issues (CLAUDE.md §9): logic errors, stale or
    misleading comments, magic numbers, per-frame allocations, missing disposal, dead code, weak tests.
  - Fix-now items are fixed in this pass (with tests for bugs); the rest go to `KNOWN_ISSUES.md` or Beta.
  - No new features or behaviour changes beyond bug fixes; the critic reviews the fixes.
- **Audit fixes** (Fable audit, 2026-10-02; the report and specs are in `audit/`). The audit found no
  stop-the-line bugs. Its Fix Now and Fix Soon items come first, one pull request per batch:
  - **Automatic checks (C-02, C-03):** a browser smoke test of the release build and a GitHub workflow that runs
    `npm run check` and the smoke test on every pull request.
  - **In-air spread debounce (C-01):** a moment off the ground no longer flashes the spread wide; a jump still does.
  - **Render quality presets (C-04):** `?quality=low|medium|high` and GPU numbers on the debug overlay, so frame cost
    can be measured; the pixel ratio follows the window between monitors.
- **Elevation support (C-05)** (owner, 2026-10-02: maps may have elevation, starting with the Depot rework in Phase 4).
  Ramp blocks, a floor height per nav cell so bots route up and down, cover and walk-offs at the right height, and a
  ramp test map with its own headless match. One rule keeps it simple: walkable surfaces never overlap (no walkable
  floor under a mezzanine or bridge). Done before any Depot layout change.
- **Bug pass** → the owner plays the whole playtest guide (`docs/PLAYTEST.md`) and tags `v0.1-alpha.3` when ready.
- **M11 (Depot rework)** moved to Phase 4 (owner, 2026-10-02), so `v0.1-alpha.3` ships with today's Depot layout.

### Phase 4: Presentation and onboarding (the last alpha phase)

New content and systems that replace the greybox and placeholders. This is alpha work, even though it
makes the game look finished.

- **M11. Depot rework** to the field checklist (moved from Phase 3, owner, 2026-10-02; first in this phase, since the art
  pass dresses its layout). A layout sketch is ready for the owner's approval: https://claude.ai/artifact/L3rfDSHNN6SN2YyZTFLKdD
  - Purpose-built airsoft barricades (walls with shooting ports).
  - Buildings with windows and doorways: today it's one office block, so add at least one more structure.
  - Deliberate choke points and flanking routes.
  - Objective locations: the poles, plus spots that later modes can use.
  - Clear dead zones and spawn areas.
  - **Elevation** (owner, 2026-10-02): the layout sketch proposes where ramps, raised platforms or stairs go, built on
    the elevation support (Phase 3). Raised edges stay open: bots don't step off them.
  - Consider a few genuinely low obstacles (about 0.7–0.9 m: pallets, low walls) designed for **vaulting**
    (owner idea; parked until here, with bots taught to use them). Today's 1.2 m crouch cover stays unclimbable.
  - Depot stays mirror-symmetric and keeps its identity.
  - Layout tests are extended to the checklist; bot lanes and poles are updated.
  - The headless match guards stay green on the new layout (re-measured, not loosened).
  - Fix when touched (audit): reset the reload bar of a player who is hit (W-07), if playtesting shows it frozen.
- Art pass (CC0 assets only), VFX and lighting for Depot, the replicas and the figures.
- Proper menus and a full settings screen: FOV, volume, colour-blind team colours, reduced motion and
  other accessibility options.
- Onboarding: a short tutorial.
- Fix when touched (audit, `audit/OPUS_HANDOFF.md` §5), each inside the step that already edits that code: split the
  start screen and menus out of `game.ts` first (W-05), one versioned settings store for the new settings (W-02),
  a "graphics reset" message on a lost WebGL context (W-01), shader warm-up if the overlay shows a hitch (W-04), and
  reusing audio nodes when the audio pass comes (W-03). The settings screen exposes the quality presets.

When the owner calls the game feature complete, alpha ends.

## Beta: finishing v0.1 (not scheduled yet)

Beta adds no major new systems unless the owner approves. Its likely work, collected here so the alpha
phases stay focused:
- **Optimisation:** profile, then fix. The "can wait" performance items in KNOWN_ISSUES land here. The
  "60 FPS on an integrated-graphics laptop" target is unmeasured: the owner plays on a high-end desktop, so
  someone with such a laptop compares the quality presets here. Also from the audit: a smaller Rapier download
  (D-01, a fixed decision, owner's call) and a lint / format tool if a second person joins (D-02).
- **Balance:** replicas, how many magazines each carries (4 × 60 AEG, 4 × 18 pistol today), bot difficulty levels, and Attack / Defend (about 1 bot round in 10
  is won at the pole today; raise time, holds and retakes).
- **Final tuning** of values that are first guesses today: footstep ranges, hop-up arcs, difficulty numbers.
- **Bug fixing and stability.**
- **UX/QoL, polish and accessibility.**

## Release: v0.1

The first public release. The owner decides when the game is ready to be treated as a stable public product.

## After v0.1: later versions

Everything below is approved as a direction and deliberately not part of v0.1. The grouping into
versions is a proposal. The owner decides what goes into each version, and each one must be a
substantially bigger game (CLAUDE.md §7). Within a version, the work is again alpha (build), then beta
(balance, fixes, QoL, performance), then release.

### Proposed v0.2: More ways to play

- **Team Deathmatch** (an easy introduction): respawn TDM. Hit players walk back to their spawn and
  re-enter; the team with the most hits when time runs out (or the first to N) wins. Elimination stays
  as its own mode.
- **Capture the Flag:** grab the other team's flag and carry it home.
- **Domination:** capture and hold physical locations.
- **Bomb / Objective:** plant, defend and disable a prop device, as sites do with timer boxes.
- **A second field: Woodland**, built to the checklist, with wind for BBs and indoor/outdoor acoustics.

### Proposed v0.3: The armoury

- **Replica platforms** that feel mechanically different, not like damage models:

  | Platform | What sets it apart |
  |---|---|
  | AEGs | Electric full-auto with a motor whirr; mid- or hi-cap mags (the AEG is already in) |
  | GBB pistols | Blowback slide; the slide locks back on empty; gas mags (the gas pistol becomes this) |
  | GBBRs | Gas blowback kick; the bolt locks back on empty; small gas mags that run out fast |
  | Spring sniper rifles | One shot per bolt cycle; high velocity and long reach; a loud crack |
  | SMGs | Compact and quick to handle; high rate; short range |
  | Shotguns | Several BBs per shell; pump every shot; shells loaded one by one |
  | DMRs | Semi-auto only; high velocity; a minimum engagement distance, as at real sites |
  | LMGs | Huge box mags; slow to move and aim; covering fire; a bipod |

- **Loadout building**, free from the start:
  - Weapon parts: receivers, handguards, stocks, optics, grips, muzzle devices, suppressors,
    lasers/lights and bipods.
  - Gear: plate carriers, chest rigs, belts, helmets, comms, backpacks, gloves, eye protection, face
    protection and boots. Gear decides what you carry, e.g. how many magazines.
- **Chrono before a match:** check your loadout's muzzle velocity, and pick the BB weight and tracers.
- **A practice range** to try replicas and loadouts.
- **Suppressors** with their own sound, built on the M9 groundwork.

### Proposed v0.4: More fields

New fields from this list, each built to the checklist: CQB warehouse, urban streets, industrial site,
outdoor village, milsim-style compound, indoor arena, speedsoft arena and mixed terrain. Depot already
covers part of "CQB warehouse / industrial". Which fields, and in what order, is for the owner to pick.

### Proposed v0.5: Kit, looks and progression

- **Replica customisation:** colour, furniture, optic, handguard, stock, grip, magazine, muzzle device,
  tape and markings.
- **Kit customisation:** camouflage, plate carrier, pouches, helmet, goggles, gloves, patches and armbands.
- **Progression:** not level-based. You earn it by unlocking replicas and gear; how you earn unlocks is
  still open. Until this exists, everything is free from the start.
- No real brand names or trademarked designs, ever (CLAUDE.md §4).

### When the bots are ready: team communication

An action wheel or menu, pings and hand signals, with bots that act on them. This is built only once
the bot AI is good enough to follow the calls. It can join whichever version that happens in.

### Parked ideas

Not approved yet; see `docs/IDEAS.md`: adjustable hop-up, medic revive, dead rag and voiced hit calls,
bang-bang surrender, BB ricochets, a referee NPC, an end-of-match summary, and Depot variations.
