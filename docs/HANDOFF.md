# Handoff

Where the last session left off, for whoever picks the work up next (a new session, another machine, or
the cloud). **Read this first, then CLAUDE.md, `docs/ROADMAP.md` and `git log`.** Rewrite it (don't
append) at the end of every session; keep it to about a screen. Status lives in the roadmap and decisions
in DECISIONS: this file is for the working context those don't hold.

_Last updated: 2026-10-04 · the Phase 4 audit fixes (three pull requests), before the bug pass._

## Where we are

- **Phase 4 is feature complete on `main`** (M11–M22, see REVIEWS). The owner asked (2026-10-04) for every remaining
  Phase 4 milestone, a full code audit (Fable), its fixes (Opus), then a full bug pass, and a note when Phase 4 is ready
  to playtest. **The audit fixes are merged; the bug pass is next.** For this run the owner chose "Claude merges":
  threads merge their own pull request once CI is green and the critic has accepted it (never tag, never push to `main`).
- **The audit** (`main` at 020f689, report in the project's shared files: `audits/phase4-audit-2026-10-04.md`) found
  0 critical, 0 high, 11 medium and 35 low. All were actioned in three pull requests except **L-07** (no LICENSE: the
  owner said on 2026-10-02 to leave it undeclared unless the repo is made public on purpose). The fixes' leftovers are
  in KNOWN_ISSUES (search "audit").

## Audit fixes in short (what changed under you)

- **Graphics:** `main.ts` picks the preset before the renderer exists (`config/render.ts` `startingQuality`): `?quality=`,
  else the saved pick (`loadSavedQuality`, null when none), else Low in a browser drawing in software (not saved).
  Surface textures belong to `Renderer.surfaceTextures` (drawn once per page). `session.contextRestored()` re-renders
  the replica sheen. Replica model parts are typed (`ReplicaModel`), no `userData`.
- **Audio:** `audio/audioEngine.ts` owns the page's one `AudioContext` (made suspended at start), the buses, all
  buffers and the reverb; sounds render a cue at a time in idle callbacks from the title. Each match's `Sfx` only builds
  its own graph and disconnects on dispose; `Game.dispose` closes the context. Nothing plays until `setPlaying(true)`.
- **Sim and bots:** `HitVolume.torso` (a segment capsule, radius 0 upright) covers a leaning torso; `stepBBs` builds
  the volumes once per tick. Bots carry their own skill (`Bot.skill`); `BotWorld.cfg` is shared behaviour only.
  Follow me / Hold here require a clear line from you to the spot (`SQUAD_ORDERS.followLineSnap`).
- **Menus and input:** `#app` carries `reduced-motion` or `full-motion` (CSS keys off them and the OS preference);
  Settings tabs are a full ARIA tab pattern (arrows, Home, End); New game reuses the built match when nothing changed.
- **Tests and CI:** the headless match guards are seven `src/ai/depotMatch*.test.ts` files over `depotMatchSupport.ts`,
  so `npm run test` takes about 70 s on 4 cores. `npm run check` is test + build (the build type-checks). On CI the
  chunk budgets fail the build. The smoke test's first boot has no `?quality=` (so it covers the software fallback),
  rebinds a key, and plays a short custom match to the result screen.

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
- **Per-team difficulty:** `BotController.update` swaps the bot's team's skill into the shared `w.cfg` (KNOWN_ISSUES).
  Teammates follow the opponents' level until one is saved (`hasSavedTeammateDifficulty`).
- **Ricochets:** `sim/ricochet.ts` with materials from `config/materials.ts`; a `characterHit` carries `ricochet`, and a
  ricochet that doesn't count is a `ricochetTick` event (knock, notice, never a hit). Small teams spawn mid-line
  (`sim/round.ts` `placeTeams`). The headless guards in `ai/depotMatch.test.ts` cover 1v1, 2v2 and ricochets counting.
- **M18b, briefly:** team colours via `teamCss(team)` (never hard-code one in the HUD), sound cues in `ui/soundCues.ts`,
  `Game.stopPlay()` is "as if Esc" for a hidden tab and a lost context.

## Working notes and gotchas

- **Checks:** `npm run check` (about 70 s; the headless match guards run in parallel files). In a cloud container run the smoke test with a temporary copy of
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
