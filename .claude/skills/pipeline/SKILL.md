---
name: pipeline
description: Run one task of the Airsoft FPS through the build pipeline (gates, QA, performance, critic, changelog, retries, merge). Use at the start of any build thread that has a task block in docs/TASKS.md, and for a retry after a failed gate or critic.
---

# Running a task through the pipeline

The protocol is in `pipeline/README.md`; this is the step list. You are the **worker**: the build thread, started on
the model the task's `tier` names. Everything else is a worker you spawn with the Agent tool. When the repo's agent
names (`qa`, `performance`, `triage`, `critic`, `changelog`, `worker`) are not offered as agent types in your
session, spawn `general-purpose` with the model override the definition names (the Agent tool takes aliases only:
`haiku`, which current Claude Code maps to `claude-haiku-5-5`) and put the definition's body (the text under its
frontmatter) at the top of the prompt, the task content last. Tell every worker not to call
`mcp__hearthbot__` tools.

1. **Read** the task block in `docs/TASKS.md` and the contracts it names (grep, then ranges). Branch from the latest
   `origin/main`. Don't commit `status:` changes while you work: the thread's checklist shows progress, and the block's
   `status` and `attempts` are set once, in the records commit (token-efficiency plan, item 13).
2. **Build** (CLAUDE.md §8, §9). Run `npm run t` (dots and failures only) as you go, `node pipeline/gate.mjs --quick`
   before QA. Every gate run but CI's writes the review packet, `pipeline/out/review-packet.md` (task block, gate
   summary, touched contracts, QA's report, file list, diff); `node pipeline/packet.mjs --task <id>` rebuilds it after
   a commit (token-efficiency plan, item 15).
3. **QA**: spawn `qa` with the task id and the base commit; it reads the packet first. It commits its tests with the
   trailer `Agent: qa` and writes its report to `pipeline/out/qa-artifacts/qa-report.md`, which the packet quotes.
4. **Changelog**: spawn `changelog` with the lines' inputs, so it reads only CHANGELOG's `Unreleased` section and one
   FEATURES heading (item 17a): the task id and title, the PR title (and number when known), a one-paragraph summary
   in player words, the group(s) (Added, Changed, Fixed, Internal), the FEATURES heading to edit or none, and the
   task's decisions (its record's lines and any new DECISIONS lines). It writes the `Unreleased` line(s) and the
   FEATURES line.
5. **Full gate**: `PLAYWRIGHT_CHROMIUM=/opt/pw-browsers/chromium node pipeline/gate.mjs --task <id>` (drop the
   variable outside a cloud container). About 30 minutes in a cloud container (2026-10-08), plus the perf run when it is
   required; about 10 when the diff reaches no bot-match guard, which the gate then leaves to CI (its tests line says
   so; `--tests all` runs them anyway; token plan item 21).
   - Any gate `false`: fix from `pipeline/out/failures.md`, the gate's failures-only summary (each failure's test,
     error, file and line; the gate prints the same lines as it goes; item 19). Spawn `triage` only for an entry it
     marks with no file and line whose log is long. Count an attempt in the block's `attempts:` line, go to 2. No
     critic on a failed gate.
   - `perf` failed: spawn `performance` with the env for the cause and ranked fixes; a regression it leaves as
     Unexplained: spawn it again with `model: opus`. A passing perf run needs no agent: the gate's report is the
     record and the critic's check 3 reads the hot paths (item 16).
6. **Critic** (not for `tier: trivial`: spawn `triage` for a diff summary of the packet instead and check it against
   the task yourself): spawn `critic`; `model: opus` when `tier: core`. It reads the packet first. On `Retry`: a near
   miss marked `judgment` is re-run on Opus first; a near miss marked `measured` is not (a re-run can't change a
   number, item 18). Then fix only the failed checks, count an attempt, go to 2.
   - **Ask the owner at once** (token-efficiency plan, item 9) when a failed check can only pass by changing an
     acceptance criterion (a budget the build can't meet, a target his ruling set): post a decision card and stop. No
     further critic runs or attempts on that check until he answers.
7. **Four attempts** in all. After the fourth: if the gates are green and the critic score is at least 6/8 with
   checks 1 and 2 passing, accept it (the owner's auto-accept, 2026-10-04) and log every failed check in
   `docs/KNOWN_ISSUES.md`; otherwise stop, keep the best attempt on the branch and reply to the owner with what failed
   and what each attempt tried.
8. **Record**: a task that changes bot or map balance on purpose first runs its figures, `node pipeline/balance.mjs
   <filter>` (`pipeline/README.md` › `balance.mjs`), and quotes them in its decisions; figures never fail a gate (item
   22). Write `docs/records/<id>.md` (format in `docs/records/README.md`): the review line, a row per attempt
   (copy `pipeline/out/metrics-row.md` from each gate run and fill its `?` cells), the task's own decisions and the
   known issues it left (each also a row in `docs/KNOWN_ISSUES.md`); `node pipeline/records.mjs --check` passes. Mark
   the task done where `docs/ROADMAP.md` lists it, and delete its block from `docs/TASKS.md` (no `done` blocks stay
   behind; CI's scope gate finds the block in the branch's history). Copy `pipeline/out/gate-report.json`,
   `failures.md`, `critic.md` and the triaged summaries to the project's shared files under `pipeline/runs/<id>/attempt-<n>/`.
9. **Ship**: merge `origin/main` in, push once with the work and the records together (no separate status or records
   pushes, no PR title edits afterwards: each push or title edit re-runs CI and wakes the thread), open the PR (template in `pipeline/README.md`; its title starts with the
   task id, `<id>: …`, so CI runs the scope and changelog gates), subscribe to it, and once CI is green merge it (the
   owner's standing choice, 2026-10-04).
