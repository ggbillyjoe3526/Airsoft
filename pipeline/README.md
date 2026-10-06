# The build pipeline

How a task gets built, checked and merged (owner's design, approved 2026-10-04; proposal in the project's shared
files, `pipeline/pipeline-proposal.md`). Scripts here, agents in `.claude/agents/`, the step list in
`.claude/skills/pipeline/SKILL.md`, open tasks in `docs/TASKS.md`.

## Roles

| Role | Where | Model / effort | Edits |
|---|---|---|---|
| Coordinator | the project's persistent session, plus a planning thread per batch (Fable 5.1, high) | | `docs/TASKS.md`, `docs/ARCHITECTURE.md` › Contracts |
| Worker | the build thread itself (one task per thread); `.claude/agents/worker.md` only when a thread splits its task | Opus 5.5 high for `tier: core`; Sonnet 5.5 medium for `tier: ui` and `tier: trivial` | the task's `touches`, tests, docs |
| QA | `.claude/agents/qa.md` | Sonnet 5.5 medium | tests only (commit trailer `Agent: qa`; the gate checks) |
| Performance | `.claude/agents/performance.md` | Sonnet 5.5 medium; Opus 5.5 high when a regression stays unexplained | nothing (writes under `pipeline/out/`) |
| Triage | `.claude/agents/triage.md` | Haiku 4.5 low | nothing (summaries under `pipeline/out/qa-artifacts/`) |
| Critic | `.claude/agents/critic.md` | Sonnet 5.5 medium; Opus 5.5 for `tier: core` and near-miss verdicts | nothing (`pipeline/out/critic.md`, a REVIEWS line) |
| Changelog | `.claude/agents/changelog.md` | Haiku 4.5 low | `CHANGELOG.md`, `docs/FEATURES.md`, `docs/patch-notes/`, README's "New since" |

Tiers: `core` is the simulation, physics, rendering, bots, navigation, audio engine; `ui` is menus, HUD, settings,
config, asset loading, docs; `trivial` is a one-constant change, a wording fix, a docs-only change.

## The eight steps

1. **Plan**, once per batch: a planning thread turns the owner's list into task blocks (below), updates the Contracts
   section of `docs/ARCHITECTURE.md` when a contract changes, and asks the owner what needs asking before any build.
2. **Build**: one thread per task, on the tier's model. Two tasks run at once only when their `touches` don't overlap.
3. **QA**: tests for every acceptance criterion, then the full suite (the gate).
4. **Performance**: the gate runs the harness when the diff touches `src/sim`, `src/physics`, `src/render`, `src/ai`,
   `src/nav`, `src/audio`, `src/core`, `src/map`, `src/assets` or `vite.config.ts`; the performance agent reviews the
   diff. UI-only changes skip it.
5. **Triage**: the gate script writes the structured summaries itself; Haiku condenses what scripts can't (a failing
   test's output, a trace, the diff summary the critic and changelog read).
6. **Gates**: `node pipeline/gate.mjs` (below). A failed gate goes straight back to the worker with the evidence.
7. **Critic**: eight binary checks (`critic.md`), only on green gates. `tier: trivial` tasks get a Haiku diff check.
8. **Retry**: only the failed checks and evidence go back; four attempts in all, then the owner's auto-accept rule
   (gates green, at least 6/8 with checks 1 and 2 passing, leftovers to KNOWN_ISSUES) or a report to the owner.

## `bake-light.mjs`

`node pipeline/bake-light.mjs [map …]` bakes the bounce light of every map that opts in (`MapData.bakedLight`, G6) and
writes its probe file, `src/map/bakes/<file>.probes.b64` (Node only, through Vite's module runner; about two seconds
for Depot). Run it after changing a baked map's blocks or tints, the day lighting or `config/bake.ts`'s `bake` values:
`src/map/bakes/bakes.test.ts` fails, naming the command, until the file matches. The same map gives the same bytes.

## `gate.mjs`

```
node pipeline/gate.mjs [--task M27[,M28]] [--quick] [--no-smoke] [--perf] [--env container|laptop|ci] [--base origin/main] [--ci]
```

