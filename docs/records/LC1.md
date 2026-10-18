# LC1 · Third-party licences: the shipped build carries them, and the rules for adding a library

**Review:** 1 attempt · 8/8 · Accept (Sonnet)

## Attempts

| Date | Attempt | Worker model | build | tests | smoke | perf | scope | changelog | Critic | Retry reason | Wall time | Worker tokens |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 2026-10-18 | 1 | Opus 5.5 (build thread) | ✓ 21 s | ✓ 547 s | ✓ 1259 s | ✓ 12 rows (first run) | ✓ | ✓ (changelog agent after the critic) | 8/8 Accept (Sonnet) | – | ~2 h | QA 31k, performance 26k, critic 27k, changelog 20k |

## Decisions

- **The rules for libraries, tools and assets, the Do not use list and the licence guide live in `docs/ASSETS.md`.**
  From the owner's briefing (owner, 2026-10-18; `docs/DECISIONS.md` › Product and scope). Its candidate tables were
  left out: they date fast.
- **The file is `third-party-licences.txt`, though Vite writes Markdown into it.** A static host serves `.md` as
  `text/markdown`, which some browsers download; `.txt` opens as text everywhere.
- **meshoptimizer and Inter are added by hand (`VENDORED_NOTICES`).** Vite lists npm packages only: the decoder ships
  from inside three's package and the font from the repo. The decoder's copyright line is read from its header at
  build time, and a header without one fails the build.
- **The link sits small over the version on the title.** The game has no credits screen; this is the smallest place
  that fits the title's plain design.
- **The first full gate run was stopped by a time limit with two failures under CPU load.** A particle allocation count
  (422 against 400) and the WebGPU Woodland QA spec; both pass alone, and the second run's build and tests passed.
- **The dev server has no licences file, so there the link opens the game's fallback page.** Players only get builds,
  where it works; `docs/PLAYTEST.md` › Menus says so.
