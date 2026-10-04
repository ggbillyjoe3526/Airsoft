# Roadmap

The detailed plan. CLAUDE.md §7 holds the outline and the authoritative versioning policy.
First agreed with the owner on 2026-09-30. **Rewritten on 2026-10-01** from the owner's feature list:
v0.1 is the core game with strong foundations, and new content comes in later versions.

**Current focus: alpha.** We build first. Balance, bug fixing, QoL and performance come in beta.
**Multiplayer is not planned** (owner decision, 2026-09-30; confirmed 2026-10-03: absolutely no multiplayer). The game is
single-player against bots.

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
| **Phases and milestones** | Units of work, each reviewed by the critic. Not versions. | Phase 3: done (`v0.1-alpha.3` tagged 2026-10-03). Phase 4 (the last alpha phase) is under way: weapon handling (M12), the Depot rework (M11), the menus (M15, pulled forward by the owner), the owner's M15 notes (M15b), the audio rework (M13), match info (M19) and the Loadout feature (M17a, M17b, added by the owner) are done; comfort and accessibility (M18a controls and comfort, M18b accessibility and browser basics), squad orders (M22), custom matches (M20), the practice range (M21), the tutorial (M16) and the art pass (M14: VFX and lighting, procedural, with the Graphics quality picker back) are done: Phase 4 is feature complete, next the owner's audit, fixes and bug pass, then his playtest. The owner's `v0.1-alpha.3` and M15 playtest notes, his Loadout request and his feature picks are folded in (2026-10-03). |

