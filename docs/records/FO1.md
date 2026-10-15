# FO1 · Bushes stop and throw off BBs (Dev 6 item 44)

**Review:** 1 attempt · 8/8 · Accept (Opus)

## Attempts

| Date | Attempt | Worker model | build | tests | smoke | perf | scope | changelog | Critic | Retry reason | Wall time | Worker tokens |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 2026-10-15 | 1 | Opus 5.5 (build thread) | ✓ 21 s | ✓ 486 s | ✓ 920 s | ✓ 1744 s | ✓ | ✓ | 8/8 Accept (Opus) | – | ~3 h | QA (Sonnet) 54k, changelog (Haiku) 25k, critic (Opus) 107k |

- Reports in `pipeline/runs/FO1/attempt-1/` (project files). Pictures from the e2e build in
  `concepts/foliage-stops-bbs-2026-10-15/` (project files): leaves out of a bush a BB stopped in, and the notice from
  inside one.

## Decisions

- **0.6 m of leaves stops a BB, the depth bots can't see through (also in DECISIONS).** `BALLISTICS.leaves.stopDepth`, held equal to `foliageSeeThrough` by a test, counted over the BB's whole flight (`BB.leaf`), so two thin edges in a row add up. Someone less than 0.6 m into a bush's edge can still be hit.
- **An edge throws a BB off by up to 0.5 rad a metre of leaves and keeps 0.35 of its speed and spin a metre (also in DECISIONS).** An even pick of the angle from the simulation's seeded stream, any way round the line. A crossing that takes more than a tick turns the BB each tick it is inside; leaving a bush drops the rest of that tick's travel, as a bounce does.
- **Bushes come to the BBs as `WorldQuery.foliage`, from PhysicsWorld.** Every world built from a map gets them, with no collider, so people still walk through; a world without it flies BBs exactly as before (tested).
- **Bots hold fire through more than 0.25 m of bush; Easy (`firesIntoLeaves`) fires through as much as a BB could cross (also in DECISIONS).** The check reads the same bushes as the BBs. Under adaptive difficulty the switch comes from the level, like the other habits.
- **A BB in the leaves: a leafy rustle (`impact.leaves`, appended last among the title cues so every older cue's sound is unchanged), a green puff and 4 to 6 leaves (`LEAF_FLECKS`); one through an edge: a quieter rustle (`AUDIO.levels.leafBrush` 0.45) and 1 or 2 leaves.** The leaves are their own CPU pool, one instanced draw at every quality (the impact grit's GPU twin is fixed to its own numbers). In the browser they first spawned where the BB stopped, 0.6 m inside the bush, and were never seen: they now show where the line back to the shooter leaves the bush (`map/foliage.ts` leafSurface), and stay where the BB stopped when it was fired from inside the bush.
- **"Leaves in the way · step clear to shoot" when your own BB stops in leaves within 2 m of you (`HUD.leavesNotice`, `leavesNoticeNear`).** From deep inside a bush you can still see out, so the notice says why your shots don't land.
- **Neon Heights' planters stay solid wood boxes; a BB landing in their top 0.16 m (the drawn shrubs) sounds and looks like leaves.** Presentation only (`soundMaterials.ts` LEAFY_TOPS).
- **Balance figures (balance.mjs woodland on 009ab12, then paired runs against main).** 19 of 23 Woodland figures in band. Normal Attack / Defend read 67.8 % against main's 49.2 % on seeds 1–8, but seeds 9–24 gave 58.8 % against main's 61.9 %: noise. Pro Attack / Defend: 60.3 % over seeds 1–24 against main's 47.5 % (band 40–60): Pro defenders used to knock attackers out through bush edges. Each half alone gives it (59.1 % with BBs as before but bots holding fire, 62.1 % with BBs stopped but bots firing at all they see); Pro's held angles kept to lines clear enough to shoot gave 58.0 %, within noise, so not kept. Logged for the bug pass.

## Known issues left

- Pro Woodland Attack / Defend at 60.3 % to the attackers, the top of its band (KNOWN_ISSUES, playtest).
- Bushes stopping BBs are first guesses to tune in play (KNOWN_ISSUES, playtest).
- A bush doesn't move when a BB goes in (KNOWN_ISSUES).
- The BBs' bush is a smooth ellipsoid and the drawn one is lumpy (KNOWN_ISSUES).
- From deep inside a bush you can see out though your BBs stop (KNOWN_ISSUES).
- A BB that ricochets inside a bush doesn't count that tick's leaves (KNOWN_ISSUES).
