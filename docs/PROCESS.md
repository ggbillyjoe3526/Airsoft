# Process

How work is planned, versioned, reviewed and shipped. `CLAUDE.md` § 7 and § 8 hold the rules every session keeps;
this file has the detail. Read it by heading: grep for the one you need.

## Versioning

The number describes the product; Dev or Beta describes its development state. Never move to 0.2 just because a phase
ends, time passes or small improvements pile up.

| Version (git tag) | Meaning |
|---|---|
| 0.1 Dev 1, 0.1 Dev 2 … (`0.1-dev.1`, `0.1-dev.2` …) | **Dev**: building the game. Systems and content can be added, gameplay can change a lot, breaking changes are fine, not feature complete. Each build number is a full Dev release. |
| 0.1 Beta 1, 0.1 Beta 2 … (`0.1-beta.1`, `0.1-beta.2` …) | **Beta**: starts when the owner calls the planned game feature complete. Bug fixes, balance, performance, stability, UX/QoL, polish, final tuning; no major new systems unless the owner approves. Open-ended number of builds. |
| 0.1.0 (`0.1.0`) | First public release of the completed initial game, when the owner considers it a stable public product (not when a phase ends). |
| 0.1.1, 0.1.2 … (`0.1.1` …) | Fixes, performance, balance, small UI/UX or accessibility improvements, minor tuning, small content additions, maintenance. |
| 0.2, 0.3 … (`0.2.0` …, each with `.x` maintenance) | A substantially expanded or evolved product: major new systems or modes, a large content expansion across systems, a core-loop redesign. No feature-count threshold; contents are not predefined. |
| 1.0 (`1.0.0`) | The release the owner considers fully mature and stable. |

- **Dev until feature complete.** The game stays in 0.1 Dev until the owner calls it feature complete (owner,
  2026-10-06); Beta then adds no features. Dev replaced the name Alpha (owner, 2026-10-05): the old `v0.1-alpha`
  tags became `0.1-dev.1` to `0.1-dev.3`.
- **Names.** Written "0.1 Dev 5" or "0.1 Beta 1", with no "v" (owner, 2026-10-05). Tags can't hold spaces, so they use
  the dotted forms above (`0.1-dev.2`, never `0.1-dev-2`). A GitHub release is titled "Airsoft 0.1 Dev 2".
- **Only full releases are tagged** (owner, 2026-10-01). Playtests in between are plain commits, never a tag, and
  there are no letter checkpoints (`.2a`, `.2b`).
- **The owner creates tags.** Don't create, rename or move them unless he asks.
- **Milestones are not versions.** Milestones and critic cycles give development granularity; they don't each get a
  version.

## Placing work

- **Dev or Beta.** New systems, modes and content (maps, replicas, menus, art) are Dev. Fixing, balance, performance,
  stability, UX/QoL, polish and final tuning are Beta. During Dev, note Beta-type work in `docs/ROADMAP.md` › Beta or
  `docs/KNOWN_ISSUES.md`, unless it blocks Dev work.
- **What 0.1 is.** The core game with strong foundations (owner, 2026-10-01): two replicas (AEG, gas pistol), Depot,
  Elimination and Attack / Defend. The owner has since pulled more into 0.1: the Dev 5 plan and the Dev 6 feature picks
  in `docs/ROADMAP.md`.
- **Later versions.** The feature triage (owner, 2026-10-05) placed every later feature in a version
  (`docs/ROADMAP.md` › After 0.1). Don't build them during 0.1 unless the owner pulled them in.
- **Fun first.** Move on only when the previous part is actually fun. Validate before expanding.
- **No multiplayer.** None is planned (owner, 2026-09-30; confirmed 2026-10-03: absolutely none). No networking code,
  servers or matchmaking.
- **Ideas.** Future ideas (modes, clans, community scenarios and so on) go in `docs/IDEAS.md`. Don't implement them
  unless asked.

## Releases

**After the owner tags a release** (owner, 2026-10-03), the docs move to the new tag without being asked. The first
pull request after a new tag (or a small docs-only one, if no other work is open) updates, to match the owner's
release description:

1. **`README.md`:** the title, the intro paragraph and its "New since …" paragraph, the download link
   (`.../archive/refs/tags/<tag>.zip`), the unzipped folder name (`Airsoft-<tag>`, e.g. `Airsoft-0.1-dev.4`) and the
   "What's in …" section.
2. **`docs/ROADMAP.md`:** the last tag under Where we are, and the Builds table.
3. **Any other "latest release" mention:** run
   `grep -rn "dev\.[0-9]\|beta\.[0-9]\|Dev [0-9]\|Beta [0-9]" README.md docs/ CLAUDE.md src/config/ --exclude-dir=archive`
   and update each line that names the previous release as current (history and policy examples stay as they are).
   The title screen's version needs nothing: it comes from `git describe` when the game is built (M24).
