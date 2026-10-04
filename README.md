# Airsoft — v0.1-alpha.3

A browser-based, first-person, round-based team shooter built around the feel of recreational airsoft:
visible BBs, one hit and you're out, call your hit and walk off.

**v0.1-alpha.3 (alpha: Phases 1 to 3).** On the warehouse map "Depot" you play a 3v3 against bots: you and two
bot teammates (Blue) against three bots (Orange), with an AEG rifle and a gas pistol. One BB hit and you're
out: your hand goes up, you walk off, and you spectate. Pick a mode on the New game screen (**Start**, then **Mode**):
**Elimination** (knock out the whole other team) or **Attack / Defend** (raise your flag on the other team's
pole, or keep yours down; sides swap at half-time). First to 5 rounds wins the match.

New since v0.1-alpha.2: **leaning** around cover (Q / E), a limited set of **magazines** each round so reloads
matter, a **BB physics** pass (BBs take time to fly, slow down and drop at range), accuracy that depends on
your stance and movement, a crosshair that matches where shots land, graphics quality presets, support for
ramps and raised floors (no map uses them yet), automatic checks on every change, and nine bug fixes from a
code-wide bug pass.

---

## How to play it on your computer (step by step)

You need a desktop computer (Windows, Mac or Linux) and **Chrome, Firefox or Edge**. The first-time
setup takes about 5 minutes.

### 1. Install Node.js (one time only)

Go to **https://nodejs.org**, download the **LTS** version (22 or newer), and install it with the default options.
(The game uses Node.js to run a small local web server; nothing is installed into your browser.)

### 2. Download the game

Download v0.1-alpha.3 as a ZIP file:

**https://github.com/ggbillyjoe3526/Airsoft/archive/refs/tags/v0.1-alpha.3.zip**

Unzip it somewhere easy to find, for example your Desktop. You'll get a folder called `Airsoft-0.1-alpha.3`.
(Older versions are on the **Releases / Tags** page of the repository.)

(If that link doesn't work, open **https://github.com/ggbillyjoe3526/Airsoft**, click the green **Code**
button, then **Download ZIP**. The folder will then be called `Airsoft-main`; use it the same way.)

### 3. Open a terminal in that folder

- **Windows:** open the unzipped folder (`Airsoft-0.1-alpha.3`, or `Airsoft-main` if you used the Download ZIP
  button), click the address bar at the top of the window, type `cmd` and press Enter.
- **Mac:** right-click the unzipped folder (`Airsoft-0.1-alpha.3` or `Airsoft-main`) and choose **New Terminal at Folder**.
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

