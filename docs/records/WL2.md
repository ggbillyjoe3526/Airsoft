# WL2 · Woodland: a roof on the hill fort, the grey blocks and the odd tree gone (Beta 1 playtest item 30)

**Review:** 1 attempt · 8/8 · Accept (Sonnet)

## Attempts

| Date | Attempt | Worker model | build | tests | smoke | perf | scope | changelog | Critic | Retry reason | Wall time | Worker tokens |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 2026-10-17 | 1 | Opus 5.5 (build thread) | ✓ 22 s | ✓ 844 s | – skipped (boot.spec times out in the container on main too; CI runs it) | ✓ 3636 s | ✓ | ✓ | 8/8 Accept (Sonnet) | – | ~7 h (owner's tweaks mid-task, four Woodland balance runs, three full gates) | QA 37k, performance 31k, critic 42k, changelog 20k |

## Decisions

- **The grey blocks were Woodland's boulders.** Main had 27 of them, eight standing 2.4 to 3 m tall. They are drawn as boxes rounded by 0.1 m, since the drawing stays within 8 cm of the collider (owner rule), so the tall ones read as grey slabs. The owner then asked for every boulder to go ("completely remove all boulders. I hate them."), so none is left and the 'boulder' kind is no longer used on Woodland.
- **The cover they gave is now logs.** The three full-height approach rocks became log piles 2.4 by 2 m at full height, and the six crouch rocks became log stacks 1.6 by 1.4 m at crouch height. The meadow's rocks became fallen trunks 4 m long at crouch height. Two extra trunks keep the content checks passing: one at (75, 50.4) breaks a 141.8 m sightline the rocks had cut, and the trunk at (27, 41.5) lies along z, across the West Rise slope, so it adds no vault link.
- **The odd tree was the lone oak in the meadow, the only trunk wide enough (1 m or more, `CANOPY.broadFrom`) for a broadleaf crown.** No other tree is built that way. Its spot is open ground now. The fallen trunks around the meadow give the cover it gave, and the 141 m sightline check passes. Its Extraction case spot and its 'Oak' area callout are gone.
- **Only the fort's hut has a roof (owner's card).** The hut is 3 m tall and has the cabin's weathered grey tin roof, with a 0.9 m ridge. `tinRoof()` replaces `cabinRoof()` so the cabin and the hut share one builder.
- **The fort's outer walls are 1.5 m, chest high (owner's tweak).** That is under the standing eye of 1.62 m. At crouch height (1.2 m), Hard attackers won 76 % of Attack / Defend rounds and Pro attackers 65 %. At 1.5 m, Pro is at 44.0 %, Normal 45.9 % and Hard 50.8 %. The baffles stay at full height.
- **Woodland's overtime test plays seeds 1 to 4 (it played 1 and 2).** The new layout shifted the bots' paths. Seeds 1 to 6 end 19 of 36 overtimes by a touch and none by time, but seeds 1 and 2 alone end only 3 of 12 by a touch.
- **Woodland's six container perf baselines were re-recorded in this pull request (audit CORE-12),** since the map edit moves what they measure.
- **The elevation and stream ideas (owner's tweak 3) are not in WL2.** The concept went to the owner, and he picked the land first: West Hill, two meadow swells and a dry ravine, in a later pull request. The stream is its own step after that.

## Known issues left

- Woodland Extraction against the Normal home team reads high since WL2: 50 % of runs get out at 55 XP a minute, against 35 % and 33 XP before, just over its bands (18–48 %, 12–52 XP). The figures play a bot runner and swing between runs, so it is measured again on more seeds after the ground changes, before any tuning (KNOWN_ISSUES).
