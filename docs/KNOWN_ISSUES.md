# Known issues

Classified as **fix now / document / can wait**.

| Issue | Class | Notes |
|---|---|---|
| Automated browsers can't take pointer lock | document | Use the dev-only `?nolock` URL flag. |
| Ledges 0.2–0.3 m tall are sticky or block walking | document | Rapier autostep limit with capsules; keep map ledges ≤ 0.15 m or ≥ jumpable cover height. |
| Firefox ignores `unadjustedMovement` (raw mouse input) | can wait | Sensitivity may feel different vs Chrome/Edge when OS acceleration is on. |
| Chrome refuses pointer re-lock for ~1 s after Esc | document | Start screen shows a "click again" hint (promise rejection or `pointerlockerror`). Firefox path untested. |
| Jump pressed 1-2 ticks before landing is ignored (no jump buffering) | can wait | Deliberate for a "limited hop"; revisit after playtesting. |
| Rapier capsule controller sinks into cuboid colliders along their diagonals | document | Worked around: level blocks are trimeshes (see DECISIONS). Never add cuboid level colliders. |
| Walking stutters: ~once a second Rapier returns ~no horizontal movement for one tick after a floor contact; `velocity = corrected/dt` turns that into a full stop (~0.12 s re-accel) | **fix now** | Present since attempt 1 (cuboids too). Fix first in the next movement/feel step, before bots: remove velocity only along collision normals. |
| Camera pops up to ~5 cm near a block's top-face triangle diagonal (x = z through its centre) | fix now | Side effect of trimesh colliders; far better than sinking. Untested; investigate with the stutter fix. |
| Diagonal regression tests allow a 4 cm sink (`y > surface - 0.02` while rest height is +0.02) | fix now | Tighten to ±0.01 of rest and assert no stops/bumps, alongside the stutter fix. |
| A capsule spawned overlapping a block is trapped inside it | document | Spawns and bot placement must never overlap level geometry. |
| Spawning at exactly y = 0 starts inside the 0.02 m controller skin (first-tick dip, slow recovery) | can wait | Spawn slightly above the floor. |
