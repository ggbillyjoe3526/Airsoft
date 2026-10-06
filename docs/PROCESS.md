# Process

How work is planned, versioned, reviewed and shipped. Moved out of `CLAUDE.md` on 2026-10-06 (token-efficiency plan,
item 2) so that file stays short: `CLAUDE.md` is loaded on every turn, this file only when a task needs it.
Read it in ranges: grep for the heading you need.

## Roadmap, versions and pull requests


Move on only when the previous phase is actually fun. Validate before expanding.

Phases and milestones are development steps, not versions: all of Phases 1–4 build the initial **v0.1** product.
**Current focus: alpha.** The game stays in alpha through Phase 4, until the owner calls it feature complete.
Detailed plan and build status: `docs/ROADMAP.md`.

v0.1 is the core game with strong foundations (owner, 2026-10-01): two replicas (AEG, gas pistol), Depot,
Elimination and Attack / Defend.

1. **Phase 2 — Core gameplay (alpha, ships as 0.1 Dev 2):** controls, footsteps and sound, reload animations, hit reactions, smarter bots, the Attack / Defend objective mode, all on Depot.
2. **Phase 3 — Core foundations (alpha, 0.1 Dev 3):** leaning (Q / E peek), magazines and meaningful reloads (limited ammunition), a BB physics pass, movement and positioning over raw weapon stats, the audit fixes and elevation support (ramps, raised floors).
3. **Phase 4 — Feel, presentation and onboarding (alpha):** weapon handling from the owner's 0.1 Dev 3 playtest (fire modes, faster reloads, crouch toggle, steadier aim when still, optics as accessories with aiming down sights), a Depot rework to the field checklist (moved from Phase 3, owner, 2026-10-02), the Loadout (owner, 2026-10-03: primary and secondary replica, BB weight, hop-up, optics, grips, magazines), an audio rework, comfort, accessibility and browser basics (owner, 2026-10-03: invert mouse, reduced motion, aim and sprint toggles, colour-blind options, sound cues, pause on a hidden tab, fullscreen), match info (hit feed, teammate markers, scoreboard, end-of-match summary, local records, crosshair options), custom matches (rounds, round time, team size, teammate and opponent difficulty, a ricochets setting off by default), a practice range, three squad orders for bot teammates, art pass, VFX and lighting, proper menus and a full settings screen (incl. accessibility options), onboarding.
4. **Beta (when the owner calls the game feature complete):** optimisation, final balance and tuning, bug fixing, stability, UX/QoL and polish.

**After 0.1 (later versions, each feature placed in a version in `docs/ROADMAP.md` by the feature triage of
2026-10-05):** 0.2 the graphics overhaul; 0.3 the armoury and the rules (medic, TDM, Survival, Extraction public, field
rule presets, chrono, gas simulation, grenades, parts and pouches, the first new replica types); 0.4 more fields and
ways to play (Rush, Domination, Capture the Flag, prone, weather, callouts, bot personalities, team communication);
0.5 kit, looks and progression (skins, challenges and badges). Don't build these during 0.1, except what the owner's
Dev 6 and Dev 7 picks (2026-10-06, `docs/ROADMAP.md`) pulled into 0.1: medic, field rule presets, the chrono, gas
simulation, grenades, rigs and pouches, the blowback pistol and spring sniper, the Extraction rework, weather,
callouts, pings, bot personalities and skins. Dev builds continue until the owner calls the game feature complete.

**Placing work:** new systems, modes and content (maps, replicas, menus, art) are alpha; fixing, balance,
performance, stability, UX/QoL, polish and final tuning are beta. During alpha, note beta-type work in
`docs/ROADMAP.md` (Beta) or `docs/KNOWN_ISSUES.md` unless it blocks alpha work.

### Versioning (authoritative policy)

The number describes the product; a Dev or Beta stage describes its development state. Never move to
0.2 just because a phase ends, time passes or small improvements pile up.

