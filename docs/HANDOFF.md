# Handoff

Where the last session left off, for whoever picks the work up next (a new session, another machine, or
the cloud). **Read this first, then CLAUDE.md, `docs/ROADMAP.md` and `git log`.** Rewrite it (don't
append) at the end of every session; keep it to about a screen. Status lives in the roadmap and decisions
in DECISIONS: this file is for the working context those don't hold.

_Last updated: 2026-10-04 · the second bug pass (BP1, #53) after the pipeline and the owner's batch; **main is ready for the owner's playtest**._

## Where we are

- **Next: the owner playtests `main`.** Phase 4 (M11–M22) and the owner's 2026-10-04 batch (M23 minimap and order wheel,
  M24 menus and Dev tab, M25 Depot props and CC0 loader, M26 Loadout, Armory and pool.md) are in, plus the build
  pipeline and its dry run (M27, M28). His notes go into the roadmap first, as before. **Merges:** "Claude merges" is the
  standing default (owner, 2026-10-04): a pipeline pull request is merged by its thread once CI is green and the critic
  accepted (CLAUDE.md §7).
- **The build pipeline** (owner's design): `pipeline/gate.mjs` runs build, tests, smoke, perf, scope and changelog
  gates (`pipeline/out/gate-report.json`; CI runs the same script); agents in `.claude/agents/`; the step list in
  `.claude/skills/pipeline/SKILL.md`; open tasks in `docs/TASKS.md`; one row per attempt in `docs/METRICS.md`. The
  container perf baseline was re-recorded on main in BP1 (the old one predated merges that raised GPU memory to
  16.38 MB). **The laptop baseline is still missing:** run `npm run perf -- --env laptop --baseline` on the owner's
  machine and commit `pipeline/baseline/laptop.json` before frame-time budgets gate anything. Dry-run report with token
  costs: the project's shared files, `pipeline/dry-run-report-2026-10-04.md`.
- **BP1, the second bug pass (#53):** played every mode in the browser (Elimination to the result screen, Attack and
  Defend, the tutorial, the range and its Loadout, the Armory with 10 Shots and scrapping, the Dev tab, Play Again,
  scoreboard at 200%) with no page errors, reviewed all code added since the first bug pass, and swept KNOWN_ISSUES.
  Fixed: stacked crates showed as low cover on the minimap (`coverHeight`), Dev help switched off before play still kept
  a match out of the records (`MatchSession.played`), the debug panel covered the minimap, pallet racks bounced BBs, the
  perf script didn't restart per match; and 11 KNOWN_ISSUES rows (hit-direction wedge fade, sprint on lean release, shot
  pitch past vertical, early semi/burst double-tap, seed on the pause screen, the start end on New game, double-click
  on Play, double-click on a key box, sounds held twice, the 200% scoreboard, dot-only crosshair). Decisions in
  DECISIONS (2026-10-04 · Bug pass (BP1)). What is left in KNOWN_ISSUES is design calls for the playtest ("playtest"),
  beta balance and tuning, or needs hardware or browsers this container doesn't have (Firefox, a real GPU).

## The regular bug pass (owner, 2026-10-04)

A full bug pass plus a KNOWN_ISSUES sweep is a **standing practice**, not a one-off: play every mode in the browser, review
the code added since the last pass, fix what can be fixed with a test for each, and leave the rest logged in
KNOWN_ISSUES with why. **Best time: after each batch of feature pull requests merges and before the owner's playtest**
(fresh features have had no browser play yet, and the playtest then starts on a clean build). The coordinator reminds
the owner at that point with one line in the project chat; it starts only when he says go (it costs usage). Run it as a
pipeline task (`BP<n>` in TASKS, `tier: core`, gates and the Opus critic). How it went last time: two parallel review
agents (UI and input; pool, Loadout, map) found 5 small bugs the browser didn't show; a scripted Playwright player
(`?nolock`, the e2e build served by `vite preview`) played the modes. Headless bot guards are seed-sensitive: a fix that
touches movement or materials can fail one seed; re-measure over 16 seeds before changing a threshold (DECISIONS).

## Where to look for each milestone

- **Audit fixes:** `audio/audioEngine.ts` (the page's one `AudioContext`, buses, buffers, reverb; each match's `Sfx`
  builds only its own graph), `config/render.ts` `startingQuality`, `HitVolume.torso` for a leaning torso, `Bot.skill`
  per bot. The match guards are seven `src/ai/depotMatch*.test.ts` files over `depotMatchSupport.ts`.
- **M14 art:** all procedural (the CC0 sites are blocked by the cloud network policy), under `src/render/`; quality
  presets in `config/render.ts` `QUALITY`, the six character looks in `config/characters.ts`.
- **M16 tutorial:** steps in `config/tutorial.ts`, `tutorial/tutorial.ts` `TutorialTracker` (reads, never writes),
  `ui/coachPanel.ts`; `Game` saves `tutorialDone`.
- **M20 custom matches:** `config/matchRules.ts`; match code reads `MatchSession.rounds` / `.hits`, never `ROUNDS` /
  `HITS`. Ricochets in `sim/ricochet.ts`. Team colours via `teamCss(team)`, never hard-coded.
