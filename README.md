# Airsoft

A browser-based, first-person, round-based team shooter built around the feel of recreational airsoft:
visible BBs, one hit and you're out, call your hit and walk off.

Status: **Phase 1** (single-player vs bots prototype) in progress: on the first map "Depot" you can
shoot BBs from an AEG rifle and a gas pistol at a 3v3 of stand-in players (they don't move or shoot
yet). One hit and you're out: call it, walk off, spectate; when a team is wiped out, a new round starts. See `CLAUDE.md` for the project guide
and `docs/` for design notes.

## Requirements

- Node.js 20.19+ (developed on Node 24 LTS)
- A desktop browser with WebGL2 (Chrome, Firefox or Edge)

## Run

```bash
npm install
npm run dev
```

Open the printed URL (default http://localhost:5173) and click **Click to play**.

## Build a static production bundle

```bash
npm run build
npm run preview
```

`dist/` is a fully static site (relative paths) and can be served from any static host or subfolder.

## Checks

```bash
npm run typecheck
npm run test
npm run check
```

`npm run check` runs the type check, unit tests and production build in sequence.

## Controls

Only controls that currently do something are listed; more arrive with each feature.

| Key | Action |
|---|---|
| W A S D | Move |
| Mouse | Aim |
| Left click | Fire (hold for the AEG, click per shot for the pistol) |
| Shift | Sprint (forward only) |
| C | Crouch |
| Space | Jump (small hop) |
| R | Reload (an empty trigger pull also reloads) |
| 1 / 2, Q or mouse wheel | Switch between AEG rifle and gas pistol |
| Left click while out | Watch the next player still in play |
| Esc | Pause (releases the mouse) |
| ` or F3 | Debug overlay |
| ] | Debug: show BB flight paths |

## Dev-only URL flags

- `?nolock`: play without pointer lock (for automated browsers; no mouse look).

## Layout

```
src/config   tuning data (movement, physics, controls, render, sim timing)
src/core     fixed-timestep accumulator
src/sim      pure simulation: plain-data state, fixed 60 Hz tick, commands, movement
src/physics  Rapier wrapper: level collision, character controller
src/map      map data
src/render   Three.js presentation
src/input    keyboard / pointer lock → commands
src/ui       start/pause screen, debug overlay
docs/        vision, architecture, decisions, assets, ideas, known issues, reviews
```

Bots (`src/ai`), audio (`src/audio`) and the HUD arrive with their Phase 1 features.