| Version (git tag) | Meaning |
|---|---|
| 0.1 Dev 1, 0.1 Dev 2, 0.1 Dev 3 … (`0.1-dev.1`, `0.1-dev.2` …) | **Dev** (called Alpha until 2026-10-05): building the game. Systems and content can be added, gameplay can change a lot, breaking changes are fine, not feature complete. Each build number (`.2`, `.3`) is a full Dev release. In-between playtests use plain commits, never a tag. |
| 0.1 Beta 1, 0.1 Beta 2, 0.1 Beta 3 … (`0.1-beta.1`, `0.1-beta.2` …) | **Beta**: starts when the owner calls the planned game feature complete. Bug fixes, balance, performance, stability, UX/QoL, polish, final tuning; no major new systems unless the owner approves. Open-ended number of builds. |
| 0.1.0 (`0.1.0`) | First public release of the completed initial game, when the owner considers it a stable public product (not when a phase ends). |
| 0.1.1, 0.1.2 … (`0.1.1`, `0.1.2` …) | Fixes, performance, balance, small UI/UX or accessibility improvements, minor tuning, small content additions, maintenance. |
| 0.2, 0.3 … (`0.2.0` …, each with `.x` maintenance) | A substantially expanded or evolved product: major new systems or modes, a large content expansion across systems, a core-loop redesign. No feature-count threshold; contents are not predefined. |
| 1.0 (`1.0.0`) | The release the owner considers fully mature and stable. |

- Milestones and critic cycles give development granularity; they don't each get a version.
- Names are written as "0.1 Dev 5" or "0.1 Beta 1" (owner, 2026-10-05: Dev replaced Alpha; no "v"). Tags can't hold
  spaces, so they use the dotted forms above (`0.1-dev.2`, never `0.1-dev-2`); a GitHub release is titled
  "Airsoft 0.1 Dev 2". The old `v0.1-alpha` tags became `0.1-dev.1` to `0.1-dev.3` on 2026-10-05. Only full
  releases are tagged (owner, 2026-10-01): no letter checkpoints (`.2a`, `.2b`); the old ones are removed.
  The owner creates tags; don't create, rename or move them unless asked.
- **After the owner tags a release** (owner, 2026-10-03), the docs move to the new tag without being asked. The
  first pull request after a new tag (or a small docs-only one, if no other work is open) updates, to match the
  owner's release description:
  1. `README.md`: the title, the intro paragraph and its "New since …" list, the download link
     (`.../archive/refs/tags/<tag>.zip`), the unzipped folder name (`Airsoft-<tag without the v>`, e.g.
     `Airsoft-0.1-dev.3`) and the "What's in …" section.
  2. `docs/ROADMAP.md`: the builds table and the status rows that mention the release.
  3. Any other "latest release" mention: run `grep -rn "dev\.[0-9]\|beta\.[0-9]\|Dev [0-9]\|Beta [0-9]" README.md docs/ CLAUDE.md src/config/`
     and update each line that names the previous release as current (history and policy examples stay as they are).
     The title screen's version needs nothing: it comes from `git describe` as the game is built (M24).
  4. The change records (owner, 2026-10-04): run the changelog agent (`.claude/agents/changelog.md`) with
     `--release <tag>`. It closes the `Unreleased` section of `CHANGELOG.md` under the tag, writes the player-facing
     `docs/patch-notes/<tag>.md` and the README's "New since …" paragraph.
- **Pull requests** (owner, 2026-10-02): every change lands as a pull request that the owner reviews and merges.
  Work on a new branch made from the latest `main` (one per milestone or batch), push that branch, and open a pull
  request into `main`. **Never push to `main`.** A pull request built through the pipeline (`pipeline/README.md`)
  is merged by its own thread once CI is green and the critic accepted (owner, 2026-10-04: "Claude merges"); any
  other pull request waits for the owner. Docs-only pull requests are merged by their thread too once CI is green
  (owner, 2026-10-06: "just you handle it"). One pull request may hold several commits.
- **Branches** (owner, 2026-10-01): `main` holds the latest stable release.
  - **Now (the v0.1 cycle):** work reaches `main` only when the owner merges its pull request, and the tagged
    commits on `main` are the releases.
  - **Later (about when v0.1 is done and v0.2 starts; the owner decides when):** day-to-day work happens on an
    `alpha` branch. A build ready for testing is merged into `beta`; once tested, it is merged into `main` and tagged.
    From then on, never push unreleased work to `main`.

Multiplayer is not planned (owner, confirmed 2026-10-03: absolutely none).

Future ideas (modes, clans, community scenarios, etc.) go in `docs/IDEAS.md`. Do not implement them unless asked.


## Sessions

