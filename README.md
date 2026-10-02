# Airsoft — v0.1-alpha.2

A browser-based, first-person, round-based team shooter built around the feel of recreational airsoft:
visible BBs, one hit and you're out, call your hit and walk off.

**v0.1-alpha.2 (alpha: Phases 1 and 2).** On the warehouse map "Depot" you play a 3v3 against bots: you and two
bot teammates (Blue) against three bots (Orange), with an AEG rifle and a gas pistol. One BB hit and you're
out: your hand goes up, you walk off, and you spectate. Pick a mode on the start screen:
**Elimination** (knock out the whole other team) or **Attack / Defend** (raise your flag on the other team's
pole, or keep yours down; sides swap at half-time). First to 5 rounds wins the match.

New since v0.1-alpha: the **Attack / Defend** mode, bot difficulty levels (Easy / Normal / Hard), smarter bots
(they pop up over low cover, move as a team, vary their routes and walk quietly when closing in), walk quietly
with Shift (sprint moved to Left Alt), rebindable keys, a bigger and more open Depot, footsteps you and the
bots can hear, a visible magazine-swap reload, hit flinches, clearer hit confirmation at range, and
smoother-moving players.

---

## How to play it on your computer (step by step)

You need a desktop computer (Windows, Mac or Linux) and **Chrome, Firefox or Edge**. The first-time
setup takes about 5 minutes.

### 1. Install Node.js (one time only)

Go to **https://nodejs.org**, download the **LTS** version (22 or newer), and install it with the default options.
(The game uses Node.js to run a small local web server; nothing is installed into your browser.)

### 2. Download the game

Download v0.1-alpha.2 as a ZIP file:

**https://github.com/ggbillyjoe3526/airsoft/archive/refs/tags/v0.1-alpha.2.zip**

Unzip it somewhere easy to find, for example your Desktop. You'll get a folder called `airsoft-0.1-alpha.2`.
(Older versions are on the **Releases / Tags** page of the repository.)

(If that link doesn't work, open **https://github.com/ggbillyjoe3526/airsoft**, click the green **Code**
button, then **Download ZIP**. The folder will then be called `airsoft-main`; use it the same way.)

### 3. Open a terminal in that folder

- **Windows:** open the unzipped folder (`airsoft-0.1-alpha.2`, or `airsoft-main` if you used the Download ZIP
  button), click the address bar at the top of the window, type `cmd` and press Enter.
- **Mac:** right-click the unzipped folder (`airsoft-0.1-alpha.2` or `airsoft-main`) and choose **New Terminal at Folder**.
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

- **Goal:** pick a mode on the start screen. First team to 5 round wins takes the match.
  - **Elimination:** knock out every player on the other team. If the clock runs out, the round is a draw.
  - **Attack / Defend:** each team has a flagpole in its half. Each round one team attacks the other's pole: stand by it
    (inside the painted ring) for 5 s to raise your flag and win the round. Defenders standing by the pole pull
    the flag back down; with both teams at the pole the flag doesn't move. The defenders win if the clock runs
    out (if attackers are still at the pole then, play goes on in overtime, up to 15 s, until they leave or
    finish), and knocking out the whole other team wins in either role. Your team attacks first; sides swap after
    round 4. The strip under the scoreboard shows how far up the flag is, and a marker shows where the pole is.
    A mode picked mid-match starts with the next match.
- **One hit = out.** When a BB hits you, you hear a sharp "tick", see where it came from, raise your hand
  and walk off to the dead zone. While out, you watch your teammates (click to switch).
- **BBs are real projectiles:** they take time to fly (about half a second across the map), slow down and drop at
  range, so lead moving targets and aim a little high far away. The AEG shoots heavier 0.25 g BBs at about a joule;
  the gas pistol lighter 0.20 g BBs, slower, so it drops off sooner.
- **Magazines are limited:** each replica carries a few magazines a round. A reload swaps in your fullest spare and
  the old one goes back in the pouch with whatever is left in it, so reloading early has a cost. The small
  gauges next to your BB count show each spare magazine (the yellow one is next); nothing refills until the next
  round. Pressing R when no spare has more BBs does nothing, and the HUD says so.
- **Friendly fire counts,** like at a real site, so watch your teammates.
- **Sprinting** carries your replica: you can't shoot until a moment after you stop.
- **Footsteps give you away.** Running and sprinting are heard by you and the bots (sprinting from further away);
  walking (Shift) and moving crouched are silent. Listen for enemies the same way.
- **Bot difficulty** (Easy, Normal, Hard) is picked on the start screen and applies to all bots, teammates too.
  Changed mid-match, it starts with the next round. On Normal, a bot's first BBs up close can miss, and
  moving targets are harder for bots to hit.

### Controls

| Key | Action |
|---|---|
| W A S D | Move |
| Mouse | Aim |
| Left click | Fire (hold for the AEG rifle, click per shot for the pistol) |
| Shift | Walk: slow and silent (no footsteps), for sneaking and holding angles |
| Left Alt | Sprint (forward only) |
| C | Crouch |
| Q / E (hold) | Lean left / right: peek around cover (leaning slows you to a quiet walk and stops sprinting) |
| Space | Jump (small hop) |
| R | Reload (an empty trigger pull also reloads) |
| 1 / 2 or mouse wheel | Switch between AEG rifle and gas pistol |
| Left click while out | Watch the next player still in play |
| Esc | Pause (releases the mouse). The pause screen has **Key bindings** to change keys. |
| `` ` `` or F3 | Frame rate and debug info |
| ] | Debug: show BB flight paths |

---

## What's in v0.1-alpha.2 and what isn't

**In:** one map (Depot), two replicas (AEG rifle, gas pistol), BB ballistics with hop-up, one-hit
elimination with hit calling, two modes (Elimination; Attack / Defend with a flagpole, overtime and a
half-time swap), bots at three difficulty levels (patrol, spot, react, shoot, take cover, crouch-peek over low
cover, move as a team, search, hunt, hear footsteps, hold and retake the pole), 3v3 matches with a round clock
and first-to-5 scoring, walk/run/sprint, rebindable keys, synthesised sounds with footsteps, reload
animations, hit reactions and a minimal HUD.

**Next (Phase 3, v0.1-alpha.3):** core foundations: carrying a set of magazines with meaningful reloads, a BB
physics pass, movement and positioning, and a reworked Depot. Progress and plans:
[`docs/ROADMAP.md`](docs/ROADMAP.md).

**Version names:** the game is being built as **v0.1**. Alpha releases (`v0.1-alpha`, `v0.1-alpha.2`,
`v0.1-alpha.3` …) come first. Beta releases (`v0.1-beta` …) follow once it's feature complete, and **v0.1** is
the first public release. More modes, maps, replicas, loadouts and customisation come in later versions.

**Branches:** `main` holds the latest stable release (for now, that includes alpha releases). Later, development
moves to an `alpha` branch and testing to a `beta` branch, and `main` only receives tested releases.

**Not yet:** more maps or replicas, menus beyond the start screen, real art.
The game is single-player against bots (no multiplayer is planned). Known rough edges are listed in
[`docs/KNOWN_ISSUES.md`](docs/KNOWN_ISSUES.md). Bot difficulty levels and Attack / Defend balance still need
tuning from playtesting.

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
