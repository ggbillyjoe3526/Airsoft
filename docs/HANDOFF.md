# Handoff

Where the last session left off, for whoever picks the work up next (a new session, another machine, or
the cloud). **Read this first, then CLAUDE.md, `docs/ROADMAP.md` and `git log`.** Rewrite it (don't
append) at the end of every session; keep it to about a screen. Status lives in the roadmap and decisions
in DECISIONS: this file is for the working context those don't hold.

_Last updated: 2026-10-04 · M21 (practice range)._

## Where we are

- **Phase 4 merged on `main`:** M12a–c, M11, M15, M15b, M13 audio, M19 match info, M17a and M17b Loadout, M18a and
  M18b, M20 custom matches and now **M21 practice range** (see REVIEWS). The owner asked (2026-10-04) for every remaining Phase 4
  milestone, then a full code audit (Fable), its fixes (Opus), a bug pass, and a note when Phase 4 is ready to
  playtest. For this run the owner chose "Claude merges": build threads merge their own pull request once CI is green
  and the critic has accepted it (never tag, never push to `main` directly).
- **Two build threads run side by side:** one does M22 squad orders → M14 art pass; the other has done M20 and M21
  and does **M16 tutorial** last (built on the range). They conflict in docs and in
  `matchSession.ts`, `game.ts`, `settings/storage.ts`, `config/controls.ts`, `sim/events.ts`: merge `main` in before
  every push and keep both sides.

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
  smoke test now also loses and restores the WebGL context and teleports an enemy close to get a sound cue
  (`window.airsoft.state`, `e2e` build only).
- **Input:** read fire and aim through the bindings, never the mouse. A toggled sprint pressed before forward waits for
  forward. **Loadout:** read `Armament.handling`. **Menus:** one screen at a time (`Menus.go`); `Menus.setBlocked`
  makes them inert (graphics reset).
- **Ending a match quickly in a scratch script:** set `airsoft.state.round.score` to 4–4 and one team's characters'
  `status` to `'out'`.
- **Git:** a new branch from the latest `main`, push, open a pull request. Install with npm 11 (`npx -y npm@11 install`)
  so the lockfile keeps its `libc` fields.