The path:
1. **Alpha builds** while Phases 2–4 build v0.1.
2. **`v0.1-beta` builds** once the owner calls v0.1 feature complete.
3. **`v0.1`**, the first public release, when the owner calls it ready.
4. **Later versions** (`v0.2`, `v0.3` …): new modes, fields, replica platforms, bigger loadouts (gear, parts for
   the new platforms), customisation, progression and team comms (see [After v0.1](#after-v01-later-versions)). Each later version gets its
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
- **Loadout** (owner, 2026-10-03): a primary and a secondary replica, BB weight, hop-up and a first set of
  attachments (optics, grips, magazines), picked before a match. Gear and more parts come with later versions.
- **Match info and options** (owner, 2026-10-03): a hit feed, teammate markers, an end-of-match summary, crosshair
  options, custom match settings (rounds, round time, team size, a ricochets setting) and a practice range.
- **Comfort, accessibility and squad orders** (owner, 2026-10-03, second batch): the basic comfort and accessibility
  settings, browser basics (pause on a hidden tab, fullscreen, graphics problems handled), and three orders for your
  bot teammates.
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
- **Unlocks never block fun.** Progression is earned by unlocking replicas and gear, never by levels. From M26
  (owner, 2026-10-04) replicas and parts are assets in a pool (`pool.md`) unlocked in the Armory with Field Credits
  earned by playing: completely free, never bought with money, marked beta, and it can be switched off. The
  starting kit (AEG Rifle, Gas Pistol, Standard Battery, Green Gas) is a full loadout, and BBs are always free.

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
| Alpha · Phase 4 · M11 Depot rework (moved from Phase 3, owner, 2026-10-02): asymmetric layout, one flagpole, a raised loading dock, ends swap at half-time | Done (merged; owner's playtest next) | 9.0 |
| Alpha · Phase 4 · M15 Menus and settings (pulled forward by the owner, 2026-10-03, to his design): title screen, New game with Mode and Difficulty pop-ups, a Loadout screen and a Settings screen, pause and result menus | Done (merged; owner played it: five notes, for M15b and later) | 9.1 |
| Alpha · Phase 4 · M15b The owner's M15 notes: no map loaded until Play, a Map pop-up (Depot by default), opaque menus, the controls list only under Settings, a Field of view slider, Brightness removed, graphics quality held back as LATER | Done (merged; owner to play it) | 9.0 |
| Alpha · Phase 4 · M17a Loadout: replica slots and BBs (added by the owner, 2026-10-03): pick the primary and secondary replica, BB weight, hop-up | Done (merged; owner to play it) | 9.0 |
| Alpha · Phase 4 · M17b Loadout: attachments: more optics, grips, magazines (skins shown as LATER) | Done (merged; owner to play it) | 9.0 |
| Alpha · Phase 4 · M13 Audio rework: replicas that sound like how they fire (electric, gas, spring), footsteps by surface and kit rustle you can locate by ear (HRTF, muffled through walls), BB impacts by material, volume settings | Done (merged; owner's playtest next) | 9.0 |
| Alpha · Phase 4 · M18a Comfort and controls (owner's second batch, 2026-10-03): invert mouse, reduced motion, aim and sprint toggles, mouse buttons rebindable, sensitivity as cm/360 | Done (merged; owner to play it) | 9.0 (re-scored 2026-10-04 after its must-fixes) |
| Alpha · Phase 4 · M18b Accessibility and browser basics (owner's second batch; moved out of M18a at the owner's wrap-up, 2026-10-03): colour-blind options, on-screen sound cues, pause on a hidden tab, a lost graphics context, a hardware acceleration warning, fullscreen | Done (owner to play it) | 9.0 |
| Alpha · Phase 4 · M19 Match info (owner's feature picks and second batch, 2026-10-03): hit feed, teammate markers, hold-Tab scoreboard, round and match stats, end-of-match summary, local records, crosshair options | Done (merged; owner's playtest next) | 9.0 |
| Alpha · Phase 4 · M20 Custom matches (owner's feature picks): rounds, round time, team size, friendly fire, a ricochets setting (off by default) | Done (merged; owner to play it) | 9.0 |
| Alpha · Phase 4 · M21 Practice range (owner's feature picks): try replicas and loadouts on a range | Done (merged; owner to play it) | 9.0 |
| Alpha · Phase 4 · M22 Squad orders (owner's second batch): follow me, hold here, regroup; bots hear less through walls | Done (owner to play it) | 8.8 (auto-accepted, 4 of 4) |
| Alpha · Phase 4 · M14 Art pass, VFX and lighting (procedural: the CC0 asset sites were unreachable): daylight with a sky and trees, dressed Depot surfaces and props, figures in airsoft kit, toy-like replicas, gas puffs and impact dust, the Graphics quality picker back | Done (owner to play it) | 9.0 |
| Alpha · Phase 4 · M16 Tutorial: a coached first session on the practice range | Done (merged; owner to play it) | 9.0 |
| Alpha · Owner's 2026-10-04 batch · M23 Minimap and order wheel (items 2 and 3): a minimap with your teammates and the other team where last heard; hold Z for a squad order wheel (hover or click) | Done (owner to play it) | 9.0 |
| Alpha · M24 Menus and settings polish (owner's Phase 4 playtest notes 5–10, 13, 14, 2026-10-04): shorter button labels, the build's version from git, 90° field of view, short map blurbs, sound cue size and colour, a hit feed that keeps its lines, a larger scoreboard with a size setting, hidden Dev settings | Done (owner to play it) | 9.0 |
| Alpha · Owner's 2026-10-04 batch · M25a CC0 assets: a guide (`docs/CC0_ASSETS.md`: sources, formats, folders, licences, size limits) and a loader that draws a dropped-in glTF player model, the built-in figures as fallback | Done | 9.0 |
| Alpha · Owner's 2026-10-04 batch · M25b Depot rework (minor): fewer stacked crates, less clutter, more kinds of objects, sightlines and balance kept (owner approved concept v2) | Done (owner to play it) | 9.0 |
| Alpha · Owner's 2026-10-04 batch · M26a Asset pool: `pool.md` (the asset register the game reads, with its guide), rarity tiers, the economy's numbers, the player's collection | Done | 9.1 |
| Alpha · Owner's 2026-10-04 batch · M26b Loadout screen: Primary, Secondary and Grenades slots, an item picker, a Customise screen per replica (optics, BB weight slider, hop-up, grip, laser, magazine, power source) | Done | 9.0 |
| Alpha · Owner's 2026-10-04 batch · M26c Armory (beta): Field Credits from matches, Tokens, single and ten Shots of three assets, scrapping spares | Done | 9.1 |
| Alpha · Owner's 2026-10-04 batch · M26d Dev settings for the Armory: switch the gacha off, unlock all gear; docs | Done | 9.1 |
| Alpha · Owner's 2026-10-04 batch · M30 BB physics pass 2 (owner, 2026-10-04): a flight model from fluid dynamics: real drag by Reynolds number, Magnus lift from the hop-up's decaying backspin, a per-match breeze with gusts that drifts BBs (the dust shows it) | Done (owner to play it) | |
| Alpha · Owner's 2026-10-04 requests · M29a Weapon performance data: `stats.md` (every replica's and part's numbers, hand-editable), tiers that add energy and rate of fire, batteries that set the rate of fire, an 11.1 V LiPo battery, a site energy limit, a Performance sheet on Customise | Done | 8/8 |
| Alpha · Owner's 2026-10-04 requests · M29b Barrels and silencers (AEG: barrel and muzzle; pistol: muzzle), and random loadouts for opponents on Hard | Done | 8/8 |
| Alpha · Owner's 2026-10-04 requests · M31 Save system: everything saves automatically in the browser; Settings → Save downloads the save as a file and loads one back (side by side first, Undo after), three daily restore points, a format number with step-by-step migrations so older saves always load, one tab plays at a time | Done (owner to play it) | |
| Alpha · Owner's 2026-10-04 requests · M33 Woodland, a second field at night (owner picked concept C, 2026-10-04): a wide, open wood with a gentle slope and a hill at one end, night only; a free weapon torch for every player; glowing BBs on the Loadout. M33a: Woodland greyed out as Coming soon in the Map pop-up. M33b: glowing BBs | In progress (M33a done #64, M33b done; sketches approved) | M33a 7/8 |
| Alpha · Owner's 2026-10-04 requests · M34 Neon Heights, a third field (owner's concept v1, all defaults, 2026-10-04): a small, vertical futuristic city block, three playable floors, Day or Night picked on the map's tile, tagged dev until he calls it done. M34b: bot navigation for floors over floors | In progress (M34b done; M34c greybox next) | M34b 8/8 |
| Alpha · Final alpha chain · Final alpha audit implemented (FA1–FA12, Fable audit of 2026-10-04: 148 findings, 0 critical, 4 high; the owner confirmed all twelve decisions): crash handling and sim fixes (#57), audio (#55), input, HUD and UI polish (#59), BB hot path (#60), build and pipeline hygiene (#61), Armory and economy (#63), bots and difficulty (#66), quality presets with Custom graphics and render cost (#67), the visual overhaul of figures, replicas and effects (#69) and of lighting, sky, map, flag and range (#71), the tab lock (#69), session plan, faster tests and map reuse (#73) | Done (owner's playtest next; then the step 3 polish pass) | 7–8/8 per task |
| Alpha · Owner's 2026-10-04 requests · M36–M41 Esports difficulty ("Pro"): bots that hold angles, clear corners and trade, a Rules picker (Skirmish, Tournament, Pro CQB, Custom), map balance guards and a "what got you" card; tagged dev until the owner says it's done | Planned (starts after the final alpha pass) | |
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

**The owner's M15 playtest notes (2026-10-03, on `main` after the menus merged) and where each one went:**

| # | Note | Goes to |
|---|---|---|
| 1 | The menu appears without loading a map. A **Map** choice sits beside Mode, Difficulty and the rest, with Depot as the default (more maps come later). The map, difficulty, loadout and settings load only when Play is pressed. The menus are opaque, not see-through onto the field. The controls list shows only under Settings, where the key bindings live | M15b |
| 2 | A basic **Field of view** slider; today's FOV stays the default, and the player can widen or narrow it | M15b |
| 3 | Remove the Brightness setting from Graphics | M15b |
| 4 | Graphics quality is held back for now (still basic geometry and models), but its place is kept for later | M15b (greyed out, LATER); back in M14 as a saved picker that scales the art pass |
| 5 | An **Esport** difficulty above Hard that plays almost like a competitive title (Counter-Strike, Valorant). Noted, not built: Easy, Normal and Hard come first | Planned as M36–M41 (owner, 2026-10-04) |

**The owner's Loadout request (2026-10-03, after the M15 notes) and where it went:**

| # | Note | Goes to |
|---|---|---|
| 1 | Build the Loadout feature behind the Loadout menu, as an alpha feature | M17a, M17b |
| 2 | Pick a primary and a secondary replica (today the AEG rifle and the gas pistol) | M17a |
| 3 | Pick BBs and their weight | M17a |
| 4 | Hop-up settings | M17a (the M12c dial, reworked with BB weight) |
| 5 | Attachments: optics, grips, magazines and the like | M17b (more parts, muzzle devices and gear in v0.3) |
| 6 | Perhaps eventually skins for the replicas and the outfit | Not built in v0.1: a greyed Skins row (LATER) in M17b; the skins themselves in v0.5 |

**Order** (owner picked weapon handling first, 2026-10-03; he pulled the menus forward the same day and added the
Loadout feature after the M15 notes, then picked M18–M22 from a feature research list and his own gap list): **M12a → M12b → M11 → M15 → M15b → M17a → M17b → M13 → M18a → M18b → M19 → M20 → M21 → M22 → M14 → M16.** Weapon handling comes
first because it changes what the owner just played and gives something new to play quickly, and it doesn't wait on
the Depot layout sketch. The Depot rework follows once the sketch is approved (approved 2026-10-03). The audio rework comes after it so
movement sounds, echoes and muffling through walls are tuned on the new layout's buildings and floors. Art, menus and
the tutorial come last because they dress and explain everything before them.
M15b follows M15 straight away: the owner's playtest notes set the priorities, and it reworks the screens the owner just
played, before the audio rework adds settings to them.
The Loadout (M17) comes right after M15b and before the audio rework, for four reasons: it fills the Loadout screen's
LATER rows while that screen is fresh from M15 and M15b; most of its groundwork is already in the game (BB mass drives
drag, lift and spin since M9, the optic slot since M12b, the hop-up dials since M12c); it is gameplay, which comes before
the dressing; and the audio rework (magazine sounds, a hi-cap's rattle), the art pass (models for every part) and the
tutorial can then cover the parts, instead of being redone for them.
The owner's feature picks (M19, M20, M21) come after the audio rework, which was already under way when he picked them,
and before the art pass and the tutorial, for the same reason as the Loadout: they are gameplay and screens that the art
pass then dresses and the tutorial then explains (the tutorial can use the practice range).
The second batch (2026-10-03) renumbered the first picks (match info, custom matches and practice range were M18–M20 when
merged) so that the comfort and accessibility settings (M18) come first among them: they are the basics every player
looks for, and they don't wait on any other system. Squad orders (M22) come last because they build on the bots' team
plans and on the custom matches' teammate difficulty.

**The owner's feature picks (2026-10-03, from a researched list of what airsoft players and FPS fans expect) and where
each one went:**

| # | Note | Goes to |
|---|---|---|
| 1 | BB ricochets as a setting in the menus; off by default (ricochets don't count) | M20 |
| 2 | Keep the chrono before a match | v0.3 (unchanged) |
| 3 | Keep the planned game modes for later | v0.2 (unchanged: TDM, Capture the Flag, Domination, Bomb) |
| 4 | Medic mode with a bleed-out timer, as a future feature | v0.2 (moved from IDEAS) |
| 5 | VIP escort, flagged as an idea for later | IDEAS |
| 6 | Hostage rescue, flagged as an idea for later | IDEAS |
| 7 | Experiment later with 4v4 or 5v5 Team Deathmatch instead of 3v3; may need a Depot rework or fields built for it | v0.2 |
| 8 | Day and night maps, picked before a game; at night BBs glow and lights stand out (e.g. attachment lights). Later | v0.4 |
| 9 | Grenades, smoke and flash bombs | v0.3 |
| 10 | Pouches that allow extra gear. Later | v0.3 (gear) |
| 11 | Gas simulation: fast shooting means less power | v0.3 |
| 12 | Tracer BBs as a loadout option | v0.3 (with the chrono; at their best on night maps) |
| 13 | Hit feed | M19 |
| 14 | End-of-match summary screen | M19 (moved from IDEAS) |
| 15 | Teammate markers | M19 |
| 16 | Custom match settings: rounds, round time, team size and the like | M20 |
| 17 | A practice range to test replicas and the loadout | M21 (moved up from v0.3) |
| 18 | Crosshair customisation in the settings menu: size, colour, shape and the like | M19 |
| 19 | Team communication (wheel, pings, hand signals) for later versions | Unchanged ([when the bots are ready](#when-the-bots-are-ready-team-communication)) |
| 20 | Esport difficulty for later | Planned as M36–M41 (owner, 2026-10-04) |
| 21 | Absolutely no multiplayer | Confirmed (DECISIONS) |

**The owner's second batch (2026-10-03, his own gap list, confirmed "yes to all") and where each item went:**

| # | Note | Goes to |
|---|---|---|
| 1 | No volume slider (master fixed at 0.7) | M13 (done, #19: Master, Effects and Interface volume on Settings → Audio) |
| 2 | Invert mouse | M18 |
| 3 | A way to turn off camera shake and weapon bob | M18 (Reduced motion) |
| 4 | Toggle or hold for aim and sprint, not only crouch | M18 |
| 5 | The Accessibility tab has no milestone; colour-blind options (the magazine gauges rely on colour) | M18 |
| 6 | Crosshair options: colour, size, dot only | M19 (already there) |
| 7 | On-screen cues for sounds (footsteps, shots, hit calls) | M18 |
| 8 | Match setup: team size, rounds to win, round time | M20 (already there) |
| 9 | A separate difficulty for your teammates and for your opponents | M20 |
| 10 | A hold-Tab scoreboard | M19 |
| 11 | Numbers at the end of a round and a match: accuracy, hits, BBs fired, time alive | M19 |
| 12 | Local records saved between sessions (wins per difficulty, best accuracy) | M19 |
| 13 | An elimination feed in airsoft style ("Orange 2 called HIT · Blue 1") | M19 (the hit feed, in that wording) |
| 14 | Pause when the tab is hidden | M18 |
| 15 | Handle a lost graphics context (audit W-01) | M18 (no longer "fix when touched") |
| 16 | Warn when hardware acceleration is off | M18 |
| 17 | A fullscreen toggle | M18 |
| 18 | Orders for bot teammates: follow me, hold here, regroup | M22 (the wheel, pings and hand signals stay later) |
| 19 | Practice range; the tutorial could end in a free-practice yard | M21 (already there) |
| 20 | Bots hear through walls with no muffling; at higher difficulties it feels like wallhacking | M22 |
| 21 | For a future Esport difficulty: sensitivity as cm/360 or "same as CS2 / Valorant", aim stats, first-shot spread tuned for that tier, bot hearing through walls fixed | cm/360 in M18; the rest in M36–M41 (aim stats as its guards and tuning); hearing in M22 |
| 22 | Bug: the HUD says "press R to reload" after reload is rebound | Fixed in its own pull request (not a milestone) |
| 23 | Mouse buttons can't be rebound (fire and aim fixed; side buttons unused) | M18 |

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
      screen**: it takes them over when loadouts arrive (more optics and parts in v0.3). M15 moved them onto the
      Loadout screen.
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
  - **Built (2026-10-03):** every sound is a recipe (`config/sounds.ts`) rendered once into buffers; electric, gas
    and spring shot profiles, the AEG motor winding up and down; footsteps by surface (Depot's dock ramps are steel),
    landings and kit rattle, crouch / stand / lean rustle; BB impacts by material (concrete, steel, wood); HRTF
    panning and muffling by two rays per character; Master, Effects and Interface volume sliders on Settings → Audio.
    No CC0 samples were needed yet. Bots hear exactly what they heard before. W-03 done.
- **M14. Art pass** (CC0 assets only), VFX and lighting for Depot, the replicas and the figures.
  - **Built (M14, 2026-10-04):** an alpha art pass, all procedural (the CC0 asset sites were unreachable from the build
    environment, DECISIONS 2026-10-04; downloaded CC0 models and textures can replace parts later). **Lighting:** a warm
    sun and cool sky fill, a gradient sky dome with a glow towards the sun, a matching light haze and a ring of trees
    beyond the walls (`render/atmosphere.ts`), all in `config/render.ts`. **Depot:** new canvas textures (slab concrete with
    joints, stains and cracks; painted breeze blocks; braced plank crates; ribbed container steel with streaks and rust;
    diamond tread plate on the steel ramps; moulded barriers), grime and contact shade at the foot of walls and props, a
    little brightness variation between blocks, and detail drawn inside each block's own bounds (container frames and
    locking bars, wall copings, pallets under crates on the ground), so collision, nav and cover are untouched.
    **Figures:** players at a weekend game: six casual looks (hoodies and tees, jeans and work trousers, a chest rig or a
    plate carrier, a cap, a helmet or bare hair, goggles on all and a mesh mask on two, faces showing), pads and gloves,
    tapered limbs, and the team colour as tape (a broad torso band that reads at 30 m on Low, shoulder straps, armbands,
    headgear and thigh bands); a two-handed pistol pose; still four merged meshes drawn each. **Replicas:** satin moulded plastic with a soft
    reflected sheen, slimmer glove fingers. **VFX:** a gas pistol puffs gas at the muzzle and ejection port on each
    shot, BB impact dust tinted and sized by material, soft round puffs, dust motes drifting round you (off with
    Reduced motion), flag folds that catch the light. **Graphics → Quality** is back as a saved picker (Low / Medium /
    High, applied at once; antialiasing from the next load): it scales pixel ratio, shadows and their softness, surface
    relief, dust and the replica's sheen; on Depot Low makes a little over half the draw calls of High (35 against 61).
- **M15. Menus and a full settings screen** (pulled forward ahead of M13 by the owner, 2026-10-03, to his own
  design; concept sketch approved the same day). The start screen was too cluttered, so it becomes:
  - **Title screen:** "AIRSOFT" in the middle over the field, **Start** at the bottom left.
  - **New game:** four buttons, **Mode**, **Difficulty**, **Loadout** and **Settings**, with the picked mode's rules
    under them, **Back** and **Play**. Mode (Elimination, Attack and Defend) and Difficulty (Easy, Normal, Hard)
    open a pop-up.
  - **Loadout screen** (replaces the start screen's Loadout box): the replica in each slot, primary (the AEG
    rifle) and secondary (the gas pistol), with "more replicas later"; for the picked one the optic and the hop-up
    dial, and BB weight, grip, magazine and power or gas type listed as coming later.
  - **Settings screen:** tabs for Controls (mouse and aiming sensitivity, crouch toggle or hold), Key bindings
    (and the fixed mouse controls), Graphics (the quality presets, now a saved setting; `?quality=` still works
    for a visit), and Audio and Accessibility listed as coming later (volume, colour-blind team colours, reduced
    motion; FOV, brightness and invert mouse are listed on their tabs too).
  - **Pause** (Esc): Resume, Settings, Quit to title screen. **Result:** Play Again, Change setup, Title screen.
  - Headings and labels in capitals (owner); descriptions as written.
  - Still to do: the settings and parts marked LATER, as their systems arrive (audio in M13, parts with loadouts).
- **M15b. The owner's M15 notes** (above, notes 1–4). Built as below; the owner plays it next.
  - **No map until Play:** the title and New game screens stand on their own, with no field loaded or drawn behind
    them. Pressing Play builds the picked map with the picked mode, difficulty, loadout and settings, then starts the
    match. Quit to title screen and Change setup unload it, so the next Play can load a different map (no leaks:
    GPU memory stays flat across matches, as it does today across restarts).
  - **A Map button** on New game, beside Mode, Difficulty, Loadout and Settings, opening a pop-up like Mode's. It
    lists Depot (the default), and its choice is saved like the others. Later fields join this pop-up as they are built
    (Woodland, M33, shows there greyed out as Coming soon until it is playable).
  - **Opaque menus:** a solid background on every menu screen, so nothing of the game shows through. The pause menu
    is opaque too (a default; the owner can ask for it to stay see-through mid-match).
  - **Controls only under Settings:** the controls list leaves the New game and pause screens; the key bindings stay
    on Settings → Key bindings.
  - **Field of view slider** on Settings → Graphics, replacing its LATER row: today's view (100° across a 16:9 screen)
    is the default, adjustable from about 80° to 120° (a first guess), saved, and applied at once, also from the
    pause menu. Aiming down sights keeps zooming in from whatever FOV is set; the held replica keeps its own camera.
  - **Brightness removed** from Graphics.
  - **Graphics quality held back:** the Quality picker is greyed out and marked LATER, the game runs on the default
    preset (High), and any saved quality is ignored. `?quality=` stays as a developer switch for measuring frame
    cost (Phase 3 audit C-04). The picker comes back with the art pass (M14) or the beta performance work, when
    there is real graphics work to scale. (M14: back, as a saved setting that applies at once.)
  - The playtest guide's "Menus (M15)" section is updated to match.
  - Also: mode, difficulty and loadout are only picked on New game, with no match loaded, so the old "starts with the
    next round / match" rules and notes are gone; Play always builds the match from what is picked.
- **M17. Loadout** (the owner's Loadout request, above; added 2026-10-03 as an alpha feature). The Loadout screen from
  M15 becomes a working loadout: what you carry and how it is set up, picked between matches (never mid-match, the M12c
  rule), saved like the other choices, and free from the start (no unlocks, DECISIONS 2026-10-01). Parts are trade-offs,
  never straight upgrades: one hit is still one hit, and where you stand and move still decides fights (design rules,
  above). Bots keep each replica's factory setup. Split in two so the first half can be played sooner.
  - **M17a. Replica slots and BBs**
    - **Primary and secondary:** each slot opens a picker listing the replicas that fit it: today the AEG rifle (primary)
      and the gas pistol (secondary), one each, so the picker is ready for the v0.3 platforms rather than a choice yet.
      The match gives you what the slots hold. The "more replicas later" line stays.
    - **BB weight** per replica, picked from the weights sites sell (first guess: 0.20, 0.25, 0.28 and 0.30 g; the AEG
      keeps 0.25 g and the pistol 0.20 g by default). The BB physics already uses the BB's mass (M9): a heavier BB leaves
      the barrel slower, keeps its speed better and needs more hop; a lighter one is quicker early but sheds speed
      sooner and rises on the same hop. Its LATER row is replaced. Revisits the placeholder "same muzzle energy whatever
      the BB weight" (DECISIONS 2026-10-02).
    - **Hop-up:** the M12c dial stays per replica and now works with the picked BB weight: the line under it says how
      far the BB flies flat with that weight and dial (the "on target to about 38 m" readout).
    - Built (2026-10-03): the Replica picker sits at the top of each slot's panel; the BB weight comes before the hop-up
      and its line gives both sides of the choice (speed out and time to 20 m, the best dial and how far it then
      carries); a heavier BB gets a little more muzzle energy (DECISIONS). Weights 0.20, 0.25 and 0.28 g: 0.30 g only
      matched 0.28 g's reach while arriving later on these replicas, so it waits for stronger platforms. Rifle at its
      best dial: 0.20 g 37 m (20 m in 0.27 s), 0.25 g 38 m (0.28 s), 0.28 g 40 m (0.29 s).
  - **M17b. Attachments**
    - **Optics:** iron sights and the red dot, plus one magnified optic (first guess: a low-power 2× scope: a closer view
      for Depot's long lanes, but slower to raise and a narrower view around it). Rifle only; the pistol has no rail.
    - **Grips** (rifle): none by default, plus a vertical and an angled grip with small, opposite strengths (first guess:
      the vertical grip steadies the aim a little sooner after moving, the angled grip raises the sight a little faster).
      Replaces the Grip LATER row.
    - **Magazines:** the standard magazine stays the default. First guesses: the rifle gets a hi-cap (more BBs per
      magazine, but fewer carried and it rattles when you move, so bots hear you sooner) and a low-cap (fewer BBs,
      silent, one more carried); the pistol gets an extended magazine (more BBs, slower to draw). Replaces the Magazine
      LATER row. How many each carries is final-tuned in beta.
    - **Skins:** a greyed **Skins** row (replicas and outfit) marked LATER keeps their place; skins come with
      customisation (v0.5).
    - The power or gas type row stays LATER (the v0.3 platforms).
    - Each part shows on the held replica as simple geometry; the art pass (M14) models them properly. (M14 polished
      the replicas' materials but left the parts' shapes as they were: KNOWN_ISSUES.)
    - Built (2026-10-03, `config/attachments.ts`): the **2× scope** (zoom 2, 1.6× slower to raise, the HUD shows only
      its round eyepiece with a reticle and a lit centre dot, and the mouse turns slower in proportion); the **vertical grip** (the shake
      of a sprint or landing settles in 0.6× the time; 25% slower to draw and to raise a sight) and the **angled grip**
      (20% quicker to draw and raise; the shake lasts 1.3×); the rifle's **hi-cap** (120 BBs, two carried: the same 240,
      and quiet moves rattle, heard by bots within 7 m), **low-cap** (30 BBs, five carried, a 20% quicker reload) and the
      pistol's **extended** magazine (27 BBs, 35% slower to draw). Each Loadout row says in numbers what the pick does.
      Bots keep factory parts. A **Skins** row (replicas and outfit) is greyed as LATER.
  - The playtest guide gets a Loadout section for each half.
- **M18. Comfort, accessibility and browser basics** (the owner's second batch, items 2–5, 7, 14–17, 21 and 23). The
  settings every player looks for first (PCGamingWiki's list, the Game Accessibility Guidelines' basic tier). It fills
  the Controls and Accessibility tabs' LATER rows; volume comes with M13. Built in two halves: **M18a** (done) the
  Controls items and reduced motion; **M18b** (done) colour-blind options, sound cues and the browser basics. M19 was built before M18; all are done (M16 went before M14 so the art pass dresses a finished game).
  - **Controls:** invert mouse; toggle or hold for aiming down sights and for sprint (as crouch already has); fire,
    aim and any other action bindable to mouse buttons, side buttons included; the sensitivity also shown as cm/360
    (worked out from the mouse's DPI, which the player enters), so it can match another shooter.
  - **Reduced motion:** turns off camera shake and weapon bob (and softens the lean's roll). Built (M18a): no bob or
    sway, half the replica's kick, a quarter of the lean's roll; the camera's small recoil climb stays, as it shows
    where the next BB goes (DECISIONS).
  - **Colour-blind options:** team colour sets that stay apart for the common kinds of colour blindness, and nothing
    told by colour alone: the spare-magazine gauges get a shape or label for "low" and "next" (KNOWN_ISSUES).
  - **On-screen sound cues** (opt-in): a marker at the screen edge pointing to footsteps, shots and hit calls, the way
    the ears do today. Off by default so playing by ear stays the norm.
  - **Browser basics:** the game pauses when its tab is hidden; a fullscreen toggle (Settings and a key); a lost
    graphics context shows a "graphics reset" message and recovers (audit W-01, moved here from "fix when touched");
    a warning on the title screen when the browser runs without hardware acceleration (the game would crawl).
  - **Built (M18b, 2026-10-04):** Team colours Standard or High contrast (light blue and dark orange, apart in
    lightness too), both checked by a colour-blindness simulation test; the spare-magazine gauges' low is striped and
    next has a caret; on-screen sound cues (a ring round the crosshair: two dots for steps, an arrowhead for shots, a
    HIT tag for hit calls, as far as each is heard); a hidden tab pauses; a lost graphics context pauses under a
    notice and recovers; a title-screen warning for a software renderer; fullscreen on Settings → Graphics and F10.
    The gauges' numeric mode moved to beta (UX/QoL).
- **M19. Match info** (the owner's feature picks 13, 14, 15 and 18; second batch 10–13). What any FPS player expects to see; first guesses
  to tune in play.
  - **Hit feed:** a short list in a corner of who hit whom, in airsoft style ("Orange 2 called HIT · Blue 1"), newest at the top, each line fading
    after a few seconds. Friendly hits are marked as such, and lines carry a team label as well as the team colour, so
    colour isn't the only cue.
  - **Teammate markers:** a small team-coloured marker with the name over each teammate still in play, so you know
    where they are and don't knock them out (friendly fire counts). It greys out when they're hit. Enemies never get
    one.
  - **End-of-match summary:** a screen between the last round and the result menu (and reachable from it): for every
    player, hits, times hit, friendly hits, BBs fired, accuracy and time alive, plus rounds won; your line stands out.
    The same numbers for the last round show between rounds.
  - **Hold-Tab scoreboard:** the same table mid-match, while Tab is held (rebindable).
  - **Local records,** saved in the browser between sessions: wins and losses per difficulty and mode, best accuracy,
    longest win streak. Records only, never levels or unlocks (design rules).
  - **Crosshair options** on the Settings screen, with a live preview: shape (cross, dot, circle, cross with a dot),
    size, thickness, gap, colour and outline. It keeps opening and closing with the real spread, as today. Saved in the
    settings store.
- **M20. Custom matches** (the owner's feature picks 1 and 16; second batch 9)
  - **A Match pop-up** on New game, beside Mode, Map, Difficulty, Loadout and Settings, saved like the other choices.
    First guesses: rounds to win (3, 5, 7 or 10; 5 by default), round time (1:30 to 5:00; 2:30 by default), team size
    (1v1, 2v2 or 3v3 on Depot; 3v3 by default) and friendly fire (on by default, as at a real site). Attack / Defend's
    half-time follows the rounds to win. Bigger teams wait for bigger fields (the 4v4 / 5v5 experiment, v0.2).
  - **Teammate and opponent difficulty:** Difficulty picks a level for your team's bots and one for the other team's
    (both Normal by default; one level drives every bot today, DECISIONS 2026-10-01).
  - **BB ricochets:** BBs bounce off hard surfaces (concrete, steel containers) and lose speed doing it, instead of
    stopping dead as today. A **Ricochets count** setting in the Match pop-up decides whether a bounced BB knocks someone
    out, the way fields set their own rule. **Off by default** (owner): a ricochet that hits you ticks but you stay in.
    Bots follow the same rule.
  - Layout and headless match tests cover every team size.
  - **Built (2026-10-04):** a **Match** button on New game (after Mode) opens a pop-up with Rounds to win (3, 5, 7, 10),
    Round time (1:30 to 5:00 in half minutes), Team size (1v1, 2v2, 3v3), Friendly fire and Ricochets count, each saved
    and shown on the button and in the rules text; half-time follows the rounds to win (after `winsNeeded - 1`). The
    Difficulty pop-up has an Opponents and a Teammates row; each team's bots think with their own level's skill.
    Only the standard match (3v3, first to 5, both teams at one difficulty) counts for the records; New game's rules say
    so before a custom one, and the summary after. BBs bounce off concrete (40% of the speed into it back out) and steel containers
    (55%), keep 75% along the surface, lose their backspin, scatter a little, at most twice and never below 12 m/s;
    crates stop them. A ricochet that doesn't count makes a knock and a "Ricochet · doesn't count, play on" notice; one
    that counts knocks you out and the hit feed tags it RICOCHET. Headless guards play 1v1 and 2v2 in both modes over several seeds,
    and a 3v3 with ricochets counting. With friendly fire off, bots no longer hold fire for
    teammates in their line (`config/matchRules.ts`, `sim/ricochet.ts`).
- **M21. Practice range** (the owner's feature pick 17; moved up from v0.3)
  - A small range of its own, opened from the title screen: lanes with distance markers out past Depot's longest
    sightlines, steel targets that ring when hit and standing and crouched figure targets.
  - Open the Loadout screen from the range (not a match, so the never-mid-match rule doesn't apply) and try a replica,
    BB weight, hop-up or part straight away; magazines refill and a readout gives the last shot's distance.
  - The tutorial (M16) can take place here and ends in free practice on it.
  - **Built (2026-10-04):** **Practice range** on the title screen opens a walled 22 × 72 m concrete range (a 5 m
    backstop at 66 m): steel plates on the left, standing figures in the middle and crouched figures on the right, at
    10, 20, 30, 40, 50 and 60 m, each a little further right than the one in front so none hides another. Plates ring
    and swing back; figures (a player's hit volume, standing or crouched) fall back and stand up after 1.5 s. Painted
    lines across the floor and boards on both walls mark the distances; the readout says where your last BB landed
    and what it hit. Spare magazines stay full. The pause menu there offers the Loadout, and coming back rebuilds the
    range with the new kit where you stood (`config/range.ts`, `sim/rangeTargets.ts`, `rangeSession.ts`).
- **M22. Squad orders** (the owner's second batch, items 18 and 20). A small first step towards team communication;
  the wheel, pings and hand signals still wait until the bots can follow them.
  - **Three orders** for your bot teammates, each on a key (rebindable): **Follow me** (they move with you and cover
    your back), **Hold here** (they hold the spot you look at, or their own if you look at nothing) and **Regroup**
    (they come back to you). A short voice line or hand sign confirms, and the HUD shows the current order.
    Without an order the bots play their team plan as today.
  - **Hearing through walls:** bots hear footsteps and gunfire through walls at a shorter range, using the wall rays
    the audio rework (M13) casts for muffling, so they no longer seem to hear through walls like a wallhack
    (KNOWN_ISSUES). The headless match guards are re-measured on Depot.
  - **Built (M22, 2026-10-04):** Follow me (Z), Hold here (X) and Regroup (V), rebindable; a radio double-click answers
    and a HUD line shows the order in force; the same key again cancels. Bots hear through walls at 60% of the range.
    Voice lines and hand signs wait (KNOWN_ISSUES).
- **M16. Onboarding:** a short tutorial.
  - **Built (2026-10-04):** the title screen's **Tutorial** (tagged "New? Start here" until you finish it once) opens
    the practice range with a coach panel at the top: ten short steps, each finished by doing it (look around, walk to
    the firing line, ring a plate, knock down a figure at 50 m or more (the hop-up step, with the last BB on the coach), reload, aim down the sight, crouch, lean,
    switch replica and hit something, then one hit and you're out). Keys show as you have them bound. With iron sights
    (no optic to aim through) the aim step points to the Loadout's optics instead. A finished step shows a tick for a
    moment; after the last one the coach gives way to the range readout and you keep practising. Pausing shows which
    step you're on, and changing the loadout from the pause menu keeps your place (`config/tutorial.ts`,
    `tutorial/tutorial.ts`, `ui/coachPanel.ts`).
- **M23. Minimap and order wheel** (the owner's feedback of 2026-10-04, items 2 and 3).
  - **Minimap:** your teammates at all times; the other team only at an approximate spot from the last noise each
    made (footsteps, shots), as far as the on-screen sound cues reach.
  - **Order wheel:** hold Z for a wheel of squad orders (follow, hold and so on). Point at one to light it; letting go of
    Z gives it, or (a setting) a click does. The mouse moves only the wheel while it's open, never the view or aim.
  - **Built (M23, 2026-10-04):** a round minimap top left, turned with your view and centred on you (on the player you
    watch once you're out), drawn from the map's blocks so it follows any Depot change. Teammates show as dots (grey
    once hit, pinned to the rim when off it), the hold spot as a diamond and in Attack / Defend the flagpole. Each
    player of the other team shows as one patch where they were last heard: dashed for a footstep, with a dot for a
    shot, wider the further off it was (a footstep is vaguer than a shot), fading over 5 s and gone once they're hit.
    The wheel: **Follow Me**, **Hold Here**, **Regroup** and **Team Plan** (back to the team plan), the order in force
    underlined (picking it again keeps it); the mouse moves the wheel's own pointer, the trigger, aim button and mouse
    wheel are the wheel's while it's open (a held trigger needs a new pull), and your keys still move you. Settings → Controls → **Order wheel**: Hover
    (default) or Click; a click gives an order either way. Follow me's own key moved from Z to **F** (a saved set of
    key bindings from before moves with it); X and V stay (`config/minimap.ts`, `ui/minimap.ts`, `ui/minimapView.ts`,
    `input/orderWheel.ts`, `ui/orderWheel.ts`).
- **M24. Menus and settings polish** (the owner's Phase 4 playtest notes, 2026-10-04, items 5–10, 13 and 14; the
  minimap and order wheel, the Depot rework and the Loadout, Armory and pool are milestones of their own).
  - **Labels:** menu buttons kept to a word or two, each word capitalised: Quit (was Quit to title screen), Practice
    Range, New Game, Summary, Open, Enter Fullscreen, Reset All. Footer notes that only repeat the obvious are gone
    ("Changes save as you make them.", the pause menu's notes, the Settings tile's list); help lines on settings stay.
  - **Version:** the title screen shows the build being played, worked out from `git describe` as the game is built
    (`v0.1-alpha.3` on a release, `v0.1-alpha.3+12 · abc1234` after it), or from `.git_archival.txt` in a release zip.
    Nothing to bump at a release (`config/buildVersion.ts`, `vite.config.ts`).
  - **Field of view** defaults to 90° (was 100°). **Maps** get a one-line blurb: Depot is "An abandoned warehouse yard."
  - **Sound cues** (Settings → Accessibility): a size slider (60–200%) and a colour from the crosshair's list.
  - **Settings → HUD** (a new tab): Scoreboard size (80–200%, 130% by default, so larger than before; held back in a
    narrow window so the hit feed keeps its room) and Hit feed: Fade (as before) or Keep (the match's last 10 hits
    stay up through every round).
  - **Dev settings:** a "Dev settings" box under the Settings tabs shows a Dev tab: Disable Armory and Unlock all gear
    (saved settings the Armory and the Loadout's pool will read), Debug info, BB paths, Game speed (25–200%), Bottomless
    magazines and Ghost (BBs pass through you). They apply only while the box is ticked; the three that change play
    keep a match out of the records (`config/dev.ts`, `settings/dev.ts`, `ui/devSettings.ts`).
- Fix when touched (audit, `audit/OPUS_HANDOFF.md` §5), each inside the step that already edits that code: split the
  start screen and menus out of `game.ts` first (W-05, done in M15: `ui/menus/`), one versioned settings store for the new settings (W-02,
  in M12a), a "graphics reset" message on a lost WebGL context (W-01, now in M18), shader warm-up if the overlay shows a hitch
  (W-04), and reusing audio nodes in M13 (W-03).

### The owner's feedback batch (2026-10-04)

William's notes of 2026-10-04 (fourteen items) were split into four threads, built side by side: M23 (minimap and
squad order wheel), M24 (menus and settings), M25 (Depot rework and CC0 assets) and M26 (Loadout, Armory and asset
pool, items 11, 12 and part of 14).

- **M25. Depot rework and CC0 assets** (items 1 and 4).
  - **M25a. CC0 assets** (item 1: "how do I use CC0 assets to improve player models?"). A guide,
    [`CC0_ASSETS.md`](CC0_ASSETS.md): which CC0 sites suit a browser game (Quaternius, Kenney, Kay Lousberg, Poly
    Haven, ambientCG), glTF binary and the PBR texture maps, where files go, licences (recorded in ASSETS even though
    CC0 needs no credit) and the web size budget. A player model saved as `src/assets/models/characters/figure.glb`
    replaces the built-in figures for every player and bot: scaled to the hit volume, feet on the ground, team
    materials painted in team colours. Named parts (`body`, `legL`, `legR`, `aimRifle`, `aimPistol`, `hitPose`) move
    like the built-in ones and the built-in figure draws any part left out; an unnamed model is drawn whole. Without
    the file nothing is fetched; a broken one falls back with a console warning. The asset sites are blocked by the
    cloud environment's network policy, so files arrive by the owner committing them or by allowing those hosts.
    Later: glTF animations, props and surface textures from files, Draco and KTX2.
  - **M25b. Depot rework, minor** (item 4: fewer crates stacked two high and close together, less verticality and
    clutter, more variety but nothing major, sightlines and balance kept). Concept sketches and mock screenshots first;
    the owner chose "open it up more" on the first and approved the second (v2). Most double stacks become single
    full-height objects of new kinds (portable toilets, pallet racking, gabion barriers, wrapped pallet loads), a
    skip, sandbags, IBC tanks and generators join, four stacks drop to waist height where the sightline cost is
    lowest, and two crate stacks stay. Collision stays boxes; the layout tests still pass.
  - **Built (M25b, 2026-10-04):** eight new block kinds with code-built looks and two new surface textures (sandbag
    cloth, gabion mesh), 10 draw calls for the map (8 before, one per texture). Steel props bounce BBs (ricochets),
    sandbags and gabions soak them up. Against the M11 Depot: 1,928 more standing sightline pairs of 77,318 (none
    longer than 32.9 m), the layout and bot tests pass, and the west end wins 48% of bot-only Elimination rounds over
    64 seeds (45% before). v2 lowered two more stacks (the staging yard's east end and the dock), which tipped the
    west end to 54%; those two are full-height wrapped loads instead.
- **M26. Loadout, Armory and asset pool** (items 11, 12 and the Armory's Dev settings from 14).
  - **M26a. Asset pool.** Every replica and part is a single asset with a six-digit ID (`000001` Gas Pistol, `000002`
    AEG Rifle …) in `pool.md` at the repository's root: a hand-editable register the game reads at start, with a guide
    to the IDs, the tags that decide what fits what (Green Gas fits anything tagged `gas`, not just the pistol), power
    sources (batteries, gas types, springs as separate items), rarity tiers (Common to Legendary, with the owner's ten
    later tiers documented) and the Armory's numbers. Starters: AEG Rifle, Gas Pistol, Standard Battery, Green Gas.
    Unlockable: Red Laser, Vertical Grip, Red Dot, Red Gas, Black Gas, and the M17b parts (2× scope, angled grip,
    hi-cap, low-cap and extended magazines). BBs are not pooled. The player's collection (items owned, FC, Tokens) is
    saved in the browser (`src/pool/`).
  - **M26b. Loadout screen** in the style of Destiny 2's character screen, with no player model: a column of three
    square slots (Primary, Secondary, Grenades). Clicking a slot lists the owned replicas for it (any replica in either
    slot); right-clicking an equipped replica opens its Customise screen: optics, BB weight (a free slider, never
    pooled), hop-up, grip, laser, magazine and power source (only those that fit it), skins later. Grenades shows empty
    until grenades arrive (v0.3).
  - **M26c. Armory (beta)**, next to the Loadout: Field Credits (FC) earned by every match (less for a loss), exchanged
    for Tokens at 0.00625 Tokens per FC (160 FC a Token), one Token a Shot or ten for a ten-Shot, three random assets
    per Shot, spare copies scrapped for FC. Marked beta, completely free, can be switched off.
  - **M26d. Dev settings** (on M24's hidden Dev panel): switch all gacha off (greys out the Armory), unlock all gear.

- **M29. Weapon performance data, barrels and silencers** (owner, 2026-10-04: "each weapon and loadout has its own
  performance data … energy, BB weights, fire rate … scale with higher tier versions"; then barrels and silencers;
  plan with 14 questions answered the same day: defaults, except opponents' loadouts on Hard).
  - **M29a. Stats.** `stats.md` beside `pool.md`: the AEG Rifle's and Gas Pistol's numbers (energy, factory BB,
    rate of fire, magazines, reload, draw, spread, recoil), each power source's energy, rate of fire and recoil, the
    optics', grips', lasers' and magazines' numbers, the Tier scaling and the site limits. A tier adds energy and rate
    of fire at half its Bonus; batteries set the rate of fire (an 11.1 V LiPo Battery, 000015); Red and Black Gas kick
    harder; rifles stop at 1.20 J, pistols at 1.00 J. The Customise screen's Performance sheet, the gear slots' stat
    line and the Armory's "what this tier adds".
  - **M29b. Barrels, silencers and opponents' loadouts.** Barrel and Muzzle rows: a Tight-Bore Barrel (tighter, a
    little stronger) and a Long Barrel (stronger, slower to handle) for the AEG; one Silencer for both (bots hear the
    shot from half as far, muffled sound, a smaller minimap range; a little less energy, a slower draw). On Hard (and
    the Esports difficulty when it comes) each opponent rolls random parts that fit, at Armory odds, seeded by the
    match. Later: pistol barrels, more barrel lengths, a tracer unit on the muzzle (v0.3).

- **M33. Woodland, a second field at night** (owner, 2026-10-04: "much more open and larger than Depot … set at night
  time"; from five concepts he picked the woodland, night only, no prone yet). Pulled forward from v0.2 (Woodland) and
  v0.4 (night); the reason is in DECISIONS.
  - **The field:** large, wide and open with sparse cover (trees, bushes, rocks and boulders), mostly flat. A gentle
    slope runs end to end, so one team starts downhill and the other uphill, and the ends swap at half-time; one end is
    much higher (a hill), where Attack / Defend's flag stands. Concept sketches in the project's shared files
    (`concepts/woodland-night-plan-v1.png`, `woodland-night-mood-v1.png`); the owner approved them with the defaults
    (120 × 80 m, bushes hide you but BBs pass through, 4v4 on Woodland with up to 5v5). Until he calls the map
    complete it stays out of reach: greyed out as Coming soon, playable only with Dev settings › Access maps in
    development.
  - **Night:** the field is played at night only. Light comes from the moon, camp fires and lanterns; how far players
    and bots see depends on the light where you stand.
  - **Torch:** a weapon light, free for every player from the start (a starter in `pool.md`, so existing saves get it
    too), switched on and off with a key.
  - **Glowing BBs:** a Loadout option on any field, on by default on night fields.
  - **M33a. Coming soon:** Woodland shows in the Map pop-up under Depot, greyed out with a Coming soon tag, and can't
    be picked until it is playable.
  - **M33b. Glowing BBs:** each replica's Customise screen has a Glowing BBs row (At Night, the default; Always; Off).
    A glowing BB is green, a little larger far away and leaves a longer streak; its flight is unchanged. Bots load
    them on night fields.

- **M34. Neon Heights, a third field** (owner, 2026-10-04: "a vibrant futuristic cyberpunk city … highly vertical
  with multiple floors"; concept v1 approved with all twelve defaults). Pulled forward from v0.4 (more fields, day and
  night); the reason is in DECISIONS. Concept sketches in the project's shared files (`concepts/neon-heights-plans-v1.png`,
  `neon-heights-side-mood-v1.png`, notes in `research/neon-heights-concept-v1.md`).
  - **The field:** 46 × 30 m, split by a street (Neon Avenue). Three playable floors (street, +3 m, +6 m) linked by
    stairs only; a Sky Bridge at +6 m over the street; roofs not playable. Windows are open frames with a 1.2 m sill
    (see and shoot through, not climbable); a 3 m drop from Level 1 balconies (bots use the stairs). 4v4 (Custom up
    to 5v5), Elimination and Attack / Defend with the flag on the Tower's atrium floor under two galleries.
  - **Day or Night:** a switch on the map's tile in the Map pop-up, remembered, Night the first time; built for any map.
    Night uses Woodland's night systems (M33f, M33g). Neon, interior light and the per-floor minimap are engine
    features any map can use (the owner's engine-level graphics rule).
  - **Access:** tagged dev (M35): shown only with the Dev switch on, until the owner calls it done.
  - **Build order, one pull request each:** M34b floors over floors for the bots (a layered nav grid and a test
    building); M34c the greybox city by Day; M34d the Day / Night switch; M34e night neon and interior light; M34f
    art and sound.

- **M36–M41. Esports difficulty, called "Pro" in the game** (owner, 2026-10-04: "high stakes and require skill … the
  player deliberately moves slowly and carefully peeks around corners … the game must still be fun"; he approved the
  plan in the project's shared files, `research/esports-difficulty-2026-10-04.md`). Starts after the final alpha pass.
  Tagged dev (the public / dev content tag) until the owner says it's done, so it shows only with the Dev settings on.
  The difficulty sets how good the bots are; a new Rules picker sets how the match is played.
  - **M36. The Pro level:** a fourth difficulty above Hard (opponents and teammates), its skill numbers, opponents'
    rolled kits with more parts than Hard, the Cyber Pistol rule as on Hard, ×2 Field Credits, its own records rows.
  - **M37. Held angles:** angles worked out per map from the navigation (doorways, wall corners, stair tops, bush
    edges and tree gaps); Pro bots hold and pre-aim them at head height. They react fast (about 0.2 s) only to someone
    appearing near where they already aim, and at Hard speed or slower to someone off to the side, so a wide swing
    loses and slicing a corner or a flank wins. A test fails if a bot ever aims at someone it hasn't seen or heard.
  - **M38. Clearing and team play:** Pro bots walk and slice corners near the enemy, trade a hit teammate, set
    crossfires, pre-aim spots someone has peeked from, share heard positions with teammates, push late in a round when
    behind on players, and reload behind cover. Same eyes and ears as the player.
  - **M39. Rules picker:** a Rules row beside Mode: *Skirmish* (today's rules, the default), *Tournament* (first to 7
    with half-time and win-by-two overtime, 2:00 rounds, an Elimination time-out won by the side with more players
    left, the minimap showing teammates only, ricochets count, a strict marshal, the Loadout locked for the match, your
    own Armory kit), *Pro CQB* (Tournament plus semi-auto only and realcap magazines) and *Custom* (any of those
    switches, factory kit for everyone among them). Named rulesets play on every difficulty and get their own records;
    on Pro they pay ×2, Custom pays like Hard and never counts. Built as the field rules presets' machinery (v0.3), so
    CQB, Speedsoft and Milsim slot in later. Each ruleset carries the public / dev tag.
  - **M40. Map balance:** bot-only Pro guards on every map (Attack / Defend attackers 40–60 %, each end 40–60 % of
    decided Elimination rounds, under 1 round in 10 on time). Depot stays as it is; if its Office lane pushes attackers
    under 40 %, a window or second door between two rooms. Woodland and the city are designed to the plan's
    requirements from the start (cover on every approach's last 15–20 m, several ways into every objective, a landing
    with a corner at every stair top).
  - **M41. What got you, tips and tuning:** after you're hit, a card shows where the shot came from, whether that bot
    was holding the angle, how long you were in view and whether you were moving (every difficulty; on by default on
    Pro). Briefing tips for Pro, a playtest per map, then public when the owner says.

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
- **Two small additions** (owner's feature picks, 2026-10-04):
  - **Saved loadouts:** several named loadouts (e.g. "CQB", "Long range") to switch between, picked from the Map
    pop-up as well as the Loadout screen.
  - **Briefing tips:** loading and round-start lines in the voice of a site safety briefing ("Goggles on in the
    field", "Call your hits loud").

## Release: v0.1

The first public release. The owner decides when the game is ready to be treated as a stable public product.

## After v0.1: later versions

Everything below is approved as a direction and deliberately not part of v0.1. The grouping into
versions is a proposal. The owner decides what goes into each version, and each one must be a
substantially bigger game (CLAUDE.md §7). Within a version, the work is again alpha (build), then beta
(balance, fixes, QoL, performance), then release.

**The owner's third feature picks (2026-10-04, from a researched list of 32; numbers as in that list) and where each
went.** The ones he said yes to "but maybe implement later" are placed in the version they need and marked so.

| # | Pick | Goes to |
|---|---|---|
| 1 | Prone, kept for a later map | v0.4, with a field built for it |
| 2 | Location callouts | v0.2 |
| 3 | Bot names, personalities and loadouts | v0.2 |
| 4 | Field rules presets, for a later update | v0.3 |
| 5 | Overshooting rule | v0.2 |
| 6 | Rubber-knife tag, maybe later | IDEAS |
| 7 | Slide into cover, maybe later beside prone | IDEAS |
| 12–15 | Survival, Rush, Intel grab, Free-for-all (yes, later) | v0.3, v0.4, v0.4, v0.2 |
| 17 | The chrono enforces the field's limit (yes, later) | v0.3, with the chrono |
| 18 | Saved loadouts | Beta (v0.1) |
| 22 | A speedsoft arena that changes (yes, later) | v0.4 |
| 24 | Rain and fog (yes, later) | v0.4 |
| 25 | More field ideas: hospital, trenches, quarry (yes, later) | v0.4 |
| 26 | Challenges and badges (yes, later) | v0.5 |
| 31 | Briefing tips | Beta (v0.1) |
| 8–11, 16, 19–21, 23, 27–30, 32 | Declined | Listed in IDEAS so they aren't proposed again |

### Proposed v0.2: More ways to play

- **Team Deathmatch** (an easy introduction): respawn TDM. Hit players walk back to their spawn and
  re-enter; the team with the most hits when time runs out (or the first to N) wins. Elimination stays
  as its own mode.
- **Capture the Flag:** grab the other team's flag and carry it home.
- **Domination:** capture and hold physical locations.
- **Bomb / Objective:** plant, defend and disable a prop device, as sites do with timer boxes.
- **A second field: Woodland**, built to the checklist, with wind for BBs and indoor/outdoor acoustics.
- **Bigger teams** (owner, 2026-10-03): an experiment with 4v4 or 5v5 Team Deathmatch instead of 3v3. It may need a
  reworked Depot or fields built for it.
- **Medic mode** (owner, 2026-10-03; was the parked "medic revive"): a hit player goes down and calls for a medic,
  who can bring them back before a bleed-out timer runs out (real events use 5–10 minutes; the game, seconds).
- **Location callouts** (owner, 2026-10-04): named areas on each field ("Dock", "Main Gate", "Back Lot") shown under
  the minimap and in the hit feed, and bot teammates telling you what they know: "Contact, Dock!", "Reloading", "Two
  left". Text first, a voice later. This is bots telling you; the team communication below is you telling bots.
- **Bot names, personalities and loadouts** (owner, 2026-10-04): bots get names and a play style (rusher, anchor,
  flanker, careful), like Counter-Strike's bot profiles, and carry real loadouts from the asset pool: the pistol,
  hi-caps that rattle, different BB weights. Today they're numbered, play alike and only use the AEG (KNOWN_ISSUES).
- **Overshooting rule** (owner, 2026-10-04): firing at a player who has already called hit gets a marshal's warning
  (a whistle and a line in the hit feed); a second one sits you out the next round. Bots never overshoot.
- **Free-for-all** (owner, 2026-10-04: yes, may come later): everyone for themselves, an FPS staple that works well
  with bots. Rare at real sites, so figures need their own colours or numbers in place of the two team colours.

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

- **Bigger loadouts**, free from the start. The Loadout itself (primary and secondary, BB weight, hop-up, optics,
  grips and magazines) is built in v0.1 (M17); this adds:
  - Weapon parts: receivers, handguards, stocks, more optics, muzzle devices, suppressors,
    lasers/lights and bipods, and the parts the new platforms need (shotgun shells, LMG box mags).
  - Gear: plate carriers, chest rigs, belts, helmets, comms, backpacks, gloves, eye protection, face
    protection and boots. Gear decides what you carry, e.g. how many magazines. Pouches allow extra gear (owner,
    2026-10-03), such as another magazine or a grenade.
- **Chrono before a match** (kept, owner, 2026-10-03): check your loadout's muzzle velocity (BB weight is picked on
  the Loadout screen from M17a).
  - **The chrono enforces the field's limit** (owner, 2026-10-04: yes, may come later): each field and replica class
    has a limit, as at real sites (UK fields use about 1.3 J for full-auto and 2.5 J for DMRs and bolt-action rifles;
    US fields about 350–400 fps), and a replica over it doesn't pass. This caps the Armory's Power % batteries and gas
    so upgrades can't snowball, and it is where the DMR's minimum engagement distance comes from.
- **Tracer BBs as a loadout option** (owner, 2026-10-03): a row on the Loadout screen beside BB weight. They glow
  brightest on night maps (Woodland, M33). Glowing BBs (M33b) came first: a plain glow on any field, no tracer unit.
- **Gas simulation** (owner, 2026-10-03): fast shooting means less power. Gas cools in the magazine as it is used, so
  rapid fire lowers a gas replica's muzzle velocity (shorter, droopier shots) until it recovers. For the gas pistol and
  the GBB platforms above.
- **Grenades, smoke and flash bombs** (owner, 2026-10-03): airsoft-style throwables, such as a CO2 sound grenade (a
  bang, no shrapnel), smoke for cover and a flash bomb. How each one knocks players out or blinds them, how many you
  carry and how bots use them are designed when they come.
- The practice range moved up into v0.1 (M21).
- **Suppressors** with their own sound, built on the M9 groundwork.
- **Field rules presets** (owner, 2026-10-04: for a later update; the picker itself and the Tournament and Pro CQB
  rule sets come earlier, with M39): one picker beside Mode that sets a whole rule set
  the way real sites do: *Skirmish* (today's rules, the default), *CQB* (semi auto only, a bang rule), *Speedsoft*
  (semi only, no minimum distance, short rounds) and *Milsim* (realcap 30-BB magazines, a BB allowance per round, no
  hi-caps, a bleed-out instead of an instant out). Builds on M20's custom match settings; Milsim needs the pouches and
  the medic mode first, which is why it sits here.
- **Survival** (owner, 2026-10-04: yes, may come later): you and your teammates hold a building against waves of bots
  that grow each wave, as in Insurgency: Sandstorm's Survival. Needs bots that push, which they don't yet (KNOWN_ISSUES).

### Proposed v0.4: More fields

New fields from this list, each built to the checklist: CQB warehouse, urban streets, industrial site,
outdoor village, milsim-style compound, indoor arena, speedsoft arena and mixed terrain. Depot already
covers part of "CQB warehouse / industrial". Which fields, and in what order, is for the owner to pick.

- **Day and night** (owner, 2026-10-03): a Day / Night choice before a match, beside the Map choice. At night BBs glow
  (tracer BBs most of all) and lights stand out, such as weapon lights fitted as attachments. Pulled partly forward
  by M33: a map can be a night field (`MapData.night`), glowing BBs (M33b) and the weapon torch come with Woodland;
  the Day / Night choice for every map stays here.
- **Rain and fog** (owner, 2026-10-04: yes, may come later): picked like Day / Night. Rain masks footsteps and drops
  BBs a little sooner; fog shortens how far you can see.
- **More field ideas** (owner, 2026-10-04: yes, may come later): an abandoned hospital (multi-floor CQB), a trench line
  with forts, and a quarry (elevation), all common real airsoft sites.
- **A speedsoft arena that changes** (owner, 2026-10-04: yes, may come later): its bunkers are re-placed from a seed
  each match, as real speedsoft fields move their inflatables between events; every layout still passes the field
  checklist tests.
- **Prone** (owner, 2026-10-04: kept for a later map): lie down behind low cover or in long grass: slow to get up, a
  small target. Comes with a field built for it (Depot is CQB), and bots use it too. A slide into cover may come
  beside it (IDEAS).
- **Rush** (owner, 2026-10-04: yes, may come later): Attack / Defend in stages: attackers take point A, then the front
  moves to B, as Battlefield's mode, which real fields recreate with timer boxes. Needs a field bigger than Depot.
- **Intel grab** (owner, 2026-10-04: yes, may come later): find documents or a laptop and carry it to an extraction
  point, a milsim staple. Close to the parked hostage rescue; the two could share one mode. Suits the milsim compound.

### Proposed v0.5: Kit, looks and progression

- **Replica customisation and skins** (the owner's "eventually skins", 2026-10-03; on the Loadout screen's Skins
  row from M17b): colour, furniture, optic, handguard, stock, grip, magazine, muzzle device, tape and markings.
- **Kit customisation (outfit skins):** camouflage, plate carrier, pouches, helmet, goggles, gloves, patches and armbands.
- **Progression:** not level-based. You earn it by unlocking replicas and gear; how you earn unlocks is
  still open. Until this exists, everything is free from the start. (From M26, the Armory unlocks pool assets with
  Field Credits earned by playing.)
- **Challenges and badges** (owner, 2026-10-04: yes, may come later): tasks that pay Field Credits ("win a round in
  under 45 s", "3 hits with the pistol", "win on Hard") and a badge list kept in the browser, like Counter-Strike:
  Condition Zero's Tour of Duty tasks. A daily challenge could come from a date seed (offline, no online board).
- No real brand names or trademarked designs, ever (CLAUDE.md §4).

### When the bots are ready: team communication

An action wheel or menu, pings and hand signals, with bots that act on them. This is built only once
the bot AI is good enough to follow the calls. It can join whichever version that happens in. Three simple orders
(follow me, hold here, regroup) come first, in v0.1 (M22, owner, 2026-10-03), and an order wheel for them (M23, owner,
2026-10-04).

### Parked ideas

Not approved yet; see `docs/IDEAS.md`: VIP escort and hostage
rescue modes (owner, 2026-10-03), adjustable hop-up, dead rag and voiced hit calls, bang-bang surrender, a referee NPC,
a who-hit-you view (a simpler "what got you" card comes with M41), Depot variations, a rubber-knife tag and a slide into cover (owner, 2026-10-04).
