# MV2 · Holster run, wrist pose, no own body in view (Beta 1 playtest items 18, 21, 24)

**Review:** 1 attempt · 8/8 · Accept (Opus)

## Attempts

| Date | Attempt | Worker model | build | tests | smoke | perf | scope | changelog | Critic | Retry reason | Wall time | Worker tokens |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 2026-10-17 | 1 | Opus 5.5 (build thread) | ✓ 18 s | ✓ 531 s | ✓ 1186 s | ✓ 2932 s | ✓ | ✓ | 8/8 Accept (Opus) | – | ~5 h | QA 46k, performance 32k, critic 81k |

## Decisions

- **The holstered run is 5.4 m/s, the sprint stays 6.3 m/s.** The owner asked for a little faster; 25 m takes 4.6 s against 6.0 s before and 4.0 s sprinting (also in DECISIONS).
- **Your own figure is never drawn in first person, at any pitch or in a vault; it stays posed for spectating.** The owner's playtest item 24, replacing BD1's look-down body (also in DECISIONS).
- **The firing hand turns about its thumb root: 0.55 rad on the AEG and GBB Pistol, 0.45 on the Cyber Pistol.** It tips the hand about 10° and 4° up while the thumb the owner liked stays put; the Cyber's slimmer grip has less room before the robot plates reach the 3 mm limit.
- **The forearm runs back about level from the wrist (`gripElbow` per replica).** The old elbow sat high, which bent the wrist down; level puts the hand 8° above its arm.
- **The index finger keeps its old line along the frame (`HandPose.indexAim`).** Turning the palm would have lifted the trigger finger off the frame; only its first segment is aimed, the other two bend as before.
- **Two seed-sensitive bot guards were re-seeded, not loosened.** The faster run moves every bot path: the Depot dead-end guard reads 16 seeds (six read 0 against 0 at 5.4), the Woodland hunt guard reads seeds 1 and 6 (seed 4 now hunts only 297 ticks); both pass on main at 5.0 too.
- **The perf gate ran again after PF4.** Before it, Neon Extraction Medium WebGPU read 200,980 against 200,000 here and 197,096 on main, as the faster run brings bots into view sooner; budget lines are never raised (owner), and after merging PF4 (#263) it reads 178,091. On that run one heap-growth test (`g9EffectsQA`, effects code this task leaves alone) read over its line under the gate's load and passed alone three times and on the tests gate's rerun.

## Known issues left

- Your own figure casts no shadow in first person (KNOWN_ISSUES › Figures and art, document).
