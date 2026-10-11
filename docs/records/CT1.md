# CT1 · Content toolkit part 1: rulebooks, replica and part checks, the report

**Review:** 2 attempts · 8/8 · Accept (Opus)

## Attempts

| Date | Attempt | Worker model | build | tests | smoke | perf | scope | changelog | Critic | Retry reason | Wall time | Worker tokens |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 2026-10-11 | 1 | Opus 5.5 (build thread) | ✓ 40 s | ✓ 468 s | ✓ 851 s | ✓ 837 s | ✓ | ✓ | 6/8 Retry, near miss (Opus) | nine checks without a fault test; the LiPo's grandfathering not in DECISIONS | ~6 h | QA (Sonnet) 66k, changelog (Haiku) 22k, critic (Opus) 136k |
| 2026-10-11 | 2 | Opus 5.5 (build thread) | ✓ 39 s | ✓ 463 s | ✓ 814 s | ✓ 785 s | ✓ | ✓ | 8/8 Accept (Opus) | – | ~1 h | critic (Opus) 42k |

- **Logs** are in the project's shared files under `pipeline/runs/CT1/`.
- **Perf** ran because `vite.config.ts`, `src/config/contentRules.ts` and `src/pool/kit.ts` are perf paths; nothing the
  game runs changed. The gate warned that the container baselines are 34 commits behind; this task changes nothing
  they measure, so it leaves them.
- **End to end:** `node pipeline/content-check.mjs 000007 --balance --seeds 2 --maps depot` ran in about 70 s
  (2026-10-11): 0 fails, 3 balance figures outside within noise at 2 seeds, every picture drawn.

## Decisions

- **Reports are written under `pipeline/out/content/<id>/`.** Git keeps build output out; the thread copies a report to
  the project's shared files and attaches the HTML page.
- **Every public item is registered as public "before the toolkit", and the LiPo keeps its faster fire.** What shipped
  stays as it is; the owner can overrule it (also in DECISIONS).
- **The toolkit's rules bind later tasks.** Registers take entries and ranges, budgets and band change only on the
  owner's word (also in DECISIONS).
- **Extraction is left out of the balance run.** It plays as runs, not rounds; its sweep comes with the mode checks
  (part 3).
- **The kit grid tries every combination up to 100,000, at the commonest and rarest tier.** The AEG's 30,000 take
  about 0.3 s; past the limit it spreads its picks evenly over all of them.
- **A balance figure outside its band within noise asks for a look, not a fail.** Two-seed runs are noisy; the report
  says to re-run on more seeds before acting.
- **A replica plays each ordinary public replica of its class; a part plays its replica with and without it.** A
  chase item is no rival, and bots carry their primary only.

## Known issues left

- Bots lead and judge their friendly line by the default loadout's first replica, not the one they carry
  (KNOWN_ISSUES › Bot behaviour, can wait).
