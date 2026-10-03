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
| **Phases and milestones** | Units of work, each reviewed by the critic. Not versions. | Phase 3: done (`v0.1-alpha.3` tagged 2026-10-03). Phase 4 (the last alpha phase) is next: weapon handling (M12), the Depot rework (M11), an audio rework (M13), then art, menus and settings, and a tutorial. The owner's `v0.1-alpha.3` playtest notes are folded in (2026-10-03). |

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
| `v0.1-alpha.3` | 2026-10-03 | Phase 3 complete: leaning, magazines, BB physics, movement and positioning, audit fixes, elevation support | `v0.1-alpha.3` |

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

## Progress (updated 2026-10-03)

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
| Alpha · Phase 2 · bug pass and M6 wrap-up → **build `v0.1-alpha.2`** | Done (tagged 2026-10-01) | |
| Alpha · Phase 3 · M7a Controls for leaning (swap key removed; Q / E free) | Done (small change, no critic) | |
| Alpha · Phase 3 · M7b Leaning (peek left / right) | Done | 8.6 |
| Alpha · Phase 3 · M8 Magazines and reloads | Done | 8.7 |
| Alpha · Phase 3 · M9 BB physics pass | Done | 8.5 |
| Alpha · Phase 3 · M10 Movement and positioning | Done (auto-accepted, attempt 4) | 8.4 |
| Alpha · Phase 3 · Code review pass (owner, 2026-10-02) | Done (auto-accepted, attempt 4) | 8.4 |
| Alpha · Phase 3 · Audit fixes 1: automatic checks on every pull request (Fable audit C-02, C-03) | Done | 9.0 |
| Alpha · Phase 3 · Audit fixes 2: in-air spread debounce, render quality presets (C-01, C-04) | Done | 9.1 |
| Alpha · Phase 3 · Elevation support: ramps and raised floors for bots and players (C-05) | Done | 9.0 |
| Alpha · Phase 3 · bug pass → **build `v0.1-alpha.3`** | Done (tagged 2026-10-03; the owner's playtest notes went into Phase 4) | 9.0 |
| Alpha · Phase 4 · M12a Weapon handling: fire modes, faster reloads, crouch toggle, steadier aim when still | Done (merged; owner played it: the crosshair should lock on faster, fixed in M12b) | 9.0 |
| Alpha · Phase 4 · M12b Weapon handling: optics as accessories, aiming down sights, aiming sensitivity (plus the owner's M12a note: the crosshair locks on at once when you stop) | Done (merged; owner played it: "red dot works great", six notes for M12c) | 9.1 |
| Alpha · Phase 4 · M12c The owner's M12b notes: the loadout off the pause screen, BBs drawn from the muzzle, the pistol facing forward, hop-up dials | Done (merged; owner's playtest next) | 9.0 |
| Alpha · Phase 4 · M11 Depot rework (moved from Phase 3, owner, 2026-10-02): asymmetric layout, one flagpole, a raised loading dock, ends swap at half-time | Done (pull request; owner's playtest next) | 9.0 |
| Alpha · Phase 4 · M13 Audio rework | Later | |
| Alpha · Phase 4 · M14 Art pass, M15 Menus and settings, M16 Tutorial → feature complete | Later | |
| Beta → **`v0.1-beta`** builds | Owner decides when | |
| **`v0.1`** first public release | Owner decides when | |

Playtests between releases use the latest merged commit on `main`; they are not tagged. Phase 4's
build number is assigned when it's cut. The Phase 4 rows are listed in the proposed working order; milestone
numbers are names, not the order.

## Alpha: building v0.1

### Phase 1: Playable single-player slice → build `v0.1-alpha` (done)

The CLAUDE.md §6 slice: Depot greybox, AEG and pistol, BB ballistics, one-hit elimination with hit calling,
bots, 3v3 rounds to 5, and a minimal HUD.

### Phase 2: Core gameplay on Depot → build `v0.1-alpha.2` (done)

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

### Phase 3: Core foundations → build `v0.1-alpha.3` (done)

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
  - Code bug pass (2026-10-02, committed straight to `main` at the owner's request): a read-through of all code
    plus headless soaks and a browser run found 9 bugs worth fixing now, all fixed: the hit marker and hit flash
    replayed after every pause, the Attack / Defend pole marker showed through the pause screen, the first
    round of a session had no start whistle, the held replica swung sideways at each round start, teammates
    could stand inside each other in the dead zone, an empty AEG stopped clicking (and auto-reloading) after a
    switch with the trigger held, bots ducked from their own BBs and fired into the wall beside them, and one bad
    frame time could stop the game clock for good. Smaller leftovers are in KNOWN_ISSUES.
- **M11 (Depot rework)** moved to Phase 4 (owner, 2026-10-02), so `v0.1-alpha.3` ships with today's Depot layout.
- **Done:** the owner playtested and tagged `v0.1-alpha.3` on 2026-10-03. The playtest notes are in Phase 4 below.

### Phase 4: Feel, presentation and onboarding (the last alpha phase)

New content and systems that replace the greybox and placeholders, plus the handling and sound changes from the
owner's `v0.1-alpha.3` playtest. This is alpha work, even though it makes the game look finished.

**The owner's `v0.1-alpha.3` playtest notes (2026-10-03) and where each one went:**

| # | Note | Goes to |
|---|---|---|
| 1 | Fire modes: single shot, semi auto, burst, fully auto, per replica as on the real type it's based on (a Glock-17-style pistol semi only, an MP5-style SMG single, burst and auto) | M12a |
| 2 | The reload is a tiny bit too slow | M12a |
| 3 | Aim down sights only with a scope fitted; a separate sensitivity while aiming | M12b |
| 4 | Scopes aren't part of the replica models; they're accessories added through customisation | M12b (the optic slot), v0.3 / v0.5 (more optics, full customisation) |
| 5 | Crouch toggles on and off instead of hold, with a setting to change it | M12a |
| 6 | Audio rework: higher quality, movement you can locate by ear, impactful but true-to-airsoft shots, each replica sounding like how it fires | M13 |
| 7 | Standing still or walking (Shift) tightens the crosshair more than today: the stiller you are, the more accurate; less skill-heavy than CS / Valorant | M12a |

**The owner's M12b playtest notes (2026-10-03, second playtest that day) and where each one went:**

| # | Note | Goes to |
|---|---|---|
| 1 | Take the optic picker off the pause menu (keep the feature): optics are picked in a loadout before the match | M12c |
| 2 | The rifle has iron sights by default | Already so since M12b (Optic: Iron sights is the default) |
| 3 | The red dot works great | — |
| 4 | BB tracers start about 45° under the rifle instead of at the muzzle; any BB visual should be in line with the muzzle | M12c |
| 5 | The pistol is held turned slightly to the left, not facing forward; disorientating | M12c |
| 6 | Hop-up adjustment, set before a match in the loadout: long shots aren't hitting | M12c |

**Order** (owner picked weapon handling first, 2026-10-03): **M12a → M12b → M11 → M13 → M14 → M15 → M16.** Weapon handling comes
first because it changes what the owner just played and gives something new to play quickly, and it doesn't wait on
the Depot layout sketch. The Depot rework follows once the sketch is approved (approved 2026-10-03). The audio rework comes after it so
movement sounds, echoes and muffling through walls are tuned on the new layout's buildings and floors. Art, menus and
the tutorial come last because they dress and explain everything before them.

- **M12. Weapon handling** (owner's playtest notes 1, 2, 3, 4, 5 and 7). Split in two so the quick changes can be
  played first. Bots play by the same handling rules where they apply.
  - **M12a. Fire modes, reloads, crouch, steadier aim** (notes 1, 2, 5, 7)
    - **Fire modes:** not every replica has every mode (owner, 2026-10-03). A burst-mode pull fires three BBs at
      the fire rate (fewer if the magazine runs dry); each replica's selector stays where you left it between rounds. Each replica lists the modes of the
      real-world type it is modelled on, and a fire selector key (B by default, rebindable) cycles them. A
      Glock-17-style pistol is semi only (one shot per trigger pull); an MP5-style SMG has single, burst and full
      auto. Today's AR-pattern AEG gets single, a 3-round burst and full auto (full auto by default); the gas
      pistol stays semi only. The HUD shows the current mode next to the ammo. Later platforms (v0.3) follow the
      same rule. In-game names stay generic (no brand names, CLAUDE.md §4).
    - **Faster reloads:** about 15% quicker (AEG 2.1 → 1.8 s, pistol 1.4 → 1.2 s). The reload animation and its
      sounds already scale with the reload time.
    - **Crouch toggle:** C toggles crouch by default (press to crouch, press again to stand), with a setting to switch
      back to hold. Sprinting or jumping stands you up. The key-bindings screen labels it to match.
    - **Steadier aim when still** (note 7): the longer you hold still, the tighter the spread gets, and walking with
      Shift costs less than today. A first guess to tune in play: standing still steadies from ×1 to ×0.7 of the
      replica's spread over about half a second, and walking pace drops from ×1.5 to ×1.15; crouching still stacks
      on top. Running, sprinting and jumping stay as they are. The crosshair already shows the real spread, so it
      shrinks with it. Gentler than CS / Valorant: no counter-strafing trick and no spray patterns to learn.
    - New settings (crouch toggle or hold) go on the existing start-screen settings, saved in one versioned settings
      store (audit W-02, fixed here because this step adds settings).
  - **M12b. Optics and aiming down sights** (notes 3, 4)
    - Replica models carry no optic by default: the AEG's red dot comes off its model, and it gets flip-up iron
      sights instead.
    - **An optic slot:** optics are accessories fitted to a replica. v0.1 has one (the red dot), fitted from a simple
      option before a match, off by default. More optics and full customisation come with loadouts (v0.3) and
      customisation (v0.5).
    - **Aiming down sights** works only with an optic fitted: hold the right mouse button to raise the sight to your
      eye. It narrows the view slightly, hides the crosshair (the dot is the aim point) and slows you to walking
      pace. A first guess: no extra accuracy beyond what standing still gives, so stillness stays the accuracy rule.
    - **Aiming sensitivity:** a separate mouse sensitivity while aiming down sights, as its own setting.
  - **M12c. The owner's M12b notes** (above)
    - **A Loadout box on the start screen:** the optic and a hop-up dial per replica, set before a match (the title
      and result screens), not on the pause screen. These start-screen settings are the beginning of the **loadout
      screen**: it takes them over when loadouts arrive (more optics and parts in v0.3), and M15 moves them into
      the proper menus.
    - **BBs drawn from the muzzle:** a fresh BB's streak no longer reaches back past the muzzle (it ran behind the
      camera and showed as a line slanting up from the bottom of the screen), and both replicas are held pointing
      straight ahead, so the BBs fly out along the barrel's line to the crosshair, from the hip and aiming.
    - **The pistol faces forward:** a little closer and more central, with only a slight lean to the left (0.1 rad,
      down from 0.36; owner after M12c: straight was "slightly too straight").
    - **Hop-up:** a dial per replica (0–100%) scaling the backspin lift; out of the box the rifle is on target to
      about 38 m (Depot's longest sightlines are ~34 m) and the pistol to about 25 m; over-hopped BBs rise and
      float. Bots use the factory setting.
- **M11. Depot rework** to the field checklist (moved from Phase 3, owner, 2026-10-02; before the art pass, since the
  art pass dresses its layout). Built from the layout sketch the owner approved on 2026-10-03 (revision 2):
  https://claude.ai/artifact/L3rfDSHNN6SN2YyZTFLKdD
  - Purpose-built airsoft barricades (walls with shooting ports).
  - Buildings with windows and doorways: today it's one office block, so add at least one more structure.
  - Deliberate choke points and flanking routes.
  - Objective locations: the poles, plus spots that later modes can use.
  - Clear dead zones and spawn areas.
  - **Elevation** (owner, 2026-10-02): the layout sketch proposes where ramps, raised platforms or stairs go, built on
    the elevation support (Phase 3). Raised edges stay open: bots don't step off them.
  - Consider a few genuinely low obstacles (about 0.7–0.9 m: pallets, low walls) designed for **vaulting**
    (owner idea; parked until here, with bots taught to use them). Today's 1.2 m crouch cover stays unclimbable.
    Not in the approved sketch, so still parked (IDEAS); it needs a vault move for players and bots first.
  - ~~Depot stays mirror-symmetric~~ The approved sketch makes Depot asymmetric (attackers in the west yard, one
    flagpole in the defenders' loading bay), so teams swap ends at half-time in both modes (owner, 2026-10-03).
    It keeps its identity: the crate yard, the containers and the office.
  - Layout tests are extended to the checklist; bot lanes and poles are updated.
  - The headless match guards stay green on the new layout (re-measured, not loosened).
  - Fix when touched (audit): reset the reload bar of a player who is hit (W-07), if playtesting shows it frozen.
- **M13. Audio rework** (owner's playtest note 6). Today's sound works; this makes it sound good and tell you more.
  - **Replicas sound like how they fire.** Each replica has a power source with its own sound profile: electric (the
    AEG: motor spin-up, gearbox and piston cycle, the BB leaving the barrel), gas (the pistol: a sharp gas pop and
    the slide or bolt clack), and spring for the spring replicas that come later (a piston thump and spring
    twang). More impact and body than today, but still the sound of an airsoft replica, never a firearm.
  - **Movement you can locate by ear:** clearer footsteps by surface and pace, gear rustle, landings, crouch and
    lean movement, with better direction and distance cues (HRTF panning) and sounds muffled when a wall is in the
    way. How far bots hear each sound stays as it is unless the rework deliberately retunes it.
  - Higher quality overall: richer synthesis, and CC0 samples where synthesis falls short (assets policy, CLAUDE.md
    §4; every file recorded in `docs/ASSETS.md`).
  - Fix when touched (audit W-03): reuse one panner per character and disconnect one-shot sound chains.
- **M14. Art pass** (CC0 assets only), VFX and lighting for Depot, the replicas and the figures.
- **M15. Menus and a full settings screen:** FOV, volume, colour-blind team colours, reduced motion and
  other accessibility options. It gathers the M12 settings (crouch toggle or hold, aiming sensitivity) and the
  render quality presets, and gives the pre-match Loadout box (optic, hop-up) its own loadout screen.
- **M16. Onboarding:** a short tutorial.
- Fix when touched (audit, `audit/OPUS_HANDOFF.md` §5), each inside the step that already edits that code: split the
  start screen and menus out of `game.ts` first (W-05), one versioned settings store for the new settings (W-02,
  in M12a), a "graphics reset" message on a lost WebGL context (W-01), shader warm-up if the overlay shows a hitch
  (W-04), and reusing audio nodes in M13 (W-03).

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

- **Replica platforms** that feel mechanically different, not like damage models. Each one sounds like its
  power source (electric, gas, spring; HPA if it comes), using the sound profiles from M13:

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
    lasers/lights and bipods. The optic slot and aiming down sights already exist from M12b (one red dot);
    this adds more optics, such as magnified scopes. It builds on the start screen's Loadout box (optic and
    hop-up, M12c), which becomes the loadout screen.
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
