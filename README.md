# Airsoft

A browser-based, first-person, round-based team shooter built around the feel of recreational airsoft:
visible BBs, one hit and you're out, call your hit and walk off.

Status: **Phase 1** (single-player vs bots prototype) in progress. See `CLAUDE.md` for the project guide
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

| Key | Action |
|---|---|
| W A S D | Move |
| Mouse | Aim |
| Left click | Fire |
| Shift | Sprint (can't shoot while sprinting) |
| C | Crouch |
| Space | Jump |
| R | Reload |
| 1 / 2 / Q | Switch replica |
| Esc | Pause (releases the mouse) |
| ` or F3 | Debug overlay |

## Dev-only URL flags

- `?nolock`: play without pointer lock (for automated browsers; no mouse look).

## Layout

```
src/config   tuning data (movement, weapons, bots, match, render)
src/sim      pure simulation: plain-data state, fixed 60 Hz tick, commands, rules
src/physics  Rapier wrapper: level collision, character controllers, ray casts
src/ai       bot controllers (produce the same commands as the player)
src/map      map data
src/render   Three.js presentation
src/audio    Web Audio presentation
src/input    keyboard / pointer lock → commands
src/ui       DOM HUD, start screen, debug overlay
docs/        vision, architecture, decisions, assets, ideas, known issues, reviews
```