4. **The change records** (owner, 2026-10-04): run the changelog agent (`.claude/agents/changelog.md`) with
   `--release <tag>`. It closes the `Unreleased` section of `CHANGELOG.md` under the tag, writes the player-facing
   `docs/patch-notes/<tag>.md` and the README's "New since …" paragraph.

## Pull requests and branches

- **Every change is a pull request** (owner, 2026-10-02) from a new branch made from the latest `main`, one per
  milestone or batch. **Never push to `main`.** One pull request may hold several commits.
- **Who merges.** A pull request built through the pipeline is merged by its own thread once CI is green and the
  critic accepted (owner, 2026-10-04: "Claude merges"). A docs-only pull request is merged by its thread once CI is
  green (owner, 2026-10-06: "just you handle it"). Any other pull request waits for the owner.
- **Branches** (owner, 2026-10-01). `main` holds the latest stable release.
  - **Now (the 0.1 cycle):** work reaches `main` only through merged pull requests, and the tagged commits on `main`
    are the releases.
  - **Later (about when 0.1 is done; the owner decides when):** day-to-day work moves to a development branch, a
    build ready for testing merges into `beta`, and once tested it merges into `main` and is tagged. From then on,
    never push unreleased work to `main`.

## Sessions

- **Start.** Read the task block or brief and project memory, then only the files the task names. Grep `docs/` for
  anything else; never read a whole big doc. Fetch first: a stale clone shows old work as next. Run
  `git ls-remote --tags origin`: a tag newer than the one `README.md` names means the release checklist is due.
- **One task per thread** (owner, 2026-10-02 and 2026-10-06). After a merge, follow-on work starts a fresh thread
  with a short brief.
- **Pausing.** When the owner says stop or usage is running out, commit and push the work in progress on its branch
  (never patch folders) and say where it stopped.
- **`docs/HANDOFF.md`** is a short "now": what is being built, what is next, what waits on the owner. The planning
  thread rewrites it once per batch (replace it, don't append). Engine facts live in `docs/ARCHITECTURE.md` and the
  folder READMEs, not there.

## Decisions and records

- **Ask when unsure** (owner, 2026-10-02). If you're unsure about a design decision, ask the owner before acting. For
  small details that are easy to change later, choose a sensible default, note it with a one-line reason, say which
  you chose, and keep going.
- **Where a decision goes.** A task's own default or tuning value goes in its record, `docs/records/<id>.md`
  (`docs/records/README.md`). An owner ruling, or a rule every later task must follow, goes in `docs/DECISIONS.md`.
- **Known issues.** What a task leaves open is a row in `docs/KNOWN_ISSUES.md`, named in its record too. A pull
  request that fixes a row deletes it.
- **Ask the owner at once** when a check can only pass by changing an acceptance criterion (a budget the build can't
  meet, a target his ruling set). Don't spend attempts on it.

## Bug pass

A full bug pass plus a `docs/KNOWN_ISSUES.md` sweep is a standing practice (owner, 2026-10-04), not a one-off.

- **When.** After each batch of feature pull requests merges and before the owner's playtest: fresh features have had
  no browser play yet, and the playtest then starts on a clean build. The coordinator reminds the owner with one line
  in the project chat; the pass starts only when he says go (it costs usage).
- **What.** Play every mode in the browser, review the code added since the last pass, fix what can be fixed (a test
  for each), and keep the rest logged in `docs/KNOWN_ISSUES.md` with why.
- **How.** It runs as a pipeline task: `BP<n>` in `docs/TASKS.md`, `tier: core`, the gates and the Opus critic. Two
  parallel review agents (for example UI and input; pool, Loadout and maps) read the new code: last time they found
  five small bugs the browser didn't show. A scripted Playwright player (`?nolock`, the e2e build served by
  `vite preview`) plays the modes.
- **Seeds.** The headless bot guards are seed-sensitive: a fix that touches movement or materials can fail one seed.
  Re-measure over 16 seeds before changing a threshold.

## The pipeline

