# Handoff

Where the last session left off, for whoever picks the work up next (a new session, another machine, or
the cloud). **Read this first, then CLAUDE.md, `docs/ROADMAP.md` and `git log`.** Rewrite it (don't
append) at the end of every session; keep it to about a screen. Status lives in the roadmap and decisions
in DECISIONS: this file is for the working context those don't hold.

_Last updated: 2026-10-04 · the Phase 4 bug pass (two pull requests), the last step before the owner's playtest._

## Where we are

- **Phase 4 is feature complete on `main`** (M11–M22, see REVIEWS), audited (Fable, report in the project's shared files:
  `audits/phase4-audit-2026-10-04.md`), the audit fixed (#34–#36, all but L-07: no LICENSE, owner 2026-10-02), and
  bug-passed (#37 and the bots-and-docs pull request after it). **Next: the owner playtests Phase 4.** His notes go into
  the roadmap first (a draft pull request), as before; until then nothing is planned. For the 2026-10-04 run the owner
  chose "Claude merges" (threads merged their own pull requests once CI was green and the critic accepted); that was for
  that run only, so from here on the owner merges again unless he says otherwise (CLAUDE.md §7).
- **The bug pass** played every mode in the browser (Elimination, Attack and Defend and a 1v1 custom match to the
  result screen, the range, all ten tutorial steps, settings across a reload) and reviewed all code by area. What it
  fixed is in DECISIONS (2026-10-04 · Bug pass) and REVIEWS; what it left is in KNOWN_ISSUES (search "bug pass").
  Nothing it found in rounds, scoring, ballistics, records, leaks or navigation needed a change.

## The owner's 2026-10-04 batch: M25 (Depot rework and CC0 assets)

- **M25a (CC0 assets):** guide in `docs/CC0_ASSETS.md`; `src/render/externalModels.ts` loads an optional
  `src/assets/models/characters/figure.glb` (settings in `config/assets.ts`) and `buildFigure` takes its parts. The
  asset sites are blocked by the cloud network policy: the owner commits models, or allows the hosts. Next steps when
  wanted: glTF animations for rigged models, props and surface textures from files.
- **M25b (Depot rework, minor):** the owner approved concept v2 (sketches in the project's shared files,
  `concepts/depot-rework-*-v2.*`). New prop kinds in `map/mapTypes.ts` and `render/mapMeshes.ts`; layout in `map/depot.ts`.

## Bug pass in short (what changed under you)

- **Seeds:** each match played in a visit has its own seed (`Game.matchSeed`: the visit's seed + matches played before
  it; a match built but never played doesn't count). `?seed=N` replays the first match played; the overlay shows the one
  in play (the range keeps the visit's).
- **Play Again** rebuilds the match when New game's choices or the team colours changed since it was built
  (`Game.play`); otherwise it restarts it as before. `Game.resume` refuses play while the graphics context is lost.
- **Armament:** `Armament.reloadQueued` keeps a reload pressed during a draw; `respawnCharacter` carries
  `triggerWasDown` over, so a held trigger needs a new pull at the whistle.
- **Sound:** `Sfx` counts simulation time in `afterTick`; the AEG motor's spin-up and wind-down follow it (the wind-down
  plays from `afterTick`, never scheduled ahead). A match's sound reaches the engine's buses through two outlets
  (effects, interface) muted while paused, so a slider preview can't let it through.
- **Menus and HUD:** `.menu-footer` is sticky (Back and Play always on screen; `--page-bottom` is the page's bottom
  padding); the hit feed is capped at `50% - 250px` and wraps, and below 1400 px the round banner keeps to the middle;
  `Menus.setBlocked(true)` closes the pop-ups; sliders carry `aria-valuetext`.
- **Squad orders:** follow and hold spots no longer compare heights with the leader (a ramp, or the leader in the air,
  failed every spot and sent the followers into you); `clearLine` checks every step, and the spot's `y` is the floor
  there. At a platform's lip, where the nearest walkable cell can be on the ground below, `followSpot` stays on you.

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

## Working notes and gotchas

- **Checks:** `npm run check` (about 75 s; the headless match guards run in parallel files). In a cloud container run the smoke test with a temporary copy of
  `playwright.config.ts` whose `launchOptions.executablePath` is `/opt/pw-browsers/chromium` (keep it out of git). The
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
