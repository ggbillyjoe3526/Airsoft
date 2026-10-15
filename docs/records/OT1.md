# OT1 · Overtime flag (Dev 6 item 45)

**Review:** 1 attempt · 8/8 · Accept (Opus)

## Attempts

| Date | Attempt | Worker model | build | tests | smoke | perf | scope | changelog | Critic | Retry reason | Wall time | Worker tokens |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 2026-10-15 | 1 | Opus 5.5 (build thread) | ✓ 17 s | ✓ 411 s | ✓ 802 s | ✓ 1332 s | ✓ | ✓ | 8/8 Accept (Opus) | – | ~3 h | QA 72k, changelog 24k, critic (Opus) 135k |

- Reports in `pipeline/runs/OT1/attempt-1/` (project files): the gate report, QA's and the critic's. The critic's two nits (a doc comment cut off by a blank line, the More players left rules sentence) were fixed before the push.

## Decisions

- **A time-out with nobody ahead puts a flag up near the middle; the first team to touch it wins the round (also in DECISIONS).** Owner's Dev 6 item 45 with Claude's defaults: Elimination only (Attack / Defend has its pole, Extraction its own clock), a touch within 1 m of the foot on its floor, no hold, 30 s, then the time-out rule decides (a draw by default); a wipe-out still wins.
- **Each map names its spot (`overtimeFlag`), reached about equally fast from both ends (a map check, within 15 %).** Depot in front of the Main Gate (30 m from each end), Woodland in the east meadow (58 m, 14 s at a run), Neon Heights on Neon Avenue (29 m); a map with no spot plays a time-out as before. The fingerprint pins leave the spot out: it marks the field without changing it.
- **The flag keeps the round's slot through the pause and resets on the next round; its time is counted in the round's longest length.** A skip and the tests' round caps add `longestOvertime(rules)`, so a skipped round still ends.
- **Bots reuse the Attack / Defend flag run, aimed at the overtime spot.** Reaction by level (`overtimeReaction`: Easy 1.2 to 2.4 s, Normal 0.5 to 1.2, Hard 0.3 to 0.7, Pro 0.2 to 0.5, blended by Adaptive difficulty); anchors watch it 12 s and careful bots 5 s first (bots.md › Habits, editable, 0 to 60), unless last of their team, ordered, or with 10 s left; a bot that would flank (`flankChance`) goes round a side point 6 m off the line when 15 m or more out. A fight still comes first.
- **Three whistle blasts mark overtime; the banner says "Overtime · touch the flag" for 2.4 s.** The clock shows the overtime left in red under "Overtime", the strip says the flag's state, and the marker and minimap icon use the flag's off-white (`FLAG_VISUALS.overtimeCss`), so no one reads it as a team's.
- **The flag is a chequered cloth, off-white and dark, rising in 0.8 s from the ground with a reach ring; it takes the winner's colour once touched.** Neither team's colour while it stands, so it reads as neutral.
- **The Rules picker's old Overtime row (win by two) is now Win by two, and the Time-out rule's Draw choice is now Overtime flag.** Each name now says what it does.
- **Bots call it out: one "Overtime" line per team naming the area, worded per personality in callouts.md.** The line tells you where the flag is without looking at the minimap.
- **Balance figures (balance.mjs on 8bf2064, the 17 Elimination figures on all three maps and levels): all in band, none near an edge.** Bot-only 150 s rounds rarely run out, so the flag changes few of them; `depotMatch.overtime.test.ts` plays 25 s rounds to show bots take it.

## Known issues left

- Whoever already stands at the overtime spot when the clock runs out takes it at once, and the cloth hangs edge-on from two sides (KNOWN_ISSUES › Modes and rules, playtest).
