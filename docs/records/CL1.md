# CL1 · Location callouts: named areas, and bot teammates calling what they see and do (Dev 6 item 22)

**Review:** 2 attempts · 8/8 · Accept (Opus)

## Attempts

| Date | Attempt | Worker model | build | tests | smoke | perf | scope | changelog | Critic | Retry reason | Wall time | Worker tokens |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 2026-10-13 | 1 | Opus 5.5 (build thread) | ✓ 18 s | ✗ 474 s (records test: a draft record left in the tree) | ✓ 852 s | ✗ 1821 s (a commit landed mid-run; all 16 runs within budget) | ✓ | ✓ | – | the draft record and a commit made mid-run, no fault in the build | ~4 h | QA (Sonnet) 56k, changelog (Haiku) 20k |
| 2026-10-13 | 2 | Opus 5.5 (build thread) | ✓ 18 s | ✓ 173 s (fast) | – passed on this head in attempt 1 | ✓ 1771 s | ✓ | ✓ | 8/8 Accept (Opus) | – | ~1 h | critic (Opus) 115k |

- **Attempt 2** re-ran the gates on the same head as attempt 1 without the draft record, but smoke, with the fast tests:
  attempt 1 ran smoke and every slow bot-match guard green on it. Reports in `pipeline/runs/CL1/` (project files).
- **After the critic:** two area names put in their map's case, as its exits name places ("Dock road" like "North Gate
  road", "Back Hall" like Neon Heights' "Back Alley"); the fast tests and the quick gate ran again.

## Decisions

- **Callouts are text and a radio click, never voices, and never change play (also in DECISIONS).** A teammate's call shows bottom left with the squad order's walkie-talkie click (its buffers reused, so no new sound renders at the title screen), panned up to 0.6 towards where they stand; an enemy's is only its click, from them through their own channel (so walls muffle it), within 15 m. The director reads the bots and the state and writes neither, on a stream of its own off the match seed (salted), so seeds still replay; a slow guard plays a match with and without it and compares shots, hits, rounds and the flag.
- **A slow, readable pace (also in DECISIONS).** One call a team at a time, 1.5 s apart; a bot's own 4 s apart; the same enemy 10 s apart; a call kept waiting over 1.5 s is dropped, and up to 3 wait per team, the most urgent said first. A newer hit drops a count still waiting ("Two left" when one is), and a call whose gap closed while it waited goes. Measured on seed 1, 180 s: 8.2 calls a team a minute on Depot Elimination, 11.4 on Depot Attack / Defend, 6.8 on Woodland, 5.5 on Neon Heights; contact the most said, then hits, noises and searches. The headless guard checks one call a team a tick and the team's and bot's gaps on every map; the same-enemy gap and the wait are pinned by the unit tests.
- **What the bots call comes from what they already do.** A fresh sighting (one, or "Two, Bay!"), a noise only while nobody on the team sees anyone (and the same area not again for 10 s), a hit by the team ("Two left", "Last one", with the place if the team saw them in the last 3 s; "Tagged" in Extraction, where the home team comes back), a reload within 4 s of a threat seen or heard, setting off after someone (a rusher pushes, a flanker goes round, anyone else checks), settling at a hold (once a round) and the flag going up. The team's events (hits, the flag) are said by the bot it happened to, else the teammate nearest that may speak, so a hit by the player is called too.
- **Hit players never talk (also in DECISIONS).** Hit calling stays the raised hand and sign (owner ruling); a call waiting from a bot that is hit is dropped.
- **Everything in `callouts.md`, read at start as `bots.md` is.** Each event's chance and team gap (row order is urgency), the pace, a Talks (×) per personality (Rusher 1.2, Careful 1.1, Anchor 0.8, Flanker 0.7) and the lines, Any or a personality's own, with `{area}`, `{count}` and `{left}`; numbers are words to twelve. A row it can't read is left out and reported with its line; it never throws.
- **Areas are plan boxes, the first that holds a spot wins (also in DECISIONS for the minimap).** 15 on Depot, 15 on Woodland, 26 on Neon Heights (its upper floors by floor band); names at most 14 characters, in the case each map's exits already use (Depot and Woodland "Crate yard", "West camp"; Neon Heights' streets "Noodle Alley", "East Yard"). The content rule `map.areas` fails a walkable spot outside every area, so a map change that opens new floor names it.
- **The area shows as a label on the minimap's top left, not in its caption.** The caption ("Depot · Round 2") stays as G4 pinned it; the label names where you stand, or the teammate you watch.
- **The feed sits bottom left: 4 lines, each 6 s of play, fading over 0.6 s, cleared at a round's start, 16 px.** Narrow enough (30 % of the view at most) to stay clear of the "what got you" card.
- **Settings › HUD › Callouts, On by default, saved as `callouts`.** Off hides the feed and stops every click at once; the bots still answer your orders with theirs.
- **`bots.md`, `levels.md` and `bot-kits.md` join the build cache's inputs with `callouts.md`.** The cache missed them (BN1, LV1, BG1), so an edited table could reuse a stale build; three words on the line this task already edits.

## Known issues left

- None.
