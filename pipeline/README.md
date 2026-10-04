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

## `gate.mjs`

```
node pipeline/gate.mjs [--task M27] [--quick] [--no-smoke] [--perf] [--env container|laptop|ci] [--base origin/main] [--ci]
```

| Gate | Runs | Passes when |
|---|---|---|
| `build` | `npm run build` (tsc, Vite, chunk budgets) | exit 0 |
| `tests` | `vitest run --reporter=json` | no failures |
| `smoke` | `playwright test` (`e2e/boot.spec.ts`, which asserts zero console and page errors) | no failures |
| `perf` | `perf-run.mjs`, only when required | every budget line for the env within `perf-budget.json`, nothing more than 10 % worse than `baseline/<env>.json` |
| `scope` | the diff vs the task's `touches` | every changed file is in `touches`, a test, a doc, CHANGELOG, README or pool.md; `Agent: qa` commits touch only tests |
| `changelog` | `CHANGELOG.md` › Unreleased | a line names `**<task>**` |

`--quick` is build and tests (about 90 s). The full gate in a cloud container is about five minutes; set
`PLAYWRIGHT_CHROMIUM=/opt/pw-browsers/chromium` there. CI runs `--ci` (no perf: a runner has no baseline). The
report is `pipeline/out/gate-report.json`; logs and reports under `pipeline/out/qa-artifacts/`; all git-ignored.

Perf environments: `container` (SwiftShader, no GPU; frame times are noise, counts and memory are real), `laptop`
(the owner's low-spec laptop with CPU throttled 4×; the only place the frame-time budget is gated), `ci` (no
baseline). `pipeline/baseline/<env>.json` (Low, the budget preset) and `<env>-medium.json`, `<env>-high.json` are
written by `perf-run.mjs --preset all --baseline` on `main` after a merge that changed perf-relevant code, and
committed. The gate runs Low; `--preset all` runs Low, Medium and High in turn (audit REN-15), so a change that makes
High dearer is seen too (`--preset high` alone for one).

**The laptop run** (the owner, on the target laptop, from the repository with `npm ci` done and Chrome installed):

```
node pipeline/perf-run.mjs --env laptop --preset all --baseline
```

It builds the e2e bundle, opens a Chrome window (the installed Chrome, `--channel chrome`; `--chromium <path>` for
another build) on the real GPU (no SwiftShader flags under `--env laptop`), plays the scripted Depot match on each
preset for 3600 ticks (60 s) with the CPU throttled 4×, and writes `pipeline/baseline/laptop.json`,
`laptop-medium.json` and `laptop-high.json`. Leave the window alone and the laptop plugged in; commit the three files.
From then on `node pipeline/gate.mjs --env laptop --perf` judges p95 and p99 against the budget there.

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
the diff; `skip` only documents the intent). `status`: open · building · gates · critic · retry n · done · escalated.

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