Every task runs through the build pipeline (owner's design, 2026-10-04). `pipeline/README.md` is the protocol,
`.claude/skills/pipeline/SKILL.md` the step list, `docs/TASKS.md` the open tasks with their acceptance criteria, and
`.claude/agents/` the agents (worker, qa, performance, triage, critic, changelog).

### Gates

A script, not a model. `node pipeline/gate.mjs --task <id>` runs the build, the unit tests, the browser smoke test,
the perf harness when the diff touches a perf-relevant path, a scope check against the task's `touches`, and a
changelog check. It writes `pipeline/out/gate-report.json`, the attempt row for the task's record
(`pipeline/out/metrics-row.md`), a failures-only summary (`pipeline/out/failures.md`: each failure's test, error, file
and line) and the review packet the critic and QA read first (`pipeline/out/review-packet.md`: the task block, the gate
summary, the contracts the diff touches, QA's report and the diff). A failed gate goes back to the worker with the
evidence; the critic never sees it. The performance agent runs only when the perf gate fails, and the triage agent
only for a failure the summary can't place (token step 3, `pipeline/README.md`).

### Critic

Judgment only, on green gates. The critic (`.claude/agents/critic.md`) runs as a separate subagent with fresh context.
It reads the review packet first (the task's acceptance criteria, the gate summary, the contracts the diff touches,
QA's report and the diff), opens a file in full only where a hunk can't settle a check, and ticks eight binary checks:

| # | Check | Blocking |
|---|---|---|
| 1 | Every acceptance criterion met, with the diff line that meets it | yes |
| 2 | No contract (`docs/ARCHITECTURE.md` › Contracts) changed unless the task allows it | yes |
| 3 | No new per-frame or per-tick allocation in the diff | yes |
| 4 | The new tests exercise the feature (would fail without it) | yes |
| 5 | Simulation apart from presentation, no magic numbers, no hidden global state (§9) | yes |
| 6 | Fits the pillars, the fixed decisions and the assets policy (§2, §3, §4, §11) | yes |
| 7 | Maintainability (small modules, GPU disposal, no copy-paste) | no |
| 8 | Scope (nothing beyond the task; the docs it affects updated) | no |

- **Score** is the checks passed, out of 8. **Accept** when every blocking check passes and at most one non-blocking
  check fails. Otherwise **Retry** with only the failed checks and their evidence.
- **Near miss.** A verdict one check short of Accept is re-run on Opus before the task goes back, when its failed
  check is a judgment (checks 5 to 8, or one of 1 to 4 decided by reading). A check failed on a measured number (a
  budget, a count) goes straight back, or to the owner when only a changed criterion can pass it: a re-run can't
  change a number (token plan item 18).
- **Trivial tasks.** Small changes (typo fixes, config tweaks, docs) are `tier: trivial`: they skip the critic, and
  green gates plus a Haiku diff check accept them.
- **The owner's playtest wins.** The critic cannot play the game: it lists browser tests for the owner, whose
  playtest overrides it.

### Attempts

Four attempts per task: one build plus three targeted retries. After the fourth:

- gates green and at least **6 of 8**, with checks 1 and 2 passing: **auto-accept** (owner, 2026-10-04), and every
  failed check goes to `docs/KNOWN_ISSUES.md`;
- otherwise stop, keep the best attempt on its branch and report to the owner what failed and what each attempt tried.

### Records

Each task writes one file, `docs/records/<id>.md`: its review line, a row per attempt, its own decisions and the known
issues it left (format in `docs/records/README.md`). `node pipeline/records.mjs` prints the index tables. Records
before 2026-10-08 are in `docs/archive/0.1-dev/REVIEWS.md` and `METRICS.md`.

## Writing docs

The owner's rule (2026-10-05): tidy and consistent, easy to read, as simple as the subject allows, as long as it needs
to be and no longer, technical detail only where it's needed, nothing critical lost.

1. **Start with the point.** Under the `#` title, one or two sentences: what the file is for and who reads it. No
   "written on" or "updated for" lines: git keeps that.
2. **Current state only.** Live docs say how things are now. Replace superseded text instead of appending to it (no
   "since M43 …, since M55 …" chains). History goes to `docs/archive/` (`docs/archive/README.md`); when a live doc
   grows past about 50 KB, move its finished parts there.
3. **Headings.** One `#` title, `##` sections, `###` only when a section really has parts. Sentence case, plain words,
   no milestone ids or dates. An id (M44, FA6, audit SIM-17) may end a line in brackets when someone may need to trace
   it.
4. **Lists and tables.** Bullets for facts, numbered lists for steps, tables for items compared on the same columns.
   Scannable list items get a bold lead-in: `- **Name.** Text.` One idea per bullet.
5. **Sentences.** Short, active, present tense, British spelling, plain words. No filler ("note that", "basically",
   "in order to"). No em-dashes: use a colon, a comma or a full stop. "·" is fine as a separator in short labels.
6. **Names.** Menu paths with ›, e.g. `Settings › Graphics › Quality`. Code, files, commands and config keys in
   backticks. Dates as 2026-10-08. An owner ruling is tagged `(owner, 2026-10-07)`.
7. **Timings carry their date** (audit CORE-13): "about 2 minutes (2026-10-08)". The pull request that changes the
   suite or the gate refreshes them.
8. **Wrap** prose and list items at 120 columns. Table rows don't wrap; keep cells short.
9. **Cross-references** by relative path, with › for a heading: `docs/PROCESS.md › Releases`.