| Gate | Runs | Passes when |
|---|---|---|
| `build` | `build-cached.mjs --mode production --force`: `npm run build` (tsc, Vite, chunk budgets, the `.br`/`.gz` copies) | exit 0 |
| `tests` | `vitest run --reporter=json` (`src/**/*.test.ts` and the pipeline's own `pipeline/**/*.test.mjs`; both projects, `fast` and `slow`) | no failures |
| `smoke` | `playwright test`: project `chromium` runs `e2e/boot.spec.ts` and `e2e/crash.spec.ts` on the e2e build (`?nolock`, `window.airsoft`); project `release` runs `e2e/release.spec.ts` on `dist/` without test flags, with the real pointer lock. Every test asserts zero console and page errors; a failure prints the test's describe path, project and line and the error's locator, expectation and call-log lines (`smokeReport.mjs`) | no failures |
| `perf` | `perf-run.mjs`, only when required | every budget line for the env within `perf-budget.json`, nothing more than 10 % worse than `baseline/<env>.json` |
| `scope` | the diff vs the task's `touches` (`scope.mjs`) | every changed file is in `touches`, a test, under `e2e/` or `docs/`, CHANGELOG or README (`pool.md` and `CLAUDE.md` only when listed); `Agent: qa` commits touch only tests |
| `changelog` | `CHANGELOG.md` › Unreleased | a line names `**<task>**` (each task, when several) |

`--task` takes one id or several (`FA5,FA9`) for a pull request that carries more than one task; the scope is the union
of their `touches`. A block the branch has already cleared from `docs/TASKS.md` is looked for in the branch's history
since the base.

`--quick` is build and tests: about two minutes (build about 20 s with the `.br`/`.gz` copies, the suite 75-90 s;
measured 2026-10-04 in the container with other work running). While working, `npx vitest run --project fast` runs
every unit test except the headless bot-match guards (project `slow`, `src/ai/depotMatch*.test.ts` and the Pro guards `src/ai/*Match.pro*.test.ts`, `src/ai/proBalance.test.ts`) in about 12 s; the
gate, CI and `npm test` always run both projects (vite.config.ts, audit CORE-15). The full gate in a cloud container is about five minutes plus the perf run
when it is required; set `PLAYWRIGHT_CHROMIUM=/opt/pw-browsers/chromium` there. The report is
`pipeline/out/gate-report.json`; logs and reports under `pipeline/out/qa-artifacts/`; all git-ignored.

**Builds.** `build-cached.mjs` builds the production bundle (`dist/`) or the e2e bundle (`dist-e2e/`, `--mode e2e`) and
skips the build when the output is already that of the same source (a hash of `src/` without tests, `public/`,
`index.html`, `pool.md`, `stats.md`, the Vite, TypeScript and npm files, and `git describe`). The gate's build step always
builds; the smoke test's two servers and the perf harness then reuse what is there, so one gate run makes each bundle
once. Two bundles stay necessary: the e2e one has the test hooks, the production one is what players get.

**CI** (`.github/workflows/check.yml`) runs `--ci`: build, tests and smoke on every pull request and push to `main`,
split across jobs since M50's audit (CORE-04): job `check` runs `--ci --tests fast` (the build, the fast project, the
smoke test, scope and changelog) and the three `slow` jobs `--ci --tests slow --shard k/3 --only tests` (a third of
the headless bot-match guards each, vitest's own sharding by file). `--tests all|fast|slow`, `--shard k/n` and
`--only tests` work locally too; without them the gate runs every test.
On a pull request whose title starts with its task id(s) (`FA12: …`, `FA5 + FA9: …`), `--ci` reads the ids from the
title (`GATE_PR_TITLE`) and also runs `scope` and `changelog`, diffing the merge commit against its first parent (the
base it merges into). A title without an id, and a push to `main`, skip those two. **What runs only off CI:** the
`perf` gate (a runner has no baseline and no GPU; the worker's full gate runs it in the container), the frame-time
budget (below), and the critic. Playwright's system libraries are installed on a runner only when the cached Chromium
can't start without them.

Perf environments: `container` (SwiftShader, no GPU; frame times are noise, counts and memory are real), `laptop`
(the owner's low-spec laptop with CPU throttled 4×; the only environment whose frame times are judged), `ci` (no
baseline). **Frame-time gating is a manual owner step**: no automation runs `laptop`; the owner runs
`node pipeline/perf-run.mjs --env laptop` before a release tag (and with `--baseline` at milestones, committed). `pipeline/baseline/<env>.json` (Low, the budget preset) and `<env>-medium.json`, `<env>-high.json`, `<env>-ultra.json` are
written by `perf-run.mjs --preset all --baseline` on `main` after a merge that changed perf-relevant code, and
committed. The gate runs Low; `--preset all` runs Low, Medium, High and Ultra in turn (audit REN-15; Ultra since G5), so
a change that makes High or Ultra dearer is seen too (`--preset ultra` alone for one). `--viewport WxH` sets the page's
size (default 1920x1080).

**The laptop run** (the owner, on the target laptop, from the repository with `npm ci` done and Chrome installed):

```
node pipeline/perf-run.mjs --env laptop --preset all --baseline
```

It builds the e2e bundle, opens a Chrome window (the installed Chrome, `--channel chrome`; `--chromium <path>` for
another build) on the real GPU (no SwiftShader flags under `--env laptop`), plays the scripted Depot match on each
preset for 3600 ticks (60 s) with the CPU throttled 4×, and writes `pipeline/baseline/laptop.json`,
`laptop-medium.json`, `laptop-high.json` and `laptop-ultra.json`. Leave the window alone and the laptop plugged in;
commit the four files. From then on `node pipeline/gate.mjs --env laptop --perf` judges p95 and p99 against the budget
there.

**The desktop run** (G5; the owner's desktop PC, where Ultra is measured at 4K, the same setup as the laptop run):

```
node pipeline/perf-run.mjs --env desktop --preset all --viewport 3840x2160 --baseline
```

The same as the laptop run without CPU throttling, at 3840×2160 at pixel ratio 1, writing `pipeline/baseline/desktop.json`
and `desktop-<preset>.json`. Its frame times are reported, not judged, until the owner sets a 4K target.

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

## What `docs/METRICS.md` records

One row per attempt: task, attempt, worker model, each gate's result and seconds, critic score, retry reason, wall
time, and the token totals the harness reports for each spawned worker (the Agent tool's completion notice carries a
total per worker). The build thread's own tokens and the coordinator's are not visible to any agent; the owner's
usage page is the only complete view. Pass rate per tier is what decides whether a tier's model is right.
