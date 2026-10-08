# Docs archive

Finished history moved out of the live docs, kept word for word so nothing is lost and grep still finds it. The live
file in `docs/` holds what is current; read an archive file only when you need the history behind it (why a value
was chosen, what an old milestone did).

- **`0.1-dev/`:** everything up to the docs rewrite of 2026-10-08 (the 0.1 Dev 1 to Dev 4 builds and the start of
  Dev 5). Each file starts with a short header naming the live file it came from.
- **What is here:** `ARCHITECTURE.md`, `DECISIONS.md` (every decision line before 2026-10-08), `HANDOFF.md`,
  `KNOWN_ISSUES.md` (fixed rows, then the whole old file), `METRICS.md` and `REVIEWS.md` (the pipeline's shared tables,
  replaced by `docs/records/`), `PLAYTEST.md`, `PROCESS.md` and `ROADMAP.md` (Phases 1 to 4 and the old progress table).
- **Rules.** Never edit an archived file, except to fix a broken link. A later archive goes in a new folder named for
  its release (for example `0.1-beta/`).
- **Searching.** These files are large: grep for the id or value you want (`grep -n "FA6" docs/archive/0.1-dev/*.md`),
  then read the lines around it.
