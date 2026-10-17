# HV1 · The hit area fits each rigged figure (with the figures going default)

**Review:** 3 attempts · 7/8 · Accept (Opus) · qa Pass · performance Pass

## Attempts

| Date | Attempt | Worker model | build | tests | smoke | perf | scope | changelog | Critic | Retry reason | Wall time | Worker tokens |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 2026-10-16 | 1 | Opus 5.5 (build thread) | ✓ 17 s | ✗ 493 s (3 bot-match tests under the rigged hits) | ✗ 1057 s (boot shader error under load; Woodland 5v5 Medium 204,881 of 200,000) | ✓ 1843 s | ✓ | ✓ | – no critic on a red gate | your own body drawn looking level; seed-sensitive extraction and follow tests | ~2 h | QA ~60k, changelog ~20k |
| 2026-10-16 | 2 | Opus 5.5 (build thread) | ✓ 17 s | ✓ 482 s | ✗ 1026 s (Woodland 5v5 Medium 257,287 of 200,000) | ✓ 1804 s | ✓ | ✓ | – no critic on a red gate | four teammates at full detail at the spawn on Medium | ~1.5 h | – |
| 2026-10-17 | 3 | Opus 5.5 (build thread) | ✓ 16 s | ✓ 472 s | ✓ 1017 s | ✓ 1802 s | ✓ | ✓ | 7/8 Accept (Opus) | – | ~1.5 h | QA ~24k, performance ~59k, critic ~162k |

## Decisions

- **The head, chest, shoulders and hips sit on each figure's own bones, with a shape fitted per figure**
  (`FIGURE_HIT_SHAPES`, the owner's ruling "fit to each figure"; also in DECISIONS). They are sampled from the clips as
  the figures load, like the legs since IM8, and each character's volume takes the shape of the figure it is drawn as.
- **The chest is two capsules side by side and the shoulders one across**, fitted by coordinate descent over M85's grid
  on all 16 poses of both figures and all four human heads: the worst pose is the human's walk with the heel down, 3.4 %
  missed of the 4 % allowed; thin air is at most 2.4 % of the 3 %.
- **The volume leans with the figure**, so the sprint gap is closed (thin air was up to 16 % sprinting; now 1.2 %).
- **The upper body is the aimed pose while alive and on foot,** the clip's whole-body pose otherwise (calling a hit,
  walking off, out, vaulting), held upright over the clip's pelvis as the drawn figure is.
- **The peek rolls every point but the hips**, as the drawn figure rolls its upper body over its hips.
- **The built-in volume is unchanged** (its two new parts have radius 0 and are never hit); it stays for a match whose
  figure files can't load.
- **The headless bot matches play with the rigged hit rules** (`ai/riggedHitsSupport.ts`). The full balance run:
  0 of 105 figures outside their bands, 4 outside but within noise (main the same day: 0 outside, 3 within noise).
- **Two extraction tests clear the exit you count at, and the Stack House follow floor is 250 ticks**: under each
  figure's own hit area a guard on seed 4 walks into the exit (which pauses the count, as it should), and seed 1's
  leader is hit early (seeds 1-16: 281 to 2,801 ticks, every one near).

## Known issues left

- The content toolkit's mode checks still play with the built-in hit volume (critic check 8; KNOWN_ISSUES › Build,
  tests and pipeline).
