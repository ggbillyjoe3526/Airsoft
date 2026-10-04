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
  failed every spot and sent the followers into you); `clearLine` already checks every step, and the spot's `y` is the
  floor there.

## Audit fixes in short

- **Graphics:** `config/render.ts` `startingQuality` (`?quality=`, the saved pick, else Low in software, not saved);
  surface textures are `Renderer.surfaceTextures`; `contextRestored()` re-renders the replica sheen.
- **Audio:** `audio/audioEngine.ts` owns the page's one `AudioContext`, the buses, the buffers and the reverb, rendered
  in idle time from the title; each match's `Sfx` builds only its own graph. Nothing plays until `setPlaying(true)`.
- **Sim and bots:** `HitVolume.torso` covers a leaning torso; bots carry their own skill (`Bot.skill`; `BotWorld.cfg` is
  shared behaviour only). Follow me / Hold here need a clear line from you to the spot.
- **Menus and tests:** `#app` carries `reduced-motion` / `full-motion`; Settings tabs are an ARIA tab pattern. The match
  guards are seven `src/ai/depotMatch*.test.ts` files over `depotMatchSupport.ts` (`npm run test` ~75 s on 4 cores).

## M14 in short

- **All procedural** (the CC0 sites are blocked by the cloud environment's network policy): `render/lighting.ts`
  (sun, sky dome, trees; `Daylight.setQuality`), `render/atmosphere.ts` (haze), `render/proceduralTextures.ts` and
  `render/mapMeshes.ts` (surfaces, relief per quality), `render/characterModels.ts` with the six looks in
  `config/characters.ts` (a torso team band, tested to read at range), `render/replicaModels.ts`, `render/impactPuffs.ts`
  (gas puffs, dust by material), `render/dustMotes.ts` (hidden with reduced motion). Quality presets in
  `config/render.ts` `QUALITY`; `MatchSession` and `RangeSession` both have `setQuality`.

## M16 in short

- **Tutorial:** steps as data in `config/tutorial.ts`; `tutorial/tutorial.ts` `TutorialTracker` reads the player and
  each tick's events (never writes); `goalIndex` is the step being checked, `stepIndex` the one shown (a finished step's
  tick shows while the next is already checked). `ui/coachPanel.ts` draws it (with the last-BB line on hit steps).
  `RangeSession` takes `tutorialFrom`; `Game` rebuilds at `tutorialStep` after a loadout change and saves `tutorialDone`.

## M22 in short

- **Orders:** `ai/squadOrders.ts` (where each bot goes: follow spots behind the leader's heading, hold spots across
  their view, regroup), `BotController.giveOrder` / `orderOf`, mode `order` in `botBrain.chooseMode` (after fights and
  cover, before the pole and noises). Tuning in `config/squad.ts`. Keys `orderFollow` / `orderHold` / `orderRegroup`
  (Z, X, V), read once per frame by `PlayerInput.takeOrder` in `MatchSession.advance`. The controller's `given` map is
  the one record of the order in force (Regroup turns into Follow me there). HUD: `ui/squadOrderLine.ts`, `ui/holdMarker.ts`;
  sound: `radio.ack` in `config/sounds.ts`. Tests: `ai/squadOrders.test.ts` (open field) and the Depot follow guard.
- **Hearing:** `BotController.hear` casts `sim/soundPath.ts` rays beyond `wallHearing` × range (shared with the
  audio's muffling). Depot rounds run longer since; `playMatch` takes an `onTick` hook for guards like the follow one.

## M21 in short (what to know when touching it)

- **Range:** `map/range.ts` from `config/range.ts`; `Game` holds a `MatchSession` or a `RangeSession`
  (`rangeSession.ts`). `SimServices.practice` skips the round flow and keeps spares full. Targets are sim data
  (`GameState.targets`, `sim/rangeTargets.ts`) tested in `stepBBs` (`targetHit`; a plate's post stops a BB as a
  `bbImpact`). Every BB that falls out or times out now emits `bbLost` (matches ignore it; the readout uses it).
- **Loadout from the range:** the pause menu's Loadout; `Game.play` rebuilds the range at `RangeSession.pose`
  (position, yaw, pitch) when `loadoutChanged`. Sound cues are match-only; team colours apply on the range too.

## M20 in short (what to know when touching it)

- **Rules:** `config/matchRules.ts` (`MatchRules`, saved as one setting; `roundRulesFor`, `hitRulesFor` turn them into
  the match's own round and hit rules, so read `MatchSession.rounds` / `.hits`, never `ROUNDS` / `HITS`, in match code).
  `countsForRecords` decides whether a match goes into the records; `standardMatchText()` is the one wording of it.
- **Per-team difficulty:** each bot carries its team's skill (`Bot.skill`, since the audit fixes). Teammates follow the
  opponents' level until one is saved (`hasSavedTeammateDifficulty`).
- **Ricochets:** `sim/ricochet.ts` with materials from `config/materials.ts`; a `characterHit` carries `ricochet`, and a
  ricochet that doesn't count is a `ricochetTick` event (knock, notice, never a hit). Small teams spawn mid-line
  (`sim/round.ts` `placeTeams`). The headless guards in `ai/depotMatch.test.ts` cover 1v1, 2v2 and ricochets counting.
- **M18b, briefly:** team colours via `teamCss(team)` (never hard-code one in the HUD), sound cues in `ui/soundCues.ts`,
  `Game.stopPlay()` is "as if Esc" for a hidden tab and a lost context.

## Working notes and gotchas

- **Checks:** `npm run check` (about 75 s; the headless match guards run in parallel files). In a cloud container run the smoke test with a temporary copy of
  `playwright.config.ts` whose `launchOptions.executablePath` is `/opt/pw-browsers/chromium` (keep it out of git). The
  smoke test also loses and restores the WebGL context, adds a shot after each tick to get a sound cue (it patches
  `airsoft.session.match.afterTick`, `e2e` build only) and presses Z twice for the squad line.
- **Input:** read fire and aim through the bindings, never the mouse. A toggled sprint pressed before forward waits for
  forward. **Loadout:** read `Armament.handling`. **Menus:** one screen at a time (`Menus.go`); `Menus.setBlocked`
  makes them inert (graphics reset).
- **Ending a match quickly in a scratch script:** set `airsoft.state.round.score` to 4–4 and one team's characters'
  `status` to `'out'`.
- **Git:** a new branch from the latest `main`, push, open a pull request. Re-lock with npm 11 (`npx -y npm@11 install`)
  so the lockfile keeps its `libc` fields (otherwise Linux installs both the glibc and musl binaries); CI's npm 10
  installs either lockfile (audit L-13).
