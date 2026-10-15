# PG1 · Pings: mark a spot for your team, and your bot teammates act on it (Dev 6 item 24)

**Review:** 1 attempt · 8/8 · Accept (Opus)

## Attempts

| Date | Attempt | Worker model | build | tests | smoke | perf | scope | changelog | Critic | Retry reason | Wall time | Worker tokens |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 2026-10-15 | 1 | Opus 5.5 (build thread) | ✓ 16 s | ✓ 396 s | ✓ 775 s | ✓ 1555 s | ✓ | ✓ | 8/8 Accept (Opus) | – | ~3 h | QA (Sonnet) 62k, changelog (Haiku) 22k, critic (Opus) 111k |

- Reports in `pipeline/runs/PG1/attempt-1/` (project files). The perf runs' stale-baseline warnings were there before
  this task; nothing pings in the perf scripts, so the baselines were left as they are.

## Decisions

- **Ping is the middle mouse button, rebindable under Controls as "Squad: ping a spot" (also in DECISIONS).** It was free by default, and a mouse button keeps the left hand on the move keys; a saved binding that already holds it leaves Ping unbound, as any new action.
- **A ping marks where the crosshair meets the field, recoil and all, within 120 m (also in DECISIONS).** The bots' spot is the nearest walkable floor within 3 m of the point, looked for 0.4 m back towards you (so in front of a wall, on the level the view reached); the sky or nothing within reach pings nothing.
- **An enemy is pinged as a contact only when the bots' sight rules let you see them (also in DECISIONS).** Within 2.5° of their chest or head (0.5 m up close), nearer than whatever the view meets behind them, and `visiblePart` from your eyes with the bots' sight at the ping's reach: a bush, the dark or a wall hides them, so a ping never finds the hidden.
- **Bot teammates take a ping as a noise heard exactly there, kept in mind 20 s (also in DECISIONS).** The bots' own search plays it by personality with no new data; a contact also counts as a threat, a spot does not; a bot in a fight, in cover or with a target in view ignores it; a new ping restarts a search under way; `pingMemory` 20 s outlasts `memoryTime` 6 s so a far ping is still worth the walk, and real news of an enemy replaces it.
- **One teammate answers each ping, after a hit's call and before every other (also in DECISIONS).** Going to your ping from the bot nearest the spot that set off (a search), else Watching your ping from the nearest that took it; a team event, so no bot's own gap holds it back; Talks (×) never lowers it; its Checking, Pushing or Flanking is not called as well. Lines per personality in `callouts.md`, with one Any line each that names no area.
- **A teammate's Contact call marks the enemy for you at 35 %, a team's marks 12 s apart (also in DECISIONS).** Only while the caller still sees them, on the callouts' own random stream (salted), so marks change neither the lines nor play; with Callouts off nothing is said, so nothing is marked.
- **The marker: a ring in your team's colour with "Ping · 24 m" under it, a diamond in the other team's for "Contact".** 15 px, popping in over 0.35 s (none with reduced motion), 0.3 m over a floor spot (a contact at the chest), pinned 48 px inside the screen's edge and fainter there, hidden while you spectate, with the board or a menu up, and under the minimap; whole for 7 s, then fading over 1 s, in 5 % steps so the DOM and the minimap are written at most 20 times in a fade.
- **One ping each, at most one per 0.25 s.** A double click is one ping; a new round clears them all.
- **A soft pip, 1700 Hz for 0.08 s at 0.13, on the whistle's dry output.** Lower and quieter than the range's shot timer, so it reads as a mark; your teammates' radio answers it.
- **Settings › HUD › Ping markers, On by default, saved as `pingMarkers` (also in DECISIONS).** Off hides the markers over the field and on the minimap; the pings and their answers go on.

## Known issues left

- None.
