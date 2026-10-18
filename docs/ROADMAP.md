# Roadmap

The plan and the build status: what is being built now, in what order, and what comes in later versions. The owner and
every session read it. The process rules (versioning, branches, pull requests, the release checklist, the bug pass) are
in `docs/PROCESS.md`.

## Where we are

- **Building 0.1 Beta 1.** The game is out of Dev (owner, 2026-10-16), and he tags 0.1 Beta 1 when it is complete.
  0.1 Dev 6 was the last Dev build (its plan: `docs/archive/0.1-dev/ROADMAP.md`). Beta adds no features (owner,
  2026-10-06): fixes, balance and polish from the owner's playtests only. The small additions in his Dev 6 playtest
  list are the exception, on his word.
- **Last tag:** `0.1-dev.6`, on 2026-10-16. The owner creates tags.
- **Next:** the 0.1 Beta 1 tag, the last build of this repository. After it, development ceases here and continues in
  a new repository as an installable game built with Godot and Blender, restarting at 0.1 Dev 1 (owner, 2026-10-18).
  The plan below carries over to it; the handover pack is `docs/handover/README.md`.
- **The release path** (owner, 2026-10-12): 0.1 Dev 6, 0.1 Beta, then 0.1.0 opens Early Access to the public. Themed
  updates follow (Replica, Modes, Maps, Progression and any more), up to 1.0, the full launch. See
  [Early Access](#early-access-the-themed-updates).
- **Single player against bots.** There is no multiplayer, ever (owner, 2026-09-30, confirmed 2026-10-03).
- **How work moves.** Every task goes through the pipeline and the critic, and lands as a pull request into `main`.
  Each pull request says which parts of the playtest guide (`docs/PLAYTEST.md`) to play. The owner's playtest notes set
  the priorities. Move on only when the previous part is fun.

## Builds

| Build | Date | What it brought | Tag |
|---|---|---|---|
| 0.1 Dev 1 | 2026-09-30 | The playable single-player slice: Depot, the AEG and the pistol, bots, 3v3 rounds | `0.1-dev.1` |
| 0.1 Dev 2 | 2026-10-01 | Elimination and Attack / Defend on Depot, with sound, difficulty levels and smarter bots | `0.1-dev.2` |
| 0.1 Dev 3 | 2026-10-03 | Leaning, magazines and reloads, BB physics, movement and positioning, ramps and raised floors | `0.1-dev.3` |
| 0.1 Dev 4 | 2026-10-06 | Loadout, Customise and Armory, new menus, fire modes and aiming down sights, real BB flight, a rebuilt Depot and a new look, new sounds; Woodland, Neon Heights, Extraction and Pro in development | `0.1-dev.4` (commit `63e6500`) |
| 0.1 Dev 5 | 2026-10-13 | New menus and HUD, a play link in the browser, iron sights and Inspect, the GBB Pistol, new players and hands, Ultra and WebGPU, a dressed Depot, faster loading; Blender models in testing behind the Dev switches | `0.1-dev.5` (commit `6bbb680`) |
| 0.1 Dev 6 | 2026-10-16 | Levels and XP in place of the gacha, practice with moving targets and a timed challenge on any map, saved loadouts, holstering, vaulting and resting on cover, named bots with personalities, gear and callouts, pings, asking for a magazine, bushes that stop BBs, noisy props, the overtime flag, new human and robot figures; the full Dev 6 bug pass | `0.1-dev.6` (commit `c810dd3`) |

Only full releases are tagged (owner, 2026-10-01): playtests in between are plain commits. Two checkpoint tags,
`v0.1-alpha.2a` (commit `d8c4568`) and `v0.1-alpha.2b` (commit `08b37e3`), were removed after `0.1-dev.2`. The
versioning policy (what Dev and Beta mean, tag names, branches) is in `docs/PROCESS.md › Versioning`.

## What 0.1 is

The owner's definition (2026-10-01): 0.1 focuses on core gameplay and foundations. Later content builds on those
foundations. The owner has since pulled more into 0.1: see the Dev 5 plan and 0.1 Dev 6
(`docs/archive/0.1-dev/ROADMAP.md`), and the feature triage below. 0.1.0 opens Early Access (owner, 2026-10-12): feature complete, but light on content.

- **Replicas:** the AEG Rifle and the GBB Pistol (the starting kit), and the Cyber Pistol at level 10. More
  platforms come with the Replica Update.
- **Loadout** (owner, 2026-10-03): a primary and a secondary replica, BB weight, hop-up and a first set of attachments
  (optics, grips, magazines), picked before a match. Gear and more parts come with later versions.
- **Match info and options** (owner, 2026-10-03): a hit feed, teammate markers, an end-of-match summary, crosshair
  options, custom match settings (rounds, round time, team size, a ricochets setting) and a practice range.
- **Comfort, accessibility and squad orders** (owner, 2026-10-03, second batch): the basic comfort and accessibility
  settings, browser basics (pause on a hidden tab, fullscreen, graphics problems handled), and three orders for your
  bot teammates.
- **Modes:** the two that exist, Elimination and Attack / Defend.
- **Field:** Depot, reworked to the field checklist below.
- **Foundations:** magazines and reloads, a BB physics pass, and movement and positioning.

### Design rules

- **Movement and positioning matter more than raw weapon stats** (owner). Where you stand, how you move and when you
  peek should decide fights, not a better gun.
- **Replicas differ mechanically, not in damage.** One hit is one hit with every replica. Platforms differ in how they
  load, cycle, sound, handle and run out.
- **Fields are built from a checklist** (owner). Every field has cover, barricades, buildings, windows, doorways, choke
  points, flanking routes, objective locations, and dead zones / spawn areas. Layout rules are tested in code, as for
  Depot.
- **Unlocks never block fun.** Progression is levels (owner, 2026-10-13): matches give XP, and each level unlocks
  replicas and gear for good (`levels.md`), shown in the Armory. Completely free, never bought with money, and
  `Settings › Dev › Disable levelling` unlocks everything. The starting kit (AEG Rifle, GBB Pistol, Standard Battery,
  Green Gas) is a full loadout, and BBs are always free.

## Beta: finishing 0.1

Beta adds no features (owner, 2026-10-06). It began on 2026-10-16, when he called the game out of Dev, and is for bug
fixes, QoL, balance, refinement and polish; its task blocks are in `docs/TASKS.md`. The work collected here before it
began:

- **Optimisation.** Profile, then fix. The "can wait" performance items in `docs/KNOWN_ISSUES.md` land here. The
  targets (owner, 2026-10-16): Low holds 60 FPS on modern low-powered hardware, and maxed-out settings aim at a PC built
  for 4K at 240 Hz (his RTX 5090 desktop). The desktop is measured (PF3, 2026-10-17): Ultra at 4K runs 200 to 230 FPS,
  short of 240 Hz, and its line holds today's numbers. The laptop waits on PF2. From the audit: a lint / format tool if a second person joins
  (D-02); the smaller Rapier download (D-01) was done early, on the owner's word (IM3, 2026-10-12).
- **Balance.** Replicas, how many magazines each carries (4 × 60 AEG, 4 × 18 pistol today), bot difficulty levels, and
  Attack / Defend (about 1 bot round in 10 is won at the pole today; raise time, holds and retakes).
- **Final tuning** of values that are first guesses today: footstep ranges, hop-up arcs, difficulty numbers.
- **Bug fixing and stability.** One audit item waits for a playtest: reset the reload bar of a player who is hit
  (W-07), if playtesting shows it frozen.
- **UX/QoL, polish and accessibility.**
- **Removals** (feature triage, 2026-10-05): small tasks, no pool item ID changes.
  - **Supply weekends and dated events** (M49) come out: calendar pressure suits online games, not an offline one
    (done 2026-10-17; `docs/records/RV1.md`).
  - **The Tone mapping choice** leaves Graphics: the best-looking one becomes everyone's, and the switch moves to the
    Dev tab. Done (RV2, 2026-10-17).
- **Small additions, now placed elsewhere** (owner, 2026-10-06; they were the 2026-10-04 picks and the 2026-10-05
  triage's Beta list):
  - **Saved loadouts** (0.1 Dev 6): several named loadouts (such as "CQB" and "Long range") to switch between, picked
    from the Map pop-up as well as the Loadout screen.
  - **Briefing tips** (maybe): loading and round-start lines in the voice of a site safety briefing ("Goggles on in the
    field", "Call your hits loud").
  - **Hit players light up at night** (no for now): a hit player switches on a light as they call the hit, as at real
    night games, so the walk-off reads in the dark and nobody shoots a player already out. Needed once Woodland is
    public.
  - **Bots' gear keeps up with yours** (0.1 Dev 6; audit POOL-24): done as kits per level from `bot-kits.md` (BG1,
    2026-10-13).

## Feature triage

The owner sorted every feature in the game and on this roadmap into Keep (in Beta), Defer (good, after Beta) and Cut
(more complexity than player value) on 2026-10-05, and confirmed it with his changes. The reasoning per item is in
`docs/DECISIONS.md`.

- **Public in 0.1** (after the owner's playtest, as before): Depot with Elimination, Attack / Defend and custom matches;
  Easy, Normal and Hard; Woodland with night play, the weapon torch, glowing BBs and 5v5 / 6v6 (M88, owner 2026-10-06); Pro.
- **Stays dev, public later:** Neon Heights (the Maps Update, with its new look), Extraction (the Modes Update, once
  reworked), the Tournament and Pro CQB rule sets (the Modes Update, folded into the field rule presets). The Retro
  pixel filter, once 0.5, went public in 0.1 Dev 5 (M96).
- **Cut:** supply weekends and events, the Tone mapping choice, tracer BBs as their own option (glowing BBs do it),
  Bomb, Intel grab, Free-for-all (battle royale is the owner's exception, 2026-10-06), the overshooting rule, gear that
  only changes looks as its own system (it joins kit looks), a separate progression plan (the levels are the
  progression), and the ideas listed under Declined in `docs/IDEAS.md`.

## 0.1.0: Early Access opens

The first public release (owner, 2026-10-12): the game is feature complete but light on content, and players get it as
Early Access. The owner decides when it is ready. Small fixes after it are 0.1.1, 0.1.2 and so on.

## Early Access: the themed updates

After 0.1.0 the game grows through themed updates, each a mini expansion (owner, 2026-10-12):

| Update | What it adds |
|---|---|
| 0.2 · Replica Update | New replicas, attachments and items |
| 0.3 · Modes Update | New modes and ways to play |
| 0.4 · Maps Update | New maps and map conditions |
| 0.5 · Progression Update | Challenges, badges and things to earn |
| More updates | Any theme the owner wants |

- **The owner picks the order.** Version numbers always go up, so whichever update ships next takes the next number:
  if the Maps Update comes first, it is 0.2 (2026-10-12). The numbers above are the planned order.
- **Each update is built like 0.1:** Dev builds, then Beta builds (balance, fixes, QoL, performance), then the release
  (0.2 Dev 1, 0.2 Beta 1, 0.2.0).
- **Early Access is feature complete but light on content.** The updates mostly add content, and a new feature can
  still come in any update (owner, 2026-10-12).
- **Every later feature has a place** (feature triage, owner, 2026-10-05): none is dropped by being left unplaced.
  "From 0.1 Dev 6" marks the content moved out of Dev 6 on 2026-10-12.
- **No real brand names or trademarked designs, ever** (CLAUDE.md §4).

### 0.2 · Replica Update: replicas, attachments and items

- **The spring sniper rifle, the next replica** (from 0.1 Dev 6). One shot per bolt cycle, high velocity, long reach
  and a loud crack. Before building it, ask the owner how he wants it built and its specs (owner, 2026-10-06).
- **A 2–4x variable scope and a holographic sight** (from 0.1 Dev 6; Dev 4 note 5). The mouse wheel zooms while
  aiming.
- **Grenades, smoke and flash** (from 0.1 Dev 6). Airsoft-style throwables for the Loadout's Grenades slot: a CO2
  sound grenade (a bang, no shrapnel), smoke for cover and a flash bomb, used by bots too. How each one knocks players
  out or blinds them, and how many you carry, are designed when they come.
- **Chest rigs, belts and pouches** (from 0.1 Dev 6). They decide what you carry, such as another magazine or a grenade
  (owner, 2026-10-03). The Milsim rules need them.
- **An inventory** (from 0.1 Dev 6; Dev 4 note 22). Owned items in the menus, carried items on I in a match. The
  Extraction rework uses it for its carry limit, so it moves with Extraction if the Modes Update comes first.
- **Gas cooling** (from 0.1 Dev 6). Gas cools in the magazine as it is used, so rapid fire lowers a gas replica's
  muzzle velocity (shorter, droopier shots) until it recovers (owner, 2026-10-03).
- **The chrono and field limits** (from 0.1 Dev 6). Check your loadout's muzzle velocity before a match; each field and
  replica class has a limit, as at real sites, and a replica over it doesn't pass. Today's per-class limits (1.20 J
  rifles, 1.00 J pistols) already cap what parts add; the sniper and the DMR bring higher ones, and the DMR's
  minimum engagement distance comes from here.
- **A suppressor sound of its own** (from 0.1 Dev 6). The Silencer already makes shots duller and about half as loud;
  this gives suppressed replicas their own sound.
- **More parts:** receivers, handguards, stocks, more optics, muzzle devices, lasers, lights and bipods, pistol barrels
  and more barrel lengths, and the parts the new types need. Free, through the pool and new levels in `levels.md`.
- **More replica types after the sniper** (the table below). Too many for one update, so a second Replica Update can
  take the rest. Each type feels mechanically different, not like a damage model, and sounds like its power source
  (electric, gas, spring), using the sound profiles from M13.

| Platform | What sets it apart | When |
|---|---|---|
| AEGs | Electric full-auto with a motor whirr; mid- or hi-cap mags | In the game |
| GBB pistols | Blowback slide; the slide locks back on empty; gas mags (the gas pistol became the GBB Pistol, RM7) | In the game |
| Spring sniper rifles | One shot per bolt cycle; high velocity and long reach; a loud crack | Replica Update, next |
| DMRs | Semi-auto only; high velocity; a minimum engagement distance, as at real sites | Maybe |
| SMGs | Compact and quick to handle; high rate; short range | Maybe, after the sniper |
| Shotguns | Several BBs per shell; pump every shot; shells loaded one by one | Maybe, after the sniper |
| GBBRs | Gas blowback kick; the bolt locks back on empty; small gas mags that run out fast | Later |
| LMGs | Huge box mags; slow to move and aim; covering fire; a bipod | Later |

### 0.3 · Modes Update: new modes and ways to play

- **Extraction goes public, with its rework** (from 0.1 Dev 6; Dev 4 notes 20, 22 and 23). Built (M43–M49) and kept
  dev until it is balanced. The rework: solo against more and more aggressive bots that hunt, guard and converge on the
  extraction, quicker and closer waves, a longer extract timer, no respawn, loot that looks like loot (crates and chests
  with a glow) and a small carry limit through the inventory.
- **Medic** (from 0.1 Dev 6). A hit player goes down and calls for a medic, who brings them back before a bleed-out
  timer runs out (real events use 5–10 minutes; the game, seconds). It brings the duo and trio revive to Extraction.
- **Field rule presets and house rules** (from 0.1 Dev 6). One picker beside Mode sets a whole rule set the way real
  sites do: Skirmish (today's rules, the default), CQB (semi auto only, a bang rule), Speedsoft (semi only, no minimum
  distance, short rounds) and Milsim (realcap 30-BB magazines, a BB allowance per round, no hi-caps, a bleed-out
  instead of an instant out; it needs medic and the pouches). The Tournament and Pro CQB sets (M39) fold in. House
  rules such as pistols only or one magazine a round. Builds on M20's custom match settings.
- **Battle royale,** an experimental dev mode first (Dev 4 note 21; the exception to the Free-for-all cut). Pick a map
  and a spawn point, a shrinking zone, start with nothing and find gear, 10 players. The owner's answers are under the
  Dev 4 playtest table (`docs/archive/0.1-dev/ROADMAP.md`).
- **Survival:** you and your teammates hold a building against waves of bots that grow each wave. Needs bots that push,
  which they don't yet (`docs/KNOWN_ISSUES.md`).
- **Rush:** Attack / Defend in stages: attackers take point A, then the front moves to B. Needs a field bigger than
  Depot.
- **Team Deathmatch** (maybe). Hit players walk back to their spawn and re-enter; the team with the most hits when time
  runs out (or the first to N) wins. Elimination stays its own mode.
- **Domination** (maybe). Capture and hold physical locations.
- **Capture the Flag** (maybe). Each team grabs the other's flag and carries it home; a carrier who is hit drops it.
  Needs bots that carry, chase and return flags.

### 0.4 · Maps Update: new maps and map conditions

- **New fields** (maybe). Each is built to the field checklist: an abandoned hospital (multi-floor CQB), a trench line
  with forts and a quarry (elevation) first (owner, 2026-10-04); from the wider list, a CQB warehouse, urban streets, an
  industrial site, a village, a milsim-style compound, an indoor arena, a speedsoft arena and mixed terrain. Which, and
  in what order, is the owner's pick.
- **Neon Heights goes public** with its new look, once its open map findings are fixed (overlapping blocks, cases that
  open through walls, the east end winning first fights at night).
- **Neon Heights' doors and interiors** (owner, 2026-10-17, Beta 1 playtest; NH2 in `docs/TASKS.md`). Doors players
  and bots open and close, so an open door shows where someone went and a closed one may hide an enemy; furnished
  shops, offices, storage rooms, cafes and a hotel. Built with its upper floors (NH1).
- **Weather** (from 0.1 Dev 6). A general weather system, not only rain and fog, picked like Day / Night: rain masks
  footsteps and drops BBs a little sooner; fog shortens how far you can see.
- **Day and Night on every map** (maybe). The Day / Night switch (M34d) for every map, not only those built for both.
- **Prone,** with a field built for it: lie down behind low cover or in long grass, slow to get up, a small target.
  Bots use it too.
- **A speedsoft arena that changes** (maybe). Its bunkers are re-placed from a seed each match, as real speedsoft fields
  move their inflatables; every layout still passes the field checklist tests.
- **Depot layouts** (maybe). Alternative cover layouts for Depot.
- **Ground cover on terrain maps** (M33i plan): tufts of grass, ferns and leaf piles scattered from `MapData.ground`'s
  grid, as instanced cards on Medium and up. Needs a cheaper figure or a culled instance pass first.

### 0.5 · Progression Update: things to earn

- **Challenges and badges** (the owner's example for this update). Tasks that give XP ("win a round in under
  45 s", "3 hits with the pistol", "win on Hard") and a badge list kept in the browser, like Counter-Strike: Condition
  Zero's Tour of Duty. A daily challenge could come from a date seed (offline, no online board).
- **A higher level cap** (owner, 2026-10-13). New levels in `levels.md` as content arrives, with the new replicas,
  attachments and skins as their rewards.
- **Replica skins and kit looks** (from 0.1 Dev 6). Skins: colour, furniture, tape and markings, filling the Loadout's
  Skins row. Kit looks: camouflage, plate carrier, pouches, helmet, goggles, face protection, gloves, boots, backpacks,
  patches and armbands. Gear that only changes looks lives here, not as its own system (triage).
- Ideas that would fit here, not placed: clutch moments and match wagers (`docs/IDEAS.md`).

### Not tied to an update

These land in whichever update the owner likes:

- **A desktop download** (owner, 2026-10-05): the game in a desktop wrapper (Electron or Tauri, Steam), whenever he
  wants one.
- **Higher-detail models** (owner, 2026-10-05 and 2026-10-09). A Blender art pass over figures, replicas, attachments,
  props and set dressing, using the headroom WebGPU gives. It keeps art direction v3, the download target (about 30 MB
  to start), Low's 60 fps at 1080p on a laptop and the WebGL fallback. The Blender figures, replicas and attachments
  built in 0.1 Dev 5 are the default since 0.1 Beta 1 (BD1, owner 2026-10-16); the Dev switches are gone.
- **Hand signals and more team calls,** with bots that act on them. Three orders and their wheel are in (M22, M23);
  pings and asking for a magazine come in 0.1 Dev 6.

## 1.0: the full launch

When the owner considers the game complete: Early Access ends and the game is ready for everyone (owner, 2026-10-12).

## Parked ideas

Not approved yet; see `docs/IDEAS.md`. Ideas the feature triage cut are listed there under Declined.
