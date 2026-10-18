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
| 0.1.0 (`0.1.0`) | First public release, and the start of Early Access (owner, 2026-10-12): feature complete but light on content, released when the owner considers it a stable public product (not when a phase ends). |
| 0.1.1, 0.1.2 … (`0.1.1` …) | Fixes, performance, balance, small UI/UX or accessibility improvements, minor tuning, small content additions, maintenance. |
| 0.2, 0.3 … (`0.2.0` …, each with `.x` maintenance) | A themed update, a mini expansion (owner, 2026-10-12): the Replica, Modes, Maps and Progression Updates and any more he adds, in the order he picks. Each has its own Dev and Beta builds; the next one shipped takes the next number. |
| 1.0 (`1.0.0`) | The full launch: the owner considers the game complete, and Early Access ends (owner, 2026-10-12). |

- **Dev until feature complete, then Beta.** A version stays in Dev until the owner calls it feature complete (owner,
  2026-10-06); Beta then adds no features. He called 0.1 out of Dev on 2026-10-16, so the game is in 0.1 Beta 1 now
  (`docs/ROADMAP.md` › Where we are). Dev replaced the name Alpha (owner, 2026-10-05): the old `v0.1-alpha`
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
  Elimination and Attack / Defend. The owner has since pulled more into 0.1: the Dev 5 plan and 0.1 Dev 6 in
  `docs/ROADMAP.md`. 0.1 is feature complete; its content can be light (owner, 2026-10-12).
- **Later versions.** Every later feature has a themed update (`docs/ROADMAP.md` › Early Access: the themed updates;
  owner, 2026-10-05 and 2026-10-12). Don't build them during 0.1 unless the owner pulled them in. While 0.1 is in
  Dev, a system it needs goes there; new content (replicas, attachments, items, modes, maps, things to earn) goes to
  its update.
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
5. **The play link** (IM2): the tag publishes itself to https://ggbillyjoe3526.github.io/Airsoft/
   (`.github/workflows/pages.yml`). Check the title screen there names the new release; if it doesn't, the Play link
   run in Actions says why, and **Run workflow** publishes it again.
6. **The archive check** (DX2): run `wc -c docs/*.md`. A live doc over about 50 KB gets its finished parts moved word
   for word to `docs/archive/<release>/` (the folder is named for the stage just closed, such as `0.1-beta/`; make it
   if it is missing), the full wording of anything shortened goes there too, and `docs/archive/README.md` names the
   folder. Fix every `›` heading reference that pointed at moved text (`grep -rn "<heading>" . --exclude-dir=archive`).

## Pull requests and branches

- **Every change is a pull request** (owner, 2026-10-02) from a new branch made from the latest `main`, one per
  milestone or batch. **Never push to `main`.** One pull request may hold several commits.
- **Review agents on every code change** (owner, 2026-10-16). A pull request that touches code, config, assets or
  gameplay data is marked ready only once the critic, QA and performance agents (`.claude/agents/`) have run and
  passed, and its description's `Review:` line gives their verdicts (`pipeline/README.md` › Pull request description);
  CI's `review` gate checks the line. This holds outside the pipeline too. Docs-only pull requests skip them.
