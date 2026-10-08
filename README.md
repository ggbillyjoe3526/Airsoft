# Airsoft 0.1 Dev 4

A browser-based, first-person team shooter built around recreational airsoft: visible BBs, one hit and you're out,
call your hit and walk off. You play single-player against bots, on a desktop browser.

**New since 0.1 Dev 3:** a fire selector and aiming down sights, a Loadout screen with parts and an Armory that pays
Field Credits, custom matches, a practice range with a tutorial, squad orders, a minimap, and a new look and sound.
Woodland, Neon Heights, Extraction and Pro bots are still in development and show only with **Settings › Dev › Dev
content** on. All changes: [`docs/patch-notes/0.1-dev.4.md`](docs/patch-notes/0.1-dev.4.md).

---

## Play it on your computer

You need a desktop computer (Windows, Mac or Linux) and **Chrome, Firefox or Edge**. Setup takes about 5 minutes.

### 1. Install Node.js (one time only)

Go to **https://nodejs.org**, download the **LTS** version (22.12 or newer) and install it with the default options.
The game uses Node.js to run a small local web server; nothing is installed into your browser.

### 2. Download the game

Download 0.1 Dev 4 as a ZIP file:

**https://github.com/ggbillyjoe3526/Airsoft/archive/refs/tags/0.1-dev.4.zip**

Unzip it somewhere easy to find, such as your Desktop. You get a folder called `Airsoft-0.1-dev.4`. Older versions are
on the repository's **Releases / Tags** page.

If that link doesn't work, open **https://github.com/ggbillyjoe3526/Airsoft**, click the green **Code** button, then
**Download ZIP**. The folder is then called `Airsoft-main` and holds the latest work in progress, which can differ from
this guide. Use it the same way.

### 3. Open a terminal in that folder

- **Windows:** open the unzipped folder (`Airsoft-0.1-dev.4`, or `Airsoft-main` if you used the Download ZIP button),
  click the address bar at the top of the window, type `cmd` and press Enter.
- **Mac:** right-click the unzipped folder and choose **New Terminal at Folder**.
- **Linux:** right-click inside the folder and choose **Open in Terminal**.

### 4. Install and start the game

Type these two commands, pressing Enter after each one:

```
npm install
npm run dev
```

The first downloads the game's building blocks (about a minute, needs internet, only needed the first time). The
second starts the game and prints an address.

### 5. Play

Open **http://localhost:5173** in Chrome, Firefox or Edge, click **Start**, then **Play**.

To stop the game, go back to the terminal and press **Ctrl+C**. To play again later, repeat step 3 and run
`npm run dev` (no need for `npm install` again).

### Optional: the faster "release" version

