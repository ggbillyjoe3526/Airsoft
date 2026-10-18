# Setting up the new project

The owner's steps, in order, once 0.1 Beta 1 is tagged here. Steps 1 to 6 are clicks on GitHub and claude.ai; from
step 7 Claude does the work in the new project.

## Steps

1. **Tag 0.1 Beta 1 in this repository.** Clear the open checks in `playtest/beta1-checklist.md` (this project's
   shared files) first, then create the tag `0.1-beta.1` on `main` and a release titled "Airsoft 0.1 Beta 1".
2. **Optional: one last docs pull request here.** The release checklist (`docs/PROCESS.md` › Releases) points the
   README's download link at the new tag and closes the changelog under 0.1 Beta 1. Ask for it in this project if you
   want the frozen repository to read as finished; skip it if not. Nothing else is built here.
3. **Create the new repository on GitHub.** New repository, a name of your choice (for example `Airsoft-Godot`),
   private, with **Add a README file** ticked so it has a `main` branch to work from, and the MIT licence (the game's
   code is MIT, copyright ggbillyjoe3526: `docs/DECISIONS.md` › Product and scope).
4. **Give Claude access to it.** Install the Claude GitHub App on the new repository the same way this one has it
   (https://github.com/apps/claude/installations/select_target, then pick the repository). If GitHub asks you to
   reconnect your account, do it at https://claude.ai/connect-github.
5. **Create the new Claude project on claude.ai.**
   1. In its Project settings › Repositories (resources), add **both** repositories: the new one and
      `ggbillyjoe3526/Airsoft`. Every thread then has both checked out side by side, so it can read the old docs,
      data and models and write into the new repository.
   2. Paste the text in [PROJECT_INSTRUCTIONS.md](PROJECT_INSTRUCTIONS.md) into its instructions.
   3. Write its goal (the topic). The current goal carries with four changes: "runs in the web browser" becomes "an
      installable desktop game built with Godot and Blender", section 7's title becomes "Technical Quality and
      Performance", its browser line ("pointer lock, focus loss and hidden tabs, audio unlocking …") becomes "mouse
      capture, window focus and minimising, fullscreen and display modes, audio devices and loading failures", and the
      closing line's "launch in their browser" becomes "install and launch".
   4. Leave the model and effort as in this project (Opus 5.5 at Extra effort for code and design).
6. **Bring across what lives only in this project.** The new project can't see this project's shared files or memory.
   Attach these to a message in the new project if you want them there:
   - The seven reference sheets in `concepts/graphics-overhaul/reference/` (only if you want the future look
     considered; see [README.md](README.md) › What the owner's reference sheets are).
   - Your PC's 4K performance baseline, `perf/desktop-4k-results-2026-10-17.md`, if you want the browser numbers kept
     for comparison.
7. **Tell the new project to start.** Post: "Read `docs/handover/README.md` in `ggbillyjoe3526/Airsoft` and set the
   project up." The coordinator starts the first threads below. Answer the open decisions in
   [README.md](README.md) whenever you like; the threads start on the recommended defaults.

## The first threads

In this order; each is one pull request in the new repository, merged by its own thread.

1. **Copy the pack.** `CLAUDE.md` from [NEW_CLAUDE.md](NEW_CLAUDE.md); the design docs, data tables, models (the
   figures unpacked first), fonts, Blender scripts and the `legacy/browser/` reference, each as
   [SALVAGE.md](SALVAGE.md) lists; `docs/PROCESS.md` with [VERSIONING.md](VERSIONING.md); `docs/ROADMAP.md` at
   0.1 Dev 1; `docs/DECISIONS.md` with the move as its newest ruling and the open decisions as defaults.
2. **Bootstrap Godot.** `project.godot` on the pinned Godot 4 version, the folder layout, the 60 Hz physics tick, the
   test framework run headless, CI (tests plus Windows and Linux exports, the Review line check), the three review
   agents, the changelog agent and the pipeline skill rewritten for Godot, and a credits screen that shows the licences.
3. **The simulation core.** Commands, state, events, the fixed step and the seeded randomness, ported with their tests.
4. **First playable on Depot.** Depot's greybox built from its exported layout, the player's movement, the AEG and the
   GBB Pistol firing real BBs with hop-up, and hit calling with the walk-off.
5. **Bots and Elimination.** The nav grid, the bots, and Elimination's round flow on Depot, with the match guards. That
   is the core slice of 0.1 Dev 1; the owner plays it and decides when to tag.

## What the new project should remember

This project's memory doesn't move. These working preferences live mostly there, so give them to the new project's
coordinator to save (paste this list):

- **Communication.** The coordinator posts in the project chat only when something needs the owner, when a batch has
  merged (saying exactly what to play), or when he asks; each post leads with whether anything needs him. Threads never
  ask him to merge or review, and their replies stay short.
- **Pictures first.** Show a screenshot or concept before a visible UI or art change is built. A visual concept shows
  the whole look prototyped (figures, hands, props, layout), not a palette pass.
- **One checklist per version** of everything he must check, in the shared files; a reminder to clear it before every
  tag; a full bug pass before every Beta tag, suggested to him, never started on its own.
- **Models.** Opus 5.5 for code, design, the coordinator and bug passes; Sonnet 5.5 for UI, trivial and fix tasks and
  QA; Haiku 5.5 for the changelog and triage agents; Fable 5.1 only with his approval, asked each time.
- **Design principles (owner, 2026-10-16).** If the player never sees it, remove it. Bushes small and decorative. Maps
  not too dark. A steadier walk holding Shift. The player's own body is never visible looking down. No HUD hints that
  teach controls; a compact replica panel. No boulders on any map. Teams Alpha blue, Beta orange.
- **His PC.** Ryzen 9 9950X3D, 64 GB, RTX 5090: the 4K, 240 Hz class machine Ultra targets. He has no low-powered PC,
  so a Low-preset claim needs a measured run on one.
