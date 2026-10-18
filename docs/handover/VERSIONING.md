# Versioning in the new project

How the Godot project numbers its builds. Every session in the new repository keeps to it; copy it into that
repository's `docs/PROCESS.md` › Versioning.

## The restart

- **The new project starts again at 0.1 Dev 1 (owner, 2026-10-18).** It is a new codebase, so its first build is
  0.1 Dev 1, tagged `0.1-dev.1`, even though this repository already used that number.
- **The format stays exactly as it was.** Only the count resets. The stages, names and tags below are the ones this
  repository used (its `docs/PROCESS.md` › Versioning).
- **The browser versions are history, not a starting point.** This repository's tags (`0.1-dev.1` to `0.1-dev.6`, then
  `0.1-beta.1`) belong to the browser game and live only here. The new repository never imports them, and nothing in
  it continues from Beta 1.
- **To tell them apart in writing,** say "the browser game's 0.1 Beta 1" for this repository's builds. A bare version
  in the new project always means a Godot build.

## The stages

| Version (git tag) | Meaning |
|---|---|
| 0.1 Dev 1, 0.1 Dev 2 … (`0.1-dev.1`, `0.1-dev.2` …) | **Dev**: building the game. Systems and content can be added, gameplay can change a lot, breaking changes are fine. Each build number is a full Dev release. |
| 0.1 Beta 1, 0.1 Beta 2 … (`0.1-beta.1` …) | **Beta**: starts when the owner calls 0.1 feature complete. Fixes, balance, performance, stability, UX and polish; no new features unless he asks for one. |
| 0.1.0 (`0.1.0`) | The first public release and the start of Early Access: feature complete, light on content, released when the owner calls it a stable public product. |
| 0.1.1, 0.1.2 … | Fixes, performance, balance, small UX and accessibility changes, small content, maintenance. |
| 0.2, 0.3 … (`0.2.0` …) | A themed update (Replica, Modes, Maps, Progression, and any more the owner adds), each with its own Dev and Beta builds, in the order he picks. The next one shipped takes the next number. |
| 1.0 (`1.0.0`) | The full launch: the owner calls the game complete and Early Access ends. |

## The rules that come with it

- **Names** are written "0.1 Dev 1" or "0.1 Beta 1", with no "v". Tags use the dotted forms (`0.1-dev.1`, never
  `0.1-dev-1`). A GitHub release is titled "Airsoft 0.1 Dev 1".
- **Only full releases are tagged.** Playtests in between are plain commits; there are no letter checkpoints.
- **Only the owner creates tags.** Sessions never create, rename or move one. After he tags, the next pull request
  runs the release checklist (`docs/PROCESS.md` › Releases).
- **Dev until the owner calls it feature complete, then Beta.** Beta adds no features unless he asks for one.
- **A full bug pass comes before every Beta tag,** and the owner is reminded to clear his checklist before he tags.
  Neither starts automatically.
- **The number is the product, the stage is its state.** Never move to 0.2 because a phase ends or time passes.
- **The build shows its version, from git, never bumped by hand.** As in the browser game, the export step writes
  `git describe` into the project (`application/config/version` in `project.godot`, or a small generated file) before
  Godot exports, so the title screen names the tag it was built from.
