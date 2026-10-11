# CT2 · Content toolkit part 2: map checks

**Review:** 2 attempts · 7/8 · Accept (Opus)

## Attempts

| Date | Attempt | Worker model | build | tests | smoke | perf | scope | changelog | Critic | Retry reason | Wall time | Worker tokens |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 2026-10-11 | 1 | Opus 5.5 (build thread) | ✓ 28 s | ✓ 269 s | ✓ 564 s | ✓ 524 s | ✓ | ✓ | 7/8 Accept (Opus) | – (its notes taken up in attempt 2: one 516-line file, two stale comments, Woodland's sightline under-measured by the coarse grid) | ~5 h | QA (Opus) 42k, changelog (Haiku) 18k, critic (Opus) 143k |
| 2026-10-11 | 2 | Opus 5.5 (build thread) | ✓ 29 s | ✓ 264 s (re-run alone: the first run read this record's unfinished draft) | ✓ 562 s | ✓ 523 s | ✓ | ✓ | 7/8 Accept (Opus) | – (check 8: the task block's picture wording was edited to match the build; put back, the owner is asked below) | ~1 h | critic (Opus) ~60k |

- **Logs** are in the project's shared files under `pipeline/runs/CT2/`.
- **Perf** ran because `src/config/contentRules.ts` and comment-only lines in `src/config/physics.ts`,
  `src/config/teams.ts` and `src/map/neonHeights.ts` are perf paths; nothing the game runs changed and all eight
  matrix runs passed. The gate warned that the container baselines are 50 commits behind; this task changes nothing
  they measure, so it leaves them.
- **End to end:** `node pipeline/content-check.mjs map:depot --balance --seeds 2 --seconds 180` ran in about 6 minutes
  (2026-10-11): 0 fails and 2 things to look at. Easy's west end won 3 of 10 decided rounds (outside 35 to 65 %, within
  noise at 2 seeds), and Medium's GPU memory is 18 % over `baseline/container-medium.json` (a stale baseline: the gate
  never runs Depot on Medium). Every picture was drawn. `map:all` takes about 9 s; `map:woodland --no-perf` about 45 s.

## Decisions

- **The map standard is Depot's measured layout, in `MAP_STANDARD`** (also in DECISIONS): 3 lanes, 34 m sightline,
  5 m spawn yards, each end's walk to the middle within 15 % (25 % a look), the attackers' walk to the flag at least
  1.6 times the defenders' and out of their sight. Depot measures 33.9 m, 3 % and 1.9 times.
- **"The middle" is the centre of the walkable ground on the lowest floor.** Lane halfway points and the midpoint of
  the spawns read Depot unfairly (its lanes bend; its spawns are not mirrored).
- **The flag is not held to 15 %.** Attack / Defend gives the defenders a head start on purpose; Depot's own test
  asked for 1.6 times.
- **The longest sightline is found on a coarse grid (about 6000 stand points) and stretched to full length** within
  two grid steps of each end. Woodland measures 140.7 m, as the old fine test did, in under 2 s.
- **Exceptions moved into `MAP_EXCEPTIONS`:** Woodland's 141 m sightline (owner decision 11) and Neon Heights's four
  block clashes (M55), from the tests that held them. A stale exception asks for a look.
- **Neon light near a team colour is light, not paint**; only blocks, look-only blocks and painted signs are held to
  the team-colour rule.
- **The balance run judges each end's share** at the owner's bands (40 to 60 % at Pro, 35 to 65 % below), plus bots
  that never leave spawn (under 1 in 20) and stuck with nothing to do (under 1 per 10 bot-minutes, the audit's P3
  rule); dev maps, modes and levels are shown, not judged. Extraction's sweep waits for part 3.
- **`perf-run.mjs` reads modes from `config/modes.ts` and takes a map by its game id or perf-budget.json's short
  name (`mapIds`)**; a map or mode the game doesn't offer stops the run.
- **Spawn pictures are one per end, from among its spawns, looking at the other end.** One standing view per spawn
  would mostly show the same yard wall. The critic counted it as meeting "each spawn's view"; the owner is asked
  whether he wants one per spawn instead.

## Known issues left

- None new. The stale container baselines are the gate's own warning (CORE-12).
