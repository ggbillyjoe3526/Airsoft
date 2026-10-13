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
  playing Woodland and Neon Heights (`docs/PLAYTEST.md` › Only you can do these). The Dev 6 figure redesign waits on
  his reference photos and a session in his Blender (`docs/DECISIONS.md` › Art direction and graphics).
- **Gaps the figure redesign should close.** The redesigned robot (RM10) has its own vault and rest-on-cover clips,
  shared in `tools/blender/bot-figure/scripts/bot18.py`; the rigged human behind the Dev switches still has only
  placeholders (the jump through a vault, and its upper body leaned about 5° over the cover, `FIGURE_RIG.rest`) until
  its redesign rebuilds it with them; the built-in figures don't change (owner, 2026-10-13: the redesign brings the
  animations). Bots don't rest yet: they fire from the hip, and letting them aim when they peek over cover is a
  balance change for the bot personalities item (`docs/records/M104.md`).

## Where to look

- **Rulings in force:** `docs/DECISIONS.md`. **Open issues:** `docs/KNOWN_ISSUES.md`.
- **What each task did:** `docs/records/<id>.md`; history before 2026-10-08 is in `docs/archive/0.1-dev/`.
- **How work runs:** `docs/PROCESS.md` and `pipeline/README.md`.
