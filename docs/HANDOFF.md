# Handoff

What is happening now (as of 2026-10-16), for a session picking up the work. The planning thread rewrites it once per
batch. The plan is `docs/ROADMAP.md`, the open tasks `docs/TASKS.md`, and the engine facts `docs/ARCHITECTURE.md` and
each `src/` folder's `README.md`.

## Now

- **0.1 Dev 6 is out.** The owner tagged `0.1-dev.6` on 2026-10-16 (commit `c810dd3`). Every item in
  `docs/ROADMAP.md` › 0.1 Dev 6 is done, the last its full bug pass (BP5, `docs/records/BP5.md`).
- **Next.** The owner playtests 0.1 Dev 6, then 0.1 Beta (fixes, balance and polish, no features). The spring sniper
  waits for 0.2 and his specs.
- **Waiting on the owner:** the hit area's shape before the figures leave the Dev switches; whether Adaptive
  difficulty's steps and the callouts' pace feel right; whether an overtime flag taken at once by someone already on
  its spot feels cheap; and from before, the laptop and desktop Ultra perf baselines, the Save checks in Firefox and
  Edge, and playing Woodland and Neon Heights (`docs/PLAYTEST.md` › Only you can do these; Pro Woodland Attack /
  Defend waits on that, `docs/KNOWN_ISSUES.md`).
- **Vault and rest-on-cover clips.** Both rigged figures behind the Dev switches have their own (shared in
  `tools/blender/bot-figure/scripts/bot18.py`: the robot's built with it in RM10, the human's spliced into its RM9
  export); a figure file without them falls back to the old placeholders. The built-in figures don't change. Of the
  bots, anchors rest on cover where they stand still to fight or hold (BN1; not while sidestepping or hunting, BP5);
  the rest fire from the hip.

## Where to look

- **Rulings in force:** `docs/DECISIONS.md`. **Open issues:** `docs/KNOWN_ISSUES.md`.
- **What each task did:** `docs/records/<id>.md`; history before 2026-10-08 is in `docs/archive/0.1-dev/`.
- **How work runs:** `docs/PROCESS.md` and `pipeline/README.md`.
