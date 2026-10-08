---
name: pipeline
description: Run one task of the Airsoft FPS through the build pipeline (gates, QA, performance, critic, changelog, retries, merge). Use at the start of any build thread that has a task block in docs/TASKS.md, and for a retry after a failed gate or critic.
---

# Running a task through the pipeline

The protocol is in `pipeline/README.md`; this is the step list. You are the **worker**: the build thread, started on
the model the task's `tier` names. Everything else is a worker you spawn with the Agent tool. When the repo's agent
names (`qa`, `performance`, `triage`, `critic`, `changelog`, `worker`) are not offered as agent types in your
session, spawn `general-purpose` with the model override the definition names (as its alias: `haiku` for
`claude-haiku-5-5`) and put the definition's body (the text under its frontmatter) at the top of the prompt, the task
content last. Tell every worker not to call
`mcp__hearthbot__` tools.

1. **Read** the task block in `docs/TASKS.md` and the contracts it names (grep, then ranges). Branch from the latest
   `origin/main`. Don't commit `status:` changes while you work: the thread's checklist shows progress, and the block's
   `status` and `attempts` are set once, in the records commit (token-efficiency plan, item 13).
2. **Build** (CLAUDE.md §8, §9). Run `npm run t` (dots and failures only) as you go, `node pipeline/gate.mjs --quick`
   before QA.
3. **QA**: spawn `qa` with the task id and the base commit. It commits its tests with the trailer `Agent: qa`.
4. **Changelog**: spawn `changelog` with the task id, the PR title you intend, a one-paragraph diff summary and the new
   DECISIONS lines. It writes the `Unreleased` line(s) and the FEATURES line.
5. **Full gate**: `PLAYWRIGHT_CHROMIUM=/opt/pw-browsers/chromium node pipeline/gate.mjs --task <id>` (drop the
   variable outside a cloud container). About five minutes, plus the perf run when it is required.
   - Any gate `false`: fix from the report's evidence (spawn `triage` on a log longer than about 60 lines first),
     count an attempt in the block's `attempts:` line, go to 2. No critic on a failed gate.
   - `perf` ran: spawn `performance` with the env, so its diff review and ranking are on file. A regression it
     leaves as Unexplained: spawn it again with `model: opus`.
6. **Critic** (not for `tier: trivial`: spawn `triage` for a diff summary instead and check it against the task
   yourself): spawn `critic`; `model: opus` when `tier: core`. On `Retry`: a near miss is re-run on Opus first; then
   fix only the failed checks, count an attempt, go to 2.
   - **Ask the owner at once** (token-efficiency plan, item 9) when a failed check can only pass by changing an
     acceptance criterion (a budget the build can't meet, a target his ruling set): post a decision card and stop. No
     further critic runs or attempts on that check until he answers.
7. **Four attempts** in all. After the fourth: if the gates are green and the critic score is at least 6/8 with
   checks 1 and 2 passing, accept it (the owner's auto-accept, 2026-10-04) and log every failed check in
   `docs/KNOWN_ISSUES.md`; otherwise stop, keep the best attempt on the branch and reply to the owner with what failed
   and what each attempt tried.
8. **Record**: the REVIEWS line (`<id> · <attempts> attempts · <score> · <verdict>`), the ROADMAP row's status, a
   METRICS row per attempt (`docs/METRICS.md`), and delete the task block from `docs/TASKS.md` (no `done` blocks stay
   behind; CI's scope gate finds the block in the branch's history). Copy `pipeline/out/gate-report.json`,
   `critic.md` and the triaged summaries to the project's shared files under `pipeline/runs/<id>/attempt-<n>/`.
9. **Ship**: merge `origin/main` in, push once with the work and the records together (no separate status or records
   pushes, no PR title edits afterwards: each push or title edit re-runs CI and wakes the thread), open the PR (template in `pipeline/README.md`; its title starts with the
   task id, `<id>: …`, so CI runs the scope and changelog gates), subscribe to it, and once CI is green merge it (the
   owner's standing choice, 2026-10-04).
