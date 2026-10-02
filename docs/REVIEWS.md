# Critic reviews

One line per feature: feature · attempts used · final score · verdict.

| Feature | Attempts | Final score | Verdict |
|---|---|---|---|
| Scaffold + first-person scene | 4 of 4 (7.7 → 7.9 → 8.4 → 8.2) | 8.2 | Auto-accepted (attempt 4 ≥ 8.0); remaining issues in KNOWN_ISSUES |
| Movement fixes + Depot map | 3 of 3 (7.2 → 8.1 → 7.6) | 7.6 | Auto-accepted (attempt 3 ≥ 7.0, rules relaxed mid-feature); launch regression fixed before commit; remaining issues in KNOWN_ISSUES |
| Replicas + BBs | 3 of 3 (7.2 → 7.5 → 7.9) | 7.9 | Auto-accepted (attempt 3 ≥ 7.0); reload pose and seat timing tweaked after review; remaining issues in KNOWN_ISSUES |
| Hits + hit calling | 3 of 3 (7.9 → 8.3 → 8.4) | 8.4 | Auto-accepted (attempt 3 ≥ 7.0); remaining issues in KNOWN_ISSUES |
| Bots + navigation | 3 of 3 (7.4 → 8.1 → 8.0) | 8.0 | Auto-accepted (attempt 3 ≥ 7.0); two-shooter hearing twitch fixed after review; remaining issues in KNOWN_ISSUES |
| Full matches (clock, score, first to 5, result screen) | 3 of 3 (7.7 → 8.4 → 8.6) | 8.6 | Accepted; the review's small leftovers (round-loss wording, shared whistle schedule, audio pause) fixed in the bug pass |
| Phase 2 M1: walk/sprint keys, key bindings, bigger Depot | 3 of 3 (7.9 → 8.2 → 8.6) | 8.6 | Accepted; leftovers (debug-key priority on old saves, reserved-key message, indentation) fixed after review |
| Phase 2 M2: footsteps, bots hear them, sound pass | 3 of 3 (7.6 → 8.4 → 8.8) | 8.8 | Accepted; footstep ranges and caps are first guesses (KNOWN_ISSUES) |
| Phase 2 M3: reload hand, hit flinch, hit puffs, smooth turning | 2 of 3 (8.3 → 8.8) | 8.8 | Accepted; support-hand placement and reload pose size to confirm in the owner's playtest |
| Phase 2 M4a: difficulty levels, fairer close range, per-enemy contacts, bot brain split | 3 of 3 (8.1 → 8.4 → 8.7) | 8.7 | Accepted; minor leftovers in KNOWN_ISSUES (waiting level tracked in two places, picker shows the waiting level) |
| Phase 2 M4b: crouch-peeking, moving as a team, varied routes, walking | 3 of 3 (7.8 → 8.2 → 8.2) | 8.2 | Auto-accepted (attempt 3 ≥ 7.0); a hollow test assertion fixed after review; leftovers in KNOWN_ISSUES (longer round tail, contact cover before reaction, re-contact cycle untested) |
| Phase 2 M5: Attack / Defend (flagpole objective, overtime, half-time swap, mode picker) | 3 of 3 (8.1 → 8.3 → 8.4) | 8.4 | Auto-accepted (attempt 3 ≥ 7.0); mode-text mismatch and the overtime bound in the match test fixed after review; leftovers in KNOWN_ISSUES |
| Phase 3 M7b: leaning (hold Q / E: peek with head and shoulder, wall clamp, walk-pace blend) | 2 of 3 (8.2 → 8.6) | 8.6 | Accepted; leftovers in KNOWN_ISSUES (wall-clamp view jump, sprint resume after a lean, camera rig untested) |
| Phase 3 M8: magazines and reloads (a pouch of mags, swap in the fullest, no topping up; HUD gauges) | 3 of 3 (8.2 → 8.4 → 8.7) | 8.7 | Accepted; stale-notice leftover fixed after review; leftovers in KNOWN_ISSUES (bots don't ration, colour-only gauge cues, refusal rule to playtest) |
| Phase 3 M9: BB physics pass (joules + BB weight; mass-driven drag, hop and spin; drag ~60% of real; suppressor sound groundwork) | 2 of 3 (8.4 → 8.5) | 8.5 | Accepted; leftovers in KNOWN_ISSUES (suppressed path untested, tracer review on paper, bots under-lead at range) |
| Phase 3 M10: movement and positioning (spread by stance and movement, 2σ crosshair; bots lean round corners; friendly-fire check past the target) | 4 of 4 (7.9 → 8.5 → 8.4 → 8.4; stricter thresholds from attempt 2) | 8.4 | Auto-accepted (attempt 4 ≥ 8.0); leftovers in KNOWN_ISSUES (spread-to-muzzle and crosshair maths untested as wiring, corner-heavy bots, double movement penalty for bots, in-air flash guarded) |
| Phase 3 code review pass (whole codebase: route planner round-robin, HUD low-ammo colour, per-load seed with exact derivation, low cover in the bots' friendly-fire check, stale comments) | 4 of 4 (7.9 → 8.3 → 8.4 → 8.4; attempt 1 restarted) | 8.4 | Auto-accepted (attempt 4 ≥ 8.0); leftovers in KNOWN_ISSUES (friendly-hit guard headroom, burst pause, wall heuristic, seed visibility) |
| Phase 3 audit fixes C-02 + C-03: browser smoke test of the production build (Playwright) and a GitHub checks workflow | 2 of 4 (7.9 → 9.0) | 9.0 | Accepted; attempt 1 restarted (the test didn't really fire or reload). Watch the reload poll if CI ever flakes (a bot hit could end it). |
