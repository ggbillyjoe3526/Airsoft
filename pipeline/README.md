# The build pipeline

How a task gets built, checked, recorded and merged (owner's design, approved 2026-10-04). Scripts are here, the
agents in `.claude/agents/`, the step list in `.claude/skills/pipeline/SKILL.md`, the open tasks in `docs/TASKS.md` and
each finished task's record in `docs/records/`.

## Roles

| Role | Where | Model / effort | Edits |
|---|---|---|---|
| Coordinator | the project's persistent session, plus a planning thread per batch (Fable 5.1, high) | | `docs/TASKS.md`, `docs/ARCHITECTURE.md` › Contracts |
| Worker | the build thread itself (one task per thread); `.claude/agents/worker.md` only when a thread splits its task | Opus 5.5 high for `tier: core`; Sonnet 5.5 medium for `tier: ui` and `tier: trivial` | the task's `touches`, tests, docs |
| QA | `.claude/agents/qa.md`; reads the review packet first | Sonnet 5.5 medium | tests only (commit trailer `Agent: qa`; the gate checks); its report to `pipeline/out/qa-artifacts/qa-report.md` |
| Performance | `.claude/agents/performance.md`; only when the perf gate fails | Sonnet 5.5 medium; Opus 5.5 high when a regression stays unexplained | nothing (writes under `pipeline/out/`) |
| Triage | `.claude/agents/triage.md`; only for what the gate's failures summary can't place | Haiku 5.5 low | nothing (summaries under `pipeline/out/qa-artifacts/`) |
| Critic | `.claude/agents/critic.md`; reads the review packet first | Sonnet 5.5 medium; Opus 5.5 for `tier: core` and near misses on a judgment check | nothing (`pipeline/out/critic.md`; its verdict goes in the task's record) |
| Changelog | `.claude/agents/changelog.md`; reads only `Unreleased` and one FEATURES heading | Haiku 5.5 low | `CHANGELOG.md`, `docs/FEATURES.md`, `docs/patch-notes/`, README's "New since" |

Tiers: `core` is the simulation, physics, rendering, bots, navigation, audio engine; `ui` is menus, HUD, settings,
config, asset loading, docs; `trivial` is a one-constant change, a wording fix, a docs-only change.

## The eight steps

1. **Plan**, once per batch: a planning thread turns the owner's list into task blocks (below), updates the Contracts
   section of `docs/ARCHITECTURE.md` when a contract changes, and asks the owner what needs asking before any build.
2. **Build**: one thread per task, on the tier's model. Two tasks run at once only when their `touches` don't overlap.
3. **QA**: tests for every acceptance criterion, then the full suite (the gate). QA starts from the review packet.
4. **Performance**: the gate runs the harness when the diff touches `src/sim`, `src/physics`, `src/render`, `src/ai`,
   `src/nav`, `src/audio`, `src/core`, `src/map`, `src/assets`, `src/config`, `src/pool` or `vite.config.ts` (tests,
   test support and balance figures under them don't count), once for each map, mode and preset of the perf matrix the change reaches (below). The
   performance agent is spawned only when a run fails, to rank its causes (token plan item 16); a passing run's numbers
   are in the gate report and the packet, and the critic's check 3 reads the hot paths. UI-only changes skip it.
5. **Triage**: the gate script writes the structured summaries itself, the failures-only summary among them
   (`pipeline/out/failures.md`, item 19); Haiku condenses only what that can't place (a long log with no file and
   line, a trace).
6. **Gates**: `node pipeline/gate.mjs` (below). A failed gate goes straight back to the worker with the evidence.
7. **Critic**: eight binary checks (`critic.md`), only on green gates, starting from the review packet (item 15).
   `tier: trivial` tasks get a Haiku diff check.
8. **Retry**: only the failed checks and evidence go back; four attempts in all, then the owner's auto-accept rule
   (gates green, at least 6/8 with checks 1 and 2 passing, leftovers to KNOWN_ISSUES) or a report to the owner. A near
   miss is re-run on Opus first only when its failed check is a judgment, not a measured number (item 18).

Then the thread writes the task's record, `docs/records/<id>.md` (below), and ships the work and the record in one push.

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
node pipeline/gate.mjs [--task M27[,M28]] [--quick] [--no-smoke] [--perf] [--env container|laptop|ci] [--base origin/main] [--ci]
                       [--tests auto|all|fast|slow] [--shard k/n] [--only tests]
```

| Gate | Runs | Passes when |
|---|---|---|
| `build` | `build-cached.mjs --mode production --force`: `npm run build` (tsc, Vite, chunk budgets, the `.br`/`.gz` copies; not under `--quick`) | exit 0 |
| `tests` | `vitest run --reporter=json` (`src/**/*.test.ts` and the pipeline's own `pipeline/**/*.test.mjs`): project `fast`, plus `slow` when the diff reaches a bot-match guard (below; always on CI) | no failures |
| `smoke` | `playwright test`: project `chromium` runs every `e2e/*.spec.ts` but `release.spec.ts` on the e2e build (`?nolock`, `window.airsoft`); project `release` runs `e2e/release.spec.ts` on `dist/` without test flags, with the real pointer lock. Every test asserts zero console and page errors; a failure prints the test's describe path, project and line and the error's locator, expectation and call-log lines (`smokeReport.mjs`) | no failures |
| `perf` | `perf-run.mjs` once per combination of the perf matrix the diff reaches (`perfMatrix.mjs`; `--perf` runs them all) | for each: every budget line for the env and map within `perf-budget.json`, nothing more than 10 % worse than its own baseline; a baseline more than 20 commits old is a warning, not a failure |
| `scope` | the diff vs the task's `touches` (`scope.mjs`) | every changed file is in `touches`, a test, under `e2e/` or `docs/`, CHANGELOG, README or a `src/` folder's README (`pool.md` and `CLAUDE.md` only when listed); `Agent: qa` commits touch only tests |
| `changelog` | `CHANGELOG.md` › Unreleased | a line names `**<task>**` (each task, when several) |

Besides its report, every run writes the failures-only summary, `pipeline/out/failures.md` (`failures.mjs`, token plan
item 19): each failed gate with its log, then each failure's test, error (its first lines), and file and line, the
first stack frame inside the repository. It covers failed tests, test files that fail to load (a syntax error or a
missing import, which name no test), TypeScript and Vite build errors, smoke and perf failures, scope's stray files and
the changelog's missing line, and prints the same lines as each gate finishes, on CI too. An entry it can't place
says "no file and line"; only those are left for the triage agent, on a long log. Every run but CI's also writes the
review packet (`packet.mjs`, below).

`--task` takes one id or several (`FA5,FA9`) for a pull request that carries more than one task; the scope is the union
of their `touches`. A block the branch has already cleared from `docs/TASKS.md` is looked for in the branch's history
since the base.

**Which tests run** (token plan item 21). Off CI the default is `--tests auto`: the `fast` project always, the `slow`
project's headless bot-match guards only when the diff reaches a file they load (`testReach.mjs`): a guard file, any
file it imports directly or through others (`pool.md` and `stats.md` too), the test setup file, or `package.json`,
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
`index.html`, `pool.md`, `stats.md`, the Vite, TypeScript and npm files, `git describe` and, for `dist/`, whether it
has the `.br`/`.gz` copies: a `--quick` build is never reused where the release smoke test needs them). The gate's build step always
builds; the smoke test's two servers and the perf harness then reuse what is there, so one gate run makes each bundle
once. Two bundles stay necessary: the e2e one has the test hooks, the production one is what players get.

**CI** (`.github/workflows/check.yml`) runs `--ci`: build, tests and smoke on every pull request and push to `main`,
split across jobs since M50's audit (CORE-04): job `check` runs `--ci --tests fast` (the build, the fast project, the
smoke test, scope and changelog) and the three `slow` jobs `--ci --tests slow --shard k/3 --only tests` (a third of
the headless bot-match guards each, vitest's own sharding by file). `--tests all|fast|slow`, `--shard k/n` and
`--only tests` work locally too; locally without them the gate runs `--tests auto` (above).
On a pull request whose title starts with its task id(s) (`FA12: …`, `FA5 + FA9: …`), `--ci` reads the ids from the
title (`GATE_PR_TITLE`) and also runs `scope` and `changelog`, diffing the merge commit against its first parent (the
base it merges into). A title without an id, and a push to `main`, skip those two. **What runs only off CI:** the
`perf` gate (a runner has no baseline and no GPU; the worker's full gate runs it in the container), the frame-time
budget (below), and the critic. Playwright's system libraries are installed on a runner only when the cached Chromium
can't start without them.

Perf environments: `container` (SwiftShader, no GPU; frame times are noise, counts and memory are real), `laptop`
(the owner's low-spec laptop with CPU throttled 4×; the only environment whose frame times are judged), `ci` (no
baseline). **Frame-time gating is a manual owner step**: no automation runs `laptop`; the owner runs
`node pipeline/perf-run.mjs --env laptop` before a release tag (and with `--baseline` at milestones, committed).

**The perf matrix** (M76, audit CORE-03; `perf-budget.json` › `matrix`): every map (Depot, Woodland, Neon Heights) in
both modes (Elimination, Extraction) on Low, and Extraction on Medium on Woodland and Neon Heights (the heaviest
scenes the game draws; Elimination there is the same field with fewer figures and no exits or cases). A combination
runs only when the diff reaches it (`pipeline/perfMatrix.mjs`): a map's own files (`src/map/depot.ts`,
`woodland.ts`, `neonHeights.ts`, the city's props and textures) reach that map's combinations, a map's Extraction data
only its Extraction ones, Extraction's own code (`sim/extraction.ts`, `config/extraction.ts`, `ai/extraction*`, the
exit and case renderers) every map's Extraction ones, and every other perf path all eight. Tests, test support (`testSupport.ts`, `src/ai/*Support.ts`) and the balance
figures (`src/ai/balance/`) are not perf paths: they ship nothing. In the container a Low run
takes about a minute and a half and a Medium one about four, so the whole matrix is about 20 minutes on top of the gate.
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

**The laptop run** (the owner, on the target laptop, from the repository with `npm ci` done and Chrome installed):

```
node pipeline/perf-run.mjs --env laptop --preset all --baseline
```

It builds the e2e bundle, opens a Chrome window (the installed Chrome, `--channel chrome`; `--chromium <path>` for
another build) on the real GPU (no SwiftShader flags under `--env laptop`), plays the scripted Depot match on each
preset for 3600 ticks (60 s) with the CPU throttled 4×, and writes `pipeline/baseline/laptop.json`,
`laptop-medium.json`, `laptop-high.json` and `laptop-ultra.json`. Leave the window alone and the laptop plugged in;
commit the four files. From then on `node pipeline/gate.mjs --env laptop --perf` judges p95 and p99 against the budget
there, on the whole matrix: the combinations without a laptop baseline yet (every one but Depot Elimination) are judged
on their budgets alone until the owner records them (`--map`, `--mode` as above, with `--baseline`).

**The desktop run** (G5; the owner's desktop PC, where Ultra is measured at 4K, the same setup as the laptop run):

```
node pipeline/perf-run.mjs --env desktop --preset all --viewport 3840x2160 --baseline
```

The same as the laptop run without CPU throttling, at 3840×2160 at pixel ratio 1, writing `pipeline/baseline/desktop.json`
and `desktop-<preset>.json`. Its frame times are reported, not judged, until the owner sets a 4K target.

## `balance.mjs`: the bot balance report

```
node pipeline/balance.mjs [filter …]        (npm run balance; e.g. node pipeline/balance.mjs woodland)
```

Token plan item 22. Who wins (each end's and side's share of rounds, at every level and map), who lands the first
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

## `packet.mjs`: the review packet

```
node pipeline/packet.mjs [--task M27[,M28]] [--base origin/main]
```

`pipeline/out/review-packet.md` is what the critic and QA read first (token plan item 15), so they stop exploring. In
order: the task block (from `docs/TASKS.md`, or the branch's history once the records commit cleared it), the gate
summary (where the report is from, a line per gate, each perf run's numbers, and the failures when a gate failed), the
contracts of `docs/ARCHITECTURE.md` › Contracts that the task names or whose source files the diff touches (for check
2), QA's report (`pipeline/out/qa-artifacts/qa-report.md`, when its first line names the task), the file list with
each file's `+`/`−` lines, and the diff of the working tree against the merge base with 8 lines of context, untracked
files included. The change records and generated files are named in the list but their diff is left out: the task's
record, CHANGELOG, FEATURES, patch notes, the archive, TASKS (its block is quoted), `package-lock.json`, perf
baselines and light bakes. Line 2 says where the summary ends and the diff runs, and the file list gives each file's
line range in the packet, so one over the read guard's 40 KB is read by range. The diff stops at 512 KB; the files
after that are listed with the `git diff` command that shows them.

The gate writes it at the end of every run but CI's (no agent reads it there), and never fails over it. Run
`packet.mjs` alone to rebuild it after a commit, or once QA's report is in; without `--task` it takes the ids from the
last gate report.

## Task block (`docs/TASKS.md`)

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
the diff; `skip` only documents the intent). `status`: open · building · gates · critic · retry n · escalated. A task
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
```

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
  `docs/KNOWN_ISSUES.md`).

`node pipeline/records.mjs` prints the index tables (`--metrics`, `--decisions`, `--issues`; `--check` checks the
format, as the fast test suite does). Rows before 2026-10-08 are in `docs/archive/0.1-dev/METRICS.md` and
`REVIEWS.md`.
