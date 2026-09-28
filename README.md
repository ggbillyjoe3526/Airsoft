# Airsoft

A browser-based, first-person, round-based team shooter built around the feel of recreational airsoft:
visible BBs, one hit and you're out, call your hit and walk off.

Status: **Phase 1** (single-player vs bots prototype) in progress: you can walk around the first map,
"Depot" (a warehouse yard with a container lane, a crate yard and an office block). See `CLAUDE.md` for the project guide
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
| Mouse | Look |
| Shift | Sprint (forward only) |
| C | Crouch |
| Space | Jump (small hop) |
| Esc | Pause (releases the mouse) |
| ` or F3 | Debug overlay |

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