The steps above run the development version. For the optimised build, which loads slightly faster:

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
| "Something went wrong" | The game stopped on an error. Press **Copy Report**, post the report with what you were doing, then **Reload**. |
| "Airsoft is open in another tab" | Only one tab can save at a time. Close the other tab, or press **Play here** to move the game to this one. |
| Clicking doesn't capture the mouse | Wait a second and click again (browsers refuse to re-capture the mouse right after Esc). |
| It feels slow | Close heavy tabs and apps, lower **Settings › Graphics › Quality**, and press `` ` `` or F3 for the frame rate. |
| The title screen warns about hardware acceleration | Turn hardware acceleration on in the browser's settings, then restart it. |
| No sound | The browser blocked audio. Allow sound (autoplay) for the site in its settings. |

---

## How to play

- **Goal.** On the New game screen (**Start**) pick a map, a mode and the bot difficulty, then **Play**. The first team
  to win 5 rounds takes the match; **Match** changes the rules (rounds to win, round time, 1v1 to 3v3, friendly fire,
  ricochets).
  - **Elimination.** Knock out every player on the other team. If the clock runs out, the round is a draw.
  - **Attack / Defend.** Attackers stand inside the painted ring round the defenders' pole for 5 s to raise their flag;
    defenders at the pole pull it down. Defenders win when the clock runs out (up to 15 s of overtime if attackers are
    still at the pole), and knocking out the other team wins in either role. Your team attacks first; sides swap after
    round 4.
- **One hit = out.** You hear a sharp "tick", raise your hand and walk off to the dead zone, then watch your teammates
  (click to switch). Bots call their hits too. Friendly fire counts, as at a real site.
- **BBs are real projectiles.** They take time to fly, slow down and drop at range, and a light breeze drifts them: lead
  moving targets and aim a little high far away. BBs bounce off concrete and steel; a ricochet that hits you only ticks
  you, unless **Match › Ricochets count** is on.
- **Magazines are limited.** A reload swaps in your fullest spare, and the old one keeps what is left in it. Nothing
  refills until the next round.
- **Sound matters.** Running and sprinting are heard by you and the bots; walking (Shift) and moving crouched are
  silent. You can't shoot for a moment after a sprint.
- **Loadout.** **Start › Loadout** (or Esc in a match) sets your replicas; right-click one to **Customise** it: optic,
  hop-up, BB weight, grips, barrels, a silencer, magazines and batteries. Every choice is a trade-off, shown in numbers.
- **Armory (beta, free).** Field Credits come from matches you take part in, more for a win. Spend them on Tokens, then
  take Shots, each a random draw of replicas and parts. An Epic or better is guaranteed within 20 Shots and a Legendary
  within 100. Nothing is ever sold.
- **Tutorial and Practice range.** The title screen's **Tutorial** teaches the basics in short coached steps (skip it,
  or resume it from the pause screen). **Practice range** puts you alone on a range with targets at 10 to 60 m.
- **Squad orders and minimap.** Hold Z for the order wheel, or press F, X or V for Follow me, Hold here or Regroup. The
  minimap shows your teammates, and the other team where you last heard them.
- **Dev content.** **Settings › Dev** (tick **Dev settings** under the list) has a **Dev content** switch for maps,
  modes and gear still being built. Matches that use them aren't recorded and pay no Field Credits.
- **Your save** (settings, collection, records) lives in your browser. **Settings › Save** downloads it as a file and
  loads it back, and keeps a restore point each day.

### Controls

Every action can be rebound under **Settings › Key Bindings**, mouse buttons and wheel included, with a second key each.

| Key | Action |
|---|---|
| W A S D (or arrows) | Move |
| Mouse | Aim |
| Left click | Fire (AEG rifle: one BB per click on Semi, three on Burst, hold on Auto; the pistol fires one per click) |
| B | Fire mode: step the AEG rifle through Semi, Burst and Auto |
| Right click (hold, or toggle) | Aim down sights: needs an optic, such as the red dot fitted in Loadout. Slows you to a quiet walk; has its own **Aiming sensitivity** |
| Shift | Walk: slow and silent, for sneaking and holding angles |
| Left Alt | Sprint (forward only; hold, or a toggle under **Settings › Controls**) |
| C | Crouch: press to go down, again to stand (can be set to hold) |
| Q / E (hold) | Lean left / right to peek round cover (slows you to a quiet walk) |
| Space | Jump (a small hop) |
| R | Reload (an empty trigger pull also reloads) |
| 1 / 2 or mouse wheel | Switch between your primary and secondary replica |
| Tab (hold) | Scoreboard |
| Z (hold), F, X, V | Squad order wheel; Follow me, Hold here, Regroup (press again to cancel) |
| G (hold) | Use: open a case in Extraction (dev content) |
| T | Weapon torch on and off (dev content) |
| F10 | Fullscreen |
| Left click while out | Watch the next player still in play |
| Esc | Pause: Resume, Loadout, Settings or Quit |
| `` ` `` or F3 | Frame rate and debug info |
| ] | Debug: show BB flight paths |

---

## What's in 0.1 Dev 4

- **Maps.** Depot, a 50 × 32 m warehouse yard. Woodland and Neon Heights are in development.
- **Modes.** Elimination and Attack / Defend, under Skirmish or Custom rules. Extraction, Tournament and Pro CQB are in
  development.
- **Replicas.** AEG rifle, gas pistol and the rare Cyber Pistol, with optics, grips, barrels, a silencer, magazines and
  batteries.
- **Bots.** Easy, Normal and Hard. Pro is in development.

**Not yet:** grenades, replica skins and voices for hit calls (marked Later in the menus), and downloaded art: all art
so far is drawn in code and all sounds are synthesised. The game is single-player against bots; no multiplayer is
planned. Bot difficulty and Attack / Defend balance still need tuning from playtesting. Known rough edges:
[`docs/KNOWN_ISSUES.md`](docs/KNOWN_ISSUES.md).

**Version names.** The game is built as **0.1**: Dev releases (0.1 Dev 1, 0.1 Dev 2 …) first, Beta releases (0.1 Beta 1
…) once it is feature complete, then **0.1.0**, the first public release. More modes, maps, replicas and customisation
come in later versions.

**More.** Plans: [`docs/ROADMAP.md`](docs/ROADMAP.md). How to test: [`docs/PLAYTEST.md`](docs/PLAYTEST.md). Every change
by release: [`CHANGELOG.md`](CHANGELOG.md) and [`docs/patch-notes/`](docs/patch-notes/). What the game has today:
[`docs/FEATURES.md`](docs/FEATURES.md). Every change arrives as a pull request that the owner reviews and merges; the
tagged commits on `main` are the releases.

---

## For developers

Requirements: Node.js 22.12+ (or 24 LTS).

```bash
npm install
npm run dev                  # development server with hot reload
npm run t                    # fast unit tests, dots and failures only
npm run t:all                # all unit tests
npm run check                # unit tests, then type check and production build
npm run build                # static site in dist/ (relative paths; any static host; see Hosting)
npm run preview              # serve dist/ locally
npm run test:browser         # browser smoke test of a production build (Chromium)
npm run check:all            # check, then the browser smoke test
npm run gate -- --task <id>  # the pipeline's gates: build, tests, smoke, perf, scope, changelog
npm run perf -- --env laptop # the perf harness: a scripted 60 s match, frame times, draw calls, memory
```