Open **http://localhost:5173** in Chrome, Firefox or Edge, click **Start**, then **Play**.

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
| Black screen or "The game couldn't start" | Update your browser and graphics driver; the game needs WebGL2 (any recent Chrome, Firefox or Edge has it). |
| "Something went wrong" | The game stopped on an error. Press Copy Report, post the report with what you were doing, then Reload. |
| Clicking doesn't capture the mouse | Wait a second and click again (browsers refuse to re-capture the mouse right after Esc). |
| It feels slow | Close other heavy tabs and apps; press `` ` `` or F3 to see the frame rate. |

---

## How to play

- **Goal:** pick a mode on the New game screen (**Start**, then **Mode**). First team to 5 round wins takes the match
  (the **Match** button changes that: rounds to win, round time, 1v1 to 3v3, friendly fire and whether ricochets count).
  - **Elimination:** knock out every player on the other team. If the clock runs out, the round is a draw.
  - **Attack / Defend:** each team has a flagpole in its half. Each round one team attacks the other's pole: stand by it
    (inside the painted ring) for 5 s to raise your flag and win the round. Defenders standing by the pole pull
    the flag back down; with both teams at the pole the flag doesn't move. The defenders win if the clock runs
    out (if attackers are still at the pole then, play goes on in overtime, up to 15 s, until they leave or
    finish), and knocking out the whole other team wins in either role. Your team attacks first; sides swap after
    round 4. The strip under the scoreboard shows how far up the flag is, and a marker shows where the pole is.
    The mode, the match rules, the bot difficulty and your loadout are picked between matches, on the New game screen.
- **One hit = out.** When a BB hits you, you hear a sharp "tick", see where it came from, raise your hand
  and walk off to the dead zone. While out, you watch your teammates (click to switch).
- **BBs are real projectiles:** they take time to fly (about half a second across the map), slow down and drop at
  range, so lead moving targets and aim a little high far away. The AEG shoots heavier 0.25 g BBs at about a joule;
  the gas pistol lighter 0.20 g BBs, slower, so it drops off sooner.
- **Magazines are limited:** each replica carries a few magazines a round. A reload swaps in your fullest spare and
  the old one goes back in the pouch with whatever is left in it, so reloading early has a cost. The small
  gauges next to your BB count show each spare magazine (the yellow one is next); nothing refills until the next
  round. Pressing R when no spare has more BBs does nothing, and the HUD says so.
- **Friendly fire counts,** like at a real site, so watch your teammates (unless you turn it off under **Match**).
- **BBs bounce** off concrete and steel (crates soak them up). By default a ricochet that hits you only ticks you and you
  play on; **Match**, **Ricochets count** makes it knock you out, as some fields rule.
- **Sprinting** carries your replica: you can't shoot until a moment after you stop.
- **Footsteps give you away.** Running and sprinting are heard by you and the bots (sprinting from further away);
  walking (Shift) and moving crouched are silent. Listen for enemies the same way.
- **Bot difficulty** (Easy, Normal, Hard) is picked on the New game screen, one level for your opponents and one for
  your bot teammates. On Normal, a bot's first BBs up close can miss, and
  moving targets are harder for bots to hit.
- **Tutorial:** new to the game? The title screen's **Tutorial** walks you through the basics on the practice range,
  one short step at a time (moving, shooting, BB drop, reloading, aiming, crouching, leaning, switching replicas), each
  finished by doing it. After the last step you stay on the range to practise.
- **Practice range:** the title screen's **Practice Range** puts you alone on a walled range with three lanes of
  targets at 10 to 60 m: white steel plates that ring and swing when hit, and standing and crouched plywood figures
  that fall back and stand up again. Painted lines and boards on the walls mark the distances, the readout at the top
  says how far your last BB went and what it hit, and your spare magazines stay full (you still reload). Press Esc
  for the **Loadout**: change a replica, BB weight, hop-up or part and you're back on the range where you stood.
- **Loadout, before a match:** the Loadout screen (**Start**, then **Loadout**) fits the rifle's optic (iron sights, a red dot or a 2× scope) and
  sets each replica's **hop-up**: the backspin that keeps a BB flying flat. Out of the box the rifle is on target to
  about 38 m and the pistol to about 25 m; turn it up too far and BBs rise and float. It also picks each replica's
  **BB weight** (0.20 to 0.28 g): heavier BBs leave slower, carry a little further and need more hop. The rifle takes a
  vertical or angled **grip**, and each replica a choice of **magazines** (a hi-cap or low-cap rifle magazine, an
  extended pistol one): each is a trade-off, spelled out in numbers under it. Gas type and skins are listed too, marked
  LATER: they come in later updates.

### Controls

| Key | Action |
|---|---|
| W A S D | Move |
| Mouse | Aim |
| Left click | Fire (on the AEG rifle: one BB per click in Semi, three in Burst, hold in Auto; the pistol fires one per click). Fire and aim can be moved to any key or mouse button, side buttons included (**Settings**, **Key Bindings**). |
| B | Fire mode: step the AEG rifle through Semi, Burst and Auto (the pistol is semi only) |
| Right click (hold, or toggle) | Aim down sights: only with an optic fitted (pick **Red dot** for the rifle on the Loadout screen). Narrows the view a little, slows you to a quiet walk and has its own **Aiming sensitivity** setting. **Settings**, Controls, can make it a toggle. |
| Shift | Walk: slow and silent (no footsteps), for sneaking and holding angles |
| Left Alt | Sprint (forward only; hold, or a toggle under **Settings**, Controls) |
| C | Crouch: press to go down, again to stand (sprint or jump also stands you up). **Settings**, Controls, can switch it to hold. |
| Q / E (hold) | Lean left / right: peek around cover (leaning slows you to a quiet walk and stops sprinting) |
| Space | Jump (small hop) |
| R | Reload (an empty trigger pull also reloads) |
| 1 / 2 or mouse wheel | Switch between AEG rifle and gas pistol |
| Left click while out | Watch the next player still in play (the fire button) |
| Esc | Pause (releases the mouse): Resume, Settings (keys are under **Key Bindings**) or Quit. |
| `` ` `` or F3 | Frame rate and debug info |
| ] | Debug: show BB flight paths |

---

## What's in v0.1-alpha.3 and what isn't

**In:** one map (Depot), two replicas (AEG rifle, gas pistol), BB ballistics with hop-up, one-hit
elimination with hit calling, two modes (Elimination; Attack / Defend with a flagpole, overtime and a
half-time swap), bots at three difficulty levels (patrol, spot, react, shoot, take cover, crouch-peek over low
cover, move as a team, search, hunt, hear footsteps, hold and retake the pole), 3v3 matches with a round clock
and first-to-5 scoring, walk/run/sprint, rebindable keys, synthesised sounds with footsteps, reload
animations, hit reactions and a minimal HUD.

