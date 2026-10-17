---
name: pipeline
description: Run one task of the Airsoft FPS through the build pipeline (gates, QA, performance, critic, changelog, retries, merge), and the three review agents on any other code pull request. Use at the start of any build thread that has a task block in docs/TASKS.md, for a retry after a failed gate or critic, and before marking any pull request that touches code ready.
---

# Running a task through the pipeline

The protocol is `pipeline/README.md`; this is the step list. You are the worker, on the model the task's `tier` names
(`docs/PROCESS.md` › Models); the rest are agents you spawn. Where the repo's agent names aren't offered as agent
types, spawn `general-purpose` with the definition's model (aliases only: `haiku`, `sonnet`, `opus`) and its body at
the top of the prompt. Tell every agent not to call `mcp__hearthbot__` tools.

1. **Read** the task block and the contracts it names (grep, then ranges). Branch from the latest `origin/main`. The
   block's `status` and `attempts` change once, in the records commit (a status-only push re-runs CI).
2. **Build** (CLAUDE.md §8, §9): `npm run t` as you go, `node pipeline/gate.mjs --quick` before QA. Each gate run but
   CI's writes the review packet, `pipeline/out/review-packet.md`; `node pipeline/packet.mjs --task <id>` rebuilds it.
3. **QA**: spawn `qa` with the task id and base commit. It commits its tests (`Agent: qa`) and its Pass or Fail report.
   On Fail, fix and run it again.
4. **Changelog**: spawn `changelog` with the task id and title, the PR title, a player-words summary, the group(s), the
   FEATURES heading or none, and the task's decisions.
5. **Full gate**: `PLAYWRIGHT_CHROMIUM=/opt/pw-browsers/chromium node pipeline/gate.mjs --task <id>` (no variable
   outside a cloud container): about 20 minutes there, 10 when the diff reaches no bot-match guard, plus any perf run.
   A failed gate: fix from `pipeline/out/failures.md` (spawn `triage` only for an entry with no file and line and a
   long log), count an attempt, go to 2. No critic on a failed gate.
6. **Review agents**, each from the packet, in this order (a docs-only `tier: trivial` task gets `triage`'s diff
   summary instead, checked by you against the task):
   - `performance` with the env; on Unexplained, again on Opus. Then rebuild the packet so it quotes the report.
   - `critic` (Opus for `tier: core`). On Retry: `pipeline/README.md` › Verdict and attempts (near misses, the
     attempt count), fix only the failed checks and findings, go to 2.
   - A check only a changed acceptance criterion can pass: ask the owner at once on a decision card and stop there.
7. **Record**: a deliberate balance change first runs `node pipeline/balance.mjs <filter>` and quotes the figures.
   Write `docs/records/<id>.md` (`docs/records/README.md`; `node pipeline/records.mjs --check` passes), mark the task
   done where `docs/ROADMAP.md` lists it, delete its block from `docs/TASKS.md`, and copy the run's reports (never raw
   `playwright.json`, `vitest.json` or logs) to the shared files under `pipeline/runs/<id>/attempt-<n>/`.
8. **Ship**: merge `origin/main` in, push once with the work and the record, open the PR (`<id>: …` title, the
   description and `Review:` line from `pipeline/README.md`), subscribe to it, and merge it once CI is green. Never mark
   ready, or merge, with a review agent unrun or failing.

## A `tier: fix` task

The same steps, lighter where nothing changes for the player (`docs/PROCESS.md` › The pipeline): the critic runs on
Sonnet (Opus only for a judgment near miss), the changelog brief names no FEATURES heading unless the fix changes how
an existing feature behaves, `docs/PLAYTEST.md` gets a line only when the player sees a difference, and the record is
the review line, the attempt rows and one Decisions line (no Known issues section when it leaves none).

## Code pull requests outside the pipeline

A bug pass, an audit's fix, a content item or a pipeline change with no task block still runs the review agents before
it leaves draft: `node pipeline/gate.mjs` (no `--task`), then step 6's agents with "Task: none" in their brief, and the
`Review:` line in the description.
