# MG1 · Ask a teammate for a magazine, and toss one (Dev 6 item 43)

**Review:** 2 attempts · 8/8 · Accept (Opus)

## Attempts

| Date | Attempt | Worker model | build | tests | smoke | perf | scope | changelog | Critic | Retry reason | Wall time | Worker tokens |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 2026-10-15 | 1 | Opus 5.5 (build thread) | ✓ 17 s | ✓ 434 s | ✓ 840 s | ✓ 1449 s | ✓ | ✓ | 7/8 Retry (Opus) | AC1 a second press mid-flight asked again | ~4 h | QA (Sonnet) 108k, changelog (Haiku) 23k, critic (Opus) 156k |
| 2026-10-15 | 2 | Opus 5.5 (build thread) | ✓ 21 s | ✓ 451 s | ✓ 881 s | ✓ 1510 s | ✓ | ✓ | 8/8 Accept (Opus) | – | ~1 h | critic (Opus) 39k |

- Before attempt 1, a full gate run on 7eba68d failed smoke (the boot test still expected a four-item order wheel)
  and its perf runs were void (a commit landed mid-run). Reports in `pipeline/runs/MG1/attempt-1|2/` (project files).
- Pictures from the e2e build in `concepts/ask-for-mag-2026-10-15/` (project files): the hint, a teammate bringing
  one, the catch, a teammate asking you, the wheel's Toss a Mag, a magazine in the air.

## Decisions

- **H and the order wheel's fifth item, Need a Mag (also in DECISIONS).** One press does what fits now: toss to the nearest teammate asking you if in reach, else ask if low, else a notice saying why not. H was unbound. The item reads Toss a Mag while a toss is in reach; five items sit 72° apart on the same radius, Need a Mag upper left.
- **Low is less than one full spare for the replica in hand (also in DECISIONS).** `MAG_SHARE.lowMags` 1. With a Hi-Cap (one 120-BB spare) that is right after the first reload, so Support-kit bots ask often and a teammate's 60 BBs top up the big spare; nothing is made.
- **A magazine fits by its replica's class in stats.md (also in DECISIONS).** `ReplicaConfig.siteClass` now carries it (it was only read for the site limit), so new replicas need no fit table.
- **The toss: 6 m hand to chest, a clear line at release, 0.3 s + 0.05 s a metre (also in DECISIONS).** It lands on the catcher's chest wherever they move, so a dodge never drops it; lost if the catcher is out of play or the round is decided while it flies. It takes only what the catcher's emptiest spare has room for.
- **A bot keeps one full spare of the replica it fights with (also in DECISIONS).** `keepMags` 1, for bots and for a player being asked; its unused pistol it gives freely.
- **Bots: asking a bot, wait; asking you, walk to within 3 m and wait (also in DECISIONS).** A bot asks the nearest teammate within 30 m with one to spare; a giver sprints while over 8 m away; fights and cover come first, then bringing one, then a squad order, then waiting for one. An ask lapses after 15 s; a bot asks again 20 s after, you 4 s after.
- **The calls keep the callouts' pace (also in DECISIONS).** Need a mag and Mag coming wait for the bot's own 4 s and the team's 1.5 s gap rather than queue (a queued one was dropped at maxWait); Talks never lowers them; the thanks (0.7) scales with Talks and only follows a catch with BBs in it.
- **The HUD: one line at 69 % height, 15 px, on the HUD panel; a toss underlined in the team colour; a 5 s hint each time you run low with a giver near; notices 2.5 s.** It hides while the order wheel is open (found in the browser: the line touched the wheel's lower items). Name tags get "· mag". Settings › HUD › Mag hand-off, On by default, saved as `magPrompts`.
- **The tossed magazine is a code-made box (rifle 2.8 × 19 × 7 cm, pistol 2.2 × 12 × 3.5 cm), dark polymer, 2.5 turns a second, arcing 0.1 m a metre of toss up to 0.6 m.** No model file, so the Dev model switches don't apply. The arc first peaked at 0.6 m whatever the length, which lobbed a 1 m hand-off over your head in the browser; it now scales.
- **Sounds: a swish from the thrower (`magToss`) and a slap and clack from the catcher (`magCatch`), on the mechanism level.** Rendered last in the sound bank so the render order of every older cue stays.
- **One in the air to you counts as one coming (critic, attempt 1; also in DECISIONS).** A second press before it lands said "Patch is already bringing one" but asked again; it now asks nobody, and the line and name tag show the thrower until the catch.
- **Dev settings › Bots run low on BBs (a cheat, off): 8 s into each round, one bot a team in turn on its last magazine (`MAG_SHARE.devLowAfter`).** Built first as "start low" at the whistle; in the browser round 1 never got it (it starts with the match, with no roundStart event), and at the whistle teammates stand within a toss, so the hand-off was over before anyone could see it. Criterion 7 was reworded to match.
- **Headless probes (scratch, not committed).** Factory-kit bots fired 15 to 61 BBs a round out of 240 on Depot, Woodland and Neon Heights, so none ran low; one bot-round in nine Realcap matches, with nobody in reach. A bot put low mid-round got one within 1 to 7 s, its giver walking 10 to 27 m, on every map. In the browser, an opponent with a Hi-Cap ran low at 40 s and a teammate tossed it one 2 s later.

## Known issues left

- No throw animation: the figures and your first-person arms don't swing (KNOWN_ISSUES).
- The tossed magazine is a code box, also with the Blender models on (KNOWN_ISSUES).
- A magazine in flight goes on to the catcher through a corner they duck behind (KNOWN_ISSUES).
- Bots with factory magazines rarely run low, so your plain teammates seldom ask (KNOWN_ISSUES, playtest).
- Bots never ask for a pistol's magazine: they fight only with their primary (KNOWN_ISSUES).