- **Who merges.** Every pull request is merged by its own thread, never by the owner (owner, 2026-10-16: "You should
  be merging. Not me"). A code pull request merges once CI is green and the review agents passed (its `Review:` line);
  a docs-only one once CI is green.
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
- **The project chat carries results, blockers and decisions only** (owner, 2026-10-06). A thread
  replies when it has a result, hits something only the owner can unblock, or needs his decision; progress goes in its
  status checklist. The coordinator posts the same three in the project chat (plus the one-line receipt for a new ask),
  never a per-milestone progress line.
- **Pausing.** When the owner says stop or usage is running out, commit and push the work in progress on its branch
  (never patch folders) and say where it stopped.
- **Shared files stay lean** (owner, 2026-10-12 tidy-up: 1.1 GB down to 192 MB, most of it raw test dumps and PNG
  concept pictures). Copy a run's reports there, never the raw `playwright.json`, `vitest.json` or logs. Save review
  pictures as JPEG, not PNG. Once the work merges, keep the approved pictures and delete the rest of their folder.
- **`docs/HANDOFF.md`** is a short "now": what is being built, what is next, what waits on the owner. The planning
  thread rewrites it once per batch (replace it, don't append). Engine facts live in `docs/ARCHITECTURE.md` and the
  folder READMEs, not there.

## Models

Which model runs which job (owner, 2026-10-08); the roles themselves are in `pipeline/README.md` › Roles. A thread
never changes a model or an effort level unless the owner asks.

- **Opus 5.5 for the coordinator, the planning thread and `tier: core` tasks,** each bug pass (`BP<n>`) and the fixes an
  audit hands on among them. Opus threads run at Extra effort (`xhigh`), the owner's project setting; a `worker` agent a
  thread splits its task to inherits the thread's model at high effort. The critic runs on Opus for core tasks and near
  misses, and the performance agent when a regression stays unexplained.
- **Sonnet 5.5, medium, for `tier: ui`, `tier: trivial` and `tier: fix` tasks** (a fix in a core system, such as the
  simulation, physics or bots, on Opus), QA, and the other critic and performance runs.
- **Haiku 5.5, low, for small helper jobs:** the changelog and triage agents, and the diff check on a docs-only
  `tier: trivial` task.
- **Fable 5.1 only with the owner's explicit approval, asked for each time.** It costs far more than Opus, so it is
  proposed only where it would do significantly better: an audit, or a review of a major architectural change, a
  major redesign, or how a new system fits into the project. The ask names the job, why Opus is not enough and the
  effort level; nothing starts on Fable until he says yes. A Fable thread writes a report and changes no code; what it
  asks for is built as tasks on the models above.

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
  `vite preview`) plays the modes; the Playwright MCP server (Dev tools, below) adds exploratory play where it loads.
- **Balance.** Run the balance report, `node pipeline/balance.mjs` (about 20 minutes; `pipeline/README.md`), and copy it
  to the run folder. Each figure **outside** its band by two standard errors or more is a balance issue: fix it in the
  pass or log it in `docs/KNOWN_ISSUES.md`. One **outside, within noise** is re-measured on more seeds before anyone acts;
  one **near an edge** is noted. A task that changes balance on purpose runs its own filter and quotes the figures in
  its record: figures are reported, never asserted, since noise across seeds made pass/fail bands cost re-measure loops.
- **Seeds.** The headless bot guards keep only what must never happen, but a fix that touches movement or materials
  can still fail one seed. Re-measure over 16 seeds before changing a threshold.

## Dev tools

None of these reach the game (TL1, owner 2026-10-18). Versions are pinned; licences in `docs/ASSETS.md` › Libraries.

- **Browser MCP servers** (`.mcp.json`, started by `tools/mcp-browser.mjs`, which picks the flags for a PC or a cloud
  session). Claude Code asks once per machine before it starts them. **Chrome DevTools MCP** when a number or an error
  is the question: record a performance trace of a hitch, take a heap snapshot for a leak, read source-mapped console
  errors. **Playwright MCP** for exploratory play in a bug pass: click through menus and matches and read live values,
  where a scripted e2e test would only check what it was written for. Each uses its own throwaway browser profile.
- **Property tests** (fast-check through `@fast-check/vitest`): `*.property.test.ts` beside the code, in the `fast`
  project. Each has a fixed seed, so a run is repeatable; a failure prints the smallest failing input with its seed and
  path. A property that finds a real bug outside the task's scope gets a `docs/KNOWN_ISSUES.md` row with that seed.
- **knip** (`npm run knip`; `npm run knip -- --production` for only what the shipped game reaches). Not a gate: run it
  before a tidy-up task. Most `--production` findings are exports kept for tests, which is fine.

## The pipeline

Every task runs through the build pipeline (owner's design, 2026-10-04). `pipeline/README.md` is the protocol: the
roles, the eight steps, the gates, the critic's verdict, the near-miss re-run and the four-attempt rule with the owner's
auto-accept, and the record. `.claude/skills/pipeline/SKILL.md` is the step list a build thread follows,
`docs/TASKS.md` the open tasks with their acceptance criteria, and `.claude/agents/` the agents (worker, qa,
performance, triage, critic, changelog; the critic's eight checks are in `critic.md`). The policy it carries:

- **Review agents on every code change** (owner, 2026-10-16): above, › Pull requests and branches. A docs-only
  `tier: trivial` task is accepted by green gates plus a Haiku diff check.
- **Four attempts, then auto-accept or the owner** (owner, 2026-10-04): a task stops after four, so a hard one reaches
  the owner instead of looping.
- **The owner's playtest wins.** The critic cannot play the game: it lists browser tests for the owner, whose playtest
  overrides it.
- **Fixes are lighter (`tier: fix`, audit A5, 2026-10-17).** Beta is mostly small fixes, and the full record and
  change notes were sized for Dev features: up to nine documents for a balance tweak. A fix keeps every check that
  catches a bug (the gates, QA, performance, the critic) and skips only paperwork that tells nobody anything new: no
  FEATURES or PLAYTEST edit unless the player sees a difference, no Known issues section when it leaves none, and the
  critic on Sonnet unless a judgment near miss needs Opus.
- **Records.** Each task writes `docs/records/<id>.md` (format in `docs/records/README.md`); records before 2026-10-08
  are in `docs/archive/0.1-dev/REVIEWS.md` and `METRICS.md`.

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
