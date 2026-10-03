# Handoff

Where the last session left off, for whoever picks the work up next (a new session, another machine, or
the cloud). **Read this first, then CLAUDE.md, `docs/ROADMAP.md` and `git log`.** Rewrite it (don't
append) at the end of every session; keep it to about a screen. Status lives in the roadmap and decisions
in DECISIONS: this file is for the working context those don't hold.

_Last updated: 2026-10-03 · branch `claude/m15b-menu-fixes-adsroh` (the end of M15b: critic round 3)._

## Where we are

- **Phase 4 so far** (all merged): M12a–c weapon handling, M11 Depot rework, M15 menus, **M15b** (#18) and the
  owner's feature picks as M18–M20 in the roadmap (#20). The owner asked (2026-10-03) for all remaining Phase 4
  milestones to be built: M15b → M17a → M17b in one thread, M13 audio in a parallel one.
- **M15b** (critic 9.0): no map is loaded until Play. `src/matchSession.ts` is one match (meshes, lighting, physics,
  nav, sim, bots, presentation), built in the Play click from New game's choices and disposed when the player leaves
  the match; `game.ts` is the app around it. Pull request #18 was merged at round 2; this branch carries round 3
  (the pointer-lock request counting, `pause()` with no match, the review line and leftovers).
- **Next: M17a** (replica slots, BB weight per replica; built, in review), then **M17b** attachments, then M13 audio,
  M18 match info, M19 custom matches, M20 practice range, M14 art, M16 tutorial (ROADMAP Phase 4 order).
- **M13 audio** (critic 9.0) is built in its own pull request (#19, branch `claude/m13-audio-rework-j2lmeh`). Sounds are
  data recipes (`config/sounds.ts`) rendered by the pure `audio/dsp.ts`, once per page (`SoundLibrary`, owned by
  `Game` with the volume sliders as `SfxSetup`); `Sfx` keeps one HRTF channel per character, muffled by rays. A new
  replica (M17, v0.3) only needs a `power`: its shot, dry-fire and magazine sounds follow from it.

## Working notes and gotchas

- **Lifecycle:** Play builds the session before asking for the mouse lock (audio unlock needs the click). A refused
  lock leaves it built but never drawn; Back to the title unloads it. Nothing is drawn while a menu is up.
  `PointerLock.request()` holds back `pointerlockerror` while a request is in flight (the retry without raw input can
  still lock); `pointerLock.test.ts` covers both event orders.
- **Picks apply at Play only:** mode, difficulty and loadout are picked with no match loaded, so the old
  "starts next round" notes are gone.
- **Menus:** one screen at a time (`Menus.go`); `menuNav.ts` decides Back and which menu opens when play stops. Text
  is set in capitals by CSS, so the code keeps normal case. `BUILD_LABEL` in `config/menus.ts` moves with each tag.
- **Sound:** `npm test -- src/audio` checks every recipe renders (audible, no clipping, no end click), the profiles
  differ, a shot stays louder than steps, and `Sfx` against a fake Web Audio context. To listen offline, render a cue
  with `renderSounds` in a scratch test and write a WAV. The Audio tab is `ui/audioSettings.ts`.
- **Parallel pull requests conflict** in `docs/DECISIONS.md`, `docs/REVIEWS.md` and `docs/KNOWN_ISSUES.md` (all
  append at the end). Merge `main` in and keep both sides, `main`'s lines first.
- **Checks:** `npm run check` (type check, tests, build). In a cloud container, run the smoke test with a temporary copy
  of `playwright.config.ts` whose `launchOptions.executablePath` is `/opt/pw-browsers/chromium` (don't commit it); use
  another port if two run at once. The `e2e` build exposes `window.airsoft` (the Game) like the dev server.
- **Measuring bots:** copy the top of `src/ai/depotMatch.test.ts` into a scratch test, write JSON with `writeFileSync`
  (Vitest hides `console.log`), run it with `-t`, then delete it.
- **Git:** new branch from the latest `main`, push, open a pull request; the owner merges. Never push to `main`, merge a
  pull request, or create or move tags. Install with npm 11 (`npx -y npm@11 install`) so the lockfile keeps its `libc` fields.
