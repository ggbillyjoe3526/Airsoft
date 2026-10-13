# Handoff

What is happening now (as of 2026-10-13), for a session picking up the work. The planning thread rewrites it once per
batch. The plan is `docs/ROADMAP.md`, the open tasks `docs/TASKS.md`, and the engine facts `docs/ARCHITECTURE.md` and
each `src/` folder's `README.md`.

## Now

- **0.1 Dev 5 is out.** The owner tagged `0.1-dev.5` on 2026-10-13 (commit `6bbb680`). All eleven items in
  `docs/ROADMAP.md` › 0.1 Dev 5 are done.
- **Next.** The owner playtests 0.1 Dev 5. 0.1 Dev 6 starts with M92–M95 (`docs/ROADMAP.md`). A later bug pass looks
  at the Blender models (owner, 2026-10-12).
- **Waiting on the owner:** the laptop and desktop Ultra perf baselines, the Save checks in Firefox and Edge, and
  playing Woodland and Neon Heights (`docs/PLAYTEST.md` › Only you can do these).
- **Vault and rest-on-cover clips.** Both rigged figures behind the Dev switches have their own (shared in
  `tools/blender/bot-figure/scripts/bot18.py`: the robot's built with it in RM10, the human's spliced into its RM9
  export); a figure file without them falls back to the old placeholders. The built-in figures don't change. Of the
  bots, anchors rest on cover (they aim where they stand still to fight or hold, BN1); the rest fire from the hip.

## Where to look

- **Rulings in force:** `docs/DECISIONS.md`. **Open issues:** `docs/KNOWN_ISSUES.md`.
- **What each task did:** `docs/records/<id>.md`; history before 2026-10-08 is in `docs/archive/0.1-dev/`.
- **How work runs:** `docs/PROCESS.md` and `pipeline/README.md`.
