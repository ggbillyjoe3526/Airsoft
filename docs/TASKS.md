# Tasks

Open tasks only, one block each (format in `pipeline/README.md`). A task that lands leaves this file in its records
commit, before its pull request merges (CI's scope gate finds the block in the branch's history): its REVIEWS line, its
ROADMAP row and the CHANGELOG line are the record. The planning thread writes blocks; the build thread
keeps `status` and `attempts` current.

## M63 · Map cache, shader warm-up and GPU timer restore (Audit 2 REN PR 3: REN-01, REN-06, REN-07)
tier: core
perf: required
touches: src/map/lightingChoice.ts, src/render/renderer.ts, src/render/combatPresentation.ts, src/matchSession.ts, docs/KNOWN_ISSUES.md, docs/DECISIONS.md, docs/ARCHITECTURE.md
contract: none
acceptance:
  1. Taking Neon Heights from `MapMeshCache` under 'night' or 'day', releasing it and taking it again under the same pick gives the same group with `reused === true` and nothing freed; changing the pick builds again (`mapMeshCache.test.ts`, `lightingChoice.test.ts`).
  2. `MatchSession`'s constructor ends with exactly one `Renderer.warmShaders` call, which compiles the world and the held replica under the first frame's environment and render target; no frame calls `compile` and the Play flow is unchanged (`renderer.test.ts`).
  3. After a WebGL context is lost and restored, the next timed frame begins a query made on the restored context, never one from the lost context, and GPU ms comes back (`renderer.test.ts`).
  4. KNOWN_ISSUES row 161 is closed, with the shadow-depth remainder and the laptop check noted.
status: gates
attempts: 0
