# Roadmap

The detailed plan. CLAUDE.md §7 holds the outline and the authoritative versioning policy.
First agreed with the owner on 2026-09-30. **Rewritten on 2026-10-01** from the owner's feature list:
v0.1 is the core game with strong foundations, and new content comes in later versions.

**Current focus: alpha.** We build first. Balance, bug fixing, QoL and performance come in beta.
**Multiplayer is not planned** (owner decision, 2026-09-30). The game is single-player against bots.

Every milestone goes through the critic (CLAUDE.md §12), is committed when accepted, and is pushed to
GitHub. Move on only when the previous part is fun.

## Versioning

There are three separate layers:

| Layer | What it is | Now |
|---|---|---|
| **Product version** | What the game is. | **v0.1**, the core game (not released yet). Everything up to the v0.1 release builds it. |
| **Stage and builds** | Development state: alpha → beta → release, as tagged builds. | **Alpha.** |
| **Phases and milestones** | Units of work, each reviewed by the critic. Not versions. | Phase 2: M5 done; bug pass and M6 next. |

The path:
1. **Alpha builds** while Phases 2–4 build v0.1.
2. **`v0.1-beta` builds** once the owner calls v0.1 feature complete.
3. **`v0.1`**, the first public release, when the owner calls it ready.
4. **Later versions** (`v0.2`, `v0.3` …): new modes, fields, replica platforms, loadouts, customisation,
   progression and team comms (see [After v0.1](#after-v01-later-versions)). Each later version gets its
   own alpha → beta → release cycle. `v0.1.x` releases are for fixes and small changes.

**Builds so far.** The owner creates tags. They are dotted (e.g. `v0.1-alpha.2`), and only full releases are
tagged (owner, 2026-10-01): playtests in between are plain commits.

| Build | Date | What it was | Git tag |
|---|---|---|---|
| `v0.1-alpha` | 2026-09-30 | Phase 1, the playable single-player slice | `v0.1-alpha` |
| (playtest) | 2026-09-30 | Phase 2 M1–M3, for the owner's playtest (commit d8c4568) | was `v0.1-alpha.2a`; removed after `v0.1-alpha.2` |
| (checkpoint) | 2026-10-01 | Phase 2 M1–M4b (commit 08b37e3) | was `v0.1-alpha.2b`; removed after `v0.1-alpha.2` |
| `v0.1-alpha.2` | (M6) | Phase 2 complete: Elimination and Attack / Defend on Depot | `v0.1-alpha.2` (the owner tags it) |

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

## Progress (updated 2026-10-01)

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
| Alpha · Phase 2 · bug pass and M6 wrap-up → **build `v0.1-alpha.2`** | **Next** | |
| Alpha · Phase 3 · M7 Magazines and reloads | To do | |
| Alpha · Phase 3 · M8 BB physics pass | To do | |
| Alpha · Phase 3 · M9 Movement and positioning | To do | |
| Alpha · Phase 3 · M10 Depot rework | To do | |
| Alpha · Phase 3 · bug pass → **build `v0.1-alpha.3`** | To do | |
| Alpha · Phase 4 Presentation and onboarding → feature complete | Later | |
| Beta → **`v0.1-beta`** builds | Owner decides when | |
| **`v0.1`** first public release | Owner decides when | |

Playtests between releases use the latest pushed commit; they are not tagged. Phase 4's
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

### Phase 3: Core foundations → build `v0.1-alpha.3`

These systems shape how every later replica, mode and field plays, so they come before any new
content. The game keeps the AEG and the gas pistol.

- **M7. Magazines and reloads** (limited ammunition, meaningful reloads)
  - Each replica carries a set number of magazines per round, instead of today's pooled reserve count.
  - A reload swaps in the next magazine. The old one goes back in the pouch with whatever is left in it,
    so there is no topping up, and partly used mags come round again.
  - Running dry is a real risk: there is no refill during a round (resupply is a later idea for respawn modes).
  - The HUD shows your magazines and how full each one is.
  - Bots count their magazines and reload from cover.
- **M8. BB physics pass**
  - Reassess travel time, drop and hop-up against real airsoft behaviour, keeping the game readable.
  - Each replica has its own muzzle velocity.
  - BB weight (e.g. 0.20 g or 0.25 g) becomes a real parameter of the flight model: it changes speed,
    drop and how the hop-up lifts.
  - Review tracer visibility per replica.
  - The sound model gets room for suppressed versus unsuppressed shots, so suppressors can plug in later.
  - Deferred: wind (it comes with outdoor fields), and player options for BB weight and tracers (they
    come with loadouts).
  - The ballistics stay pure and unit-tested.
- **M9. Movement and positioning**
  - Make position and movement count for more than replica stats.
  - Accuracy depends on movement and stance: standing still and crouching are steady; running,
    jumping and just after sprinting are not.
  - Peeking and holding angles behind cover should be rewarding.
  - Bots play by the same rules.
  - New movement systems, such as leaning around corners, are to be confirmed with the owner when this
    milestone starts.
- **M10. Depot rework** to the field checklist
  - Purpose-built airsoft barricades (walls with shooting ports).
  - Buildings with windows and doorways: today it's one office block, so add at least one more structure.
  - Deliberate choke points and flanking routes.
  - Objective locations: the poles, plus spots that later modes can use.
  - Clear dead zones and spawn areas.
  - Depot stays mirror-symmetric and keeps its identity.
  - Layout tests are extended to the checklist; bot lanes and poles are updated.
- **Bug pass** → the owner playtests and tags `v0.1-alpha.3`.

### Phase 4: Presentation and onboarding (the last alpha phase)

New content and systems that replace the greybox and placeholders. This is alpha work, even though it
makes the game look finished.

- Art pass (CC0 assets only), VFX and lighting for Depot, the replicas and the figures.
- Proper menus and a full settings screen: FOV, volume, colour-blind team colours, reduced motion and
  other accessibility options.
- Onboarding: a short tutorial.

When the owner calls the game feature complete, alpha ends.

## Beta: finishing v0.1 (not scheduled yet)

Beta adds no major new systems unless the owner approves. Its likely work, collected here so the alpha
phases stay focused:
- **Optimisation:** profile, then fix. The "can wait" performance items in KNOWN_ISSUES land here.
- **Balance:** replicas, magazines, bot difficulty levels, and Attack / Defend (about 1 bot round in 10
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
- **Suppressors** with their own sound, built on the M8 groundwork.

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
