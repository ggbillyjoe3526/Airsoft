# Handoff

What is happening now (as of 2026-10-16), for a session picking up the work. The planning thread rewrites it once per
batch. The plan is `docs/ROADMAP.md`, the open tasks `docs/TASKS.md`, and the engine facts `docs/ARCHITECTURE.md` and
each `src/` folder's `README.md`.

## Now

- **0.1 Dev 6 is out.** The owner tagged `0.1-dev.6` on 2026-10-16 (commit `c810dd3`). Every item in
  `docs/ROADMAP.md` › 0.1 Dev 6 is done, the last its full bug pass (BP5, `docs/records/BP5.md`).
- **Now: 0.1 Beta 1** (owner, 2026-10-16; he tags it when complete). His Dev 6 playtest list (34 items) is seven blocks
  at the top of `docs/TASKS.md` (ST1, MR1, HD1, MV1, BD1, MS1, TT1), each built by its own thread. He played Dev 6 (2026-10-16). The Beta 1 blocks are in `docs/TASKS.md`, highest
  priority first: fixes, balance, performance and polish, with no features. His playtest made three of them: WL1
  (Woodland Attack / Defend), NH1 (Neon Heights' upper floors, placed with the Maps Update) and HV1 (the hit area
  fitted to each figure, his ruling, done in HV1 with BD1, which made the rigged figures the default). The callouts' pace is fine, and
  the overtime flag went unseen because rounds ended first. The spring sniper waits for 0.2 and his specs.
- **Waiting on the owner:** trying Adaptive difficulty, the laptop and desktop Ultra perf baselines (PF2 waits on
  them), and the Save checks in Firefox and Edge (`docs/PLAYTEST.md` › Only you can do these).
- **Vault clips.** Both rigged figures (the default since BD1) have their own (shared in
  `tools/blender/bot-figure/scripts/bot18.py`: the robot's built with it in RM10, the human's spliced into its RM9
  export); a figure file without them falls back to the old placeholder. The built-in figures don't change. Of the
  bots, anchors aim from cover where they stand still to fight or hold (BN1; not while sidestepping or hunting, BP5);
  the rest fire from the hip.

## Where to look

- **Rulings in force:** `docs/DECISIONS.md`. **Open issues:** `docs/KNOWN_ISSUES.md`.
- **What each task did:** `docs/records/<id>.md`; history before 2026-10-08 is in `docs/archive/0.1-dev/`.
- **How work runs:** `docs/PROCESS.md` and `pipeline/README.md`.
