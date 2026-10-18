# Handoff

What is happening now (as of 2026-10-18), for a session picking up the work. The plan is `docs/ROADMAP.md`, the open
tasks `docs/TASKS.md`, and the engine facts `docs/ARCHITECTURE.md` and each `src/` folder's `README.md`.

## Now

- **This repository's last build is 0.1 Beta 1.** Once the owner tags `0.1-beta.1`, all development stops here and
  continues in a new repository: an installable game built with Godot and Blender by Claude Code, restarting at
  0.1 Dev 1 (owner, 2026-10-18). This repository stays frozen at the tag as the new project's reference.
- **The handover pack** is `docs/handover/`: why the move, the versioning restart, the salvage map, drafts of the new
  project's instructions and `CLAUDE.md`, and the owner's setup steps (`docs/handover/SETUP.md`).
- **0.1 Beta 1 is complete.** Every thread merged, then the full bug pass ran in four parts (BP6a gunplay and HUD,
  BP6b bots, modes and maps, BP6c menus, settings and browser, BP6d the known issues and the owner's checklist;
  `docs/records/BP6a.md` to `BP6d.md`). Its summary, and the owner's own checks, are in the project's shared files
  (`bugpass/summary.md`, `playtest/beta1-checklist.md` › Only you can do these). He tags `0.1-beta.1` himself.
- **Start nothing here after the tag.** The open blocks in `docs/TASKS.md` (BL1, WL1, BL2, BT1, TU1, PF2, NH1, NH2),
  Prettier's reformat, knip's tidy-ups (TL1) and the desktop download or installable web app are not built here; what
  of them still matters is planned again in the Godot project. The one exception is the release checklist's docs pull
  request after the tag, if the owner asks for it (`docs/handover/SETUP.md`, step 2).

## Where to look

- **Rulings in force:** `docs/DECISIONS.md`. **Open issues:** `docs/KNOWN_ISSUES.md`.
- **What each task did:** `docs/records/<id>.md`; history before 2026-10-08 is in `docs/archive/0.1-dev/`.
- **How work runs:** `docs/PROCESS.md` and `pipeline/README.md`.