**Added in v0.1-alpha.3 (Phase 3, tagged 2026-10-03):** leaning (Q / E), a set of magazines per round with
meaningful reloads, a BB physics pass, accuracy by stance and movement, support for ramps and raised floors,
a crosshair that matches where shots land, render quality presets (`?quality=low|medium|high`, see below) and a
code-wide bug pass (nine fixes).

**Next (Phase 4, the last alpha phase):** weapon handling from the owner's playtest (fire modes, faster reloads,
crouch toggle, steadier aim when still, optics with aiming down sights), a reworked Depot, an audio rework, then
art, menus and settings, and a short tutorial. Progress and plans: [`docs/ROADMAP.md`](docs/ROADMAP.md).

**Version names:** the game is being built as **v0.1**. Alpha releases (`v0.1-alpha`, `v0.1-alpha.2`,
`v0.1-alpha.3` …) come first. Beta releases (`v0.1-beta` …) follow once it's feature complete, and **v0.1** is
the first public release. More modes, maps, replicas, loadouts and customisation come in later versions.

**Branches:** `main` holds the latest stable release (for now, that includes alpha releases). Every change
arrives as a pull request that the owner reviews and merges. Later, development
moves to an `alpha` branch and testing to a `beta` branch, and `main` only receives tested releases.

**Every change, by release:** [`CHANGELOG.md`](CHANGELOG.md). **Everything the game has today, by area:**
[`docs/FEATURES.md`](docs/FEATURES.md). Player-facing notes per release: [`docs/patch-notes/`](docs/patch-notes/).

**Not yet:** more maps or replicas, downloaded (CC0) art (the art so far is generated in code), and the menu items
marked LATER (gas type, skins, voices for hit calls and squad orders).
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
npm run test:browser  # browser smoke test of a production build (Chromium)
npm run check:all  # check, then the browser smoke test
npm run gate -- --task M27   # the pipeline's gates (pipeline/README.md): build, tests, smoke, perf, scope, changelog
npm run perf -- --env laptop # the perf harness: a scripted 60 s Depot match, frame times, draw calls, memory
```

The browser smoke test (`e2e/boot.spec.ts`) needs Playwright's Chromium once per machine:
`npx playwright install chromium`. It builds its own copy of the game into `dist-e2e/` and serves it on port 4180.
GitHub runs `npm run check` and the smoke test on every pull request and every push to `main`
(`.github/workflows/check.yml`).

### URL flags and diagnostics

| Flag | Builds | What it does |
|---|---|---|
| `?seed=N` | all | Plays seed N (0 to 4294967295) instead of a fresh random one. Each match in a visit has its own seed, shown on the pause screen, in the debug overlay and in crash reports; `?seed=` with it replays that match. |
| `?quality=low\|medium\|high` | all | Overrides the saved render preset (Settings → Graphics → Quality, High by default) for one visit. `medium` renders at standard resolution with smaller, harder shadows and less dust; `low` also drops shadows, antialiasing, surface relief, dust and the replica's sheen. |
| `?nolock` | dev, e2e | Plays without pointer lock (automated browsers; fire and wheel work, mouse look doesn't). |
| `?script=perf` | dev, e2e | Replaces the player with the perf harness's scripted one (`src/config/perfScript.ts`). |

On the dev server and in the smoke test's build (`npm run build:e2e`), `window.airsoft` exposes the running game; a
normal release build has none of the dev and e2e flags. The debug overlay (`` ` `` or F3, or Settings → Dev → Debug
info) shows the seed, preset, frame rate and draw calls, so presets can be compared on one machine; `]` shows the BB
paths. In any build, Settings → Dev (tick the box under the tabs) → Diagnostics → Copy puts the build, browser,
graphics card, seed, match and settings on the clipboard for a bug report.

If the game stops on an error, a "Something went wrong" pane gives the mouse back and shows a report to copy (the
same fields plus the error and its stack); a failed start shows the same pane, with advice when the browser has no
WebGL. Production builds write hidden source maps (`dist/assets/*.js.map`, not linked from the code), so a stack from
a report (`index-abc.js:1:48213`) can be read against the matching build in DevTools or with a source-map tool.

**Performance budget and baselines** (`pipeline/perf-budget.json`, `pipeline/baseline/`): the harness plays a fixed
Depot match (seed 1, the scripted player, 1920 × 1080 at pixel ratio 1, CPU throttled 4× on a laptop) for 60 s and
records frame times, draw calls, triangles, GPU memory and heap growth. Frame-time lines are judged only on a real
GPU (`--env laptop`); the cloud container and CI draw in software, so there only counts and memory are judged, and
every environment is compared with its own baseline (more than 10 % worse fails). The owner records the laptop
baseline at milestones with `npm run perf -- --env laptop --baseline` and commits it.

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

See `CLAUDE.md` for the project guide and `docs/` for design notes. `docs/PLAYTEST.md` is the step-by-step
playtest checklist.
