# Handoff

What is happening now (as of 2026-10-18), for a session picking up the work. The planning thread rewrites it once per
batch. The plan is `docs/ROADMAP.md`, the open tasks `docs/TASKS.md`, and the engine facts `docs/ARCHITECTURE.md` and
each `src/` folder's `README.md`.

## Now

- **The project is on hold once the owner tags 0.1 Beta 1** (owner, 2026-10-18: "No further work will be done for
  now"). Start nothing until he picks it up again. `main` holds everything: no thread has work in progress or an
  unmerged branch.
- **0.1 Beta 1 is complete.** Every thread merged, then the full bug pass ran in four parts (BP6a gunplay and HUD,
  BP6b bots, modes and maps, BP6c menus, settings and browser, BP6d the known issues and the owner's checklist;
  `docs/records/BP6a.md` to `BP6d.md`). Its summary, and the owner's own checks, are in the project's shared files
  (`bugpass/summary.md`, `playtest/beta1-checklist.md` › Only you can do these). He tags `0.1-beta.1` himself.
- **Open blocks in `docs/TASKS.md` all wait** on his playtest answers (BL1, WL1, BL2, BT1, TU1), his laptop baseline
  (PF2) or the Maps Update (NH1, NH2). None has started.

## On hold, not started

Each waits for the owner to pick the project up again; none has a branch.

- **Prettier's one-off reformat and CI's format check** (owner, 2026-10-17: after the 0.1 Beta 1 tag). DX4 installed
  Prettier and didn't run it.
- **knip's tidy-ups** (TL1): 79 exports that could lose `export` and 3 unlisted dependencies in the Blender figure
  tools (`audit/knip-2026-10-18.md` in the shared files). Nothing is removed without his word.
- **A desktop download** (Tauri or Electron) and **an installable web app** (`vite-plugin-pwa`): after Beta, on his
  word (the desktop download is in `docs/ROADMAP.md` › Early Access; the web app came from the third-party briefing,
  2026-10-18).

## Where to look

- **Rulings in force:** `docs/DECISIONS.md`. **Open issues:** `docs/KNOWN_ISSUES.md`.
- **What each task did:** `docs/records/<id>.md`; history before 2026-10-08 is in `docs/archive/0.1-dev/`.
- **How work runs:** `docs/PROCESS.md` and `pipeline/README.md`.
