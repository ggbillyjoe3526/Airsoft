# Handoff

Where the last session left off, for whoever picks the work up next (a new session, another machine, or
the cloud). **Read this first, then CLAUDE.md, `docs/ROADMAP.md` and `git log`.** Rewrite it (don't
append) at the end of every session; keep it to about a screen. Status lives in the roadmap and decisions
in DECISIONS: this file is for the working context those don't hold.

_Last updated: 2026-10-03 · M17a (Loadout: replica slots and BBs), on top of M15b, M13 and M19._

## Where we are

- **Phase 4 so far** (all merged): M12a–c weapon handling, M11 Depot rework, M15 menus, M15b (#18, its last critic
  round in #21), M13 audio (#19), M19 match info (#24) and the owner's feature picks in the roadmap (#20, #22). The
  owner asked (2026-10-03) for all remaining Phase 4 milestones to be built.
- **M17a is built** (critic 9.0): each slot has a Replica picker (`LOADOUT_SLOTS` in `config/replicas.ts`, one replica
  each for now); BB weight per replica (0.20 / 0.25 / 0.28 g, `BB_WEIGHT`), fired by the player's armament
  (`Armament.bbWeights`); the weight line and the hop-up line on the Loadout screen come from the flight model
  (`sim/hopUp.ts`: `hopUpReach`, `bestHopUp`, `flightTime`). The match is built with the picks (`MatchSetup.loadout`,
  `bbWeights`); bots keep factory setups.
- **M13 audio:** sounds are data recipes (`config/sounds.ts`) rendered by the pure `audio/dsp.ts`, once per page
  (`SoundLibrary`, owned by `Game` with the volume sliders as `SfxSetup`); `Sfx` keeps one HRTF channel per character,
  muffled by rays. A new replica only needs a `power`: its shot, dry-fire and magazine sounds follow from it.
- **M19 match info:** stats in `stats/matchStats.ts` (from tick events, in `MatchSession.afterTick`), tables from
  `ui/statsRows.ts` and `ui/statsTable.ts`, the board over the field `ui/matchBoard.ts`; hit feed `ui/hitFeed.ts`,
  teammate markers `ui/teammateMarkers.ts`; summary screen `ui/menus/summaryScreen.ts`; records `stats/records.ts`;
  crosshair `ui/crosshair.ts` with its own Settings tab.
- **Next: M17b** attachments (2× scope, grips, magazines, Skins LATER), then M18 comfort and accessibility, M20 custom
  matches, M21 practice range, M22 squad orders, M14 art, M16 tutorial (ROADMAP Phase 4 order).

## Working notes and gotchas

- **Settings tabs:** match info added its own Crosshair tab (`SETTINGS_TABS`), away from Controls, which M18 fills.
  The scoreboard is a rebindable action (`scoreboard`, Tab).
- **Lifecycle:** Play builds the session before asking for the mouse lock (audio unlock needs the click). A refused
  lock leaves it built but never drawn; Back to the title unloads it. Nothing is drawn while a menu is up.
  `PointerLock.request()` holds back `pointerlockerror` while a request is in flight (the retry without raw input can
  still lock); `pointerLock.test.ts` covers both event orders.
- **BB weight is a small trade-off on purpose** (DECISIONS): `hopUp.test.ts` holds it (lighter is quicker to 10 and
  20 m, heavier carries further at its best dial). A new weight or replica must keep that test passing.
- **Picks apply at Play only:** mode, difficulty and loadout are picked with no match loaded, so the old
  "starts next round" notes are gone.
- **Menus:** one screen at a time (`Menus.go`); `menuNav.ts` decides Back and which menu opens when play stops. Text
  is set in capitals by CSS, so the code keeps normal case. `BUILD_LABEL` in `config/menus.ts` moves with each tag.
- **Sound:** `npm test -- src/audio` checks every recipe renders (audible, no clipping, no end click), the profiles
  differ, a shot stays louder than steps, and `Sfx` against a fake Web Audio context. The Audio tab is
  `ui/audioSettings.ts`.
- **Parallel pull requests conflict** in `docs/DECISIONS.md`, `docs/REVIEWS.md`, `docs/KNOWN_ISSUES.md` (all append at
  the end), `docs/ROADMAP.md` and the menus. Merge `main` in and keep both sides, `main`'s lines first.
- **Checks:** `npm run check` (type check, tests, build). In a cloud container, run the smoke test with a temporary copy
  of `playwright.config.ts` whose `launchOptions.executablePath` is `/opt/pw-browsers/chromium` (don't commit it); use
  another port if two run at once. The `e2e` build and the dev server expose `window.airsoft` (the Game).
- **Ending a match quickly in a scratch browser script:** set `airsoft.state.round.score` to 4–4 and one team's
  characters' `status` to `'out'`; the summary screen follows a moment later.
- **Git:** new branch from the latest `main`, push, open a pull request; the owner merges. Never push to `main`, merge a
  pull request, or create or move tags. Install with npm 11 (`npx -y npm@11 install`) so the lockfile keeps its `libc` fields.
