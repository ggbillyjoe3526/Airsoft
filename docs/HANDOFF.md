# Handoff

Where the last session left off, for whoever picks the work up next (a new session, another machine, or
the cloud). **Read this first, then CLAUDE.md, `docs/ROADMAP.md` and `git log`.** Rewrite it (don't
append) at the end of every session; keep it to about a screen. Status lives in the roadmap and decisions
in DECISIONS: this file is for the working context those don't hold.

_Last updated: 2026-10-03 · branch `claude/feature-research-roadmap-ccty3q` (roadmap only: the owner's feature picks, M18–M20 and later versions)._

## Where we are

- **Phase 3 is done and tagged** (`v0.1-alpha.3`). On `main` since the tag (all merged 2026-10-03): M12a, M12b and
  M12c weapon handling, the pistol's slight left lean (#13) and the **M11 Depot rework** (#14).
- **M15 menus** (pulled forward by the owner ahead of M13, to his own design; concept sketch approved) is merged
  (#15, critic 9.1): title screen → New game (Mode and Difficulty pop-ups, Loadout and Settings
  screens), pause menu (Resume / Settings / Quit to title screen), result (Play Again / Change setup / Title screen),
  headings in capitals, unbuilt items greyed with LATER, render quality as a saved setting. Code in `src/ui/menus/`,
  placeholder data in `src/config/menus.ts`. Concept sketch: https://claude.ai/artifact/R6WwSeS2sXSAdqzzZBGSQt.

## Next (when the owner comes back)

1. **M15 is merged** (#15). The owner played the menus on `main` and sent five notes (2026-10-03); the roadmap has
   them as **M15b** (ROADMAP Phase 4): no map loaded until Play, a Map pop-up with Depot as the default, opaque
   menus, the controls list only under Settings, a Field of view slider (100° stays the default), Brightness
   removed, graphics quality greyed out as LATER. The Esport difficulty is parked in IDEAS.
2. **Build M15b next.** The hard part is loading the map only on Play and unloading it on Quit / Change setup:
   today the field is built at start-up and drawn behind the title screen. The owner's Depot feedback is still awaited.
3. **Then M17, the Loadout** (the owner asked for it as an alpha feature, 2026-10-03; ROADMAP Phase 4): M17a replica
   slots, BB weight and hop-up; M17b optics, grips and magazines, with skins as a LATER row (skins themselves in v0.5).
   The groundwork is in: BB mass in the physics (M9, `bbMass`), the optic slot (`config/optics.ts`), the hop-up dials
   and the LATER rows (`config/menus.ts`).
4. **Then M13, the audio rework** (order M12 → M11 → M15 → M15b → M17a → M17b → M13 → M18 → M19 → M20 → M14 → M16). `ReplicaConfig.power`
   (electric / gas) is there for sound profiles by power source. Volume settings then fill the Audio tab's LATER rows.
5. **Then the owner's feature picks** (2026-10-03, ROADMAP Phase 4 table): M18 match info (hit feed, teammate markers,
   end-of-match summary, crosshair options), M19 custom matches (rounds, round time, team size, friendly fire, BB
   ricochets with a "ricochets count" setting, off by default; BBs stop dead today, so the bounce is new), M20 a
   practice range. Later-version picks (medic mode, 4v4 / 5v5, tracers, gas simulation, grenades, pouches, day and
   night) are in ROADMAP "After v0.1".

## Working notes and gotchas

- **Menus:** one screen at a time (`Menus.go`); `menuNav.ts` decides Back and which menu opens when play stops.
  The loadout is only reachable through New game, so never mid-match; Quit to title screen ends the match
  (`Game.quitToTitle`). Text is set in capitals by CSS, so the code keeps normal case (and tests' accessible names
  use case-insensitive matches). `BUILD_LABEL` in `config/menus.ts` moves with each release tag (CLAUDE.md §7).
- **The barrel line:** BBs are drawn from the muzzle, blending onto the eye line. The rifle keeps hold yaw 0; the
  pistol leans 0.1 rad, and `tracerLine.test.ts` caps it.
- **Parallel pull requests conflict** in `docs/DECISIONS.md` and `docs/REVIEWS.md` (both append at the end). Merge
  `main` in and keep both sides, `main`'s lines first.
- **Measuring bots:** copy the top of `src/ai/depotMatch.test.ts` (up to the first `describe`) into a scratch test,
  add a test that writes JSON with `writeFileSync` (Vitest hides `console.log` here), run it with `-t`, then delete it.
- **Checks:** `npm run check` (type check, tests, build). `npm run check:all` adds the browser smoke test. In a cloud
  container with a preinstalled Chromium, run Playwright with a temporary copy of the config whose
  `launchOptions.executablePath` points at it (`/opt/pw-browsers/chromium`; don't commit it).
- **Browser:** `npm run dev`, open `/?nolock` (dev or `build:e2e` only); `window.airsoft` is the Game (private methods
  such as `pause()` are callable from a script for screenshots; set `unlockedPlay = false` first).
- **Git:** new branch from the latest `main`, push, open a pull request; the owner merges. Never push to `main`, merge a
  pull request, or create or move tags. Install with npm 11 (`npx -y npm@11 install`) so the lockfile keeps its `libc` fields.
