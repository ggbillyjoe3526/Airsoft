# Handoff

Where the last session left off, for whoever picks the work up next (a new session, another machine, or
the cloud). **Read this first, then CLAUDE.md, `docs/ROADMAP.md` and `git log`.** Rewrite it (don't
append) at the end of every session; keep it to about a screen. Status lives in the roadmap and decisions
in DECISIONS: this file is for the working context those don't hold.

_Last updated: 2026-10-04 · M22 (squad orders)._

## Where we are

- **Phase 4 merged on `main`:** M12a–c, M11, M15, M15b, M13 audio, M19 match info, M17a and M17b Loadout, M18a comfort
  and controls (re-scored 9.0), M18b accessibility (#29), and now **M22 squad orders** (see REVIEWS). The owner asked (2026-10-04) for every remaining
  Phase 4 milestone, then a full code audit (Fable), its fixes (Opus), a bug pass, and a note when Phase 4 is ready to
  playtest. For this run the owner chose "Claude merges": build threads merge their own pull request once CI is green
  and the critic has accepted it (never tag, never push to `main` directly).
- **Two build threads run side by side:** this one does M18b → M22 squad orders → **M14 art pass** (next); the other does
  M20 custom matches → M21 practice range → M16 tutorial. They conflict in docs and in `matchSession.ts`, `game.ts`,
  `settings/storage.ts`, `config/controls.ts`: merge `main` in before every push and keep both sides.

## M22 in short

- **Orders:** `ai/squadOrders.ts` (where each bot goes: follow spots behind the leader's heading, hold spots across
  their view, regroup), `BotController.giveOrder` / `orderOf`, mode `order` in `botBrain.chooseMode` (after fights and
  cover, before the pole and noises). Tuning in `config/squad.ts`. Keys `orderFollow` / `orderHold` / `orderRegroup`
  (Z, X, V), read once per frame by `PlayerInput.takeOrder` in `MatchSession.advance`. The controller's `given` map is
  the one record of the order in force (Regroup turns into Follow me there). HUD: `ui/squadOrderLine.ts`, `ui/holdMarker.ts`;
  sound: `radio.ack` in `config/sounds.ts`. Tests: `ai/squadOrders.test.ts` (open field) and the Depot follow guard.
- **Hearing:** `BotController.hear` casts `sim/soundPath.ts` rays beyond `wallHearing` × range (shared with the
  audio's muffling). Depot rounds run longer since; `playMatch` takes an `onTick` hook for guards like the follow one.

## M18b in short (what to know when touching it)

- **Team colours:** `config/teams.ts` `TEAM_COLOUR_SETS` (figures and HUD colours per set). The 3D side takes the set
  at Play (`MatchSetup.teamColours`); the HUD reads `teamCss(team)` = `var(--team-N)`, set on the container by
  `applyTeamCss` in `Game.play`. Never hard-code a team colour in the HUD. `config/colourVision.test.ts` simulates
  colour blindness over every set; `mapMeshes.test.ts` keeps props off every set's hues.
- **Sound cues:** `ui/soundCues.ts` (pure helpers `soundCueOf`, `cueAngle`, `cueOpacity` are unit-tested), fed by
  `MatchPresentation.afterTick`, placed each frame from the camera. Ranges follow `config/audio.ts`.
- **Browser basics:** `Game.stopPlay()` is "as if Esc": used by a hidden tab and a lost context. `Renderer.onContextChange`;
  `render/gpuCheck.ts` for the software-renderer warning (SwiftShader shows it, the smoke test asserts it).
  `ui/fullscreen.ts`; the key is the `fullscreen` action (F10).

## Working notes and gotchas

- **Checks:** `npm run check`. In a cloud container run the smoke test with a temporary copy of
  `playwright.config.ts` whose `launchOptions.executablePath` is `/opt/pw-browsers/chromium` (keep it out of git). The
  smoke test also loses and restores the WebGL context, adds a shot after each tick to get a sound cue (it patches
  `airsoft.session.match.afterTick`, `e2e` build only) and presses Z twice for the squad line.
- **Input:** read fire and aim through the bindings, never the mouse. A toggled sprint pressed before forward waits for
  forward. **Loadout:** read `Armament.handling`. **Menus:** one screen at a time (`Menus.go`); `Menus.setBlocked`
  makes them inert (graphics reset).
- **Ending a match quickly in a scratch script:** set `airsoft.state.round.score` to 4–4 and one team's characters'
  `status` to `'out'`.
- **Git:** a new branch from the latest `main`, push, open a pull request. Install with npm 11 (`npx -y npm@11 install`)
  so the lockfile keeps its `libc` fields.
