# The build pipeline

How a task gets built, checked, recorded and merged (owner's design, approved 2026-10-04). Scripts are here, the
agents in `.claude/agents/`, the step list in `.claude/skills/pipeline/SKILL.md`, the open tasks in `docs/TASKS.md` and
each finished task's record in `docs/records/`.

## Roles

| Role | Where | Edits |
|---|---|---|
| Coordinator | the project's persistent session, plus a planning thread per batch | `docs/TASKS.md`, `docs/ARCHITECTURE.md` › Contracts |
| Worker | the build thread itself (one task per thread); `.claude/agents/worker.md` only when a thread splits its task | the task's `touches`, tests, docs |
| QA | `.claude/agents/qa.md`; every code change; reads the review packet first, tests and hunts bugs, Pass or Fail | tests only (commit trailer `Agent: qa`; the gate checks); its report to `pipeline/out/qa-artifacts/qa-report.md` |
| Performance | `.claude/agents/performance.md`; every code change; reads the review packet first, Pass or Fail, ranks the causes when the perf gate fails | nothing (its report to `pipeline/out/performance.md`) |
| Triage | `.claude/agents/triage.md`; only for what the gate's failures summary can't place | nothing (summaries under `pipeline/out/qa-artifacts/`) |
| Critic | `.claude/agents/critic.md`; every code change, last; reads the review packet first | nothing (`pipeline/out/critic.md`; its verdict goes in the task's record) |
| Changelog | `.claude/agents/changelog.md`; reads only `Unreleased` and one FEATURES heading | `CHANGELOG.md`, `docs/FEATURES.md`, `docs/patch-notes/`, README's "New since" |

Which model and effort each role runs on is policy: `docs/PROCESS.md` › Models.

Tiers: `core` is the simulation, physics, rendering, bots, navigation, audio engine; `ui` is menus, HUD, settings,
config, asset loading, docs; `trivial` is a one-constant change, a wording fix, a docs-only change; `fix` is a Beta
fix to what already exists (a bug, a balance or tuning value, a HUD or menu fault) that adds nothing new. A fix runs
every gate and all three review agents like any code change, with a lighter record and change notes
(`.claude/skills/pipeline/SKILL.md` › A `tier: fix` task; why: `docs/PROCESS.md` › The pipeline).

**The review agents.** QA, performance and the critic review every change that touches code, config, assets or
gameplay data, inside the pipeline or not (the owner's rule: `docs/PROCESS.md` › Pull requests and branches). A
docs-only change skips them: every file Markdown, and at the root only README, CHANGELOG and CLAUDE.md, since the other
root `.md` files are game data the build reads. CI's `review` gate checks the pull request's `Review:` line (below).

Audits and major reviews are not pipeline tasks: they run in their own thread and hand their fixes on as tasks.

## The eight steps

1. **Plan**, once per batch: a planning thread turns the owner's list into task blocks (below), updates the Contracts
   section of `docs/ARCHITECTURE.md` when a contract changes, and asks the owner what needs asking before any build.
2. **Build**: one thread per task, on the tier's model. Two tasks run at once only when their `touches` don't overlap.
3. **QA**: tests for every acceptance criterion, then the full suite (the gate). QA starts from the review packet.
4. **Performance**: the gate runs the harness when the diff touches `src/sim`, `src/physics`, `src/render`, `src/ai`,
   `src/nav`, `src/audio`, `src/core`, `src/map`, `src/assets`, `src/config`, `src/pool` or `vite.config.ts` (tests,
   test support and balance figures under them don't count), once for each map, mode and preset of the perf matrix
   the change reaches (below); UI-only changes skip the harness. The performance agent then reviews every code change
   from the packet (frame time, per-frame allocations, GPU disposal, the budgets) with a Pass or Fail verdict, and
   ranks the causes when a run fails (owner, 2026-10-16).
5. **Triage**: the gate script writes the structured summaries itself, the failures-only summary among them
   (`pipeline/out/failures.md`), so no model reads a raw log it can place; Haiku condenses only what it can't (a long
   log with no file and line, a trace).
6. **Gates**: `node pipeline/gate.mjs` (below). A failed gate goes straight back to the worker with the evidence; the
   critic never sees it.
7. **Critic**: eight binary checks (the table is in `.claude/agents/critic.md`), only on green gates, starting from the
   review packet, so it reads the summary and the diff rather than exploring the repository, with QA's and the
   performance agent's verdicts in it. Every code change gets it; a docs-only `tier: trivial` task gets a Haiku diff
   check instead. The verdict and what follows it are below.
8. **Retry**: only the failed checks and their evidence go back to the worker, and the attempt rule below applies.

Then the thread runs the changelog agent once the change is final (every pull request, the task's id under
`Unreleased`, which the `changelog` gate checks), writes the task's record, `docs/records/<id>.md` (below), and ships
the work and the record in one push.

### Verdict and attempts

- **Accept** when every blocking check passes, at most one non-blocking check fails, and QA and performance both say
  Pass; the score is the checks passed, out of 8. Otherwise **Retry** with only the failed checks and their evidence.
- **Near miss.** A verdict one check short of Accept is re-run on Opus before the task goes back when its failed check
  is a judgment (checks 5 to 8, or one of 1 to 4 decided by reading). A check failed on a measured number (a budget, a
  count) goes straight back, or to the owner when only a changed criterion can pass it: a re-run can't change a number.
- **Four attempts** per task: one build plus three targeted retries. After the fourth, gates green and at least 6 of 8
  with checks 1 and 2 passing is an **auto-accept** (owner, 2026-10-04; the `Review:` line reads `critic auto-accept
  <score>`), and every failed check goes to `docs/KNOWN_ISSUES.md`. Otherwise stop, keep the best attempt on its branch
  and report to the owner what failed and what each attempt tried.

## `bake-light.mjs`

`node pipeline/bake-light.mjs [map …]` bakes the bounce light of every map that opts in (`MapData.bakedLight`, G6) and
writes its probe file, `src/map/bakes/<file>.probes.b64` (Node only, through Vite's module runner; about two seconds
for Depot). Run it after changing a baked map's blocks or tints, the day lighting or `config/bake.ts`'s `bake` values:
`src/map/bakes/bakes.test.ts` fails, naming the command, until the file matches. The same map gives the same bytes.

## `cycles.mjs`

`node pipeline/cycles.mjs` lists the import cycles among the modules under `src/` and exits 1 if there are any (audit
CORE-08). Value imports and re-exports count; `import type`, `export type` and dynamic `import()` don't. Its test,
`cycles.test.mjs`, runs in the fast suite (so in the gate's `tests`) and fails, naming the files, on a new cycle.

## `gate.mjs`

```
node pipeline/gate.mjs [--task M27[,M28]] [--quick] [--no-smoke] [--env container|laptop] [--base origin/main] [--ci]
                       [--tests auto|all|fast|slow] [--shard k/n] [--only tests|smoke]
```

### Options

| Option | What it does | Who uses it |
|---|---|---|
| `--task <id>[,<id>]` | The task(s) whose block the scope gate reads and whose changelog line it wants; without it, on CI, the ids the pull request's title starts with, else none (scope and changelog skipped) | build threads |
| `--quick` | Build and tests only, the build without the `.br`/`.gz` copies | build threads while working, `worker.md` |
| `--no-smoke` | Every gate but the smoke test | CI's `check` job |
| `--env container\|laptop` | Where the perf harness runs (`container` by default, `ci` under `--ci`); `laptop` judges frame times and runs the whole perf matrix | the owner on the laptop |
| `--base <ref>` | What the diff is taken against (`origin/main` by default) | CI (`HEAD^1`, the pull request's base) |
| `--ci` | CI's run: no perf, no review packet, the review gate on a pull request, task ids from the title | CI |
| `--tests auto\|all\|fast\|slow` | Which vitest projects run (below); `auto` off CI, `all` on CI | build threads (`all`), CI (`fast`, `slow`) |
| `--shard k/n` | One share of the tests' or the smoke test's files | CI |
| `--only tests\|smoke` | Just that gate | CI's `slow` and `browser` jobs |

Each option is used by CI, a skill or the owner's laptop run; the old `--perf` (the whole matrix anywhere) folded into
`--env laptop`, the only run that needed it.

### Gates and reports

| Gate | Runs | Passes when |
|---|---|---|
| `build` | `build-cached.mjs --mode production --force`: `npm run build` (tsc, Vite, chunk budgets, the `.br`/`.gz` copies; not under `--quick`) | exit 0 |
| `tests` | `vitest run --reporter=json` (`src/**/*.test.ts` and the pipeline's own `pipeline/**/*.test.mjs`): project `fast`, plus `slow` when the diff reaches a bot-match guard (below; always on CI) | no failures |
| `smoke` | `playwright test`: project `chromium` runs every `e2e/*.spec.ts` but `release.spec.ts` on the e2e build (`?nolock`, `window.airsoft`); project `release` runs `e2e/release.spec.ts` on `dist/` without test flags, with the real pointer lock. Every test asserts zero console and page errors; a failure prints the test's describe path, project and line and the error's locator, expectation and call-log lines (`smokeReport.mjs`) | no failures |
| `perf` | `perf-run.mjs` once per combination of the perf matrix the diff reaches (`perfMatrix.mjs`; under `--env laptop`, all of them) | for each: every budget line for the env and map within `perf-budget.json`, nothing more than 10 % worse than its own baseline; a baseline more than 20 commits old is a warning, not a failure |
| `scope` | the diff vs the task's `touches` (`scope.mjs`) | every changed file is in `touches`, a test, under `e2e/` or `docs/`, CHANGELOG, README or a `src/` folder's README (`data/` and `CLAUDE.md` only when listed); `Agent: qa` commits touch only tests |
| `changelog` | `CHANGELOG.md` › Unreleased | a line names `**<task>**` (each task, when several) |
| `review` | on CI, a pull request's description (`GATE_PR_BODY`; `review.mjs`) | a docs-only change or a draft skips it; otherwise its `Review:` line gives `critic Accept` (or `auto-accept`), `qa Pass` and `performance Pass` |

Besides its report, every run writes the failures-only summary, `pipeline/out/failures.md` (`failures.mjs`): each
failed gate with its log, then each failure's test, error (its first lines), and file and line, the
first stack frame inside the repository. It covers failed tests, test files that fail to load (a syntax error or a
missing import, which name no test), TypeScript and Vite build errors, smoke and perf failures, scope's stray files and
the changelog's missing line, and prints the same lines as each gate finishes, on CI too. An entry it can't place
says "no file and line"; only those are left for the triage agent, on a long log. Every run but CI's also writes the
review packet (`packet.mjs`, below).

`--task` takes one id or several (`FA5,FA9`) for a pull request that carries more than one task; the scope is the union
of their `touches`. A block the branch has already cleared from `docs/TASKS.md` is looked for in the branch's history
since the base.

**Which tests run.** Off CI the default is `--tests auto`: the `fast` project always, the `slow`
project's headless bot-match guards only when the diff reaches a file they load (`testReach.mjs`): a guard file, any
file it imports directly or through others (`data/pool.md` and `data/stats.md` too), the test setup file, or `package.json`,
the lockfile, `vite.config.ts` or `tsconfig.json`. The gate's line names what ran and why (`fast project only: the
diff reaches no bot-match guard (CI runs them)`, or `both projects: src/config/bots.ts reaches the bot-match
guards`), and the record's tests cell reads `✓ 95 s (fast)` when the guards were left to CI. A HUD, menu, render,
audio, docs or pipeline change skips them; anything in the bots, the simulation, the maps or their config runs them.
`--tests all` runs both regardless. CI always runs every test, so a missed reach costs one more push, never a bug.

`--quick` is build and tests: about 10 minutes in a 4-core cloud container when the slow guards run (measured
2026-10-08: build 33 s, the 3,417 tests 9 minutes, most of it the `slow` project's bot-match guards), about 3 minutes
when they don't. Its build leaves out the `.br`/`.gz`
copies (owner decision 3 of audit 2, CORE-11: the gate sets `AIRSOFT_PRECOMPRESS=0`, which `vite.config.ts` reads),
about 9 s of Brotli a build that only the release smoke test and a host need; the full gate and CI build with them (the
gate sets `AIRSOFT_PRECOMPRESS=1` for its build and smoke steps, so a leftover `0` in the shell can't reach them). While
working, `npx vitest run --project fast` (`npm run t`) runs every unit test except the headless bot-match guards
(project `slow`: `src/ai/depotMatch*.test.ts`, `src/ai/*Match.pro*.test.ts`, `*Match.levels*`, `*Match.extraction*` and
`src/ai/proBalance.test.ts`) in about 2 minutes (2026-10-08); CI and `npm test` always run both projects
(vite.config.ts, audit CORE-15). The full
gate in a cloud container is about 20 minutes (2026-10-08: smoke 8 minutes on top of `--quick`) plus the perf run when
it is required; set `PLAYWRIGHT_CHROMIUM=/opt/pw-browsers/chromium` there. The report is
`pipeline/out/gate-report.json`, the attempt row for the task's record `pipeline/out/metrics-row.md` (`records.mjs` ›
`metricsRow`), and the logs and reports are under `pipeline/out/qa-artifacts/`; all git-ignored.

**Builds.** `build-cached.mjs` builds the production bundle (`dist/`) or the e2e bundle (`dist-e2e/`, `--mode e2e`) and
skips the build when the output is already that of the same source (a hash of `src/` without tests, `public/`,
`index.html`, `data/` (the six hand-edited tables), the Vite, TypeScript and npm files, `git describe` and, for `dist/`,
whether it has the `.br`/`.gz` copies: a `--quick` build is never reused where the release smoke test needs them). The
gate's build step always builds off CI; the smoke test's two servers and the perf harness then reuse what is there, so
one gate run makes each bundle once (on CI the reuse reaches across jobs, below). Two bundles stay necessary: the e2e
one has the test hooks, the production one is what players get.

**CI** (`.github/workflows/check.yml`) runs `--ci`: build, tests and smoke on every pull request and push to `main`,
split across jobs since M50's audit (CORE-04): job `check` runs `--ci --tests fast --no-smoke` (the build, the fast
project, scope and changelog), the four `browser` jobs `--ci --only smoke --shard k/4` (a quarter of the smoke test
each, Playwright's own sharding by file, IM6), the `firefox` job `E2E_FIREFOX=1 xvfb-run … --ci --only smoke` (the boot
and save specs in Playwright's Firefox, IN1) and the three `slow` jobs `--ci --tests slow --shard k/3 --only tests` (a
third of the headless bot-match guards each by their measured seconds, so the three finish together:
`pipeline/shards.mjs` deals the files longest first from `pipeline/slow-times.json`; refresh the table as its header
says when the jobs drift a minute apart). Since DX4 a `bundles` job builds both bundles once and hands them to `check`
and the `browser` jobs, whose builds then find the stamp matches and build nothing; on CI the gate's build step reuses a
matching stamp instead of forcing a build. `--tests all|fast|slow`, `--shard k/n` and `--only tests|smoke` work locally
too; locally without them the gate runs `--tests auto` (above). On a pull request whose title starts with its task id(s)
(`FA12: …`, `FA5 + FA9: …`), `--ci` reads the ids from the title (`GATE_PR_TITLE`) and also runs `scope` and
`changelog`, diffing the merge commit against its first parent (the base it merges into). A title without an id, and a
push to `main`, skip those two. Every pull request out of draft also runs `review` (CI passes `GATE_PR_BODY` and
`GATE_PR_DRAFT`; the workflow re-runs on `edited` and `ready_for_review`); a push to `main` skips it. **What runs only
off CI:** the `perf` gate (a runner has no baseline and no GPU; the worker's full gate runs it in the container), the
frame-time budget (below), and the three review agents themselves. Playwright's system libraries are installed on a
runner only when the cached Chromium can't start without them.

Perf environments: `container` (SwiftShader, no GPU; frame times are noise, counts and memory are real), `laptop`
(the owner's low-spec laptop with CPU throttled 4×; the only environment whose frame times are judged), `ci` (no
baseline). **Frame-time gating is a manual owner step**: no automation runs `laptop`; the owner runs
`node pipeline/perf-run.mjs --env laptop` before a release tag (and with `--baseline` at milestones, committed).

**The perf matrix** (M76, audit CORE-03; `perf-budget.json` › `matrix`): every map (Depot, Woodland, Neon Heights) in
both modes (Elimination, Extraction) on Low, and Extraction on Medium on Woodland and Neon Heights (the heaviest
scenes the game draws; Elimination there is the same field with fewer figures and no exits or cases), each on both back
ends (W6: WebGL, then WebGPU). A combination
runs only when the diff reaches it (`pipeline/perfMatrix.mjs`): a map's own files (`src/map/depot.ts`,
`woodland.ts`, `neonHeights.ts`, the city's props and textures) reach that map's combinations, a map's Extraction data
only its Extraction ones, Extraction's own code (`sim/extraction.ts`, `config/extraction.ts`, `ai/extraction*`, the
exit and case renderers) every map's Extraction ones, and every other perf path all of them (sixteen). Tests, test support (`testSupport.ts`, `src/ai/*Support.ts`) and the balance
figures (`src/ai/balance/`) are not perf paths: they ship nothing. In the container a Low run
takes about a minute and a half and a Medium one about four, so the WebGL half of the matrix is about 20 minutes on top of the gate.
Budgets are `presets.<preset>` with `maps.<map>.<preset>` over them (owner decision 4 of audit 2: map-scoped Medium
budgets for the big maps). `node pipeline/perf-run.mjs --map <map> --mode <mode> --preset <preset>` runs one by hand.

**Baselines.** One file per combination under `pipeline/baseline/`: `<env><tag>.json` on Low (the budget preset) and
`<env><tag>-<preset>.json` otherwise, where the tag is `-<map>` (not for Depot) then `-extraction` (not for
Elimination): `container.json` (Depot Elimination Low), `container-extraction.json`, `container-woodland.json`,
`container-woodland-extraction.json`, `container-woodland-extraction-medium.json`, `container-neon.json`,
`container-neon-extraction.json`, `container-neon-extraction-medium.json`; Depot's `container-medium.json` and
`container-high.json` are kept for `--preset all` but not gated. Each records the `head` it was measured on.
**Reset the baselines in the pull request that changes what they measure** (audit CORE-12): when a change moves a
combination's numbers on purpose (a trim, a new effect, a map edit), re-record that combination with `perf-run.mjs
--env container --map <map> --mode <mode> --preset <preset> --baseline` on the branch and commit the file with the
change, so the next pull request is compared with what the game now is. The gate warns (never fails) when a
baseline's head is more than `baselineMaxLag` (20) commits behind HEAD, or not in the clone's history at all.
`--preset all` runs Low, Medium, High and Ultra in turn (audit REN-15; Ultra since G5), so a change that makes High or
Ultra dearer is seen too (`--preset ultra` alone for one). `--viewport WxH` sets the page's size (default 1920x1080).

**The back end** (WebGPU overhaul W6): the game has one renderer, the node renderer, on a WebGPU device or on its own
WebGL2 back end. `--backend webgl|webgpu` (default `webgl`) picks one: it saves Graphics › Renderer as that value before
the page loads, and `webgl` adds `?forceWebGL`, the only way the node renderer runs in the container. `webgpu` in the
container and on CI launches Chromium with `WEBGPU_ARGS` (`webgpuCompare.mjs`: SwiftShader's Vulkan, a software
adapter, which only the WebGPU pick accepts). After the match starts the harness reads which back end drew; if it is not
the one asked for, the run exits 1 and writes nothing. Every result records `backend`, and a WebGPU run names its files
with it after the environment (`perf-laptop-webgpu-low.json`, baseline `laptop-webgpu.json`), beside the WebGL files.
The matrix runs each combination once per back end listed in `perf-budget.json` (an entry's `backend`, `webgl` when
absent; the log name ends `webgpu` for WebGPU, e.g. `woodland extraction medium webgpu`). Budgets are the preset's
lines, then the map's, then `backends.<id>.presets.<preset>`, then `backends.<id>.maps.<map>.<preset>`; a later line
wins; none is set today, as both back ends hold the same lines. Only the WebGL run writes `perf-<env>.json`.

**Triangles** (W6a): `triangles` is the scene's own; the GPU dressing (Woodland's grass and tree stand-ins on Medium
and up, W5) is recorded apart as `dressingTriangles` (`DrawStats.dressingTriangles`, what Three counted for those two
draws). Three counts an indirect draw from its instance count, so on WebGPU that is every slot, not what the cull kept
(on the WebGL2 back end every slot really is drawn); each preset's `dressingTriangles` line is its caps plus 2 %
(pinned by `render/webgpu/compute/gpuDressing.test.ts`). Both are in the relative check.

**The WebGPU comparison** (WebGPU overhaul W2 to W5; `webgpu-compare.mjs`, rules in `webgpuCompare.mjs`): draws fixed
camera views of every map, by day and by night where it has night, on Medium and High, with the WebGL path and with the
node renderer on its WebGL2 back end (`?forceWebGL`), figures hidden (with their contact shadows and torch beams) and
the game clock stopped. W2's and W3's views keep only the post stack's output step on both sides (tone mapping and
sRGB; no bloom, AO or other pass), so what is compared is the materials. Each pair is scored (mean absolute difference per channel, and the share of pixels with a channel more than
24 steps off) against the bar pinned in `webgpuCompare.mjs` and `webgpuCompare.test.mjs`, and saved side by side
(WebGL, node, the difference ×4 with red over the threshold) with `scores.json`. Exits 1 when a pair fails. Port 4186.

Since W6a the game has no WebGL path, so the WebGL side is the last commit that had one (`WEBGL_REFERENCE`, b10c006):
the tool checks it out once as a git worktree in the system's temporary folder (with this clone's `node_modules`
linked), builds it with `build-cached` and serves it on the next port. `--backend webgl` names the node renderer's
WebGL2 back end (`?forceWebGL`), `webgpu` the WebGPU device, `all` both; `--noise` draws the reference against itself. A WebGPU pair here is SwiftShader's software adapter, so it is judged on the pixel
share only and its retro views by eye (owner's rulings, W3 and W4; `judgedBy`), each entry recording `judged`.

W3 adds views with the figures drawn (`FIGURE_VIEWS`): first person on each map, everyone stood in rows near and far
in each state (alive, calling a hit, out, leaving) by day and night, and a torch beam at night (yours and a
team-mate's), and a second node back end: a real WebGPU device (`--backend webgpu`, SwiftShader's Vulkan through
`WEBGPU_ARGS`; its pairs end `-webgpu`), which is where the clustered night lights draw. Both pages settle the night's
lights on the stood eye and pin the fires' clock, so a pair differs only by renderer.

W4 adds post views (`--views w4`, `POST_VIEWS`, pairs named `<map>-<light>-<preset>-post-<view>`) on Low, Medium, High
and Ultra with the whole frame drawn on both sides: the ground still, a view of the sun or moon over the middle of the
map (the light shafts), first person (the held replica over the stack), the ground still through the retro filter
and, by night, a pool light close up (`glow`: by day nothing on these maps reaches the bloom's threshold, so a day view
shows nothing of Medium's stack). Each starts a new stack once its view has compiled and draws `POST_FRAMES` frames
before the grab, so both pages' temporal history, jitter and grain match. `--post-views` picks some of them; `--port`
serves on another port (another worktree's run on 4186).

W5 switches the node renderer's GPU grass and tree stand-ins off on every node page of those pairs (`?noGpuDressing`,
`NO_DRESSING`; WebGL has nothing like them), so the pairs still compare the same picture. The GPU particles stay in
them. A pair also fails when the node path draws more calls than WebGL. W5's own views (`--views w5`, `W5_VIEWS`)
draw the grass and stand-ins on the node renderer alone: Woodland by night on Medium, High and Ultra, saved as
`<map>-<light>-<preset>-w5-<view>.png` for the owner to judge by eye. In `scores.json` each records its draws and
triangles with and without them, the grass's and stand-ins' own triangles, and the GPU memory (Three's count, and what
freeing the dressing gives back). A view fails when the grass's triangles pass the preset's ceiling
(`GRASS_TRIANGLES`) or the dressing adds more than two draws.

```
PLAYWRIGHT_CHROMIUM=/opt/pw-browsers/chromium node pipeline/webgpu-compare.mjs --out <dir> [--only depot] [--quality high] [--views w2|w3|w4|w5|all] [--backend webgl|webgpu|all] [--full] [--noise] [--port 4186] [--post-views glow] [--reference <commit>]
```

`--reference <commit>` (W6b) draws a later node-renderer commit in the reference's place, both pages without the GPU
dressing: a change that should draw nothing new is checked picture for picture against the commit before it (with
`--backend webgl`). Use it where `WEBGL_REFERENCE`'s content has moved on: Woodland's layout (M88) and the figures and
held replicas (RM4) no longer match b10c006, so those views fail against it whatever the renderer does.

`--full` also scores each view with WebGL's whole post stack (what a player sees today, for reference); `--noise`
draws WebGL against WebGL (the floor of the measurement).

**The laptop run** (the owner, on the target laptop, from the repository with `npm ci` done and Chrome installed):

```
node pipeline/perf-run.mjs --env laptop --preset all --baseline
```

It builds the e2e bundle, opens a Chrome window (the installed Chrome, `--channel chrome`; `--chromium <path>` for
another build) on the real GPU (no SwiftShader flags under `--env laptop`), plays the scripted Depot match on each
preset for 3600 ticks (60 s) with the CPU throttled 4×, and writes `pipeline/baseline/laptop.json`,
`laptop-medium.json`, `laptop-high.json` and `laptop-ultra.json`. Leave the window alone and the laptop plugged in;
commit the four files. From then on `node pipeline/gate.mjs --env laptop` judges p95 and p99 against the budget
there, on the whole matrix: the combinations without a laptop baseline yet (every one but Depot Elimination) are judged
on their budgets alone until the owner records them (`--map`, `--mode` as above, with `--baseline`).

**The desktop run** (G5; the owner's desktop PC, where Ultra is measured at 4K, the same setup as the laptop run):

```
npm run perf:desktop        (node pipeline/perf-desktop.mjs [--channel msedge] [--chromium /path])
```

In a fresh download, `npm install` first: `perf-desktop.mjs` checks `perfDesktop.mjs` NEEDED_PACKAGES and says to run
it when one is missing, then builds the game once and stops with the build's own output if that fails. It runs
DESKTOP_SUITE through `perf-run.mjs --env desktop`, about 15 minutes, each failed run's error in its row: Depot
Elimination on every preset, Ultra on every map in both modes, on WebGPU (Chrome's Auto renderer) at 3840×2160 at
pixel ratio 1, then Depot Ultra on WebGL2, all with `--baseline` (`pipeline/baseline/desktop-webgpu*.json`,
`desktop-ultra.json`), and Depot Ultra at 1920×1080 with none, for the hint. `--env desktop` is the laptop run without
CPU throttling and with Chrome's frames past the screen's refresh (`UNCAPPED_ARGS`; `--vsync` keeps the cap): the
target is the 240 Hz cap's own period, so a capped run can't show headroom. It works from a download without git
(the result's `head` reads `unknown`; the thread that commits the files sets it). It prints and writes
`pipeline/out/perf-desktop-summary.md`: FPS, 1 % low, p50, p95, p99 and worst per run, whether p95 holds 240 Hz, the
GPU name, and two hints: GPU- or CPU-bound from 4K against 1080p, and frames held by vsync if the switches didn't
take. Ultra's frame times at 4K are judged against `envs.desktop.ultra` in `perf-budget.json` (the Budget column; PF3,
owner 2026-10-17): the line is the baseline of 2026-10-17 (p95 6.5 ms, p99 9 ms; WebGL2's own, 7.2 and 11.5, in
`envs.desktop.backends.webgl`), so Ultra can't get slower. The aim
stays 4K at 240 Hz, about 4.2 ms a frame (owner, 2026-10-16), which that baseline misses on every map (KNOWN_ISSUES).

## `balance.mjs`: the bot balance report

```
node pipeline/balance.mjs [filter …]        (npm run balance; e.g. node pipeline/balance.mjs woodland)
```

Who wins (each end's and side's share of rounds, at every level and map), who lands the first
hit, how often the squad gets out of Extraction and with what, and the levels' order are **balance figures**, not
pass/fail tests: noise across seeds pushed them past their bands and cost re-measure loops (M73, M74). They live in
`src/ai/balance/*.balance.ts`, vitest project `balance`, which exists only when `AIRSOFT_BALANCE` is set:
`balance.mjs` sets it, runs the figures (the filters are vitest's file-name filters) and writes
`pipeline/out/balance-report.md` and `.json` (`balanceReport.mjs`). The gate, CI and `vitest run` never run them, and
the script exits 0 whatever the figures say; 1 only when a measure could not run.

Each figure is judged against its band (the owner's rulings and the measures in each file's comments): **in band**;
**near an edge** (inside, within one standard error of an edge); **outside, within noise** (past it by under two
standard errors: re-measure on more seeds before acting); **outside** (two or more, or a plain number past its band).
A share's standard error is √(p(1−p)/n) over its rounds or runs. The whole set plays every map and mode (about 20
minutes on 4 cores, 2026-10-08: 74 figures); the bug pass runs it (`docs/PROCESS.md` › Bug pass), and a task that changes balance on
purpose runs its own filter and quotes the figures in its record.

What stays a guard in the `slow` project is what must never happen, on every seed: rounds played and settled (under 1
in 4 on time, `STALLED_ROUNDS_MAX`), bots leaving spawn, nobody falling or standing in another, no friendly fire, the
half-time swaps, the flag raised, Extraction runs ending by their rules. Where a guard played many seeds only for a
figure, it now plays four (the figure keeps the many).

## `content-check.mjs`: the content check

```
node pipeline/content-check.mjs <item|all|map:<id>|map:all|mode:<id>|mode:all|skin:<id>|skin:all> [--balance] [--public] [--maps a,b] [--seeds n] [--no-pictures] [--no-perf] [--no-browser]
```

The content toolkit's command (`docs/content/README.md`): levels 1 to 3 for a replica or part (rules, compatibility,
the spec test with pictures), and with `--balance` level 4, the balance run (one vitest process per map, in parallel).
The runners are `src/content/report/*.report.ts`, vitest project `content`, which exists only when `AIRSOFT_CONTENT`
is set. It writes `pipeline/out/content/<id>/report.md`, `report.html`, `report.json` and `pictures/`
(`contentReport.mjs` builds the page, `content-pictures.mjs` draws the pictures on the e2e build) and exits 1 on a
failed check. Levels 1 and 2 for every asset are also ordinary `fast` tests (`src/content/content.test.ts`), so every
gate and CI run keeps them. About a minute without the balance run (2026-10-11).

For a map (`map:<id>`, CT2) level 2 is its layout and the runners are `map.report.ts` and `mapBalance.report.ts` (one
process per lighting and round mode); the spec test adds `perf-run.mjs` in Elimination on Low, Medium and High, one
after another on port 4185, judged as the gate judges a run (`perfMatrix.mjs`), and `content-pictures.mjs`
`drawMapPictures`. `perf-run.mjs --map` takes a game map id or perf-budget.json's short name (`mapIds`), and its modes
are the game's own (`config/modes.ts`).

For a mode (`mode:<id>`, CT3) level 2 is its fit and the runner is `mode.report.ts`, which also plays its short headless
matches on each map that hosts it (about 30 s for Attack / Defend on three maps). The spec test adds the short match in
the browser (`e2e/modeMatch.spec.ts`, one mode on one map through `AIRSOFT_CONTENT_MODE` and
`AIRSOFT_CONTENT_MAP_LABEL`; the smoke test plays every mode on Depot) and `perf-run.mjs` in that mode on each host on
the budget preset. Its balance run is `mapBalance.report.ts` in that mode, one process per map and lighting, with
Elimination beside a round mode so `contentReport.mjs` `payResults` can set the pay a minute side by side; a run mode's
levels are set in order by `runOrderResults`. `mode:all` runs levels 1 and 2 on every mode (about 17 s).

For a skin (`skin:<id>`, CT4) level 2 is its fit and the runner is `skin.report.ts` (its rules, fit, team colours and
texture, and the pictures to draw: each claimed replica bold and Realistic). Then `content-pictures.mjs`
`measureMapPalettes` starts a match on each map and measures its colours as painted, before light (area-weighted,
in the browser), and `skinMaps.report.ts` judges the skin against them. No balance run. About two and a half minutes
for one skin on three maps (2026-10-11); `skin:all` runs levels 1 to 3 on every skin without the browser.

## `packet.mjs`: the review packet

```
node pipeline/packet.mjs [--task M27[,M28]] [--base origin/main]
```

`pipeline/out/review-packet.md` is what the critic and QA read first, so they stop exploring. In
order: the task block (from `docs/TASKS.md`, or the branch's history once the records commit cleared it), the gate
summary (where the report is from, a line per gate, each perf run's numbers, and the failures when a gate failed), the
contracts of `docs/ARCHITECTURE.md` › Contracts that the task names or whose source files the diff touches (for check
2), QA's report (`pipeline/out/qa-artifacts/qa-report.md`) and the performance agent's (`pipeline/out/performance.md`),
each when its first line names the task (or reads `Task: none` with no task), the file list with
each file's `+`/`−` lines, and the diff of the working tree against the merge base with 8 lines of context, untracked
files included. The change records and generated files are named in the list but their diff is left out: the task's
record, CHANGELOG, FEATURES, patch notes, the archive, TASKS (its block is quoted), `package-lock.json`, perf
baselines and light bakes. Line 2 says where the summary ends and the diff runs, and the file list gives each file's
line range in the packet, so one over the read guard's 40 KB is read by range. The diff stops at 512 KB; the files
after that are listed with the `git diff` command that shows them.

The gate writes it at the end of every run but CI's (no agent reads it there), and never fails over it. Run
`packet.mjs` alone to rebuild it after a commit, or once QA's or the performance agent's report is in; without `--task` it takes the ids from the
last gate report.

## Task block (`docs/TASKS.md`)

A worked example (indented here so `grep '^#'` lists no example as a task; in `docs/TASKS.md` each line starts at the
margin):

```
  ## M27 · probeGround without a per-tick allocation
  tier: core
  perf: required
  touches: src/physics/physicsWorld.ts, src/physics/physicsWorld.test.ts
  contract: CharacterMover
  acceptance:
    1. ...
    2. ...
  status: open
  attempts: 0
```

`touches` lists files, or folders with a trailing slash. `perf` is `required` or `skip` (the gate still decides from
the diff; `skip` only documents the intent). `tier` is `core`, `ui`, `trivial` or `fix` (Roles,
above). `status`: open · building · gates · critic · retry n · escalated. A task
that lands leaves the file: the records step deletes its block (no `done` blocks stay behind).

The pull request's title starts with the task id(s), `<id>: …` or `<id> + <id>: …`, so CI can run the scope and
changelog gates.

## Pull request description

Attribution block first (the project's rule), then:

```
Before: <what a player saw>

After: <what a player sees>

<one sentence on what the change does, if not obvious>

How: <a short paragraph>

Pipeline: attempts <n> · gates <build ✓ tests ✓ smoke ✓ perf ✓/–> · critic <score> · <link to the run folder>

Review: critic Accept <score>/8 · qa Pass · performance Pass
```

The `Pipeline:` line is for pipeline tasks only. The `Review:` line is on every pull request that touches more than
docs, and CI's `review` gate fails without it once the pull request is out of draft; each agent's blocking findings
and how they were fixed go in the description's Verified section or the task's record.

## The task's record (`docs/records/<id>.md`)

One file per task, written by the thread in the records step (`docs/records/README.md` has the format):

- **Review line:** attempts, score out of 8, verdict and the critic's model, in one fixed short line.
- **Attempts:** one row per attempt: the date, the worker model, each gate's result and seconds, the critic's score,
  the retry reason, the wall time, and the token totals the harness reports for each spawned worker (the Agent tool's
  completion notice carries one per worker). The gate writes the date and gate cells (`pipeline/out/metrics-row.md`);
  the thread fills the rest. The build thread's own tokens show only when its session reports them, and the
  coordinator's never; the owner's usage page is the only complete view. Pass rate per tier is what decides whether a
  tier's model is right.
- **Decisions** the task made for itself, and the **known issues** it left (each also a row in
  `docs/KNOWN_ISSUES.md`). A `tier: fix` record may leave out the Known issues section when there are none.

`node pipeline/records.mjs` prints the index tables (`--metrics`, `--decisions`, `--issues`; `--check` checks the
format, as the fast test suite does). Rows before 2026-10-08 are in `docs/archive/0.1-dev/METRICS.md` and
`REVIEWS.md`.
