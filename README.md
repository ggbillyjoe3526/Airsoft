# Airsoft — version 0.1

A browser-based, first-person, round-based team shooter built around the feel of recreational airsoft:
visible BBs, one hit and you're out, call your hit and walk off.

**Version 0.1 (Phase 1 prototype).** On the warehouse map "Depot" you play a 3v3 against bots: you and two
bot teammates (Blue) against three bots (Orange), with an AEG rifle and a gas pistol. One BB hit and you're
out: your hand goes up, you walk off, and you spectate. Knock out the whole other team to win a round
(2:30 on the clock; a time-out is a draw). First to 5 rounds wins the match.

---

## How to play it on your computer (step by step)

You need a desktop computer (Windows, Mac or Linux) and **Chrome, Firefox or Edge**. The first-time
setup takes about 5 minutes.

### 1. Install Node.js (one time only)

Go to **https://nodejs.org**, download the **LTS** version (22 or newer), and install it with the default options.
(The game uses Node.js to run a small local web server; nothing is installed into your browser.)

### 2. Download the game

Download version 0.1 as a ZIP file:

**https://github.com/ggbillyjoe3526/airsoft/archive/refs/tags/v0.1.zip**

Unzip it somewhere easy to find, for example your Desktop. You'll get a folder called `airsoft-0.1`.

(If that link doesn't work, open **https://github.com/ggbillyjoe3526/airsoft**, click the green **Code**
button, then **Download ZIP**. The folder will then be called `airsoft-main`; use it the same way.)

### 3. Open a terminal in that folder

- **Windows:** open the unzipped folder (`airsoft-0.1`, or `airsoft-main` if you used the Download ZIP
  button), click the address bar at the top of the window, type `cmd` and press Enter.
- **Mac:** right-click the unzipped folder (`airsoft-0.1` or `airsoft-main`) and choose **New Terminal at Folder**.
- **Linux:** right-click inside the folder and choose **Open in Terminal**.

### 4. Install and start the game

Type these two commands, pressing Enter after each one:

```
npm install
npm run dev
```

The first command downloads the game's building blocks (about a minute, needs internet; only needed the
first time). The second starts the game and prints an address.

### 5. Play

Open **http://localhost:5173** in Chrome, Firefox or Edge and click **Click to play**.

To stop the game, go back to the terminal and press **Ctrl+C**. To play again later, repeat step 3 and
run `npm run dev` (no need for `npm install` again).

### Optional: the faster "release" version

The steps above run the development version. For the optimised build (slightly faster loading):

```
npm run build
npm run preview
```

Then open **http://localhost:4173**.

### If something goes wrong

| Problem | Fix |
|---|---|
| `npm` is "not recognized" / "command not found" | Close and reopen the terminal after installing Node.js; if it still fails, restart the computer. |
| The page says the address can't be reached | Check the terminal is still running `npm run dev`, and use the exact address it printed. |
| Black screen or "Failed to start" | Update your browser; the game needs WebGL2 (any recent Chrome, Firefox or Edge has it). |
| Clicking doesn't capture the mouse | Wait a second and click again (browsers refuse to re-capture the mouse right after Esc). |
| It feels slow | Close other heavy tabs and apps; press `` ` `` or F3 to see the frame rate. |

---

## How to play

- **Goal:** knock out every player on the other team. First team to 5 round wins takes the match.
- **One hit = out.** When a BB hits you, you hear a sharp "tick", see where it came from, raise your hand
  and walk off to the dead zone. While out, you watch your teammates (click to switch).
- **BBs are real projectiles:** they take time to fly and drop at range, so lead moving targets.
- **Friendly fire counts,** like at a real site, so watch your teammates.
- **Sprinting** carries your replica: you can't shoot until a moment after you stop.

### Controls

| Key | Action |
|---|---|
| W A S D | Move |
| Mouse | Aim |
| Left click | Fire (hold for the AEG rifle, click per shot for the pistol) |
| Shift | Walk: slow and quiet, for sneaking and holding angles |
| Left Alt | Sprint (forward only) |
| C | Crouch |
| Space | Jump (small hop) |
| R | Reload (an empty trigger pull also reloads) |
| 1 / 2, Q or mouse wheel | Switch between AEG rifle and gas pistol |
| Left click while out | Watch the next player still in play |
| Esc | Pause (releases the mouse). The pause screen has **Key bindings** to change keys. |
| `` ` `` or F3 | Frame rate and debug info |
| ] | Debug: show BB flight paths |

---

## What's in version 0.1 and what isn't

**In:** one map (Depot), two replicas (AEG rifle, gas pistol), BB ballistics with hop-up, one-hit
elimination with hit calling, bots (patrol, spot, react, shoot, take cover, search, hunt), 3v3 matches
with a round clock and first-to-5 scoring, synthesised sounds, a minimal HUD.

**Not yet:** multiplayer, objectives, more maps or replicas, menus beyond the start screen, real art.
Known rough edges are listed in [`docs/KNOWN_ISSUES.md`](docs/KNOWN_ISSUES.md). Bot difficulty and pacing
still need tuning from playtesting (they may feel quite deadly up close).

---

## For developers

Requirements: Node.js 22.12+ (or 24 LTS; the test runner needs 22.12+).

```bash
npm install
npm run dev        # development server with hot reload
npm run check      # type check + unit tests + production build
npm run build      # static site in dist/ (relative paths; any static host)
npm run preview    # serve dist/ locally
```

Dev-only URL flag: `?nolock` plays without pointer lock (for automated browsers; no mouse look).
In development, `window.airsoft` exposes the running game.

### Layout

```
src/config   tuning data (movement, physics, replicas, hits and rounds, bots, nav, render, audio)
src/core     fixed-timestep accumulator
src/sim      pure simulation: plain-data state, fixed 60 Hz tick, commands, movement, BBs, hits, rounds
src/nav      walkability grid and route finding
src/ai       bots (perception, aim, cover, decisions), driven through the same commands as the player
src/physics  Rapier wrapper: level collision, character controller, ray casts
src/map      map data (Depot, test yard)
src/render   Three.js presentation (map, replicas, figures, BBs, effects, cameras)
src/audio    synthesised sound effects
src/input    keyboard / pointer lock → commands
src/ui       start/result screen, HUD, scoreboard, hit feedback, debug overlay
docs/        vision, architecture, decisions, assets, ideas, known issues, reviews
```

See `CLAUDE.md` for the project guide and `docs/` for design notes.
