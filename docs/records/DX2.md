# DX2 · Docs slimming: the 50 KB rule applied, and the finished plan archived (audit A6; folds DC1)

**Review:** 1 attempt · trivial · Accept (Haiku diff check)

## Attempts

| Date | Attempt | Worker model | build | tests | smoke | perf | scope | changelog | Critic | Retry reason | Wall time | Worker tokens |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 2026-10-17 | 1 | build thread | – docs only | – docs only | – CI | – not required | ✓ | ✓ | trivial Accept (Haiku diff check) | – | ~3 h | – |

## Decisions

- **DECISIONS was trimmed, not split.** Each ruling kept its decision, its owner date and the detail that still binds
  (48.9 KB from 99 KB); a split would have left four live files to keep in step. Superseded and finished rulings (the Dev 5
  order, the audit's 34 decisions, the token-efficiency plan, the chunk-size bump history) lost their lines, with one
  pointer in the header.
- **Every cut file has a word-for-word copy in `docs/archive/0.1-beta/`.** `DECISIONS.md` and `PLAYTEST.md` are the whole
  live file as of 2026-10-16; `KNOWN_ISSUES.md` holds the 194 rows that were shortened. A copy is simpler to check than a
  hand-made list of what each cut dropped, and grep finds the reason behind any number. The archive README names the folder.
- **KNOWN_ISSUES keeps all 219 rows, each with its class and Beta 1 owner.** None was found fixed (KI1 had already
  removed those), so nothing went to the archive as fixed. 194 rows were shortened to about 300 characters at most (the
  longest 317); the other 25 are untouched, so the other thread's edits to them rebase cleanly. A row changed here keeps
  its issue text unless that alone passed about 170 characters.
- **PLAYTEST is one guide for the current build, cut by check, not by build.** It had no per-build sections to move: it
  is organised by area. Each of its 219 checks now says what to do and what should happen, with the figures and the
  reasons in the archive copy; the `##` and `###` headings are unchanged (except "Your five calls, confirmed", a
  2026-10-05 note now in the archive), so no `›` reference elsewhere moved. "Play these first" was rewritten for the
  Dev 6 changes in fewer lines.
- **ROADMAP's Dev 5 plan and Dev 6 section moved whole**, with the playtest notes, the audit list, the token table and
  "What moved out of Dev 6", to `docs/archive/0.1-dev/ROADMAP.md` under a dated heading. The live file's two links and
  the "see above" pointers now name the archive; Builds and Where we are still name `0.1-dev.5` and `0.1-dev.6`.
- **The archive check is step 6 of the release checklist** (`docs/PROCESS.md › Releases`), run on `wc -c docs/*.md`.
- **The 50 KB limit was read as 50,000 bytes**, so the three files sit at 48.9, 49.1 and 48.9 KB with a little room.

## Known issues left

- A thread that adds rows to KNOWN_ISSUES or checks to PLAYTEST must keep each row near 300 characters and each check
  near 200; the three files have about 1 KB of room each before the next archive check (PROCESS › Releases, step 6).