- **M21 range:** `map/range.ts`, `rangeSession.ts`; targets are sim data (`sim/rangeTargets.ts`).
- **M24 menus and settings polish** (the owner's playtest notes 5–10, 13, 14): the version from git
  (`config/buildVersion.ts`, `vite.config.ts`, `.git_archival.txt`; no `BUILD_LABEL` to bump), Settings → HUD
  (`ui/hudSettings.ts`: scoreboard size as `--sb-scale`, hit feed Fade / Keep in `ui/hitFeed.ts`), sound cue size and
  colour (`--cue-scale`, `--cue-colour`; all three set by `Game.showHudLook`). **Dev settings:** `config/dev.ts` lists
  them (add one there, then read it in `Game.applyDev`); `Game.dev` holds what applies (the defaults while the box is
  unticked). `dev.disableArmory` and `dev.unlockAllGear` are read by the Armory and the Loadout (M26d).
- **M22 squad orders:** `ai/squadOrders.ts` (spots), `BotController.giveOrder`, mode `order` in `botBrain.chooseMode`;
  tuning in `config/squad.ts`; keys F (Z before M23), X, V.
- **M23 minimap and order wheel:** `config/minimap.ts`, `ui/minimap.ts` (canvas; the field drawn once per match from
  the map's blocks), `ui/minimapView.ts` (`toMinimap`, `HeardPlayers`, fed in `MatchPresentation.afterTick`);
  `input/orderWheel.ts` `WheelPointer` inside `PlayerInput` (`ordersEnabled`: on in a match, off on the range),
  `ui/orderWheel.ts`, `ORDER_WHEEL` in `config/squad.ts`. A default key that moves goes in `MOVED_DEFAULTS`
  (`config/controls.ts`) so old saved bindings follow.
- **M26 Loadout, Armory and asset pool (owner's 2026-10-04 batch):** `pool.md` at the root is the asset register the game
  reads (`src/pool/`). The Loadout is `pool/loadoutModel.ts` (what is equipped and fitted, saved) over `pool/kit.ts`
  (what the items make of a replica); each character carries its own `Armament.replicas` (bots `LOADOUT` as it comes).
  A new asset is a pool.md row; a new behaviour (a key) needs code in `config/` first. The Armory (M26c) is
  `pool/armory.ts` (rules) and `ui/menus/armoryScreen.ts`; the Dev tab's Disable Armory and Unlock all gear (M26d) are
  read in `Game` (`gameOwnership`, the Armory tile's summary, the match's pay); the owner chose "Claude merges" for this batch.

- **M30 BB flight model (fluid dynamics):** `sim/air.ts` (air density and viscosity, Morrison's sphere Cd by Reynolds
  number, a drag table by airspeed built once per config), `sim/ballistics.ts` `stepFlight` (drag and Magnus lift against
  the airflow, backspin decaying, one midpoint step a tick), `sim/wind.ts` (the match's breeze from its seed, into
  `GameState.wind` each tick; the dust motes ride it). **Tunables are in `config/ballistics.ts`, not pool.md or
  stats.md:** `air` (temperature, pressure), `spinPerHop` (hop to backspin), `spinFriction`, the lift fit, and `WIND`
  (strength range, gusts, veer). Retuning `spinPerHop` moves the tutorial's "about 39 m" (its test says so). M29 owns what
  leaves the muzzle (`muzzleVelocity`, `bbMass`); the flight model only reads them. Bots lead with `flightTimeEstimate`.
- **M29 weapon performance (owner's 2026-10-04 request):** `stats.md` at the root holds every replica's and part's
  numbers; `config/statsFile.ts` reads it, the config modules lay it over their built-in numbers (`withStats`,
  `overlay`). Tier shares and power stats are applied in `pool/kit.ts`; the Performance sheet is
  `ui/performanceSheet.ts`. A new number for a replica or part is a stats.md column plus a `Column` in statsFile.ts.
  The muzzle is the boundary with the BB physics pass (M30): `muzzleEnergy` / `muzzleVelocity` / `bbMass`.
  M29b adds barrels and the silencer (`BARRELS` / `MUZZLES`, a shot's reach via `shotHeardScale`, the muzzle mount in
  `render/replicaModels.ts`) and Hard opponents' rolled kits (`pool/botKit.ts`, `BOT_LOADOUTS`).

## Working notes and gotchas

- **Checks:** `npm run check` (about 75 s; the headless match guards run in parallel files). In a cloud container set
  `PLAYWRIGHT_CHROMIUM=/opt/pw-browsers/chromium` for the smoke test and the gate (no config copy needed). The
  smoke test also loses and restores the WebGL context, adds a shot after each tick to get a sound cue (it patches
  `airsoft.session.match.afterTick`, `e2e` build only) opens and closes the order wheel (Z), and presses F twice for the squad line.
- **Input:** read fire and aim through the bindings, never the mouse. A toggled sprint pressed before forward waits for
  forward. **Loadout:** read `Armament.handling` and `Armament.replicas`, never `LOADOUT` (that is what bots carry). **Menus:** one screen at a time (`Menus.go`); `Menus.setBlocked`
  makes them inert (graphics reset).
- **Ending a match quickly in a scratch script:** set `airsoft.state.round.score` to 4–4 and one team's characters'
  `status` to `'out'`.
- **Git:** a new branch from the latest `main`, push, open a pull request. Re-lock with npm 11 (`npx -y npm@11 install`)
  so the lockfile keeps its `libc` fields (otherwise Linux installs both the glibc and musl binaries); CI's npm 10
  installs either lockfile (audit L-13).