**At the start of the project** (nothing exists yet):
1. Propose the folder structure and initial setup in a few lines.
2. Scaffold the Vite + TypeScript + Three.js + Rapier project.
3. Get a single scene running: a floor, a box, and a first-person camera that moves.
4. Then build Phase 1 in small steps, each leaving the game runnable.

**At the start of every later session:** read the task block or brief and project memory, then only the files the
task names (grep `docs/` for what else it needs; don't read whole docs). Fetch first: a stale clone shows old work as
next. Run `git ls-remote --tags origin`: a tag newer than the one `README.md` names means the release checklist above
is due. (Before 2026-10-06 every session read `docs/HANDOFF.md`, `CLAUDE.md` and all of `docs/` first: token-efficiency
plan, item 10.)

**At the end of every session** (or when the owner says usage is running out): rewrite `docs/HANDOFF.md` for the next session (where we are, what's next and any half-made plans, open questions, gotchas; about a screen; replace it, don't append), then commit it on the working branch and push it with the rest, so it is part of the pull request.


**Regular bug pass** (owner, 2026-10-04): after each batch of feature pull requests merges and before the owner's
playtest, a full bug pass and `docs/KNOWN_ISSUES.md` sweep is due: play every mode in the browser, review the code added
since the last pass, fix what can be fixed (a test for each), keep the rest logged with why. Remind the owner then; start
it only when he says go. It runs as a pipeline task (`BP<n>`); how in `docs/HANDOFF.md`.

**Design decisions:** if you're unsure about something, ask me before acting (owner, 2026-10-02). For small details that are easy to change later, choose a sensible default, note it in `docs/DECISIONS.md` with a one-line reason, say which you chose, and keep going.


## The pipeline: gates and the critic

Every task runs through the build pipeline (owner's design, 2026-10-04): `pipeline/README.md` is the protocol,
`.claude/skills/pipeline/SKILL.md` the step list, `docs/TASKS.md` the open tasks with their acceptance criteria,
`.claude/agents/` the agents (worker, qa, performance, triage, critic, changelog).

### Gates (a script, not a model)

`node pipeline/gate.mjs --task <id>` runs the build, the unit tests, the browser smoke test, the perf harness when the
diff touches a perf-relevant path, a scope check against the task's `touches`, and a changelog check, and writes
`pipeline/out/gate-report.json`. A failed gate goes back to the worker with the evidence; the critic never sees it.

### Critic (judgment only, on green gates)

The critic (`.claude/agents/critic.md`) runs as a separate subagent with fresh context, reads the diff, the gate
report, the triaged QA and performance summaries and the task's acceptance criteria, and ticks eight binary checks:

| # | Check | Blocking |
|---|---|---|
| 1 | Every acceptance criterion met, with the diff line that meets it | yes |
| 2 | No contract (`docs/ARCHITECTURE.md` › Contracts) changed unless the task allows it | yes |
| 3 | No new per-frame or per-tick allocation in the diff | yes |
| 4 | The new tests exercise the feature (would fail without it) | yes |
| 5 | Simulation apart from presentation, no magic numbers, no hidden global state (§9) | yes |
| 6 | Fits the pillars, the fixed decisions and the assets policy (§2, §3, §4, §11) | yes |
| 7 | Maintainability (small modules, GPU disposal, no copy-paste) | no |
| 8 | Scope (nothing beyond the task; the docs updated) | no |

**Score** is checks passed out of 8. **Accept**: every blocking check passes and at most one non-blocking fails.
Otherwise **Retry** with only the failed checks and their evidence. A verdict one check short of Accept is a near
miss and is re-run on Opus before the task goes back. `tier: trivial` tasks skip the critic: green gates plus a Haiku
diff check. The critic still cannot play the game: it lists browser tests for the owner, whose playtest overrides it.

### Attempts

Four attempts per task (one build plus three targeted retries). After the fourth:
- gates green and at least **6 of 8** with checks 1 and 2 passing → **auto-accept** (owner, 2026-10-04); every
  failed check goes to `docs/KNOWN_ISSUES.md`;
- otherwise stop, keep the best attempt on its branch and report to the owner what failed and what each attempt tried.

`docs/REVIEWS.md` keeps one line per task (id, attempts, score, verdict); `docs/METRICS.md` one row per attempt.
Small changes (typo fixes, config tweaks, docs) are `tier: trivial`.
