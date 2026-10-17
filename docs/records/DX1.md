# DX1 · Docs: one source for each rule, and the stage everywhere (audit A7, A9, B11, B12)

**Review:** 1 attempt · trivial · Accept (Haiku diff check)

## Attempts

| Date | Attempt | Worker model | build | tests | smoke | perf | scope | changelog | Critic | Retry reason | Wall time | Worker tokens |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 2026-10-17 | 1 | Opus 5.5 (build thread) | ✓ 23 s | ✓ 188 s (fast) | – CI | – not required | ✓ | ✓ | trivial Accept (Haiku diff check) | – | ~1 h | changelog 18k |

## Decisions

- **The protocol is `pipeline/README.md`, the policy `docs/PROCESS.md`.** The critic's verdict, the near-miss re-run
  and the four-attempt rule moved to `pipeline/README.md` › Verdict and attempts; PROCESS › The pipeline keeps the
  owner's rulings and points there; the models live only in PROCESS › Models (the Roles table lost its model column).
- **The critic's eight checks stay in `.claude/agents/critic.md` only.** The agent needs the full wording to tick them;
  PROCESS's copy of the table went.
- **A contract heading is inserted above its bullet, not in place of it.** `pipeline/packet.mjs` finds each contract
  by its bold lead, so the entries parse exactly as before (18 contracts, the same files each).
- **The M27 example in `pipeline/README.md` stays fenced, its lines indented two spaces.** A heading grep then lists
  no example as a task; inside a fence the text still reads as a block.
- **Code comments keep their "token plan item" notes.** The acceptance covers docs; comments are pruned when a file
  is already open (audit B11). ROADMAP's Dev 5 section keeps its TE step names until DX2 archives it.

## Known issues left

- None.
