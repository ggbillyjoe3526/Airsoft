# Handoff

Where the last session left off, for whoever picks the work up next (a new session, another machine, or
the cloud). **Read this first, then CLAUDE.md, `docs/ROADMAP.md` and `git log`.** Rewrite it (don't
append) at the end of every session; keep it to about a screen. Status lives in the roadmap and decisions
in DECISIONS: this file is for the working context those don't hold.

_Last updated: 2026-10-04 · M14 (art pass), the last of Phase 4, after M16 (tutorial)._

## Where we are

- **Phase 4 merged on `main`:** M12a–c, M11, M15, M15b, M13 audio, M19 match info, M17a and M17b Loadout, M18a and
  M18b, M20 custom matches, M21 practice range, M22 squad orders, M16 tutorial and now **M14 art pass** (see REVIEWS):
  **Phase 4 is feature complete.** The owner asked (2026-10-04) for every remaining Phase 4 milestone, then a full
  code audit (Fable), its fixes (Opus), a bug pass, and a note when Phase 4 is ready to playtest; the audit is next.
  For this run the owner chose "Claude merges": threads merge their own pull request once CI is green and the critic
  has accepted it (never tag, never push to `main` directly).
- **Two build threads ran side by side** (M18b, M22, M14 in one; M20, M21, M16 in the other). They conflicted in docs
  and in `matchSession.ts`, `game.ts`, `settings/storage.ts`, `config/controls.ts`, `sim/events.ts`: whoever works in
  parallel next, merge `main` in before every push and keep both sides.

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

- **Checks:** `npm run check` (about 3 minutes: the headless match guards). In a cloud container run the smoke test with a temporary copy of
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
