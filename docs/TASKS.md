# Tasks

Open tasks only, one block each (format in `pipeline/README.md`). A task that lands leaves this file in its records
commit, before its pull request merges (CI's scope gate finds the block in the branch's history): its REVIEWS line, its
ROADMAP row and the CHANGELOG line are the record. The planning thread writes blocks; the build thread
keeps `status` and `attempts` current.

## FA11a · Build, tests and pipeline hygiene
tier: core
perf: skip
touches: pipeline/gate.mjs, pipeline/scope.mjs, pipeline/scope.test.mjs, pipeline/build-cached.mjs, pipeline/perf-run.mjs, pipeline/README.md, .github/workflows/check.yml, .claude/agents/qa.md, .claude/agents/worker.md, .claude/skills/pipeline/SKILL.md, playwright.config.ts, vite.config.ts, tsconfig.json, package.json, src/config/precompress.ts, src/config/sounds.ts, src/audio/soundBank.ts, src/pool/pool.ts, src/pool/armory.ts, src/pool/collection.ts, src/sim/simulation.ts, src/sim/round.ts
contract: none
acceptance:
  1. CORE-07: the scope gate no longer lets a task change `pool.md` or `CLAUDE.md` outside its `touches`; the rules live in `pipeline/scope.mjs` with tests
  2. CORE-08: CI runs the scope and changelog gates for the task id(s) a pull request's title starts with (a block the branch already cleared is found in its history); pipeline/README.md and check.yml say plainly what still runs only locally (perf, the laptop frame-time budget, the critic)
  3. CORE-09: a browser test loads a build without `?nolock&seed=1` and takes the real pointer lock (Play, lose it → pause, Resume); a Firefox project can't be run where the pipeline runs, so KNOWN_ISSUES says so
  4. CORE-13: `exactOptionalPropertyTypes` is on and `tsc --noEmit` is clean
  5. CORE-14: CI installs Playwright's system libraries only when the cached Chromium can't start without them, and each bundle (production, e2e) is built once per run
  6. CORE-18: docs/TASKS.md holds no landed (`done`, `accepted`) blocks, and the pipeline's records step clears a task's block
  7. CORE-22: the perf harness and the smoke test reuse an e2e (or production) build made from the same source; a browser test boots the production build (`dist/`) and checks the test flags and `window.airsoft` are absent
  8. CORE-24: the unused exports the audit lists are gone or private, the test-only ones say so
  9. CORE-27: pipeline/README.md and the agents' timings match the scripts (re-measured), and the laptop frame-time gate is named as a manual owner step
  10. CORE-29: the production build writes Brotli and gzip copies of its compressible files with node:zlib (no new dependency), and README says how a static host serves them
status: gates
attempts: 2