The browser smoke test needs Playwright's Chromium once per machine: `npx playwright install chromium`. It builds the
game in `e2e` mode into `dist-e2e/` (port 4180; specs in `e2e/`) and plays the release build in `dist/` with the real
pointer lock (port 4182; `e2e/release.spec.ts`). Each build is made once per source and reused
(`pipeline/build-cached.mjs`). GitHub runs the pipeline's gate script on every pull request and every push to `main`
(`.github/workflows/check.yml`, `pipeline/README.md`).

### Hosting

`npm run build` writes a static site to `dist/` with relative paths, so any static host serves it from any folder. Next
to every compressible file it also writes a Brotli copy (`.br`) and a gzip copy (`.gz`) at the strongest settings (the
physics chunk: 4.3 MB as is, about 1.2 MB Brotli, 1.6 MB gzip). A host that serves precompressed files sends the `.br`
to a browser that accepts Brotli (all current Chrome, Firefox and Edge do over HTTPS) and the `.gz` to one that only
takes gzip, with `Content-Encoding` set and the original file's `Content-Type`. Netlify, Cloudflare Pages and Vercel
compress on their own instead, and GitHub Pages serves gzip only. On a server you run yourself:

- **nginx:** `brotli_static on;` (the `ngx_brotli` module) and `gzip_static on;` in the game's `location`.
- **Caddy:** `file_server { precompressed br gzip }`.
- **Apache:** `mod_rewrite` rules that serve `file.js.br` for `file.js` when `Accept-Encoding` has `br`, with
  `AddEncoding br .br` and the `.js` type kept (the same for `.gz`).

Hosts that ignore the copies still serve the plain files; uploading them costs only disk space. The source maps
(`*.js.map`) can be left off a public upload.

### URL flags and diagnostics

| Flag | Builds | What it does |
|---|---|---|
| `?seed=N` | all | Plays seed N (0 to 4294967295) instead of a random one. Each match has its own seed, shown on the pause screen, in the debug overlay and in crash reports. |
| `?quality=low\|medium\|high\|ultra\|custom` | all | Overrides the saved preset (**Settings › Graphics › Quality**) for one visit. |
| `?perf` | all | Logs how long each part of a match build takes to the console. |
| `?nolock` | dev, e2e | Plays without pointer lock (automated browsers; fire and wheel work, mouse look doesn't). |
| `?script=perf` | dev, e2e | Replaces the player with the perf harness's scripted one (`src/config/perfScript.ts`). |

On the dev server and in the smoke test's build (`npm run build:e2e`), `window.airsoft` exposes the running game; a
release build has none of the dev and e2e flags. The debug overlay (`` ` `` or F3, or **Settings › Dev › Debug info**)
shows the seed, preset, frame rate and draw calls; `]` shows BB paths. In any build, **Settings › Dev › Diagnostics ›
Copy** puts the build, browser, graphics card, seed, match and settings on the clipboard for a bug report.

A crash shows a "Something went wrong" pane with a report to copy (a failed start shows the same pane). Production
builds write hidden source maps (`dist/assets/*.js.map`, not linked from the code), so a stack from a report can be read
against the matching build in DevTools. The performance budget and baselines (`pipeline/perf-budget.json`,
`pipeline/baseline/`) are described in `pipeline/README.md`.

### Layout

```
src/ai        bots: perception, aim, cover, decisions, squad orders
src/audio     synthesised sound: engine, mix, replica sounds, ambience
src/config    tuning data: movement, physics, replicas, bots, rules, render, audio
src/core      fixed-timestep loop, seeds, frame pacing, crash reports
src/input     keyboard, mouse and pointer lock → commands
src/map       map data (Depot, Woodland, Neon Heights), lighting, foliage
src/nav       walkability grid and route finding
src/physics   Rapier wrapper: level collision, character controller, ray casts
src/pool      the asset pool, collection, Armory, bot kits, supply events
src/render    Three.js presentation: maps, replicas, characters, BBs, effects, cameras
src/save      guarded storage, save file, restore points, tab lock
src/sim       pure simulation: plain-data state, fixed 60 Hz tick, commands, BBs, hits, rounds
src/settings  saved settings
src/stats     match stats and records
src/tutorial  the coached tutorial
src/ui        menus, HUD, scoreboard, minimap, hit feedback, debug overlay
e2e           browser tests (Playwright)
pipeline      gate script, perf harness, agent scripts
docs          design notes, roadmap, process, playtest guide
pool.md       every item, its rarity and the economy (hand-editable)
stats.md      how every replica and part performs (hand-editable)
```

See `CLAUDE.md` for the project guide and `docs/` for design notes. `docs/PLAYTEST.md` is the step-by-step playtest
checklist.

## Licence

The code is released under the [MIT licence](LICENSE). Third-party assets and libraries keep their own licences; every
external asset is listed with its licence in [docs/ASSETS.md](docs/ASSETS.md).
