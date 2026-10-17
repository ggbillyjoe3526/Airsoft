# PF1 · No shader hitches mid-match

**Review:** 2 attempts · 8/8 · Accept (Opus)

## Attempts

| Date | Attempt | Worker model | build | tests | smoke | perf | scope | changelog | Critic | Retry reason | Wall time | Worker tokens |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 2026-10-17 | 1 | Opus 5.5 (build thread) | ✓ 18 s | ✓ 596 s | ✗ 1565 s (Neon Heights at night on WebGPU timed out) | ✗ 2119 s (every WebGPU run timed out before round 1) | ✓ | ✓ | – gate failed | Frames drawn during the wait starved WebGPU's shader build | ~8 h (with the before and after measurements) | QA 45k, changelog 22k |
| 2026-10-17 | 2 | Opus 5.5 (build thread) | ✓ 19 s | ✓ 576 s | ✓ 1320 s | ✓ 3139 s | ✓ | ✓ | 8/8 Accept (Opus) | – | ~6 h (two full gates: a merge of main, then the touches line) | QA re-check 46k, performance 32k, critic 19k (refused: head moved) and 77k |

## Decisions

- **Measured in the container on SwiftShader (WebGL2, Depot, cold cache per preset), counting the pipelines each first use builds inside a frame.** Before, after the round went live: Low 7 (a figure's fade), Medium 13 (6 in round 1's opening frames, 7 on a fade), High and Ultra 10 (3 light-shaft pipelines on facing the sun, 7 on a fade); the overtime flag, a tossed magazine, the 2x scope and a replica switch built none since KI1. After: none on any preset, on WebGL2 and on WebGPU (Low, Medium, High). The figures and the script are in the project's shared files (`pipeline/runs/PF1/measurements/`).
- **Round 1 waits for the warm-up: the sim holds (no ticks, input latches cleared) until every pipeline is built and drawn once; the owner chose that over a 10 % cap on load time (2026-10-17) (also in DECISIONS).** Click to round 1 in the container (WebGL2): Low 5.7 → 7.7 s, Medium 10.1 → 22.9 s, High 15.5 → 23.2 s, Ultra 14.6 → 27.4 s; click to every pipeline built: 10.6 → 6.8, 25.0 → 20.8, 34.8 → 21.8, 40.8 → 25.1 s. The "match build" line is unchanged within noise.
- **While the match waits, its first picture holds: no frame is drawn until the pipelines are built (`hold`, Renderer.render).** Each frame drawn meanwhile slowed the build, which waits on the GPU between pipelines; on WebGPU in the container it had not finished after two minutes (the full gate's first run: every WebGPU perf run timed out), and now takes 3–13 s. A resize draws the picture again.
- **The wait never lasts longer than 60 s (`RENDER.warmUpLimitMs`); then the round starts and the warm-up's draws come when the build settles.** Only a guard against a build that never settles (the performance review's advisory); the container's slowest wait was Ultra's ~27 s.
- **The kicked dust is shown for the warm-up (`DressingEffects.warmTargets`).** Hidden until something kicks it, its WebGPU particle pipeline built on the first kick.
- **The warm-up compiles and draws with frustum culling off.** Three compiles and draws only what is in view, so a material first seen on turning, or a caster first inside the sun's shadow box, built mid-round.
- **Three's compile skips the shadow pass, so the warm-up also draws the frame for real, under the next frame and before it, once per pose.** The poses (`characterRenderer.ts` `warmPoses`) are every figure fading, then solid, each with every hidden part shown; the solid pose is last so the frame's own draw keeps its draw records.
- **A figure's fade is warmed with see-through copies of its materials, kept for the match and freed with it.** Toggling the figure's own materials made Three re-key its draws and free the see-through pipelines the moment they turned solid again.
- **The light shafts draw at zero strength with the sun off screen while warming (`PostFrame.warming`).** They draw only while the sun is on screen, so facing it built three pipelines on High and Ultra.
- **`?perf` logs "perf: N pipelines built mid-play at tick T" for any frame that builds one.** The check William runs on his PC (PLAYTEST › Graphics and performance).
- **Only SwiftShader (WebGL2 and WebGPU) was measured.** On a real GPU the wait before round 1 and anything left are unmeasured; auto picks WebGPU on most desktops.

- **The 60 s limit's timer is not cleared when the warm-up settles first.** Its late call does nothing; it keeps a finished match's warm-up closure for at most 60 s (critic's advisory, left as is).

## Known issues left

- No shader builds mid-match is measured on SwiftShader only (WebGL2 and WebGPU) (KNOWN_ISSUES › Graphics and performance, playtest).
- Each figure's fade still makes about 20 draw records on the CPU (KNOWN_ISSUES › Graphics and performance, can wait).
- A rigged figure's held replica makes two shadow draw records on its first shadowed frame (KNOWN_ISSUES › Graphics and performance, can wait).
